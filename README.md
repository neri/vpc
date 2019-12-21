# Virtual Playground

A PC Emulator implemented by WebAssembly.

- [Preview website](https://nerry.jp/vpc/)
- [Repository](https://github.com/neri/vpc)

<img src="images/ss1.png" width="50%"><img src="images/ss2.png" width="50%">
<img src="images/ss3.png" width="50%"><img src="images/ss4.png" width="50%">

## THIS VERSION

- THIS IS JUNK

## Requirements

- [WebAssembly](https://caniuse.com/#feat=wasm)

## Implemented hardware

- IBM PC compatible
- CPU: 486SX
- Memory: 640KB ought to be enough for anybody.
- I/O:
  - **i8259** PIC
  - **i8254** Timer & Sound
  <!-- - **UART** - DISABLED -->
  - **RTC**
  - **MPU-401** - UART mode Only
  - **VGA** - mode 03 and 13 only
  - **FDC** (non standard interface)
    - Supported: 160KB, 360KB, 640KB, 720KB, 1.2MB, 1.4MB and 512 bytes (Boot Sector Only)

|Feature|Status|
|-|-|
|Real Mode| ☑️ |
|A20|Always ON|
|FPU / MMX / SSE| - |
|Protected Mode| ☑️ |
|Segmentation| Partial |
|Segment Limit| Partial |
|TSS|32bit Only|
|LDT| ☑️ |
|Task Gate| - |
|Interrupt / Trap Gate|32bit Only|
|Call Gate| - |
|Virtual 8086 Mode| WIP |
|Paging| - |

### How to detect this software in the virtual machine

- In 486 mode, when the CPUID instruction is executed with EAX = 00000000, the result will be EBX = ECX = EDX = 0x4D534157 ('WASM')
- Otherwise, undefined.

## Supported Software

|Software|Kind|Status|
|-|-|-|
|osz|System|It seems working|
|FreeDOS|Kernel|It seems working|
|haribote OS|System|It seems working|
|elks|System|failed|
|BootChess|Game|buggy|
|[Floppy Bird](https://github.com/icebreaker/floppybird)|Game|Needs a [patch](https://github.com/neri/floppybird/commit/6db932489afd6bbb5bddcdf0185d9f9051914459)|
|[Invaders game in 512 bytes](https://github.com/nanochess/Invaders)|Game|It seems working|

## License

MIT License

Copyright (C)2019 Nerry
