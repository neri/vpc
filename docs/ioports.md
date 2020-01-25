# IO Ports

## IO port map

|Address|Size|Read/Write|Standard?|Description|
|-|-|-|-|-|
|0020-0021|BYTE|R/W|YES|i8259 PIC #1|
|0040-0043|BYTE|R/W|YES|i8254 Timer|
|0060|BYTE|R/W|YES|PS/2 Data (Dummy)|
|0061|BYTE|R/W|YES|System Port (Beep)|
|0064|BYTE|R/W|YES|PS/2 Command/Status|
|0064|WORD|RO|NO|PS/2 Data (Native)|
|0070-0071|BYTE|R/W|YES|RTC/CMOS RAM|
|00A0-00A1|BYTE|R/W|YES|i8259 PIC #2|
|0330-0331|BYTE|R/W|MPU|MPU-401|
|03B0-03DF|BYTE|VARY|VGA|VGA|
|03F8-03FF|BYTE|R/W|YES|UART COM1|
|FCxx|WORD|R/W|NO|System Port|
|FDxx|VARY|R/W|NO|Floppy|

## Original devices

### 0064: PS/2 Native Data

* Lower byte is scan code same as standard port, Higher byte is ascii code reported by web browser.
* For technical reasons, scan codes of some keys are different from standards.

### FCxx: System Port

|Address|Size|Read/Write|Description|
|-|-|-|-|
|FC00|WORD|RO|Get Conventional Memory Size in KB|
|FC02|WORD|RO|Get Extended Memory Size in KB|
|FC04|WORD|WO|Set Video Mode|

### FDxx: Floppy Controller

|Address|Size|Read/Write|Description|
|-|-|-|-|
|FD00|WORD|R/W|Command / Status|
|FD02|WORD|R/W|Transfer Address Low|
|FD04|WORD|R/W|Transfer Address High|
|FD06|BYTE|R/W|Transfer Sector Count|
|FD07|BYTE|R/W|Head|
|FD08|BYTE|R/W|Sector|
|FD09|BYTE|R/W|Cylinder|
