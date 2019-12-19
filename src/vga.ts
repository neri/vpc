// Virtual Graphics Adaptor

import { WorkerInterface, RuntimeEnvironment } from './env';
// import { IOManager } from './iomgr';

const FPS = 1000 / 10;

const GRAPHICS_MODE = 0x01;
const CGA_MODE = 0x02;
const SEGMENT_A000 = 0xA0000;
const SEGMENT_B800 = 0xB8000;

type Size = [number, number];

export class VGA {

    private timer: NodeJS.Timeout | undefined;
    private pal_u32: Uint32Array;
    private pal_u8: Uint8Array;
    private pal_index: number = 0;
    private pal_read_index: number = 0;
    private env: RuntimeEnvironment;
    private crtcIndex: number = 0;
    private crtcData: Uint8Array;
    private attrIndex: number = 0;
    private attrData: Uint8Array;

    private vram_base: number = 0;
    private vram_size: number = 0;
    private vram_sign: number = 0;
    private _vtrace: number;

    constructor (env: RuntimeEnvironment) {
        this.env = env;
        this.pal_u32 = new Uint32Array(256);
        this.pal_u8 = new Uint8Array(this.pal_u32.buffer);
        for (let i = 0; i < 256; i++) {
            this.pal_u32[i] = 0xFF000000;
        }
        this.crtcData = new Uint8Array(24);
        this.attrData = new Uint8Array(32);
        this._vtrace = 0;

        // CRTC
        env.iomgr.on(0x3B4, (_, data) => this.crtcIndex = data, (_) => this.crtcIndex);
        env.iomgr.on(0x3B5, (_, data) => this.crtcDataWrite(this.crtcIndex, data),
            (_) => this.crtcData[this.crtcIndex]);
        env.iomgr.on(0x3D4, (_, data) => this.crtcIndex = data, (_) => this.crtcIndex);
        env.iomgr.on(0x3D5, (_, data) => this.crtcDataWrite(this.crtcIndex, data),
            (_) => this.crtcData[this.crtcIndex]);

        // Vtrace
        env.iomgr.on(0x3BA, undefined, (_) => this.vtrace());
        env.iomgr.on(0x3DA, undefined, (_) => this.vtrace());

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
        env.iomgr.on(0x03C7, (_, data) => { this.pal_read_index = data * 4; });
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
            this.pal_index = pal_index & 1023;
        }, (_) => {
            let pal_index = this.pal_read_index;
            const result = this.pal_u8[pal_index] >> 2;
            pal_index++;
            if ((pal_index & 3) == 3) {
                pal_index++;
            }
            this.pal_read_index = pal_index & 1023;
            return result;
        });

        env.iomgr.onw(0xFC04, (_, data) => this.setVGAMode(data));

    }
    vtrace(): number {
        this._vtrace ^= 0x08;
        return this._vtrace;
    }
    crtcDataWrite(index: number, data: number): void {
        this.crtcData[this.crtcIndex] = data;
    }
    packedMode(xres: number, yres: number, bpp: number): number {
        return (xres & 0xFFF) | ((yres & 0xFFF) << 12) | (bpp << 24);
    }
    setAttrMode(value: number): number {
        if (value & 0x40) { // 8BIT
            this.vram_base = SEGMENT_A000;
            this.vram_size = 320 * 200;
            this.setMode([320, 200], [640, 400], 8, GRAPHICS_MODE);
        } else {
            if (value & 0x01) { // Graphics Enable
            } else {
                this.vram_base = SEGMENT_B800;
                this.vram_size = 80 * 25 * 2;
                this.setMode([640, 400], [640, 400], 4, 0);
            }
        }
        return value;
    }
    setVGAMode(value: number) {
        switch (value) {
            case 0x03:
                this.vram_base = SEGMENT_B800;
                this.vram_size = 80 * 25 * 2;
                this.setMode([640, 400], [640, 400], 4, 0);
                break;
            case 0x06:
                this.vram_base = SEGMENT_B800;
                this.vram_size = 0x4000;
                this.setMode([640, 200], [640, 400], 1, CGA_MODE);
                break;
            case 0x11:
                this.vram_base = SEGMENT_A000;
                this.vram_size = 640 * 480 / 8;
                this.setMode([640, 480], [640, 480], 1, GRAPHICS_MODE);
                break;
            case 0x13:
                this.vram_base = SEGMENT_A000;
                this.vram_size = 320 * 200;
                this.setMode([320, 200], [640, 400], 8, GRAPHICS_MODE);
                break;
            case 0x100:
                this.vram_base = SEGMENT_A000;
                this.vram_size = 640 * 400;
                this.setMode([640, 400], [640, 400], 8, GRAPHICS_MODE);
                break;
            case 0x101:
                this.vram_base = SEGMENT_A000;
                this.vram_size = 640 * 480;
                this.setMode([640, 480], [640, 480], 8, GRAPHICS_MODE);
                break;
        }
    }
    updateCursor(): void {
        let cursor = 0xFFFF;
        const cursor_sl = this.crtcData[0x0A];
        // const cursor_sh = this.crtcData[0x0B];
        if ((cursor_sl & 0x20) == 0) {
            cursor = (this.crtcData[0x0E] << 8) | this.crtcData[0x0F];
        }
        // console.log('cursor', cursor_sl, cursor_sh, (cursor % 160) / 2, (cursor / 160) | 0);
        this.env.worker.postCommand('vga_cursor', cursor);
    }
    setMode(dim: Size, vdim: Size, bpp: number, mode: number): void {
        this.clearTimer();
        this.env.worker.postCommand('vga_mode', { dim: dim, vdim: vdim, bpp: bpp, mode: mode});
        this.timer = setInterval(() => this.transferVGA(), FPS);
    }
    clearTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }
    transferVGA() {
        this.updateCursor();
        const sign: number = this.env.get_vram_signature(this.vram_base, this.vram_size);
        if (this.vram_sign != sign) {
            this.vram_sign = sign;
            const vram = this.env.dmaRead(this.vram_base, this.vram_size);
            this.env.worker.postCommand('vga', vram);
        }
    }
}
