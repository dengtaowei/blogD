#include <stdio.h>
#include <stdint.h>

static uint64_t read_sp(void)
{
    uint64_t sp;
    __asm__ volatile("mov %0, sp" : "=r"(sp));
    return sp;
}

static uint64_t read_fp(void)
{
    uint64_t fp;
    __asm__ volatile("mov %0, x29" : "=r"(fp));
    return fp;
}

/* Linux AArch64: write(fd, buf, len) → x8=64, svc #0 */
__attribute__((noinline))
void print_hello(void)
{
    const char msg[] = "hello\n";

    __asm__ volatile(
        "mov     x0, #1\n"
        "mov     x1, %[buf]\n"
        "mov     x2, %[len]\n"
        "mov     x8, #64\n"
        "svc     #0\n"
        :
        : [buf] "r"(msg), [len] "r"(sizeof(msg) - 1)
        : "x0", "x1", "x2", "x8", "memory"
    );
}

__attribute__((noinline))
void study_stack(void)
{
    volatile uint64_t local0 = 0x1111222233334444ULL;
    volatile uint64_t local1 = 0xAAAABBBBCCCCDDDDULL;

    print_hello();
    (void)local0;
    (void)local1;
}

int main(void)
{
    printf("[main] 调用前  SP=0x%016lx  FP=0x%016lx\n",
           (unsigned long)read_sp(), (unsigned long)read_fp());
    fflush(stdout);

    study_stack();

    printf("[main] 返回后  SP=0x%016lx  FP=0x%016lx\n",
           (unsigned long)read_sp(), (unsigned long)read_fp());
    return 0;
}
