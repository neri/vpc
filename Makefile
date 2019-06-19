.PHONY: all clean run test

TARGETS := lib/vcpu.wasm lib/bios.bin lib/xterm.js lib/xterm.js.map lib/xterm.css

all: $(TARGETS)

clean:
	-rm -f $(TARGETS)

run: all

test: all

lib/vcpu.wasm: src/vcpu.c
	wa-compile -O $? -o $@

lib/bios.bin: src/bios.asm
	nasm -f bin $? -o $@

lib/xterm.js: node_modules/xterm/dist/xterm.js
	cp $? $@

lib/xterm.js.map: node_modules/xterm/dist/xterm.js.map
	cp $? $@

lib/xterm.css: node_modules/xterm/dist/xterm.css
	cp $? $@
