// Virtual Floppy

import { RuntimeEnvironment } from './env';
// import { IOManager } from './iomgr';

const STATUS_NOT_READY      = 0x80;
const STATUS_SECTOR_ERROR   = 4;
const STATUS_DISK_CHANGED   = 6;

/**
 * Virtual Floppy
 * base = 0xFD00
 * base + 0 WORD command / status
 *      0 INQUIRY
 *      1 READ SECTORS
 *      2 WRITE SECTORS
 * base + 2 WORD transfer linear low
 * base + 4 WORD transfer linear high
 * base + 6 BYTE transfer sector count
 * base + 7 BYTE head
 * base + 8 BYTE sector
 * base + 9 BYTE cylinder
 */
export class VFD {
    private image: Uint8Array;
    private env: RuntimeEnvironment;
    private status: number;
    private CNT: number;
    private CYL: number;
    private SEC: number;
    private HEAD: number;
    private PTR: Uint16Array;
    private bytesPerSector: number;
    private n_heads: number;
    private n_sectors: number;
    private n_cylinders: number;
    private maxLBA: number;
    private driveType: number;

    constructor (env: RuntimeEnvironment) {
        const base = 0xFD00;
        this.env = env;
        this.bytesPerSector = 512;
        this.n_heads = 2;
        this.PTR = new Uint16Array(2);
        env.iomgr.onw(base, (_, data) => {
            switch (data) {
                case 0:
                    this.status = 0;
                    this.CNT = this.driveType;
                    this.CYL = this.n_cylinders - 1;
                    this.HEAD = this.n_heads - 1;
                    this.SEC = this.n_sectors;
                    break;
                case 1:
                    this.status = this.readSectors();
                    break;
                case 2:
                    this.status = this.writeSectors();
                    break;
            }
        }, (_) => {
            return this.status;
        });
        env.iomgr.onw(base + 2, (_, data) => this.PTR[0] = data, (_) => this.PTR[0]);
        env.iomgr.onw(base + 4, (_, data) => this.PTR[1] = data, (_) => this.PTR[1]);
        env.iomgr.on(base + 6, (_, data) => this.CNT = data, (_) => this.CNT);
        env.iomgr.on(base + 7, (_, data) => this.HEAD = data, (_) => this.HEAD);
        env.iomgr.on(base + 8, (_, data) => this.SEC = data, (_) => this.SEC);
        env.iomgr.on(base + 9, (_, data) => this.CYL = data, (_) => this.CYL);
    }
    private readSectors(): number {
        if (this.maxLBA == 0) return STATUS_NOT_READY;
        if (this.status == STATUS_DISK_CHANGED) return STATUS_DISK_CHANGED;
        if (!this.image || this.SEC < 1 || this.SEC > this.n_sectors
            || this.HEAD >= this.n_heads || this.CYL >= this.n_cylinders
        ) {
            console.log(`vfd_read: BAD SECTOR [C:${this.CYL} H:${this.HEAD} R:${this.SEC}]`);
            return STATUS_SECTOR_ERROR;
        }
        let lba = (this.SEC - 1) + (this.HEAD + (this.CYL * this.n_heads)) * this.n_sectors;
        let ptr = this.PTR[0] + (this.PTR[1] << 16);
        // console.log(`vfd_read LBA:${lba} [C:${this.CYL} H:${this.HEAD} R:${this.SEC}] MEM:${ptr.toString(16)} Count:${this.CNT}`);
        let counter = this.CNT;
        for (; counter > 0; counter--, lba++) {
            if (lba >= this.maxLBA) {
                return STATUS_SECTOR_ERROR;
            }
            const sector = new Uint8Array(this.image.buffer, lba * this.bytesPerSector, this.bytesPerSector);
            this.env.dmaWrite(ptr, sector);
            ptr += this.bytesPerSector;
            this.PTR[0] = ptr;
            this.PTR[1] = ptr;
            this.CNT = counter;
        }
        this.CNT = counter;
        return 0;
    }
    private writeSectors(): number {
        if (this.maxLBA == 0) return STATUS_NOT_READY;
        if (this.status == STATUS_DISK_CHANGED) return STATUS_DISK_CHANGED;
        if (!this.image || this.SEC < 1 || this.SEC > this.n_sectors
            || this.HEAD >= this.n_heads || this.CYL >= this.n_cylinders
        ) {
            console.log(`vfd_write: BAD SECTOR [C:${this.CYL} H:${this.HEAD} R:${this.SEC}]`);
            return STATUS_SECTOR_ERROR;
        }
        let lba = (this.SEC - 1) + (this.HEAD + (this.CYL * this.n_heads)) * this.n_sectors;
        let ptr = this.PTR[0] + (this.PTR[1] << 16);
        // console.log(`vfd_write LBA:${lba} [C:${this.CYL} H:${this.HEAD} R:${this.SEC}] MEM:${ptr.toString(16)} Count:${this.CNT}`);
        let counter = this.CNT;
        for (; counter > 0; counter--, lba++) {
            if (lba >= this.maxLBA) {
                return STATUS_SECTOR_ERROR;
            }
            const buffer = this.env.dmaRead(ptr, this.bytesPerSector);
            const offset = lba * this.bytesPerSector;
            for (let i = 0; i < this.bytesPerSector; i++) {
                this.image[offset + i] = buffer[i];
            }
            ptr += this.bytesPerSector;
            this.PTR[0] = ptr;
            this.PTR[1] = ptr;
            this.CNT = counter;
        }
        this.CNT = counter;
        return 0;
    }
    public attachImage(blob?: ArrayBuffer): void {
        if (blob != null) {
            const kb = blob.byteLength / 1024;
            const image = new Uint8Array(blob);
            if (blob.byteLength == 512) {
                // Boot Sector Only
                this.image = image;
                this.maxLBA = 1;
                this.driveType = 4;
                this.n_heads = 2;
                this.n_sectors = 18;
                this.n_cylinders = 80;
                console.log(`vfd_attach: BootSector Only`);
            } else if (image[0x26] == 0x29 &&
                (image[0x00] == 0xEB || image[0x00] == 0xE9) &&
                image[0x01] >= 0x3C &&
                image[0x0B] == 0 && //image[0x0C] == 2 &&
                image[0x10] == 0x02 &&
                image[510] == 0x55 && image[511] == 0xAA) {
                // FAT
                const maxLBA = image[0x13] + (image[0x14] << 8);
                let driveType = 0;
                switch (kb) {
                    case 360:
                        driveType = 1;
                        break;
                    case 120:
                        driveType = 2;
                        break;
                    case 720:
                        driveType = 3;
                        break;
                    case 1440:
                        driveType = 4;
                        break;
                    case 2880:
                        driveType = 6;
                        break;
                }
                this.image = image;
                this.maxLBA = maxLBA;
                this.driveType = driveType;
                this.n_heads = image[0x1A];
                this.n_sectors = image[0x18];
                this.n_cylinders = maxLBA / this.n_sectors / this.n_heads;
                console.log(`vfd_attach: FAT ${kb}KB LBA:${this.maxLBA} [C:${this.n_cylinders} H:${this.n_heads} R:${this.n_sectors}]`)
            } else {
                // Other Regular Floppy Image
                let n_heads = 2;
                let n_sectors: number | null = null;
                let driveType = 0;
                switch (kb) {
                    case 160:
                        n_heads = 1;
                        n_sectors = 8;
                        break;
                    case 180:
                        n_heads = 1;
                        n_sectors = 9;
                        break;
                    case 320:
                        n_sectors = 8;
                        break;
                    case 360:
                        driveType = 1;
                        n_sectors = 9;
                        break;
                    case 640:
                        n_sectors = 8;
                        break;
                    case 720:
                        driveType = 3;
                        n_sectors = 9;
                        break;
                    case 1200:
                        driveType = 2;
                        n_sectors = 15;
                        break;
                    case 1440:
                        driveType = 4;
                        n_sectors = 18;
                        break;
                    case 2880:
                        driveType = 6;
                        n_sectors = 36;
                        break;
                    // default:
                    //     break;
                }
                if (n_sectors != null) {
                    this.image = image;
                    this.maxLBA = this.image.byteLength / this.bytesPerSector;
                    this.driveType = driveType;
                    this.n_heads = n_heads;
                    this.n_sectors = n_sectors;
                    this.n_cylinders = this.maxLBA / this.n_heads / this.n_sectors;
                    console.log(`vfd_attach: ${kb}KB LBA:${this.maxLBA} [C:${this.n_cylinders} H:${this.n_heads} R:${this.n_sectors}]`)
                } else if (kb <= 2880 && image[510] == 0x55 && image[511] == 0xAA) {
                    // treat as 2HD
                    this.image = image;
                    this.maxLBA = Math.ceil(this.image.byteLength / this.bytesPerSector);
                    this.driveType = 4;
                    this.n_heads = 2;
                    this.n_sectors = 18;
                    this.n_cylinders = 80;
                    console.log(`vfd_attach: UNKNOWN ${kb}KB LBA:${this.maxLBA}`);
                } else {
                    throw new Error ('Unexpected disk image format');
                }
            }
        } else {
            this.maxLBA = 0;
            this.driveType = 4;
            this.n_heads = 2;
            this.n_sectors = 18;
            this.n_cylinders = 80;
            console.log(`vfd_attach: EMPTY`);
        }
        this.status = STATUS_DISK_CHANGED;
    }
}
