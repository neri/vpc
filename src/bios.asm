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

%define VPC_MEM_PORT        0xFC00
%define VPC_FD_PORT         0xFD00

%define BDA_SEG             0x0040
%define BDA_COMPORT         0x0000
%define BDA_KBD_BUFF_HEAD   0x001A
%define BDA_KBD_BUFF_TAIL   0x001C
%define BDA_KBD_BUFF_BEGIN  0x001E
%define BDA_KBD_BUFF_MASK   0x001F
%define BDA_VGA_CURRENT_MODE    0x0049
%define BDA_VGA_CURSOR      0x0050

%define ARGV 0x0080

_HEAD:
    dw SEG_BIOS, SIZE_BIOS

banner:
    db "BIOS v0.1", 10, 0

    alignb 2

_int10_ftbl:
    dw i1000, i1001, i1002, i1003, i1004, i1005, i1006, i1007
    dw i1008, i1009, i100A, i100B, i100C, i100D, i100E, i100F
    dw i1010, i1011, i1012, i1013
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
    mov bx, [cs:_int10_ftbl + bx]
    push bx
    mov bx, [bp + STK_BX]
    ret


i1000:
    push cs
    pop ds
    mov si, cls_msg
    call puts
    xor ax, ax
    ret

i100F:
    mov ax, BDA_SEG
    mov ds, ax
    mov al, [BDA_VGA_CURRENT_MODE]
    ret

i1006:
i1007:
    or al, al
    jz .cls
    ret
.cls:
    push cs
    pop ds
    mov si, cls_nc_msg
    call puts
    xor ax, ax
    ret


i1001:
i1003:
i1004:
i1005:
i1008:
i100A:
i100B:
i100C:
i100D:
i1010:
i1011:
i1012:
;    db 0xF1
    ret


i1002:
    sub sp, byte 16
    mov di, sp
    mov ax, 0x5B1B
    ss stosw

    mov al, dh
    aam
    xchg al, ah
    or al, al
    jz .comp1
    add al, '0'
    ss stosb
.comp1:
    xchg al, ah
    add al, '0'
    ss stosb
    mov al, ';'
    ss stosb

    mov al, dl
    aam
    xchg al, ah
    or al, al
    jz .comp2
    add al, '0'
    ss stosb
.comp2:
    xchg al, ah
    add al, '0'
    ss stosb
    mov ax, 'H'
    ss stosw

    xor dx, dx
    mov es, dx
    mov dx, [es:0x400]
    mov si, sp
.loop:
    ss lodsb
    or al, al
    jz .end
    out dx, al
    jmp .loop
.end:

    add sp, byte 16
    ret


i1013:
    cmp dh, 25
    jae .end
    cmp dl, 80
    jae .end
    call i1002
    xor dx, dx
    mov es, dx
    mov dx, [es:0x400]
    mov ds, [bp + STK_ES]
    mov si, [bp + STK_BP]
    ; mov cx, [bp + STK_CX]
.loop:
    lodsb
    and al, 0x7F
    out dx, al
    loop .loop
.end:
    ret

i1009:
    cmp al, ' '
    ja .ascii_ok
    cmp al, 0x7F
    jb .ascii_ok
    mov al, '?'
.ascii_ok:
i100E:
    xor dx, dx
    mov ds, dx
    mov dx, [ds:0x400]
    and al, 0x7F
    out dx, al
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
    ; push ds
    ; xor ax, ax
    ; mov ds, ax
    ; mov ax, [ds: 0x413]
    ; pop ds
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
    jmp .end
.no_00:
    cmp ah, 0x01
    jnz .no_01
    call _int13_get_drive_param
    jmp .end
.no_01:
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

.err:
    mov ax, 0x8000
.end:

    mov cx, [bp + STK_FLAGS]
    and cx, 0xFFFE
    or ah, ah
    jz .ok
    inc cx
.ok:
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
    in ax, dx
    mov [bp + STK_BX], al
    add dl, 7
    in al, dx
    mov [bp + STK_DX + 1], al
    inc dx
    in al, dx
    mov [bp + STK_CX], al
    inc dx
    in al, dx
    mov [bp + STK_CX + 1], al
    xor ax, ax
    mov [bp + STK_DX], al
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
;     mov dx, VPC_FD_PORT
;     xor ax, ax
;     out dx, ax
;     in ax, dx
;     or ax, ax
;     jnz .dev_ok
;     mov ax, 0x8000
;     ret
; .dev_ok:

    call _int13_set_chr
    call _int13_set_dma

    mov dx, VPC_FD_PORT
    mov ax, si
    out dx, ax
    pause
    in ax, dx
    or ax, ax
    jz .skip
    mov ah, 0x80
.skip:
    mov dx, VPC_FD_PORT + 6
    in al, dx
    mov cl, [bp + STK_AX]
    sub cl, al
    mov al, cl
    ret


;; Serial Port BIOS
_int14:
    mov ax, 0x8000
    iret


;; System BIOS
_int15:
    stc
    retf 2


;; Keyboard BIOS
_int16:
    cmp ah, 0
    jz i1600
    cmp ah, 1
    jz i1601
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



;; Printer BIOS
_int17:
    iret


;; Clock BIOS
_int1A:
    cmp ah, 0
    jz i1A00
    cmp ah, 2
    jz i1A02
    cmp ah, 4
    jz i1A04
    xor ax, ax
    stc
    retf 2
i1A00:
    push ds
    xor ax, ax
    mov ds, ax
    mov dx, [ds:0x046C]
    mov cx, [ds:0x046E]
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
    mov cx, 7
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

    mov al, 0xFA
    out 0x21, al
    mov al, 0xFF
    out 0xA1, al
    sti


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


    ;; INIT VGA PALETTE
_init_palette:
    mov dx, 0x03C8
    xor ax, ax
    out dx, ax
    inc dx
    mov bx, 16
.loop1:
    mov si, _palette_data
    mov cx, 16
.loop0:
    lodsb
    out dx, al
    lodsb
    out dx, al
    lodsb
    out dx, al
    inc si
    loop .loop0
    dec bx
    jnz .loop1

__set_vram:
    mov ax, 0xA000
    mov es, ax
    xor di, di
    mov cx, 320 * 200
.loop:
    in ax, 0
    stosw
    loop .loop

    mov si, cls_msg
    call puts

    mov si, banner
    call puts

    mov si, _boot_sound_data
    call _play_sound


    mov dl, 0
    ;; read MBR from disk
_int19:
    xor ax, ax
    mov ds, ax
    mov es, ax
    mov ss, ax
    mov sp, 0x7C00
    mov ax, 0x0201
    mov cx, 0x0001
    mov dh, 0x00
    mov bx, sp
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
    cmp al, 'b'
    jnz .no_cmd_b
    mov cx, 1000
    call _bios_beep
    mov cx, 200
    call _bios_wait
    xor cx,cx 
    call _bios_beep
    jmp .prompt
.no_cmd_b:
.bad_cmd:
    mov si, bad_cmd_msg
    call puts
    jmp .prompt


_aux_out:
    push ds
    push dx
    xor dx, dx
    mov ds, dx
    mov dx, [ds:0x400]
    out dx, al
    pop dx
    pop ds
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


cls_nc_msg:
    db 0x1b, "[2J", 0

cls_msg:
    db 0x1b, "[H", 0x1b, "[J", 0

boot_fail_msg:
    db 10, "Boot failure", 10, 0

bad_cmd_msg:
    db "Bad command or file name", 10, 0

    alignb 2
_boot_sound_data:
    dw 2000, 100, 1000, 100
    dw 0xFFFF

_palette_data:
    dd 0x000000, 0x000099, 0x009900, 0x009999
    dd 0x990000, 0x990099, 0x999900, 0x999999
    dd 0x666666, 0x0000FF, 0x00FF00, 0x00FFFF
    dd 0xFF0000, 0xFF00FF, 0xFFFF00, 0xFFFFFF

    times SIZE_BIOS - 16 - ($-$$) db 0
__RESET:
    jmp SEG_BIOS:_INIT
    db "06/16/19"
    db 0
    db 0xFF
    db 0
