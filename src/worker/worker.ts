// Virtual Playground Worker
'use strict';

import { RuntimeEnvironment, WorkerInterface, WorkerMessageHandler } from './env';
import { PS2 } from './ps2';
import { VGA } from './vga';
import { VFD } from './vfd';
import { MPU401 } from './mpu';
import { Debugger } from './debug';

const ctx: Worker = self as any;
class WI implements WorkerInterface {
    private dispatchTable: { [key: string]: WorkerMessageHandler } = {}

    constructor() {
        ctx.onmessage = e => this.dispatch(e.data.command, e.data);

        this.bind('start', (args) => {
            env.initMemory(args.mem);
            env.iomgr.ioRedirectMap = args.ioRedirectMap;
            if (args.midi) {
                (self as any).midi = new MPU401(env, 0x330);
            }
            setTimeout(() => env.run(args.gen), 100);
        });

        (async function() {
            console.log('Loading CPU...');
            await fetch('./vcpu.wasm')
                .then(res => {
                    if (!res.ok) { throw Error(res.statusText); }
                    return res.arrayBuffer()
                })
                .then(buffer => WebAssembly.instantiate(buffer, env as any))
                .then(wasm => env.loadCPU(wasm.instance))
            
            console.log('Loading BIOS...');
            await fetch('./bios.bin')
                .then(res => {
                    if (!res.ok) { throw Error(res.statusText); }
                    return res.blob()
                })
                .then(blob => {
                    return new Promise(resolve => {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            resolve(reader.result);
                        };
                        reader.readAsArrayBuffer(blob);
                    });
                })
                .then((buffer: ArrayBuffer) => {
                    const bios = new Uint8Array(buffer);
                    env.fetchBIOS(bios);
                })
        
            wi.postCommand('loaded', null);
        })();

    }

    print(s: string): void {
        this.postCommand('write', s);
    }
    postCommand(cmd: string, data: any): void {
        ctx.postMessage({command: cmd, data: data});
    }
    hasClass(className: string): boolean {
        return (typeof ctx[className] === 'function');
    }
    bind(command: string, handler: WorkerMessageHandler): void {
        if (this.dispatchTable[command]) {
            throw new Error(`bind: Conflict dispatch table for ${command}`);
        } else {
            this.dispatchTable[command] = handler;
        }
    }

    private dispatch(command: string, args: { [key: string]: any }) {
        const handler = this.dispatchTable[command];
        if (handler) {
            handler(args);
        } else {
            console.error('worker.onmessage', command, args);
        }
    }
}

const wi = new WI();
const env = new RuntimeEnvironment(wi);
(self as any).env = env;
(self as any).ps2 = new PS2(env);
(self as any).floppy = new VFD(env);
(self as any).vga = new VGA(env);
(self as any).db = new Debugger(wi, env);
