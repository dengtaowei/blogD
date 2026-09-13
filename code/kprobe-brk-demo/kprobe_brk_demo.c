/*
 * kprobe_brk_demo: classic (non-ftrace) kprobe on STM32MP157 ARM32 / Linux 5.4.
 *
 * Board has CONFIG_KPROBES=y but no CONFIG_KPROBES_ON_FTRACE (ARM32 typical).
 * register_kprobe() patches the first instruction with the reserved undefined
 * insn KPROBE_ARM_BREAKPOINT_INSTRUCTION (often 0xe7f001f8 once condition bits
 * are applied), then undef exception → kprobe_handler → pre_handler.
 *
 * Contrast with Ubuntu x86 kprobe-on-ftrace (NOP ↔ CALL). See blog article
 * docs/analysis/kernel/bpf/kprobe-breakpoint-lab.md in blogD.
 *
 *   make && adb push kprobe_brk_demo.ko /tmp/
 *   adb shell "insmod /tmp/kprobe_brk_demo.ko; dmesg | grep kprobe_brk; rmmod kprobe_brk_demo"
 */
#include <linux/module.h>
#include <linux/kernel.h>
#include <linux/kprobes.h>
#include <linux/uaccess.h>
#include <linux/string.h>
#include <linux/preempt.h>
#include <linux/irqflags.h>
#include <linux/sched.h>
#include <linux/kallsyms.h>

MODULE_LICENSE("GPL");
MODULE_AUTHOR("100ask learning");
MODULE_DESCRIPTION("Dump classic ARM kprobe breakpoint bytes (no ftrace)");

#define DUMP_LEN 16

/* Busy enough on a quiet board. */
static char *symbol = "kfree";
module_param(symbol, charp, 0444);
MODULE_PARM_DESC(symbol, "Kernel function to probe (default: kfree)");

static unsigned long hit_count;
static void *probe_addr;

static void dump_bytes(const char *tag, const void *addr)
{
	u8 buf[DUMP_LEN];
	char line[DUMP_LEN * 3 + 4];
	u32 word;
	int i, n = 0;

	if (probe_kernel_read(buf, addr, DUMP_LEN)) {
		pr_err("kprobe_brk: probe_kernel_read(%px) failed\n", addr);
		return;
	}

	for (i = 0; i < DUMP_LEN; i++)
		n += scnprintf(line + n, sizeof(line) - n, "%02x ", buf[i]);

	pr_info("kprobe_brk: %-32s %pS\n", tag, addr);
	pr_info("kprobe_brk:   addr=%px  bytes: %s\n", addr, line);

	memcpy(&word, buf, 4);

	/*
	 * ARM LE: first insn is a little-endian u32 in memory.
	 * arch_arm_kprobe() uses KPROBE_ARM_BREAKPOINT_INSTRUCTION (0x07f001f8)
	 * and ORs condition bits from the original insn → often 0xe7f001f8.
	 */
	if (word == 0xe7f001f8 || word == 0x07f001f8)
		pr_info("kprobe_brk:   -> ARM undef breakpoint 0x%08x (classic kprobe LIVE)\n",
			word);
	else if ((word & 0x0f000000) == 0x0a000000)
		pr_info("kprobe_brk:   -> B (branch) 0x%08x (likely OPTPROBE)\n", word);
	else if ((buf[0] == 0xe8) ||
		 (buf[0] == 0x0f && buf[1] == 0x1f && buf[2] == 0x44))
		pr_info("kprobe_brk:   -> looks like x86 ftrace site (unexpected on ARM32)\n");
	else
		pr_info("kprobe_brk:   -> original / other insn word=0x%08x\n", word);
}

static int demo_pre_handler(struct kprobe *p, struct pt_regs *regs)
{
	unsigned long n = ++hit_count;

	if (n == 1 || (n & 63) == 0) {
		pr_info("kprobe_brk: HIT #%lu at %pS pc=%lx\n",
			n, p->addr, instruction_pointer(regs));
		pr_info("kprobe_brk:   preempt_count=0x%x in_irq=%d in_softirq=%d\n",
			preempt_count(),
			in_irq() ? 1 : 0,
			in_softirq() ? 1 : 0);
		pr_info("kprobe_brk:   current=%s pid=%d\n",
			current->comm, current->pid);
	}
	return 0;
}

static struct kprobe kp = {
	.pre_handler = demo_pre_handler,
};

static int __init kprobe_brk_init(void)
{
	unsigned long addr;
	int ret;

	pr_info("kprobe_brk: === init (classic ARM kprobe, no ftrace) ===\n");

	addr = kallsyms_lookup_name(symbol);
	if (!addr) {
		pr_err("kprobe_brk: symbol '%s' not found\n", symbol);
		return -ENOENT;
	}

	probe_addr = (void *)addr;
	kp.symbol_name = symbol;
	kp.addr = NULL;
	kp.offset = 0;
	kp.flags = 0;

	pr_info("kprobe_brk: target symbol='%s' -> %pS (%px)\n",
		symbol, probe_addr, probe_addr);
	pr_info("kprobe_brk: expect undef breakpoint (NOT KPROBE_FLAG_FTRACE)\n");

	dump_bytes("BEFORE register_kprobe", probe_addr);

	ret = register_kprobe(&kp);
	if (ret < 0) {
		pr_err("kprobe_brk: register_kprobe(%s) failed: %d\n", symbol, ret);
		return ret;
	}

	probe_addr = kp.addr;
	dump_bytes("AFTER register_kprobe", probe_addr);

	if (kprobe_ftrace(&kp))
		pr_warn("kprobe_brk: unexpected FTRACE flag on ARM32\n");
	else
		pr_info("kprobe_brk: OK - FTRACE flag clear (classic path)\n");

	pr_info("kprobe_brk: wait for HIT; then rmmod\n");
	pr_info("kprobe_brk: tip: echo 0 > /proc/sys/debug/kprobes-optimization\n");
	return 0;
}

static void __exit kprobe_brk_exit(void)
{
	pr_info("kprobe_brk: === exit (hits=%lu) ===\n", hit_count);
	if (kp.addr) {
		dump_bytes("BEFORE unregister_kprobe", kp.addr);
		unregister_kprobe(&kp);
		dump_bytes("AFTER unregister_kprobe", probe_addr);
	}
	pr_info("kprobe_brk: unloaded\n");
}

module_init(kprobe_brk_init);
module_exit(kprobe_brk_exit);
