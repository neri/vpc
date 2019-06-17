.PHONY: all clean run test lib

all: lib

clean:
	rm -rf lib/*

run: all

test: all

lib: lib/xterm.js lib/xterm.js.map lib/xterm.css lib/bios.bin lib/vcpu.wasm

lib/vcpu.wasm: src/vcpu.c
	wa-compile -q -O $? -o $@

lib/bios.bin: src/bios.asm
	nasm -f bin $? -o $@

lib/xterm.js: node_modules/xterm/dist/xterm.js
	cp $? $@

lib/xterm.js.map: node_modules/xterm/dist/xterm.js.map
	cp $? $@

lib/xterm.css: node_modules/xterm/dist/xterm.css
	cp $? $@
