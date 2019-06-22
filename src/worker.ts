// Virtual Playground Worker

'use strict';

import { RuntimeEnvironment, WorkerInterface } from './env';
import { IOManager } from './iomgr';
import { VPIC, VPIT, UART } from './dev';
import { VFD } from './vfd';

const ctx: Worker = self as any;
class WI implements WorkerInterface {
    print(s: string): void {
        this.postCommand('write', s);
    }
    postCommand(cmd: string, data: any): void {
        ctx.postMessage({command: cmd, data: data});
    }
}

const wi = new WI();
const iomgr = new IOManager(wi);
const pic = new VPIC(iomgr);
const env = new RuntimeEnvironment(iomgr, pic, wi);
const pit = new VPIT(iomgr, env);
const uart = new UART(iomgr, 0x3F8, pic, wi);
const floppy = new VFD(iomgr, env);

(async function() {
    console.log('Loading CPU...');
    await fetch('./vcpu.wasm')
        .then(res => {
            if (!res.ok) { throw Error(res.statusText); }
            return res.arrayBuffer()
        })
        .then(buffer => WebAssembly.instantiate(buffer, env))
        .then(wasm => {
            env.instance = wasm.instance;
            env.vmem = env.instance.exports._init();
        })
    
    console.log('Loading BIOS...');
    await fetch('./bios.bin')
        .then(res => {
            if (!res.ok) { throw Error(res.statusText); }
            return res.blob()
        })
        .then(blob => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve(reader.result);
                };
                reader.readAsArrayBuffer(blob);
            });
        })
        .then((buffer: ArrayBuffer) => {
            const bios = new Uint8Array(buffer);
            const bios_base = (bios[0] | (bios[1] << 8)) << 4;
            env.dmaWrite(bios_base, bios);
        })

    wi.postCommand('loaded', null);
})();
// .catch(reason => {
//     console.error(reason);
//     wi.print(reason.toString())
// });

const start = async (imageName: string) => {
    if (imageName) {
        console.log(`Loading image (${imageName})...`);
        await fetch(imageName)
            .then(res => {
                if (!res.ok) { throw Error(res.statusText); }
                return res.blob()
            })
            .then(blob => {
                return new Promise((resolve, reject) => {
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

    env.run(1);
};

onmessage = e => {
    switch (e.data.command) {
        case 'start':
            iomgr.ioRedirectMap = e.data.ioRedirectMap;
            setTimeout(() => start(e.data.imageName), 10);
            break;
        case 'key':
            uart.onRX(e.data.data);
            break
        case 'nmi':
            env.nmi();
            break;
        case 'dump':
            env.dump(e.data.address);
            break;
        default:
            console.log('worker.onmessage', e.data);
    }
}
