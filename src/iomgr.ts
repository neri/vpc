// I/O Manager

import { WorkerInterface } from './env';

type outputHandler = (port: number, data: number) => void;
type inputHandler = (port: number) => number;

/**
* I/O Manager
*/
export class IOManager {
    private obHandlers: outputHandler[];
    private ibHandlers: inputHandler[];
    private owHandlers: outputHandler[];
    private iwHandlers: inputHandler[];
    private odHandlers: outputHandler[];
    private idHandlers: inputHandler[];
    ioRedirectMap: Uint32Array;
    private worker: WorkerInterface;

    constructor (worker: WorkerInterface) {
        this.worker = worker;
        this.obHandlers = [];
        this.ibHandlers = [];
        this.owHandlers = [];
        this.iwHandlers = [];
        this.odHandlers = [];
        this.idHandlers = [];
        this.ioRedirectMap = new Uint32Array(2048);
    }
    public on(port: number, callback1?: outputHandler, callback2?: inputHandler) {
        if (callback1 != null) this.obHandlers[port & 0xFFFF] = callback1;
        if (callback2 != null) this.ibHandlers[port & 0xFFFF] = callback2;
    }
    public onw(port: number, callback1?: outputHandler, callback2?: inputHandler) {
        if (callback1 != null) this.owHandlers[port & 0xFFFF] = callback1;
        if (callback2 != null) this.iwHandlers[port & 0xFFFF] = callback2;
    }
    public ond(port: number, callback1?: outputHandler, callback2?: inputHandler) {
        if (callback1 != null) this.odHandlers[port & 0xFFFF] = callback1;
        if (callback2 != null) this.idHandlers[port & 0xFFFF] = callback2;
    }
    public isRedirectRequired(port: number): boolean {
        return (this.ioRedirectMap[port >> 5] & (1 << (port & 31))) != 0;
    }
    public outb(port: number, data: number): void {
        const handler = this.obHandlers[port & 0xFFFF];
        if (handler) {
            handler(port, data & 0xFF);
        }
        if (this.isRedirectRequired(port)) {
            this.worker.postCommand('outb', { port: port, data: data });
        }
    }
    public outw(port: number, data: number): void {
        const handler = this.owHandlers[port & 0xFFFF];
        if (handler) {
            handler(port, data & 0xFFFF);
        } else {
            // fall back
            if (port < 1024) {
                this.outb(port, data & 0xFF);
                this.outb(port + 1, data >> 8);
            }
        }
    }
    public outd(port: number, data: number): void {
        const handler = this.odHandlers[port & 0xFFFF];
        if (handler) {
            handler(port, data | 0);
        }
    }
    public inb(port: number): number {
        const handler = this.ibHandlers[port & 0xFFFF];
        if (handler) {
            return handler(port) & 0xFF;
        } else {
            return 0xFF | 0;
        }
    }
    public inw(port: number): number {
        const handler = this.iwHandlers[port & 0xFFFF];
        if (handler) {
            return handler(port) & 0xFFFF;
        } else {
            return 0xFFFF | 0;
        }
    }
    public ind(port: number): number {
        const handler = this.idHandlers[port & 0xFFFF];
        if (handler) {
            return handler(port) | 0;
        } else {
            return 0xFFFFFFFF | 0;
        }
    }
}
