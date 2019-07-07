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
    private vmem: number;
    private cpu: number;
    private regmap: Object;
    private bios: Uint8Array;
    private memoryConfig: Uint16Array;
    isDebugging: boolean;
    isPausing: boolean;
    isRunning: boolean;

    private vgaCheck: number;

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
        this.env.println = (at: number) => {
            const str = this.getCString(at);
            console.log(str);
        }
        this.env.vpc_outb = (port: number, data: number) => this.iomgr.outb(port, data);
        this.env.vpc_inb = (port: number) => this.iomgr.inb(port);
        this.env.vpc_outw = (port: number, data: number) => this.iomgr.outw(port, data);
        this.env.vpc_inw = (port: number) => this.iomgr.inw(port);
        this.env.vpc_irq = () => this.pic.dequeueIRQ();
        this.env.TRAP_NORETURN = () => { throw new Error('UNEXPECTED CONTROL FLOW'); };
        this.env.vpc_grow = (n: number) => {
            const result = this.env.memory.grow(n);
            this._memory = new Uint8Array(this.env.memory.buffer);
            return result;
        }

        this.iomgr = new IOManager(worker);
        this.pic = new VPIC(this.iomgr);
        this.pit = new VPIT(this);
        this.rtc = new RTC(this);
        this.uart = new UART(this, 0x3F8, 4);

        this.iomgr.onw(0, null, (_) => Math.random() * 65535);
        this.iomgr.onw(0xFC00, null, (_) => this.memoryConfig[0]);
        this.iomgr.onw(0xFC02, null, (_) => this.memoryConfig[1]);
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
            return String.fromCharCode.call(String, bytes);
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
        if (this.period > 0) {
            const now = new Date().valueOf();
            for (let expected = this.lastTick + this.period; now >= expected; expected += this.period) {
                this.pic.raiseIRQ(0);
                this.lastTick = expected;
            }
        }
        const status: number = this.instance.exports.run(this.cpu);
        if (status > 1) {
            this.isRunning = false;
            console.log(`CPU halted (${status})`);
        } else if (this.isDebugging) {
            this.instance.exports.debug_dump(this.cpu);
            this.isPausing = true;
        } else {
            let timer: number;
            if (status > 0) {
                const now = new Date().valueOf();
                const expected = this.lastTick + this.period;
                timer = expected - now;
                if (timer < 0) timer = 0;
            } else {
                timer = 1;
            }
            setTimeout(() => this.cont(), timer);
        }
    }
    public nmi(): void {
        if (!this.isRunning || this.isPausing) {
            this.instance.exports.step(this.cpu);
            this.instance.exports.debug_dump(this.cpu);
        } else {
            this.isDebugging = true;
        }
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
    public dump(base: number): void {
        const addrToHex = (n: number) => ('000000' + n.toString(16)).substr(-6);
        const toHex = (n: number) => ('00' + n.toString(16)).substr(-2);
        let lines = [];
        for (let i = 0; i < 16; i++) {
            const offset = base + i * 16;
            let line = [addrToHex(offset)];
            let chars = [];
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
        console.log(lines.join('\n'));
    }
    // public vga_render(): void {
    //     const newValue = this.instance.exports.vram_check();
    //     if (this.vgaCheck != newValue) {
    //         this.vgaCheck = newValue;
    //         const v: number = this.instance.exports.qvga_render();
    //         // const a = this._memory.slice(v, v + 320 * 200 * 4);
    //         const a = new Uint8Array(this._memory.buffer, v, 320 * 200 * 4);
    //         this.worker.postCommand('vga', a);
    //     }
    // }
}
