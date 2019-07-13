// Virtual Graphics Adaptor

import { WorkerInterface, RuntimeEnvironment } from './env';
// import { IOManager } from './iomgr';

const FPS = 1000 / 10;

const GRAPHICS_MODE = 0x01;
const SEGMENT_A000 = 0xA0000;
const SEGMENT_B800 = 0xB8000;

const VBE_DISPI_ID0 = 0xB0C0;

const VBE_DISPI_INDEX_ID = 0x0;
const VBE_DISPI_INDEX_XRES = 0x1;
const VBE_DISPI_INDEX_YRES = 0x2;
const VBE_DISPI_INDEX_BPP = 0x3;
const VBE_DISPI_INDEX_ENABLE = 0x4;

const VBE_DISPI_ENABLED = 0x01;

export class VGA {

    private timer: number;
    private pal_u32: Uint32Array;
    private pal_u8: Uint8Array;
    private pal_index: number;
    private env: RuntimeEnvironment;
    private bgaIndex: number;
    private bgaData: Uint16Array;
    private crtcIndex: number;
    private crtcData: Uint8Array;
    private attrIndex: number;
    private attrData: Uint8Array;

    private vram_base: number;
    private vram_size: number;
    private vram_sign: number;

    constructor (env: RuntimeEnvironment) {
        this.env = env;
        this.pal_u32 = new Uint32Array(256);
        this.pal_u8 = new Uint8Array(this.pal_u32.buffer);
        this.crtcData = new Uint8Array(24);
        this.attrData = new Uint8Array(32);
        this.bgaData = new Uint16Array(5);
        this.bgaData[0] = VBE_DISPI_ID0;

        // CRTC
        env.iomgr.on(0x3B4, (_, data) => this.crtcIndex = data, (_) => this.crtcIndex);
        env.iomgr.on(0x3B5, (_, data) => this.crtcDataWrite(this.crtcIndex, data),
            (_) => this.crtcData[this.crtcIndex]);
        env.iomgr.on(0x3D4, (_, data) => this.crtcIndex = data, (_) => this.crtcIndex);
        env.iomgr.on(0x3D5, (_, data) => this.crtcDataWrite(this.crtcIndex, data),
            (_) => this.crtcData[this.crtcIndex]);

        // Attribute Controller Registers
        env.iomgr.on(0x3C0, (_, data) => this.attrIndex = data, (_) => this.attrIndex);
        env.iomgr.on(0x3C1, (_, data) => {
            switch (this.attrIndex) {
                case 0x10:
                    this.attrData[this.attrIndex] = this.setAttrMode(data);
                    break;
                default:
                    this.attrData[this.attrIndex] = data;
            }
        }, (_) => this.attrData[this.attrIndex]);

        // VGA Palette
        env.iomgr.on(0x03C8, (_, data) => { this.pal_index = data * 4; });
        env.iomgr.on(0x03C9, (_, data) => {
            let pal_index = this.pal_index;
            this.pal_u8[pal_index] = ((data & 0x3F) << 2) | ((data & 0x30) >> 4);
            pal_index++;
            if ((pal_index & 3) == 3) {
                const color_index = pal_index >> 2;
                this.env.worker.postCommand('pal', [color_index, this.pal_u32[color_index]]);
                pal_index++;
            }
            this.pal_index = (pal_index & 1023);
        });

        // Bochs Graphics Adaptor
        env.iomgr.onw(0x01CE, (_, data) => this.bgaIndex = data, (_) => this.bgaIndex);
        env.iomgr.onw(0x01CF, (_, data) => {
            switch (this.bgaIndex) {
                case VBE_DISPI_INDEX_ID:
                    break;
                case VBE_DISPI_INDEX_XRES:
                case VBE_DISPI_INDEX_YRES:
                case VBE_DISPI_INDEX_BPP:
                    this.bgaData[this.bgaIndex] = data;
                    break;
                case VBE_DISPI_INDEX_ENABLE:
                    this.bgaData[this.bgaIndex] = this.bgaSetEnabled(data);
                    break;
                default:
                    break;
            }
        }, (_) => {
            switch (this.bgaIndex) {
                case VBE_DISPI_INDEX_ID:
                case VBE_DISPI_INDEX_XRES:
                case VBE_DISPI_INDEX_YRES:
                case VBE_DISPI_INDEX_BPP:
                case VBE_DISPI_INDEX_ENABLE:
                    return this.bgaData[this.bgaIndex];
                default:
                    return 0xFFFF;
            }
        });
    }
    crtcDataWrite(index: number, data: number): void {
        this.crtcData[this.crtcIndex] = data;
        // console.log('crtc', this.crtcIndex, data);
        switch (this.crtcIndex) {
            case 0x0A:
            case 0x0B:
            case 0x0F:
                this.updateCursor();
                break;
        }
    }
    packedMode(xres: number, yres: number, bpp: number): number {
        return (xres & 0xFFF) | ((yres & 0xFFF) << 12) | (bpp << 24);
    }
    setAttrMode(value: number): number {
        if (value & 0x40) { // 8BIT
            this.vram_base = SEGMENT_A000;
            this.vram_size = 320 * 200;
            this.setMode(320, 200, 8, GRAPHICS_MODE);
        } else {
            if (value & 0x01) { // Graphics Enable
                this.vram_base = SEGMENT_A000;
                this.vram_size = 0x10000;
                this.setMode(640, 400, 4, GRAPHICS_MODE);
            } else {
                this.vram_base = SEGMENT_B800;
                this.vram_size = 80 * 25 * 2;
                this.setMode(640, 400, 4, 0);
            }
        }
        return value;
    }
    bgaSetEnabled(value: number): number {
        if (value == VBE_DISPI_ENABLED) {
            this.clearTimer();
            // const oldValue = this.bgaData[VBE_DISPI_INDEX_ENABLE];
            const xres = this.bgaData[VBE_DISPI_INDEX_XRES];
            const yres = this.bgaData[VBE_DISPI_INDEX_YRES];
            const bpp = this.bgaData[VBE_DISPI_INDEX_BPP];
            let activated = false;
            switch (this.packedMode(xres, yres, bpp)) {
                case this.packedMode(320, 200, 8):
                    this.vram_base = SEGMENT_A000;
                    this.vram_size = 320 * 200;
                    activated = true;
                    break;
                case this.packedMode(640, 400, 8):
                    this.vram_base = SEGMENT_A000;
                    this.vram_size = 0x10000;
                    activated = true;
                    break;
                default:
                    break;
            }
            if (!activated) {
                return 0;
            }
            this.setMode(xres, yres, bpp, GRAPHICS_MODE);
            return 1;
        } else {
            this.clearTimer();
            this.vram_sign = NaN;
            return 0;
        }
    }
    updateCursor(): void {
        let cursor = -1;
        const cursor_sl = this.crtcData[0x0A];
        // const cursor_sh = this.crtcData[0x0B];
        if ((cursor_sl & 0x20) == 0) {
            cursor = (this.crtcData[0x0E] << 8) | this.crtcData[0x0F];
        }
        // console.log('cursor', cursor_sl, cursor_sh, (cursor % 160) / 2, (cursor / 160) | 0);
        this.env.worker.postCommand('vga_cursor', cursor);
    }
    setMode(xres: number, yres: number, bpp: number, flags: number): void {
        this.clearTimer();
        this.env.worker.postCommand('vga_mode', [xres, yres, bpp, flags]);
        this.timer = setInterval(() => this.transferVGA(), FPS);
    }
    clearTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    transferVGA() {
        const sign = this.env.get_vram_signature(this.vram_base, this.vram_size);
        if (this.vram_sign != sign) {
            this.vram_sign = sign;
            const vram = this.env.dmaRead(this.vram_base, this.vram_size);
            this.env.worker.postCommand('vga', vram);
        }
    }
}
