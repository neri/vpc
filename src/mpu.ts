// Virtual MPU-401 Midi UART Device

import { RuntimeEnvironment } from './env';

export class MPU401 {
    private lastStatus: number | null;
    private outputBuffer: number[] = [];
    private inputBuffer: number[] = [];
    private env: RuntimeEnvironment;

    constructor (env: RuntimeEnvironment, base: number) {
        this.env = env;

        env.iomgr.on(base, (_, data) => this.uartOut(data), (_) => this.inputBuffer.shift() || 0);
        env.iomgr.on(base + 1, (_, data) => {
            switch (data) {
                case 0xFF: // Reset
                    this.lastStatus = null;
                    this.outputBuffer = [];
                    this.inputBuffer = [0xFE];
                    break;
                case 0x3F: // Enter UART mode
                    console.log('mpu401: enter to uart mode');
                    this.inputBuffer.push(0xFE);
                    break;
            }
        }, (_) => (this.inputBuffer.length > 0) ? 0 : 0x80);
    }
    uartOut (data: number): void {
        const isStatus = ((data & 0x80) != 0);
        if (isStatus) {
            if (data < 0xF0) {
                this.lastStatus = data;
                this.outputBuffer = [data];
            } else {
                if (data >= 0xF8) { // System Real Time Message
                    this.midiOut([data]);
                } else if (data == 0xF7) { // End of SysEx
                    if (this.outputBuffer.length >= 5 && this.outputBuffer[0] == 0xF0) {
                        this.outputBuffer.push(data);
                        this.midiOut(this.outputBuffer);
                    }
                    this.outputBuffer = [];
                } else {
                    this.lastStatus = null;
                    this.outputBuffer = [data];
                }
            }
        } else {
            if (this.outputBuffer.length == 0) {
                if (this.lastStatus != null) {
                    // Running Status
                    this.outputBuffer.push(this.lastStatus);
                } else {
                    // Otherwise, unexpected sequence
                    return;
                }
            }
            this.outputBuffer.push(data);
            const status = this.outputBuffer[0];
            const statusType = status & 0xF0;
            switch (statusType) {
                case 0xF0: // SysEx
                    break;
                case 0xC0: // Program Change
                case 0xD0: // Channel Pressure
                    if (this.outputBuffer.length == 2){
                        this.midiOut(this.outputBuffer);
                        this.outputBuffer = [];
                    }
                    break;
                default:
                    if (this.outputBuffer.length == 3){
                        this.midiOut(this.outputBuffer);
                        this.outputBuffer = [];
                    }
            }
        }
    }
    midiOut (data: number[]): void {
        this.env.worker.postCommand('midi', data);
    }
}
