; Virtual Playground BIOS
; Copyright (C) 2019 Nerry
[CPU 8086]
[BITS 16]
[ORG 0]

%define ARGV 0x0080

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
	ss stosb
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
	jz .end
	cmp al, ' '
	jz .loop_cmd
	cmp al, 'r'
	jnz .no_cmd_r
	mov dx, 0x0CF9
	out dx, al
.no_cmd_r:
.end:
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

banner:
	db "BIOS v0.0", 10, 0

bad_cmd_msg:
	db "Bad command or file name", 10, 0

	times 0xFFF0 - ($-$$) db 0
__RESET:
    jmp 0xF000:_INIT
	times 0x10000 - ($-$$) db 0
