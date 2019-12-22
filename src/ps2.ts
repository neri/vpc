// Virtual PS/2

import { WorkerInterface, RuntimeEnvironment } from './env';
// import { IOManager } from './iomgr';

const IRQ_KEY = 1;
const IRQ_MOUSE = 12;
const SCAN_DUMMY = 0x6F;
const PS2_ACK = 0xFA;
const PS2_NAK = 0xFE;

const codeTable: { [key: string]: number } = {
    'Escape': 0x01,
    'Digit1': 0x02,
    'Digit2': 0x03,
    'Digit3': 0x04,
    'Digit4': 0x05,
    'Digit5': 0x06,
    'Digit6': 0x07,
    'Digit7': 0x08,
    'Digit8': 0x09,
    'Digit9': 0x0A,
    'Digit0': 0x0B,
    'Minus': 0x0C,
    'Equal': 0x0D,
    'Backspace': 0x0E,
    'Tab': 0x0F,
    'KeyQ': 0x10,
    'KeyW': 0x11,
    'KeyE': 0x12,
    'KeyR': 0x13,
    'KeyT': 0x14,
    'KeyY': 0x15,
    'KeyU': 0x16,
    'KeyI': 0x17,
    'KeyO': 0x18,
    'KeyP': 0x19,
    'BracketLeft': 0x1A,
    'BracketRight': 0x1B,
    'Enter': 0x1C,
    'ControlLeft': 0x1D,
    'KeyA': 0x1E,
    'KeyS': 0x1f,
    'KeyD': 0x20,
    'KeyF': 0x21,
    'KeyG': 0x22,
    'KeyH': 0x23,
    'KeyJ': 0x24,
    'KeyK': 0x25,
    'KeyL': 0x26,
    'Semicolon': 0x27,
    'Quote': 0x28,
    'Backquote': 0x29,
    'ShiftLeft': 0x2A,
    'Backslash': 0x2B,
    'KeyZ': 0x2c,
    'KeyX': 0x2d,
    'KeyC': 0x2E,
    'KeyV': 0x2f,
    'KeyB': 0x30,
    'KeyN': 0x31, 
    'KeyM': 0x32,
    'Comma': 0x33,
    'Period': 0x34,
    'Slash': 0x35,
    'ShiftRight': 0x36,
    'AltLeft': 0x38,
    'Space': 0x39,
    'AltRight': 0xE038,
    'ControlRight': 0xE01D,
    'F1': 0x3B,
    'F2': 0x3C,
    'F3': 0x3D,
    'F4': 0x3E,
    'F5': 0x3F,
    'F6': 0x40,
    'F7': 0x41,
    'F8': 0x42,
    'F9': 0x43,
    'F10': 0x44,
    'Home': 0xE047,
    'ArrowUp': 0xE048,
    'PageUp': 0xE049,
    'ArrowLeft': 0xE04B,
    'ArrowRight': 0xE04D,
    'End': 0xE04F,
    'ArrowDown': 0xE050,
    'Insert': 0xE052,
    'Delete': 0xE053,
    'IntlRo': 0x73,
    'IntlYen': 0x7D,
};

const scanTable: number[] = [
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0e, 0x0f, 0x00, 0x00, 0x00, 0x1c, 0x00, 0x00,
    0x2a, 0x1d, 0x38, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x39, 0x00, 0x00, 0x00, 0x00, 0x4b, 0x48, 0x4d, 0x50, 0x00, 0x00, 0x00, 0x00, 0x52, 0x53, 0x00,
    0x0b, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x1e, 0x30, 0x2e, 0x20, 0x12, 0x21, 0x22, 0x23, 0x17, 0x24, 0x25, 0x26, 0x32, 0x31, 0x18,
    0x19, 0x10, 0x13, 0x1f, 0x14, 0x16, 0x2f, 0x11, 0x2d, 0x15, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x3b, 0x3c, 0x3d, 0x3e, 0x3f, 0x40, 0x41, 0x42, 0x43, 0x44, 0x57, 0x58, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x6f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x6f, 0x6f, 0x6f, 0x6f, 0x6f, 0x6f,
    0x6f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x6f, 0x6f, 0x6f, 0x6f, 0x00,
    0x00, 0x00, 0x6f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
];

class Point {
    public x = 0;
    public y = 0;
}

class Buttons {
    public L = false;
    public R = false;
    public M = false;

    public toInt(): number {
        return 0x08 | (this.L ? 0x01 : 0x00) | (this.R ? 0x02 : 0x00) | (this.M ? 0x04 : 0x00);
    }
}

export class PS2 {
    private env: RuntimeEnvironment;
    private lastCmd: number = 0;
    private iram: Uint8Array;
    private k_fifo: number[] = [];
    private m_fifo: number[] = [];
    private i_fifo: number[] = [];
    private pointer = new Point();
    private buttons = new Buttons();
    private isKeyboardEnabled = true;
    private isMouseEnabled = false;

    constructor (env: RuntimeEnvironment) {
        this.env = env;
        this.iram = new Uint8Array(32);

        env.iomgr.on(0x0060, (_, data) => this.data(data), (_): number => {
            if (this.k_fifo.length) {
                return this.k_fifo.shift() || 0;
            } else if (this.m_fifo.length) {
                return this.m_fifo.shift() || 0;
            } else {
                return 0;
            }
        });
        env.iomgr.on(0x0064, (_, data) => this.command(data), (_) => {
            return ((this.k_fifo.length > 0) ? 1 : 0)
        });
        env.iomgr.onw(0x64, undefined, (_) => this.k_fifo.shift() || 0);

        env.worker.bind('key', (args) => this.onKey(args.data));
        env.worker.bind('pointer', (args) => this.onPointer(args.move, args.button, args.pressed));

    }
    private command(data: number): void {
        // console.log(`ps2: command ${data.toString(16)}`);
        if (data >= 0x20 && data <= 0x3F) {
            this.postKeyData(this.iram[data & 0x1F]);
        } else {
            switch (data) {
            case 0x55:
                this.postKeyData(0xAA);
                break;
            case 0xA7:
            case 0xA8:
            case 0xAD:
            case 0xAE:
                // TODO:
                break;
            case 0xA9:
            case 0xAB:
                this.postKeyData(0x00);
                break;
            default:
                this.lastCmd = data;
            }
        }
    }
    private data(data: number): void {
        const cmd = this.lastCmd;
        if (cmd >= 0x60 && cmd <= 0x7F) {
            this.iram[cmd & 0x1F] = data;
        } else {
            switch (cmd) {
                case 0xD4: // Send mouse
                    switch (data) {
                    case 0xF2:
                        this.postMouseACK(PS2_ACK);
                        this.postMouseACK(0);
                        break;
                    case 0xF4:
                        this.isMouseEnabled = true;
                        this.postMouseACK(PS2_ACK);
                        break;
                    case 0xF5:
                        this.isMouseEnabled = false;
                        this.postMouseACK(PS2_ACK);
                        break;
                    case 0xFF:
                        this.env.pic.cancelIRQ(IRQ_MOUSE);
                        this.m_fifo = [];
                        this.isMouseEnabled = false;
                        this.postMouseACK(0xAA);
                        break;
                    }
                    break;
                default:
                    switch (data) {
                    case 0xF2:
                        this.postKeyData(PS2_ACK);
                        this.postKeyData(0xAB);
                        this.postKeyData(0x83);
                        break;
                    case 0xF4:
                        this.isKeyboardEnabled = true;
                        this.postKeyData(PS2_ACK);
                        break;
                    case 0xF5:
                        this.isKeyboardEnabled = false;
                        this.postKeyData(PS2_ACK);
                        break;
                    case 0xFF:
                        this.env.pic.cancelIRQ(IRQ_KEY);
                        this.k_fifo = [];
                        this.isKeyboardEnabled = false;
                        this.postKeyData(0xAA);
                        break;
                    }
            }
        }
        this.lastCmd = 0;
    }
    private postKeyData(data: number): void {
        this.k_fifo.push(data);
        this.env.pic.raiseIRQ(IRQ_KEY);
    }
    private postMouseACK(data: number): void {
        this.m_fifo.push(data);
        this.env.pic.raiseIRQ(IRQ_MOUSE);
    }
    private postMouseData(point: Point, buttons: Buttons): void {
        this.m_fifo.push(buttons.toInt() | (point.x < 0 ? 0x10 : 0) | (point.y < 0 ? 0x20 : 0));
        this.m_fifo.push(point.x & 0xFF);
        this.m_fifo.push(point.y & 0xFF);
        this.env.pic.raiseIRQ(IRQ_MOUSE);
        this.env.pic.raiseIRQ(IRQ_MOUSE);
        this.env.pic.raiseIRQ(IRQ_MOUSE);
    }
    onKey(e: any): void {
        if (!this.isKeyboardEnabled) return;
        const { type, key, code, keyCode, ctrlKey, altKey } = e;
        let prefix: number = 0;
        let scancode: number = codeTable[code] || scanTable[keyCode] || 0;
        if (scancode > 0x100) {
            prefix = scancode >> 8;
            scancode &= 0x7F;
        }
        let ascii: number = (key.length === 1) ? key.charCodeAt(0) : 0;
        if (ascii === 0xA5) ascii = 0x5C; // IntlYen
        if (ascii >= 0x80) ascii = 0;
        if (ctrlKey && ascii >= 0x40 && ascii <= 0x80) {
            ascii &= 0x1F;
        }
        if (ascii) {
            scancode |= (ascii << 8);
        } else {
            switch (keyCode) {
            case 0x08:
            case 0x09:
            case 0x0D:
            case 0x1B:
                    scancode |= (keyCode << 8);
                break;
            }
        }
        if (altKey) {
            scancode &= 0x7F;
        }

        if (scancode === 0 && ascii !== 0) {
            scancode = SCAN_DUMMY;
        }

        switch (type) {
        case 'keydown':
            break;
        case 'keyup':
            scancode |= 0x80;
            break;
        }

        // console.log('key', e, scancode.toString(16));
        if (scancode & 0x7F) {
            if (prefix) {
                this.postKeyData(prefix);
            }
            this.postKeyData(scancode);
        }
    }
    onPointer(move?: number[], button?: string, pressed?: boolean) {
        if (!this.isMouseEnabled) return;
        if (move) {
            this.pointer.x += move[0];
            this.pointer.y -= move[1];
        }
        if (button) {
            (this.buttons as any)[button] = pressed ? true : false;
        }
        if (move || button) {
            this.postMouseData(this.pointer, this.buttons);
            this.pointer = new Point();
        }
    }
}
