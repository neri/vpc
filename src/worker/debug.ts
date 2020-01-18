// Debugger Front End Interface

import { RuntimeEnvironment, WorkerInterface } from './env';

type Vector = [number, number];

const HELP_MESSAGE = `\
Continue    G
Step        T
Step Over   P
Register    R [register [value]]
Dump Memory D [range]
Disassemble U [range]`;

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
            // Help
            case '?':
                this.worker.print(HELP_MESSAGE);
                break;

            // Step by step
            case 't':
                this.env.step();
                this.lastCmd = cmd;
                this.lastDisAVec = undefined;
                break;

            // Step over
            case 'p':
                this.env.stepOver();
                this.lastCmd = cmd;
                this.lastDisAVec = undefined;
                break;

            // Continue
            case 'g':
                this.env.debugContinue();
                this.lastDisAVec = undefined;
                break;

            // Register
            case 'r':
                {
                    let regName = args.shift();
                    if (regName) {
                        regName = regName.toUpperCase();
                        const oldValue = this.env.getReg(regName);
                        let _newValue = args.shift();
                        if (_newValue) {
                            const newValue = this.getScalar(_newValue);
                            this.env.setReg(regName, newValue);
                            this.worker.print(`${regName}: ${ oldValue.toString(16).padStart(8, '0') } => ${ this.env.getReg(regName).toString(16).padStart(8, '0') }`);
                        } else {
                            this.worker.print(`${regName}: ${ oldValue.toString(16).padStart(8, '0') }`);
                        }
                    } else {
                        this.env.showRegs();
                        this.lastDisAVec = this.getCSIP();
                    }
                    break;
                }

            // Dump
            case 'd':
                {
                    const DEFAULT_COUNT = 256;
                    let base: number, count: number;
                    const seg_off = args.shift();
                    if (seg_off) {
                        base = this.getVectorToLinear(seg_off, 0);
                    } else {
                        base = this.lastDumpLA || 0;
                    }
                    const arg_count = args.shift();
                    if (arg_count) {
                        count = this.getScalar(arg_count);
                    } else {
                        count = DEFAULT_COUNT;
                    }
                    this.lastDumpLA = this.env.dump(base, count);
                    this.lastCmd = cmd;
                    break;
                }
            
            // Disassemble
            case 'u':
                {
                    const DEFAULT_COUNT = 10;
                    let vec: Vector, count: number;
                    const seg_off = args.shift();
                    if (seg_off) {
                        vec = this.getVector(seg_off, this.env.getReg('CS'));
                    } else {
                        vec = this.lastDisAVec || this.getCSIP();
                    }
                    const arg_count = args.shift();
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
    getVector(seg_off: string, def_seg: number): Vector {
        const a = seg_off.split(/:/);
        let seg: number, off: number;
        if (a.length == 2) {
            seg = this.env.regOrValue(a[0]);
            off = this.env.regOrValue(a[1]);
        } else {
            seg = def_seg;
            off = this.env.regOrValue(a[0]);
        }
        return [off, seg];
    }
    getScalar(val: string): number {
        return this.env.regOrValue(val);
    }
    getCSIP(): Vector {
        return [this.env.getReg('IP'), this.env.getReg('CS')];
    }
}
