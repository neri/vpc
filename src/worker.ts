// Virtual Playground Worker

'use strict';

import { RuntimeEnvironment, WorkerInterface } from './env';
import { VFD } from './vfd';
import { MPU401 } from './midi';

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
const floppy = new VFD(env);
const midi = new MPU401(env, 0x330);

(async function() {
    console.log('Loading CPU...');
    await fetch('./vcpu.wasm')
        .then(res => {
            if (!res.ok) { throw Error(res.statusText); }
            return res.arrayBuffer()
        })
        .then(buffer => WebAssembly.instantiate(buffer, env))
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

const loadImage = async (imageName: string) => {
    console.log(`Loading image (${imageName})...`);
    return fetch(imageName)
        .then(res => {
            if (!res.ok) { throw Error(res.statusText); }
            return res.blob()
        })
        .then(blob => {
            return new Promise((resolve, _) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve(reader.result);
                };
                reader.readAsArrayBuffer(blob);
            });
        })
        .then((buffer: ArrayBuffer) => {
            floppy.attachImage(buffer);
        })
        .catch(reason => console.error(reason));
}

const start = async (gen: number, imageName: string) => {
    if (imageName) {
        await loadImage(imageName);
    }
    env.run(gen);
};

const readRegRQ = (regName: string) => {
    const value = env.getReg(regName);
    wi.postCommand('regResult', ('00000000' + value.toString(16)).slice(-8));
}

onmessage = e => {
    switch (e.data.command) {
        case 'start':
            env.initMemory(e.data.mem);
            env.iomgr.ioRedirectMap = e.data.ioRedirectMap;
            setTimeout(() => start(e.data.gen, e.data.imageName), 10);
            break;
        case 'reset':
            env.reset(e.data.gen);
            break;
        case 'key':
            env.uart.onRX(e.data.data);
            break
        case 'nmi':
            env.nmi();
            readRegRQ(e.data.regName);
            break;
        case 'readReg':
            readRegRQ(e.data.regName);
            break;
        case 'dump':
            env.dump(e.data.address);
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
