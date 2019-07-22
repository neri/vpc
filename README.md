# Virtual Playground

A PC Emulator implemented by WebAssembly.

<img src="images/ss1.png" width="50%"><img src="images/ss2.png" width="50%">
<img src="images/ss3.png" width="50%">

- [Preview website](https://nerry.jp/vpc/)
- [Repository](https://github.com/neri/vpc)

## THIS VERSION

- THIS IS JUNK

## Requirements

- [WebAssembly](https://caniuse.com/#feat=wasm)

## Implemented hardware

- IBM PC compatible
- CPU: 486SX
  - Some features are missing such as 16bit protected mode
- Memory: 640KB ought to be enough for anybody.
- I/O:
  - **i8259** PIC
  - **i8254** Timer & Sound
  - **UART**
  - **RTC**
  - **MPU-401** - UART mode Only
  - **VGA** - mode 03 and 13 only
  - **FDC** (non standard interface)
    - Supported: 160KB, 360KB, 640KB, 720KB, 1.2MB, 1.4MB and 512 bytes (Boot Sector Only)

### How to detect this virtual machine by software

- In 486 mode, when the CPUID instruction is executed with EAX = 00000000, the result will be EBX = ECX = EDX = 0x4D534157 ('WASM')
- Otherwise, undefined.

## Supported Software

|Software|Status|
|-|-|
|osz|It seems working|
|FreeDOS (16bit)|It seems working|
|FreeDOS (32bit)|failed|
|elks|failed|
|BootChess|buggy|
|[Floppy Bird](https://github.com/icebreaker/floppybird)|Needs a patch|
|[Invaders game in 512 bytes](https://github.com/nanochess/Invaders)|It seems working|

## License

MIT License

Copyright (C)2019 Nerry
