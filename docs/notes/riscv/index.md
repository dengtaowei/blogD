---
home: false
---

# RISC-V

围绕 RISC-V 平台上的调试与验证，记录可复现的排查方法和证据链。

- [RV32 调用约定](/notes/riscv/rv32-call-stack) — 参数怎么进寄存器和栈；有 `s0` 时怎么顺着 `[s0-4]` / `[s0-8]` 回溯
- [Cursor 协助定位 I-BUS XIP 写挂死](/notes/riscv/cursor-locate-xip-store-hang)
- [PMP 与访问错误寄存器：从 Flash XIP 的一次 store 读起](/notes/riscv/pmp-access-fault)
- [E203：从 PC 到 ITCM 的一次取指](/notes/riscv/e203-itcm-fetch) — `pc_r` 到 SRAM 再回到 `ifu_rsp_instr`，三跳各有多少根线
