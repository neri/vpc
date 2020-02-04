# CPU

## Feature

|Feature|Status|
|-|-|
|ISA|486 class|
|Real Mode| ☑️ |
|A20|Always ON|
|FPU / MMX / SSE| - |
|Protected Mode| ☑️ |
|Segmentation| Partial |
|Segment Limit| Partial |
|CPL,DPL,RPL,IOPL| Partial |
|TSS|32bit Only|
|LDT| ☑️ |
|Task Gate| - |
|Interrupt / Trap Gate|32bit Only|
|Call Gate| - |
|Virtual 8086 Mode| WIP |
|Paging| - |
|CR0| works |
|CR2,3,4| present |
|DRn| - |
|TRn| never |
|TSC| present |
|MSR| - |

### How to detect this software in the virtual machine

- In 486 mode, when the CPUID instruction is executed with EAX = 00000000, the result will be EBX = ECX = EDX = 0x4D534157 ('WASM')
- Otherwise, undefined.
