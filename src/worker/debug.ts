// Debugger Frontend Interface

import { RuntimeEnvironment, WorkerInterface } from './env';

type Vector = [number, number]; // [offset, selector]

const HELP_MESSAGE = `\
Continue        G [breakpoint]
Step Into       T
Step Over       P
Register        R [register [value]]
Reg Details     RD
Edit Memory     E address values
Dump Memory     D [range]
Disassemble     U [range]`;

// Fill Memory F range values

export class Debugger {
    private worker: WorkerInterface;
    private env: RuntimeEnvironment;
    private lastCmd?: string;
    private cursor_d?: number;
    private cursor_u?: Vector;

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
        try{
        switch (cmd.toLowerCase()) {
            // Help
            case '?':
                this.worker.print(HELP_MESSAGE);
                break;

            // Step by step
            case 't':
                this.env.step();
                this.lastCmd = cmd;
                this.cursor_u = undefined;
                break;

            // Step over
            case 'p':
                this.env.stepOver();
                this.lastCmd = cmd;
                this.cursor_u = undefined;
                break;

            // Continue
            case 'g':
                {
                    const seg_off = args.shift();
                    if (seg_off) {
                        const vec = this.getVector(seg_off, this.env.getReg('CS'));
                        this.env.setBreakpoint(vec[1], vec[0]);
                    }
                    this.env.debugContinue();
                    this.cursor_u = undefined;
                    break;
                }

            // Register
            case 'r':
                {
                    const regToken = args.shift();
                    if (regToken) {
                        const regName = this.env.getCanonicalRegName(regToken);
                        if (!regName) throw new Error(`Unknown register name: ${regToken}`);
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
                        this.cursor_u = this.getCSIP();
                    }
                    break;
                }

            case 'rd':
                this.env.showDesc();
                break;

            // Edit
            case 'e':
                {
                    const seg_off = args.shift();
                    if (!seg_off) throw new Error('Missing address');
                    const base = this.getVectorToLinear(seg_off, 0);
                    if (!args.length) throw new Error('Missing arguments');
                    let array: Array<number|string> = [];
                    args.forEach((arg, index) => {
                        let v = parseInt(arg, 16);
                        if (isNaN(v) || v < -128 || v > 255) throw new Error(`Invalid argument ${index}:${arg}`);
                        array.push(v);
                    });
                    this.env.emit(base, array);
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
                        base = this.cursor_d || 0;
                    }
                    const arg_count = args.shift();
                    if (arg_count) {
                        count = this.getScalar(arg_count);
                    } else {
                        count = DEFAULT_COUNT;
                    }
                    this.cursor_d = this.env.dump(base, count);
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
                        vec = this.cursor_u || this.getCSIP();
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
                        this.cursor_u = vec;
                    }
                    this.lastCmd = cmd;
                }
                break;

            default:
                this.worker.print('command?');
                break;
        }
        }catch(e) {
            console.error(e);
            this.worker.print(e.message);
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
