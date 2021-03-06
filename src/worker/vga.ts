// Virtual Graphics Adaptor

import { WorkerInterface, RuntimeEnvironment } from './env';
// import { IOManager } from './iomgr';

const actualFPS = 10;
const vtInterval = (1000 / actualFPS) | 0;

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
    private vtrace_time = 0;
    private vtrace = false;
    private vtrace_toggle = 0;

    constructor (env: RuntimeEnvironment) {
        this.env = env;
        this.pal_u32 = new Uint32Array(256);
        this.pal_u8 = new Uint8Array(this.pal_u32.buffer);
        for (let i = 0; i < 256; i++) {
            this.pal_u32[i] = 0xFF000000;
        }
        this.crtcData = new Uint8Array(24);
        this.attrData = new Uint8Array(32);

        // CRTC
        env.iomgr.on(0x3B4, (_, data) => this.crtcIndex = data, (_) => this.crtcIndex);
        env.iomgr.on(0x3B5, (_, data) => this.crtcDataWrite(this.crtcIndex, data),
            (_) => this.crtcData[this.crtcIndex]);
        env.iomgr.on(0x3D4, (_, data) => this.crtcIndex = data, (_) => this.crtcIndex);
        env.iomgr.on(0x3D5, (_, data) => this.crtcDataWrite(this.crtcIndex, data),
            (_) => this.crtcData[this.crtcIndex]);

        // Vtrace
        env.iomgr.on(0x3BA, undefined, (_) => this.readVtrace());
        env.iomgr.on(0x3DA, undefined, (_) => this.readVtrace());

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
        env.iomgr.on(0x03C7, (_, data) => { this.pal_read_index = data << 2; });
        env.iomgr.on(0x03C8, (_, data) => { this.pal_index = data << 2; });
        env.iomgr.on(0x03C9, (_, data) => {
            let pal_index = this.pal_index;
            this.pal_u8[pal_index] = ((data & 0x3F) * 4.05) & 0xFF;
            pal_index++;
            if ((pal_index & 3) == 3) {
                const color_index = pal_index >> 2;
                this.env.worker.postCommand('pal', [color_index, this.pal_u32[color_index]]);
                pal_index++;
            }
            this.pal_index = pal_index & 0x3FF;
        }, (_) => {
            let pal_index = this.pal_read_index;
            const result = this.pal_u8[pal_index] >> 2;
            pal_index++;
            if ((pal_index & 3) == 3) {
                pal_index++;
            }
            this.pal_read_index = pal_index & 0x3FF;
            return result;
        });

        env.iomgr.onw(0xFC04, (_, data) => this.setVGAMode(data));

    }
    readVtrace(): number {
        this.vtrace_toggle ^= 0x01;
        if (this.vtrace) {
            if (new Date().valueOf() - this.vtrace_time > 0) {
                this.vtrace = false;
            }
            return 0x08 | this.vtrace_toggle;
        } else {
            return this.vtrace_toggle;
        }
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
            this.setMode([320, 200], 8, GRAPHICS_MODE, [640, 400]);
        } else {
            if (value & 0x01) { // Graphics Enable
            } else {
                this.vram_base = SEGMENT_B800;
                this.vram_size = 80 * 25 * 2;
                this.setMode([640, 400], 4, 0, [640, 400]);
            }
        }
        return value;
    }
    setVGAMode(value: number): void {
        switch (value) {
            case 0x03:
                this.vram_base = SEGMENT_B800;
                this.vram_size = 80 * 25 * 2;
                this.setMode([640, 400], 4, 0);
                break;
            case 0x06:
                this.vram_base = SEGMENT_B800;
                this.vram_size = 0x4000;
                this.setMode([640, 200], 1, CGA_MODE, [640, 400]);
                break;
            case 0x11:
                this.vram_base = SEGMENT_A000;
                this.vram_size = 640 * 480 / 8;
                this.setMode([640, 480], 1, GRAPHICS_MODE);
                break;
            case 0x13:
                this.vram_base = SEGMENT_A000;
                this.vram_size = 320 * 200;
                this.setMode([320, 200], 8, GRAPHICS_MODE, [640, 400]);
                break;
            case 0x100:
                this.vram_base = SEGMENT_A000;
                this.vram_size = 640 * 400;
                this.setMode([640, 400], 8, GRAPHICS_MODE);
                break;
            case 0x101:
                this.vram_base = SEGMENT_A000;
                this.vram_size = 640 * 480;
                this.setMode([640, 480], 8, GRAPHICS_MODE);
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
    setMode(dim: Size, bpp: number, mode: number, vdim?: Size): void {
        this.clearTimer();
        this.env.worker.postCommand('vga_mode', { dim: dim, vdim: vdim ? vdim : dim, bpp: bpp, mode: mode});
        this.timer = setInterval(() => this.transferVGA(), vtInterval);
    }
    clearTimer(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }
    transferVGA(): void {
        this.vtrace_time = new Date().valueOf();
        this.vtrace = true;
        this.updateCursor();
        const sign: number = this.env.getVramSignature(this.vram_base, this.vram_size);
        if (this.vram_sign != sign) {
            this.vram_sign = sign;
            const vram = this.env.dmaRead(this.vram_base, this.vram_size);
            this.env.worker.postCommand('vga', vram);
        }
    }
}
