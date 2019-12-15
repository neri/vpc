'use strict';

const expect= require('expect');
const fs = require('fs');
const MinimalRuntimeEnvironment = require('./mre');

const WASM_PATH = './lib/vcpu.wasm';
const MAIN_CPU_GEN = 4;
const env = new MinimalRuntimeEnvironment();

const prepare = async () => {
    return new Promise(resolve => resolve(fs.readFileSync(WASM_PATH)))
    .then(response => env.instantiate(response, 1, MAIN_CPU_GEN));
}

describe('CPU', () => {

    describe('Initial State', () => {
        it('Prepare', done => {
            prepare().then(() => done()).catch(reason => done(reason))
        });

        it('RESET', () => {
            env.setReg('CS', 0x12345678);
            env.setReg('IP', 0x12345678);
            expect(env.getReg('IP')).toBe(0x12345678);
            env.reset(0);
            expect(env.getReg('CS')).toBe(0x0000F000);
            expect(env.getReg('CS.base')).toBe(0x000F0000);
            expect(env.getReg('CS.attr')).toBe(0x0000009B);
            expect(env.getReg('CS.limit')).toBe(0x0000FFFF);
            expect(env.getReg('IP')).toBe(0x0000FFF0);
        });

        it('#8086', () => {
            env.reset(0);
            expect(env.getReg('CS')).toBe(0x0000F000);
            expect(env.getReg('CS.base')).toBe(0x000F0000);
            expect(env.getReg('CS.attr')).toBe(0x0000009B);
            expect(env.getReg('CS.limit')).toBe(0x0000FFFF);
            expect(env.getReg('IP')).toBe(0x0000FFF0);
            expect(env.getReg('flags')).toBe(0x0000F002);
            expect(env.getReg('DX') & 0x0F00).toBe(0x0000);
        });

        it('#80186', () => {
            env.reset(1);
            expect(env.getReg('CS')).toBe(0x0000F000);
            expect(env.getReg('CS.base')).toBe(0x000F0000);
            expect(env.getReg('CS.attr')).toBe(0x0000009B);
            expect(env.getReg('CS.limit')).toBe(0x0000FFFF);
            expect(env.getReg('IP')).toBe(0x0000FFF0);
            expect(env.getReg('flags')).toBe(0x0000F002);
            expect(env.getReg('DX') & 0x0F00).toBe(0x0100);
        });

        it('#80286', () => {
            env.reset(2);
            expect(env.getReg('CS')).toBe(0x0000F000);
            expect(env.getReg('CS.base')).toBe(0x000F0000);
            expect(env.getReg('CS.attr')).toBe(0x0000009B);
            expect(env.getReg('CS.limit')).toBe(0x0000FFFF);
            expect(env.getReg('IP')).toBe(0x0000FFF0);
            expect(env.getReg('flags')).toBe(0x00000002);
            expect(env.getReg('DX') & 0x0F00).toBe(0x0200);
        });

        it('#80386', () => {
            env.reset(3);
            expect(env.getReg('CS')).toBe(0x0000F000);
            expect(env.getReg('CS.base')).toBe(0x000F0000);
            expect(env.getReg('CS.attr')).toBe(0x0000009B);
            expect(env.getReg('CS.limit')).toBe(0x0000FFFF);
            expect(env.getReg('IP')).toBe(0x0000FFF0);
            expect(env.getReg('flags')).toBe(0x00000002);
            expect(env.getReg('DX') & 0x0F00).toBe(0x0300);
        });

        it('#80486', () => {
            env.reset(4);
            expect(env.getReg('CS')).toBe(0x0000F000);
            expect(env.getReg('CS.base')).toBe(0x000F0000);
            expect(env.getReg('CS.attr')).toBe(0x0000009B);
            expect(env.getReg('CS.limit')).toBe(0x0000FFFF);
            expect(env.getReg('IP')).toBe(0x0000FFF0);
            expect(env.getReg('flags')).toBe(0x00000002);
            expect(env.getReg('DX') & 0x0F00).toBe(0x0400);
        });
    });

    describe('Simple Instructions', () => {
        beforeEach(() => {
            env.reset(MAIN_CPU_GEN);
            env.emitTest(new Uint8Array(16));
            env.saveState();
        });

        it('#UD', () => {
            env.emitTest([0x0F, 0x0B]);
            expect(env.step()).toBe(0x60000);
            expect(env.getReg('IP')).toBe(0xFFF0);
        });

        it('NOP regular', () => {
            env.emitTest([0x90]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('NOP (PAUSE)', () => {
            env.emitTest([0xF3, 0x90]);
            expect(env.step()).toBe(2);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('NOP (PREFIX)', () => {
            env.emitTest([0x26, 0x90, 0x2E, 0x90, 0x36, 0x90, 0x3E, 0x90, 0xF0, 0x90]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF4);
            expect(env.changed()).toStrictEqual(['IP']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF6);
            expect(env.changed()).toStrictEqual(['IP']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF8);
            expect(env.changed()).toStrictEqual(['IP']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFFA);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.emitTest([0x64, 0x90, 0x65, 0x90, 0xF2, 0x90, 0x66, 0x90, 0x67, 0x90]);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF4);
            expect(env.changed()).toStrictEqual(['IP']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF6);
            expect(env.changed()).toStrictEqual(['IP']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF8);
            expect(env.changed()).toStrictEqual(['IP']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFFA);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        // it('FWAIT (NOP)', () => {
        //     env.emitTest([0x9B]);
        //     expect(env.step()).toBe(0);
        //     expect(env.getReg('IP')).toBe(0xFFF1);
        //     expect(env.changed()).toStrictEqual(['IP']);
        // });

        it('HLT', () => {
            env.emitTest([0xF4]);
            expect(env.step()).toBe(0x1000);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('CLI', () => {
            env.emitTest([0xFA, 0xFA]);
            env.setReg('flags', 0x0202);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('flags')).toBe(0x0002);

            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('flags')).toBe(0x0002);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('STI', () => {
            env.emitTest([0xFB, 0xFB]);
            expect(env.step()).toBe(3);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('flags')).toBe(0x0202);

            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('flags')).toBe(0x0202);
            expect(env.changed()).toStrictEqual(['IP', 'flags']);
        });

        it('STC', () => {
            env.emitTest([0xF9, 0xF9]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('flags')).toBe(0x0003);

            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('flags')).toBe(0x0003);
            expect(env.changed()).toStrictEqual(['IP', 'flags']);
        });

        it('CLC', () => {
            env.emitTest([0xF8, 0xF8]);
            env.setReg('flags', 0x0003);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('flags')).toBe(0x0002);

            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('flags')).toBe(0x0002);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('CMC', () => {
            env.emitTest([0xF5, 0xF5]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('flags')).toBe(0x0003);
            expect(env.changed()).toStrictEqual(['IP', 'flags']);

            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('flags')).toBe(0x0002);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('STD', () => {
            env.emitTest([0xFD, 0xFD]);

            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('flags')).toBe(0x0402);
            expect(env.changed()).toStrictEqual(['IP', 'flags']);

            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('flags')).toBe(0x0402);
            expect(env.changed()).toStrictEqual(['IP', 'flags']);
        });

        it('CLD', () => {
            env.emitTest([0xFC, 0xFC]);
            env.setReg('flags', 0x0402);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('flags')).toBe(0x0002);

            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('flags')).toBe(0x0002);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('ICEBP', () => {
            env.emitTest([0xF1]);
            expect(env.step()).toBe(4);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('SETALC (#UD)', () => {
            env.emitTest([0xD6]);
            expect(env.step()).toBe(0x60000);
            // expect(env.getReg('IP')).toBe(0xFFF1);
        });

        it('LAHF', () => {
            env.emitTest([0x9F]);
            env.setReg('AX', 0x12345678);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('AX')).toBe(0x12340278);
            expect(env.changed()).toStrictEqual(['AX','IP']);
        });

        it('SAHF', () => {
            env.emitTest([0x9E]);
            env.setReg('flags', 0x00AA);
            env.setReg('AX', 0xFFFF);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('flags')).toBe(0x00D7);
            expect(env.changed()).toStrictEqual(['IP','flags']);

            env.reset();
            env.setReg('flags', 0x0FAA);
            env.setReg('AX', 0);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('flags')).toBe(0x0F02);
            expect(env.changed()).toStrictEqual(['IP','flags']);
        });


        it('JMP SHORT', () => {
            env.emitTest([0xEB, 0xEE, 0x12, 0x34, 0x56, 0x78]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFE0);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('JMP NEAR', () => {
            env.emitTest([0xE9, 0xED, 0xFF, 0x12, 0x34, 0x56, 0x78]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFE0);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('JMP NEAR32', () => {
            env.emitTest([0x66, 0xE9, 0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0x78573408);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('JMP FAR', () => {
            env.emitTest([0xEA, 0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0]);
            expect(env.step()).toBe(0);
            expect(env.getReg('CS')).toBe(0x7856);
            expect(env.getReg('CS.base')).toBe(0x00078560);
            expect(env.getReg('IP')).toBe(0x3412);
            expect(env.changed()).toStrictEqual(['CS', 'CS.base', 'IP']);
        });

        it('JMP FAR32', () => {
            env.emitTest([0x66, 0xEA, 0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0]);
            expect(env.step()).toBe(0xD0000);

            env.reset();
            env.setReg('CS.limit', 0xFFFFFFFF);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('CS')).toBe(0xBC9A);
            expect(env.getReg('CS.base')).toBe(0x000BC9A0);
            expect(env.getReg('IP')).toBe(0x78563412);
            expect(env.changed()).toStrictEqual(['CS', 'CS.base', 'IP']);
        });


        it('JO', () => {
            env.emitTest([0x70, 0xAA]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0xFFFFF7FF);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0x0802);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFF9C);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('JNO', () => {
            env.emitTest([0x71, 0xAA]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFF9C);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0xFFFFF7FF);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFF9C);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0x0802);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('JC/JB', () => {
            env.emitTest([0x72, 0x55]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0xFFFFFFFE);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0x0003);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0x0047);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('JNC/JNB', () => {
            env.emitTest([0x73, 0x55]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0x0047);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0xFFFFFFFE);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0x0047);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0x0003);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('JZ/JE', () => {
            env.emitTest([0x74, 0x12]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0xFFFFFFBF);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0x0042);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0x0004);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('JNZ/JNE', () => {
            env.emitTest([0x75, 0x12]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0x0004);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0xFFFFFFBF);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0x0004);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0x0042);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('JBE/JNA', () => {
            env.emitTest([0x76, 0x34]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0xFFFFFFBE);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0x0003);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0x0026);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0x0042);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0x0026);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0x0043);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0x0026);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('JA', () => {
            env.emitTest([0x77, 0x34]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0x0026);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0xFFFFFFBE);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0x0026);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0x0003);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0x0042);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0x0043);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('JS', () => {
            env.emitTest([0x78, 0x56]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0xFFFFFF7F);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0x0082);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0x0048);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('JNS', () => {
            env.emitTest([0x79, 0x56]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0x0048);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0xFFFFFF7F);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0x0048);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0x0082);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('JP/JPE', () => {
            env.emitTest([0x7A, 0x78]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0xFFFFFFFB);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0x0006);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0x006A);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('JNP/JPO', () => {
            env.emitTest([0x7B, 0x78]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0x006A);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0xFFFFFFFB);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0x006A);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0x0006);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('JL', () => {
            env.emitTest([0x7C, 0x96]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0xFFFFF77F);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0x0882);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0xFFFFFFFF);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0x0082);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFF88);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0x0802);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFF88);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('JNL', () => {
            env.emitTest([0x7D, 0x96]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFF88);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0xFFFFF77F);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFF88);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0x0882);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFF88);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0xFFFFFFFF);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFF88);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0x0082);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);

            env.reset();
            env.setReg('flags', 0x0802);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);
        });


        it('LOOP d8', () => {
            env.emitTest([0xE2, 0xAA, 0xE2, 0xAA]);
            env.setReg('CX', 0x0001);
            env.saveState();

            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('CX')).toBe(0x0000);
            expect(env.changed()).toStrictEqual(['CX','IP']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFF9E);
            expect(env.getReg('CX')).toBe(0xFFFF);
            expect(env.changed()).toStrictEqual(['CX','IP']);
        });


        it('MOV reg8, imm8', () => {
            env.emitTest([0xB0, 0x55, 0xB4, 0xAA]);
            env.setReg('AX', 0x12345678);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('AX')).toBe(0x12345655);
            expect(env.changed()).toStrictEqual(['AX','IP']);

            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF4);
            expect(env.getReg('AX')).toBe(0x1234AA55);
            expect(env.changed()).toStrictEqual(['AX','IP']);
        });

        it('MOV reg16, imm16', () => {
            env.emitTest([0xB9, 0x55, 0xAA, 0xBE, 0x12, 0x34]);
            env.setReg('CX', 0x12345678);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF3);
            expect(env.getReg('CX')).toBe(0x1234AA55);
            expect(env.changed()).toStrictEqual(['CX','IP']);

            env.setReg('SI', 0xFEDCBA98);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF6);
            expect(env.getReg('SI')).toBe(0xFEDC3412);
            expect(env.changed()).toStrictEqual(['IP','SI']);
        });

        it('MOV reg32, imm32', () => {
            env.emitTest([0x66, 0xBB, 0x12, 0x34, 0x56, 0x78, 0x66, 0xBF, 0x19, 0x2A, 0x3B, 0x4C]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF6);
            expect(env.getReg('BX')).toBe(0x78563412);
            expect(env.changed()).toStrictEqual(['BX','IP']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFFC);
            expect(env.getReg('DI')).toBe(0x4C3B2A19);
            expect(env.changed()).toStrictEqual(['DI','IP']);
        });

        it ('INC reg16', () => {
            env.emitTest([0x45, 0x45, 0x46, 0x46]);
            env.setReg('BP', 0xFFFFFFFF);
            env.saveState();

            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('BP')).toBe(0xFFFF0000);
            expect(env.getReg('flags')).toBe(0x0056);
            expect(env.changed()).toStrictEqual(['BP','IP','flags']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('BP')).toBe(0xFFFF0001);
            expect(env.getReg('flags')).toBe(0x0002);
            expect(env.changed()).toStrictEqual(['BP','IP','flags']);

            env.setReg('SI', 0xFFFFFFFF);
            env.setReg('flags', 0x0003);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF3);
            expect(env.getReg('SI')).toBe(0xFFFF0000);
            expect(env.getReg('flags')).toBe(0x0057);
            expect(env.changed()).toStrictEqual(['IP','SI','flags']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF4);
            expect(env.getReg('SI')).toBe(0xFFFF0001);
            expect(env.getReg('flags')).toBe(0x0003);
            expect(env.changed()).toStrictEqual(['IP','SI','flags']);

        });

        it ('DEC reg16', () => {
            env.emitTest([0x4A, 0x4A, 0x49, 0x49]);
            env.setReg('DX', 0x12340000);
            env.saveState();

            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('DX')).toBe(0x1234FFFF);
            expect(env.getReg('flags')).toBe(0x0096);
            expect(env.changed()).toStrictEqual(['DX','IP','flags']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('DX')).toBe(0x1234FFFE);
            expect(env.getReg('flags')).toBe(0x0082);
            expect(env.changed()).toStrictEqual(['DX','IP','flags']);

            env.setReg('CX', 0x56780000);
            env.setReg('flags', 0x0003);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF3);
            expect(env.getReg('CX')).toBe(0x5678FFFF);
            expect(env.getReg('flags')).toBe(0x0097);
            expect(env.changed()).toStrictEqual(['CX','IP','flags']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF4);
            expect(env.getReg('CX')).toBe(0x5678FFFE);
            expect(env.getReg('flags')).toBe(0x0083);
            expect(env.changed()).toStrictEqual(['CX','IP','flags']);
        });

    });

    describe('Complex Instructions', () => {
        beforeEach(() => {
            env.reset(MAIN_CPU_GEN);
            env.emitTest(new Uint8Array(16));
            env.saveState();
        });

        it('MOV modr/m', () => {
            env.emitTest([0x89, 0xD8, 0x8B, 0xC3, 0x66, 0x89, 0xD8]);

            env.setReg('AX', 0x12345678);
            env.setReg('BX', 0xFEDCBA98);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('AX')).toBe(0x1234BA98);
            expect(env.changed()).toStrictEqual(['AX','IP']);

            env.setReg('AX', 0x12345678);
            env.setReg('BX', 0xFEDCBA98);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF4);
            expect(env.getReg('AX')).toBe(0x1234BA98);
            expect(env.changed()).toStrictEqual(['AX','IP']);

            env.setReg('AX', 0x12345678);
            env.setReg('BX', 0xFEDCBA98);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF7);
            expect(env.getReg('AX')).toBe(0xFEDCBA98);
            expect(env.changed()).toStrictEqual(['AX','IP']);

        });

        it('MOVZX/MOVSX', () => {
            env.emitTest([0x66, 0x0F, 0xB7, 0xC3, 0x66, 0x0F, 0xBF, 0xC3]);

            env.setReg('AX', 0x12345678);
            env.setReg('BX', 0xFEDCBA98);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF4);
            expect(env.getReg('AX')).toBe(0x0000BA98);
            expect(env.changed()).toStrictEqual(['AX','IP']);

            env.setReg('AX', 0x12345678);
            env.setReg('BX', 0xFEDCBA98);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF8);
            expect(env.getReg('AX')).toBe(0xFFFFBA98);
            expect(env.changed()).toStrictEqual(['AX','IP']);
        });

        it ('NOT', () => {
            env.emitTest([0xF6, 0xD1, 0xF6, 0xD1, 0xF6, 0xD6, 0xF7, 0xD5, 0x66, 0xF7, 0xD6]);
            env.setReg('CX', 0x123456FF);
            env.setReg('DX', 0x12345678);
            env.setReg('BP', 0x123455AA);
            env.setReg('SI', 0x12345678);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('CX')).toBe(0x12345600);
            expect(env.changed()).toStrictEqual(['CX','IP']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF4);
            expect(env.getReg('CX')).toBe(0x123456FF);
            expect(env.changed()).toStrictEqual(['CX','IP']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF6);
            expect(env.getReg('DX')).toBe(0x1234A978);
            expect(env.changed()).toStrictEqual(['DX','IP']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF8);
            expect(env.getReg('BP')).toBe(0x1234AA55);
            expect(env.changed()).toStrictEqual(['BP','IP']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFFB);
            expect(env.getReg('SI')).toBe(0xEDCBA987);
            expect(env.changed()).toStrictEqual(['IP','SI']);
        });

        it ('NEG', () => {
            env.emitTest([0xF6, 0xD9, 0xF6, 0xDE, 0xF6, 0xDA, 0xF7, 0xD9, 0xF7, 0xDD]);
            env.setReg('CX', 0x55555555);
            env.setReg('DX', 0x12340080);
            env.setReg('BP', 0x00008000);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('CX')).toBe(0x555555AB);
            expect(env.getReg('flags')).toBe(0x0093);
            expect(env.changed()).toStrictEqual(['CX','IP','flags']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF4);
            expect(env.getReg('flags')).toBe(0x0046);
            expect(env.changed()).toStrictEqual(['IP','flags']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF6);
            expect(env.getReg('flags')).toBe(0x0883);
            expect(env.changed()).toStrictEqual(['IP','flags']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF8);
            expect(env.getReg('CX')).toBe(0x5555AA55);
            expect(env.getReg('flags')).toBe(0x0097);
            expect(env.changed()).toStrictEqual(['CX','IP','flags']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFFA);
            expect(env.getReg('flags')).toBe(0x0887);
            expect(env.changed()).toStrictEqual(['IP','flags']);

            env.reset();
            env.emitTest([0x66, 0xF7, 0xDE, 0x66, 0xF7, 0xDF]);
            env.setReg('SI', 0x12345678);
            env.setReg('DI', 0x80000000);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF3);
            expect(env.getReg('SI')).toBe(0xEDCBA988);
            expect(env.getReg('flags')).toBe(0x0097);
            expect(env.changed()).toStrictEqual(['IP','SI','flags']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF6);
            expect(env.getReg('flags')).toBe(0x0887);
            expect(env.changed()).toStrictEqual(['IP','flags']);
        });

        it ('ADD', () => {
            env.emitTest([0x00, 0xCD, 0x00, 0xEE, 0x00, 0xF1, 0x02, 0xCD, 0x01, 0xD1]);

            env.setReg('flags', 0x0003);
            env.setReg('CX', 0x12345678);
            env.setReg('DX', 0x11111111);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('CX')).toBe(0x1234CE78);
            expect(env.getReg('flags')).toBe(0x0882);
            expect(env.changed()).toStrictEqual(['CX','IP','flags']);

            env.setReg('flags', 0x0003);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF4);
            expect(env.getReg('DX')).toBe(0x1111DF11);
            expect(env.getReg('flags')).toBe(0x0082);
            expect(env.changed()).toStrictEqual(['DX','IP','flags']);

            env.setReg('flags', 0x0003);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF6);
            expect(env.getReg('CX')).toBe(0x1234CE57);
            expect(env.getReg('flags')).toBe(0x0013);
            expect(env.changed()).toStrictEqual(['CX','IP','flags']);

            env.setReg('flags', 0x0003);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF8);
            expect(env.getReg('CX')).toBe(0x1234CE25);
            expect(env.getReg('flags')).toBe(0x0013);
            expect(env.changed()).toStrictEqual(['CX','IP','flags']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFFA);
            expect(env.getReg('CX')).toBe(0x1234AD36);
            expect(env.getReg('flags')).toBe(0x0087);
            expect(env.changed()).toStrictEqual(['CX','IP','flags']);

        });

        it ('OR', () => {
            env.emitTest([0x09, 0xFE]);

            env.setReg('SI', 0x55555555);
            env.setReg('DI', 0xAAAAAAAA);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('SI')).toBe(0x5555FFFF);
            expect(env.getReg('flags')).toBe(0x0086);
            expect(env.changed()).toStrictEqual(['IP','SI','flags']);

        });

        it ('XOR', () => {
            env.emitTest([0x31, 0xC0, 0x66, 0x31, 0xC0]);
            env.setReg('AX', 0x55555555);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('AX')).toBe(0x55550000);
            expect(env.getReg('flags')).toBe(0x0046);
            expect(env.changed()).toStrictEqual(['AX','IP','flags']);

            env.setReg('flags', 0x08C7);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF5);
            expect(env.getReg('AX')).toBe(0);
            expect(env.getReg('flags')).toBe(0x0046);
            expect(env.changed()).toStrictEqual(['AX','IP','flags']);
        });

        it ('IDIV', () => {
            env.emitTest([0xF7, 0xFB, 0x66, 0xF7, 0xFB]);

            env.setReg('AX', 0x87654321);
            env.setReg('BX', 0x00000100);
            env.setReg('DX', 0x00000000);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('AX')).toBe(0x87650043);
            expect(env.getReg('DX')).toBe(0x00000021);
            expect(env.changed()).toStrictEqual(['AX','DX','IP']);

            env.setReg('AX', 0x01000000);
            env.setReg('BX', 0x00100000);
            env.setReg('DX', 0x00000000);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF5);
            expect(env.getReg('AX')).toBe(0x10);
            expect(env.changed()).toStrictEqual(['AX','IP']);

        });

        it ('SHRD', () => {
            env.emitTest([0x66, 0x0F, 0xAC, 0xD0, 0x10]);

            env.setReg('AX', 0x9ABCDEF0);
            env.setReg('DX', 0x12345678);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF5);
            expect(env.getReg('AX')).toBe(0x56789ABC);
            expect(env.getReg('flags')).toBe(0x0003);
            expect(env.changed()).toStrictEqual(['AX','IP','flags']);

        });
    });

    describe('Stack Operations', () => {
        const stackTop = 0x8000;
        const stackSize = 32;

        beforeEach(() => {
            env.reset(MAIN_CPU_GEN);
            env.setReg('SP', stackTop);
            env.emit(stackTop - stackSize, new Uint8Array(stackSize * 2));
            env.emitTest(new Uint8Array(16));
            env.saveState();
        });

        it('PUSH reg', () => {
            env.emitTest([0x50, 0x66, 0x50]);
            env.setReg('AX', 0x12345678);
            env.saveState();

            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('SP')).toBe(stackTop - 2);
            expect(env.changed()).toStrictEqual(['IP','SP']);

            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF3);
            expect(env.getReg('SP')).toBe(stackTop - 6);
            expect(env.changed()).toStrictEqual(['IP','SP']);
        });
    });

    describe('Protected Mode', () => {
        const stackTop = 0x8000;
        const stackSize = 32;

        beforeEach(() => {
            env.reset(MAIN_CPU_GEN);
            env.setReg('SP', stackTop);
            env.emit(stackTop - stackSize, new Uint8Array(stackSize * 2));
            env.emitTest(new Uint8Array(16));
            env.saveState();
        });

        it('GDT', () => {
            env.emitTest([0x0F, 0x01, 0x17]);
            env.setReg('AX', 0x12345678);
            env.saveState();

        });
    });

});
