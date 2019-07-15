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

lib/vcpu.wasm: src/vcpu.c
	wa-compile -O $? -o $@

lib/bios.bin: src/bios.asm
	nasm -f bin $? -o $@

tmp/worker.js: src/worker.ts src/iomgr.ts src/env.ts src/dev.ts src/vfd.ts src/ps2.ts src/vga.ts src/mpu.ts
	npx tsc $< -t es2017 --strictNullChecks --outDir tmp

lib/worker.js: tmp/worker.js
	npx webpack $? -o $@ --mode production
