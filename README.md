# Virtual Playground

**No new features will be developed in the future, only bug fixes.**

A PC Emulator on WebBrowser

- [Preview website](https://nerry.jp/vpc/)
- [Repository](https://github.com/neri/vpc/)

<img src="images/ss1.png" width="50%"><img src="images/ss2.png" width="50%">

## Emulated Hardware

- IBM PC compatible
- CPU: 486SX without Paging (See [docs/cpu](docs/cpu.md) for details)
- I/O: (See [docs/ioports](docs/ioports.md) for details)
  - **i8259** PIC
  - **i8254** Timer & Sound
  <!-- - **UART** - DISABLED -->
  - **RTC**
  - **MPU-401** - UART mode Only
  - **VGA** - mode 03 and 13 only
  - **FDC** (non standard interface)
    - Supported: 160KB, 360KB, 640KB, 720KB, 1.2MB, 1.4MB and 512 bytes (Boot Sector Only)

## Supported Software

| Software    | Kind   | Status              |
| ----------- | ------ | ------------------- |
| osz         | System | It seems working    |
| FreeDOS     | Kernel | It seems working    |
| haribote OS | System | It seems working    |
| BASIC-DOS   | System | It works, but weird |
| elks        | System | failed              |
| BootChess   | Game   | buggy               |

## Test

```
$ npm run test
```

## License

MIT License

Copyright (C)2019 Nerry
