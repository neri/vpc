# IO Ports

## IO port map

|Address|Size|Read/Write|Standard?|Description|
|-|-|-|-|-|
|0000|WORD|RO|NO|Random Number Generator|
|0020-0021|BYTE|R/W|YES|i8259 PIC #1|
|0040-0043|BYTE|R/W|YES|i8254 Timer|
|0061|BYTE|R/W|YES|System Port (Beep)|
|0070-0071|BYTE|R/W|YES|RTC/CMOS RAM|
|00A0-00A1|BYTE|R/W|YES|i8259 PIC #2|
|03C8-03C9|BYTE|WO|YES|VGA DAC|
|03F8-03FF|BYTE|R/W|YES|UART COM1|
|FC00-FCFF|WORD|R/W|NO|System Port|
|FD00-FD09|MIXED|R/W|NO|Floppy|

## Original devices

### 0000: Random Number Generator

|Address|Size|Read/Write|Description|
|-|-|-|-|
|0000|WORD|RO|Read Random Number|

### FD00: Floppy Controller

|Address|Size|Read/Write|Description|
|-|-|-|-|
|FD00|WORD|R/W|Command / Status|
|FD02|WORD|R/W|Transfer Address Low|
|FD04|WORD|R/W|Transfer Address High|
|FD06|BYTE|R/W|Transfer Sector Count|
|FD07|BYTE|R/W|Head|
|FD08|BYTE|R/W|Sector|
|FD09|BYTE|R/W|Cylinder|