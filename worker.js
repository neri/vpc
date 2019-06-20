'use strict';

const sab_index_sleep = 0;
const sab_index_timer = 1;
const sab_index_key = 2;

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
        const handler = this.inHandlers[port & 0xFFFF];
        if (handler) {
            return handler(port);
        } else {
            return 0xFF | 0;
        }
    }
}
const iomgr = new WorkerIOManager();


/**
 * Programmable Interrupt Controller
*/
class PIC {
    constructor (iomgr) {
        this.irq = [];
        this.phase = [0, 0];
        this.IMR = new Uint8Array([0xFF, 0xFF]);
        this.IRR = new Uint8Array(2);
        this.ISR = new Uint8Array(2);
        this.ICW = new Uint8Array(8);

        const writeOCR = (port, data) => {
            if (data & 0x10) { // ICW1
                this.phase[port] = 1;
                this.ICW[port * 4] = data;
            } else if (data == 0x20) { // normal EOI
                for (let i = 0; i < 8; i++) {
                    const mask = (1 << i);
                    if (this.ISR[port] & mask) {
                        this.ISR[port] &= ~mask;
                        this.setNextIRQ(port);
                        break;
                    }
                }
            } else {
                // TODO:
            }
        }
        const readOCR = (port) => {
            // TODO:
            return 0;
        }
        const writeIMR = (port, data) => {
            const phase = this.phase[port] || 0;
            if (phase > 0 && phase < 4) { // ICW2-4
                this.ICW[port * 4 + phase] = data;
                if (phase < 4) {
                    this.phase[port] = 1 + phase;
                } else {
                    this.phase[port] = 0;
                }
            } else {
                this.IMR[port] = data;
            }
        }
        const readIMR = (port) => {
            return this.IMR[port];
        }

        iomgr.on(0x20, (port, data) => writeOCR(0, data), (port) => readOCR(0));
        iomgr.on(0x21, (port, data) => writeIMR(0, data), (port) => readIMR(0));
        iomgr.on(0xA0, (port, data) => writeOCR(1, data), (port) => readOCR(1));
        iomgr.on(0xA1, (port, data) => writeIMR(1, data), (port) => readIMR(1));
    }
    setNextIRQ(port) {
        if (this.irq.length) return;
        for (let i = 0; i < 8; i++) {
            const mask = (1 << i);
            if (this.ISR[port] & mask) break;
            if ((this.IRR[port] & mask) && (this.IMR[port] & mask) == 0) {
                this.IRR[port] &= ~mask;
                this.ISR[port] |= mask;
                const vector = this.ICW[port * 4 + 1];
                this.irq.push(vector);
            }
        }
    }
    raiseIRQ(n) {
        if (n < 8) {
            this.IRR[0] |= (1 << n);
            this.setNextIRQ(0);
        } else if (n < 16) {
            this.IRR[1] |= (1 << (n - 8));
            this.IRR[0] |= this.ICW[2];
            this.setNextIRQ(1);
        }
    }
    checkIRQ() {
        const result = this.irq.shift();
        return result || 0;
    }
}
const pic = new PIC(iomgr);


/**
 * Programmable Interval Timer
 * Timer and Sound
 */
class PIT {
    constructor (iomgr) {
        this.cntModes = new Uint8Array(3);
        this.cntPhases = new Uint8Array(3);
        this.cntValues = new Uint8Array(6);
        this.p0061_data = 0;

        const onCount = (counter, data) => {
            if (this.cntPhases[counter] != 1) {
                this.cntValues[counter * 2] = data;
                this.cntPhases[counter] = 1;
            } else {
                this.cntValues[counter * 2 + 1] = data;
                this.cntPhases[counter] = 0;
                switch (counter) {
                    case 0:
                        this.setTimer();
                        break;
                    case 2:
                        if (this.p0061_data & 0x02) {
                            this.noteOn();
                        }
                        break;
                }
            }
            return false;
        }
    
        iomgr.on(0x40, (port, data) => onCount(0, data));
        iomgr.on(0x41, (port, data) => onCount(1, data));
        iomgr.on(0x42, (port, data) => onCount(2, data));
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
                switch (counter) {
                    case 0:
                        this.clearTimer();
                        break;
                    case 2:
                        this.noteOff();
                        break;
                }
            }
            return false;
        });
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
    noteOn() {
        const freq = 1193181 / this.getCounter(2);
        postMessage({command: 'beep', data: freq});
    }
    noteOff() {
        postMessage({command: 'beep', data: 0});
    }
    getCounter(counter) {
        let count_value = this.cntValues[counter * 2] + (this.cntValues[counter * 2 + 1] * 256);
        if (!count_value) count_value = 0x10000;
        return count_value;
    }
    clearTimer() {
        env.setTimer(0);
    }
    setTimer() {
        const period = Math.ceil(this.getCounter(0) / 1193.181);
        env.setTimer(period);
    }
}
const pit = new PIT(iomgr);


/**
 * Universal Asynchronous Receiver Transmitter
 */
class UART {
    constructor (iomgr, base) {
        this.fifo_i = [];
        iomgr.on(base, (port, data) => {
            writeTerminal(String.fromCharCode(data));
        }, (port) => {
            if (this.fifo_i.length > 0) {
                return this.fifo_i.shift();
            } else {
                return 0;
            }
        });
    }
    onRX(data) {
        this.fifo_i.push(data & 0xFF);
    }
}
const uart = new UART(iomgr, 0x3F8);


class RuntimeEnvironment {
    constructor() {
        this.period = 0;
        this.lastTick = new Date().valueOf();
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
        this.env.vpc_halt = () => this.halt();
        this.env.vpc_outb = (port, data) => iomgr.outb(port, data);
        this.env.vpc_inb = (port) => iomgr.inb(port);
        this.env.vpc_irq = () => pic.checkIRQ();
    }
    halt() {
        const sab = new Int32Array(this._sab);

        const now = new Date().valueOf();
        const expected = this.lastTick + this.period;
        const diff = expected - now;
        if (diff > 0) {
            Atomics.wait(sab, sab_index_sleep, 0, diff);
        }
        const now2 = new Date().valueOf();
        this.lastTick = now2;
        if (now2 >= expected) {
            pic.raiseIRQ(0);
        }

        const keyIn = Atomics.exchange(sab, sab_index_key, 0);
        if (keyIn) {
            uart.onRX(keyIn);
        }
    }
    setTimer(period) {
        this.period = period;
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
        // case 'key':
        //     uart.onRX(e.data.data);
        //     break
        default:
            console.log('worker.onmessage', e.data);
    }
}
