; Virtual Playground BIOS
; Copyright (C) 2019 Nerry

[CPU 8086]
[BITS 16]
[ORG 0]

%define SEG_BIOS 0xFE00
%define SIZE_BIOS 0x2000

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

_INIT:
    cli
    cld
    xor ax, ax
    mov ss, ax
    mov sp, 0x400
    mov ax, cs
    mov ds, ax
    mov es, ax

    mov ax, 0x3F8
    mov [ss:0x0400], ax

    mov si, cls_msg
    call puts

    ; PIPO sound
    mov cx, 2000
    call _bios_beep
    mov cx, 100
    call _wait
    mov cx, 1000
    call _bios_beep
    mov cx, 100
    call _wait
    xor cx, cx
    call _bios_beep

    mov si, banner
    call puts

    sti
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
    db 0xFF, 0xFF
.no_cmd_u:
    cmp al, 'b'
    jnz .no_cmd_b
    mov cx, 1000
    call _bios_beep
    mov cx, 100
    call _wait
    xor cx,cx 
    call _bios_beep
    jmp .prompt
.no_cmd_b:
.bad_cmd:
    mov si, bad_cmd_msg
    call puts
    jmp .prompt

_wait:
.await0:
    mov dx, 0xFFFF
.await:
    dec dx
    jnz .await
    loop .await0
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


cls_msg:
    db 0x1b, "[H", 0x1b, "[J", 0

bad_cmd_msg:
    db "Bad command or file name", 10, 0

    times SIZE_BIOS - 16 - ($-$$) db 0
__RESET:
    jmp SEG_BIOS:_INIT
    times SIZE_BIOS - ($-$$) db 0
