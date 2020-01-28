// Runtime Environment for Virtual Playground

import { IOManager } from './iomgr';
import { VPIC, VPIT, UART, RTC, PCI } from './dev';

export type WorkerMessageHandler = (args: { [key: string]: any }) => void;

export interface WorkerInterface {
    print(s: string): void;
    postCommand(cmd: string, data: any): void;
    hasClass(className: string): boolean;
    bind(command: string, handler: WorkerMessageHandler): void;
}

interface RuntimeEnvironmentInterface {
    memoryBase: number;
    memory: WebAssembly.Memory;

    TRAP_NORETURN(): never;
    println(at: number): void;
    vpc_outb(port: number, data: number): void;
    vpc_inb(port: number): number;
    vpc_outw(port: number, data: number): void;
    vpc_inw(port: number): number;
    vpc_outd(port: number, data: number): void;
    vpc_ind(port: number): number;
    vpc_irq(): number;
    vpc_grow(n: number): number;
}

const STATUS_ICEBP = 4;
const STATUS_HALT = 0x1000;
const STATUS_EXCEPTION = 0x10000;

export class RuntimeEnvironment {

    public worker: WorkerInterface;
    public iomgr: IOManager;
    public pic: VPIC;
    public pit: VPIT;
    public uart: UART;
    public rtc: RTC;
    public pci: PCI;

    private period = 0;
    private lastTick: number;
    private env: RuntimeEnvironmentInterface;
    private _memory: Uint8Array;
    private instance?: WebAssembly.Instance;
    private vmem: number = 0;
    private cpu: number = 0;
    private regmap: { [key: string]: number } = {};
    private bios: Uint8Array = new Uint8Array(0);
    private memoryConfig: Uint16Array = new Uint16Array(2);
    private isDebugging: boolean = false;
    private isRunning: boolean = false;
    private speed_status = 0x200000;

    constructor(worker: WorkerInterface) {
        this.worker = worker;
        this.lastTick = new Date().valueOf();
        this.env = {
            memoryBase: 0,
            memory: new WebAssembly.Memory({ initial: 1, maximum: 1030 }),
            // tableBase: 0,
            // table: new WebAssembly.Table({ initial: 2, element: "anyfunc" }),
            TRAP_NORETURN: (): never => {
                throw new Error('UNEXPECTED CONTROL FLOW');
            },
            println: (at: number): void => {
                const str = this.getCString(at);
                worker.print(str);
                // console.log(str);
            },
            vpc_outb: (port: number, data: number): void => this.iomgr.outb(port, data),
            vpc_inb: (port: number): number => this.iomgr.inb(port),
            vpc_outw: (port: number, data: number): void => this.iomgr.outw(port, data),
            vpc_inw: (port: number): number => this.iomgr.inw(port),
            vpc_outd: (port: number, data: number): void => this.iomgr.outd(port, data),
            vpc_ind: (port: number): number => this.iomgr.ind(port),
            vpc_irq: (): number => this.pic.dequeueIRQ(),
            vpc_grow: (n: number): number => {
                const result = this.env.memory.grow(n);
                this._memory = new Uint8Array(this.env.memory.buffer);
                return result;
            },
        }
        this._memory = new Uint8Array(this.env.memory.buffer);

        this.iomgr = new IOManager(worker);
        this.pic = new VPIC(this.iomgr);
        this.pit = new VPIT(this);
        this.rtc = new RTC(this);
        this.pci = new PCI(this);
        // this.uart = new UART(this, 0x3F8, 4);

        this.iomgr.onw(0x0000, undefined, (_) => Math.random() * 65535);
        this.iomgr.on(0x0CF9, (_port, _data) => this.reset(-1));
        this.iomgr.onw(0xFC00, undefined, (_) => this.memoryConfig[0]);
        this.iomgr.onw(0xFC02, undefined, (_) => this.memoryConfig[1]);

        worker.bind('reset', (args) => this.reset(args.gen, args.br_mbr));
    }
    public loadCPU(wasm: WebAssembly.Instance): void {
        this.instance = wasm;
    }
    public fetchBIOS(bios: Uint8Array) {
        this.bios = bios;
    }
    public initMemory(size: number) {
        if (!this.instance) throw new Error('Instance not initialized');
        console.log(`Memory: ${size}KB OK`);
        if (size < 1024) {
            this.memoryConfig = new Uint16Array([size, 0]);
        } else {
            this.memoryConfig = new Uint16Array([640, size - 1024]);
        }
        this.vmem = this.instance.exports._init((size + 1023) / 1024);
        this.loadBIOS();
    }
    public loadBIOS(): void {
        const bios_base = (this.bios[0] | (this.bios[1] << 8)) << 4;
        this.dmaWrite(bios_base, this.bios);
    }
    public setTimer(period: number): void {
        this.period = period;
    }
    public setSound(freq: number): void {
        this.worker.postCommand('beep', freq);
    }
    public emit(to: number, from: Array<number|string>): void {
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
    public dmaWrite(base: number, data: ArrayBuffer): void {
        const a = new Uint8Array(data);
        this._memory.set(a, this.vmem + base);
    }
    public dmaRead(base: number, size: number): Uint8Array {
        const offset = this.vmem + base;
        return this._memory.slice(offset, offset + size);
    }
    public strlen(at: number): number {
        let result = 0;
        for (let i = at; this._memory[i]; i++) {
            result++;
        }
        return result;
    }
    public getCString(at: number): string {
        const len = this.strlen(at);
        const bytes = new Uint8Array(this._memory.buffer, at, len);
        if (this.worker.hasClass('TextDecoder')) {
            return new TextDecoder('utf-8').decode(bytes);
        } else {
            return String.fromCharCode.apply(String, bytes);
        }
    }
    public reset(gen: number, br_mbr: boolean = false): void {
        if (!this.instance) return;
        console.log(`CPU restarted (${gen})`);
        this.loadBIOS();
        this.instance.exports.reset(this.cpu, gen);
        if (br_mbr) {
            this.instance.exports.set_breakpoint(this.cpu, 0, 0x7C00);
        }
        if (!this.isRunning || this.isDebugging) {
            this.isDebugging = false;
            this.isRunning = true;
            this.cont();
        }
    }
    public run(gen: number, br_mbr: boolean = false): void {
        if (!this.instance) throw new Error('Instance not initialized');
        this.cpu = this.instance.exports.alloc_cpu(gen);
        this.regmap = JSON.parse(this.getCString(this.instance.exports.debug_get_register_map(this.cpu)));
        console.log(`CPU started (${gen})`);
        if (br_mbr) {
            this.instance.exports.set_breakpoint(this.cpu, 0, 0x7C00);
        }
        this.isRunning = true;
        this.cont();
    }
    private cont(): void {
        if (!this.instance) return;
        if (this.period > 0) {
            const now = new Date().valueOf();
            for (let expected = this.lastTick + this.period; now >= expected; expected += this.period) {
                this.pic.raiseIRQ(0);
                this.lastTick = expected;
            }
        }
        let status: number;
        try {
            status = this.instance.exports.run(this.cpu, this.speed_status);
        } catch (e) {
            this.isRunning = false;
            console.error(e);
            status = STATUS_EXCEPTION;
            this.worker.print(`#### Exception: ${ e.message }`);
            this.instance.exports.show_regs(this.cpu);
            this.worker.postCommand('debugReaction', {});
        }
        this.dequeueUART();
        if (status >= STATUS_EXCEPTION) {
            this.isRunning = false;
            console.log(`CPU enters to shutdown (${status.toString(16)})`);
        } else if (this.isDebugging || status == STATUS_ICEBP) {
            this.isRunning = false;
            this.isDebugging = true;
            this.instance.exports.show_regs(this.cpu);
            this.worker.postCommand('debugReaction', {});
        } else {
            let timer = 1;
            switch (status) {
                case STATUS_HALT:
                    const now = new Date().valueOf();
                    const expected = this.lastTick + this.period;
                    timer = expected - now;
                    if (timer < 0) timer = 0;
                    break;
                default:
                    // timer = 1;
            }
            setTimeout(() => this.cont(), timer);
        }
    }
    public dequeueUART(): void {
        if (this.uart) {
            const cout = this.uart.dequeueTX();
            if (cout.length > 0) {
                this.worker.print(String.fromCharCode(...cout));
            }
        }
    }
    public step(): void {
        if (!this.instance) return;
        this.dequeueUART();
        this.worker.postCommand('debugReaction', {});
        if (!this.isRunning) {
            let status: number = this.instance.exports.step(this.cpu);
            if (status >= STATUS_EXCEPTION) {
                this.worker.print(`#### Exception Occurred (${status.toString(16)})`);
            }
            this.instance.exports.show_regs(this.cpu);
        } else {
            this.isDebugging = true;
        }
    }
    public stepOver(): void {
        if (!this.instance) return;
        this.dequeueUART();
        this.worker.postCommand('debugReaction', {});
        if (this.instance.exports.prepare_step_over(this.cpu)) {
            this.debugContinue();
        } else if (!this.isRunning) {
            let status: number = this.instance.exports.step(this.cpu);
            if (status >= STATUS_EXCEPTION) {
                this.worker.print(`#### Exception Occurred (${status.toString(16)})`);
            }
            this.instance.exports.show_regs(this.cpu);
        } else {
            this.isDebugging = true;
        }
    }
    public showRegs(): void {
        if (!this.instance) return;
        this.instance.exports.show_regs(this.cpu);
    }
    public showDesc(): void {
        if (!this.instance) return;
        this.instance.exports.dump_regs(this.cpu);
    }
    public debugContinue(): void {
        if (this.isDebugging) {
            this.isRunning = true;
            this.isDebugging = false;
            this.cont();
        }
    }
    public setReg(regName: string, value: number) {
        const reg: number = this.regmap[regName];
        if (!reg) throw new Error(`Unexpected Register Name: ${regName}`);
        let a = new Uint32Array(this.env.memory.buffer, reg, 1);
        a[0] = value;
    }
    public getReg(regName: string): number {
        const reg: number = this.regmap[regName];
        if (!reg) throw new Error(`Unexpected Register Name: ${regName}`);
        let a = new Uint32Array(this.env.memory.buffer, reg, 1);
        return a[0];
    }
    public getSegmentBase(selector: number): number {
        if (!this.instance) return 0;
        return this.instance.exports.debug_get_segment_base(this.cpu, selector);
    }
    public getCanonicalRegName(_token: string): string|null {
        const token = _token.toUpperCase();
        if (Object.keys(this.regmap).indexOf(token) >= 0) {
            return token;
        } else if (token[0] === 'E' && Object.keys(this.regmap).indexOf(token.substr(1)) >= 0) {
            return token.substr(1);
        } else {
            return null;
        }
    }
    public regOrValue(_token: string): number {
        let token = _token.toUpperCase();
        const regName = this.getCanonicalRegName(token);
        if (regName) {
            return this.getReg(regName);
        } else if (token.match(/^([\dABCDEF]+)$/)) {
            return parseInt(token, 16) | 0;
        } else {
            throw new Error('BAD TOKEN');
        }
    }
    public dump(address: number, count: number): number|undefined {
        if (!this.instance) return;
        const addrToHex = (n: number) => ('00000000' + n.toString(16)).substr(-8);
        const toHex = (n: number) => ('00' + n.toString(16)).substr(-2);
        let lines: string[] = [];
        const base = address & 0xFFFFFFF0;
        const bias = address - base;
        const lastCount = ((address + count - 1) & 15) + 1;
        const limit = (count + bias + 15) >> 4;
        const lastLine = limit - 1;
        for (let i = 0; i < limit; i++) {
            const offset = base + i * 16;
            let line = [addrToHex(offset)];
            let chars: string[] = [];
            let j = 0;
            if (i === 0) {
                for (; j < bias; j++) {
                    line.push('  ');
                    chars.push(' ');
                }
            }
            const lc = (i === lastLine) ? lastCount : 16;
            for (; j < lc; j++) {
                const c = this._memory[this.vmem + offset + j];
                line.push(toHex(c));
                if (c >= 0x20 && c < 0x7F) {
                    chars.push(String.fromCharCode(c));
                } else {
                    chars.push('.');
                }
            }
            for (; j < 16; j++) {
                line.push('  ');
                chars.push(' ');
            }
            line.push(chars.join(''));
            lines.push(line.join(' '));
        }
        this.worker.print(lines.join('\n'));
        return address + count;
    }
    public disasm(seg: number, off: number, count: number): number|undefined {
        if (!this.instance) return;
        return this.instance.exports.disasm(this.cpu, seg, off, count);
    }
    public getVramSignature(base: number, size: number): number {
        if (!this.instance) return 0;
        return this.instance.exports.get_vram_signature(base, size);
    }
}
