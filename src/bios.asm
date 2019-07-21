; Virtual Playground Basic I/O System
; Copyright (C) 2019 Nerry

[CPU 8086]
[BITS 16]
[ORG 0]

%define SEG_BIOS 0xFE00
%define SIZE_BIOS 0x2000

%define PIC_ICW2_MAS        0x08
%define PIC_ICW2_SLA        0x70

%define	PORT_TIMER_CNT0     0x0040
%define	PORT_BEEP_CNT       0x0042
%define	PORT_TIMER_CTL      0x0043
%define	PORT_BEEP_FIRE      0x0061

%define	_TIMER_RES          55

%define	TIMER_INIT_BEEP     10110110b
%define	_BEEP_TICK_L        0x34DC
%define	_BEEP_TICK_H        0x0012

%define	STK_AX              0
%define	STK_CX              2
%define	STK_DX              4
%define	STK_BX              6
%define	STK_SI              8
%define	STK_DI              10
%define	STK_BP              12
%define	STK_DS              14
%define	STK_ES              16
%define	STK_IP              18
%define	STK_CS              20
%define	STK_FLAGS           22

%define CRTC_PORT           0x3B4

%define VPC_MEM_PORT        0xFC00
%define VPC_FD_PORT         0xFD00

%define BDA_SEG             0x0040
%define BDA_COMPORT         0x0000
%define BDA_KBD_SHIFT       0x0017
%define BDA_KBD_BUFF_HEAD   0x001A
%define BDA_KBD_BUFF_TAIL   0x001C
%define BDA_KBD_BUFF_BEGIN  0x001E
%define BDA_KBD_BUFF_MASK   0x001F
%define BDA_VGA_CURRENT_MODE    0x0049
%define BDA_VGA_CURSOR      0x0050
%define BDA_KBD_MODE_TYPE   0x0096

%define KBD_MODE_CLEAR_MASK 0xFC
%define KBD_MODE_LAST_E1    0x02
%define KBD_MODE_LAST_E0    0x02
%define KBD_TYPE_ENHANCED   0x10

%define ARGV 0x0080

_HEAD:
    dw SEG_BIOS, SIZE_BIOS

    alignb 2

_int10_ftbl:
    dw i1000, i1001, i1002, i1003, i1004, i1005, i1006, i1007
    dw i1008, i1009, i100A, i100B, i100C, i100D, i100E, i100F
    dw i1010, i1011, i1012, i1013, i1014, i1015, i1016, i1017
    dw i1018, i1019, i101A, i101B, i101C, i101D, i101E, i101F
_int10_etbl:



;; IRQ 0 Timer
_irq0:
    push ds
    push ax
    xor ax, ax
    mov ds, ax
    inc word [ds:0x046C]
    jnz .skip
    mov ax, [ds:0x046E]
    inc ax
    cmp ax, 24
    jb .nb
    sub ax, 24
    mov byte [ds:0x0470], 1
.nb:
    mov [ds:0x046E], ax
.skip:
    mov al, 0x20
    out 0x20, al
    int 0x1C
    pop ax
    pop ds
    iret


_irq1:
    push ds
    push ax
    push cx
    push bx
    push di
    mov ax, BDA_SEG
    mov ds, ax
.loop:
    in al, 0x64
    and al, 0x01
    jz .end
    in ax, 0x64
    mov bx, ax
    mov ah, 0x4F
    stc
    int 0x15
    jnc .loop
    cmp al, 0xE1
    jz .E1
    cmp al, 0xE0
    jz .E0
    mov bl, al
    and al, 0x7F
    cmp al, 0x1D
    jz .ctrl1
    cmp al, 0x2A
    jz .shift2
    cmp al, 0x36
    jz .shift1
    cmp al, 0x38
    jz .alt1
    or bl, bl
    js .loop
    mov ax, bx
    xchg al, ah
    and byte [BDA_KBD_MODE_TYPE], KBD_MODE_CLEAR_MASK
    mov bx, [BDA_KBD_BUFF_HEAD]
    mov di, [BDA_KBD_BUFF_TAIL]
    lea cx, [di + 2 - BDA_KBD_BUFF_BEGIN]
    and cx, BDA_KBD_BUFF_MASK
    add cx, BDA_KBD_BUFF_BEGIN
    cmp bx, cx
    jz .end
    mov [di], ax
    mov [BDA_KBD_BUFF_TAIL], cx
    jmp .loop
.E1:
    or byte [BDA_KBD_MODE_TYPE], KBD_MODE_LAST_E1
    jmp .loop
.E0:
    or byte [BDA_KBD_MODE_TYPE], KBD_MODE_LAST_E0
    jmp .loop
.ctrl1:
    mov al, 0x04
    jmp .shift_mask
.shift1:
    mov al, 0x01
    jmp .shift_mask
.shift2:
    mov al, 0x02
    jmp .shift_mask
.alt1:
    mov al, 0x08
    ; jmp .shift_mask
.shift_mask:
    or bl, bl
    js .shift_up
    or [BDA_KBD_SHIFT], al
    jmp .loop
.shift_up:
    not al
    and [BDA_KBD_SHIFT], al
    jmp .loop
.end:
    mov al, 0x20
    out 0x20, al
    pop di
    pop bx
    pop cx
    pop ax
    pop ds
    iret


;; TODO: deprecated
_irq4:
    push ds
    push ax
    push cx
    push dx
    push bx
    mov ax, BDA_SEG
    mov ds, ax
.loop:
    mov dx, [BDA_COMPORT]
    add dl, 5
    in al, dx
    and al, 1
    jz .end
    mov ax, [BDA_KBD_BUFF_HEAD]
    mov bx, [BDA_KBD_BUFF_TAIL]
    lea cx, [bx + 2 - BDA_KBD_BUFF_BEGIN]
    and cx, BDA_KBD_BUFF_MASK
    add cx, BDA_KBD_BUFF_BEGIN
    cmp ax, cx
    jz .end
    sub dl, 5
    in al, dx
    mov ah, al
    mov [bx], ax
    mov [BDA_KBD_BUFF_TAIL], cx
    jmp .loop
.end:
    mov al, 0x20
    out 0x20, al
    pop bx
    pop dx
    pop cx
    pop ax
    pop ds
    iret


;; Dummy
_irq_dummy:
    push ax
    mov al, 0x20
    out 0x20, al
    pop ax
_iret:
    iret


;; VIDEO BIOS
_int10:
    push es
    push ds
    push bp
    push di
    push si
    push bx
    push dx
    push cx
    push ax
    mov bp, sp
    cld
    push cs
    pop ds

    cmp ah, (_int10_etbl - _int10_ftbl) / 2
    ja .not_supported
    call i10_caller
.not_supported:

    pop ax
    pop cx
    pop dx
    pop bx
    pop si
    pop di
    pop bp
    pop ds
    pop es
    iret

i10_caller:
    mov bl, ah
    xor bh, bh
    add bx, bx
    mov bx, [_int10_ftbl + bx]
    push bx
    mov bx, [bp + STK_BX]
    ret


i1004:
i1005:
i100A:
i100B:
i100C:
i100D:
i1010:
i1011:
i1012:
i1014:
i1015:
i1016:
i1017:
i1018:
i1019:
i101B:
i101C:
i101D:
i101E:
i101F:
    ; db 0xF1
    ret

i101A:
    mov bx, 0x0808
    mov [bp+STK_BX], bx
    mov [bp+STK_AX], ah
    ret


i1000: ;; SET VIDEO MODE
    cmp al, 0x03
    jbe .mode_03
    cmp al, 0x13
    jz .mode_13
    xor al, al
    ret

.mode_03:
    mov dx, 0x3C0
    mov al, 0x10
    out dx, al
    inc dx
    xor al, al
    out dx, al
    mov ax, 0xB800
    mov es, ax
    xor di, di
    mov ax, 0x0720
    mov cx, 80 * 25
    rep stosw
    mov al, 3
.set_mode:
    mov cx, BDA_SEG
    mov ds, cx
    mov [BDA_VGA_CURRENT_MODE], al
    xor dx, dx
    call i1002
    ret

.mode_13:
    mov dx, 0x3C0
    mov al, 0x10
    out dx, al
    inc dx
    mov al, 0x41
    out dx, al
    mov ax, 0xA000
    mov es, ax
    xor di, di
    xor ax, ax
    mov cx, 320 * 200 /2
    rep stosw
    mov al, 0x13
    jmp .set_mode


i100F:
    mov ax, BDA_SEG
    mov ds, ax
    mov al, [BDA_VGA_CURRENT_MODE]
    mov [bp+STK_AX], al
    ret


i1006:
i1007:
    or al, al
    jz .cls
    ret
.cls:
    add dx, 0x0001
    call _bios_cursor_addr
    mov dx, cx
    xchg ax, cx
    call _bios_cursor_addr
    mov di, ax
    sub cx, di
    shr cx, 1
    mov dx, 0xB800
    mov es, dx
    mov ah, bh
    mov al, 0x20
    rep stosw
    ret


i1001:
    mov dx, CRTC_PORT
    mov al, 0x0A
    out dx, al
    inc dx
    mov al, ch
    out dx, al
    dec dx
    mov al, 0x0B
    out dx, al
    inc dx
    mov al, cl
    out dx, al
    ret


i1002:
    mov ax, BDA_SEG
    mov ds, ax
    mov [BDA_VGA_CURSOR], dx
    call _bios_set_cursor
    ret

i1003:
    mov ax, BDA_SEG
    mov ds, ax
    mov ax, [BDA_VGA_CURSOR]
    mov [bp+STK_DX], ax
    ret


i1013:
    cmp dh, 25
    jae .end
    cmp dl, 80
    jae .end
    xor bx, bx
    mov es, bx
    mov ds, [bp + STK_ES]
    mov si, [bp + STK_BP]
.loop:
    lodsb
    call _bios_write_char
    loop .loop
    call i1002
.end:
    ret


i1008:
    mov dx, [BDA_VGA_CURSOR]
    call _bios_cursor_addr
    mov bx, ax
    mov cx, 0xB800
    mov es, cx
    mov ax, [es:bx]
    mov [bp+STK_AX], ax
    ret


i1009:
    mov cx, BDA_SEG
    mov ds, cx
    jmp i100E.cont
i100E:
    mov cx, BDA_SEG
    mov ds, cx
    cmp al, 8
    jz .bs
    cmp al, 10
    jz .lf
    cmp al, 13
    jz .cr
.cont:
    call _chk_scroll
    mov dx, [BDA_VGA_CURSOR]
    call _bios_write_char
    mov [BDA_VGA_CURSOR], dx
.end:
    call _chk_scroll
    mov dx, [BDA_VGA_CURSOR]
    call _bios_set_cursor
    ret
.bs:
    mov cl, [BDA_VGA_CURSOR]
    or cl, cl
    jz .nobs
    dec cx
.nobs:
    mov [BDA_VGA_CURSOR], cl
    jmp .end
.lf:
    mov cx, [BDA_VGA_CURSOR]
    xor cl, cl
    inc ch
    mov [BDA_VGA_CURSOR], cx
    jmp .end
.cr:
    xor cl, cl
    mov [BDA_VGA_CURSOR], cl
    jmp .end


_bios_set_cursor:
    push ax
    push cx
    push dx
    call _bios_cursor_addr
    mov cx, ax
    mov dx, CRTC_PORT
    mov al, 0x0E
    out dx, al
    inc dx
    mov al, ch
    out dx, al
    dec dx
    mov al, 0x0F
    out dx, al
    inc dx
    mov al, cl
    out dx, al
    pop dx
    pop cx
    pop ax
    ret


_bios_cursor_addr:
    push bx
    push cx
    mov bx, dx
    mov al, bh
    mov cl, 80
    mul cl
    add al, bl
    adc ah, 0
    add ax, ax
    pop cx
    pop bx
    ret


_bios_write_char:
    push ds
    push bx
    push cx
    push ax
    call _bios_cursor_addr
    xchg ax, bx
    pop ax
    mov cx, 0xB800
    mov ds, cx
    mov [bx], al
    pop cx
    pop bx
    pop ds
    inc dx
    ret

_chk_scroll:
    push ds
    push es
    push ax
    push cx
    push si
    push di
    mov cx, BDA_SEG
    mov ds, cx
    mov cx, [BDA_VGA_CURSOR]
    cmp cl, 80
    jnz .no80
    xor cl, cl
    inc ch
.no80:
    mov al, 24
    cmp ch, al
    jbe .end
    mov ch, al
    mov [BDA_VGA_CURSOR], cx
    mov cx, 0xB800
    mov ds, cx
    mov es, cx
    xor di, di
    mov si, 80 * 2
    mov cx, 80 * 24
    rep movsw
    mov cx, 80
    mov ax, 0x0720
    rep stosw
.end:
    pop di
    pop si
    pop cx
    pop ax
    pop es
    pop ds
    ret


;; Get Equipment List
_int11:
    push ds
    xor ax, ax
    mov ds, ax
    mov ax, [ds: 0x410]
    pop ds
    iret


;; Get Memory Size
_int12:
    push dx
    mov dx, VPC_MEM_PORT
    in ax, dx
    pop dx
    iret


;; Diskette BIOS
_int13:
    push es
    push ds
    push bp
    push di
    push si
    push bx
    push dx
    push cx
    push ax
    mov bp, sp

    cmp dl, 0
    jnz .err

    cmp ah, 0
    jnz .no_00
    mov dx, VPC_FD_PORT
    xor ax, ax
    out dx, ax
    jmp .end
.no_00:
    cmp ah, 0x02
    jnz .no_02
    call _int13_read
    jmp .end
.no_02:
    cmp ah, 0x03
    jnz .no_03
    call _int13_write
    jmp .end
.no_03:
    cmp ah, 0x04
    jnz .no_04
    xor ah, ah
    jmp .end
.no_04:
    cmp ah, 0x08
    jnz .no_08
    call _int13_get_drive_param
    jmp .end
.no_08:
    cmp ah, 0x15
    jnz .no_15
    mov ah, 0x02
    jmp .end
.no_15:

.err:
    mov ah, 0x01
    stc
.end:

    sbb dx, dx
    mov cx, [bp + STK_FLAGS]
    and cx, 0xFFFE
    sub cx, dx
    mov [bp + STK_FLAGS], cx

    add sp, byte 2
    pop cx
    pop dx
    pop bx
    pop si
    pop di
    pop bp
    pop ds
    pop es
    iret


_int13_get_drive_param:
    mov dx, VPC_FD_PORT
    xor ax, ax
    out dx, ax
    add dl, 6
    in al, dx
    mov [bp + STK_BX], al
    inc dx
    in al, dx
    mov [bp + STK_DX + 1], al
    inc dx
    in al, dx
    mov [bp + STK_CX], al
    inc dx
    in al, dx
    mov [bp + STK_CX + 1], al
    mov al, 1
    mov [bp + STK_DX], al
    xor ax, ax
    mov [bp + STK_DI], ax
    mov [bp + STK_ES], ax
    ret


_int13_set_chr:
    mov dx, VPC_FD_PORT + 6
    mov al, [bp + STK_AX]
    out dx, al
    inc dx
    mov al, [bp + STK_DX + 1]
    out dx, al
    inc dx
    mov ax, [bp + STK_CX]
    out dx, al
    inc dx
    mov al, ah
    out dx, al
    ret

_int13_set_dma:
    mov ax, [bp + STK_ES]
    mov bx, ax
    mov dx, [bp + STK_BX]
    mov cl, 4
    shl ax, cl
    mov cl, 12
    shr bx, cl
    add ax, [bp + STK_BX]
    adc bx, 0
    mov dx, VPC_FD_PORT + 2
    out dx, ax
    inc dx
    inc dx
    mov ax, bx
    out dx, ax
    ret

_int13_read:
    mov si, 1
    jmp _int13_io
_int13_write:
    mov si, 2
_int13_io:
    call _int13_set_chr
    call _int13_set_dma

    mov dx, VPC_FD_PORT
    mov ax, si
    out dx, ax
    pause
    in ax, dx
    or al, al
    jz .skip
    mov ah, al
.skip:
    mov dx, VPC_FD_PORT + 6
    in al, dx
    mov cl, [bp + STK_AX]
    sub cl, al
    mov al, cl
    or ah, ah
    jz .noerror
    stc
.noerror:
    ret


;; Serial Port BIOS
_int14:
    mov ax, 0x8000
    iret


;; System BIOS
_int15:
    cmp ah, 0x88
    jz i1588
    stc
    retf 2
i1588:
    push dx
    mov dx, VPC_MEM_PORT + 2
    in ax, dx
    pop dx
    clc
    retf


;; Keyboard BIOS
_int16:
    cmp ah, 0
    jz i1600
    cmp ah, 1
    jz i1601
    cmp ah, 2
    jz i1602
    xor ax, ax
    iret

i1600:
    push ds
    push bx
    push cx
    mov ax, BDA_SEG
    mov ds, ax
.loop:
    mov bx, [BDA_KBD_BUFF_HEAD]
    mov ax, [BDA_KBD_BUFF_TAIL]
    cmp ax, bx
    jnz .has_data
    sti
    hlt
    jmp .loop
.has_data:
    mov ax, [bx]
    lea cx, [bx + 2 - BDA_KBD_BUFF_BEGIN]
    and cx, BDA_KBD_BUFF_MASK
    add cx, BDA_KBD_BUFF_BEGIN
    mov [BDA_KBD_BUFF_HEAD], cx
    pop cx
    pop bx
    pop ds
    iret

i1601:
    push ds
    push bx
    mov ax, BDA_SEG
    mov ds, ax
    mov ax, [BDA_KBD_BUFF_TAIL]
    mov bx, [BDA_KBD_BUFF_HEAD]
    sub ax, bx
    jz .end
    mov ax, [bx]
.end:
    pop bx
    pop ds
    retf 2

i1602:
    push ds
    mov ax, BDA_SEG
    mov ds, ax
    mov al, [BDA_KBD_SHIFT]
    pop ds
    iret


;; Printer BIOS
_int17:
    iret


;; Clock BIOS
_int1A:
    or ah, ah
    jz i1A00
    cmp ah, 2
    jz i1A02
    cmp ah, 4
    jz i1A04
    xor ax, ax
    stc
    retf 2
i1A00:
    cli
    push ds
    xor cx, cx
    mov ds, cx
    mov dx, [0x046C]
    mov cx, [0x046E]
    xor al, al
    xchg al, [0x0470]
    pop ds
    iret

i1A02:
.loop:
    mov al, 0
    out 0x70, al
    in al, 0x71
    mov dh, al
    mov al, 2
    out 0x70, al
    in al, 0x71
    mov cl, al
    mov al, 4
    out 0x70, al
    in al, 0x71
    mov ch, al
    mov al, 0
    out 0x70, al
    in al, 0x71
    cmp dh, al
    jnz .loop
    xor dl, dl
    clc
    retf 2

i1A04:
.loop:
    mov al, 7
    out 0x70, al
    in al, 0x71
    mov dl, al
    mov al, 8
    out 0x70, al
    in al, 0x71
    mov dh, al
    mov al, 9
    out 0x70, al
    in al, 0x71
    mov cl, al
    mov al, 0x32
    out 0x70, al
    in al, 0x71
    mov ch, al
    mov al, 7
    out 0x70, al
    in al, 0x71
    cmp al, dl
    jnz .loop
    clc
    retf 2



_INIT:
    cli
    xor ax, ax
    mov ss, ax
    mov sp, 0x0400
    mov cx, cs
    mov ds, cx
    mov es, ax
    push ax
    popf

    xor di, di
    mov cx, 256
    rep stosw

    ;; Install IRQ and BIOS services
__set_irq:
    mov di, 4 * 5
    mov ax, _iret
    stosw
    mov ax, cs
    stosw
    mov ax, _iret
    stosw
    mov ax, cs
    stosw
    mov ax, _iret
    stosw
    mov ax, cs
    stosw
    mov ax, _irq0
    stosw
    mov ax, cs
    stosw
    mov ax, _irq1
    stosw
    mov ax, cs
    stosw
    mov cx, 6
.loop:
    mov ax, _irq_dummy
    stosw
    mov ax, cs
    stosw
    loop .loop

    mov ax, _int10
    stosw
    mov ax, cs
    stosw
    mov ax, _int11
    stosw
    mov ax, cs
    stosw
    mov ax, _int12
    stosw
    mov ax, cs
    stosw
    mov ax, _int13
    stosw
    mov ax, cs
    stosw
    mov ax, _int14
    stosw
    mov ax, cs
    stosw
    mov ax, _int15
    stosw
    mov ax, cs
    stosw
    mov ax, _int16
    stosw
    mov ax, cs
    stosw
    mov ax, _int17
    stosw
    mov ax, cs
    stosw
    mov ax, _int18
    stosw
    mov ax, cs
    stosw
    mov ax, _int19
    stosw
    mov ax, cs
    stosw
    mov ax, _int1A
    stosw
    mov ax, cs
    stosw
    mov ax, _iret
    stosw
    mov ax, cs
    stosw
    mov ax, _iret
    stosw
    mov ax, cs
    stosw

    ;; BIOS Data Area
    mov di, 0x0400
    mov ax, 0x3F8
    stosw
    xor ax, ax
    mov cx, 7
    rep stosw
    mov ax, 0x0201
    stosw
    xor al, al
    stosb
    mov dx, VPC_MEM_PORT
    in ax, dx
    stosw
    mov di, 0x400 + BDA_KBD_BUFF_HEAD
    mov ax, BDA_KBD_BUFF_BEGIN
    stosw
    stosw

    mov di, 0x400 + BDA_VGA_CURRENT_MODE
    mov al, 0x03
    stosb
    mov ax, 80
    stosw
    mov ax, 80 * 50
    stosw
    xor ax, ax
    stosw

    ;; init PIC
    mov al, 0xFF
    out 0x21, al
    out 0xA1, al
    mov al, 0x11
    out 0x20, al
    out 0xA0, al
    mov al, PIC_ICW2_MAS
    out 0x21, al
    mov al, PIC_ICW2_SLA
    out 0xA1, al
    mov al, 0x04
    out 0x21, al
    mov al, 0x02
    out 0xA1, al
    mov al, 0x01
    out 0x21, al
    out 0xA1, al

    mov al, 0xFC
    out 0x21, al
    mov al, 0xFF
    out 0xA1, al


    ;; init Timer
    mov al, 0x34
    out 0x43, al
    xor al, al
    out 0x40, al
    out 0x40, al

    mov ah, 2
    int 0x1A
    mov al, ch
    aam 16
    aad 10
    mov [ss:0x46E], al
    mov al, cl
    aam 16
    aad 10
    mov bl, 60
    mul bl
    mov cx, ax
    mov al, dh
    aam 16
    aad 10
    xor ah, ah
    add ax, cx
    mov dx, ax
    xor ax, ax
    mov cx, 3600
    div cx
    mov [ss:0x46C], ax
    xor ax, ax
    mov [ss:0x46F], ax
    sti
    hlt

    ;; ENABLE UART
    cli
    xor ax, ax
    mov es, ax
    mov di, (8 + 4) * 4
    mov ax, _irq4
    stosw
    mov ax, cs
    stosw
    in al, 0x21
    and al, 0xEF
    out 0x21, al
    mov dx, [ss:0x0400]
    inc dx
    mov al, 0x01
    out dx, al
    sti


    ;; CLEAR MEMORY
_clear_memory:
    mov dx, VPC_MEM_PORT
    in ax, dx
    mov cl, 6
    shl ax, cl
    mov bp, ax
    xor dx, dx
    mov di, 0x500
.loop:
    mov es, dx
    xor ax, ax
    mov cx, di
    not cx
    shr cx, 1
    inc cx
    rep stosw
    mov bx, 0x1000
    add dx, bx
    sub bp, bx
    ja .loop

    ;; INIT VIDEO
    mov ax, 0x0003
    int 0x10
    mov ax, 0x0100
    mov cx, 0x0607
    int 0x10

_init_palette:
    mov dx, 0x03C8
    xor ax, ax
    out dx, al
    inc dx
    mov bx, 16
.loop1:
    mov si, _palette_data
    mov cx, 256
.loop0:
    lodsb
    out dx, al
    lodsb
    out dx, al
    lodsb
    out dx, al
    loop .loop0
    dec bx
    jnz .loop1

__set_vram:
    mov ax, 0xB800
    mov es, ax
    xor di, di
    mov cx, 80 * 25
    mov ax, 0x0720
    rep stosw

    ; mov si, banner
    ; call puts

    mov si, _boot_sound_data
    call _play_sound


    mov dl, 0
    ;; read MBR from disk
_int19:
    xor ax, ax
    int 0x13
    xor ax, ax
    mov ds, ax
    mov es, ax
    mov ss, ax
    mov sp, 0x7C00
    mov ax, 0x0201
    mov cx, 0x0001
    mov dh, 0x00
    mov bx, sp
    xor si, si
    xor di, di
    int 0x13
    jc .fail
;    cmp word [es:bx+0x01FE], 0xAA55
;    jnz .fail
    call 0:0x7C00
.fail:
_int18:
    db 0xF1
_repl:
    cli
    xor ax, ax
    mov es, ax
    mov ss, ax
    mov sp, 0x0400
    push cs
    pop ds
    mov si, boot_fail_msg
    call puts
.prompt:
    sti
    mov di, ARGV
    mov al, '#'
    call _aux_out
.loop:
    xor ah, ah
    int 0x16
    cmp al, 13
    jz .crlf
    cmp al, 127
    jz .del
    ss stosb
    call _aux_out
    jmp .loop
.del:
    mov al, 8
    call _aux_out
    jmp .loop
.crlf:
    xor al, al
    ss stosb
    mov al, 13
    call _aux_out
    mov al, 10
    call _aux_out

    mov si, ARGV
.loop_cmd:
    ss lodsb
    or al, al
    jz .prompt
    cmp al, ' '
    jz .loop_cmd
    cmp al, 'r'
    jnz .no_cmd_r
    mov dx, 0x0CF9
    out dx, al
    jmp $
.no_cmd_r:
    cmp al, 'u'
    jnz .no_cmd_u
    cli
    hlt
.no_cmd_u:
.bad_cmd:
    jmp .prompt


_aux_out:
    mov ah, 0x0E
    int 0x10
    ret

_bios_beep:
    pushf
    cli
    jcxz .stop
    cmp cx, 0x0001
    jz short .fire
    mov al, TIMER_INIT_BEEP
    out PORT_TIMER_CTL, al
    mov ax, _BEEP_TICK_L
    mov dx, _BEEP_TICK_H
    div cx
    out PORT_BEEP_CNT,al
    mov al, ah
    out PORT_BEEP_CNT,al
.fire:
    in al,PORT_BEEP_FIRE
    or al, 0x03
    out PORT_BEEP_FIRE,al
    jmp short .end
.stop:
    in al,PORT_BEEP_FIRE
    and al, 0xFC
    out PORT_BEEP_FIRE,al
.end:
    popf
    ret


_bios_tick:
    push ds
    xor ax, ax
    mov ds, ax
.retry:
    mov ax, [ds:0x046C]
    mov dx, [ds:0x046E]
    cmp ax, [ds:0x046C]
    jnz .retry
    mov cx, _TIMER_RES
    pop ds
    ret


_bios_wait:
    push si
    push di
    push bx

    mov bx, cx

    call _bios_tick
    mov si, ax
    mov di, dx

.loop:
    sti
    hlt
    call _bios_tick

    sub ax, si
    sbb dx, di
    or dx, dx
    jnz .end

    mul cx
    or dx, dx
    jnz .end
    cmp ax, bx
    jb .loop

.end:
    pop bx
    pop di
    pop si
    ret



_play_sound:

.loop:
    lodsw
    cmp ax, 0xFFFF
    jz .end
    mov cx, ax
    call _bios_beep
    lodsw
    mov cx, ax
    call _bios_wait
    jmp .loop
.end:
    xor cx, cx
    call _bios_beep
    ret


puts:
.loop:
    lodsb
    or al, al
    jz .end
    call _aux_out
    jmp .loop
.end:
    ret


boot_fail_msg:
    db 10, "Operating System not found", 10, 0

    alignb 2
_boot_sound_data:
    dw 2000, 100, 1000, 100
    dw 0xFFFF


_palette_data:
    db 0x00,0x00,0x00, 0x00,0x00,0x2a, 0x00,0x2a,0x00, 0x00,0x2a,0x2a,
    db 0x2a,0x00,0x00, 0x2a,0x00,0x2a, 0x2a,0x15,0x00, 0x2a,0x2a,0x2a,
    db 0x15,0x15,0x15, 0x15,0x15,0x3f, 0x15,0x3f,0x15, 0x15,0x3f,0x3f,
    db 0x3f,0x15,0x15, 0x3f,0x15,0x3f, 0x3f,0x3f,0x15, 0x3f,0x3f,0x3f,
    db 0x00,0x00,0x00, 0x05,0x05,0x05, 0x08,0x08,0x08, 0x0b,0x0b,0x0b,
    db 0x0e,0x0e,0x0e, 0x11,0x11,0x11, 0x14,0x14,0x14, 0x18,0x18,0x18,
    db 0x1c,0x1c,0x1c, 0x20,0x20,0x20, 0x24,0x24,0x24, 0x28,0x28,0x28,
    db 0x2d,0x2d,0x2d, 0x32,0x32,0x32, 0x38,0x38,0x38, 0x3f,0x3f,0x3f,
    db 0x00,0x00,0x3f, 0x10,0x00,0x3f, 0x1f,0x00,0x3f, 0x2f,0x00,0x3f,
    db 0x3f,0x00,0x3f, 0x3f,0x00,0x2f, 0x3f,0x00,0x1f, 0x3f,0x00,0x10,
    db 0x3f,0x00,0x00, 0x3f,0x10,0x00, 0x3f,0x1f,0x00, 0x3f,0x2f,0x00,
    db 0x3f,0x3f,0x00, 0x2f,0x3f,0x00, 0x1f,0x3f,0x00, 0x10,0x3f,0x00,
    db 0x00,0x3f,0x00, 0x00,0x3f,0x10, 0x00,0x3f,0x1f, 0x00,0x3f,0x2f,
    db 0x00,0x3f,0x3f, 0x00,0x2f,0x3f, 0x00,0x1f,0x3f, 0x00,0x10,0x3f,
    db 0x1f,0x1f,0x3f, 0x27,0x1f,0x3f, 0x2f,0x1f,0x3f, 0x37,0x1f,0x3f,
    db 0x3f,0x1f,0x3f, 0x3f,0x1f,0x37, 0x3f,0x1f,0x2f, 0x3f,0x1f,0x27,

    db 0x3f,0x1f,0x1f, 0x3f,0x27,0x1f, 0x3f,0x2f,0x1f, 0x3f,0x37,0x1f,
    db 0x3f,0x3f,0x1f, 0x37,0x3f,0x1f, 0x2f,0x3f,0x1f, 0x27,0x3f,0x1f,
    db 0x1f,0x3f,0x1f, 0x1f,0x3f,0x27, 0x1f,0x3f,0x2f, 0x1f,0x3f,0x37,
    db 0x1f,0x3f,0x3f, 0x1f,0x37,0x3f, 0x1f,0x2f,0x3f, 0x1f,0x27,0x3f,
    db 0x2d,0x2d,0x3f, 0x31,0x2d,0x3f, 0x36,0x2d,0x3f, 0x3a,0x2d,0x3f,
    db 0x3f,0x2d,0x3f, 0x3f,0x2d,0x3a, 0x3f,0x2d,0x36, 0x3f,0x2d,0x31,
    db 0x3f,0x2d,0x2d, 0x3f,0x31,0x2d, 0x3f,0x36,0x2d, 0x3f,0x3a,0x2d,
    db 0x3f,0x3f,0x2d, 0x3a,0x3f,0x2d, 0x36,0x3f,0x2d, 0x31,0x3f,0x2d,
    db 0x2d,0x3f,0x2d, 0x2d,0x3f,0x31, 0x2d,0x3f,0x36, 0x2d,0x3f,0x3a,
    db 0x2d,0x3f,0x3f, 0x2d,0x3a,0x3f, 0x2d,0x36,0x3f, 0x2d,0x31,0x3f,
    db 0x00,0x00,0x1c, 0x07,0x00,0x1c, 0x0e,0x00,0x1c, 0x15,0x00,0x1c,
    db 0x1c,0x00,0x1c, 0x1c,0x00,0x15, 0x1c,0x00,0x0e, 0x1c,0x00,0x07,
    db 0x1c,0x00,0x00, 0x1c,0x07,0x00, 0x1c,0x0e,0x00, 0x1c,0x15,0x00,
    db 0x1c,0x1c,0x00, 0x15,0x1c,0x00, 0x0e,0x1c,0x00, 0x07,0x1c,0x00,
    db 0x00,0x1c,0x00, 0x00,0x1c,0x07, 0x00,0x1c,0x0e, 0x00,0x1c,0x15,
    db 0x00,0x1c,0x1c, 0x00,0x15,0x1c, 0x00,0x0e,0x1c, 0x00,0x07,0x1c,

    db 0x0e,0x0e,0x1c, 0x11,0x0e,0x1c, 0x15,0x0e,0x1c, 0x18,0x0e,0x1c,
    db 0x1c,0x0e,0x1c, 0x1c,0x0e,0x18, 0x1c,0x0e,0x15, 0x1c,0x0e,0x11,
    db 0x1c,0x0e,0x0e, 0x1c,0x11,0x0e, 0x1c,0x15,0x0e, 0x1c,0x18,0x0e,
    db 0x1c,0x1c,0x0e, 0x18,0x1c,0x0e, 0x15,0x1c,0x0e, 0x11,0x1c,0x0e,
    db 0x0e,0x1c,0x0e, 0x0e,0x1c,0x11, 0x0e,0x1c,0x15, 0x0e,0x1c,0x18,
    db 0x0e,0x1c,0x1c, 0x0e,0x18,0x1c, 0x0e,0x15,0x1c, 0x0e,0x11,0x1c,
    db 0x14,0x14,0x1c, 0x16,0x14,0x1c, 0x18,0x14,0x1c, 0x1a,0x14,0x1c,
    db 0x1c,0x14,0x1c, 0x1c,0x14,0x1a, 0x1c,0x14,0x18, 0x1c,0x14,0x16,
    db 0x1c,0x14,0x14, 0x1c,0x16,0x14, 0x1c,0x18,0x14, 0x1c,0x1a,0x14,
    db 0x1c,0x1c,0x14, 0x1a,0x1c,0x14, 0x18,0x1c,0x14, 0x16,0x1c,0x14,
    db 0x14,0x1c,0x14, 0x14,0x1c,0x16, 0x14,0x1c,0x18, 0x14,0x1c,0x1a,
    db 0x14,0x1c,0x1c, 0x14,0x1a,0x1c, 0x14,0x18,0x1c, 0x14,0x16,0x1c,
    db 0x00,0x00,0x10, 0x04,0x00,0x10, 0x08,0x00,0x10, 0x0c,0x00,0x10,
    db 0x10,0x00,0x10, 0x10,0x00,0x0c, 0x10,0x00,0x08, 0x10,0x00,0x04,
    db 0x10,0x00,0x00, 0x10,0x04,0x00, 0x10,0x08,0x00, 0x10,0x0c,0x00,
    db 0x10,0x10,0x00, 0x0c,0x10,0x00, 0x08,0x10,0x00, 0x04,0x10,0x00,

    db 0x00,0x10,0x00, 0x00,0x10,0x04, 0x00,0x10,0x08, 0x00,0x10,0x0c,
    db 0x00,0x10,0x10, 0x00,0x0c,0x10, 0x00,0x08,0x10, 0x00,0x04,0x10,
    db 0x08,0x08,0x10, 0x0a,0x08,0x10, 0x0c,0x08,0x10, 0x0e,0x08,0x10,
    db 0x10,0x08,0x10, 0x10,0x08,0x0e, 0x10,0x08,0x0c, 0x10,0x08,0x0a,
    db 0x10,0x08,0x08, 0x10,0x0a,0x08, 0x10,0x0c,0x08, 0x10,0x0e,0x08,
    db 0x10,0x10,0x08, 0x0e,0x10,0x08, 0x0c,0x10,0x08, 0x0a,0x10,0x08,
    db 0x08,0x10,0x08, 0x08,0x10,0x0a, 0x08,0x10,0x0c, 0x08,0x10,0x0e,
    db 0x08,0x10,0x10, 0x08,0x0e,0x10, 0x08,0x0c,0x10, 0x08,0x0a,0x10,
    db 0x0b,0x0b,0x10, 0x0c,0x0b,0x10, 0x0d,0x0b,0x10, 0x0f,0x0b,0x10,
    db 0x10,0x0b,0x10, 0x10,0x0b,0x0f, 0x10,0x0b,0x0d, 0x10,0x0b,0x0c,
    db 0x10,0x0b,0x0b, 0x10,0x0c,0x0b, 0x10,0x0d,0x0b, 0x10,0x0f,0x0b,
    db 0x10,0x10,0x0b, 0x0f,0x10,0x0b, 0x0d,0x10,0x0b, 0x0c,0x10,0x0b,
    db 0x0b,0x10,0x0b, 0x0b,0x10,0x0c, 0x0b,0x10,0x0d, 0x0b,0x10,0x0f,
    db 0x0b,0x10,0x10, 0x0b,0x0f,0x10, 0x0b,0x0d,0x10, 0x0b,0x0c,0x10,
    db 0x00,0x00,0x00, 0x00,0x00,0x00, 0x00,0x00,0x00, 0x00,0x00,0x00,
    db 0x00,0x00,0x00, 0x00,0x00,0x00, 0x00,0x00,0x00, 0x00,0x00,0x00

    times SIZE_BIOS - 16 - ($-$$) db 0
__RESET:
    jmp SEG_BIOS:_INIT
    db "06/16/19"
    db 0
    db 0xFF
    db 0
