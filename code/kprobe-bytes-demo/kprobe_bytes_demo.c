// SPDX-License-Identifier: GPL-2.0
/*
 * Educational out-of-tree module: show how usbtrace-style kprobes arm.
 *
 * usbtrace (libbpf SEC("kprobe/<func>")) ultimately ends in register_kprobe().
 * On Ubuntu with CONFIG_KPROBES_ON_FTRACE, probes on normal function *entry*
 * take the ftrace path:
 *
 *   idle fentry site : 5-byte NOP  (0f 1f 44 00 00)
 *   after arm        : 5-byte CALL to ftrace trampoline (e8 xx xx xx xx)
 *   handler          : kprobe_ftrace_handler → pre_handler
 *
 * IMPORTANT: register_kprobe() accepts EITHER symbol_name OR addr, never both
 * (_kprobe_addr() returns -EINVAL if both are set). That was why earlier
 * insmod failed with "Invalid parameters".
 *
 *   make && sudo insmod ./kprobe_bytes_demo.ko
 *   sudo dmesg | grep kprobe_bytes
 *   sudo rmmod kprobe_bytes_demo
 *
 * Optional: sudo insmod ./kprobe_bytes_demo.ko symbol=usb_submit_urb
 */
#include <linux/module.h>
#include <linux/kernel.h>
#include <linux/kprobes.h>
#include <linux/uaccess.h>
#include <linux/version.h>
#include <linux/string.h>
#include <linux/preempt.h>
#include <linux/irqflags.h>
#include <linux/sched.h>

MODULE_LICENSE("GPL");
MODULE_AUTHOR("usbtrace");
MODULE_DESCRIPTION("Dump ftrace-kprobe site bytes (usbtrace-style hook)");

#define DUMP_LEN 16

static char *symbol = "usb_set_configuration";
module_param(symbol, charp, 0444);
MODULE_PARM_DESC(symbol,
		 "Kernel function to probe (default: usb_set_configuration)");

static unsigned long hit_count;
static void *probe_addr; /* for dumps; NOT passed together with symbol_name */

/* kallsyms_lookup_name is not exported on 5.7+; resolve via a one-shot kprobe. */
typedef unsigned long (*kallsyms_lookup_name_t)(const char *name);
static kallsyms_lookup_name_t ksym_lookup;

static int resolve_kallsyms_lookup_name(void)
{
	struct kprobe probe = {
		.symbol_name = "kallsyms_lookup_name",
	};
	int ret;

	ret = register_kprobe(&probe);
	if (ret < 0)
		return ret;
	ksym_lookup = (kallsyms_lookup_name_t)probe.addr;
	unregister_kprobe(&probe);
	return 0;
}

static void dump_bytes(const char *tag, const void *addr)
{
	u8 buf[DUMP_LEN];
	char line[DUMP_LEN * 3 + 4];
	int i, n = 0;
	s32 rel;

	if (copy_from_kernel_nofault(buf, addr, DUMP_LEN)) {
		pr_err("kprobe_bytes: copy_from_kernel_nofault(%px) failed\n", addr);
		return;
	}

	for (i = 0; i < DUMP_LEN; i++)
		n += scnprintf(line + n, sizeof(line) - n, "%02x ", buf[i]);

	pr_info("kprobe_bytes: %-32s %pS\n", tag, addr);
	pr_info("kprobe_bytes:   addr=%px  bytes: %s\n", addr, line);

	if (buf[0] == 0x0f && buf[1] == 0x1f && buf[2] == 0x44 &&
	    buf[3] == 0x00 && buf[4] == 0x00)
		pr_info("kprobe_bytes:   -> 5-byte NOP (idle ftrace/fentry site)\n");
	else if (buf[0] == 0xe8) {
		memcpy(&rel, &buf[1], 4);
		pr_info("kprobe_bytes:   -> CALL rel32 (ftrace site LIVE), rel=0x%x target≈%px\n",
			rel, (void *)((unsigned long)addr + 5 + rel));
	} else if (buf[0] == 0xcc)
		pr_info("kprobe_bytes:   -> INT3 (classic kprobe path)\n");
	else if (buf[0] == 0xe9)
		pr_info("kprobe_bytes:   -> JMP (optprobe / similar)\n");
	else if (buf[0] == 0xf3 && buf[1] == 0x0f && buf[2] == 0x1e &&
		 buf[3] == 0xfa)
		pr_info("kprobe_bytes:   -> endbr64\n");
}

static int demo_pre_handler(struct kprobe *p, struct pt_regs *regs)
{
	unsigned long n = ++hit_count;

	/* First hit + every 64th: dump preempt / IRQ / task context. */
	if (n == 1 || (n & 63) == 0) {
		pr_info("kprobe_bytes: HIT #%lu at %pS\n", n, p->addr);
		pr_info("kprobe_bytes:   preempt_count=0x%x preemptible=%d in_atomic=%d\n",
			preempt_count(), preemptible() ? 1 : 0, in_atomic() ? 1 : 0);
		pr_info("kprobe_bytes:   irqs_disabled=%d in_hardirq=%d in_softirq=%d in_nmi=%d in_task=%d\n",
			irqs_disabled() ? 1 : 0,
			in_hardirq() ? 1 : 0,
			in_softirq() ? 1 : 0,
			in_nmi() ? 1 : 0,
			in_task() ? 1 : 0);
		pr_info("kprobe_bytes:   current=%s pid=%d\n",
			current->comm, current->pid);
	}
	return 0;
}

static struct kprobe kp = {
	.pre_handler = demo_pre_handler,
};

static int __init kprobe_bytes_init(void)
{
	unsigned long addr;
	int ret;

	pr_info("kprobe_bytes: === init (usbtrace-style ftrace kprobe demo) ===\n");

	ret = resolve_kallsyms_lookup_name();
	if (ret < 0) {
		pr_err("kprobe_bytes: cannot resolve kallsyms_lookup_name: %d\n", ret);
		return ret;
	}

	addr = ksym_lookup(symbol);
	if (!addr) {
		pr_err("kprobe_bytes: symbol '%s' not found (try symbol=kfree)\n",
		       symbol);
		return -ENOENT;
	}

	probe_addr = (void *)addr;

	/*
	 * Only symbol_name — do NOT also set kp.addr.
	 * _kprobe_addr() returns -EINVAL if both are set (insmod: Invalid parameters).
	 */
	kp.symbol_name = symbol;
	kp.addr = NULL;
	kp.offset = 0;
	kp.flags = 0;

	pr_info("kprobe_bytes: target symbol='%s' -> %pS (%px)\n",
		symbol, probe_addr, probe_addr);
	pr_info("kprobe_bytes: expect KPROBE_FLAG_FTRACE + NOP<->CALL on Ubuntu\n");

	dump_bytes("BEFORE register_kprobe", probe_addr);

	ret = register_kprobe(&kp);
	if (ret < 0) {
		pr_err("kprobe_bytes: register_kprobe(%s) failed: %d\n", symbol, ret);
		return ret;
	}

	/* After register, kernel fills kp.addr (resolved entry). */
	probe_addr = kp.addr;
	dump_bytes("AFTER register_kprobe", probe_addr);

	if (kprobe_ftrace(&kp))
		pr_info("kprobe_bytes: OK — FTRACE flag set (usbtrace-class hook on fentry)\n");
	else
		pr_warn("kprobe_bytes: FTRACE flag NOT set — classic INT3 fallback\n");

	pr_info("kprobe_bytes: not calling the target; real USB activity may HIT\n");
	pr_info("kprobe_bytes: rmmod to disarm and dump restored bytes\n");

	return 0;
}

static void __exit kprobe_bytes_exit(void)
{
	pr_info("kprobe_bytes: === exit (hits=%lu) ===\n", hit_count);
	if (kp.addr) {
		dump_bytes("BEFORE unregister_kprobe", kp.addr);
		unregister_kprobe(&kp);
		dump_bytes("AFTER unregister_kprobe", probe_addr ? probe_addr : kp.addr);
	}
	pr_info("kprobe_bytes: unloaded\n");
}

module_init(kprobe_bytes_init);
module_exit(kprobe_bytes_exit);
