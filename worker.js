'use strict';

const sab_index_sleep = 0;
const sab_index_key = 1;
const sab_index_inport = 2;

const writeTerminal = (message) => {
    postMessage({command: 'write', data: message });
};

// Worker I/O Manager
class WorkerIOManager {
    constructor () {
        this.outHandlers = [];
        this.inHandlers = [];
        this.ioRedirectMap = new Uint32Array(2048);
    }
    on(port, callback, callback2 = null) {
        this.outHandlers[port & 0xFFFF] = callback;
        this.inHandlers[port & 0xFFFF] = callback2;
    }
    isRedirectRequired (port) {
        return (this.ioRedirectMap[port >> 5] & (1 << (port & 31))) != 0;
    }
    outb (port, data) {
        try {
            const handler = this.outHandlers[port & 0xFFFF];
            if (handler) {
                if (!handler(port, data | 0)) return;
            }
        } catch (e) {
            console.error('worker_outb()', e);
        }
        if (this.isRedirectRequired(port)) {
            postMessage({command: 'outb', data: { port: port, data: data }});
        }
    }
    inb (port) {
        const handler = this.outHandlers[port & 0xFFFF];
        if (handler) {
            return handler(port);
        } else {
            return 0xFF | 0;
        }
    }
}
const iomgr = new WorkerIOManager();


class iPITDevice {
    constructor (iomgr) {
        this.cntModes = new Uint8Array(3);
        this.cntPhases = new Uint8Array(3);
        this.cntValues = new Uint8Array(6);
        this.p0061_data = 0;

        // timer #0 value
        iomgr.on(0x40, (port, data) => this.onCount(port, data));
        iomgr.on(0x41, (port, data) => this.onCount(port, data));
        iomgr.on(0x42, (port, data) => this.onCount(port, data));
        // ctl
        iomgr.on(0x43, (port, data) => {
            const counter = (data >> 6) & 3;
            const format = (data >> 4) & 3;
            // const mode = (data >> 1) & 7;
            // const bcd = data & 1;
            if (counter < 3 && format > 0) {
                this.cntModes[counter] = data;
                this.cntPhases[counter] = 0;
                this.cntValues[counter * 2] = 0;
                this.cntValues[counter * 2 + 1] = 0;
                this.noteOff();
            }
            return false;
        });
        // misc i/o
        iomgr.on(0x61, (port, data) => {
            const old_data = this.p0061_data;
            this.p0061_data = data;
            const chg_value = old_data ^ data;
            if (chg_value & 0x02){
                if (data & 0x02){
                    this.noteOn();
                }else{
                    this.noteOff();
                }
            }
            return false;
        }, (port) => this.p0061_data);
    }
    onCount (port, data) {
        const counter = port & 3;
        if (this.cntPhases[counter] != 1) {
            this.cntValues[counter * 2] = data;
            this.cntPhases[counter] = 1;
        } else {
            this.cntValues[counter * 2 + 1] = data;
            this.cntPhases[counter] = 0;
            if (counter == 2 && (this.p0061_data & 0x02)){
                this.noteOn();
            }
        }
        return false;
    }
    noteOn() {
        let count_value = this.cntValues[4] + (this.cntValues[5] * 256);
        if (!count_value) count_value = 0x10000;
        const freq = 1193181 / count_value;
        postMessage({command: 'beep', data: freq});
    }
    noteOff() {
        postMessage({command: 'beep', data: 0});
    }
}
const timer = new iPITDevice(iomgr);


class RuntimeEnvironment {
    constructor() {
        this.env = {
            memoryBase: 0,
            tableBase: 0,
            table: new WebAssembly.Table({ initial: 2, element: "anyfunc" }),
            memory: new WebAssembly.Memory({ initial: 257 }),
        }
        this._memory = new Uint8Array(this.env.memory.buffer);
        this.env.println = (at) => {
            const str = this.getCString(at);
            writeTerminal(`${str}\n`);
        }
        this.env.vpc_putc = (c) => {
            writeTerminal(String.fromCharCode(c));
        }
        this.env.vpc_readKey = () => {
            const sab = new Int32Array(this._sab);
            return Atomics.exchange(sab, sab_index_key, 0);
        }
        // const usleep = async us => await new Promise(resolve => setTimeout(resolve, us));
        this.env.vpc_wait = (us) => {
            const sab = new Int32Array(this._sab);
            Atomics.wait(sab, sab_index_key, 0, us);
        }
        this.env.vpc_outb = (port, data) => iomgr.outb(port, data);
        this.env.vpc_inb = (port) => iomgr.inb(port);
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
}

const env = new RuntimeEnvironment();

console.log('Loading CPU...');
fetch('./lib/vcpu.wasm')
    .then(res => {
        if (!res.ok) { throw Error(res.statusText); }
        return res.arrayBuffer()
    })
    .then(buffer => WebAssembly.instantiate(buffer, env))
    .then(wasm => {
        env.instance = wasm.instance;
        env.vmem = env.instance.exports._init();
        console.log('Loading BIOS...');
        return fetch('./lib/bios.bin');
    })
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
    .then(buffer => {
        const bios = new Uint8Array(buffer);
        const bios_base = (bios[0] | (bios[1] << 8)) << 4;
        env.emit(bios_base, bios);
        postMessage({command: 'loaded'});
    })
    .catch(reason => {
        console.error(reason);
        writeTerminal(reason.toString())
    });

onmessage = e => {
    switch (e.data.command) {
        case 'start':
            env._sab = e.data.sab;
            iomgr.ioRedirectMap = e.data.ioRedirectMap;
            setTimeout(() => {
                console.log('CPU started');
                env.instance.exports.run(1);
                console.log('CPU halted');
            }, 10);
            break;
        default:
            console.log('worker.onmessage', e.data);
        }
}
