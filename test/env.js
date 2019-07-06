
module.exports = class RuntimeEnvironment {
    constructor () {
        this.env = {
            memoryBase: 0,
            memory: new WebAssembly.Memory({ initial: 1, maximum: 1024 }),
        }
        this.env.println = (at) => {
            const str = this.getCString(at);
            console.log(str);
        }
        this.env.vpc_outb = (port, data) => { throw new Error('UNEXPECTED CONTROL FLOW'); };
        this.env.vpc_inb = (port) => { throw new Error('UNEXPECTED CONTROL FLOW'); };
        this.env.vpc_outw = (port, data) => { throw new Error('UNEXPECTED CONTROL FLOW'); };
        this.env.vpc_inw = (port) => { throw new Error('UNEXPECTED CONTROL FLOW'); };
        this.env.vpc_irq = () => { throw new Error('UNEXPECTED CONTROL FLOW'); };
        this.env.TRAP_NORETURN = () => { throw new Error('UNEXPECTED CONTROL FLOW'); };
        this.env.vpc_grow = (n) => {
            const result = this.env.memory.grow(n);
            this._memory = new Uint8Array(this.env.memory.buffer);
            return result;
        }
    }
    async instantiate(blob, memsize, mode) {
        return WebAssembly.instantiate(new Uint8Array(blob.buffer), this)
        .then(result => {
            this.wasm = result.instance
            this.vmem = this.wasm.exports._init(memsize);
            this.vcpu = this.wasm.exports.alloc_cpu(mode);
            this.regmap = JSON.parse(this.getCString(this.wasm.exports.debug_get_register_map(this.vcpu)));
            // console.log(env.regmap);
        });
    }
    strlen(at) {
        let result = 0;
        for (let i = at; this._memory[i]; i++) {
            result++;
        }
        return result;
    }
    getCString(at) {
        const len = this.strlen(at);
        const bytes = new Uint8Array(this._memory.buffer, at, len);
        return new TextDecoder('utf-8').decode(bytes);
    }
    emit(to, from) {
        const l = from.length;
        let p = this.vmem + to;
        for (let i = 0; i < l; i++) {
            const v = from[i];
            if (typeof(v) === 'string') {
                for (let j = 0; j < v.length; j++) {
                    this._memory[p] = v.charCodeAt(j);
                    p++;
                }
            } else if (typeof(v) === 'number') {
                this._memory[p] = v;
                p++;
            } else {
                throw `Unexpected type ${typeof(v)}`;
            }
        }
    }
    emitTest(object) {
        this.emit(0xFFFF0, object);
    }
    reset(n = -1) {
        return this.wasm.exports.reset(this.vcpu, n);
    }
    step() {
        return this.wasm.exports.step(this.vcpu);
    }
    dump() {
        this.wasm.exports.debug_dump(this.vcpu);
    }
    setReg(name, value) {
        const reg = this.regmap[name];
        if (!reg) throw new Error(`Unexpected Regsiter Name: ${name}`);
        let a = new Uint32Array(this.env.memory.buffer, reg, 1);
        a[0] = value;
    }
    getReg(name) {
        const reg = this.regmap[name];
        if (!reg) throw new Error(`Unexpected Regsiter Name: ${name}`);
        let a = new Uint32Array(this.env.memory.buffer, reg, 1);
        return a[0];
    }
    getAllRegs() {
        let result = {};
        Object.keys(this.regmap).forEach(name => {
            result[name] = this.getReg(name);
        });
        return result;
    }
    saveState() {
        this.savedState = this.getAllRegs();
    }
    changed() {
        let result = [];
        const newState = this.getAllRegs();
        Object.keys(this.regmap).forEach(name => {
            if (this.savedState[name] !== newState[name]) {
                result.push(name);
            }
        });
        return result.sort();
    }
}
