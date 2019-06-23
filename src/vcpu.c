// Virtual Playground
// Copyright (c) 2019 Nerry

#include <stdint.h>
// #include <stdlib.h>
#define NULL 0
typedef uintptr_t size_t;

#define WASM_EXPORT __attribute__((visibility("default")))
#define WASM_IMPORT extern

WASM_IMPORT void println(const char *);
WASM_IMPORT void vpc_outb(int port, int value);
WASM_IMPORT int vpc_inb(int port);
WASM_IMPORT void vpc_outw(int port, int value);
WASM_IMPORT int vpc_inw(int port);
WASM_IMPORT int vpc_irq();

typedef struct cpu_state cpu_state;
typedef struct sreg_t sreg_t;
void cpu_reset(cpu_state *cpu, int gen);
void dump_regs(cpu_state *cpu, uint32_t eip);


uint8_t mem[0x110000];


enum {
    cpu_gen_8086 = 0,
    cpu_gen_80186,
    cpu_gen_80286,
    cpu_gen_80386,
    cpu_gen_80486,
    cpu_gen_P5,
    cpu_gen_P6,
    cpu_gen_P7,
} cpu_gen;

typedef enum cpu_status_t {
    cpu_status_normal = 0,
    cpu_status_halt,
    cpu_status_int,
    cpu_status_icebp,
    cpu_status_exit = 10000,
    cpu_status_ud,
    cpu_status_gpf,
    cpu_status_div,
    cpu_status_fpu,
} cpu_status_t;

typedef uint32_t paddr_t;

typedef struct sreg_t {
    uint16_t sel;
    uint32_t limit;
    paddr_t base;
    uint32_t attrs;
} sreg_t;

typedef struct {
    uint16_t limit;
    uint32_t base;
} gdt_idt_t;

typedef struct cpu_state {

    union {
        uint32_t gpr[8];
        struct {
            union {
                struct { uint8_t AL, AH; };
                uint16_t AX;
                uint32_t EAX;
            };
            union {
                struct { uint8_t CL, CH; };
                uint16_t CX;
                uint32_t ECX;
            };
            union {
                uint16_t DX;
                uint32_t EDX;
            };
            union {
                uint16_t BX;
                uint32_t EBX;
            };
            union {
                uint16_t SP;
                uint32_t ESP;
            };
            union {
                uint16_t BP;
                uint32_t EBP;
            };
            union {
                uint16_t SI;
                uint32_t ESI;
            };
            union {
                uint16_t DI;
                uint32_t EDI;
            };
        };
    };

    union {
        sreg_t sregs[8];
        struct {
            sreg_t ES, CS, SS, DS, FS, GS;
        };
    };
    sreg_t null_segment;

    uint32_t CR[8];
    gdt_idt_t GDT;
    gdt_idt_t IDT;
    sreg_t LDT;
    sreg_t TSS;

    uint32_t EIP;

    union {
        uint32_t eflags;
        struct {
            uint32_t CF:1;
            uint32_t :1;
            uint32_t PF:1;
            uint32_t :1;
            uint32_t AF:1;
            uint32_t :1;
            uint32_t ZF:1;
            uint32_t SF:1;
            uint32_t TF:1;
            uint32_t IF:1;
            uint32_t DF:1;
            uint32_t OF:1;
            uint32_t IOPL:2;
            uint32_t NT:1;
            uint32_t :1;
            uint32_t RF:1;
            uint32_t VM:1;
            uint32_t AC:1;
            uint32_t VIF:1;
            uint32_t VIP:1;
            uint32_t ID:1;
        };
    };

    uint32_t flags_mask, flags_mask1;
    int cpu_gen;

} cpu_state;


// #define memset(p, v, n) __builtin_memset(p, v, n)
// #define memcpy(p, q, n) __builtin_memcpy(p, q, n)

void *memset(void *p, int n, size_t size) {
    char *_p = p;
    for (size_t i = 0; i < size; i++) {
        *_p++ = n;
    }
    return p;
}

void *memcpy(void *p, const void *q, size_t size) {
    char *_p = p;
    const char *_q = q;
    for (size_t i = 0; i < size; i++) {
        *_p++ = *_q++;
    }
    return p;
}


static char *hextbl = "0123456789abcdef";

char *dump8(char *p, int value) {
    *p++ = hextbl[(value >> 4) & 0xF];
    *p++ = hextbl[value & 0xF];
    return p;
}

char *dump16(char *p, int value) {
    for (int i = 3; i >= 0; i--) {
        int c = (value >> (i * 4)) & 0xF;
        *p++ = hextbl[c];
    }
    return p;
}

char *dump32(char *p, uint32_t value) {
    for (int i = 7; i >= 0; i--) {
        int c = (value >> (i * 4)) & 0xF;
        *p++ = hextbl[c];
    }
    return p;
}

char *dump_string(char *p, const char *s) {
    for (; *s;) {
        *p++ = *s++;
    }
    return p;
}

// resolve segment override
#define SEGMENT(def) (seg ? seg : def)

static uint8_t *LEA_REG8(cpu_state *cpu, int index) {
    int i = index & 3;
    uint8_t *p = (uint8_t*)(&cpu->gpr[i]);
    if (index & 4) {
        return p + 1;
    } else {
        return p;
    }
}

static void MOVE_TO_REG8(cpu_state *cpu, int index, uint8_t value) {
    *LEA_REG8(cpu, index) = value;
}

static uint8_t LOAD_REG8(cpu_state *cpu, int index) {
    return *LEA_REG8(cpu, index);
}

static uint16_t READ_LE16(void *la) {
    if ((uintptr_t)la & 1) {
        uint8_t *p = la;
        uint16_t result = p[0] | (p[1] << 8);
        return result;
    } else {
        uint16_t *p = la;
        return *p;
    }
}

static void WRITE_LE16(void *la, uint16_t value) {
    if ((uintptr_t)la & 1) {
        uint8_t *p = la;
        p[0] = value;
        p[1] = value >> 8;
    } else {
        uint16_t *p = la;
        *p = value;
    }
}

static uint8_t READ_MEM8(sreg_t *sreg, uint32_t offset) {
    return mem[sreg->base + (offset & 0xFFFF)];
}

static uint16_t READ_MEM16(sreg_t *sreg, uint32_t offset) {
    return READ_LE16(mem + sreg->base + (offset & 0xFFFF));
}

static void WRITE_MEM8(sreg_t *sreg, uint32_t offset, int value) {
    mem[sreg->base + (offset & 0xFFFF)] = value;
}

static void WRITE_MEM16(sreg_t *sreg, uint32_t offset, uint16_t value) {
    WRITE_LE16(mem + sreg->base + (offset & 0xFFFF), value);
}

static int MOVSXB(uint8_t b) {
    return (int)(int8_t)b;
}

static int MOVSXW(uint16_t w) {
    return (int)(int16_t)w;
}

static uint8_t FETCH8(cpu_state *cpu) {
    uint8_t result = mem[cpu->CS.base + cpu->EIP];
    cpu->EIP += 1;
    return result;
}

static uint16_t FETCH16(cpu_state *cpu) {
    uint16_t result = READ_MEM16(&cpu->CS, cpu->EIP);
    cpu->EIP += 2;
    return result;
}

static uint16_t POP16(cpu_state *cpu) {
    uint16_t result = READ_MEM16(&cpu->SS, cpu->SP);
    cpu->SP += 2;
    return result;
}

static void PUSH16(cpu_state *cpu, uint16_t value) {
    cpu->SP -= 2;
    WRITE_MEM16(&cpu->SS, cpu->SP, value);
}

static void OUT8(cpu_state *cpu, uint16_t port, uint8_t value) {
    switch (port) {
        case 0xCF9: // ACPI reset
            cpu_reset(cpu, -1);
            break;
        default:
            vpc_outb(port, value);
            break;
    }
}

static void OUT16(cpu_state *cpu, uint16_t port, uint16_t value) {
    vpc_outw(port, value);
}

static uint8_t INPORT8(cpu_state *cpu, uint16_t port) {
    switch (port) {
        default:
            return vpc_inb(port);
    }
}

static uint16_t INPORT16(cpu_state *cpu, uint16_t port) {
    return vpc_inw(port);
}

static void LOAD_SEL(cpu_state *cpu, sreg_t *sreg, uint16_t value) {
    sreg->sel = value;
    sreg->base = value << 4;
}

static int FAR_CALL(cpu_state *cpu, uint16_t new_sel, uint32_t new_eip) {
    PUSH16(cpu, cpu->CS.sel);
    PUSH16(cpu, cpu->EIP);
    LOAD_SEL(cpu, &cpu->CS, new_sel);
    cpu->EIP = new_eip;
    return 0;
}

static int FAR_JUMP(cpu_state *cpu, uint16_t new_sel, uint32_t new_eip) {
    LOAD_SEL(cpu, &cpu->CS, new_sel);
    cpu->EIP = new_eip;
    return 0;
}

static int RETF(cpu_state *cpu, uint16_t n) {
    uint32_t new_eip = POP16(cpu);
    uint16_t new_sel = POP16(cpu);
    cpu->SP += n;
    LOAD_SEL(cpu, &cpu->CS, new_sel);
    cpu->EIP = new_eip;
    return 0;
}

static void INVOKE_INT(cpu_state *cpu, int n) {
    PUSH16(cpu, cpu->eflags);
    PUSH16(cpu, cpu->CS.sel);
    PUSH16(cpu, cpu->EIP);
    int idt_offset = cpu->IDT.base + n * 4;
    LOAD_SEL(cpu, &cpu->CS, READ_LE16(mem + idt_offset + 2));
    cpu->EIP = READ_LE16(mem + idt_offset);
}

static int SETF8(cpu_state *cpu, int value) {
    int8_t v = value & 0xFF;
    cpu->OF = (value != v);
    cpu->SF = (v < 0);
    cpu->ZF = (v == 0);
    cpu->PF = 1 & ~__builtin_popcount((uint8_t)value);
    return value;
}

static int SETF16(cpu_state *cpu, int value) {
    int16_t v = value & 0xFFFF;
    cpu->OF = (value != v);
    cpu->SF = (v < 0);
    cpu->ZF = (v == 0);
    cpu->PF = 1 & ~__builtin_popcount((uint8_t)value);
    return value;
}

static void LOAD_FLAGS(cpu_state *cpu, int value) {
    cpu->eflags = (value & cpu->flags_mask) | cpu->flags_mask1;
}


typedef struct {
    uint32_t linear;
    uint32_t offset;
    union {
        struct {
            uint8_t modrm, sib;
        };
        struct {
            uint8_t rm:3;
            uint8_t reg:3;
            uint8_t mod:2;
            uint8_t base:3;
            uint8_t index:3;
            uint8_t scale:2;
        };
    };
} modrm_t;

typedef struct {
    int size;
    union {
        void *opr1;
        uint8_t *opr1b;
    };
    int32_t opr2;
} operand_set;

static int MODRM(cpu_state *cpu, sreg_t *seg_ovr, modrm_t *result) {

    result->modrm = FETCH8(cpu);

    if (result->mod == 3) return 3;

    sreg_t *seg = NULL;
    uint32_t base = 0;
    int disp = 0;
    switch (result->rm) {
    case 0: // [BX+SI]
        base = cpu->BX + cpu->SI;
        break;
    case 1: // [BX+DI]
        base = cpu->BX + cpu->DI;
        break;
    case 2: // [BP+SI]
        seg = &cpu->SS;
        base = cpu->BP + cpu->SI;
        break;
    case 3: // [BP+DI]
        seg = &cpu->SS;
        base = cpu->BP + cpu->DI;
        break;
    case 4: // [SI]
        base = cpu->SI;
        break;
    case 5: // [DI]
        base = cpu->DI;
        break;
    case 6: // [BP] or [disp]
        if (result->mod != 0) {
            seg = &cpu->SS;
            base = cpu->BP;
        }
        break;
    case 7: // [BX]
        base = cpu->BX;
        break;
    }
    switch (result->mod) {
    case 0: // [base] or [disp16]
        if (result->rm == 6) {
            disp = MOVSXW(FETCH16(cpu));
        }
        break;
    case 1: // [base + disp8]
        disp = MOVSXB(FETCH8(cpu));
        break;
    case 2: // [base + disp16]
        disp = MOVSXW(FETCH16(cpu));
        break;
    }
    if (!seg) {
        seg = &cpu->DS;
    }
    if (seg_ovr) {
        seg = seg_ovr;
    }
    result->offset = ((base + disp) & 0xFFFF);
    result->linear = seg->base + result->offset;
    return 0;
}

static void MODRM_W_D(cpu_state *cpu, sreg_t *seg, int w, int d, operand_set *set) {
    modrm_t modrm;
    void *opr1;
    void *opr2;
    if (MODRM(cpu, seg, &modrm)) {
        if (w) {
            opr1 = &cpu->gpr[modrm.rm];
        } else {
            opr1 = LEA_REG8(cpu, modrm.rm);
        }
    } else {
        opr1 = mem + modrm.linear;
    }
    if (w) {
        opr2 = &cpu->gpr[modrm.reg];
    } else {
        opr2 = LEA_REG8(cpu, modrm.reg);
    }
    if (d) {
        void *temp = opr1;
        opr1 = opr2;
        opr2 = temp;
    }
    set->size = w ? 1 : 0;
    set->opr1 = opr1;
    if (w) {
        set->opr2 = MOVSXW(READ_LE16(opr2));
    } else {
        set->opr2 = *(int8_t *)opr2;
    }
}

static int MODRM_W(cpu_state *cpu, sreg_t *seg, int w, operand_set *set) {
    int result = 0;
    modrm_t modrm;
    if (MODRM(cpu, seg, &modrm)) {
        if (w) {
            set->opr1 = &cpu->gpr[modrm.rm];
        } else {
            set->opr1 = LEA_REG8(cpu, modrm.rm);
        }
        result = 3;
    } else {
        set->opr1 = mem + modrm.linear;
    }
    set->size = w ? 1 : 0;
    set->opr2 = modrm.reg;
    return result;
}

static void OPR(cpu_state *cpu, sreg_t *seg, uint8_t opcode, operand_set *set) {
    int w = opcode & 1;
    if (opcode & 4) {
        set->size = w ? 1 : 0;
        set->opr1 = &cpu->EAX;
        if (w) {
            set->opr2 = FETCH16(cpu);
        } else {
            set->opr2 = FETCH8(cpu);
        }
    } else {
        MODRM_W_D(cpu, seg, w, opcode & 2, set);
    }
}

static void ADD(cpu_state *cpu, operand_set *set, int c) {
    int value;
    int src = set->opr2;
    switch (set->size) {
        case 0:
        {
            int dst = *(int8_t *)set->opr1;
            value = dst + src + c;
            cpu->AF = (dst & 15) + (src & 15) + c > 15;
            cpu->CF = (uint8_t)dst > (uint8_t)value || (c && !(src + 1));
            *set->opr1b = SETF8(cpu, value);
            break;
        }
        case 1:
        {
            int dst = MOVSXW(READ_LE16(set->opr1));
            value = dst + src + c;
            cpu->AF = (dst & 15) + (src & 15) + c > 15;
            cpu->CF = (uint16_t)dst > (uint16_t)value || (c && !(src + 1));
            WRITE_LE16(set->opr1, SETF16(cpu, value));
            break;
        }
    }
}

static void SUB(cpu_state *cpu, operand_set *set, int c, int cmp) {
    int value;
    int src = set->opr2;
    switch (set->size) {
        case 0:
        {
            int dst = *(int8_t *)set->opr1;
            value = dst - src - c;
            cpu->AF = (dst & 15) - (src & 15) - c < 0;
            cpu->CF = (uint8_t)dst < (uint8_t)src + c || (c && !(src + 1));
            SETF8(cpu, value);
            if (!cmp) *set->opr1b = value;
            break;
        }
        case 1:
        {
            int dst = MOVSXW(READ_LE16(set->opr1));
            value = dst - src - c;
            cpu->AF = (dst & 15) - (src & 15) - c < 0;
            cpu->CF = (uint16_t)dst < (uint16_t)src + c || (c && !(src + 1));
            SETF16(cpu, value);
            if (!cmp) WRITE_LE16(set->opr1, value);
            break;
        }
    }
}

static void OR(cpu_state *cpu, operand_set *set) {
    int value;
    switch (set->size) {
        case 0:
        {
            value = *set->opr1b | set->opr2;
            cpu->CF = 0;
            *set->opr1b = SETF8(cpu, value);
            break;
        }
        case 1:
        {
            value = READ_LE16(set->opr1) | set->opr2;
            cpu->CF = 0;
            WRITE_LE16(set->opr1, SETF16(cpu, value));
            break;
        }
    }
}

static void AND(cpu_state *cpu, operand_set *set, int test) {
    int value;
    switch (set->size) {
        case 0:
        {
            value = *set->opr1b & set->opr2;
            cpu->CF = 0;
            SETF8(cpu, value);
            if (!test) *set->opr1b = value;
            break;
        }
        case 1:
        {
            value = READ_LE16(set->opr1) & set->opr2;
            cpu->CF = 0;
            SETF16(cpu, value);
            if (!test) WRITE_LE16(set->opr1, value);
            break;
        }
    }
}

static void XOR(cpu_state *cpu, operand_set *set) {
    int value;
    switch (set->size) {
        case 0:
        {
            value = *set->opr1b ^ set->opr2;
            cpu->CF = 0;
            *set->opr1b = SETF8(cpu, value);
            break;
        }
        case 1:
        {
            value = READ_LE16(set->opr1) ^ set->opr2;
            cpu->CF = 0;
            WRITE_LE16(set->opr1, SETF16(cpu, value));
            break;
        }
    }
}

static void JCC(cpu_state *cpu, int disp, int cc) {
    if (cc) {
        cpu->EIP = (cpu->EIP + disp) & 0xFFFF;
    }
}

static int SHIFT(cpu_state *cpu, operand_set *set, int c) {
    uint32_t m;
    switch (set->size) {
        case 0:
            m = 0x80;
            break;
        case 1:
            m = 0x8000;
            break;
    }
    if (cpu->cpu_gen >= cpu_gen_80186) c &= 0x1F;
    switch (set->opr2) {
        case 0: // ROL
        {
            uint32_t value;
            switch (set->size) {
                case 0:
                    value = *set->opr1b;
                    for (int i = 0; i < c; ++i) {
                        value = (value << 1) | (cpu->CF = (value & m) != 0);
                    }
                    cpu->OF = cpu->CF ^ ((value & m) != 0);
                    *set->opr1b = value;
                    return 0;
                case 1:
                    value = READ_LE16(set->opr1b);
                    for (int i = 0; i < c; ++i) {
                        value = (value << 1) | (cpu->CF = (value & m) != 0);
                    }
                    cpu->OF = cpu->CF ^ ((value & m) != 0);
                    WRITE_LE16(set->opr1, value);
                    return 0;
            }
        }
            break;

        case 1: // ROR
        {
            uint32_t value;
            switch (set->size) {
                case 0:
                    value = *set->opr1b;
                    for (int i = 0; i < c; ++i) {
                        value = (value >> 1) | ((cpu->CF = value & 1) ? m : 0);
                    }
                    cpu->OF = cpu->CF ^ ((value & (m >> 1)) != 0);
                    *set->opr1b = value;
                    return 0;
                case 1:
                    value = READ_LE16(set->opr1);
                    for (int i = 0; i < c; ++i) {
                        value = (value >> 1) | ((cpu->CF = value & 1) ? m : 0);
                    }
                    cpu->OF = cpu->CF ^ ((value & (m >> 1)) != 0);
                    WRITE_LE16(set->opr1, value);
                    return 0;
            }
            break;
        }

        case 2: // RCL
        {
            uint32_t value;
            switch (set->size) {
                case 0:
                    value = *set->opr1b;
                    for (int i = 0; i < c; ++i) {
                        value = (value << 1) | cpu->CF;
                        cpu->CF = ((value & (m << 1)) != 0);
                    }
                    cpu->OF = cpu->CF ^ ((value & m) != 0);
                    *set->opr1b = value;
                    return 0;
                case 1:
                    value = READ_LE16(set->opr1);
                    for (int i = 0; i < c; ++i) {
                        value = (value << 1) | cpu->CF;
                        cpu->CF = ((value & (m << 1)) != 0);
                    }
                    cpu->OF = cpu->CF ^ ((value & m) != 0);
                    WRITE_LE16(set->opr1, value);
                    return 0;
            }
        }

        case 3: // RCR
        {
            uint32_t value;
            switch (set->size) {
                case 0:
                    value = *set->opr1b;
                    for (int i = 0; i < c; ++i) {
                        int f1 = value & 1, f2 = (value & m) != 0;
                        value = (value >> 1) | (cpu->CF ? m : 0);
                        cpu->OF = cpu->CF ^ f2;
                        cpu->CF = f1;
                    }
                    *set->opr1b = value;
                    return 0;
                case 1:
                    value = READ_LE16(set->opr1);
                    for (int i = 0; i < c; ++i) {
                        int f1 = value & 1, f2 = (value & m) != 0;
                        value = (value >> 1) | (cpu->CF ? m : 0);
                        cpu->OF = cpu->CF ^ f2;
                        cpu->CF = f1;
                    }
                    WRITE_LE16(set->opr1, value);
                    return 0;
            }
        }

        case 4: // SHL
        // case 6: // SHL?
            if (c > 0) {
                uint32_t value;
                switch (set->size) {
                    case 0:
                        value = *set->opr1b;
                        for (int i = 0; i < c; ++i) {
                            value <<= 1;
                        }
                        *set->opr1b = SETF8(cpu, value);
                        cpu->CF = (value & (m << 1)) != 0;
                        cpu->OF = cpu->CF != !!(value & m);
                        return 0;
                    case 1:
                        value = READ_LE16(set->opr1);
                        for (int i = 0; i < c; ++i) {
                            value <<= 1;
                        }
                        WRITE_LE16(set->opr1b, SETF16(cpu, value));
                        cpu->CF = (value & (m << 1)) != 0;
                        cpu->OF = cpu->CF != !!(value & m);
                        return 0;
                }
            }
            return 0;
        case 5: // SHR
            if (c > 0) {
                uint32_t value;
                switch (set->size) {
                    case 0:
                        value = *set->opr1b;
                        for (int i = 1; i < c; ++i) {
                            value >>= 1;
                        }
                        *set->opr1b = SETF8(cpu, value >> 1);
                        cpu->CF = value & 1;
                        cpu->OF = !!(value & m);
                        return 0;
                    case 1:
                        value = READ_LE16(set->opr1);
                        for (int i = 1; i < c; ++i) {
                            value >>= 1;
                        }
                        WRITE_LE16(set->opr1b, SETF16(cpu, value >> 1));
                        cpu->CF = value & 1;
                        cpu->OF = !!(value & m);
                        return 0;
                }
            }
            return 0;
        case 7: // SAR
            if (c > 0) {
                int32_t value;
                switch (set->size) {
                    case 0:
                        value = MOVSXB(*set->opr1b);
                        for (int i = 1; i < c; ++i) {
                            value >>= 1;
                        }
                        *set->opr1b = SETF8(cpu, value >> 1);
                        cpu->CF = value & 1;
                        cpu->OF = 0;
                        return 0;
                    case 1:
                        value = MOVSXW(READ_LE16(set->opr1));
                        for (int i = 1; i < c; ++i) {
                            value >>= 1;
                        }
                        WRITE_LE16(set->opr1b, SETF16(cpu, value >> 1));
                        cpu->CF = value & 1;
                        cpu->OF = 0;
                        return 0;
                }
            }
            return 0;
    }
    return cpu_status_ud;
}


#define PREFIX_LOCK     0x00000001
#define PREFIX_REPZ     0x00000002
#define PREFIX_REPNZ    0x00000004
#define PREFIX_66       0x00000010
#define PREFIX_67       0x00000020

static int cpu_step(cpu_state *cpu) {
    operand_set set;
    uint32_t prefix = 0;
    sreg_t *seg = NULL;
    for (;;) {
        uint32_t inst = FETCH8(cpu);
        if (inst == 0x0F) {
            inst = (inst << 8) | FETCH8(cpu);
        }
        switch (inst) {
            case 0x00: // ADD r/m, reg8
            case 0x01: // ADD r/m, reg16
            case 0x02: // ADD reg8, r/m
            case 0x03: // ADD reg16, r/m
            case 0x04: // ADD AL, imm8
            case 0x05: // ADD AX, imm16
                OPR(cpu, seg, inst, &set);
                ADD(cpu, &set, 0);
                return 0;

            case 0x06: // PUSH ES
                PUSH16(cpu, cpu->ES.sel);
                return 0;

            case 0x07: // POP ES
                LOAD_SEL(cpu, &cpu->ES, POP16(cpu));
                return 0;

            case 0x08: // OR r/m, reg8
            case 0x09:
            case 0x0A:
            case 0x0B:
            case 0x0C:
            case 0x0D:
                OPR(cpu, seg, inst, &set);
                OR(cpu, &set);
                return 0;

            case 0x0E: // PUSH CS
                PUSH16(cpu, cpu->CS.sel);
                return 0;

            // case 0x0F: // POP CS

            case 0x10: // ADC r/m, reg8
            case 0x11:
            case 0x12:
            case 0x13:
            case 0x14:
            case 0x15:
                OPR(cpu, seg, inst, &set);
                ADD(cpu, &set, cpu->CF);
                return 0;

            case 0x16: // PUSH SS
                PUSH16(cpu, cpu->SS.sel);
                return 0;

            case 0x17: // POP SS
                LOAD_SEL(cpu, &cpu->SS, POP16(cpu));
                return 0;

            case 0x18: // SBB r/m, reg8
            case 0x19:
            case 0x1A:
            case 0x1B:
            case 0x1C:
            case 0x1D:
                OPR(cpu, seg, inst, &set);
                SUB(cpu, &set, cpu->CF, 0);
                return 0;

            case 0x1E: // PUSH DS
                PUSH16(cpu, cpu->DS.sel);
                return 0;

            case 0x1F: // POP DS
                LOAD_SEL(cpu, &cpu->DS, POP16(cpu));
                return 0;

            case 0x20: // AND r/m, reg8
            case 0x21:
            case 0x22:
            case 0x23:
            case 0x24:
            case 0x25:
                OPR(cpu, seg, inst, &set);
                AND(cpu, &set, 0);
                return 0;

            case 0x26: // prefix ES:
                seg = &cpu->ES;
                break;

            // case 0x27: // DAA

            case 0x28: // SUB r/g, reg8
            case 0x29:
            case 0x2A:
            case 0x2B:
            case 0x2C:
            case 0x2D:
                OPR(cpu, seg, inst, &set);
                SUB(cpu, &set, 0, 0);
                return 0;

            case 0x2E: // prefix CS:
                seg = &cpu->CS;
                break;

            // case 0x2F: // DAS
            // {
            //     int value;
            //     value = (cpu->AF = (cpu->AL & 15) > 9 || cpu->AF) ? 6 : 0;
            //     if ((cpu->CF = cpu->AL > 0x99 || cpu->CF)){
            //         value += 0x60;
            //     }
            //     cpu->AL = SETF8(cpu, cpu->AL - value);
            //     return 0;
            // }

            case 0x30: // XOR r/g, reg8
            case 0x31:
            case 0x32:
            case 0x33:
            case 0x34:
            case 0x35:
                OPR(cpu, seg, inst, &set);
                XOR(cpu, &set);
                return 0;

            case 0x36: // prefix SS:
                seg = &cpu->SS;
                break;

            // case 0x37: // AAA

            case 0x38: // CMP r/m, reg8
            case 0x39:
            case 0x3A:
            case 0x3B:
            case 0x3C:
            case 0x3D:
                OPR(cpu, seg, inst, &set);
                SUB(cpu, &set, 0, 1);
                return 0;

            case 0x3E: // prefix DS:
                seg = &cpu->DS;
                break;

            // case 0x3F: // AAS

            case 0x40: // INC AX
            case 0x41: case 0x42: case 0x43: case 0x44: case 0x45: case 0x46: case 0x47:
            {
                int val = SETF16(cpu, (cpu->gpr[inst & 7] + 1));
                cpu->gpr[inst & 7] = val;
                cpu->AF = !(val & 15);
                return 0;
            }

            case 0x48: // DEC AX
            case 0x49: case 0x4A: case 0x4B: case 0x4C: case 0x4D: case 0x4E: case 0x4F:
            {
                int val = SETF16(cpu, (cpu->gpr[inst & 7] - 1));
                cpu->gpr[inst & 7] = val;
                cpu->AF = (val & 15) == 15;
                return 0;
            }

            case 0x50: // PUSH AX
            case 0x51: case 0x52: case 0x53: case 0x55: case 0x56: case 0x57:
                PUSH16(cpu, cpu->gpr[inst & 7]);
                return 0;
            
            case 0x54: // PUSH SP
                if (cpu->cpu_gen >= cpu_gen_80286) {
                    PUSH16(cpu, cpu->ESP);
                } else {
                    cpu->ESP -= 2;
                    WRITE_MEM16(&cpu->SS, cpu->ESP, cpu->ESP);
                }
                return 0;

            case 0x58: // POP AX
            case 0x59: case 0x5A: case 0x5B: case 0x5C: case 0x5D: case 0x5E: case 0x5F:
                cpu->gpr[inst & 7] = POP16(cpu);
                return 0;

            // case 0x60: // PUSHA
            // case 0x61: // POPA
            // case 0x62: // BOUND or EVEX
            // case 0x63: // ARPL or MOVSXD

            case 0x64: // prefix FS:
                seg = &cpu->FS;
                break;

            case 0x65: // prefix GS:
                seg = &cpu->GS;
                break;

            // case 0x66: // prefix 66
            //     prefix |= PREFIX_66;
            //     break;

            // case 0x67: // prefix 67
            //     prefix |= PREFIX_67;
            //     break;

            case 0x68: // PUSH imm16
                PUSH16(cpu, FETCH16(cpu));
                return 0;

            // case 0x69: // IMUL reg, r/m, imm16

            case 0x6A: // PUSH imm8
                PUSH16(cpu, MOVSXB(FETCH8(cpu)));
                return 0;

            // case 0x6B: // IMUL reg, r/m, imm8

            case 0x6C: // INSB
            {
                sreg_t *_seg = SEGMENT(&cpu->ES);
                if (prefix & PREFIX_REPNZ) return cpu_status_ud;
                int rep = prefix & PREFIX_REPZ;
                if (rep && cpu->CX == 0) return 0;
                do {
                    WRITE_MEM8(_seg, cpu->DI, INPORT8(cpu, cpu->DX));
                    if (cpu->DF) {
                        cpu->DI--;
                    } else {
                        cpu->DI++;
                    }
                } while (rep && --cpu->CX);
                return 0;
            }

            case 0x6D: // INSW
            {
                sreg_t *_seg = SEGMENT(&cpu->ES);
                if (prefix & PREFIX_REPNZ) return cpu_status_ud;
                int rep = prefix & PREFIX_REPZ;
                if (rep && cpu->CX == 0) return 0;
                do {
                    WRITE_MEM16(_seg, cpu->DI, INPORT16(cpu, cpu->DX));
                    if (cpu->DF) {
                        cpu->DI -= 2;
                    } else {
                        cpu->DI += 2;
                    }
                } while (rep && --cpu->CX);
                return 0;
            }

            case 0x6E: // OUTSB
            {
                sreg_t *_seg = SEGMENT(&cpu->DS);
                if (prefix & PREFIX_REPNZ) return cpu_status_ud;
                int rep = prefix & PREFIX_REPZ;
                if (rep && cpu->CX == 0) return 0;
                do {
                    OUT8(cpu, cpu->DX, READ_MEM8(_seg, cpu->SI));
                    if (cpu->DF) {
                        cpu->SI--;
                    } else {
                        cpu->SI++;
                    }
                } while (rep && --cpu->CX);
                return 0;
            }

            case 0x6F: // OUTSW
            {
                sreg_t *_seg = SEGMENT(&cpu->DS);
                if (prefix & PREFIX_REPNZ) return cpu_status_ud;
                int rep = prefix & PREFIX_REPZ;
                if (rep && cpu->CX == 0) return 0;
                do {
                    OUT16(cpu, cpu->DX, READ_MEM16(_seg, cpu->SI));
                    if (cpu->DF) {
                        cpu->SI -= 2;
                    } else {
                        cpu->SI += 2;
                    }
                } while (rep && --cpu->CX);
                return 0;
            }

            case 0x70: // JO d8
                JCC(cpu, MOVSXB(FETCH8(cpu)), cpu->OF);
                return 0;

            case 0x71: // JNO d8
                JCC(cpu, MOVSXB(FETCH8(cpu)), !cpu->OF);
                return 0;

            case 0x72: // JC d8
                JCC(cpu, MOVSXB(FETCH8(cpu)), cpu->CF);
                return 0;

            case 0x73: // JNC d8
                JCC(cpu, MOVSXB(FETCH8(cpu)), !cpu->CF);
                return 0;

            case 0x74: // JZ d8
                JCC(cpu, MOVSXB(FETCH8(cpu)), cpu->ZF);
                return 0;

            case 0x75: // JNZ d8
                JCC(cpu, MOVSXB(FETCH8(cpu)), !cpu->ZF);
                return 0;

            case 0x76: // JBE d8
                JCC(cpu, MOVSXB(FETCH8(cpu)), cpu->CF || cpu->ZF);
                return 0;

            case 0x77: // JNBE d8
                JCC(cpu, MOVSXB(FETCH8(cpu)), !(cpu->CF || cpu->ZF));
                return 0;

            case 0x78: // JS d8
                JCC(cpu, MOVSXB(FETCH8(cpu)), cpu->SF);
                return 0;

            case 0x79: // JNS d8
                JCC(cpu, MOVSXB(FETCH8(cpu)), !cpu->SF);
                return 0;

            case 0x7A: // JP d8
                JCC(cpu, MOVSXB(FETCH8(cpu)), cpu->PF);
                return 0;

            case 0x7B: // JNP d8
                JCC(cpu, MOVSXB(FETCH8(cpu)), !cpu->PF);
                return 0;

            case 0x7C: // JL d8
                JCC(cpu, MOVSXB(FETCH8(cpu)), cpu->SF != cpu->OF);
                return 0;

            case 0x7D: // JNL d8
                JCC(cpu, MOVSXB(FETCH8(cpu)), cpu->SF == cpu->OF);
                return 0;

            case 0x7E: // JLE d8
                JCC(cpu, MOVSXB(FETCH8(cpu)), cpu->ZF || (cpu->SF != cpu->OF));
                return 0;

            case 0x7F: // JG d8
                JCC(cpu, MOVSXB(FETCH8(cpu)), !(cpu->ZF || cpu->SF != cpu->OF));
                return 0;

            case 0x80: // alu r/m, imm8
            case 0x81: // alu r/m, imm16
            // case 0x82: // undocumented
            case 0x83: // alu r/m, imm8 (sign extended)
            {
                MODRM_W(cpu, seg, inst & 1, &set);
                int opc = set.opr2;
                if (inst == 0x81) {
                    set.opr2 = MOVSXW(FETCH16(cpu));
                } else {
                    set.opr2 = MOVSXB(FETCH8(cpu));
                }
                switch (opc) {
                    case 0: //ADD
                        ADD(cpu, &set, 0);
                        break;
                    case 1: // OR
                        OR(cpu, &set);
                        break;
                    case 2: // ADC
                        ADD(cpu, &set, cpu->CF);
                        break;
                    case 3: // SBB
                        SUB(cpu, &set, cpu->CF, 0);
                        break;
                    case 4: // AND
                        AND(cpu, &set, 0);
                        break;
                    case 5: // SUB
                        SUB(cpu, &set, 0, 0);
                        break;
                    case 6: // XOR
                        XOR(cpu, &set);
                        break;
                    case 7: // CMP
                        SUB(cpu, &set, 0, 1);
                        break;
                }
                return 0;
            }

            case 0x84: // test r/m, reg8
            case 0x85: // test r/m, reg16
                MODRM_W_D(cpu, seg, inst & 1, 0, &set);
                AND(cpu, &set, 1);
                return 0;

            case 0x86: // xchg r/m, reg8
            {
                MODRM_W(cpu, seg, 0, &set);
                int temp = *set.opr1b;
                *set.opr1b = LOAD_REG8(cpu, set.opr2);
                MOVE_TO_REG8(cpu, set.opr2, temp);
                return 0;
            }

            case 0x87: // xchg r/m, reg16
            {
                MODRM_W(cpu, seg, 1, &set);
                int temp = READ_LE16(set.opr1);
                WRITE_LE16(set.opr1, cpu->gpr[set.opr2]);
                cpu->gpr[set.opr2] = temp;
                return 0;
            }

            case 0x88: // MOV rm, r8
            case 0x89: // MOV rm, r16
            case 0x8A: // MOV r8, rm
            case 0x8B: // MOV r16, rm
                MODRM_W_D(cpu, seg, inst & 1, inst &2, &set);
                switch (set.size) {
                case 0:
                    *set.opr1b = set.opr2;
                    break;
                case 1:
                    WRITE_LE16(set.opr1, set.opr2);
                    break;
                }
                return 0;

            case 0x8C: // MOV r/m, seg
                MODRM_W(cpu, seg, 1, &set);
                WRITE_LE16(set.opr1, cpu->sregs[set.opr2].sel);
                return 0;

            case 0x8D: // LEA reg, r/m
            {
                modrm_t modrm;
                if (MODRM(cpu, NULL, &modrm)) return cpu_status_ud;
                cpu->gpr[modrm.reg] = modrm.offset;
                return 0;
            }

            case 0x8E: // MOV seg, r/m
                MODRM_W(cpu, seg, 1, &set);
                LOAD_SEL(cpu, &cpu->sregs[set.opr2], READ_LE16(set.opr1));
                return 0;

            case 0x8F: // /0 POP r/m
                MODRM_W(cpu, seg, 1, &set);
                switch (set.opr2) {
                    case 0: // POP r/m
                        WRITE_LE16(set.opr1, POP16(cpu));
                        return 0;
                    default: // XOP
                        return cpu_status_ud;
                }

            case 0x90: // NOP
                return 0;

            case 0x91: // XCHG AX, reg16
            case 0x92: case 0x93: case 0x94: case 0x95: case 0x96: case 0x97:
            {
                uint32_t temp = cpu->gpr[inst & 7];
                cpu->gpr[inst & 7] = cpu->EAX;
                cpu->EAX = temp;
                return 0;
            }

            case 0x98: // CBW
                cpu->AX = MOVSXB(cpu->AL);
                return 0;

            case 0x99: // CWD
            {
                uint32_t temp = MOVSXW(cpu->AX);
                cpu->DX = (temp >> 16);
                return 0;
            }

            case 0x9A: // CALL far imm32
            {
                uint32_t new_eip = FETCH16(cpu);
                uint16_t new_sel = FETCH16(cpu);
                return FAR_CALL(cpu, new_sel, new_eip);
            }

            case 0x9B: // FWAIT (NOP)
                return 0;

            case 0x9C: // PUSHF
                PUSH16(cpu, cpu->eflags);
                return 0;

            case 0x9D: // POPF
                LOAD_FLAGS(cpu, POP16(cpu));
                return cpu_status_int;

            case 0x9E: // SAHF
                LOAD_FLAGS(cpu, (cpu->eflags & 0xFFFFFF00) | cpu->AH);
                return 0;

            case 0x9F: // LAHF
                cpu->AH = cpu->eflags;
                return 0;

            case 0xA0: // MOV AL, off16
                cpu->AL = READ_MEM8(SEGMENT(&cpu->DS), FETCH16(cpu));
                return 0;

            case 0xA1: // MOV AX, off16
                cpu->AX = READ_MEM16(SEGMENT(&cpu->DS), FETCH16(cpu));
                return 0;

            case 0xA2: // MOV off16, AL
                WRITE_MEM8(SEGMENT(&cpu->DS), FETCH16(cpu), cpu->AL);
                return 0;

            case 0xA3: // MOV off16, AX
                WRITE_MEM16(SEGMENT(&cpu->DS), FETCH16(cpu), cpu->AX);
                return 0;

            case 0xA4: // MOVSB
            {
                sreg_t *_seg = SEGMENT(&cpu->DS);
                if (prefix & PREFIX_REPNZ) return cpu_status_ud;
                int rep = prefix & PREFIX_REPZ;
                size_t count = cpu->CX;
                if (rep && count == 0) return 0;
                // if (rep && cpu->DF == 0
                //     && ((cpu->SI + count) <= 0x10000)
                //     && ((cpu->DI + count) <= 0x10000)
                // ) {
                //     uint8_t *src = mem + _seg->base + cpu->SI;
                //     uint8_t *dst = mem + cpu->ES.base + cpu->DI;
                //     memcpy(dst, src, count);
                //     cpu->SI += count;
                //     cpu->DI += count;
                //     cpu->CX = 0;
                //     return 0;
                // }
                do {
                    WRITE_MEM8(&cpu->ES, cpu->DI, READ_MEM8(_seg, cpu->SI));
                    if (cpu->DF) {
                        cpu->SI--;
                        cpu->DI--;
                    } else {
                        cpu->SI++;
                        cpu->DI++;
                    }
                } while (rep && --cpu->CX);
                return 0;
            }

            case 0xA5: // MOVSW
            {
                sreg_t *_seg = SEGMENT(&cpu->DS);
                if (prefix & PREFIX_REPNZ) return cpu_status_ud;
                int rep = prefix & PREFIX_REPZ;
                size_t count = cpu->CX * 2;
                if (rep && count == 0) return 0;
                // if (rep && cpu->DF == 0
                //     && ((cpu->SI + count) <= 0x10000)
                //     && ((cpu->DI + count) <= 0x10000)
                // ) {
                //     uint8_t *src = mem + _seg->base + cpu->SI;
                //     uint8_t *dst = mem + cpu->ES.base + cpu->DI;
                //     memcpy(dst, src, count);
                //     cpu->SI += count;
                //     cpu->DI += count;
                //     cpu->CX = 0;
                //     return 0;
                // }
                do {
                    WRITE_MEM16(&cpu->ES, cpu->DI, READ_MEM16(_seg, cpu->SI));
                    if (cpu->DF) {
                        cpu->SI -= 2;
                        cpu->DI -= 2;
                    } else {
                        cpu->SI += 2;
                        cpu->DI += 2;
                    }
                } while (rep && --cpu->CX);
                return 0;
            }

            case 0xA6: // CMPSB
            {
                sreg_t *_seg = SEGMENT(&cpu->DS);
                int repz = prefix & PREFIX_REPZ;
                int repnz = prefix & PREFIX_REPNZ;
                int rep = repz | repnz;
                if (rep && cpu->CX == 0) return 0;
                do {
                    int dst = MOVSXB(READ_MEM8(_seg, cpu->SI));
                    int src = MOVSXB(READ_MEM8(&cpu->ES, cpu->DI));
                    int value = dst - src;
                    cpu->AF = (dst & 15) - (src & 15) < 0;
                    cpu->CF = dst < src;
                    SETF8(cpu, value);
                    if (cpu->DF) {
                        cpu->SI--;
                        cpu->DI--;
                    } else {
                        cpu->SI++;
                        cpu->DI++;
                    }
                } while (rep && --cpu->CX && ((repnz && !cpu->ZF) || (repz && cpu->ZF)));
                return 0;
            }

            case 0xA7: // CMPSW
            {
                sreg_t *_seg = SEGMENT(&cpu->DS);
                int repz = prefix & PREFIX_REPZ;
                int repnz = prefix & PREFIX_REPNZ;
                int rep = repz | repnz;
                if (rep && cpu->CX == 0) return 0;
                do {
                    int dst = MOVSXW(READ_MEM16(_seg, cpu->SI));
                    int src = MOVSXW(READ_MEM16(&cpu->ES, cpu->DI));
                    int value = dst - src;
                    cpu->AF = (dst & 15) - (src & 15) < 0;
                    cpu->CF = dst < src;
                    SETF16(cpu, value);
                    if (cpu->DF) {
                        cpu->SI -= 2;
                        cpu->DI -= 2;
                    } else {
                        cpu->SI += 2;
                        cpu->DI += 2;
                    }
                } while (rep && --cpu->CX && ((repnz && !cpu->ZF) || (repz && cpu->ZF)));
                return 0;
            }

            case 0xA8: // TEST AL, imm8
            case 0xA9: // TEST AX, imm16
                set.size = inst & 1;
                set.opr1 = &cpu->AX;
                if (set.size) {
                    set.opr2 = MOVSXW(FETCH16(cpu));
                } else {
                    set.opr2 = MOVSXB(FETCH8(cpu));
                }
                AND(cpu, &set, 1);
                return 0;

            case 0xAA: // STOSB
            {
                sreg_t *_seg = SEGMENT(&cpu->ES);
                if (prefix & PREFIX_REPNZ) return cpu_status_ud;
                int rep = prefix & PREFIX_REPZ;
                size_t count = cpu->CX;
                if (rep && count == 0) return 0;
                // if (rep && cpu->DF == 0 && ((cpu->DI + count) <= 0x10000)) {
                //     uint8_t *p = mem + _seg->base + cpu->DI;
                //     memset(p, cpu->AL, count);
                //     cpu->DI += count;
                //     cpu->CX = 0;
                //     return 0;
                // }
                do {
                    WRITE_MEM8(_seg, cpu->DI, cpu->AL);
                    if (cpu->DF) {
                        cpu->DI--;
                    } else {
                        cpu->DI++;
                    }
                } while (rep && --cpu->CX);
                return 0;
            }

            case 0xAB: // STOSW
            {
                sreg_t *_seg = SEGMENT(&cpu->ES);
                if (prefix & PREFIX_REPNZ) return cpu_status_ud;
                int rep = prefix & PREFIX_REPZ;
                if (rep && cpu->CX == 0) return 0;
                do {
                    WRITE_MEM16(_seg, cpu->DI, cpu->AX);
                    if (cpu->DF) {
                        cpu->DI -= 2;
                    } else {
                        cpu->DI += 2;
                    }
                } while (rep && --cpu->CX);
                return 0;
            }

            case 0xAC: // LODSB
            {
                sreg_t *_seg = SEGMENT(&cpu->DS);
                cpu->AL = READ_MEM8(_seg, cpu->SI);
                if (cpu->DF) {
                    cpu->SI--;
                } else {
                    cpu->SI++;
                }
                return 0;
            }

            case 0xAD: // LODSW
            {
                sreg_t *_seg = SEGMENT(&cpu->DS);
                cpu->AX = READ_MEM16(_seg, cpu->SI);
                if (cpu->DF) {
                    cpu->SI -= 2;
                } else {
                    cpu->SI += 2;
                }
                return 0;
            }

            case 0xAE: // SCASB
            {
                sreg_t *_seg = SEGMENT(&cpu->ES);
                int repz = prefix & PREFIX_REPZ;
                int repnz = prefix & PREFIX_REPNZ;
                int rep = repz | repnz;
                if (rep && cpu->CX == 0) return 0;
                do {
                    int dst = MOVSXB(cpu->AL);
                    int src = MOVSXB(READ_MEM8(_seg, cpu->DI));
                    int value = dst - src;
                    cpu->AF = (dst & 15) - (src & 15) < 0;
                    cpu->CF = dst < src;
                    SETF8(cpu, value);
                    if (cpu->DF) {
                        cpu->DI--;
                    } else {
                        cpu->DI++;
                    }
                } while (rep && --cpu->CX && ((repnz && !cpu->ZF) || (repz && cpu->ZF)));
                return 0;
            }

            case 0xAF: // SCASW
            {
                sreg_t *_seg = SEGMENT(&cpu->ES);
                int repz = prefix & PREFIX_REPZ;
                int repnz = prefix & PREFIX_REPNZ;
                int rep = repz | repnz;
                if (rep && cpu->CX == 0) return 0;
                do {
                    int dst = MOVSXW(cpu->AX);
                    int src = MOVSXW(READ_MEM16(_seg, cpu->DI));
                    int value = dst - src;
                    cpu->AF = (dst & 15) - (src & 15) < 0;
                    cpu->CF = dst < src;
                    SETF16(cpu, value);
                    if (cpu->DF) {
                        cpu->DI -= 2;
                    } else {
                        cpu->DI += 2;
                    }
                } while (rep && --cpu->CX && ((repnz && !cpu->ZF) || (repz && cpu->ZF)));
                return 0;
            }

            case 0xB0: // MOV AL, imm8
            case 0xB1: case 0xB2: case 0xB3: case 0xB4: case 0xB5: case 0xB6: case 0xB7:
                MOVE_TO_REG8(cpu, inst, FETCH8(cpu));
                return 0;

            case 0xB8: // MOV AX, imm16
            case 0xB9: case 0xBA: case 0xBB: case 0xBC: case 0xBD: case 0xBE: case 0xBF:
                cpu->gpr[inst & 7] = FETCH16(cpu);
                return 0;

            case 0xC0: // shift r/m, imm5 (186+)
            case 0xC1: // shift r/m, imm5 (186+)
                MODRM_W(cpu, seg, inst & 1, &set);
                return SHIFT(cpu, &set, FETCH8(cpu));

            case 0xC2: // RET imm16
            {
                uint32_t temp = POP16(cpu);
                cpu->SP += FETCH16(cpu);
                cpu->EIP = temp;
                return 0;
            }

            case 0xC3: // RET
                cpu->EIP = POP16(cpu);
                return 0;

            case 0xC4: // LES reg, r/m
            {
                if (MODRM_W(cpu, seg, 1, &set)) return cpu_status_ud; // VEX
                uint32_t offset = READ_LE16(set.opr1);
                uint16_t new_sel = READ_LE16(set.opr1b + 2);
                LOAD_SEL(cpu, &cpu->ES, new_sel);
                cpu->gpr[set.opr2] = offset;
                return 0;
            }

            case 0xC5: // LDS reg, r/m
            {
                if (MODRM_W(cpu, seg, 1, &set)) return cpu_status_ud; // VEX
                uint32_t offset = READ_LE16(set.opr1);
                uint16_t new_sel = READ_LE16(set.opr1b + 2);
                LOAD_SEL(cpu, &cpu->DS, new_sel);
                cpu->gpr[set.opr2] = offset;
                return 0;
            }

            case 0xC6: // /0 MOV r/m, imm8
            case 0xC7: // /0 MOV r/m, imm16
                MODRM_W(cpu, seg, inst & 1, &set);
                switch (set.opr2) {
                    case 0: // MOV r/m, imm
                        switch (set.size) {
                            case 0:
                                *set.opr1b = FETCH8(cpu);
                                return 0;
                            case 1:
                                WRITE_LE16(set.opr1, FETCH16(cpu));
                                return 0;
                        }
                    default:
                        return cpu_status_ud;
                }

            case 0xC8: // ENTER imm16, imm8
            {
                uint32_t param1 = FETCH16(cpu);
                int param2 = FETCH8(cpu);
                if (param2 != 0) return cpu_status_ud;
                PUSH16(cpu, cpu->BP);
                cpu->BP = cpu->SP;
                cpu->SP -= param1;
                return 0;
            }

            case 0xC9: // LEAVE
                cpu->SP = cpu->BP;
                cpu->BP = POP16(cpu);
                return 0;

            case 0xCA: // RETF imm16
                return RETF(cpu, FETCH16(cpu));

            case 0xCB: // RETF
                return RETF(cpu, 0);

            case 0xCC: // INT 3
                INVOKE_INT(cpu, 3);
                return 0;

            case 0xCD: // INT
                INVOKE_INT(cpu, FETCH8(cpu));
                return 0;

            case 0xCE: // INTO
                if (cpu->OF) {
                    INVOKE_INT(cpu, 4);
                }
                return 0;

            case 0xCF: // IRET
            {
                uint32_t ret_eip = POP16(cpu);
                uint32_t ret_cs = POP16(cpu);
                uint32_t ret_fl = POP16(cpu);
                LOAD_SEL(cpu, &cpu->CS, ret_cs);
                cpu->EIP = ret_eip;
                LOAD_FLAGS(cpu, ret_fl);
                return cpu_status_int;
            }

            case 0xD0: // shift r/m, 1
            case 0xD1: // shift r/m, 1
                MODRM_W(cpu, seg, inst & 1, &set);
                return SHIFT(cpu, &set, 1);

            case 0xD2: // shift r/m, cl
            case 0xD3: // shift r/m, cl
                MODRM_W(cpu, seg, inst & 1, &set);
                return SHIFT(cpu, &set, cpu->CL);

            // case 0xD4: // AAM
            // {
            //     int param = FETCH8(cpu);
            //     int al = cpu->AL;
            //     cpu->AH = al / param;
            //     cpu->AL = SETF8(cpu, al % param);
            //     return 0;
            // }

            // case 0xD5: // AAD
            // case 0xD6: // SETALC

            case 0xD7: // XLAT
                cpu->AL = READ_MEM8(SEGMENT(&cpu->DS), cpu->BX + cpu->AL);
                return 0;

            case 0xD8: // ESC
            case 0xD9: case 0xDA: case 0xDB: case 0xDC: case 0xDD: case 0xDE: case 0xDF:
            {
                // IGNORED
                modrm_t modrm;
                MODRM(cpu, seg, &modrm);
                return cpu_status_fpu;
            }

            case 0xE0: // LOOPNZ
            {
                int disp = MOVSXB(FETCH8(cpu));
                cpu->CX--;
                JCC(cpu, disp, (cpu->CX > 0 && cpu->ZF == 0));
                return 0;
            }

            case 0xE1: // LOOPZ
            {
                int disp = MOVSXB(FETCH8(cpu));
                cpu->CX--;
                JCC(cpu, disp, (cpu->CX > 0 && cpu->ZF != 0));
                return 0;
            }

            case 0xE2: // LOOP
            {
                int disp = MOVSXB(FETCH8(cpu));
                cpu->CX--;
                JCC(cpu, disp, (cpu->CX > 0));
                return 0;
            }

            case 0xE3: // JCXZ
                JCC(cpu, MOVSXB(FETCH8(cpu)), cpu->CX == 0);
                return 0;

            case 0xE4: // IN AL, imm8
                cpu->AL = INPORT8(cpu, FETCH8(cpu));
                return 0;
            
            case 0xE5: // IN AX, imm8
                cpu->AX = INPORT16(cpu, FETCH16(cpu));
                return 0;

            case 0xE6: // OUT imm8, AL
                OUT8(cpu, FETCH8(cpu), cpu->AL);
                return 0;

            case 0xE7: // OUT imm8, AX
                OUT16(cpu, FETCH8(cpu), cpu->AX);
                return 0;

            case 0xE8: // call imm16
            {
                int disp = MOVSXW(FETCH16(cpu));
                PUSH16(cpu, cpu->EIP);
                JCC(cpu, disp, 1);
                return 0;
            }

            case 0xE9: // jmp imm16
            {
                int disp = MOVSXW(FETCH16(cpu));
                JCC(cpu, disp, 1);
                return 0;
            }

            case 0xEA: // jmp far imm32
            {
                uint32_t new_eip = FETCH16(cpu);
                uint16_t new_sel = FETCH16(cpu);
                return FAR_JUMP(cpu, new_sel, new_eip);
            }

            case 0xEB: // jmp d8
            {
                int disp = MOVSXB(FETCH8(cpu));
                JCC(cpu, disp, 1);
                return 0;
            }

            case 0xEC: // IN AL, DX
                cpu->AL = INPORT8(cpu, cpu->DX);
                return 0;

            case 0xED: // IN AX, DX
                cpu->AX = INPORT16(cpu, cpu->DX);
                return 0;

            case 0xEE: // OUT DX, AL
                OUT8(cpu, cpu->DX, cpu->AL);
                return 0;

            case 0xEF: // OUT DX, AX
                OUT16(cpu, cpu->DX, cpu->AX);
                return 0;

            case 0xF0: // prefix LOCK
                prefix |= PREFIX_LOCK;
                break;

            case 0xF1: // ICEBP
                return cpu_status_icebp;

            case 0xF2: // prefix REPNZ
                prefix |= PREFIX_REPNZ;
                break;

            case 0xF3: // prefix REPZ
                prefix |= PREFIX_REPZ;
                break;

            case 0xF4: // HLT
                return cpu_status_halt;

            case 0xF5: // CMC
                cpu->CF ^= 1;
                return 0;

            case 0xF6:
                MODRM_W(cpu, seg, 0, &set);
                switch (set.opr2) {
                    case 0: // TEST r/m8, imm8
                        cpu->CF = 0;
                        SETF8(cpu, *set.opr1b & FETCH8(cpu));
                        return 0;
                    case 1: // TEST?
                        return cpu_status_ud;
                    case 2: // NOT r/m8
                        *set.opr1b = ~*set.opr1b;
                        return 0;
                    case 3: // NEG r/m8
                    {
                        int src = *set.opr1b;
                        cpu->AF = (src & 15);
                        cpu->CF = !!src;
                        *set.opr1b = SETF8(cpu, -src);
                        return 0;
                    }
                    case 4: // MUL al, r/m8
                        cpu->AX = cpu->AL * *set.opr1b;
                        cpu->OF = cpu->CF = (cpu->AH != 0);
                        return 0;
                    case 5: // IMUL al, r/m8
                        cpu->AX = MOVSXB(cpu->AL) * MOVSXB(*set.opr1b);
                        cpu->OF = cpu->CF = (MOVSXB(cpu->AL) != MOVSXW(cpu->AX));
                        return 0;
                    case 6: // DIV ax, r/m8
                    {
                        uint32_t dst = cpu->AX;
                        uint32_t src = *set.opr1b;
                        if (src == 0) return cpu_status_div;
                        uint32_t value = dst / src;
                        if (value > 0x100) return cpu_status_div;
                        cpu->AL = value;
                        cpu->AH = dst % src;
                        return 0;
                    }
                    case 7: // IDIV ax, r/m8
                    {
                        int dst = MOVSXW(cpu->AX);
                        int src = MOVSXB(*set.opr1b);
                        if (src == 0) return cpu_status_div;
                        int value = dst / src;
                        if (value != MOVSXB(value)) return cpu_status_div;
                        cpu->AL = value;
                        cpu->AH = dst % src;
                        return 0;
                    }
                }
            case 0xF7:
                MODRM_W(cpu, seg, 1, &set);
                switch (set.opr2) {
                    case 0: // TEST r/m16, imm16
                        cpu->CF = 0;
                        SETF16(cpu, *set.opr1b & FETCH16(cpu));
                        return 0;
                    case 1: // TEST?
                        return cpu_status_ud;
                    case 2: // NOT r/m16
                        WRITE_LE16(set.opr1, READ_LE16(set.opr1));
                        return 0;
                    case 3: // NEG r/m16
                    {
                        int src = READ_LE16(set.opr1);
                        cpu->AF = (src & 15);
                        cpu->CF = !!src;
                        WRITE_LE16(set.opr1, SETF16(cpu, -src));
                        return 0;
                    }
                    case 4: // MUL ax, r/m16
                    {
                        uint32_t value = cpu->AX * READ_LE16(set.opr1);
                        cpu->AX = value;
                        cpu->DX = value >> 16;
                        cpu->OF = cpu->CF = (cpu->DX != 0);
                        return 0;
                    }
                    case 5: // IMUL al, r/m16
                    {
                        int value = MOVSXW(cpu->AX) * MOVSXW(READ_LE16(set.opr1));
                        cpu->AX = value;
                        cpu->DX = value >> 16;
                        int check = cpu->AX + (cpu->DX << 16);
                        cpu->OF = cpu->CF = (MOVSXW(cpu->AX) != check);
                        return 0;
                    }
                    case 6: // DIV ax, r/m16
                    {
                        uint32_t dst = (cpu->DX << 16) | cpu->AX;
                        uint32_t src = READ_LE16(set.opr1);
                        if (src == 0) return cpu_status_div;
                        uint32_t value = dst / src;
                        if (value > 0x10000) return cpu_status_div;
                        cpu->AX = value;
                        cpu->DX = dst % src;
                        return 0;
                    }
                    case 7: // IDIV ax, r/m16
                    {
                        int dst = (cpu->DX << 16) | cpu->AX;
                        int src = MOVSXW(READ_LE16(set.opr1));
                        if (src == 0) return cpu_status_div;
                        int value = dst / src;
                        if (value != MOVSXW(value)) return cpu_status_div;
                        cpu->AX = value;
                        cpu->DX = dst % src;
                        return 0;
                    }
                }

            case 0xF8: // CLC
                cpu->CF = 0;
                return 0;

            case 0xF9: // STC
                cpu->CF = 1;
                return 0;

            case 0xFA: // CLI
                cpu->IF = 0;
                return 0;

            case 0xFB: // STI
                if (!cpu->IF) {
                    cpu->IF = 1;
                    return cpu_status_int;
                }
                return 0;

            case 0xFC: // CLD
                cpu->DF = 0;
                return 0;

            case 0xFD: // STD
                cpu->DF = 1;
                return 0;

            case 0xFE: //
            {
                int value;
                MODRM_W(cpu, seg, 0, &set);
                switch (set.opr2) {
                    case 0: // INC r/m8
                        *set.opr1b = value = SETF8(cpu, *set.opr1b + 1);
                        cpu->AF = !(value & 15);
                        return 0;
                    case 1: // DEC r/m8
                        *set.opr1b = value = SETF8(cpu, *set.opr1b - 1);
                        cpu->AF = (value & 15) == 15;
                        return 0;
                    default:
                        return cpu_status_ud;
                }
            }
            case 0xFF: //
            {
                int value;
                int mod = MODRM_W(cpu, seg, 0, &set);
                switch (set.opr2) {
                    case 0: // INC r/m16
                        WRITE_LE16(set.opr1, value = SETF16(cpu, READ_LE16(set.opr1) + 1));
                        cpu->AF = !(value & 15);
                        return 0;
                    case 1: // DEC r/m16
                        WRITE_LE16(set.opr1, value = SETF16(cpu, READ_LE16(set.opr1) - 1));
                        cpu->AF = (value & 15) == 15;
                        return 0;
                    case 2: // CALL r/m16
                        PUSH16(cpu, cpu->EIP);
                        cpu->EIP = READ_LE16(set.opr1);
                        return 0;
                    case 3: // CALL FAR m16:16
                    {
                        if (mod) return cpu_status_ud;
                        uint32_t new_eip = READ_LE16(set.opr1b);
                        uint16_t new_sel = READ_LE16(set.opr1b + 2);
                        return FAR_CALL(cpu, new_sel, new_eip);
                    }
                    case 4: // JMP r/m 16
                        cpu->EIP = READ_LE16(set.opr1);
                        return 0;
                    case 5: // JMP FAR m16:16
                    {
                        if (mod) return cpu_status_ud;
                        uint32_t new_eip = READ_LE16(set.opr1b);
                        uint16_t new_sel = READ_LE16(set.opr1b + 2);
                        return FAR_JUMP(cpu, new_sel, new_eip);
                    }
                    case 6: // PUSH r/m16
                        PUSH16(cpu, READ_LE16(set.opr1));
                        return 0;
                    default: // FF FF (#ud)
                        return cpu_status_ud;
                }
            }

            case 0x0F80: // JO d16
                JCC(cpu, MOVSXW(FETCH16(cpu)), cpu->OF);
                return 0;

            case 0x0F81: // JNO d16
                JCC(cpu, MOVSXW(FETCH16(cpu)), !cpu->OF);
                return 0;

            case 0x0F82: // JC d16
                JCC(cpu, MOVSXW(FETCH16(cpu)), cpu->CF);
                return 0;

            case 0x0F83: // JNC d16
                JCC(cpu, MOVSXW(FETCH16(cpu)), !cpu->CF);
                return 0;

            case 0x0F84: // JZ d16
                JCC(cpu, MOVSXW(FETCH16(cpu)), cpu->ZF);
                return 0;

            case 0x0F85: // JNZ d16
                JCC(cpu, MOVSXW(FETCH16(cpu)), !cpu->ZF);
                return 0;

            case 0x0F86: // JBE d16
                JCC(cpu, MOVSXW(FETCH16(cpu)), cpu->CF || cpu->ZF);
                return 0;

            case 0x0F87: // JNBE d16
                JCC(cpu, MOVSXW(FETCH16(cpu)), !(cpu->CF || cpu->ZF));
                return 0;

            case 0x0F88: // JS d16
                JCC(cpu, MOVSXW(FETCH16(cpu)), cpu->SF);
                return 0;

            case 0x0F89: // JNS d16
                JCC(cpu, MOVSXW(FETCH16(cpu)), !cpu->SF);
                return 0;

            case 0x0F8A: // JP d16
                JCC(cpu, MOVSXW(FETCH16(cpu)), cpu->PF);
                return 0;

            case 0x0F8B: // JNP d16
                JCC(cpu, MOVSXW(FETCH16(cpu)), !cpu->PF);
                return 0;

            case 0x0F8C: // JL d16
                JCC(cpu, MOVSXW(FETCH16(cpu)), cpu->SF != cpu->OF);
                return 0;

            case 0x0F8D: // JNL d16
                JCC(cpu, MOVSXW(FETCH16(cpu)), cpu->SF == cpu->OF);
                return 0;

            case 0x0F8E: // JLE d16
                JCC(cpu, MOVSXW(FETCH16(cpu)), cpu->ZF || (cpu->SF != cpu->OF));
                return 0;

            case 0x0F8F: // JG d16
                JCC(cpu, MOVSXW(FETCH16(cpu)), !(cpu->ZF || cpu->SF != cpu->OF));
                return 0;

            default:
                return cpu_status_ud;
        }
    }
}

void dump_regs(cpu_state *cpu, uint32_t eip) {
    char buff[256];
    char *p = buff;
    p = dump_string(p, "CS:IP ");
    p = dump16(p, cpu->CS.sel);
    *p++ = ':';
    if (eip > 0xFFFF) {
        p = dump32(p, eip);
    } else {
        p = dump16(p, eip);
    }
    p = dump_string(p, " SS:SP ");
    p = dump16(p, cpu->SS.sel);
    *p++ = ':';
    uint32_t esp = cpu->ESP;
    if (esp > 0xFFFF) {
        p = dump32(p, esp);
    } else {
        p = dump16(p, esp);
    }

    for (int i = 0; i < 3; i++) {
        *p++ = ' ';
        p = dump8(p, READ_MEM8(&cpu->CS, eip + i));
    }

    p = dump_string(p, "\nAX ");
    p = dump16(p, cpu->EAX);
    p = dump_string(p, " BX ");
    p = dump16(p, cpu->EBX);
    p = dump_string(p, " CX ");
    p = dump16(p, cpu->ECX);
    p = dump_string(p, " DX ");
    p = dump16(p, cpu->EDX);
    p = dump_string(p, " BP ");
    p = dump16(p, cpu->EBP);
    p = dump_string(p, " SI ");
    p = dump16(p, cpu->ESI);
    p = dump_string(p, " DI ");
    p = dump16(p, cpu->EDI);
    p = dump_string(p, "\nDS ");
    p = dump16(p, cpu->DS.sel);
    p = dump_string(p, " ES ");
    p = dump16(p, cpu->ES.sel);
    p = dump_string(p, " FS ");
    p = dump16(p, cpu->FS.sel);
    p = dump_string(p, " GS ");
    p = dump16(p, cpu->GS.sel);
    p = dump_string(p, " flags ");
    p = dump16(p, cpu->eflags);
    *p++ = ' ';
    *p++ = cpu->OF ? 'O' : '-';
    *p++ = cpu->DF ? 'D' : 'U';
    *p++ = cpu->IF ? 'I' : '-';
    *p++ = cpu->SF ? 'S' : '-';
    *p++ = cpu->ZF ? 'Z' : '-';
    *p++ = cpu->PF ? 'P' : '-';
    *p++ = cpu->CF ? 'C' : '-';
    println(buff);
}

void cpu_reset(cpu_state *cpu, int gen) {
    memset(cpu, 0, sizeof(cpu_state));
    if (gen >= 0) {
        cpu->cpu_gen = gen;
    }
    cpu->flags_mask = 0x003F7FD5;
    cpu->flags_mask1 = 0x00000002;
    if (cpu->cpu_gen < cpu_gen_80286) {
        cpu->flags_mask1 |= 0xF000;
    }
    LOAD_FLAGS(cpu, 0);
    cpu->EIP = 0x0000FFF0;
    cpu->CS.sel = 0xF000;
    cpu->CS.base = 0x000F0000;
    cpu->CS.attrs = 0x009B;
    cpu->DS.attrs = 0x0093;
    cpu->ES.attrs = 0x0093;
    cpu->SS.attrs = 0x0093;
    cpu->FS.attrs = 0x0093;
    cpu->GS.attrs = 0x0093;
    for (int i = 0; i < 6; i++) {
        cpu->sregs[i].limit = 0x0000FFFF;
    }
    cpu->CR[0] = 0x60000010;
    cpu->GDT.limit = 0xFFFF;
    cpu->IDT.limit = 0xFFFF;
    cpu->LDT.limit = 0xFFFF;
    cpu->TSS.limit = 0xFFFF;
    cpu->EDX = cpu->cpu_gen << 8;
}

WASM_EXPORT void *_init() {
    // memset(mem + 0xA0000, 0xFF, 0x50000);
    return mem;
}

static void check_irq(cpu_state *cpu) {
    if (cpu->IF) {
        int vector = vpc_irq();
        if (vector) {
            INVOKE_INT(cpu, vector);
            cpu->IF = 0;
        }
    }
}

#define CPU_INTERVAL    0x100000
static int cpu_block(cpu_state *cpu) {
    check_irq(cpu);
    for (int i = 0; i < CPU_INTERVAL; i++) {
        uint32_t last_known_eip = cpu->EIP;
        if (last_known_eip > 0xFFFF) return cpu_status_gpf;
        int status = cpu_step(cpu);
        switch (status) {
            case cpu_status_normal:
                break;
            case cpu_status_int:
                check_irq(cpu);
                break;
            case cpu_status_icebp:
                dump_regs(cpu, cpu->EIP);
                break;
            case cpu_status_div:
                if (cpu->cpu_gen >= cpu_gen_80286) {
                    cpu->EIP = last_known_eip;
                }
                INVOKE_INT(cpu, 0); // #DE
                break;
            case cpu_status_halt:
                return status;
            case cpu_status_ud:
            default:
                cpu->EIP = last_known_eip;
                return status;
        }
    }
    return 0;
}

WASM_EXPORT cpu_state *alloc_cpu(int gen) {
    static cpu_state cpu;
    cpu_reset(&cpu, gen);
    return &cpu;
}

WASM_EXPORT int run(cpu_state *cpu) {
    int status = cpu_block(cpu);
    switch (status) {
        case cpu_status_normal:
        case cpu_status_exit:
            return status;
        case cpu_status_halt:
            if (cpu->IF) {
                return cpu_status_halt;
            } else {
                println("**** SYSTEM HALTED");
                dump_regs(cpu, cpu->EIP);
                return cpu_status_exit;
            }
        case cpu_status_div:
            println("**** DIVIDE ERROR");
            dump_regs(cpu, cpu->EIP);
            return status;
        case cpu_status_ud:
            println("**** PANIC: UNDEFINED INSTRUCTION");
            dump_regs(cpu, cpu->EIP);
            return status;
        default:
            println("**** PANIC: TRIPLE FAULT!!!");
            dump_regs(cpu, cpu->EIP);
            return status;
    }
}

WASM_EXPORT int step(cpu_state *cpu) {
    int status = cpu_step(cpu);
    return status;
}

WASM_EXPORT void debug_dump(cpu_state *cpu) {
    dump_regs(cpu, cpu->EIP);
}
