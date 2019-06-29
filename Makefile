.PHONY: all clean run test

TARGETS := lib/vcpu.wasm lib/bios.bin lib/worker.js lib/xterm.js lib/xterm.js.map lib/xterm.css

all: lib $(TARGETS)

clean:
	-rm -f $(TARGETS) tmp/*

run: all

test: all

lib:
	mkdir lib

lib/vcpu.wasm: src/vcpu.c
	wa-compile -O $? -o $@

lib/bios.bin: src/bios.asm
	nasm -f bin $? -o $@

tmp/worker.js: src/worker.ts src/iomgr.ts src/env.ts src/dev.ts src/vfd.ts
	npx tsc $< -t es2017 --outDir tmp

lib/worker.js: tmp/worker.js
	npx webpack $? -o $@ --mode production

lib/xterm.js: node_modules/xterm/dist/xterm.js
	cp $? $@

lib/xterm.js.map: node_modules/xterm/dist/xterm.js.map
	cp $? $@

lib/xterm.css: node_modules/xterm/dist/xterm.css
	cp $? $@
