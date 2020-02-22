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

%define FLAGS_ZF            0x40

%define CRTC_PORT           0x3B4

%define VPC_MEM_PORT        0xFC00
%define VPC_VGA_PORT        0xFC04
%define VPC_FD_PORT         0xFD00

%define BDA_SEG             0x0040
%define BDA_COMPORT         0x0000
%define BDA_MEMORY          0x0013
%define BDA_KBD_SHIFT       0x0017
%define BDA_KBD_BUFF_HEAD   0x001A
%define BDA_KBD_BUFF_TAIL   0x001C
%define BDA_KBD_BUFF_BEGIN  0x001E
%define BDA_KBD_BUFF_MASK   0x001F
%define BDA_VGA_CURRENT_MODE    0x0049
%define BDA_VGA_CONSOLE_COLS    0x004A
%define BDA_VGA_CURSOR      0x0050
%define BDA_VGA_ACTIVE_PAGE 0x0062
%define BDA_TIME_STAMP      0x006C
%define BDA_MIDNIGHT_FLAG        0x0070
%define BDA_VGA_CONSOLE_ROWSm1  0x0084
%define BDA_KBD_MODE_TYPE   0x0096

%define KBD_MODE_CLEAR_MASK 0xFC
%define KBD_MODE_LAST_E1    0x01
%define KBD_MODE_LAST_E0    0x02
%define KBD_TYPE_ENHANCED   0x10

%define ARGV 0x0080

_HEAD:
    dw SEG_BIOS, SIZE_BIOS

_isr_table:
    dw _iret, _iret, _iret, _iret, _iret, _iret, _iret
    dw _irq0, _irq1, _irq_dummy, _irq_dummy, _irq_dummy, _irq_dummy, _irq_dummy, _irq_dummy
    dw _int10, _int11, _int12, _int13, _int14, _int15, _int16, _int17
    dw _int18, _int19, _int1A, _iret, _iret
_end_isr_table:

_int10_ftbl:
    dw i1000, i1001, i1002, i1003, i1004, i1005, i1006, i1007
    dw i1008, i1009, i100A, i100B, i100C, i100D, i100E, i100F
    dw i1010, i1011, i1012, i1013, i1014, i1015, i1016, i1017
    dw i1018, i1019, i101A, i101B, i101C, i101D, i101E, i101F
_int10_etbl:

_int104F_ftbl:
    dw i104F00, i104F01, i104F02
_int104F_etbl:

_int16_ftbl:
    dw i1600, i1601, i1602
_int16_etbl:

_int1A_ftbl:
    dw i1A00, _ret, i1A02, _ret, i1A04
_int1A_etbl:




;; IRQ 0 Timer
_irq0:
    push ds
    push ax
    mov ax, BDA_SEG
    mov ds, ax
    inc word [BDA_TIME_STAMP]
    jnz .skip
    mov ax, [BDA_TIME_STAMP + 2]
    inc ax
    cmp ax, 24
    jb .nb
    xor ax, ax
    mov byte [BDA_MIDNIGHT_FLAG], 1
.nb:
    mov [BDA_TIME_STAMP + 2], ax
.skip:
    int 0x1C
    mov al, 0x20
    out 0x20, al
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


;; Dummy
_irq_dummy:
    push ax
    mov al, 0x20
    out 0x20, al
    pop ax
_iret:
    iret


__invoke:
    cld
    mov bx, BDA_SEG
    mov ds, bx
    mov bl, ah
    xor bh, bh
    add bx, bx
    push word [cs: bx + si]
    mov bx, [bp + STK_BX]
    mov si, [bp + STK_SI]
_ret:
    ret

bios_invoker:
    call __invoke
bios_exit:
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

    cmp ah, (_int10_etbl - _int10_ftbl) / 2
    jae .not_supported
    mov si, _int10_ftbl
    jmp bios_invoker
.not_supported:
    cmp ah, 0x4F
    jnz .no_vbe
    cmp al, (_int104F_etbl - _int104F_ftbl) / 2
    jae .no_vbe
    mov ah, al
    mov si, _int104F_ftbl
    jmp bios_invoker
.no_vbe:
    jmp bios_exit


;; Keyboard BIOS
_int16:
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

    cmp ah, (_int16_etbl - _int16_ftbl) / 2
    jae .not_supported
    mov si, _int16_ftbl
    jmp bios_invoker
.not_supported:
    xor ax, ax
    mov [bp + STK_AX],  ax
    jmp bios_exit


;; Clock BIOS
_int1A:
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

    cmp ah, (_int1A_etbl - _int1A_ftbl) / 2
    jae .not_supported
    mov si, _int1A_ftbl
    jmp bios_invoker
.not_supported:
    or byte [bp + STK_AX], 0x01
    jmp bios_exit




i1004:
i1005:
i100B:
i100C:
i100D:
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

i1010:
    cmp al, 0x12
    jz _set_pal_block
    ret
_set_pal_block:
    mov dx, 0x03C8
    mov ax, [bp+STK_BX]
    out dx, al
    inc dx
    dec cx
    xor ch, ch
    inc cx
    mov ds, [bp+STK_ES]
    mov si, [bp+STK_DX]
.loop:
    lodsb
    out dx, al
    lodsb
    out dx, al
    lodsb
    out dx, al
    loop .loop
    ret

i101A:
    mov bx, 0x0008
    mov [bp+STK_BX], bx
    mov [bp+STK_AX], ah
    ret


i1000: ;; SET VIDEO MODE
    cmp al, 0x03
    jbe .mode_03
    cmp al, 0x06
    jz .mode_cga
    cmp al, 0x11
    jz .mode_graph
    cmp al, 0x13
    jz .mode_graph
    ; db 0xf1
    xor al, al
    ret

.mode_03:
    mov ax, 0xB800
    mov es, ax
    xor di, di
    mov ax, 0x0720
    mov cx, 80 * 25
    rep stosw
    mov ax, 3
.set_mode:
    mov [BDA_VGA_CURRENT_MODE], al
    mov dx, VPC_VGA_PORT
    out dx, ax
    xor dx, dx
    call i1002
    ret

.mode_cga:
    push ax
    mov ax, 0xB800
    mov es, ax
    xor di, di
    xor ax, ax
    mov cx, 0x2000
    rep stosw
    pop ax
    jmp .set_mode

.mode_graph:
    push ax
    mov ax, 0xA000
    mov es, ax
    xor di, di
    xor ax, ax
    mov cx, 0x8000
    rep stosw
    pop ax
    jmp .set_mode

i100F:
    mov al, [BDA_VGA_CURRENT_MODE]
    mov ah, [BDA_VGA_CONSOLE_COLS]
    mov [bp+STK_AX], ax
    mov bh, [BDA_VGA_ACTIVE_PAGE]
    mov [bp+STK_BX + 1], bh
    ret


i1006:
    mov ah, bh
    push ax
    push cx
    push dx
    call _scroll@6
    ret

i1007:
    or al, al
    jz i1006
    ;; TODO:
    ret


; 4 xy2 6 xy1 8 lines 9 color
_scroll@6:
    push bp
    mov bp, sp
    mov ax, 0xB800
    mov es, ax

    mov bx, [bp + 4]
    add bx, 0x0101
    sub bl, [bp + 6]
    sub bh, [bp + 7]
    sub bh, [bp + 8]

    mov dx, [bp + 6]
    call _bios_cursor_addr
    xchg ax, di
    cmp byte [bp + 8], 0
    jz .skip
    add dh, [bp + 8]
    call _bios_cursor_addr
    xchg ax, si

    mov al, [BDA_VGA_CONSOLE_COLS]
    sub al, bl
    xor ah, ah
    add ax, ax
    xor ch, ch
.loop1:
    mov cl, bl
    es
    rep movsw
    add si, ax
    add di, ax
    dec bh
    jnz .loop1

.skip:
    mov dl, [BDA_VGA_CONSOLE_COLS]
    sub dl, bl
    xor dh, dh
    add dx, dx
    mov bh, [bp + 8]
    or bh, bh
    jnz .skip2
    mov bh, [bp + 5]
    sub bh, [bp + 7]
    inc bh
.skip2:
    mov ah, [bp + 9]
    mov al, 0x20
    xor ch, ch
.loop2:
    mov cl, bl
    rep stosw
    add di, dx
    dec bh
    jnz .loop2

    pop bp
    ret 6


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
    mov [BDA_VGA_CURSOR], dx
    call _bios_set_cursor
    ret

i1003:
    mov ax, [BDA_VGA_CURSOR]
    mov [bp+STK_DX], ax
    mov word [bp+STK_CX], 0x0607
    ret


i1013:
    cmp dh, [BDA_VGA_CONSOLE_ROWSm1]
    ja .end
    cmp dl, [BDA_VGA_CONSOLE_COLS]
    jae .end
    mov bh, al
    ; mov es, [bp + STK_ES]
    mov si, [bp + STK_BP]
.loop:
    es lodsb
    cmp al, 7
    jz .bel
    cmp al, 8
    jz .bs
    cmp al, 10
    jz .lf
    cmp al, 13
    jz .cr
    call _bios_write_char2
.tail:
    loop .loop
    test bh, 0x01
    jz .end
    call i1002
.end:
    ret

.bel:
    call _bios_cons_beep
    jmp .tail
.bs:
    or dl, dl
    jz .tail
    dec dl
    jmp .tail
.lf:
    xor dl, dl
    inc dh
    jmp .tail
.cr:
    xor dl, dl
    jmp .tail




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
    mov dx, [BDA_VGA_CURSOR]
.loop:
    call _bios_write_char2
    loop .loop
    ret

i100A:
    mov dx, [BDA_VGA_CURSOR]
.loop:
    call _bios_write_char
    loop .loop
    ret

i100E:
    cmp al, 7
    jz .bel
    cmp al, 8
    jz .bs
    cmp al, 10
    jz .lf
    cmp al, 13
    jz .cr
.cont:
    cmp byte [BDA_VGA_CURRENT_MODE], 3
    ja .end
    call _chk_scroll
    mov dx, [BDA_VGA_CURSOR]
    call _bios_write_char
    mov [BDA_VGA_CURSOR], dx
.end:
    call _chk_scroll
    mov dx, [BDA_VGA_CURSOR]
    call _bios_set_cursor
    ret
.bel:
    jmp _bios_cons_beep
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
    push ds
    push cx
    mov cx, BDA_SEG
    mov ds, cx
    mov al, dh
    mov cl, [BDA_VGA_CONSOLE_COLS]
    mul cl
    add al, dl
    adc ah, 0
    add ax, ax
    pop cx
    pop ds
    ret


_bios_write_char:
    push ds
    push si
    push cx
    push ax
    call _bios_cursor_addr
    xchg ax, si
    pop ax
    mov cx, 0xB800
    mov ds, cx
    mov [si], al
    pop cx
    pop si
    pop ds
    inc dl
    ret

_bios_write_char2:
    push ds
    push si
    push cx
    push ax
    call _bios_cursor_addr
    xchg ax, si
    pop ax
    mov cx, 0xB800
    mov ds, cx
    mov [si], al
    mov [si + 1], bl
    pop cx
    pop si
    pop ds
    inc dl
    ret

_chk_scroll:
    push ds
    push es
    push ax
    push cx
    push dx
    push bx
    push si
    push di
    mov cx, BDA_SEG
    mov ds, cx
    mov cx, [BDA_VGA_CURSOR]
    mov bl, [BDA_VGA_CONSOLE_COLS]
    mov bh, [BDA_VGA_CONSOLE_ROWSm1]
    cmp cl, bl
    jb .no80
    xor cl, cl
    inc ch
    mov [BDA_VGA_CURSOR], cx
.no80:
    cmp ch, bh
    jbe .end
    mov ch, bh
    mov [BDA_VGA_CURSOR], cx
    mov cx, 0xB800
    mov ds, cx
    mov es, cx
    mov al, bl
    mul bh
    mov cx, ax
    xor bh, bh
    mov si, bx
    add si, si
    xor di, di
    rep movsw
    mov cl, bl
    mov ax, 0x0720
    rep stosw
.end:
    pop di
    pop si
    pop bx
    pop dx
    pop cx
    pop ax
    pop es
    pop ds
    ret

_bios_cons_beep:
    push ds
    push cx
    push dx
    push si

    push cs
    pop ds
    mov si, _beep_sound_data
    call _play_sound

    pop si
    pop dx
    pop cx
    pop ds
    ret


;; Get Equipment List
_int11:
    push ds
    xor ax, ax
    mov ds, ax
    mov ax, [0x410]
    pop ds
    iret


;; Get Memory Size
_int12:
    push ds
    mov ax, BDA_SEG
    mov ds, ax
    mov ax, [BDA_MEMORY]
    pop ds
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
    push bp
    mov bp, sp
    or byte [bp + 6], 0x01
    pop bp
    iret

i1588:
    push dx
    mov dx, VPC_MEM_PORT + 2
    in ax, dx
    pop dx
    push bp
    mov bp, sp
    and byte [bp + 6], 0xFE
    pop bp
    iret


i1600:
.loop:
    mov bx, [BDA_KBD_BUFF_HEAD]
    mov ax, [BDA_KBD_BUFF_TAIL]
    cmp ax, bx
    jnz .has_data
    sti
    hlt
    jmp .loop
.has_data:
    cli
    mov ax, [bx]
    lea cx, [bx + 2 - BDA_KBD_BUFF_BEGIN]
    and cx, BDA_KBD_BUFF_MASK
    add cx, BDA_KBD_BUFF_BEGIN
    mov [BDA_KBD_BUFF_HEAD], cx
    mov [bp + STK_AX], ax
    ret

i1601:
    sti
    cli
    mov dl, [bp + STK_FLAGS]
    mov ax, [BDA_KBD_BUFF_TAIL]
    mov bx, [BDA_KBD_BUFF_HEAD]
    sub ax, bx
    jz .no_data
    mov ax, [bx]
    and dl, 0xFF - FLAGS_ZF
    jmp .end
.no_data:
    or dl, FLAGS_ZF
.end:
    mov [bp + STK_AX], ax
    mov [bp + STK_FLAGS], dl
    ret

i1602:
    mov al, [BDA_KBD_SHIFT]
    mov [bp + STK_AX], al
    ret


;; Printer BIOS
_int17:
    iret


i1A00:
    mov dx, [BDA_TIME_STAMP]
    mov cx, [BDA_TIME_STAMP + 2]
    xor ax, ax
    xchg al, [BDA_MIDNIGHT_FLAG]
    mov [bp + STK_DX], dx
    mov [bp + STK_CX], cx
    mov [bp + STK_AX], ax
    ret

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
    mov [bp + STK_DX], dx
    mov [bp + STK_CX], cx
    and byte [bp + STK_FLAGS], 0xFE
    ret

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
    mov [bp + STK_DX], dx
    mov [bp + STK_CX], cx
    and byte [bp + STK_FLAGS], 0xFE
    ret


;; Minimal VBE for haribote OS
    alignb 2
vesa_info:
    db "VESA"
    dw 0x0200
end_vesa_info:

%define MODE_SIZE   4
mode_dat:
    dw 0x100, 640, 400
    dw 0x101, 640, 480
    dw 0

i104F00: ;; GET SuperVGA INFORMATION
    push cs
    pop ds
    mov cx, (end_vesa_info - vesa_info) / 2
    mov si, vesa_info
    rep movsw

    mov ax, 0x004F
    mov [bp + STK_AX], ax
    ret

i104F01: ;; GET SuperVGA MODE INFORMATION
    push cs
    pop ds
    and cx, 0x1FF
    mov si, mode_dat
.loop:
    lodsw
    or ax, ax
    jz .end
    cmp ax, cx
    jz .mode_found
    add si, MODE_SIZE
    jmp .loop
.end:
    mov ax, 0x014F
    mov [bp + STK_AX], ax
    ret

.mode_found:

    xor ax, ax
    mov cx, 128
    rep stosw
    sub di, 256

    mov ax, 0x00FB
    stosw
    xor ax, ax
    add di, 14
    lodsw
    stosw
    stosw
    lodsw
    stosw
    add di, 3
    mov al, 8
    stosb
    xor al, al
    stosb
    mov al, 4
    stosb
    add di, 14
    mov ax, 0x000A
    stosw

    mov ax, 0x004F
    mov [bp + STK_AX], ax
    ret

i104F02: ;; SET SuperVGA VIDEO MODE
    push cs
    pop ds
    and bx, 0x01FF
    mov si, mode_dat
.loop:
    lodsw
    or ax, ax
    jz .end
    cmp ax, bx
    jz .mode_found
    add si, MODE_SIZE
    jmp .loop
.end:
    mov ax, 0x014F
    mov [bp + STK_AX], ax
    ret
.mode_found:
    mov dx, VPC_VGA_PORT
    out dx, ax
    mov ax, 0x004F
    mov [bp + STK_AX], ax
    ret




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

    mov cx, 0x200
    xor di, di
    rep stosw

    ;; Install IRQ and BIOS services
    mov di, 4
    mov si, _isr_table
    mov cx, (_end_isr_table - _isr_table) / 2
.loop:
    movsw
    mov ax, cs
    stosw
    loop .loop

    mov cx, 3
.loop3:
    xor ax, ax
    stosw
    mov ax, 0xF000
    stosw
    loop .loop3

;     mov di, 0x0100
;     mov cx, 64
; .loop4:
;     mov ax, _iret
;     movsw
;     mov ax, cs
;     stosw
;     loop .loop4


    ;; BIOS Data Area
    mov di, 0x0400
    xor ax, ax
    mov cx, 8
    rep stosw
    mov ax, 0x0225
    stosw
    xor al, al
    stosb
    mov dx, VPC_MEM_PORT
    in ax, dx
    stosw

    mov di, 0x400 + BDA_KBD_SHIFT
    xor ax, ax
    stosb
    stosw
    mov ax, BDA_KBD_BUFF_BEGIN
    stosw
    stosw
    xor ax, ax
    mov cx, 0x10
    rep stosw
    mov di, 0x480
    mov ax, BDA_KBD_BUFF_BEGIN
    stosw
    mov ax, BDA_KBD_BUFF_BEGIN + BDA_KBD_BUFF_MASK + 1
    stosw

    mov di, 0x400 + BDA_VGA_CURRENT_MODE
    mov al, 0x03
    stosb
    mov ax, 80
    stosw
    mov ax, 0x1000
    stosw
    xor ax, ax
    stosw
    mov di, 0x463
    mov ax, 0x3D4
    stosw
    mov di, 0x400 + BDA_VGA_CONSOLE_ROWSm1
    mov al, 24
    stosb


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

_clear_vram:
    mov dx, 0xA000
.loop0:
    mov es, dx
    mov cx, 0x8000
.loop:
    in ax, 0x40
    stosw
    loop .loop
    mov bx, 0x1000
    add dx, bx
    cmp dx, 0xF000
    jb .loop0

    mov ax, 0xFFFF
    mov es, ax
    mov di, 0x0010
    mov cx, 0xFFF0 / 2
    rep stosw


    ;; Init PIC
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


    ;; Init Timer
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


    ;; Init UART
    ; cli
    ; xor ax, ax
    ; mov es, ax
    ; mov di, (8 + 4) * 4
    ; mov ax, _irq4
    ; stosw
    ; mov ax, cs
    ; stosw
    ; in al, 0x21
    ; and al, 0xEF
    ; out 0x21, al
    ; mov dx, [ss:0x0400]
    ; inc dx
    ; mov al, 0x01
    ; out dx, al
    ; sti


    ;; Init Video
    mov ax, 0x0003
    int 0x10
    mov ax, 0x0100
    mov cx, 0x0607
    int 0x10

    push cs
    pop es
    mov ax, 0x1012
    xor bx, bx
    xor cx, cx
    mov dx, _palette_data
    int 0x10

    ; mov si, banner
    ; call puts


    ;; Init PS/2
_init_ps2:
    mov al, 0xFF
    out 0x60, al
.loop0:
    in al, 0x64
    test al, 0x01
    jz .skip0
    in al, 0x60
    jmp .loop0
.skip0:
    mov al, 0xF4
    out 0x60, al

    mov al, 0xD4
    out 0x64, al
    mov al, 0xFF
    out 0x60, al


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
    ; db 0xF1
    call 0:0x7C00
.fail:
_int18:
    ; db 0xF1
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
    mov ax, [0x046C]
    mov dx, [0x046E]
    cmp ax, [0x046C]
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
_beep_sound_data:
    dw 1000, 100
    dw 0xFFFF

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

    times SIZE_BIOS - 16 - ($-$$) db 0xFF
__RESET:
    jmp SEG_BIOS:_INIT
    db "02/02/20"
    db 0
    db 0xFF
    db 0
