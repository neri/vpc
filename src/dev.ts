// System devices

import { WorkerInterface } from './env';
import { IOManager } from './iomgr';

interface IntervalTimerFunction {
    setTimer(value: number): void;
    setSound(freq: number): void;
}

/**
 * Programmable Interrupt Controller
 */
export class VPIC {
    irq: number[];
    phase: number[];
    IMR: Uint8Array;
    IRR: Uint8Array;
    ISR: Uint8Array;
    ICW: Uint8Array;

    constructor (iomgr: IOManager) {
        this.irq = [];
        this.phase = [0, 0];
        this.IMR = new Uint8Array([0xFF, 0xFF]);
        this.IRR = new Uint8Array(2);
        this.ISR = new Uint8Array(2);
        this.ICW = new Uint8Array(8);

        iomgr.on(0x20, (port, data) => this.writeOCR(0, data), (port) => this.readOCR(0));
        iomgr.on(0x21, (port, data) => this.writeIMR(0, data), (port) => this.readIMR(0));
        iomgr.on(0xA0, (port, data) => this.writeOCR(1, data), (port) => this.readOCR(1));
        iomgr.on(0xA1, (port, data) => this.writeIMR(1, data), (port) => this.readIMR(1));
    }

    private writeOCR(port: number, data: number) {
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
    private readOCR(port: number): number {
        // TODO:
        return 0;
    }
    private writeIMR(port: number, data: number) {
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
    private readIMR(port: number): number {
        return this.IMR[port];
    }
    public setNextIRQ(port: number) {
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
    public raiseIRQ(n: number) {
        if (n < 8) {
            this.IRR[0] |= (1 << n);
            this.setNextIRQ(0);
        } else if (n < 16) {
            this.IRR[1] |= (1 << (n - 8));
            this.IRR[0] |= this.ICW[2];
            this.setNextIRQ(1);
        }
    }
    public checkIRQ(): number {
        const result = this.irq.shift();
        return result || 0;
    }
}

/**
 * Programmable Interval Timer
 */
export class VPIT {
    cntModes: Uint8Array;
    cntPhases: number[];
    cntValues: Uint8Array;
    p0061_data: number;
    timer: IntervalTimerFunction;
    constructor (iomgr: IOManager, timer: IntervalTimerFunction) {
        this.timer = timer;
        this.cntModes = new Uint8Array(3);
        this.cntPhases = [0, 0, 0];
        this.cntValues = new Uint8Array(6);
        this.p0061_data = 0;
    
        iomgr.on(0x40, (port, data) => this.outCntReg(0, data));
        iomgr.on(0x41, (port, data) => this.outCntReg(1, data));
        iomgr.on(0x42, (port, data) => this.outCntReg(2, data));
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
    private outCntReg(counter: number, data: number) {
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
    public noteOn() {
        const freq = 1193181 / this.getCounter(2);
        this.timer.setSound(freq);
    }
    public noteOff() {
        this.timer.setSound(0);
    }
    public getCounter(counter: number): number {
        let count_value = this.cntValues[counter * 2] + (this.cntValues[counter * 2 + 1] * 256);
        if (!count_value) count_value = 0x10000;
        return count_value;
    }
    public clearTimer() {
        this.timer.setTimer(0);
    }
    public setTimer() {
        const period = Math.ceil(this.getCounter(0) / 1193.181);
        this.timer.setTimer(period);
    }
}


/**
 * Universal Asynchronous Receiver Transmitter
 */
export class UART {
    pic: VPIC;
    fifo_i: number[];
    constructor (iomgr: IOManager, base: number, pic: VPIC, worker: WorkerInterface) {
        this.pic = pic;
        this.fifo_i = [];
        iomgr.on(base, (port, data) => {
            worker.print(String.fromCharCode(data));
        }, (port) => {
            if (this.fifo_i.length > 0) {
                return this.fifo_i.shift();
            } else {
                return 0;
            }
        });
    }
    public onRX(data: number) {
        this.fifo_i.push(data & 0xFF);
    }
}
