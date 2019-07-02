'use strict';

const expect= require('expect');
const fs = require('fs');

const WASM_PATH = './lib/vcpu.wasm';
const MAIN_CPU_GEN = 4;


class RuntimeEnvironment {
    constructor () {
        this.env = {
            memoryBase: 0,
            memory: new WebAssembly.Memory({ initial: 1, maximum: 1024 }),
        }
        this.env.println = (at) => {
            const str = this.getCString(at);
            console.log(str);
        }
        this.env.vpc_outb = (port, data) => { throw new Error('UNEXPECTED CONTROL FLOW'); };
        this.env.vpc_inb = (port) => { throw new Error('UNEXPECTED CONTROL FLOW'); };
        this.env.vpc_outw = (port, data) => { throw new Error('UNEXPECTED CONTROL FLOW'); };
        this.env.vpc_inw = (port) => { throw new Error('UNEXPECTED CONTROL FLOW'); };
        this.env.vpc_irq = () => { throw new Error('UNEXPECTED CONTROL FLOW'); };
        this.env.TRAP_NORETURN = () => { throw new Error('UNEXPECTED CONTROL FLOW'); };
        this.env.vpc_grow = (n) => {
            const result = this.env.memory.grow(n);
            this._memory = new Uint8Array(this.env.memory.buffer);
            return result;
        }
    }
    strlen(at) {
        let result = 0;
        for (let i = at; this._memory[i]; i++) {
            result++;
        }
        return result;
    }
    getCString(at) {
        const len = this.strlen(at);
        const bytes = new Uint8Array(this._memory.buffer, at, len);
        return new TextDecoder('utf-8').decode(bytes);
    }
    emit(to, from) {
        const l = from.length;
        let p = this.vmem + to;
        for (let i = 0; i < l; i++) {
            const v = from[i];
            if (typeof(v) === 'string') {
                for (let j = 0; j < v.length; j++) {
                    this._memory[p] = v.charCodeAt(j);
                    p++;
                }
            } else if (typeof(v) === 'number') {
                this._memory[p] = v;
                p++;
            } else {
                throw `Unexpected type ${typeof(v)}`;
            }
        }
    }
    emitTest(object) {
        this.emit(0xFFFF0, object);
    }
    reset(n = -1) {
        return this.wasm.exports.reset(this.vcpu, n);
    }
    step() {
        return this.wasm.exports.step(this.vcpu);
    }
    dump() {
        this.wasm.exports.debug_dump(env.vcpu);
    }
    setReg(name, value) {
        const reg = this.regmap[name];
        if (!reg) throw new Error(`Unexpected Regsiter Name: ${name}`);
        let a = new Uint32Array(this.env.memory.buffer, reg, 1);
        a[0] = value;
    }
    getReg(name) {
        const reg = this.regmap[name];
        if (!reg) throw new Error(`Unexpected Regsiter Name: ${name}`);
        let a = new Uint32Array(this.env.memory.buffer, reg, 1);
        return a[0];
    }
    getAllRegs() {
        let result = {};
        Object.keys(env.regmap).forEach(name => {
            result[name] = this.getReg(name);
        });
        return result;
    }
    saveState() {
        this.savedState = this.getAllRegs();
    }
    changed() {
        let result = [];
        const newState = this.getAllRegs();
        Object.keys(env.regmap).forEach(name => {
            if (this.savedState[name] !== newState[name]) {
                result.push(name);
            }
        });
        return result.sort();
    }
}
const env = new RuntimeEnvironment();

const prepare = async () => {
    return new Promise(resolve => resolve(fs.readFileSync(WASM_PATH)))
    .then(response => WebAssembly.instantiate(new Uint8Array(response), env))
    .then(result => {
        env.wasm = result.instance
        env.vmem = env.wasm.exports._init(1);
        env.vcpu = env.wasm.exports.alloc_cpu(4);
        env.regmap = JSON.parse(env.getCString(env.wasm.exports.debug_get_register_map(env.vcpu)));
        // console.log(env.regmap);
    });
}

describe('CPU', () => {

    describe('Initial State', () => {
        it('Prepare', done => {
            prepare().then(() => done()).catch(reason => done(reason))
        });

        it('RESET', () => {
            env.setReg('CS', 0x12345678);
            env.setReg('IP', 0x12345678);
            env.reset(0);
            expect(env.getReg('CS')).toBe(0x0000F000);
            expect(env.getReg('CS.base')).toBe(0x000F0000);
            expect(env.getReg('CS.attr')).toBe(0x0000009B);
            expect(env.getReg('IP')).toBe(0x0000FFF0);
        });

        it('#8086', () => {
            env.reset(0);
            expect(env.getReg('CS')).toBe(0x0000F000);
            expect(env.getReg('CS.base')).toBe(0x000F0000);
            expect(env.getReg('CS.attr')).toBe(0x0000009B);
            expect(env.getReg('IP')).toBe(0x0000FFF0);
            expect(env.getReg('flags')).toBe(0x0000F002);
            expect(env.getReg('DX') & 0x0F00).toBe(0x0000);
        });

        it('#80186', () => {
            env.reset(1);
            expect(env.getReg('CS')).toBe(0x0000F000);
            expect(env.getReg('CS.base')).toBe(0x000F0000);
            expect(env.getReg('CS.attr')).toBe(0x0000009B);
            expect(env.getReg('IP')).toBe(0x0000FFF0);
            expect(env.getReg('flags')).toBe(0x0000F002);
            expect(env.getReg('DX') & 0x0F00).toBe(0x0100);
        });

        it('#80286', () => {
            env.reset(2);
            expect(env.getReg('CS')).toBe(0x0000F000);
            expect(env.getReg('CS.base')).toBe(0x000F0000);
            expect(env.getReg('CS.attr')).toBe(0x0000009B);
            expect(env.getReg('IP')).toBe(0x0000FFF0);
            expect(env.getReg('flags')).toBe(0x00000002);
            expect(env.getReg('DX') & 0x0F00).toBe(0x0200);
        });

        it('#80386', () => {
            env.reset(3);
            expect(env.getReg('CS')).toBe(0x0000F000);
            expect(env.getReg('CS.base')).toBe(0x000F0000);
            expect(env.getReg('CS.attr')).toBe(0x0000009B);
            expect(env.getReg('IP')).toBe(0x0000FFF0);
            expect(env.getReg('flags')).toBe(0x00000002);
            expect(env.getReg('DX') & 0x0F00).toBe(0x0300);
        });

        it('#80486', () => {
            env.reset(4);
            expect(env.getReg('CS')).toBe(0x0000F000);
            expect(env.getReg('CS.base')).toBe(0x000F0000);
            expect(env.getReg('CS.attr')).toBe(0x0000009B);
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

        it('FWAIT (NOP)', () => {
            env.emitTest([0x9B]);
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('HLT', () => {
            env.emitTest([0xF4]);
            expect(env.step()).toBe(1);
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

        it('SETALC', () => {
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
            env.emitTest([0x9E, 0x9E]);
            env.setReg('AX', 0xFFFF);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('flags')).toBe(0x00000000D7);
            expect(env.changed()).toStrictEqual(['IP','flags']);

            env.setReg('AX', 0);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('flags')).toBe(0x000000002);
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
            expect(env.step()).toBe(0);
            expect(env.getReg('CS')).toBe(0xBC9A);
            expect(env.getReg('CS.base')).toBe(0x000BC9A0);
            expect(env.getReg('IP')).toBe(0x78563412);
            expect(env.changed()).toStrictEqual(['CS', 'CS.base', 'IP']);
        });


        it('JO d8', () => {
            env.emitTest([0x70, 0xAA]);
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

        it('JC d8', () => {
            env.emitTest([0x72, 0x55]);
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

        it('JZ d8', () => {
            env.emitTest([0x74, 0x12]);
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

        it('JS d8', () => {
            env.emitTest([0x78, 0x56]);
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
            env.emitTest([0x01, 0xCB, 0x01, 0xDA, 0x81, 0xC3, 0x9A, 0x78]);

            env.setReg('BX', 0x56781234);
            env.setReg('CX', 0x12345678);
            env.setReg('DX', 0x5555AAAA);
            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('BX')).toBe(0x567868AC);
            expect(env.getReg('flags')).toBe(0x0006);
            expect(env.changed()).toStrictEqual(['BX','IP','flags']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF4);
            expect(env.getReg('DX')).toBe(0x55551356);
            expect(env.getReg('flags')).toBe(0x0017);
            expect(env.changed()).toStrictEqual(['DX','IP','flags']);

            env.saveState();
            expect(env.step()).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF8);
            expect(env.getReg('BX')).toBe(0x5678E146);
            expect(env.getReg('flags')).toBe(0x0892);
            expect(env.changed()).toStrictEqual(['BX','IP','flags']);
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

    });

});
