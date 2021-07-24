.PHONY: all clean run test

TARGETS := lib/vcpu.wasm lib/bios.bin lib/worker.js

all: lib $(TARGETS)

clean:
	-rm -f $(TARGETS) tmp/*

run: all

test: all
	npm test

lib:
	mkdir lib

lib/vcpu.wasm: src/vcpu.c src/disasm.h
	wa-compile -O $< -o $@

lib/bios.bin: src/bios.asm
	nasm -f bin $? -o $@

tmp/worker.js: src/worker/worker.ts src/worker/iomgr.ts src/worker/env.ts src/worker/dev.ts src/worker/vfd.ts src/worker/ps2.ts src/worker/vga.ts src/worker/mpu.ts src/worker/debug.ts
	npx tsc $< --outDir ./tmp

lib/worker.js: ./tmp/worker.js
	npx webpack ./tmp/worker.js -o ./lib/ --mode production
	mv lib/main.js lib/worker.js
