// I/O Manager

import { WorkerInterface } from './env';

type outputHandler = (port: number, data: number) => void;
type inputHandler = (port: number) => number;

/**
* I/O Manager
*/
export class IOManager {
    outHandlers: outputHandler[];
    inHandlers: inputHandler[];
    ioRedirectMap: Uint32Array;
    worker: WorkerInterface;
    constructor (worker: WorkerInterface) {
        this.worker = worker;
        this.outHandlers = [];
        this.inHandlers = [];
        this.ioRedirectMap = new Uint32Array(2048);
    }
    public on(port: number, callback1: outputHandler, callback2: inputHandler = null) {
        this.outHandlers[port & 0xFFFF] = callback1;
        this.inHandlers[port & 0xFFFF] = callback2;
    }
    public isRedirectRequired(port: number): boolean {
        return (this.ioRedirectMap[port >> 5] & (1 << (port & 31))) != 0;
    }
    public outb(port: number, data: number): void {
        try {
            const handler = this.outHandlers[port & 0xFFFF];
            if (handler) {
                handler(port, data | 0);
            }
        } catch (e) {
            console.error('worker_outb()', e);
        }
        if (this.isRedirectRequired(port)) {
            this.worker.postCommand('outb', { port: port, data: data });
        }
    }
    public inb(port: number): number {
        const handler = this.inHandlers[port & 0xFFFF];
        if (handler) {
            return handler(port);
        } else {
            return 0xFF | 0;
        }
    }
}
