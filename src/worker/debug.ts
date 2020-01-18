// Debugger Front End Interface

import { RuntimeEnvironment, WorkerInterface } from './env';

type Vector = [number, number];

const HELP_MESSAGE = `\
Continue    G
Step        T
Dump Memory D [range]
Disassemble U [range]`;

// Step Over   P
// Edit Memory E address values
// Fill Memory F range values

export class Debugger {
    private worker: WorkerInterface;
    private env: RuntimeEnvironment;
    private lastCmd?: string;
    private lastDumpLA?: number;
    private lastDisAVec?: Vector;

    constructor(worker: WorkerInterface, env: RuntimeEnvironment) {
        this.worker = worker;
        this.env = env;

        worker.bind('debug', args => {
            this.command(args.cmdline);
        });
    }
    public command(cmdline: string): void {
        const args = cmdline.replace(/\s+/g, ' ').split(' ');
        const cmd = args.shift() || this.lastCmd;
        if (!cmd) return;
        this.worker.print(`# ${cmd} ${args.join(' ')}`);
        this.lastCmd = undefined;
        switch (cmd.toLowerCase()) {
            case '?':
                this.worker.print(HELP_MESSAGE);
                break;

            case 't':
                this.env.step();
                this.lastCmd = cmd;
                break;
            case 'p':
                this.env.stepOver();
                this.lastCmd = cmd;
                break;
            case 'g':
                this.env.debugContinue();
                break;
            case 'r':
                this.env.showRegs();
                break;

            case 'd':
                {
                    const DEFAULT_COUNT = 256;
                    let base: number;
                    const seg_off = args.shift();
                    if (seg_off) {
                        base = this.getVectorToLinear(seg_off, 0);
                    } else {
                        base = this.lastDumpLA || 0;
                    }
                    let count: number;
                    let arg_count = args.shift();
                    if (arg_count) {
                        count = this.getScalar(arg_count);
                    } else {
                        count = DEFAULT_COUNT;
                    }
                    this.lastDumpLA = this.env.dump(base, count);
                    this.lastCmd = cmd;
                    break;
                }

            case 'u':
                {
                    let vec: Vector;
                    const DEFAULT_COUNT = 10;
                    const seg_off = args.shift();
                    if (seg_off) {
                        vec = this.getVector(seg_off);
                    } else {
                        vec = this.lastDisAVec || [this.env.getReg('IP'), this.env.getReg('CS')];
                    }
                    let count: number;
                    let arg_count = args.shift();
                    if (arg_count) {
                        count = this.getScalar(arg_count);
                    } else {
                        count = DEFAULT_COUNT;
                    }
                    const len = this.env.disasm(vec[1], vec[0], count);
                    if (len) {
                        vec[0] += len;
                        this.lastDisAVec = vec;
                    }
                    this.lastCmd = cmd;
                }
                break;

            default:
                this.worker.print('command?');
                break;
        }
    }
    getVectorToLinear(seg_off: string, def_seg: number): number {
        const a = seg_off.split(/:/);
        let seg: number, off: number;
        if (a.length == 2) {
            seg = this.env.regOrValue(a[0]);
            off = this.env.regOrValue(a[1]);
        } else {
            seg = def_seg;
            off = this.env.regOrValue(a[0]);
        }
        return this.env.getSegmentBase(seg) + off;
    }
    getVector(seg_off: string): Vector {
        const a = seg_off.split(/:/);
        let seg: number, off: number;
        if (a.length == 2) {
            seg = this.env.regOrValue(a[0]);
            off = this.env.regOrValue(a[1]);
        } else {
            seg = this.env.getReg('CS');
            off = this.env.regOrValue(a[0]);
        }
        return [off, seg];
    }
    getScalar(val: string): number {
        return this.env.regOrValue(val);
    }
}
