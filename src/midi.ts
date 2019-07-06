// Virtual MIDI Device

import { RuntimeEnvironment } from './env';
// import { IOManager } from './iomgr';

/**
 * Virtual MPU-401 Midi UART Device
 */
export class MPU401 {
    private outputBuffer: number[];
    private inputBuffer: number[];
    private env: RuntimeEnvironment;

    constructor (env: RuntimeEnvironment, base: number) {
        this.env = env;
        this.outputBuffer = [];
        this.inputBuffer = [];

        env.iomgr.on(base, (_, data) => this.uartOut(data), (_) => this.inputBuffer.shift() || 0);
        env.iomgr.on(base + 1, (_, data) => {
            switch (data) {
                case 0xFF: // Reset
                    this.inputBuffer = [0xFE];
                    break;
                case 0x3F: // Enter UART mode
                    break;
            }
        }, (_) => {
            return (this.inputBuffer.length > 0) ? 0 : 0x80;
        });
    }
    uartOut (data: number): void {
        if (this.outputBuffer.length == 0 && ((data & 0x80) == 0)){
            return;
        }

        const head = (this.outputBuffer.length > 0) ? this.outputBuffer[0] : 0;
        this.outputBuffer.push(data);

        if ((data & 0x80) == 0){
            if (head == 0xF0 && data == 0xF7){
                this.midiOut(this.outputBuffer);
                this.outputBuffer = [];
            }else{
                if ((head & 0xF0) == 0xC0){
                    if (this.outputBuffer.length >= 2){
                        this.midiOut(this.outputBuffer);
                        this.outputBuffer = [];
                    }
                }else{
                    if (this.outputBuffer.length >= 3){
                        this.midiOut(this.outputBuffer);
                        this.outputBuffer = [];
                    }
                }
            }
        }
    }
    midiOut (data: number[]): void {
        this.env.worker.postCommand('midi', data);
    }
}
