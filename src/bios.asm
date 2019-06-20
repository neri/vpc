; Virtual Playground BIOS
; Copyright (C) 2019 Nerry

[CPU 8086]
[BITS 16]
[ORG 0]

%define SEG_BIOS 0xFE00
%define SIZE_BIOS 0x2000

%define PIC_ICW2_MAS        0x08
%define PIC_ICW2_SLA        0x70

%define	PORT_TIMER_CNT0		0x0040
%define	PORT_BEEP_CNT		0x0042
%define	PORT_TIMER_CTL		0x0043
%define	PORT_BEEP_FIRE		0x0061

%define	_TIMER_RES			55

%define	TIMER_INIT_BEEP		10110110b
%define	_BEEP_TICK_L		0x34DC
%define	_BEEP_TICK_H		0x0012

%define ARGV 0x0080

_HEAD:
    dw SEG_BIOS, SIZE_BIOS

banner:
    db "BIOS v0.0", 10, 0

_boot_sound_data:
    dw 2000, 200, 1000, 200
    dw 0xFFFF


_irq0:
    push ds
    push ax
    xor ax, ax
    mov ds, ax
    inc word [ds:0x046C]
    jnz .skip
    inc word [ds:0x046E]
.skip:
    mov al, 0x20
    out 0x20, al
    pop ax
    pop ds
    iret


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

_aux_in:
    push ds
    push dx
    xor dx, dx
    mov ds, dx
    mov dx, [ds:0x400]
    in al, dx
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


_INIT:
    cli
    cld
    xor ax, ax
    mov ss, ax
    mov sp, 0x400
    mov cx, cs
    mov ds, cx

    mov es, ax

    xor di, di
    mov cx, 256
    rep stosw

    mov di, 8 * 4
    mov ax, _irq0
    stosw
    mov ax, cs
    stosw

    mov ax, 0x3F8
    mov [ss:0x0400], ax

    ;; INIT PC/AT PIC
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

    ;; INIT PIT
    mov al, 0x34
    out 0x43, al
    xor al, al
    out 0x40, al
    out 0x40, al

    mov si, cls_msg
    call puts

    mov si, _boot_sound_data
    call _play_sound

    mov si, banner
    call puts

.prompt:
    mov di, ARGV
    mov al, '#'
    call _aux_out
.loop:
    call _aux_in
    or al, al
    jnz .skip
    hlt
    jmp .loop
.skip:
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


puts:
.loop:
    lodsb
    or al, al
    jz .end
    call _aux_out
    jmp .loop
.end:
    ret


cls_msg:
    db 0x1b, "[H", 0x1b, "[J", 0

bad_cmd_msg:
    db "Bad command or file name", 10, 0

    times SIZE_BIOS - 16 - ($-$$) db 0
__RESET:
    jmp SEG_BIOS:_INIT
    times SIZE_BIOS - ($-$$) db 0
