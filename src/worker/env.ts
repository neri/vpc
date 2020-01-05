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

const STATUS_EXCEPTION = 0x10000;
export class RuntimeEnvironment {

    public worker: WorkerInterface;
    public iomgr: IOManager;
    public pic: VPIC;
    public pit: VPIT;
    public uart: UART;
    public rtc: RTC;
    public pci: PCI;

    private period: number;
    private lastTick: number;
    private env: any;
    private _memory: Uint8Array;
    private instance: WebAssembly.Instance | undefined;
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
        this.pci = new PCI(this);
        // this.uart = new UART(this, 0x3F8, 4);

        this.iomgr.onw(0x0000, undefined, (_) => Math.random() * 65535);
        this.iomgr.on(0x0CF9, (_port, _data) => this.reset(-1));
        this.iomgr.onw(0xFC00, undefined, (_) => this.memoryConfig[0]);
        this.iomgr.onw(0xFC02, undefined, (_) => this.memoryConfig[1]);

        worker.bind('reset', (args) => this.reset(args.gen));
        worker.bind('nmi', (_) => this.NMI());
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
        if (!this.isRunning || this.isDebugging) {
            this.isDebugging = false;
            this.isRunning = true;
            this.cont();
        }
    }
    public run(gen: number): void {
        if (!this.instance) throw new Error('Instance not initialized');
        this.cpu = this.instance.exports.alloc_cpu(gen);
        this.regmap = JSON.parse(this.getCString(this.instance.exports.debug_get_register_map(this.cpu)));
        console.log(`CPU started (${gen})`);
        this.isRunning = true;
        this.cont();
    }
    private cont(): void {
        if (!this.instance) return;
        const STATUS_ICEBP = 4;
        if (this.period > 0) {
            const now = new Date().valueOf();
            for (let expected = this.lastTick + this.period; now >= expected; expected += this.period) {
                this.pic.raiseIRQ(0);
                this.lastTick = expected;
            }
        }
        let status: number;
        // const time0 = Date.now();
        try {
            status = this.instance.exports.run(this.cpu, this.speed_status);
        } catch (e) {
            console.error(e);
            status = STATUS_EXCEPTION;
            this.instance.exports.debug_dump(this.cpu);
        }
        // const diff = Date.now() - time0;
        // this.speed_status = (diff < 5) ? 1 : -1;
        this.dequeueUART();
        if (status >= STATUS_EXCEPTION) {
            this.isRunning = false;
            console.log(`CPU enters to shutdown (${status.toString(16)})`);
        } else if (this.isDebugging || status == STATUS_ICEBP) {
            this.isRunning = false;
            this.isDebugging = true;
            this.instance.exports.debug_dump(this.cpu);
        } else {
            let timer = 1;
            switch (status) {
                case 0x1000:
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
    public NMI(): void {
        if (!this.instance) return;
        if (!this.isRunning) {
            let status: number = this.instance.exports.step(this.cpu);
            if (status >= STATUS_EXCEPTION) {
                this.worker.print(`#### Exception Occurred (${status.toString(16)})`);
            }
            this.instance.exports.debug_dump(this.cpu);
        } else {
            this.isDebugging = true;
        }
        this.dequeueUART();
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
    public regOrValue(_token: string): number {
        let token = _token.toUpperCase();
        if (Object.keys(this.regmap).indexOf(token) >= 0) {
            return this.getReg(token);
        } else if (token[0] === 'E' && Object.keys(this.regmap).indexOf(token.substr(1)) >= 0) {
            return this.getReg(token.substr(1));
        } else if (token.match(/^([\dABCDEF]+)$/)) {
            return parseInt(`0x0${token}`) | 0;
        } else {
            throw new Error('BAD TOKEN');
        }
    }
    public dump(seg_off: string): void {
        if (!this.instance) return;
        const a = seg_off.split(/:/);
        let seg: number, off: number;
        if (a.length == 2) {
            seg = this.regOrValue(a[0]);
            off = this.regOrValue(a[1]);
        } else {
            seg = 0;
            off = this.regOrValue(a[0]);
        }
        const base: number = this.instance.exports.debug_get_segment_base(this.cpu, seg) + off;
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
        this.worker.print(lines.join('\n'));
    }
    public disasm(seg_off: string, count: number): void {
        if (!this.instance) return;
        const a = seg_off.split(/:/);
        let seg: number, off: number;
        if (a.length == 2) {
            seg = this.regOrValue(a[0]);
            off = this.regOrValue(a[1]);
        } else {
            seg = this.getReg('CS');
            off = this.regOrValue(a[0]);
        }
        this.instance.exports.disasm(this.cpu, seg, off, count);
    }
    public getVramSignature(base: number, size: number): number {
        if (!this.instance) return 0;
        return this.instance.exports.get_vram_signature(base, size);
    }
}
