// Runtime Environment for Virtual Playground

import { IOManager } from './iomgr';
import { VPIC, VPIT, UART, RTC } from './dev';

export interface WorkerInterface {
    print(s: string): void;
    postCommand(cmd: string, data: any): void;
    hasClass(className: string): boolean;
}

export class RuntimeEnvironment {

    public worker: WorkerInterface;
    public iomgr: IOManager;
    public pic: VPIC;
    public pit: VPIT;
    public uart: UART;
    public rtc: RTC;

    private period: number;
    private lastTick: number;
    private env: any;
    private _memory: Uint8Array;
    private instance: WebAssembly.Instance;
    private vmem: number = 0;
    private cpu: number = 0;
    private regmap: { [key: string]: number } = {};
    private bios: Uint8Array = new Uint8Array(0);
    private memoryConfig: Uint16Array = new Uint16Array(2);
    isDebugging: boolean = false;
    isPausing: boolean = false;
    isRunning: boolean = false;

    constructor(worker: WorkerInterface) {
        this.worker = worker;
        this.period = 0;
        this.lastTick = new Date().valueOf();
        this.env = {
            memoryBase: 0,
            memory: new WebAssembly.Memory({ initial: 1, maximum: 1030 }),
            // tableBase: 0,
            // table: new WebAssembly.Table({ initial: 2, element: "anyfunc" }),
        }
        this._memory = new Uint8Array(this.env.memory.buffer);
        this.env.println = (at: number): void => {
            const str = this.getCString(at);
            worker.print(str);
            // console.log(str);
        }
        this.env.vpc_outb = (port: number, data: number): void => this.iomgr.outb(port, data);
        this.env.vpc_inb = (port: number): number => this.iomgr.inb(port);
        this.env.vpc_outw = (port: number, data: number): void => this.iomgr.outw(port, data);
        this.env.vpc_inw = (port: number): number => this.iomgr.inw(port);
        this.env.vpc_outd = (port: number, data: number): void => this.iomgr.outd(port, data);
        this.env.vpc_ind = (port: number): number => this.iomgr.ind(port);
        this.env.vpc_irq = () => this.pic.dequeueIRQ();
        this.env.TRAP_NORETURN = (): never => { throw new Error('UNEXPECTED CONTROL FLOW'); };
        this.env.vpc_grow = (n: number): number => {
            const result = this.env.memory.grow(n);
            this._memory = new Uint8Array(this.env.memory.buffer);
            return result;
        }

        this.iomgr = new IOManager(worker);
        this.pic = new VPIC(this.iomgr);
        this.pit = new VPIT(this);
        this.rtc = new RTC(this);
        this.uart = new UART(this, 0x3F8, 4);

        this.iomgr.onw(0x0000, undefined, (_) => Math.random() * 65535);
        this.iomgr.on(0x0CF9, (_port, _data) => this.reset(-1));
        this.iomgr.onw(0xFC00, undefined, (_) => this.memoryConfig[0]);
        this.iomgr.onw(0xFC02, undefined, (_) => this.memoryConfig[1]);

    }
    public loadCPU(wasm: WebAssembly.Instance): void {
        this.instance = wasm;
    }
    public fetchBIOS(bios: Uint8Array) {
        this.bios = bios;
    }
    public initMemory(size: number) {
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
    public emit(to: number, from: any): void {
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
    public dmaWrite(ptr: number, data: ArrayBuffer): void {
        const a = new Uint8Array(data);
        this._memory.set(a, this.vmem + ptr);
    }
    public dmaRead(ptr: number, size: number): Uint8Array {
        const offset = this.vmem + ptr;
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
    public reset(gen: number): void {
        if (!this.instance) return;
        console.log(`CPU restarted (${gen})`);
        this.loadBIOS();
        this.instance.exports.reset(this.cpu, gen);
        this.isPausing = false;
        if (!this.isRunning || this.isDebugging) {
            this.isDebugging = false;
            this.isRunning = true;
            this.cont();
        }
    }
    public run(gen: number): void {
        this.cpu = this.instance.exports.alloc_cpu(gen);
        this.regmap = JSON.parse(this.getCString(this.instance.exports.debug_get_register_map(this.cpu)));
        console.log(`CPU started (${gen})`);
        this.isRunning = true;
        this.cont();
    }
    public cont(): void {
        const STATUS_MODE_CHANGE = 1;
        const STATUS_ICEBP = 4;
        const STATUS_HALT = 0x1000;
        const STATUS_EXCEPTION = 0x10000;
        if (this.period > 0) {
            const now = new Date().valueOf();
            for (let expected = this.lastTick + this.period; now >= expected; expected += this.period) {
                this.pic.raiseIRQ(0);
                this.lastTick = expected;
            }
        }
        let status: number;
        try {
            status = this.instance.exports.run(this.cpu);
        } catch (e) {
            console.error(e);
            status = STATUS_EXCEPTION;
            this.instance.exports.debug_dump(this.cpu);
        }
        this.dequeueUART();
        if (status >= STATUS_EXCEPTION) {
            this.isRunning = false;
            console.log(`CPU enters to shutdown (${status.toString(16)})`);
        } else if (this.isDebugging || status == STATUS_ICEBP) {
            this.isRunning = false;
            this.isPausing = true;
            this.instance.exports.debug_dump(this.cpu);
        } else {
            let timer = 1;
            switch (status) {
                case STATUS_HALT:
                    const now = new Date().valueOf();
                    const expected = this.lastTick + this.period;
                    timer = expected - now;
                    if (timer < 0) timer = 0;
                    break;
                case STATUS_MODE_CHANGE:
                    const cr0 = this.getReg('CR0');
                    let mode: string[] = [];
                    if (cr0 & 0x80000000) {
                        mode.push('Paged');
                    }
                    if (cr0 & 0x00000001) {
                        mode.push('Protected Mode')
                    } else {
                        mode.push('Real Mode')
                    }
                    console.log(`CPU Mode Change: ${('00000000' + cr0.toString(16)).slice(-8)} ${mode.join(' ')}`);
                    break;
                default:
                    // timer = 1;
            }
            setTimeout(() => this.cont(), timer);
        }
    }
    public dequeueUART(): void {
        const cout = this.uart.dequeueTX();
        if (cout.length > 0) {
            this.worker.print(String.fromCharCode(...cout));
        }
    }
    public nmi(): void {
        if (!this.isRunning || this.isPausing) {
            this.instance.exports.step(this.cpu);
            this.instance.exports.debug_dump(this.cpu);
        } else {
            this.isDebugging = true;
        }
        this.dequeueUART();
    }
    public setReg(regName: string, value: number) {
        const reg: number = this.regmap[regName];
        if (!reg) throw new Error(`Unexpected Regsiter Name: ${regName}`);
        let a = new Uint32Array(this.env.memory.buffer, reg, 1);
        a[0] = value;
    }
    public getReg(regName: string): number {
        const reg: number = this.regmap[regName];
        if (!reg) throw new Error(`Unexpected Regsiter Name: ${regName}`);
        let a = new Uint32Array(this.env.memory.buffer, reg, 1);
        return a[0];
    }
    public dump(base: number): string {
        const addrToHex = (n: number) => ('00000000' + n.toString(16)).substr(-8);
        const toHex = (n: number) => ('00' + n.toString(16)).substr(-2);
        let lines: string[] = [];
        for (let i = 0; i < 16; i++) {
            const offset = base + i * 16;
            let line = [addrToHex(offset)];
            let chars: string[] = [];
            for (let j = 0; j < 16; j++) {
                const c = this._memory[this.vmem + offset + j];
                line.push(toHex(c));
                if (c >= 0x20 && c < 0x7F) {
                    chars.push(String.fromCharCode(c));
                } else {
                    chars.push('.');
                }
            }
            line.push(chars.join(''));
            lines.push(line.join(' '));
        }
        return lines.join('\n');
    }
    private reg_or_value(_token: string): number {
        let token = _token.toUpperCase();
        if (token.length === 3 && token[0] === 'E') {
            token = token.substr(1);
        };
        if (Object.keys(this.regmap).indexOf(token) >= 0) {
            return this.getReg(token);
        } else {
            return parseInt(`0x0${token}`);
        }
    }
    public disasm(seg_off: string, count: number): void {
        const a = seg_off.split(/:/);
        let seg: number, off: number;
        if (a.length == 2) {
            seg = this.reg_or_value(a[0]);
            off = this.reg_or_value(a[1]);
        } else {
            seg = 0;
            off = this.reg_or_value(a[0]);
        }
        this.instance.exports.disasm(this.cpu, seg, off, count);
    }
    public get_vram_signature(base: number, size: number): number {
        return this.instance.exports.get_vram_signature(base, size);
    }
}
