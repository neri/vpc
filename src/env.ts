// Runtime Environment for Virtual Playground

import { IOManager } from './iomgr';
import { VPIC } from './dev';

export interface WorkerInterface {
    print(s: string): void;
    postCommand(cmd: string, data: any): void;
}

export class RuntimeEnvironment {
    period: number;
    lastTick: number;
    env: any;
    _memory: Uint8Array;
    instance: WebAssembly.Instance;
    vmem: number;
    cpu: number;
    iomgr: IOManager;
    pic: VPIC;
    worker: WorkerInterface;
    constructor(iomgr: IOManager, pic: VPIC, worker: WorkerInterface) {
        this.worker = worker;
        this.iomgr = iomgr;
        this.pic = pic;
        this.period = 0;
        this.lastTick = new Date().valueOf();
        this.env = {
            memoryBase: 0,
            memory: new WebAssembly.Memory({ initial: 257 }),
            // tableBase: 0,
            // table: new WebAssembly.Table({ initial: 2, element: "anyfunc" }),
        }
        this._memory = new Uint8Array(this.env.memory.buffer);
        this.env.println = (at: number) => {
            const str = this.getCString(at);
            worker.print(`${str}\n`);
        }
        this.env.vpc_outb = (port: number, data: number) => this.iomgr.outb(port, data);
        this.env.vpc_inb = (port: number) => this.iomgr.inb(port);
        this.env.vpc_irq = () => pic.checkIRQ();
    }
    public setTimer(period: number): void {
        this.period = period;
    }
    public setSound(freq: number): void {
        this.worker.postCommand('beep', freq);
    }
    public emit(to: number, from: Uint8Array): void {
        const l = from.length;
        let p = this.vmem + to;
        for (let i = 0; i < l; i++) {
            const v = from[i];
            this._memory[p] = v;
            p++;
        }
        // for (let i = 0; i < l; i++) {
        //     const v = from[i];
        //     if (typeof(v) === 'string') {
        //         for (let j = 0; j < v.length; j++) {
        //             this._memory[p] = v.charCodeAt(j);
        //             p++;
        //         }
        //     } else if (typeof(v) === 'number') {
        //         this._memory[p] = v;
        //         p++;
        //     } else {
        //         throw `Unexpected type ${typeof(v)}`;
        //     }
        // }
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
        return new TextDecoder('utf-8').decode(bytes);
    }
    public run(gen: number): void {
        this.cpu = this.instance.exports.alloc_cpu(gen);
        console.log(`CPU started (${gen})`);
        this.cont();
    }
    public cont(): void {
        if (this.period) {
            const now = new Date().valueOf();
            const expected = this.lastTick + this.period;
            if (now > expected) {
                this.pic.raiseIRQ(0);
            }
            this.lastTick = new Date().valueOf();
        }
        const status = this.instance.exports.run(this.cpu);
        if (status) {
            console.log(`CPU halted (${status})`);
        } else {
            const now = new Date().valueOf();
            const expected = this.lastTick + this.period;
            let timer = expected - now;
            if (timer < 1) timer = 1;
            setTimeout(() => this.cont(), timer);
        }
    }
}
