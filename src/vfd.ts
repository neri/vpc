// Virtual Floppy

import { RuntimeEnvironment } from './env';
import { IOManager } from './iomgr';
import { VPIC } from './dev';

/**
 * Virtual Floppy
 * base = 0xFD00
 * base + 0 WORD command / status
 *      0 INQUIRY
 *      1 READ SECTORS
 *      2 WRITE SECTORS
 * base + 2 WORD transfer linear low
 * base + 4 WORD transfer linear high
 * base + 6 BYTE transfer counter
 * base + 7 BYTE head
 * base + 8 BYTE sector
 * base + 9 BYTE cylinder
 */
export class VFD {
    image: Uint8Array;
    env: RuntimeEnvironment;
    status: number;
    CNT: number;
    CYL: number;
    SEC: number;
    HEAD: number;
    PTR: Uint16Array;
    bytesPerSector: number;
    headsPerCylinder: number;
    sectorsPerTrack: number;
    maxCylinder: number;
    maxLBA: number;
    constructor (iomgr: IOManager, env: RuntimeEnvironment) {
        const base = 0xFD00;
        this.env = env;
        this.bytesPerSector = 512;
        this.headsPerCylinder = 2;
        this.PTR = new Uint16Array(2);
        iomgr.onw(base, (_, data) => {
            switch (data) {
                case 0:
                    this.status = this.image.byteLength / this.bytesPerSector;
                    break;
                case 1:
                    this.readSectors();
                    break;
            }
        }, (_) => {
            return this.status;
        });
        iomgr.onw(base + 2, (_, data) => this.PTR[0] = data, (_) => this.PTR[0]);
        iomgr.onw(base + 4, (_, data) => this.PTR[1] = data, (_) => this.PTR[1]);
        iomgr.on(base + 6, (_, data) => this.CNT = data, (_) => this.CNT);
        iomgr.on(base + 7, (_, data) => this.HEAD = data, (_) => this.HEAD);
        iomgr.on(base + 8, (_, data) => this.SEC = data, (_) => this.SEC);
        iomgr.on(base + 9, (_, data) => this.CYL = data, (_) => this.CYL);
    }
    private readSectors(): void {
        if (!this.image || this.SEC < 1 || this.SEC > (this.sectorsPerTrack + 1)
            || this.HEAD > this.headsPerCylinder || this.CYL > this.maxCylinder
        ) {
            console.log(`vfd_read: BAD SECTOR [C:${this.CYL} H:${this.HEAD} R:${this.SEC}]`);
            this.status = -1;
            return;
        }
        let lba = (this.SEC - 1) + (this.HEAD + (this.CYL * this.headsPerCylinder)) * this.sectorsPerTrack;
        let ptr = this.PTR[0] + (this.PTR[1] << 16);
        console.log(`vfd_read [C:${this.CYL} H:${this.HEAD} R:${this.SEC}] LBA:${lba} MEM:${ptr.toString(16)} CNT:${this.CNT}`);
        let counter = this.CNT;
        for (; counter > 0; counter--, lba++) {
            if (lba >= this.maxLBA) {
                this.status = -1;
                return;
            }
            const sector = new Uint8Array(this.image.buffer, lba * this.bytesPerSector, this.bytesPerSector);
            this.env.dmaWrite(ptr, sector);
            ptr += this.bytesPerSector;
            this.PTR[0] = ptr & 0xFFFF;
            this.PTR[1] = ptr >> 16;
            this.CNT = counter;
        }
        this.CNT = counter;
        this.status = 0;
    }
    public attachImage(blob: ArrayBuffer): void {
        this.image = new Uint8Array(blob);
        this.maxLBA = this.image.byteLength / this.bytesPerSector;
        const kb = this.image.byteLength / 1024;
        this.headsPerCylinder = 2;
        switch (kb) {
            case 160:
                this.headsPerCylinder = 1;
                this.sectorsPerTrack = 8;
                break;
            case 320:
                this.sectorsPerTrack = 8;
                break;
            case 640:
                this.sectorsPerTrack = 8;
                break;
            case 720:
                this.sectorsPerTrack = 9;
                break;
            case 1200:
                this.sectorsPerTrack = 15;
                break;
            case 1440:
                this.sectorsPerTrack = 18;
                break;
            default:
                this.sectorsPerTrack = 1;
                break;
        }
        this.maxCylinder = this.maxLBA / this.headsPerCylinder / this.sectorsPerTrack;
        console.log(`vfd_attach: ${kb}KB [C:${this.maxCylinder} H:${this.headsPerCylinder} R:${this.sectorsPerTrack}]`)
    }
}
