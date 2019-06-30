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
    step(v) {
        return this.wasm.exports.step(v);
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

        it('#8086', () => {
            env.wasm.exports.reset(env.vcpu, 0);
            expect(env.getReg('CS')).toBe(0x0000F000);
            expect(env.getReg('CS.base')).toBe(0x000F0000);
            expect(env.getReg('CS.attr')).toBe(0x0000009B);
            expect(env.getReg('IP')).toBe(0x0000FFF0);
            expect(env.getReg('flags')).toBe(0x0000F002);
            expect(env.getReg('DX') & 0x0F00).toBe(0x0000);
        });

        it('#80186', () => {
            env.wasm.exports.reset(env.vcpu, 1);
            expect(env.getReg('CS')).toBe(0x0000F000);
            expect(env.getReg('CS.base')).toBe(0x000F0000);
            expect(env.getReg('CS.attr')).toBe(0x0000009B);
            expect(env.getReg('IP')).toBe(0x0000FFF0);
            expect(env.getReg('flags')).toBe(0x0000F002);
            expect(env.getReg('DX') & 0x0F00).toBe(0x0100);
        });

        it('#80286', () => {
            env.wasm.exports.reset(env.vcpu, 2);
            expect(env.getReg('CS')).toBe(0x0000F000);
            expect(env.getReg('CS.base')).toBe(0x000F0000);
            expect(env.getReg('CS.attr')).toBe(0x0000009B);
            expect(env.getReg('IP')).toBe(0x0000FFF0);
            expect(env.getReg('flags')).toBe(0x00000002);
            expect(env.getReg('DX') & 0x0F00).toBe(0x0200);
        });

        it('#80386', () => {
            env.wasm.exports.reset(env.vcpu, 3);
            expect(env.getReg('CS')).toBe(0x0000F000);
            expect(env.getReg('CS.base')).toBe(0x000F0000);
            expect(env.getReg('CS.attr')).toBe(0x0000009B);
            expect(env.getReg('IP')).toBe(0x0000FFF0);
            expect(env.getReg('flags')).toBe(0x00000002);
            expect(env.getReg('DX') & 0x0F00).toBe(0x0300);
        });

        it('#80486', () => {
            env.wasm.exports.reset(env.vcpu, 4);
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
            env.wasm.exports.reset(env.vcpu, MAIN_CPU_GEN);
            env.emit(0xFFFF0, new Uint8Array(16));
            env.saveState();
        });

        it('#UD', () => {
            env.emit(0xFFFF0, [0x0F, 0x0B]);
            const result = env.step(env.vcpu);
            expect(result).toBe(0x60000);
            expect(env.getReg('IP')).toBe(0xFFF0);
        });

        it('NOP', () => {
            env.emit(0xFFFF0, [0x90]);
            const result = env.step(env.vcpu);
            expect(result).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('PAUSE', () => {
            env.emit(0xFFFF0, [0xF3, 0x90]);
            const result = env.step(env.vcpu);
            expect(result).toBe(2);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('LOCK (NOP PREFIX)', () => {
            env.emit(0xFFFF0, [0xF0, 0x90]);
            const result = env.step(env.vcpu);
            expect(result).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('FWAIT (NOP)', () => {
            env.emit(0xFFFF0, [0x9B]);
            const result = env.step(env.vcpu);
            expect(result).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('HLT', () => {
            env.emit(0xFFFF0, [0xF4]);
            const result = env.step(env.vcpu);
            expect(result).toBe(1);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('CLI', () => {
            env.emit(0xFFFF0, [0xFA, 0xFA]);
            env.setReg('flags', 0x0202);
            const result1 = env.step(env.vcpu);
            expect(result1).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('flags')).toBe(0x0002);
            const result2 = env.step(env.vcpu);
            expect(result2).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('flags')).toBe(0x0002);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('STI', () => {
            env.emit(0xFFFF0, [0xFB, 0xFB]);
            const result1 = env.step(env.vcpu);
            expect(result1).toBe(3);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('flags')).toBe(0x0202);
            const result2 = env.step(env.vcpu);
            expect(result2).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('flags')).toBe(0x0202);
            expect(env.changed()).toStrictEqual(['IP', 'flags']);
        });

        it('STC', () => {
            env.emit(0xFFFF0, [0xF9, 0xF9]);
            const result1 = env.step(env.vcpu);
            expect(result1).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('flags')).toBe(0x0003);
            const result2 = env.step(env.vcpu);
            expect(result2).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('flags')).toBe(0x0003);
            expect(env.changed()).toStrictEqual(['IP', 'flags']);
        });

        it('CLC', () => {
            env.emit(0xFFFF0, [0xF8, 0xF8]);
            env.setReg('flags', 0x0003);
            const result1 = env.step(env.vcpu);
            expect(result1).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('flags')).toBe(0x0002);
            const result2 = env.step(env.vcpu);
            expect(result2).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('flags')).toBe(0x0002);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('CMC', () => {
            env.emit(0xFFFF0, [0xF5, 0xF5]);
            const result1 = env.step(env.vcpu);
            expect(result1).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('flags')).toBe(0x0003);
            expect(env.changed()).toStrictEqual(['IP', 'flags']);
            const result2 = env.step(env.vcpu);
            expect(result2).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('flags')).toBe(0x0002);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('STD', () => {
            env.emit(0xFFFF0, [0xFD, 0xFD]);
            const result1 = env.step(env.vcpu);
            expect(result1).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('flags')).toBe(0x0402);
            expect(env.changed()).toStrictEqual(['IP', 'flags']);
            const result2 = env.step(env.vcpu);
            expect(result2).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('flags')).toBe(0x0402);
            expect(env.changed()).toStrictEqual(['IP', 'flags']);
        });

        it('CLD', () => {
            env.emit(0xFFFF0, [0xFC, 0xFC]);
            env.setReg('flags', 0x0402);
            const result1 = env.step(env.vcpu);
            expect(result1).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('flags')).toBe(0x0002);
            const result2 = env.step(env.vcpu);
            expect(result2).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('flags')).toBe(0x0002);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('ICEBP', () => {
            env.emit(0xFFFF0, [0xF1]);
            const result = env.step(env.vcpu);
            expect(result).toBe(4);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('SETALC', () => {
            env.emit(0xFFFF0, [0xD6]);
            const result = env.step(env.vcpu);
            expect(result).toBe(0x60000);
            // expect(env.getReg('IP')).toBe(0xFFF1);
        });

        it('JMP FAR', () => {
            env.emit(0xFFFF0, [0xEA, 0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0]);
            const result = env.step(env.vcpu);
            expect(result).toBe(0);
            expect(env.getReg('CS')).toBe(0x7856);
            expect(env.getReg('CS.base')).toBe(0x00078560);
            expect(env.getReg('IP')).toBe(0x3412);
            expect(env.changed()).toStrictEqual(['CS', 'CS.base', 'IP']);
        });

        it('JMP FAR32', () => {
            env.emit(0xFFFF0, [0x66, 0xEA, 0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0]);
            const result = env.step(env.vcpu);
            expect(result).toBe(0);
            expect(env.getReg('CS')).toBe(0xBC9A);
            expect(env.getReg('CS.base')).toBe(0x000BC9A0);
            expect(env.getReg('IP')).toBe(0x78563412);
            expect(env.changed()).toStrictEqual(['CS', 'CS.base', 'IP']);
        });

        it('JMP SHORT', () => {
            env.emit(0xFFFF0, [0xEB, 0xEE, 0x12, 0x34, 0x56, 0x78]);
            const result = env.step(env.vcpu);
            expect(result).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFE0);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('JMP NEAR', () => {
            env.emit(0xFFFF0, [0xE9, 0xED, 0xFF, 0x12, 0x34, 0x56, 0x78]);
            const result = env.step(env.vcpu);
            expect(result).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFE0);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('JMP NEAR32', () => {
            env.emit(0xFFFF0, [0x66, 0xE9, 0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0]);
            const result = env.step(env.vcpu);
            expect(result).toBe(0);
            expect(env.getReg('IP')).toBe(0x78573408);
            expect(env.changed()).toStrictEqual(['IP']);
        });

        it('LAHF', () => {
            env.emit(0xFFFF0, [0x9F]);
            env.setReg('AX', 0x12345678);
            env.saveState();
            const result = env.step(env.vcpu);
            expect(result).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('AX')).toBe(0x12340278);
            expect(env.changed()).toStrictEqual(['AX','IP']);
        });

        it('SAHF', () => {
            env.emit(0xFFFF0, [0x9E, 0x9E]);
            env.setReg('AX', 0xFFFF);
            env.saveState();
            const result1 = env.step(env.vcpu);
            expect(result1).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF1);
            expect(env.getReg('flags')).toBe(0x00000000D7);
            expect(env.changed()).toStrictEqual(['IP','flags']);
            env.setReg('AX', 0);
            env.saveState();
            const result2 = env.step(env.vcpu);
            expect(result2).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('flags')).toBe(0x000000002);
            expect(env.changed()).toStrictEqual(['IP','flags']);
        });

        it('MOV reg8, imm8', () => {
            env.emit(0xFFFF0, [0xB0, 0x55, 0xB4, 0xAA]);
            env.setReg('AX', 0x12345678);
            env.saveState();
            const result1 = env.step(env.vcpu);
            expect(result1).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF2);
            expect(env.getReg('AX')).toBe(0x12345655);
            expect(env.changed()).toStrictEqual(['AX','IP']);
            const result2 = env.step(env.vcpu);
            expect(result2).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF4);
            expect(env.getReg('AX')).toBe(0x1234AA55);
            expect(env.changed()).toStrictEqual(['AX','IP']);
        });

        it('MOV reg16, imm16', () => {
            env.emit(0xFFFF0, [0xB8, 0x55, 0xAA, 0xBE, 0x12, 0x34]);
            env.setReg('AX', 0x12345678);
            env.setReg('SI', 0xFEDCBA98);
            env.saveState();
            const result1 = env.step(env.vcpu);
            expect(result1).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF3);
            expect(env.getReg('AX')).toBe(0x1234AA55);
            expect(env.changed()).toStrictEqual(['AX','IP']);
            env.saveState();
            const result2 = env.step(env.vcpu);
            expect(result1).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF6);
            expect(env.getReg('SI')).toBe(0xFEDC3412);
            expect(env.changed()).toStrictEqual(['IP','SI']);
        });

        it('MOV reg32, imm32', () => {
            env.emit(0xFFFF0, [0x66, 0xBB, 0x12, 0x34, 0x56, 0x78]);
            const result1 = env.step(env.vcpu);
            expect(result1).toBe(0);
            expect(env.getReg('IP')).toBe(0xFFF6);
            expect(env.getReg('BX')).toBe(0x78563412);
            expect(env.changed()).toStrictEqual(['BX','IP']);
        });

    });

});
