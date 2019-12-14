// Virtual Playground Worker
'use strict';

import { RuntimeEnvironment, WorkerInterface } from './env';
import { PS2 } from './ps2';
import { VGA } from './vga';
import { VFD } from './vfd';
import { MPU401 } from './mpu';

const ctx: Worker = self as any;
class WI implements WorkerInterface {
    print(s: string): void {
        this.postCommand('write', s);
    }
    postCommand(cmd: string, data: any): void {
        ctx.postMessage({command: cmd, data: data});
    }
    hasClass(className: string): boolean {
        return (typeof ctx[className] === 'function');
    }
}

const wi = new WI();
const env = new RuntimeEnvironment(wi);
const ps2 = new PS2(env);
const floppy = new VFD(env);
const vga = new VGA(env);
let midi: MPU401;
(self as any).env = env;
(self as any).ps2 = ps2;

(async function() {
    // wi.print('Loading CPU...\n');
    console.log('Loading CPU...');
    await fetch('./vcpu.wasm')
        .then(res => {
            if (!res.ok) { throw Error(res.statusText); }
            return res.arrayBuffer()
        })
        .then(buffer => WebAssembly.instantiate(buffer, env as any))
        .then(wasm => env.loadCPU(wasm.instance))
    
    // wi.print('Loading BIOS...\n');
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

onmessage = e => {
    switch (e.data.command) {
        case 'start':
            env.initMemory(e.data.mem);
            env.iomgr.ioRedirectMap = e.data.ioRedirectMap;
            if (e.data.midi) {
                midi = new MPU401(env, 0x330);
            }
            setTimeout(() => env.run(e.data.gen), 100);
            break;
        case 'reset':
            env.reset(e.data.gen);
            break;
        case 'key':
            ps2.onKey(e.data.data);
            break
        case 'nmi':
            env.nmi();
            break;
        case 'cont':
            env.debugContinue();
            break;
        case 'dump':
            wi.postCommand('devWrite', env.dump(e.data.address));
            break;
        case 'disasm':
            env.disasm(e.data.range[0], e.data.range[1]);
            break;
        case 'attach':
            try {
                floppy.attachImage(e.data.blob);
            } catch (e) {
                wi.postCommand('alert', e.toString());
            }
            break;
        default:
            console.log('worker.onmessage', e.data);
    }
}
