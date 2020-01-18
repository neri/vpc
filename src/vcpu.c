// Virtual Playground
// Copyright (c) 2019 Nerry

#include <stdint.h>

#define NULL 0
typedef uintptr_t size_t;

#define WASM_EXPORT __attribute__((visibility("default")))
#define WASM_IMPORT extern
#define WASM_PAGESIZE   0x10000

WASM_IMPORT void println(const char *);
WASM_IMPORT void vpc_outb(int port, int value);
WASM_IMPORT int vpc_inb(int port);
WASM_IMPORT void vpc_outw(int port, int value);
WASM_IMPORT int vpc_inw(int port);
WASM_IMPORT void vpc_outd(int port, uint32_t value);
WASM_IMPORT uint32_t vpc_ind(int port);
WASM_IMPORT int vpc_irq();
WASM_IMPORT _Noreturn void TRAP_NORETURN();
WASM_IMPORT int vpc_grow(int n);

#include "disasm.h"


void *memset(void *p, int v, size_t n) {
    uint8_t *_p = p;
    for (size_t i = 0; i < n; i++) {
        *_p++ = v;
    }
    return p;
}

void *memcpy(void *p, const void *q, size_t n) {
    uint8_t *_p = p;
    const uint8_t *_q = q;
    for (size_t i = 0; i < n; i++) {
        *_p++ = *_q++;
    }
    return p;
}


typedef struct cpu_state cpu_state;
typedef struct sreg_t sreg_t;
WASM_EXPORT void cpu_reset(cpu_state *cpu, int gen);
WASM_EXPORT void dump_regs(cpu_state *cpu, uint32_t eip);
char *dump_disasm(char *p, cpu_state *cpu, uint32_t eip);
int get_inst_len(cpu_state *cpu);

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
    cpu_status_periodic = 0,
    cpu_status_significant,
    cpu_status_pause,
    cpu_status_inta,
    cpu_status_icebp,
    cpu_status_halt = 0x1000,
    cpu_status_exception = 0x10000,
    cpu_status_exit,
    cpu_status_div,
    cpu_status_exception_base,
    cpu_status_ud = 0x60000,
    cpu_status_fpu = 0x70000,
    cpu_status_double = 0x80000,
    cpu_status_invalid_tss = 0xA0000,
    cpu_status_not_present = 0xB0000,
    cpu_status_stack = 0xC0000,
    cpu_status_gpf = 0xD0000,
    cpu_status_page = 0xE0000,
    cpu_status_exception_mask = 0x00FF0000,
} cpu_status_t;

typedef uint32_t paddr_t;

typedef struct sreg_t {
    union {
        uint16_t sel;
        struct {
            uint16_t rpl:2;
            uint16_t ti:1;
            uint16_t sel_index:13;
        };
    };
    uint32_t limit;
    paddr_t base;
    union {
        uint32_t attrs;
        struct {
            uint8_t attr_u8l, attr_u8h;
        };
        struct {
            uint8_t attr_type:4;
            uint8_t attr_S:1;
            uint8_t attr_DPL:2;
            uint8_t attr_P:1;
            uint8_t limit_2:4;
            uint8_t attr_AVL:1;
            uint8_t attr_L:1;
            uint8_t attr_D:1;
            uint8_t attr_G:1;
        };
    };
} desc_t;

typedef desc_t sreg_t;

typedef struct {
    uint16_t limit_1;
    uint16_t base_1;
    uint8_t base_2;
    union {
        uint8_t attr_1;
        struct {
            uint8_t attr_type5:5;
        };
        struct {
            uint8_t attr_type:4;
            uint8_t attr_S:1;
            uint8_t attr_DPL:2;
            uint8_t attr_P:1;
        };
    };
    union {
        uint8_t attr_2;
        struct {
            uint8_t limit_2:4;
            uint8_t attr_AVL:1;
            uint8_t attr_L:1;
            uint8_t attr_D:1;
            uint8_t attr_G:1;
        };
    };
    uint8_t base_3;
} seg_desc_t;

typedef struct {
    uint16_t offset_1;
    uint16_t sel;
    uint8_t reserved;
    union {
        uint8_t attr_1;
        struct {
            uint8_t attr_type:4;
            uint8_t attr_S:1;
            uint8_t attr_DPL:2;
            uint8_t attr_P:1;
        };
    };
    uint16_t offset_2;
} gate_desc_t;

enum {
    type_unavailable,
    type_tss16_available = 1,
    type_ldt,
    type_tss16_busy,
    type_call_gate16,
    type_task_gate,
    type_intr_gate16,
    type_trap_gate16,
    type_tss32_available = 9,
    type_tss32_busy = 11,
    type_call_gate32,
    type_intr_gate32 = 14,
    type_trap_gate32,
    type_segment,

    CPU_CTX_DATA32 = 0x00000001,
    CPU_CTX_ADDR32 = 0x00000002,
    SEG_CTX_DEFAULT_DATA32 = 0x00000010,
    SEG_CTX_DEFAULT_ADDR32 = 0x00000020,
};

typedef enum {
    type_bitmap_TSS32       = 0x00000200,
    type_bitmap_LDT         = 0x00000004,
    type_bitmap_INT_GATE    = 0x0000C000,
    type_bitmap_SEG_ALL     = 0xFF0F0000,
    type_bitmap_SEG_EXEC    = 0xFF000000,
    type_bitmap_SEG_READ    = 0xCC0F0000,
    type_bitmap_SEG_WRITE   = 0x000C0000,
} desc_type_bitmap_t;


typedef union {
    uint32_t value;
    struct {
        uint32_t msw:4;
    };
    struct {
        uint32_t PE:1;
        uint32_t MP:1;
        uint32_t EM:1;
        uint32_t TS:1;
        uint32_t ET:1;
        uint32_t NE:1;
        uint32_t :10;
        uint32_t WP:1;
        uint32_t :1;
        uint32_t AM:1;
        uint32_t :10;
        uint32_t NW:1;
        uint32_t CD:1;
        uint32_t PG:1;
    };
} control_register_0_t;

typedef union {
    uint32_t value;
    struct {
        uint32_t VME:1;
        uint32_t PVI:1;
        uint32_t TSD:1;
        uint32_t DE:1;
        uint32_t PSE:1;
        uint32_t PAE:1;
        uint32_t MCE:1;
        uint32_t PGE:1;
        uint32_t OSFXSR:1;
        uint32_t OSXMMEXCPT:1;
        uint32_t UMIP:1;
        uint32_t LA57:1;
        uint32_t VMXE:1;
        uint32_t SMXE:1;
        uint32_t FSGSBASE:1;
        uint32_t PCIDE:1;
        uint32_t OSXSAVE:1;
        uint32_t SMEP:1;
        uint32_t SMAP:1;
        uint32_t PKE:1;
    };
} control_register_4_t;

#define MAX_BREAKPOINTS 1
typedef struct {
    uint32_t offset;
    uint16_t sel;
} bp_vec_t;

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

    union {
        sreg_t sregs[8];
        struct {
            sreg_t ES, CS, SS, DS, FS, GS;
        };
    };
    desc_t GDT;
    desc_t IDT;
    sreg_t LDT;
    sreg_t TSS;

    union {
        uint32_t CR[8];
        struct {
            control_register_0_t CR0;
            uint32_t _CR1, CR2, CR3;
            control_register_4_t CR4;
        };
    };

    bp_vec_t bps[MAX_BREAKPOINTS];
    int n_bps;

    unsigned RPL, CPL;
    uint64_t time_stamp_counter;
    uint32_t flags_mask, flags_mask1, flags_preserve_popf, flags_preserve_iret3, flags_mask_intrm;
    uint32_t cr0_valid, cr4_valid;
    uint32_t cpuid_model_id;
    unsigned cpu_gen, cpu_context, default_context;

} cpu_state;


#define VOID_MEMORY_VALUE 0xDEADBEEF
size_t max_mem = 0;
intptr_t null_ptr;
uint8_t *mem = NULL;

/**
 * Initialize internal structures.
 * 
 * THIS FUNCTION MUST BE CALLED BEFORE ALL OTHER FUNCTIONS.
 */
WASM_EXPORT void *_init(uint32_t mb) {
    max_mem = mb * 1024 * 1024;
    mem = (void* )(vpc_grow(max_mem / WASM_PAGESIZE + 1) * WASM_PAGESIZE);
    null_ptr = 0 - (intptr_t)mem;
    return mem;
}


static inline void set_flag_to(uint32_t *word, uint32_t mask, int value) {
    if (value) {
        *word |= mask;
    } else {
        *word &= ~mask;
    }
}


static inline int RAISE_GPF(uint16_t errcode) {
    return cpu_status_gpf | errcode;
}

static inline int RAISE_STACK_FAULT(uint16_t errcode) {
    return cpu_status_stack | errcode;
}

static inline int RAISE_NOT_PRESENT(uint16_t errcode) {
    return cpu_status_not_present | errcode;
}

static inline int RAISE_INVALID_TSS(uint16_t errcode) {
    return cpu_status_invalid_tss | errcode;
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

char *dump_dec(char *p, uint32_t value) {
    char buff[16];
    size_t l = 0;
    for (; value; l++) {
        buff[l] = (value % 10) + '0';
        value /= 10;
    }
    for (int i = 0; i < l; i++) {
        *p++ = buff[l - i - 1];
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

static inline uint8_t *LEA_REG8(cpu_state *cpu, int index) {
    int i = index & 3;
    uint8_t *p = (uint8_t*)(&cpu->gpr[i]);
    if (index & 4) {
        return p + 1;
    } else {
        return p;
    }
}

static inline void WRITE_REG8(cpu_state *cpu, int index, uint8_t value) {
    *LEA_REG8(cpu, index) = value;
}

static inline uint8_t READ_REG8(cpu_state *cpu, int index) {
    return *LEA_REG8(cpu, index);
}

static inline uint16_t READ_LE16(void *la) {
    if (la == NULL) return UINT16_MAX;
    uint16_t *p = la;
    return *p;
}

static inline uint32_t READ_LE32(void *la) {
    if (la == NULL) return VOID_MEMORY_VALUE;
    uint32_t *p = la;
    return *p;
}

static inline void WRITE_LE16(void *la, uint16_t value) {
    if (la == NULL) return;
    uint16_t *p = la;
    *p = value;
}

static inline void WRITE_LE32(void *la, uint32_t value) {
    if (la == NULL) return;
    uint32_t *p = la;
    *p = value;
}

static inline uint8_t READ_MEM8(sreg_t *sreg, uint32_t offset) {
    uint32_t linear = sreg->base + offset;
    if (linear < max_mem) {
        return mem[linear];
    } else {
        return UINT8_MAX;
    }
}

static inline uint16_t READ_MEM16(sreg_t *sreg, uint32_t offset) {
    uint32_t linear = sreg->base + offset;
    if (linear < max_mem) {
        return READ_LE16(mem + linear);
    } else {
        return UINT16_MAX;
    }
}

static inline uint32_t READ_MEM32(sreg_t *sreg, uint32_t offset) {
    uint32_t linear = sreg->base + offset;
    if (linear < max_mem) {
        return READ_LE32(mem + linear);
    } else {
        return VOID_MEMORY_VALUE;
    }
}

static inline void WRITE_MEM8(sreg_t *sreg, uint32_t offset, int value) {
    uint32_t linear = sreg->base + offset;
    if (linear < max_mem) {
        mem[linear] = value;
    }
}

static inline void WRITE_MEM16(sreg_t *sreg, uint32_t offset, uint16_t value) {
    uint32_t linear = sreg->base + offset;
    if (linear < max_mem) {
        WRITE_LE16(mem + linear, value);
    }
}

static inline void WRITE_MEM32(sreg_t *sreg, uint32_t offset, uint32_t value) {
    uint32_t linear = sreg->base + offset;
    if (linear < max_mem) {
        WRITE_LE32(mem + linear, value);
    }
}

static inline int MOVSXB(uint8_t b) {
    return (int)(int8_t)b;
}

static inline int MOVSXW(uint16_t w) {
    return (int)(int16_t)w;
}

static inline int64_t MOVSXD(uint32_t d) {
    return (int64_t)(int32_t)d;
}

static inline int CS_LIMIT_CHECK(cpu_state *cpu, int default_value) {
    if (cpu->EIP > cpu->CS.limit) return cpu_status_gpf;
    return default_value;
}

static inline uint8_t FETCH8(cpu_state *cpu) {
    uint8_t result = mem[cpu->CS.base + cpu->EIP];
    cpu->EIP += 1;
    return result;
}

static inline uint16_t FETCH16(cpu_state *cpu) {
    uint16_t result = READ_MEM16(&cpu->CS, cpu->EIP);
    cpu->EIP += 2;
    return result;
}

static inline uint32_t FETCH32(cpu_state *cpu) {
    uint32_t result = READ_MEM32(&cpu->CS, cpu->EIP);
    cpu->EIP += 4;
    return result;
}

static inline uint32_t FETCHW(cpu_state *cpu) {
    if (cpu->cpu_context & CPU_CTX_DATA32) {
        return FETCH32(cpu);
    } else {
        return FETCH16(cpu);
    }
}

static uint32_t POPW(cpu_state *cpu) {
    int addr32 = (cpu->cpu_context & CPU_CTX_ADDR32);
    int data32 = (cpu->cpu_context & CPU_CTX_DATA32);
    uint32_t result;
    uint32_t esp = cpu->ESP;
    if (!addr32) {
        esp &= 0xFFFF;
    }
    if (data32) {
        result = READ_MEM32(&cpu->SS, esp);
        esp += 4;
    } else {
        result = READ_MEM16(&cpu->SS, esp);
        esp += 2;
    }
    if (addr32) {
        cpu->ESP = esp;
    } else {
        cpu->SP = esp;
    }
    return result;
}

static int _PUSHW(cpu_state *cpu, uint32_t value) {
    int addr32 = (cpu->cpu_context & CPU_CTX_ADDR32);
    int data32 = (cpu->cpu_context & CPU_CTX_DATA32);
    uint32_t esp = cpu->ESP;
    if (!addr32) {
        esp &= 0xFFFF;
        if (!esp) esp = 0x10000;
    }
    if (data32) {
        if (esp < 4) return cpu_status_stack;
        esp -= 4;
        WRITE_MEM32(&cpu->SS, esp, value);
    } else {
        if (esp < 2) return cpu_status_stack;
        esp -= 2;
        WRITE_MEM16(&cpu->SS, esp, value);
    }
    if (addr32) {
        cpu->ESP = esp;
    } else {
        cpu->SP = esp;
    }
    return 0;
}
#define PUSHW(cpu, v) do { int status = _PUSHW(cpu, v); if (status) return status; } while(0)

static inline void LOAD_FLAGS(cpu_state *cpu, int value, uint32_t preserve_mask) {
    cpu->eflags = (cpu->eflags & preserve_mask) | 
        (((value & cpu->flags_mask) | cpu->flags_mask1) & ~preserve_mask);
}

static inline int is_kernel(cpu_state *cpu) {
    return (!cpu->CR0.PE || (!cpu->VM && (cpu->RPL == 0)));
}

static inline int LOAD_SEL8086(cpu_state *cpu, sreg_t *sreg, uint16_t value) {
    sreg->sel = value;
    sreg->base = value << 4;
    sreg->limit = UINT16_MAX;
    sreg->attrs = 0x0093;
    if (sreg == &cpu->CS) {
        cpu->default_context = 0;
    }
    return 0;
}

static int LOAD_DESCRIPTOR(cpu_state *cpu, desc_t *target, uint16_t selector, desc_type_bitmap_t type_bitmap, int allow_null, seg_desc_t *table) {
    if (!cpu->CR0.PE || cpu->VM) {
        // Real mode or Virtual Mode
        target->sel = selector;
        target->base = selector << 4;
    } else if (selector < 4) {
        // Null Selector
        if (allow_null) {
            target->sel = selector;
            target->base = 0;
            target->limit = UINT16_MAX;
        } else {
            return RAISE_GPF(0);
        }
    } else {

        uint32_t errcode = selector & 0xFFFC;
        unsigned index = selector >> 3;
        desc_t desc_table;
        if (selector & 0x0004) {
            desc_table = cpu->LDT;
            if (!desc_table.sel) {
                return RAISE_GPF(errcode);
            }
        } else {
            desc_table = cpu->GDT;
        }

        // Descriptor Table Limit check
        if ((selector | 7) > desc_table.limit) {
            return RAISE_GPF(errcode);
        }

        seg_desc_t *xdt = (seg_desc_t *)(mem + desc_table.base);
        seg_desc_t new_desc = xdt[index];

        // Type and Presence Check
        if (type_bitmap) {
            if (((1 << new_desc.attr_type5) & type_bitmap) == 0) return RAISE_GPF(errcode);
        }
        if (new_desc.attr_P == 0) return RAISE_NOT_PRESENT(errcode);

        // Accessed (Segment)
        if (new_desc.attr_S) {
            xdt[index].attr_1 |= 1;
        }

        // Load
        target->attrs = new_desc.attr_1 | (new_desc.attr_2 << 8);
        target->base = new_desc.base_1 + (new_desc.base_2 << 16) + (new_desc.base_3 << 24);
        uint32_t limit = new_desc.limit_1 + (new_desc.limit_2 << 16);
        if (new_desc.attr_G) {
            limit = (limit << 12) | 0x00000FFF;
        }
        target->limit = limit;
        target->sel = selector;
    }
    if (target == &cpu->CS) {
        if (cpu->VM) {
            cpu->CPL = 3;
            cpu->RPL = 3;
            cpu->default_context = 0;
        } else {
            if (cpu->CR0.PE) {
                cpu->RPL = selector & 3;
            }
            set_flag_to(&cpu->default_context,
            CPU_CTX_ADDR32 | CPU_CTX_DATA32 | SEG_CTX_DEFAULT_ADDR32 | SEG_CTX_DEFAULT_DATA32,
            cpu->CS.attr_D);
        }
    }
    if (cpu->CR0.PE && target == &cpu->SS) {
        cpu->CPL = selector & 3;
    }
    return 0;
}

static int POP_SEG(cpu_state *cpu, desc_t *desc, desc_type_bitmap_t bitmap, int allow_null) {
    uint32_t old_esp = cpu->ESP;
    uint16_t sel = POPW(cpu);
    int status = LOAD_DESCRIPTOR(cpu, desc, sel, bitmap, allow_null, NULL);
    if (status >= cpu_status_exception) {
        cpu->ESP = old_esp;
    }
    return status;
}

typedef struct {
    union {
        uint16_t link;
        uint32_t _reserved;
    };
    uint32_t ESP0;
    uint32_t SS0;
    uint32_t ESP1;
    uint32_t SS1;
    uint32_t ESP2;
    uint32_t SS2;
    uint32_t CR3;
    uint32_t EIP, eflags, EAX, ECX, EDX, EBX, ESP, EBP, ESI, EDI;
    uint32_t ES, CS, SS, DS, FS, GS;
    uint32_t LDT;
    uint16_t _reserved64;
    uint16_t IOPB;
} tss_t;

static int TSS_switch_context(cpu_state *cpu, desc_t *new_tss, int link) {
    tss_t *current = (tss_t *)(mem + cpu->TSS.base);
    tss_t *next = (tss_t *)(mem + new_tss->base);

    // cpu->time_stamp_counter += 500;

    current->CR3 = cpu->CR3;
    current->EIP = cpu->EIP;
    current->eflags = cpu->eflags;
    current->EAX = cpu->EAX;
    current->ECX = cpu->ECX;
    current->EDX = cpu->EDX;
    current->EBX = cpu->EBX;
    current->ESP = cpu->ESP;
    current->EBP = cpu->EBP;
    current->ESI = cpu->ESI;
    current->EDI = cpu->EDI;
    current->ES = cpu->ES.sel;
    current->CS = cpu->CS.sel;
    current->SS = cpu->SS.sel;
    current->DS = cpu->DS.sel;
    current->FS = cpu->FS.sel;
    current->GS = cpu->GS.sel;
    current->LDT = cpu->LDT.sel;

    if (link) {
        next->link = cpu->TSS.sel;
    }
    cpu->TSS = *new_tss;

    cpu->EIP = next->EIP;
    cpu->eflags = next->eflags;
    cpu->EAX = next->EAX;
    cpu->ECX = next->ECX;
    cpu->EDX = next->EDX;
    cpu->EBX = next->EBX;
    cpu->ESP = next->ESP;
    cpu->EBP = next->EBP;
    cpu->ESI = next->ESI;
    cpu->EDI = next->EDI;
    LOAD_DESCRIPTOR(cpu, &cpu->LDT, next->LDT, type_bitmap_LDT, 1, NULL);
    LOAD_DESCRIPTOR(cpu, &cpu->ES, next->ES, 0, 1, NULL);
    LOAD_DESCRIPTOR(cpu, &cpu->CS, next->CS, 0, 0, NULL);
    LOAD_DESCRIPTOR(cpu, &cpu->SS, next->SS, 0, 0, NULL);
    LOAD_DESCRIPTOR(cpu, &cpu->DS, next->DS, 0, 1, NULL);
    LOAD_DESCRIPTOR(cpu, &cpu->FS, next->FS, 0, 1, NULL);
    LOAD_DESCRIPTOR(cpu, &cpu->GS, next->GS, 0, 1, NULL);

    cpu->CR0.TS = 1;

    // return RAISE_INVALID_TSS(new_tss->sel);
    return cpu_status_inta;
}

static int FAR_CALL(cpu_state *cpu, uint16_t new_csel, uint32_t new_eip) {

    if (new_csel == 0 && new_eip == 0) return cpu_status_gpf;

    if (cpu->CR0.PE && !cpu->VM) return cpu_status_ud;

    uint32_t old_csel = cpu->CS.sel;
    uint32_t old_eip = cpu->EIP;
    sreg_t new_cs;
    int status = LOAD_DESCRIPTOR(cpu, &new_cs, new_csel, type_bitmap_SEG_EXEC, 0, NULL);
    if (status) return status;

    LOAD_DESCRIPTOR(cpu, &cpu->CS, new_csel, 0, 0, NULL);
    cpu->EIP = new_eip;
    PUSHW(cpu, old_csel);
    PUSHW(cpu, old_eip);

    return CS_LIMIT_CHECK(cpu, 0);
}

static int FAR_JUMP(cpu_state *cpu, uint16_t new_sel, uint32_t new_eip) {
    int status = LOAD_DESCRIPTOR(cpu, &cpu->CS, new_sel, type_bitmap_SEG_EXEC, 0, NULL);
    if (status == 0) {
        cpu->EIP = new_eip;
        if (new_sel == 0 && new_eip == 0) return cpu_status_gpf;
        return CS_LIMIT_CHECK(cpu, 0);
    } else { // TSS
        desc_t new_tss;
        status = LOAD_DESCRIPTOR(cpu, &new_tss, new_sel, type_bitmap_TSS32, 0, NULL);
        if (status == 0) {
            status = TSS_switch_context(cpu, &new_tss, 0);
        }
        return status;
    }
}

typedef enum {
    software,
    exception,
    external,
} int_cause_t;

static inline int INVOKE_INT_MAIN(cpu_state *cpu, int n, int_cause_t cause) {
    int ext = (cause == external);
    uint32_t errcode = n * 8 + 2;
    if (ext) errcode |= 1;

    uint16_t old_csel = cpu->CS.sel, old_ssel = cpu->SS.sel;
    uint32_t old_eip = cpu->EIP, old_esp = cpu->ESP, old_eflags = cpu->eflags;

    uint16_t new_csel, new_ssel;
    uint32_t new_eip, new_esp;
    int has_to_switch_esp = 0, has_to_disable_irq = 0, from_vm = cpu->VM;
    unsigned old_rpl = (from_vm) ? 3 : cpu->RPL;

    if (from_vm && cause == software && cpu->IOPL < 3) RAISE_GPF(errcode);

    uint32_t chk_limit = (n << 3) | 7;
    if (chk_limit > cpu->IDT.limit) return RAISE_GPF(errcode);
    gate_desc_t *idt = (gate_desc_t *)(mem + cpu->IDT.base);
    gate_desc_t gate = idt[n];
    if (!gate.attr_P) return RAISE_NOT_PRESENT(errcode);
    switch (gate.attr_type) {
        case type_trap_gate32:
            break;
        case type_intr_gate32:
            has_to_disable_irq = 1;
            break;
        default:
            return RAISE_GPF(errcode);
    }

    cpu->VM = 0;
    new_csel = gate.sel;
    new_eip = gate.offset_1 | (gate.offset_2 << 16);
    unsigned new_rpl = new_csel & 3;
    if (old_rpl > new_rpl) {
        has_to_switch_esp = 1;
    }

    if (new_csel == 0 && new_eip == 0) return RAISE_GPF(errcode | 1);
    int status = LOAD_DESCRIPTOR(cpu, &cpu->CS, new_csel, type_bitmap_SEG_EXEC, 0, NULL);
    if (status) return status | ext;
    cpu->EIP = new_eip;

    if (has_to_switch_esp) {
        tss_t *tss = (tss_t *)(mem + cpu->TSS.base);
        new_esp = tss->ESP0;
        new_ssel = tss->SS0;
        status = LOAD_DESCRIPTOR(cpu, &cpu->SS, new_ssel, type_bitmap_SEG_WRITE, 0, NULL);
        if (status) {
            return RAISE_INVALID_TSS((status & UINT16_MAX) | ext);
        }
        cpu->ESP = new_esp;
        if (from_vm) {
            PUSHW(cpu, cpu->GS.sel);
            PUSHW(cpu, cpu->FS.sel);
            PUSHW(cpu, cpu->DS.sel);
            PUSHW(cpu, cpu->ES.sel);
            LOAD_DESCRIPTOR(cpu, &cpu->ES, 0, 0, 1, NULL);
            LOAD_DESCRIPTOR(cpu, &cpu->DS, 0, 0, 1, NULL);
            LOAD_DESCRIPTOR(cpu, &cpu->FS, 0, 0, 1, NULL);
            LOAD_DESCRIPTOR(cpu, &cpu->GS, 0, 0, 1, NULL);
        }
        PUSHW(cpu, old_ssel);
        PUSHW(cpu, old_esp);
    }
    PUSHW(cpu, old_eflags);
    PUSHW(cpu, old_csel);
    PUSHW(cpu, old_eip);

    // TODO: refactoring
    if (has_to_disable_irq) {
        cpu->IF = 0;
    }
    cpu->TF = 0;
    cpu->RF = 0;
    cpu->NT = 0;

    return 0;
}

static int INVOKE_INT(cpu_state *cpu, int n, int_cause_t cause) {
    cpu->cpu_context = cpu->default_context;
    if (!cpu->CR0.PE) {
        int idt_offset = cpu->IDT.base + n * 4;
        uint32_t new_eip = READ_LE16(mem + idt_offset);
        uint16_t new_csel = READ_LE16(mem + idt_offset + 2);
        if (new_csel == 0 && new_eip == 0) return RAISE_GPF(0);

        PUSHW(cpu, cpu->eflags);
        PUSHW(cpu, cpu->CS.sel);
        PUSHW(cpu, cpu->EIP);

        LOAD_DESCRIPTOR(cpu, &cpu->CS, new_csel, 0, 0, NULL);
        cpu->EIP = new_eip;
        cpu->eflags &= cpu->flags_mask_intrm;

        return CS_LIMIT_CHECK(cpu, 0);
    } else {
        uint16_t old_csel = cpu->CS.sel, old_ssel = cpu->SS.sel;
        uint32_t old_eip = cpu->EIP, old_esp = cpu->ESP, old_eflags = cpu->eflags;
        int status = INVOKE_INT_MAIN(cpu, n, cause);
        if (status >= cpu_status_exception) {
            int status2;
            status2 = LOAD_DESCRIPTOR(cpu, &cpu->SS, old_ssel, 0, 0, NULL);
            if (status2 >= cpu_status_exception) return cpu_status_double;
            cpu->ESP = old_eip;
            status2 = LOAD_DESCRIPTOR(cpu, &cpu->CS, old_csel, 0, 0, NULL);
            if (status2 >= cpu_status_exception) return cpu_status_double;
            cpu->EIP = old_eip;
            cpu->eflags = old_eflags;
            return status;
        }
        return CS_LIMIT_CHECK(cpu, status);
    }
}

static int FAR_RETURN(cpu_state *cpu, uint16_t n, int is_iret) {
    uint16_t new_csel;
    uint32_t new_eip;
    if (!cpu->CR0.PE || cpu->VM) {
        // Real Mode or Virtual 8086 Mode
        new_eip = POPW(cpu);
        new_csel = POPW(cpu);
        LOAD_DESCRIPTOR(cpu, &cpu->CS, new_csel, 0, 0, NULL);
        cpu->EIP = new_eip;
        if (is_iret) {
            uint32_t new_fl = POPW(cpu);
            if (cpu->CR0.PE) {
                LOAD_FLAGS(cpu, new_fl, cpu->flags_preserve_iret3);
            } else {
                LOAD_FLAGS(cpu, new_fl, 0);
            }
        }
        cpu->SP += n;
    } else {
        unsigned is_use32 = !!(cpu->cpu_context & CPU_CTX_DATA32);

        // Estimated ESP check
        unsigned estimated_stack_size = (2 + !!is_iret) * (1 + is_use32) * 2 + n;
        if (cpu->SS.limit < cpu->ESP + estimated_stack_size) {
            return RAISE_STACK_FAULT(0);
        }

        int has_to_switch_esp = 0;
        unsigned old_rpl = cpu->RPL;
        uint16_t new_ssel = 0, old_ssel = cpu->SS.sel;
        uint32_t new_esp = 0, old_esp = cpu->ESP, new_fl = 0;

        new_eip = POPW(cpu);
        new_csel = POPW(cpu);
        if (is_iret) {
            new_fl = POPW(cpu);
            if (old_rpl == 0 && (new_fl & 0x00020000)) { // go to VM
                uint16_t new_esel = POPW(cpu);
                uint16_t new_dsel = POPW(cpu);
                uint16_t new_fsel = POPW(cpu);
                uint16_t new_gsel = POPW(cpu);

                LOAD_FLAGS(cpu, new_fl, 0);
                LOAD_SEL8086(cpu, &cpu->CS, new_csel);
                cpu->EIP = new_eip;
                LOAD_SEL8086(cpu, &cpu->SS, new_ssel);
                cpu->ESP = new_esp;
                LOAD_SEL8086(cpu, &cpu->ES, new_esel);
                LOAD_SEL8086(cpu, &cpu->DS, new_dsel);
                LOAD_SEL8086(cpu, &cpu->FS, new_fsel);
                LOAD_SEL8086(cpu, &cpu->GS, new_gsel);
                goto last_check;
            }
        }

        unsigned new_rpl = new_csel & 3;
        if (old_rpl < new_rpl) {
            has_to_switch_esp = 1;
            new_esp = POPW(cpu);
            new_ssel = POPW(cpu);
        }

        sreg_t temp;
        int status = LOAD_DESCRIPTOR(cpu, &temp, new_csel, type_bitmap_SEG_EXEC, 0, NULL);
        if (status) {
            cpu->ESP = old_esp;
            return status;
        }
        if (has_to_switch_esp) {
            status = LOAD_DESCRIPTOR(cpu, &cpu->SS, new_ssel, type_bitmap_SEG_WRITE, 0, NULL);
            if (status) {
                cpu->ESP = old_esp;
                if ((status & cpu_status_exception_mask) == cpu_status_gpf) {
                    return RAISE_STACK_FAULT(status & UINT16_MAX);
                } else {
                    return status;
                }
            }
            cpu->ESP = new_esp;
        } else {
            cpu->ESP += n;
        }
        LOAD_DESCRIPTOR(cpu, &cpu->CS, new_csel, 0, 0, NULL);
        cpu->EIP = new_eip;
        if (is_iret) {
            if (old_rpl) {
                LOAD_FLAGS(cpu, new_fl, cpu->flags_preserve_iret3);
            } else {
                LOAD_FLAGS(cpu, new_fl, 0);
            }
        }

    }
last_check:
    if (new_csel == 0 && new_eip == 0) return RAISE_GPF(0);
    int inta = (cpu->IF || cpu->TF) ? cpu_status_inta : 0;
    return CS_LIMIT_CHECK(cpu, inta);
}

static inline int RETF(cpu_state *cpu, uint16_t n) {
    return FAR_RETURN(cpu, n, 0);
}

static inline int IRET(cpu_state *cpu) {
    return FAR_RETURN(cpu, 0, 1);
}


static inline int SETF8(cpu_state *cpu, int value) {
    int8_t v = value;
    cpu->OF = (value != v);
    cpu->SF = (v < 0);
    cpu->ZF = (v == 0);
    cpu->PF = 1 & ~__builtin_popcount((uint8_t)value);
    return value;
}

static inline int SETF16(cpu_state *cpu, int value) {
    int16_t v = value;
    cpu->OF = (value != v);
    cpu->SF = (v < 0);
    cpu->ZF = (v == 0);
    cpu->PF = 1 & ~__builtin_popcount((uint8_t)value);
    return value;
}

static inline int SETF32(cpu_state *cpu, int value) {
    int64_t v = value;
    cpu->OF = (value != v);
    cpu->SF = (v < 0);
    cpu->ZF = (v == 0);
    cpu->PF = 1 & ~__builtin_popcount((uint8_t)value);
    return value;
}


typedef struct {
    uint32_t linear;
    uint32_t offset;
    struct {
        uint32_t disp;
        union {
            struct {
                uint32_t base:4;
                uint32_t index:4;
                uint32_t reg:4;
                uint32_t disp_bits:4;
                uint32_t scale:2;
                uint32_t has_base:1;
                uint32_t has_index:1;
                uint32_t use32:1;
            };
            uint32_t d32;
        };
    } parsed;
    union {
        uint8_t modrm;
        struct {
            uint8_t rm:3;
            uint8_t reg:3;
            uint8_t mod:2;
        };
    };
    union {
        uint8_t sib;
        struct {
            uint8_t base:3;
            uint8_t index:3;
            uint8_t scale:2;
        };
    };
    union {
        uint8_t rex;
        struct {
            uint8_t b:1;
            uint8_t x:1;
            uint8_t r:1;
            uint8_t w:1;
            uint8_t fixed:4;
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

static inline int MODRM(cpu_state *cpu, sreg_t *seg_ovr, modrm_t *result) {
    modrm_t modrm;
    uint32_t rip = cpu->CS.base + cpu->EIP;
    modrm.modrm = mem[rip];
    if (modrm.mod == 3) {
        result->modrm = modrm.modrm;
        cpu->EIP++;
        return 3;
    }

    int skip = 1, use_ss = 0;
    uint32_t offset = 0;
    int mod = modrm.mod;
    if (cpu->cpu_context & CPU_CTX_ADDR32) {
        if (modrm.rm != 4) {
            if (modrm.rm == index_EBP) {
                if (mod == 0) {
                    mod = 4;
                } else {
                    use_ss = 1;
                    offset = cpu->EBP;
                }
            } else {
                offset = cpu->gpr[modrm.rm];
            }
        } else {
            modrm.sib = mem[rip + skip];
            skip++;

            if (modrm.base == index_EBP) {
                if (mod == 0) {
                    mod = 4;
                } else {
                    use_ss = 1;
                    offset = cpu->EBP;
                }
            } else {
                if (modrm.base == index_ESP) {
                    use_ss = 1;
                }
                offset = cpu->gpr[modrm.base];
            }
            if (modrm.index != 4) {
                offset += (cpu->gpr[modrm.index] << modrm.scale);
            }
        }
        if (mod == 2) {
            mod = 4;
        }
        switch (mod) {
            case 1:
                offset += MOVSXB(mem[rip + skip]);
                break;
            case 4:
                offset += READ_LE32(mem + rip + skip);
                break;
        }

    } else {
        switch (modrm.rm) {
            case 0:
                offset = cpu->BX + cpu->SI;
                break;
            case 1:
                offset = cpu->BX + cpu->DI;
                break;
            case 2:
                use_ss = 1;
                offset = cpu->BP + cpu->SI;
                break;
            case 3:
                use_ss = 1;
                offset = cpu->BP + cpu->DI;
                break;
            case 4:
                offset = cpu->SI;
                break;
            case 5:
                offset = cpu->DI;
                break;
            case 6:
                if (mod == 0) {
                    mod = 2;
                } else {
                    use_ss = 1;
                    offset = cpu->BP;
                }
                break;
            case 7:
                offset = cpu->BX;
                break;
        }
        switch (mod) {
            case 1:
                offset += MOVSXB(mem[rip + skip]);
                break;
            case 2:
                offset += READ_LE16(mem + rip + skip);
                break;
        }
        offset &= UINT16_MAX;
    }
    cpu->EIP += skip + mod;

    sreg_t *seg;
    if (seg_ovr) {
        seg = seg_ovr;
    } else {
        if (use_ss) {
            seg = &cpu->SS;
        } else {
            seg = &cpu->DS;
        }
    }

    result->modrm = modrm.modrm;
    result->offset = offset;
    result->linear = seg->base + offset;
    if (result->linear > max_mem) result->linear = null_ptr;

    return 0;
}

static inline void MODRM_W_D(cpu_state *cpu, sreg_t *seg, int w, int d, operand_set *set) {
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
    if (w) {
        if (cpu->cpu_context & CPU_CTX_DATA32) {
            set->size = 2;
        } else {
            set->size = 1;
        }
    } else {
        set->size = 0;
    }
    set->opr1 = opr1;
    if (opr2) {
        switch (set->size) {
        case 0:
            set->opr2 = *(int8_t *)opr2;
            break;
        case 1:
            set->opr2 = MOVSXW(READ_LE16(opr2));
            break;
        case 2:
            set->opr2 = READ_LE32(opr2);
        }
    } else {
        set->opr2 = VOID_MEMORY_VALUE;
    }
}

static inline int MODRM_W(cpu_state *cpu, sreg_t *seg, int w, operand_set *set) {
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
    if (w) {
        if (cpu->cpu_context & CPU_CTX_DATA32) {
            set->size = 2;
        } else {
            set->size = 1;
        }
    } else {
        set->size = 0;
    }
    set->opr2 = modrm.reg;
    return result;
}

static inline void OPR(cpu_state *cpu, sreg_t *seg, uint8_t opcode, operand_set *set) {
    int w = opcode & 1;
    if (opcode & 4) {
        if (w) {
            if (cpu->cpu_context & CPU_CTX_DATA32) {
                set->size = 2;
            } else {
                set->size = 1;
            }
        } else {
            set->size = 0;
        }
        set->opr1 = &cpu->EAX;
        switch (set->size) {
        case 0:
            set->opr2 = FETCH8(cpu);
            break;
        case 1:
            set->opr2 = FETCH16(cpu);
            break;
        case 2:
            set->opr2 = FETCH32(cpu);
            break;
        }
    } else {
        MODRM_W_D(cpu, seg, w, opcode & 2, set);
    }
}

static inline void ADD(cpu_state *cpu, operand_set *set, int c) {
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
        case 2:
        {
            int64_t src = (int)set->opr2;
            int64_t dst = (int)READ_LE32(set->opr1);
            int64_t value = dst + src + c;
            cpu->AF = (dst & 15) + (src & 15) + c > 15;
            cpu->CF = (uint32_t)dst > (uint32_t)value || (c && !(src + 1));
            WRITE_LE32(set->opr1, SETF32(cpu, value));
            break;
        }
    }
}

static inline void INC(cpu_state *cpu, operand_set *set) {
    int saved_cf = cpu->CF;
    set->opr2 = 1;
    ADD(cpu, set, 0);
    cpu->CF = saved_cf;
}

static inline void SUB(cpu_state *cpu, operand_set *set, int c, int cmp) {
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
        case 2:
        {
            int64_t src = (int)set->opr2;
            int64_t dst = (int)READ_LE32(set->opr1);
            int64_t value = dst - src - c;
            cpu->AF = (dst & 15) - (src & 15) - c < 0;
            cpu->CF = (uint32_t)dst < (uint32_t)src + c || (c && !(src + 1));
            SETF32(cpu, value);
            if (!cmp) WRITE_LE32(set->opr1, value);
            break;
        }
    }
}

static inline void DEC(cpu_state *cpu, operand_set *set) {
    int saved_cf = cpu->CF;
    set->opr2 = 1;
    SUB(cpu, set, 0, 0);
    cpu->CF = saved_cf;
}

static inline void OR(cpu_state *cpu, operand_set *set) {
    switch (set->size) {
        case 0:
        {
            int value = *set->opr1b | set->opr2;
            *set->opr1b = SETF8(cpu, value);
            break;
        }
        case 1:
        {
            int value = READ_LE16(set->opr1) | set->opr2;
            WRITE_LE16(set->opr1, SETF16(cpu, value));
            break;
        }
        case 2:
        {
            int value = READ_LE32(set->opr1) | set->opr2;
            WRITE_LE32(set->opr1, SETF32(cpu, value));
            break;
        }
    }
    cpu->CF = 0;
    cpu->OF = 0;
}

static inline void AND(cpu_state *cpu, operand_set *set, int test) {
    switch (set->size) {
        case 0:
        {
            int value = *set->opr1b & set->opr2;
            SETF8(cpu, value);
            if (!test) *set->opr1b = value;
            break;
        }
        case 1:
        {
            int value = READ_LE16(set->opr1) & set->opr2;
            SETF16(cpu, value);
            if (!test) WRITE_LE16(set->opr1, value);
            break;
        }
        case 2:
        {
            int value = READ_LE32(set->opr1) & set->opr2;
            SETF32(cpu, value);
            if (!test) WRITE_LE32(set->opr1, value);
            break;
        }
    }
    cpu->CF = 0;
    cpu->OF = 0;
}

static inline void XOR(cpu_state *cpu, operand_set *set) {
    switch (set->size) {
        case 0:
        {
            int value = *set->opr1b ^ set->opr2;
            *set->opr1b = SETF8(cpu, value);
            break;
        }
        case 1:
        {
            int value = READ_LE16(set->opr1) ^ set->opr2;
            WRITE_LE16(set->opr1, SETF16(cpu, value));
            break;
        }
        case 2:
        {
            int value = READ_LE32(set->opr1) ^ set->opr2;
            WRITE_LE32(set->opr1, SETF32(cpu, value));
            break;
        }
    }
    cpu->CF = 0;
    cpu->OF = 0;
}

static inline int JUMP_IF(cpu_state *cpu, int disp, int cc) {
    if (cc) {
        if (cpu->cpu_context & CPU_CTX_DATA32) {
            cpu->EIP = cpu->EIP + disp;
        } else {
            cpu->EIP = (cpu->EIP + disp) & 0xFFFF;
        }
    }
    return 0;
}

// Evaluate Conditions for Jcc, SETcc, CMOVcc
static inline int EVAL_CC(cpu_state *cpu, int cc) {
    switch (cc & 0xF) {
        case 0: // xO
            return (cpu->OF);

        case 1: // xNO
            return (!cpu->OF);

        case 2: // xC
            return (cpu->CF);

        case 3: // xNC
            return (!cpu->CF);

        case 4: // xZ
            return (cpu->ZF);

        case 5: // zNZ
            return (!cpu->ZF);

        case 6: // xBE
            return (cpu->CF || cpu->ZF);

        case 7: // xNBE
            return (!(cpu->CF || cpu->ZF));

        case 8: // xS
            return (cpu->SF);

        case 9: // xNS
            return (!cpu->SF);

        case 0xA: // xP d8
            return (cpu->PF);

        case 0xB: // xNP
            return (!cpu->PF);

        case 0xC: // xL
            return (cpu->SF != cpu->OF);

        case 0xD: // xNL
            return (cpu->SF == cpu->OF);

        case 0xE: // xLE
            return (cpu->ZF || (cpu->SF != cpu->OF));

        case 0xF: // xG
            return (!(cpu->ZF || (cpu->SF != cpu->OF)));
    }
    TRAP_NORETURN();
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
        case 2:
            m = 0x80000000;
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
                case 2:
                    value = READ_LE32(set->opr1b);
                    for (int i = 0; i < c; ++i) {
                        value = (value << 1) | (cpu->CF = (value & m) != 0);
                    }
                    cpu->OF = cpu->CF ^ ((value & m) != 0);
                    WRITE_LE32(set->opr1, value);
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
                case 2:
                    value = READ_LE32(set->opr1);
                    for (int i = 0; i < c; ++i) {
                        value = (value >> 1) | ((cpu->CF = value & 1) ? m : 0);
                    }
                    cpu->OF = cpu->CF ^ ((value & (m >> 1)) != 0);
                    WRITE_LE32(set->opr1, value);
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
                case 2:
                    value = READ_LE32(set->opr1);
                    for (int i = 0; i < c; ++i) {
                        value = (value << 1) | cpu->CF;
                        cpu->CF = ((value & (m << 1)) != 0);
                    }
                    cpu->OF = cpu->CF ^ ((value & m) != 0);
                    WRITE_LE32(set->opr1, value);
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
                case 2:
                    value = READ_LE32(set->opr1);
                    for (int i = 0; i < c; ++i) {
                        int f1 = value & 1, f2 = (value & m) != 0;
                        value = (value >> 1) | (cpu->CF ? m : 0);
                        cpu->OF = cpu->CF ^ f2;
                        cpu->CF = f1;
                    }
                    WRITE_LE32(set->opr1, value);
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
                    case 2:
                        value = READ_LE32(set->opr1);
                        for (int i = 0; i < c; ++i) {
                            value <<= 1;
                        }
                        WRITE_LE32(set->opr1b, SETF32(cpu, value));
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
                    case 2:
                        value = READ_LE32(set->opr1);
                        for (int i = 1; i < c; ++i) {
                            value >>= 1;
                        }
                        WRITE_LE32(set->opr1b, SETF32(cpu, value >> 1));
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
                    case 2:
                        value = READ_LE32(set->opr1);
                        for (int i = 1; i < c; ++i) {
                            value >>= 1;
                        }
                        WRITE_LE32(set->opr1b, SETF32(cpu, value >> 1));
                        cpu->CF = value & 1;
                        cpu->OF = 0;
                        return 0;
                }
            }
            return 0;
    }
    return cpu_status_ud;
}

static void SHLD(cpu_state *cpu, operand_set *set, int shift) {
    shift &= 31;
    if (shift == 0) return;
    switch (set->size) {
        case 1:
        {
            uint32_t value = (READ_LE16(set->opr1) << 16) | (cpu->gpr[set->opr2] & UINT16_MAX);
            value <<= (shift - 1);
            WRITE_LE16(set->opr1, SETF16(cpu, value >> 15));
            cpu->CF = !!(value & 0x80000000);
            return;
        }
        case 2:
        {
            uint64_t value = ((uint64_t)READ_LE32(set->opr1) << 32) | ((uint64_t)(cpu->gpr[set->opr2]));
            value <<= (shift - 1);
            WRITE_LE32(set->opr1, SETF32(cpu, value >> 31));
            cpu->CF = !!(value & 0x8000000000000000ULL);
            return;
        }
    }
}

static void SHRD(cpu_state *cpu, operand_set *set, int shift) {
    shift &= 31;
    if (shift == 0) return;
    switch (set->size) {
        case 1:
        {
            uint32_t value = READ_LE16(set->opr1) | (cpu->gpr[set->opr2] << 16);
            value >>= (shift - 1);
            WRITE_LE16(set->opr1, SETF16(cpu, value >> 1));
            cpu->CF = value & 1;
            return;
        }
        case 2:
        {
            uint64_t value = (uint64_t)READ_LE32(set->opr1) | ((uint64_t)(cpu->gpr[set->opr2]) << 32);
            value >>= (shift - 1);
            WRITE_LE32(set->opr1, SETF32(cpu, value >> 1));
            cpu->CF = value & 1;
            return;
        }
    }
}

static void IMUL3(cpu_state *cpu, operand_set *set, int imm) {
    if ((cpu->cpu_context & CPU_CTX_DATA32)) {
        int64_t dst = MOVSXD(READ_LE32(set->opr1)) * MOVSXD(imm);
        cpu->gpr[set->opr2] = dst;
        cpu->OF = cpu->CF = (dst != MOVSXD(dst));
    } else {
        int dst = MOVSXW(READ_LE16(set->opr1)) * MOVSXW(imm);
        WRITE_LE16(&cpu->gpr[set->opr2], dst);
        cpu->OF = cpu->CF = (dst != MOVSXW(dst));
    }
}


static int LDS(cpu_state *cpu, sreg_t *seg_ovr, sreg_t *target) {
    operand_set set;
    if (MODRM_W(cpu, seg_ovr, 1, &set)) return cpu_status_ud; // VEX
    uint16_t new_sel;
    uint32_t offset;
    if (set.size == 2) {
        offset = READ_LE32(set.opr1);
        new_sel = READ_LE16(set.opr1b + 4);
    } else {
        offset = READ_LE16(set.opr1);
        new_sel = READ_LE16(set.opr1b + 2);
    }
    int status = LOAD_DESCRIPTOR(cpu, target, new_sel, type_bitmap_SEG_READ, 0, NULL);
    if (status) return status;
    if (set.size == 2) {
        cpu->gpr[set.opr2] = offset;
    } else {
        WRITE_LE32(&cpu->gpr[set.opr2], offset);
    }
    return 0;
}

typedef union {
    char string[4 * 4 * 3];
    uint32_t regs[4 * 3];
} cpuid_brand_string_t;

cpuid_brand_string_t cpuid_brand_string = { "Virtual CPU by WebAssembly @ 3.14MHz" };

static int CPUID(cpu_state *cpu) {
    const uint32_t cpuid_manufacturer_id = 0x4D534157;
    switch (cpu->EAX) {
        case 0x00000001:
            cpu->EAX = cpu->cpuid_model_id;
            cpu->EDX = 0x00008010;
            cpu->ECX = 0x80800000;
            cpu->EBX = 0;
            break;
        case 0x80000000:
            cpu->EAX = 0x80000004;
            cpu->EBX = cpu->ECX = cpu->EDX = cpuid_manufacturer_id;
            break;
        case 0x80000001:
            cpu->EAX = cpu->cpuid_model_id;
            cpu->EDX = 0x00000000;
            cpu->ECX = 0;
            cpu->EBX = 0;
            break;
        case 0x80000002:
        case 0x80000003:
        case 0x80000004:
        {
            int offset = (cpu->EAX - 0x80000002) * 4;
            cpu->EAX = cpuid_brand_string.regs[offset++];
            cpu->EBX = cpuid_brand_string.regs[offset++];
            cpu->ECX = cpuid_brand_string.regs[offset++];
            cpu->EDX = cpuid_brand_string.regs[offset++];
            break;
        }
        case 0x00000000:
        default:
            cpu->EAX = 1;
            cpu->EBX = cpu->ECX = cpu->EDX = cpuid_manufacturer_id;
    }
    return 0;
}

static int MOV_CR(cpu_state *cpu, int cr, uint32_t value) {
    switch (cr) {
        case 0:
        {
            uint32_t old_value = cpu->CR[cr];
            uint32_t changed = old_value ^ value;
            uint32_t set_changed = value & changed;
            if (set_changed & ~cpu->cr0_valid) return cpu_status_gpf;
            cpu->CR[cr] = value;
            return 0;
        }
        case 3:
            cpu->CR[cr] = value;
            return 0;
        case 4:
        {
            uint32_t old_value = cpu->CR[cr];
            uint32_t changed = value & (old_value ^ value);
            if (changed & ~cpu->cr4_valid) return cpu_status_gpf;
            cpu->CR[cr] = value;
            return 0;
        }
        default:
            return cpu_status_gpf;
    }
}

typedef enum  {
    BitTestOp_BT,
    BitTestOp_BTS,
    BitTestOp_BTR,
    BitTestOp_BTC,
} BitTestOp;

static void BitTest(cpu_state *cpu, operand_set *set, int mod, uint32_t src, BitTestOp op) {
    uint32_t mask = 1 << (src & 31);
    uint32_t *dst;
    if (mod) {
        dst = set->opr1;
    } else {
        uint32_t offset = src >> 5;
        dst = (uint32_t *)(set->opr1b + offset);
    }
    uint32_t value = READ_LE32(dst);
    cpu->CF = (value & mask) != 0;
    switch (op) {
        case BitTestOp_BT:
            break;
        case BitTestOp_BTS:
            WRITE_LE32(dst, value |= mask);
            break;
        case BitTestOp_BTR:
            WRITE_LE32(dst, value &= ~mask);
            break;
        case BitTestOp_BTC:
            WRITE_LE32(dst, value ^= mask);
            break;
    }
}

#define PREFIX_LOCK     0x00000001
#define PREFIX_REPZ     0x00000002
#define PREFIX_REPNZ    0x00000004
#define PREFIX_66       0x00000010
#define PREFIX_67       0x00000020

static int MOVS(cpu_state *cpu, sreg_t *seg, int size, int prefix) {
    int rep = prefix & (PREFIX_REPZ | PREFIX_REPNZ);
    uint32_t count, si, di, index_mask;
    int increment = (1 << size) * (cpu->DF ? -1 : 1);
    if (cpu->cpu_context & CPU_CTX_ADDR32) {
        index_mask = UINT32_MAX;
        count = cpu->ECX;
        si = cpu->ESI;
        di = cpu->EDI;
    } else {
        index_mask = UINT16_MAX;
        count = cpu->CX;
        si = cpu->SI;
        di = cpu->DI;
    }
    if (rep && count == 0) return 0;

    switch (size) {
        case 0:
            do {
                WRITE_MEM8(&cpu->ES, di & index_mask, READ_MEM8(seg, si & index_mask));
                si += increment;
                di += increment;
            } while (rep && --count);
            break;

        case 1:
            do {
                WRITE_MEM16(&cpu->ES, di & index_mask, READ_MEM16(seg, si & index_mask));
                si += increment;
                di += increment;
            } while (rep && --count);
            break;

        case 2:
            do {
                WRITE_MEM32(&cpu->ES, di & index_mask, READ_MEM32(seg, si & index_mask));
                si += increment;
                di += increment;
            } while (rep && --count);
            break;
    }

    if (cpu->cpu_context & CPU_CTX_ADDR32) {
        cpu->ESI = si;
        cpu->EDI = di;
        if (rep) cpu->ECX = count;
    } else {
        cpu->SI = si;
        cpu->DI = di;
        if (rep) cpu->CX = count;
    }

    return 0;
}

static int CMPS(cpu_state *cpu, sreg_t *seg, int size, int prefix) {
    int repz = prefix & PREFIX_REPZ;
    int repnz = prefix & PREFIX_REPNZ;
    int rep = repz | repnz;
    uint32_t count, si, di, index_mask;
    int increment = (1 << size) * (cpu->DF ? -1 : 1);
    if (cpu->cpu_context & CPU_CTX_ADDR32) {
        index_mask = UINT32_MAX;
        count = cpu->ECX;
        si = cpu->ESI;
        di = cpu->EDI;
    } else {
        index_mask = UINT16_MAX;
        count = cpu->CX;
        si = cpu->SI;
        di = cpu->DI;
    }
    if (rep && count == 0) return 0;

    switch (size) {
        case 0:
            do {
                int dst = MOVSXB(READ_MEM8(seg, si & index_mask));
                int src = MOVSXB(READ_MEM8(&cpu->ES, di & index_mask));
                int value = dst - src;
                cpu->AF = (dst & 15) - (src & 15) < 0;
                cpu->CF = dst < src;
                SETF8(cpu, value);
                si += increment;
                di += increment;
            } while (rep && --count && ((repnz && !cpu->ZF) || (repz && cpu->ZF)));
            break;

        case 1:
            do {
                int dst = MOVSXW(READ_MEM16(seg, si & index_mask));
                int src = MOVSXW(READ_MEM16(&cpu->ES, di & index_mask));
                int value = dst - src;
                cpu->AF = (dst & 15) - (src & 15) < 0;
                cpu->CF = dst < src;
                SETF16(cpu, value);
                si += increment;
                di += increment;
            } while (rep && --count && ((repnz && !cpu->ZF) || (repz && cpu->ZF)));
            break;

        case 2:
            do {
                int64_t dst = (int)READ_MEM32(seg, si & index_mask);
                int64_t src = (int)READ_MEM32(&cpu->ES, di & index_mask);
                int64_t value = dst - src;
                cpu->AF = (dst & 15) - (src & 15) < 0;
                cpu->CF = dst < src;
                SETF32(cpu, value);
                si += increment;
                di += increment;
            } while (rep && --count && ((repnz && !cpu->ZF) || (repz && cpu->ZF)));
            break;
    }

    if (cpu->cpu_context & CPU_CTX_ADDR32) {
        cpu->ESI = si;
        cpu->EDI = di;
        if (rep) cpu->ECX = count;
    } else {
        cpu->SI = si;
        cpu->DI = di;
        if (rep) cpu->CX = count;
    }

    return 0;
}

static int STOS(cpu_state *cpu, sreg_t *_unused, int size, int prefix) {
    // The ES segment cannot be overridden with a segment override prefix.
    sreg_t *seg = &cpu->ES;
    int rep = prefix & (PREFIX_REPZ | PREFIX_REPNZ);
    uint32_t count, ax, di, index_mask;
    int increment = (1 << size) * (cpu->DF ? -1 : 1);
    if (cpu->cpu_context & CPU_CTX_ADDR32) {
        index_mask = UINT32_MAX;
        count = cpu->ECX;
        di = cpu->EDI;
    } else {
        index_mask = UINT16_MAX;
        count = cpu->CX;
        di = cpu->DI;
    }
    ax = cpu->EAX;
    if (rep && count == 0) return 0;

    switch (size) {
        case 0:
            do {
                WRITE_MEM8(seg, di & index_mask, ax);
                di += increment;
            } while (rep && --count);
            break;

        case 1:
            do {
                WRITE_MEM16(seg, di & index_mask, ax);
                di += increment;
            } while (rep && --count);
            break;

        case 2:
            do {
                WRITE_MEM32(seg, di & index_mask, ax);
                di += increment;
            } while (rep && --count);
            break;
    }

    if (cpu->cpu_context & CPU_CTX_ADDR32) {
        cpu->EDI = di;
        if (rep) cpu->ECX = count;
    } else {
        cpu->DI = di;
        if (rep) cpu->CX = count;
    }

    return 0;
}

static int LODS(cpu_state *cpu, sreg_t *seg, int size, int prefix) {
    int rep = prefix & (PREFIX_REPZ | PREFIX_REPNZ);
    if (rep) return cpu_status_ud; // CHECK!
    uint32_t count, si, index_mask;
    int increment = (1 << size) * (cpu->DF ? -1 : 1);
    if (cpu->cpu_context & CPU_CTX_ADDR32) {
        index_mask = UINT32_MAX;
        count = cpu->ECX;
        si = cpu->ESI;
    } else {
        index_mask = UINT16_MAX;
        count = cpu->CX;
        si = cpu->SI;
    }
    if (rep && count == 0) return 0;

    switch (size) {
        case 0:
            do {
                cpu->AL = READ_MEM8(seg, si & index_mask);
                si += increment;
            } while (rep && --count);
            break;

        case 1:
            do {
                cpu->AX = READ_MEM16(seg, si & index_mask);
                si += increment;
            } while (rep && --count);
            break;

        case 2:
            do {
                cpu->EAX = READ_MEM32(seg, si & index_mask);
                si += increment;
            } while (rep && --count);
            break;
    }

    if (cpu->cpu_context & CPU_CTX_ADDR32) {
        cpu->ESI = si;
        if (rep) cpu->ECX = count;
    } else {
        cpu->SI = si;
        if (rep) cpu->CX = count;
    }

    return 0;
}

static int SCAS(cpu_state *cpu, sreg_t *_unused, int size, int prefix) {
    // The ES segment cannot be overridden with a segment override prefix.
    sreg_t *seg = &cpu->ES;
    int repz = prefix & PREFIX_REPZ;
    int repnz = prefix & PREFIX_REPNZ;
    int rep = repz | repnz;
    uint32_t count, di, index_mask;
    int increment = (1 << size) * (cpu->DF ? -1 : 1);
    if (cpu->cpu_context & CPU_CTX_ADDR32) {
        index_mask = UINT32_MAX;
        count = cpu->ECX;
        di = cpu->EDI;
    } else {
        index_mask = UINT16_MAX;
        count = cpu->CX;
        di = cpu->DI;
    }
    if (rep && count == 0) return 0;

    switch (size) {
        case 0:
        {
            int al = MOVSXB(cpu->AL);
            do {
                int src = MOVSXB(READ_MEM8(seg, di & index_mask));
                int value = al - src;
                cpu->AF = (al & 15) - (src & 15) < 0;
                cpu->CF = al < src;
                SETF8(cpu, value);
                di += increment;
            } while (rep && --count && ((repnz && !cpu->ZF) || (repz && cpu->ZF)));
            break;
        }

        case 1:
        {
            int ax = MOVSXW(cpu->AX);
            do {
                int src = MOVSXW(READ_MEM16(seg, di & index_mask));
                int value = ax - src;
                cpu->AF = (ax & 15) - (src & 15) < 0;
                cpu->CF = ax < src;
                SETF16(cpu, value);
                di += increment;
            } while (rep && --cpu->CX && ((repnz && !cpu->ZF) || (repz && cpu->ZF)));
            break;
        }

        case 2:
        {
            int eax = (cpu->EAX);
            do {
                int src = (READ_MEM32(seg, di & index_mask));
                int value = eax - src;
                cpu->AF = (eax & 15) - (src & 15) < 0;
                cpu->CF = eax < src;
                SETF16(cpu, value);
                di += increment;
            } while (rep && --cpu->CX && ((repnz && !cpu->ZF) || (repz && cpu->ZF)));
            break;
        }
    }

    if (cpu->cpu_context & CPU_CTX_ADDR32) {
        cpu->EDI = di;
        if (rep) cpu->ECX = count;
    } else {
        cpu->DI = di;
        if (rep) cpu->CX = count;
    }

    return 0;
}


static int cpu_step(cpu_state *cpu) {
    operand_set set;
    uint32_t prefix = 0;
    sreg_t *seg = NULL;
    cpu->cpu_context = cpu->default_context;
    for (;;) {
        uint32_t inst = FETCH8(cpu);
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
                PUSHW(cpu, cpu->ES.sel);
                return 0;

            case 0x07: // POP ES
                return POP_SEG(cpu, &cpu->ES, type_bitmap_SEG_READ, 1);

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
                PUSHW(cpu, cpu->CS.sel);
                return 0;

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
                PUSHW(cpu, cpu->SS.sel);
                return 0;

            case 0x17: // POP SS
                return POP_SEG(cpu, &cpu->SS, type_bitmap_SEG_WRITE, 0);

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
                PUSHW(cpu, cpu->DS.sel);
                return 0;

            case 0x1F: // POP DS
                return POP_SEG(cpu, &cpu->DS, type_bitmap_SEG_READ, 1);

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

            case 0x27: // DAA
            {
                int value = (cpu->AF = (cpu->AL & 15) > 9 || cpu->AF) ? 6 : 0;
                if ((cpu->CF = cpu->AL > 0x99 || cpu->CF)){
                    value += 0x60;
                }
                cpu->AL = SETF8(cpu, cpu->AL + value);
                return 0;
            }

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

            case 0x2F: // DAS
            {
                int value;
                value = (cpu->AF = (cpu->AL & 15) > 9 || cpu->AF) ? 6 : 0;
                if ((cpu->CF = cpu->AL > 0x99 || cpu->CF)){
                    value += 0x60;
                }
                cpu->AL = SETF8(cpu, cpu->AL - value);
                return 0;
            }

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

            case 0x37: // AAA
            {
                if ((cpu->AF = cpu->CF = (cpu->AL & 15) > 9 || cpu->AF)) {
                    cpu->AL += 6;
                    cpu->AH++;
                }
                cpu->AL &= 15;
                return 0;
            }

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

            case 0x3F: // AAS
            {
                if ((cpu->AF = cpu->CF = (cpu->AL & 15) > 9 || cpu->AF)) {
                    cpu->AL -= 6;
                    cpu->AH--;
                }
                cpu->AL &= 15;
                return 0;
            }

            case 0x40: // INC reg16
            case 0x41:
            case 0x42:
            case 0x43:
            case 0x44:
            case 0x45:
            case 0x46:
            case 0x47:
            {
                set.size = (cpu->cpu_context & CPU_CTX_DATA32) ? 2 : 1;
                set.opr1 = &cpu->gpr[inst & 7];
                INC(cpu, &set);
                return 0;
            }

            case 0x48: // DEC reg16
            case 0x49:
            case 0x4A:
            case 0x4B:
            case 0x4C:
            case 0x4D:
            case 0x4E:
            case 0x4F:
            {
                set.size = (cpu->cpu_context & CPU_CTX_DATA32) ? 2 : 1;
                set.opr1 = &cpu->gpr[inst & 7];
                DEC(cpu, &set);
                return 0;
            }

            case 0x50: // PUSH reg16
            case 0x51:
            case 0x52:
            case 0x53:
            case 0x55:
            case 0x56:
            case 0x57:
                PUSHW(cpu, cpu->gpr[inst & 7]);
                return 0;
            
            case 0x54: // PUSH SP
                if (cpu->cpu_gen < cpu_gen_80286) {
                    cpu->SP -= 2;
                    WRITE_MEM16(&cpu->SS, cpu->SP, cpu->SP);
                } else {
                    PUSHW(cpu, cpu->ESP);
                }
                return 0;

            case 0x58: // POP reg16
            case 0x59:
            case 0x5A:
            case 0x5B:
            case 0x5C:
            case 0x5D:
            case 0x5E:
            case 0x5F:
                if (cpu->cpu_context & CPU_CTX_DATA32) {
                    cpu->gpr[inst & 7] = POPW(cpu);
                } else {
                    WRITE_LE16(&cpu->gpr[inst & 7], POPW(cpu));
                }
                return 0;

            case 0x60: // PUSHA
            {
                uint32_t temp = cpu->ESP;
                if (cpu->cpu_gen < cpu_gen_80286) {
                    temp -= 10;
                }
                PUSHW(cpu, cpu->EAX);
                PUSHW(cpu, cpu->ECX);
                PUSHW(cpu, cpu->EDX);
                PUSHW(cpu, cpu->EBX);
                PUSHW(cpu, temp);
                PUSHW(cpu, cpu->EBP);
                PUSHW(cpu, cpu->ESI);
                PUSHW(cpu, cpu->EDI);
                return 0;
            }

            case 0x61: // POPA
            {
                cpu->EDI = POPW(cpu);
                cpu->ESI = POPW(cpu);
                cpu->EBP = POPW(cpu);
                uint32_t temp = POPW(cpu);
                cpu->EBX = POPW(cpu);
                cpu->EDX = POPW(cpu);
                cpu->ECX = POPW(cpu);
                cpu->EAX = POPW(cpu);
                return 0;
            }

            // case 0x62: // BOUND or EVEX

            case 0x63: // ARPL or MOVSXD
                return cpu_status_ud;

            case 0x64: // prefix FS:
                seg = &cpu->FS;
                break;

            case 0x65: // prefix GS:
                seg = &cpu->GS;
                break;

            case 0x66: // prefix 66
                if (cpu->cpu_gen < cpu_gen_80386) return cpu_status_ud;
                prefix |= PREFIX_66;
                set_flag_to(&cpu->cpu_context, CPU_CTX_DATA32, !(cpu->default_context & SEG_CTX_DEFAULT_DATA32));
                break;

            case 0x67: // prefix 67
                if (cpu->cpu_gen < cpu_gen_80386) return cpu_status_ud;
                prefix |= PREFIX_67;
                set_flag_to(&cpu->cpu_context, CPU_CTX_ADDR32, !(cpu->default_context & SEG_CTX_DEFAULT_ADDR32));
                break;

            case 0x68: // PUSH imm16
                if ((cpu->cpu_context & CPU_CTX_DATA32)) {
                    PUSHW(cpu, FETCH32(cpu));
                } else {
                    PUSHW(cpu, MOVSXW(FETCH16(cpu)));
                }
                return 0;

            case 0x69: // IMUL reg, r/m, imm16
                MODRM_W(cpu, seg, 1, &set);
                IMUL3(cpu, &set, FETCHW(cpu));
                return 0;

            case 0x6A: // PUSH imm8
                PUSHW(cpu, MOVSXB(FETCH8(cpu)));
                return 0;

            case 0x6B: // IMUL reg, r/m, imm8
                MODRM_W(cpu, seg, 1, &set);
                IMUL3(cpu, &set, MOVSXB(FETCH8(cpu)));
                return 0;

            case 0x6C: // INSB
            {
                if (cpu->cpu_context & (CPU_CTX_DATA32 | CPU_CTX_ADDR32)) return cpu_status_ud;
                sreg_t *_seg = SEGMENT(&cpu->ES);
                int rep = prefix & (PREFIX_REPZ | PREFIX_REPNZ);
                if (rep && cpu->CX == 0) return 0;
                do {
                    WRITE_MEM8(_seg, cpu->DI, vpc_inb(cpu->DX));
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
                if (cpu->cpu_context & (CPU_CTX_DATA32 | CPU_CTX_ADDR32)) return cpu_status_ud;
                sreg_t *_seg = SEGMENT(&cpu->ES);
                int rep = prefix & (PREFIX_REPZ | PREFIX_REPNZ);
                if (rep && cpu->CX == 0) return 0;
                do {
                    WRITE_MEM16(_seg, cpu->DI, vpc_inw(cpu->DX));
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
                if (cpu->cpu_context & (CPU_CTX_DATA32 | CPU_CTX_ADDR32)) return cpu_status_ud;
                sreg_t *_seg = SEGMENT(&cpu->DS);
                if (prefix & PREFIX_REPNZ) return cpu_status_ud;
                int rep = prefix & PREFIX_REPZ;
                if (rep && cpu->CX == 0) return 0;
                do {
                    vpc_outb(cpu->DX, READ_MEM8(_seg, cpu->SI));
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
                if (cpu->cpu_context & (CPU_CTX_DATA32 | CPU_CTX_ADDR32)) return cpu_status_ud;
                sreg_t *_seg = SEGMENT(&cpu->DS);
                int rep = prefix & (PREFIX_REPZ | PREFIX_REPNZ);
                if (rep && cpu->CX == 0) return 0;
                do {
                    vpc_outw(cpu->DX, READ_MEM16(_seg, cpu->SI));
                    if (cpu->DF) {
                        cpu->SI -= 2;
                    } else {
                        cpu->SI += 2;
                    }
                } while (rep && --cpu->CX);
                return 0;
            }

            case 0x70: // JO d8
            case 0x71: // JNO d8
            case 0x72: // JC d8
            case 0x73: // JNC d8
            case 0x74: // JZ d8
            case 0x75: // JNZ d8
            case 0x76: // JBE d8
            case 0x77: // JNBE d8
            case 0x78: // JS d8
            case 0x79: // JNS d8
            case 0x7A: // JP d8
            case 0x7B: // JNP d8
            case 0x7C: // JL d8
            case 0x7D: // JNL d8
            case 0x7E: // JLE d8
            case 0x7F: // JG d8
                return JUMP_IF(cpu, MOVSXB(FETCH8(cpu)), EVAL_CC(cpu, inst));

            case 0x80: // alu r/m8, imm8
            case 0x81: // alu r/m16, imm16
            case 0x82: // alu r/m8, imm8 (mirror)
            case 0x83: // alu r/m16, imm8 (sign extended)
            {
                MODRM_W(cpu, seg, inst & 1, &set);
                int opc = set.opr2;
                if (inst == 0x81) {
                    set.opr2 = FETCHW(cpu);
                } else {
                    set.opr2 = MOVSXB(FETCH8(cpu));
                }
                switch (opc) {
                    case 0: // ADD
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
            case 0x87: // xchg r/m, reg16
            {
                uint32_t temp;
                MODRM_W(cpu, seg, inst & 1, &set);
                switch (set.size) {
                    case 0:
                        temp = *set.opr1b;
                        *set.opr1b = READ_REG8(cpu, set.opr2);
                        WRITE_REG8(cpu, set.opr2, temp);
                        return 0;
                    case 1:
                        temp = READ_LE16(set.opr1);
                        WRITE_LE16(set.opr1, cpu->gpr[set.opr2]);
                        WRITE_LE16(&cpu->gpr[set.opr2], temp);
                        return 0;
                    case 2:
                        temp = READ_LE32(set.opr1);
                        WRITE_LE32(set.opr1, cpu->gpr[set.opr2]);
                        cpu->gpr[set.opr2] = temp;
                        return 0;
                }
                return cpu_status_ud;
            }

            case 0x88: // MOV rm, r8
            case 0x89: // MOV rm, r16
            case 0x8A: // MOV r8, rm
            case 0x8B: // MOV r16, rm
                MODRM_W_D(cpu, seg, inst & 1, inst & 2, &set);
                if (set.opr1) {
                    switch (set.size) {
                    case 0:
                        *set.opr1b = set.opr2;
                        break;
                    case 1:
                        WRITE_LE16(set.opr1, set.opr2);
                        break;
                    case 2:
                        WRITE_LE32(set.opr1, set.opr2);
                        break;
                    }
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
                if (cpu->cpu_context & CPU_CTX_DATA32) {
                    cpu->gpr[modrm.reg] = modrm.offset;
                } else {
                    WRITE_LE16(&cpu->gpr[modrm.reg], modrm.offset);
                }
                return 0;
            }

            case 0x8E: // MOV seg, r/m
                {
                    desc_type_bitmap_t type;
                    int allow_null = 1;
                    MODRM_W(cpu, seg, 1, &set);
                    switch (set.opr2) {
                        case index_DS:
                        case index_ES:
                        case index_FS:
                        case index_GS:
                            type = type_bitmap_SEG_READ;
                            break;

                        case index_SS:
                            type = type_bitmap_SEG_WRITE;
                            allow_null = 0;
                            break;

                        case index_CS:
                        default:
                            return cpu_status_ud;
                    }
                    return LOAD_DESCRIPTOR(cpu, &cpu->sregs[set.opr2], READ_LE16(set.opr1), type, allow_null, NULL);
                }

            case 0x8F: // /0 POP r/m
                MODRM_W(cpu, seg, 1, &set);
                switch (set.opr2) {
                    case 0: // POP r/m
                        if (cpu->cpu_context & CPU_CTX_DATA32) {
                            WRITE_LE32(set.opr1, POPW(cpu));
                        } else {
                            WRITE_LE16(set.opr1, POPW(cpu));
                        }
                        return 0;
                    default: // XOP
                        return cpu_status_ud;
                }

            case 0x90: // NOP
                if (prefix & PREFIX_REPZ) {
                    return cpu_status_pause;
                } else {
                    return 0;
                }

            case 0x91: // XCHG AX, reg16
            case 0x92:
            case 0x93:
            case 0x94:
            case 0x95:
            case 0x96:
            case 0x97:
            {
                if (cpu->cpu_context & CPU_CTX_DATA32) {
                    uint32_t temp = cpu->gpr[inst & 7];
                    cpu->gpr[inst & 7] = cpu->EAX;
                    cpu->EAX = temp;
                } else {
                    uint32_t temp = cpu->gpr[inst & 7];
                    WRITE_LE16(&cpu->gpr[inst & 7], cpu->AX);
                    cpu->AX = temp;
                }
                return 0;
            }

            case 0x98: // CBW
                if (cpu->cpu_context & CPU_CTX_DATA32) {
                    cpu->EAX = MOVSXW(cpu->AX);
                } else {
                    cpu->AX = MOVSXB(cpu->AL);
                }
                return 0;

            case 0x99: // CWD
            {
                if (cpu->cpu_context & CPU_CTX_DATA32) {
                    cpu->EDX = (cpu->EAX & 0x80000000) ? UINT32_MAX : 0;
                } else {
                    uint32_t temp = MOVSXW(cpu->AX);
                    cpu->DX = (temp >> 16);
                }
                return 0;
            }

            case 0x9A: // CALL far imm32
            {
                uint32_t new_eip = FETCHW(cpu);
                uint16_t new_sel = FETCH16(cpu);
                return FAR_CALL(cpu, new_sel, new_eip);
            }

            case 0x9B: // FWAIT
                return cpu_status_fpu;

            case 0x9C: // PUSHF
                PUSHW(cpu, cpu->eflags);
                return 0;

            case 0x9D: // POPF
            {
                uint32_t mask = is_kernel(cpu) ? cpu->flags_preserve_popf : cpu->flags_preserve_iret3;
                if ((cpu->cpu_context & CPU_CTX_DATA32) == 0) {
                    mask |= 0xFFFF0000;
                }
                LOAD_FLAGS(cpu, POPW(cpu), mask);
                if (cpu->IF || cpu->TF) {
                    return cpu_status_inta;
                } else {
                    return 0;
                }
            }

            case 0x9E: // SAHF
                LOAD_FLAGS(cpu, cpu->AH, 0xFFFFFF00);
                return 0;

            case 0x9F: // LAHF
                cpu->AH = cpu->eflags;
                return 0;

            case 0xA0: // MOV AL, off16
            {
                uint32_t offset;
                if (cpu->cpu_context & CPU_CTX_ADDR32) {
                    offset = FETCH32(cpu);
                } else {
                    offset = FETCH16(cpu);
                }
                cpu->AL = READ_MEM8(SEGMENT(&cpu->DS), offset);
                return 0;
            }

            case 0xA1: // MOV AX, off16
            {
                uint32_t offset;
                if (cpu->cpu_context & CPU_CTX_ADDR32) {
                    offset = FETCH32(cpu);
                } else {
                    offset = FETCH16(cpu);
                }
                if (cpu->cpu_context & CPU_CTX_DATA32) {
                    cpu->EAX = READ_MEM32(SEGMENT(&cpu->DS), offset);
                } else {
                    cpu->AX = READ_MEM16(SEGMENT(&cpu->DS), offset);
                }
                return 0;
            }

            case 0xA2: // MOV off16, AL
            {
                uint32_t offset;
                if (cpu->cpu_context & CPU_CTX_ADDR32) {
                    offset = FETCH32(cpu);
                } else {
                    offset = FETCH16(cpu);
                }
                WRITE_MEM8(SEGMENT(&cpu->DS), offset, cpu->AL);
                return 0;
            }

            case 0xA3: // MOV off16, AX
            {
                uint32_t offset;
                if (cpu->cpu_context & CPU_CTX_ADDR32) {
                    offset = FETCH32(cpu);
                } else {
                    offset = FETCH16(cpu);
                }
                if (cpu->cpu_context & CPU_CTX_DATA32) {
                    WRITE_MEM32(SEGMENT(&cpu->DS), offset, cpu->EAX);
                } else {
                    WRITE_MEM16(SEGMENT(&cpu->DS), offset, cpu->AX);
                }
                return 0;
            }

            case 0xA4: // MOVSB
                return MOVS(cpu, SEGMENT(&cpu->DS), 0, prefix);

            case 0xA5: // MOVSW
                return MOVS(cpu, SEGMENT(&cpu->DS), cpu->cpu_context & CPU_CTX_DATA32 ? 2 : 1, prefix);

            case 0xA6: // CMPSB
                return CMPS(cpu, SEGMENT(&cpu->DS), 0, prefix);

            case 0xA7: // CMPSW
                return CMPS(cpu, SEGMENT(&cpu->DS), cpu->cpu_context & CPU_CTX_DATA32 ? 2 : 1, prefix);

            case 0xA8: // TEST AL, imm8
            case 0xA9: // TEST AX, imm16
                if (inst & 1) {
                    if (cpu->cpu_context & CPU_CTX_DATA32) {
                        set.size = 2;
                    } else {
                        set.size = 1;
                    }
                    set.opr2 = FETCHW(cpu);
                } else {
                    set.size = 0;
                    set.opr2 = FETCH8(cpu);
                }
                set.opr1 = &cpu->EAX;
                AND(cpu, &set, 1);
                return 0;

            case 0xAA: // STOSB
                return STOS(cpu, NULL, 0, prefix);

            case 0xAB: // STOSW
                return STOS(cpu, NULL, cpu->cpu_context & CPU_CTX_DATA32 ? 2 : 1, prefix);

            case 0xAC: // LODSB
                return LODS(cpu, SEGMENT(&cpu->DS), 0, prefix);

            case 0xAD: // LODSW
                return LODS(cpu, SEGMENT(&cpu->DS), cpu->cpu_context & CPU_CTX_DATA32 ? 2 : 1, prefix);

            case 0xAE: // SCASB
                return SCAS(cpu, NULL, 0, prefix);

            case 0xAF: // SCASW
                // return SCAS(cpu, NULL, cpu->cpu_context & CPU_CTX_DATA32 ? 2 : 1, prefix);
            {
                if (cpu->cpu_context & (CPU_CTX_DATA32 | CPU_CTX_ADDR32)) return cpu_status_ud;
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

            case 0xB0: // MOV reg8, imm8
            case 0xB1:
            case 0xB2:
            case 0xB3:
            case 0xB4:
            case 0xB5:
            case 0xB6:
            case 0xB7:
                WRITE_REG8(cpu, inst, FETCH8(cpu));
                return 0;

            case 0xB8: // MOV reg16, imm16
            case 0xB9:
            case 0xBA:
            case 0xBB:
            case 0xBC:
            case 0xBD:
            case 0xBE:
            case 0xBF:
                if (cpu->cpu_context & CPU_CTX_DATA32) {
                    cpu->gpr[inst & 7] = FETCH32(cpu);
                } else {
                    WRITE_LE16(&cpu->gpr[inst & 7], FETCH16(cpu));
                }
                return 0;

            case 0xC0: // shift r/m, imm5 (186+)
            case 0xC1: // shift r/m, imm5 (186+)
                MODRM_W(cpu, seg, inst & 1, &set);
                return SHIFT(cpu, &set, FETCH8(cpu));

            case 0xC2: // RET imm16
            {
                uint32_t temp = POPW(cpu);
                cpu->SP += FETCH16(cpu);
                cpu->EIP = temp;
                return CS_LIMIT_CHECK(cpu, 0);
            }

            case 0xC3: // RET
                cpu->EIP = POPW(cpu);
                return CS_LIMIT_CHECK(cpu, 0);

            case 0xC4: // LES reg, r/m
                return LDS(cpu, seg, &cpu->ES);

            case 0xC5: // LDS reg, r/m
                return LDS(cpu, seg, &cpu->DS);

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
                            case 2:
                                WRITE_LE32(set.opr1, FETCH32(cpu));
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
                PUSHW(cpu, cpu->BP);
                cpu->BP = cpu->SP;
                cpu->SP -= param1;
                return 0;
            }

            case 0xC9: // LEAVE
                cpu->SP = cpu->BP;
                cpu->BP = POPW(cpu);
                return 0;

            case 0xCA: // RETF imm16
                return RETF(cpu, FETCH16(cpu));

            case 0xCB: // RETF
                return RETF(cpu, 0);

            case 0xCC: // INT 3
            {
                int result = INVOKE_INT(cpu, 3, software);
                return result ? result : cpu_status_pause;
            }

            case 0xCD: // INT
                return INVOKE_INT(cpu, FETCH8(cpu), software);

            case 0xCE: // INTO
                if (cpu->OF) {
                    return INVOKE_INT(cpu, 4, exception);
                }
                return 0;

            case 0xCF: // IRET
                return IRET(cpu);

            case 0xD0: // shift r/m, 1
            case 0xD1: // shift r/m, 1
                MODRM_W(cpu, seg, inst & 1, &set);
                return SHIFT(cpu, &set, 1);

            case 0xD2: // shift r/m, cl
            case 0xD3: // shift r/m, cl
                MODRM_W(cpu, seg, inst & 1, &set);
                return SHIFT(cpu, &set, cpu->CL);

            case 0xD4: // AAM
            {
                int param = FETCH8(cpu);
                uint8_t al = cpu->AL;
                cpu->AH = al / param;
                cpu->AL = SETF8(cpu, al % param);
                return 0;
            }

            case 0xD5: // AAD
            {
                int param = FETCH8(cpu);
                cpu->AL = SETF8(cpu, cpu->AL + cpu->AH * param);
                cpu->AH = 0;
                return 0;
            }

            // case 0xD6: // SETALC (undocumented)

            case 0xD7: // XLAT
                if (cpu->cpu_context & CPU_CTX_ADDR32) {
                    cpu->AL = READ_MEM8(SEGMENT(&cpu->DS), cpu->EBX + cpu->AL);
                } else {
                    cpu->AL = READ_MEM8(SEGMENT(&cpu->DS), (cpu->BX + cpu->AL) & 0xFFFF);
                }
                return 0;

            case 0xD8: // ESC (IGNORED)
            case 0xD9:
            case 0xDA:
            case 0xDB:
            case 0xDC:
            case 0xDD:
            case 0xDE:
            case 0xDF:
            {
                modrm_t modrm;
                MODRM(cpu, seg, &modrm);
                return cpu_status_fpu;
            }

            case 0xE0: // LOOPNZ
            {
                int disp = MOVSXB(FETCH8(cpu));
                if (cpu->cpu_context & CPU_CTX_ADDR32) {
                    cpu->ECX--;
                    return JUMP_IF(cpu, disp, (cpu->ECX != 0 && cpu->ZF == 0));
                } else {
                    cpu->CX--;
                    return JUMP_IF(cpu, disp, (cpu->CX != 0 && cpu->ZF == 0));
                }
            }

            case 0xE1: // LOOPZ
            {
                int disp = MOVSXB(FETCH8(cpu));
                if (cpu->cpu_context & CPU_CTX_ADDR32) {
                    cpu->ECX--;
                    return JUMP_IF(cpu, disp, (cpu->ECX != 0 && cpu->ZF != 0));
                } else {
                    cpu->CX--;
                    return JUMP_IF(cpu, disp, (cpu->CX != 0 && cpu->ZF != 0));
                }
            }

            case 0xE2: // LOOP
            {
                int disp = MOVSXB(FETCH8(cpu));
                if (cpu->cpu_context & CPU_CTX_ADDR32) {
                    cpu->ECX--;
                    return JUMP_IF(cpu, disp, (cpu->ECX != 0));
                } else {
                    cpu->CX--;
                    return JUMP_IF(cpu, disp, (cpu->CX != 0));
                }
            }

            case 0xE3: // JCXZ
                if (cpu->cpu_context & CPU_CTX_ADDR32) {
                    return JUMP_IF(cpu, MOVSXB(FETCH8(cpu)), cpu->ECX == 0);
                } else {
                    return JUMP_IF(cpu, MOVSXB(FETCH8(cpu)), cpu->CX == 0);
                }

            case 0xE4: // IN AL, imm8
                cpu->AL = vpc_inb(FETCH8(cpu));
                return 0;
            
            case 0xE5: // IN AX, imm8
                if (cpu->cpu_context & (CPU_CTX_DATA32)) {
                    cpu->EAX = vpc_ind(FETCH8(cpu));
                } else {
                    cpu->AX = vpc_inw(FETCH8(cpu));
                }
                return 0;

            case 0xE6: // OUT imm8, AL
                vpc_outb(FETCH8(cpu), cpu->AL);
                return 0;

            case 0xE7: // OUT imm8, AX
                if (cpu->cpu_context & (CPU_CTX_DATA32)) {
                    vpc_outd(FETCH8(cpu), cpu->EAX);
                } else {
                    vpc_outw(FETCH8(cpu), cpu->AX);
                }
                return 0;

            case 0xE8: // call imm16
            {
                int disp = FETCHW(cpu);
                PUSHW(cpu, cpu->EIP);
                return JUMP_IF(cpu, disp, 1);
            }

            case 0xE9: // jmp imm16
            {
                int disp = FETCHW(cpu);
                return JUMP_IF(cpu, disp, 1);
            }

            case 0xEA: // jmp far imm32
            {
                uint32_t new_eip = FETCHW(cpu);
                uint16_t new_sel = FETCH16(cpu);
                return FAR_JUMP(cpu, new_sel, new_eip);
            }

            case 0xEB: // jmp d8
            {
                int disp = MOVSXB(FETCH8(cpu));
                if (disp == -2) {
                    // Reduce CPU power of forever loop
                    cpu->EIP += disp;
                    if (cpu->IF) {
                        return cpu_status_pause;
                    } else {
                        return cpu_status_exit;
                    }
                } else {
                    return JUMP_IF(cpu, disp, 1);
                }
            }

            case 0xEC: // IN AL, DX
                cpu->AL = vpc_inb(cpu->DX);
                return 0;

            case 0xED: // IN AX, DX
                if (cpu->cpu_context & (CPU_CTX_DATA32)) {
                    cpu->EAX = vpc_ind(cpu->DX);
                } else {
                    cpu->AX = vpc_inw(cpu->DX);
                }
                return 0;

            case 0xEE: // OUT DX, AL
                vpc_outb(cpu->DX, cpu->AL);
                return 0;

            case 0xEF: // OUT DX, AX
                if (cpu->cpu_context & (CPU_CTX_DATA32)) {
                    vpc_outd(cpu->DX, cpu->EAX);
                } else {
                    vpc_outw(cpu->DX, cpu->AX);
                }
                return 0;

            case 0xF0: // prefix LOCK (NOP)
                prefix |= PREFIX_LOCK;
                break;

            case 0xF1: // ICEBP (undocumented)
                return cpu_status_icebp;

            case 0xF2: // prefix REPNZ
                prefix |= PREFIX_REPNZ;
                break;

            case 0xF3: // prefix REPZ
                prefix |= PREFIX_REPZ;
                break;

            case 0xF4: // HLT
                if (is_kernel(cpu)) {
                    return cpu_status_halt;
                } else {
                    return RAISE_GPF(0);
                }

            case 0xF5: // CMC
                cpu->CF ^= 1;
                return 0;

            case 0xF6:
                MODRM_W(cpu, seg, 0, &set);
                switch (set.opr2) {
                    case 0: // TEST r/m8, imm8
                        SETF8(cpu, *set.opr1b & FETCH8(cpu));
                        cpu->CF = 0;
                        cpu->OF = 0;
                        return 0;
                    case 1: // TEST?
                        return cpu_status_ud;
                    case 2: // NOT r/m8
                        *set.opr1b = ~*set.opr1b;
                        return 0;
                    case 3: // NEG r/m8
                    {
                        int src = MOVSXB(*set.opr1b);
                        cpu->AF = !!(src & 15);
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
                        if (set.size == 1) {
                            SETF16(cpu, READ_LE16(set.opr1) & FETCH16(cpu));
                        } else {
                            SETF32(cpu, READ_LE32(set.opr1) & FETCH32(cpu));
                        }
                        cpu->CF = 0;
                        cpu->OF = 0;
                        return 0;
                    case 1: // TEST?
                        return cpu_status_ud;
                    case 2: // NOT r/m16
                        if (set.size == 1) {
                            WRITE_LE16(set.opr1, ~ READ_LE16(set.opr1));
                        } else {
                            WRITE_LE32(set.opr1, ~ READ_LE32(set.opr1));
                        }
                        return 0;
                    case 3: // NEG r/m16
                    {
                        if (set.size == 1) {
                            int src = MOVSXW(READ_LE16(set.opr1));
                            cpu->AF = !!(src & 15);
                            cpu->CF = !!src;
                            WRITE_LE16(set.opr1, SETF16(cpu, -src));
                        } else {
                            int src = READ_LE32(set.opr1);
                            if (src == INT32_MIN) {
                                cpu->CF = 1;
                                cpu->PF = 1;
                                cpu->AF = 0;
                                cpu->ZF = 0;
                                cpu->SF = 1;
                                cpu->OF = 1;
                            } else {
                                cpu->AF = !!(src & 15);
                                cpu->CF = !!src;
                                WRITE_LE32(set.opr1, SETF32(cpu, -src));
                            }
                        }
                        return 0;
                    }
                    case 4: // MUL ax, r/m16
                    {
                        if (set.size == 1) {
                            uint32_t value = cpu->AX * READ_LE16(set.opr1);
                            cpu->AX = value;
                            cpu->DX = value >> 16;
                            cpu->OF = cpu->CF = (cpu->DX != 0);
                        } else {
                            uint64_t value = (uint64_t)cpu->EAX * (uint64_t)READ_LE32(set.opr1);
                            cpu->EAX = value;
                            cpu->EDX = value >> 32;
                            cpu->OF = cpu->CF = (cpu->EDX != 0);
                        }
                        return 0;
                    }
                    case 5: // IMUL al, r/m16
                    {
                        if (set.size == 1) {
                            int value = MOVSXW(cpu->AX) * MOVSXW(READ_LE16(set.opr1));
                            cpu->AX = value;
                            cpu->DX = value >> 16;
                            cpu->OF = cpu->CF = (value > INT16_MAX || value < INT16_MIN);
                        } else {
                            int64_t value = MOVSXD(cpu->EAX) * MOVSXD(READ_LE32(set.opr1));
                            cpu->EAX = value;
                            cpu->EDX = value >> 32;
                            cpu->OF = cpu->CF = (value > INT32_MAX || value < INT32_MIN);
                        }
                        return 0;
                    }
                    case 6: // DIV ax, r/m16
                    {
                        if (set.size == 1) {
                            uint32_t dst = (cpu->DX << 16) | cpu->AX;
                            uint32_t src = READ_LE16(set.opr1);
                            if (src == 0) return cpu_status_div;
                            uint32_t value = dst / src;
                            if (value > 0x10000) return cpu_status_div;
                            cpu->AX = value;
                            cpu->DX = dst % src;
                        } else {
                            uint32_t edx = cpu->EDX;
                            if (edx) {
                                uint64_t dst = ((uint64_t)edx << 32) | (uint64_t)cpu->EAX;
                                uint64_t src = READ_LE32(set.opr1);
                                if (src == 0) return cpu_status_div;
                                uint64_t value = dst / src;
                                if (value > 0x100000000ULL) return cpu_status_div;
                                cpu->EAX = value;
                                cpu->EDX = dst % src;
                            } else {
                                uint32_t dst = cpu->EAX;
                                uint32_t src = READ_LE32(set.opr1);
                                if (src == 0) return cpu_status_div;
                                uint32_t value = dst / src;
                                cpu->EAX = value;
                                cpu->EDX = dst % src;
                            }
                        }
                        return 0;
                    }
                    case 7: // IDIV ax, r/m16
                    {
                        if (set.size == 1) {
                            int dst = (cpu->DX << 16) | cpu->AX;
                            int src = MOVSXW(READ_LE16(set.opr1));
                            if (src == 0) return cpu_status_div;
                            int value = dst / src;
                            if (value != MOVSXW(value)) return cpu_status_div;
                            cpu->AX = value;
                            cpu->DX = dst % src;
                        } else {
                            int64_t dst = ((uint64_t)(cpu->EDX) << 32) | (uint64_t)cpu->EAX;
                            int64_t src = MOVSXD(READ_LE32(set.opr1));
                            if (src == 0) return cpu_status_div;
                            int32_t value = dst / src;
                            if (value != MOVSXD(value)) return cpu_status_div;
                            cpu->EAX = value;
                            cpu->EDX = dst % src;
                        }
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
                if (is_kernel(cpu)) {
                    cpu->IF = 0;
                    return 0;
                } else {
                    return RAISE_GPF(0);
                }

            case 0xFB: // STI
                if (!cpu->IF) {
                    cpu->IF = 1;
                    return cpu_status_inta;
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
                        INC(cpu, &set);
                        return 0;
                    case 1: // DEC r/m8
                        DEC(cpu, &set);
                        return 0;
                    default:
                        return cpu_status_ud;
                }
            }
            case 0xFF: //
            {
                int value;
                int mod = MODRM_W(cpu, seg, 1, &set);
                switch (set.opr2) {
                    case 0: // INC r/m16
                        INC(cpu, &set);
                        return 0;
                    case 1: // DEC r/m16
                        DEC(cpu, &set);
                        return 0;
                    case 2: // CALL r/m16
                        PUSHW(cpu, cpu->EIP);
                        if (cpu->cpu_context & CPU_CTX_DATA32) {
                            cpu->EIP = READ_LE32(set.opr1);
                        } else {
                            cpu->EIP = READ_LE16(set.opr1);
                        }
                        return CS_LIMIT_CHECK(cpu, 0);
                    case 3: // CALL FAR m16:16
                    {
                        if (mod) return cpu_status_ud;
                        uint32_t new_sel, new_eip;
                        if (cpu->cpu_context & CPU_CTX_DATA32) {
                            new_eip = READ_LE32(set.opr1b);
                            new_sel = READ_LE16(set.opr1b + 4);
                        } else {
                            new_eip = READ_LE16(set.opr1b);
                            new_sel = READ_LE16(set.opr1b + 2);
                        }
                        return FAR_CALL(cpu, new_sel, new_eip);
                    }
                    case 4: // JMP r/m 16
                        if (cpu->cpu_context & CPU_CTX_DATA32) {
                            cpu->EIP = READ_LE32(set.opr1);
                        } else {
                            cpu->EIP = READ_LE16(set.opr1);
                        }
                        return CS_LIMIT_CHECK(cpu, 0);
                    case 5: // JMP FAR m16:16
                    {
                        if (mod) return cpu_status_ud;
                        uint32_t new_sel, new_eip;
                        if (cpu->cpu_context & CPU_CTX_DATA32) {
                            new_eip = READ_LE32(set.opr1b);
                            new_sel = READ_LE16(set.opr1b + 4);
                        } else {
                            new_eip = READ_LE16(set.opr1b);
                            new_sel = READ_LE16(set.opr1b + 2);
                        }
                        return FAR_JUMP(cpu, new_sel, new_eip);
                    }
                    case 6: // PUSH r/m16
                        if (cpu->cpu_context & CPU_CTX_DATA32) {
                            PUSHW(cpu, READ_LE32(set.opr1));
                        } else {
                            PUSHW(cpu, READ_LE16(set.opr1));
                        }
                        return 0;
                    default: // FF FF (#ud)
                        return cpu_status_ud;
                }
            }

            case 0x0F: // 2byte op
            {
                inst = FETCH8(cpu);
                switch (inst) {
                    case 0x00:
                    {
                        if (cpu->cpu_gen < cpu_gen_80386) return cpu_status_ud;
                        if (!cpu->CR0.PE || cpu->VM) return cpu_status_ud;
                        int mod = MODRM_W(cpu, seg, 1, &set);
                        switch(set.opr2) {
                            case 0: // SLDT
                                WRITE_LE16(set.opr1, cpu->LDT.sel);
                                return 0;
                            case 1: // STR
                                WRITE_LE16(set.opr1, cpu->TSS.sel);
                                return 0;
                            case 2: // LLDT
                            {
                                if (!is_kernel(cpu)) return RAISE_GPF(0);
                                uint16_t new_sel = READ_LE16(set.opr1);
                                return LOAD_DESCRIPTOR(cpu, &cpu->LDT, new_sel, type_bitmap_LDT, 1, NULL);
                            }
                            case 3: // LTR
                                if (!is_kernel(cpu)) return RAISE_GPF(0);
                                uint16_t new_sel = READ_LE16(set.opr1);
                                return LOAD_DESCRIPTOR(cpu, &cpu->TSS, new_sel, type_bitmap_TSS32, 0, NULL);
                            case 4: // VERR
                            {
                                sreg_t temp;
                                uint16_t sel = READ_LE16(set.opr1);
                                cpu->ZF = (LOAD_DESCRIPTOR(cpu, &temp, sel, type_bitmap_SEG_READ, 0, NULL) == 0);
                                return 0;
                            }
                            case 5: // VERW
                            {
                                sreg_t temp;
                                uint16_t sel = READ_LE16(set.opr1);
                                cpu->ZF = (LOAD_DESCRIPTOR(cpu, &temp, sel, type_bitmap_SEG_WRITE, 0, NULL) == 0);
                                return 0;
                            }
                        }
                        return cpu_status_ud;
                    }

                    case 0x01:
                    {
                        if (cpu->cpu_gen < cpu_gen_80386) return cpu_status_ud;
                        int mod = MODRM_W(cpu, seg, 1, &set);
                        switch(set.opr2) {
                            case 0: // SGDT
                            {
                                if (mod) return cpu_status_ud;
                                // TODO: 16bit SGDT
                                WRITE_LE16(set.opr1b, cpu->GDT.limit);
                                WRITE_LE32(set.opr1b, cpu->GDT.base);
                                return 0;
                            }
                            case 1: // SIDT
                            {
                                if (mod) return cpu_status_ud;
                                // TODO: 16bit SGDT
                                WRITE_LE16(set.opr1b, cpu->IDT.limit);
                                WRITE_LE32(set.opr1b, cpu->IDT.base);
                                return 0;
                            }
                            case 2: // LGDT
                            {
                                if (mod) return cpu_status_ud;
                                if (!is_kernel(cpu)) return RAISE_GPF(0);
                                desc_t new_dt;
                                new_dt.limit = READ_LE16(set.opr1b);
                                new_dt.base = READ_LE32(set.opr1b + 2);
                                if ((cpu->cpu_context & CPU_CTX_DATA32) == 0) {
                                    new_dt.base &= 0xFFFFFF;
                                }
                                cpu->GDT = new_dt;
                                return 0;
                            }
                            case 3: // LIDT
                            {
                                if (mod) return cpu_status_ud;
                                if (!is_kernel(cpu)) return RAISE_GPF(0);
                                desc_t new_dt;
                                new_dt.limit = READ_LE16(set.opr1b);
                                new_dt.base = READ_LE32(set.opr1b + 2);
                                if ((cpu->cpu_context & CPU_CTX_DATA32) == 0) {
                                    new_dt.base &= 0xFFFFFF;
                                }
                                cpu->IDT = new_dt;
                                return 0;
                            }
                            case 4: // SMSW
                            {
                                WRITE_LE16(set.opr1, cpu->CR[0]);
                                return 0;
                            }
                            case 6: // LMSW
                            {
                                if (cpu->cpu_gen < cpu_gen_80286) return cpu_status_ud;
                                if (!is_kernel(cpu)) return RAISE_GPF(0);
                                // LMSW affects only lower 4bits
                                uint32_t new_value = (*set.opr1b & 0x000F);
                                if (cpu->CR0.PE && ((new_value & 1) == 0)) return cpu_status_gpf;
                                // cpu->CR0.value = (cpu->CR0.value & 0xFFFFFFF0) | new_value;
                                cpu->CR0.msw = new_value;
                                return 0;
                            }
                            case 7: // INVLPG (NOP)
                                return 0;
                        }
                        return cpu_status_ud;
                    }

                    case 0x02: // LAR reg, r/m
                    {
                        if (!cpu->CR0.PE || cpu->VM) return cpu_status_ud;
                        sreg_t temp;
                        uint16_t sel = READ_LE16(set.opr1);
                        if (LOAD_DESCRIPTOR(cpu, &temp, sel, type_bitmap_SEG_ALL, 0, NULL) == 0) {
                            cpu->ZF = 1;
                            uint32_t value = temp.attr_u8l << 8;
                            if (cpu->cpu_context & CPU_CTX_DATA32) {
                                value |= temp.attr_u8h << 16;
                                cpu->gpr[set.opr2] = value;
                            } else {
                                WRITE_LE16(&cpu->gpr[set.opr2], value);
                            }
                        } else {
                            cpu->ZF = 0;
                        }
                        return 0;
                    }

                    case 0x03: // LSL reg, r/m
                    {
                        if (!cpu->CR0.PE || cpu->VM) return cpu_status_ud;
                        sreg_t temp;
                        uint16_t sel = READ_LE16(set.opr1);
                        if (LOAD_DESCRIPTOR(cpu, &temp, sel, type_bitmap_SEG_ALL, 0, NULL) == 0) {
                            cpu->ZF = 1;
                            uint32_t value = temp.limit;
                            if (cpu->cpu_context & CPU_CTX_DATA32) {
                                cpu->gpr[set.opr2] = value;
                            } else {
                                WRITE_LE16(&cpu->gpr[set.opr2], value);
                            }
                        } else {
                            cpu->ZF = 0;
                        }
                        return 0;
                    }

                    // case 0x05: // LOADALL / SYSCALL

                    case 0x06: // CLTS
                        if (is_kernel(cpu)) {
                            cpu->CR0.TS = 0;
                            return 0;
                        } else {
                            return RAISE_GPF(0);
                        }

                    // case 0x07: // LOADALL / SYSRET

                    case 0x08: // INVD (NOP)
                    case 0x09: // WBINVD (NOP)
                        return 0;

                    case 0x0B: // UD2
                        return cpu_status_ud;

                    case 0x1F: // LONG NOP
                    {
                        modrm_t modrm;
                        MODRM(cpu, NULL, &modrm);
                        return 0;
                    }

                    case 0x20: // MOV reg, Cr
                    case 0x22: // MOV Cr, reg
                    {
                        if (cpu->cpu_gen < cpu_gen_80386) return cpu_status_ud;
                        if (!is_kernel(cpu)) return RAISE_GPF(0);
                        modrm_t modrm;
                        if (!MODRM(cpu, NULL, &modrm)) return cpu_status_ud;
                        if ((1 << modrm.reg) & 0xFEE2) return cpu_status_gpf;
                        if (inst & 2) {
                            return MOV_CR(cpu, modrm.reg, cpu->gpr[modrm.rm]);
                        } else {
                            cpu->gpr[modrm.rm] = cpu->CR[modrm.reg];
                        }
                        return 0;
                    }

                    // case 0x21: // MOV reg, Dr
                    // case 0x23: // MOV Dr, reg
                    // {
                    //     // TODO:
                    //     if (cpu->cpu_gen < cpu_gen_80386) return cpu_status_ud;
                    //     if (!is_kernel(cpu)) return RAISE_GPF(0);
                    //     modrm_t modrm;
                    //     if (!MODRM(cpu, NULL, &modrm)) return cpu_status_ud;
                    //     if (inst & 2) {
                    //         // DO NOTHING
                    //     } else {
                    //         cpu->gpr[modrm.rm] = 0;
                    //     }
                    //     return 0;
                    // }

                    case 0x30: // WRMSR
                    case 0x32: // RDMSR
                    // case 0x33: // RDPMC
                    case 0x34: // SYSENTER
                    // case 0x35: // SYSEXIT
                    // case 0x37: // GETSEC
                        if (!is_kernel(cpu)) return RAISE_GPF(0);
                        return cpu_status_ud;

                    case 0x31: // RDTSC
                    {
                        uint64_t tsc = cpu->time_stamp_counter;
                        cpu->EAX = tsc;
                        cpu->EDX = tsc >> 32;
                        return 0;
                    }

                    // case 0x38: // SSE 3byte op
                    // case 0x3A: // SSE 3byte op

                    case 0x40: // CMOVcc reg, r/m
                    case 0x41:
                    case 0x42:
                    case 0x43:
                    case 0x44:
                    case 0x45:
                    case 0x46:
                    case 0x47:
                    case 0x48:
                    case 0x49:
                    case 0x4A:
                    case 0x4B:
                    case 0x4C:
                    case 0x4D:
                    case 0x4E:
                    case 0x4F:
                    {
                        MODRM_W(cpu, seg, 1, &set);
                        if (EVAL_CC(cpu, inst)) {
                            switch (set.size) {
                            case 1:
                                WRITE_LE16(&cpu->gpr[set.opr2], READ_LE16(set.opr1));
                                break;
                            case 2:
                                cpu->gpr[set.opr2] = READ_LE32(set.opr1);
                                break;
                            }
                        }
                        return 0;
                    }

                    case 0x80: // Jcc d16
                    case 0x81:
                    case 0x82:
                    case 0x83:
                    case 0x84:
                    case 0x85:
                    case 0x86:
                    case 0x87:
                    case 0x88:
                    case 0x89:
                    case 0x8A:
                    case 0x8B:
                    case 0x8C:
                    case 0x8D:
                    case 0x8E:
                    case 0x8F:
                        return JUMP_IF(cpu, FETCHW(cpu), EVAL_CC(cpu, inst));

                    case 0x90: // SETcc r/m8
                    case 0x91:
                    case 0x92:
                    case 0x93:
                    case 0x94:
                    case 0x95:
                    case 0x96:
                    case 0x97:
                    case 0x98:
                    case 0x99:
                    case 0x9A:
                    case 0x9B:
                    case 0x9C:
                    case 0x9D:
                    case 0x9E:
                    case 0x9F:
                    {
                        MODRM_W(cpu, seg, 0, &set);
                        if (set.opr2) return cpu_status_ud;
                        *set.opr1b = EVAL_CC(cpu, inst);
                        return 0;
                    }

                    case 0xA0: // PUSH FS
                        PUSHW(cpu, cpu->FS.sel);
                        return 0;

                    case 0xA1: // POP FS
                        return POP_SEG(cpu, &cpu->FS, type_bitmap_SEG_READ, 1);

                    case 0xA2: // CPUID
                    {
                        if (cpu->cpu_gen < cpu_gen_80386) return cpu_status_ud;
                        return CPUID(cpu);
                    }

                    case 0xA3: // BT r/m, reg
                    {
                        int mod = MODRM_W(cpu, seg, 1, &set);
                        BitTest(cpu, &set, mod, cpu->gpr[set.opr2], BitTestOp_BT);
                        return 0;
                    }

                    case 0xA4: // SHLD r/m, reg, imm8
                    {
                        MODRM_W(cpu, seg, 1, &set);
                        int imm = FETCH8(cpu);
                        SHLD(cpu, &set, imm);
                        return 0;
                    }
                    case 0xA5: // SHLD r/m, reg, CL
                        MODRM_W(cpu, seg, 1, &set);
                        SHLD(cpu, &set, cpu->CL);
                        return 0;

                    case 0xA8: // PUSH GS
                        PUSHW(cpu, cpu->GS.sel);
                        return 0;

                    case 0xA9: // POP GS
                        return POP_SEG(cpu, &cpu->GS, type_bitmap_SEG_READ, 1);

                    case 0xAB: // BTS r/m, reg
                    {
                        int mod = MODRM_W(cpu, seg, 1, &set);
                        BitTest(cpu, &set, mod, cpu->gpr[set.opr2], BitTestOp_BTS);
                        return 0;
                    }

                    case 0xAC: // SHRD r/m, reg, imm8
                    {
                        MODRM_W(cpu, seg, 1, &set);
                        int imm = FETCH8(cpu);
                        SHRD(cpu, &set, imm);
                        return 0;
                    }
                    case 0xAD: // SHRD r/m, reg, CL
                        MODRM_W(cpu, seg, 1, &set);
                        SHRD(cpu, &set, cpu->CL);
                        return 0;

                    case 0xAF: // IMUL reg, r/m16
                    {
                        MODRM_W(cpu, seg, 1, &set);
                        switch (set.size) {
                            case 1:
                            {
                                int src = MOVSXW(cpu->gpr[set.opr2]);
                                int dst = MOVSXW(READ_LE16(set.opr1));
                                src *= dst;
                                WRITE_LE16(&cpu->gpr[set.opr2], src);
                                cpu->OF = cpu->CF = (src != MOVSXW(src));
                                return 0;
                            }
                            case 2:
                            {
                                int src = cpu->gpr[set.opr2];
                                int dst = READ_LE32(set.opr1);
                                int64_t value = MOVSXD(src) * MOVSXD(dst);
                                cpu->gpr[set.opr2] = value;
                                cpu->OF = cpu->CF = (value != (int32_t)value);
                                return 0;
                            }
                        }
                    }

                    // case 0xB0: // CMPXCHG r/m, AL, r8
                    // case 0xB1: // CMPXCHG r/m, AX, r16

                    case 0xB2: // LSS reg, r/m
                        return LDS(cpu, seg, &cpu->SS);

                    case 0xB3: // BTR r/m, reg
                    {
                        int mod = MODRM_W(cpu, seg, 1, &set);
                        BitTest(cpu, &set, mod, cpu->gpr[set.opr2], BitTestOp_BTR);
                        return 0;
                    }

                    case 0xB4: // LFS reg, r/m
                        return LDS(cpu, seg, &cpu->FS);

                    case 0xB5: // LGS reg, r/m
                        return LDS(cpu, seg, &cpu->GS);

                    case 0xB6: // MOVZX reg, r/m8
                    case 0xB7: // MOVZX reg, r/m16
                    {
                        uint32_t value;
                        MODRM_W(cpu, seg, inst & 1, &set);
                        if (set.size) {
                            value = READ_LE16(set.opr1);
                        } else {
                            value = *set.opr1b;
                        }
                        if (cpu->cpu_context & CPU_CTX_DATA32) {
                            cpu->gpr[set.opr2] = value;
                        } else {
                            WRITE_LE16(&cpu->gpr[set.opr2], value);
                        }
                        return 0;
                    }

                    case 0xB8: // POPCNT reg, r/m16
                    {
                        if ((prefix & PREFIX_REPZ) == 0) return cpu_status_ud; // mandatory prefix
                        MODRM_W(cpu, seg, 1, &set);
                        switch (set.size) {
                            case 1:
                            {
                                int value = __builtin_popcount(READ_LE16(set.opr1));
                                WRITE_LE16(&cpu->gpr[set.opr2], SETF16(cpu, value));
                                return 0;
                            }
                            case 2:
                            {
                                int value = __builtin_popcount(READ_LE32(set.opr1));
                                cpu->gpr[set.opr2] = SETF32(cpu, value);
                                return 0;
                            }
                        }
                    }

                    case 0xBA: // BTx r/m, imm8
                    {
                        int mod = MODRM_W(cpu, seg, 1, &set);
                        int imm = FETCH8(cpu);
                        switch (set.opr2) {
                            case 4: // BT
                            case 5: // BTS
                            case 6: // BTR
                            case 7: // BTC
                                BitTest(cpu, &set, mod, imm, set.opr2 & 3);
                                return 0;
                        }
                        return cpu_status_ud;
                    }

                    case 0xBB: // BTC r/m, reg
                    {
                        int mod = MODRM_W(cpu, seg, 1, &set);
                        BitTest(cpu, &set, mod, cpu->gpr[set.opr2], BitTestOp_BTC);
                        return 0;
                    }

                    case 0xBE: // MOVSX reg, r/m8
                    case 0xBF: // MOVSX reg, r/m16
                    {
                        int value;
                        MODRM_W(cpu, seg, inst & 1, &set);
                        if (set.size) {
                            value = MOVSXW(READ_LE16(set.opr1));
                        } else {
                            value = MOVSXB(*set.opr1b);
                        }
                        if (cpu->cpu_context & CPU_CTX_DATA32) {
                            cpu->gpr[set.opr2] = value;
                        } else {
                            WRITE_LE16(&cpu->gpr[set.opr2], value);
                        }
                        return 0;
                    }

                    case 0xBC: // BSF reg16, r/m16
                    {
                        int value ;
                        MODRM_W(cpu, seg, 1, &set);
                        switch (set.size) {
                            case 1:
                                value = __builtin_ctz(READ_LE16(set.opr1));
                                cpu->gpr[set.opr2] = value;
                                cpu->ZF = (value == 0);
                                return 0;
                            case 2:
                                value = __builtin_ctz(READ_LE32(set.opr1));
                                cpu->gpr[set.opr2] = value;
                                cpu->ZF = (value == 0);
                                return 0;
                        }
                    }

                    case 0xBD: // BSR reg16, r/m16
                    {
                        int value;
                        uint32_t src;
                        MODRM_W(cpu, seg, 1, &set);
                        switch (set.size) {
                            case 1:
                                src = READ_LE16(set.opr1);
                                value = 31 ^ __builtin_clz(src);
                                cpu->gpr[set.opr2] = value;
                                cpu->ZF = (value == src);
                                return 0;
                            case 2:
                                src = READ_LE32(set.opr1);
                                value = 31 ^ __builtin_clz(src);
                                cpu->gpr[set.opr2] = value;
                                cpu->ZF = (value == src);
                                return 0;
                        }
                    }

                    case 0xC0: // XADD r/m, reg8
                    case 0xC1: // XADD r/m, reg16
                    {
                        int src, dst, value;
                        MODRM_W(cpu, seg, inst & 1, &set);
                        switch (set.size) {
                            case 0:
                            {
                                uint8_t *opr2b = LEA_REG8(cpu, set.opr2);
                                dst = MOVSXB(*set.opr1b);
                                src = MOVSXB(*opr2b);
                                value = dst + src;
                                cpu->AF = (dst & 15) + (src & 15) > 15;
                                cpu->CF = (uint8_t)dst > (uint8_t)value;
                                *opr2b = SETF8(cpu, dst);
                                *set.opr1b = value;
                                return 0;
                            }
                            case 1:
                            {
                                void *opr2 = &cpu->gpr[set.opr2];
                                dst = MOVSXB(READ_LE16(set.opr1));
                                src = MOVSXW(READ_LE16(opr2));
                                value = dst + src;
                                cpu->AF = (dst & 15) + (src & 15) > 15;
                                cpu->CF = (uint16_t)dst > (uint16_t)value;
                                WRITE_LE16(opr2, SETF16(cpu, dst));
                                WRITE_LE16(set.opr1, value);
                                return 0;
                            }
                            case 2:
                            {
                                void *opr2 = &cpu->gpr[set.opr2];
                                dst = READ_LE32(set.opr1);
                                src = cpu->gpr[set.opr2];
                                value = dst + src;
                                cpu->AF = (dst & 15) + (src & 15) > 15;
                                cpu->CF = (uint32_t)dst > (uint32_t)value;
                                cpu->gpr[set.opr2] = SETF32(cpu, dst);
                                WRITE_LE32(set.opr1, value);
                                return 0;
                            }
                        }
                    }

                    case 0xC8: // BSWAP reg32
                    case 0xC9:
                    case 0xCA:
                    case 0xCB:
                    case 0xCC:
                    case 0xCD:
                    case 0xCE:
                    case 0xCF:
                        cpu->gpr[inst & 7] = __builtin_bswap32(cpu->gpr[inst & 7]);
                        return 0;

                }
            }

            default:
                return cpu_status_ud;
        }
    }
}

char *dump_segment(char *p, sreg_t *seg) {
    p = dump16(p, seg->sel);
    p = dump_string(p, " ");
    p = dump32(p, seg->base);
    p = dump_string(p, "-");
    p = dump32(p, seg->limit);
    p = dump_string(p, " ");
    p = dump16(p, seg->attrs);
    return p;
}

void dump_regs(cpu_state *cpu, uint32_t eip) {
    static char buff[1024];
    char *p = buff;

    if (cpu->cpu_gen >= cpu_gen_80386) {
        p = dump_string(p, "EAX ");
        p = dump32(p, cpu->EAX);
        p = dump_string(p, " EBX ");
        p = dump32(p, cpu->EBX);
        p = dump_string(p, " ECX ");
        p = dump32(p, cpu->ECX);
        p = dump_string(p, " EDX ");
        p = dump32(p, cpu->EDX);
        p = dump_string(p, " ESP ");
        p = dump32(p, cpu->ESP);
        p = dump_string(p, " EBP ");
        p = dump32(p, cpu->EBP);
        p = dump_string(p, "\nESI ");
        p = dump32(p, cpu->ESI);
        p = dump_string(p, " EDI ");
        p = dump32(p, cpu->EDI);
        p = dump_string(p, " EIP ");
        p = dump32(p, cpu->EIP);
        p = dump_string(p, " EFLAGS ");
        p = dump32(p, cpu->eflags);
    } else {
        p = dump_string(p, "AX ");
        p = dump16(p, cpu->AX);
        p = dump_string(p, " BX ");
        p = dump16(p, cpu->BX);
        p = dump_string(p, " CX ");
        p = dump16(p, cpu->CX);
        p = dump_string(p, " DX ");
        p = dump16(p, cpu->DX);
        p = dump_string(p, " SP ");
        p = dump16(p, cpu->SP);
        p = dump_string(p, " BP ");
        p = dump16(p, cpu->BP);
        p = dump_string(p, " SI ");
        p = dump16(p, cpu->SI);
        p = dump_string(p, " DI ");
        p = dump16(p, cpu->DI);
        p = dump_string(p, "\nCS ");
        p = dump16(p, cpu->CS.sel);
        p = dump_string(p, " SS ");
        p = dump16(p, cpu->SS.sel);
        p = dump_string(p, " DS ");
        p = dump16(p, cpu->DS.sel);
        p = dump_string(p, " ES ");
        p = dump16(p, cpu->ES.sel);
        // p = dump_string(p, " FS ");
        // p = dump16(p, cpu->FS.sel);
        // p = dump_string(p, " GS ");
        // p = dump16(p, cpu->GS.sel);
        p = dump_string(p, " FLAGS ");
        p = dump16(p, cpu->eflags);
    }
    *p++ = ' ';
    *p++ = cpu->OF ? 'O' : '-';
    *p++ = cpu->DF ? 'D' : 'U';
    *p++ = cpu->IF ? 'I' : '-';
    *p++ = cpu->SF ? 'S' : '-';
    *p++ = cpu->ZF ? 'Z' : '-';
    *p++ = cpu->PF ? 'P' : '-';
    *p++ = cpu->CF ? 'C' : '-';

    if (cpu->cpu_gen >= cpu_gen_80386) {
        if (cpu->CR0.PE) {
            p = dump_string(p, "\nCS ");
            p = dump_segment(p, &cpu->CS);
            p = dump_string(p, " SS ");
            p = dump_segment(p, &cpu->SS);
            p = dump_string(p, "\nDS ");
            p = dump_segment(p, &cpu->DS);
            p = dump_string(p, " ES ");
            p = dump_segment(p, &cpu->ES);
            p = dump_string(p, "\nFS ");
            p = dump_segment(p, &cpu->FS);
            p = dump_string(p, " GS ");
            p = dump_segment(p, &cpu->GS);
            p = dump_string(p, "\nGDT ");
            p = dump_segment(p, &cpu->GDT);
            p = dump_string(p, " IDT ");
            p = dump_segment(p, &cpu->IDT);
            p = dump_string(p, "\nLDT ");
            p = dump_segment(p, &cpu->LDT);
            p = dump_string(p, " TSS ");
            p = dump_segment(p, &cpu->TSS);
        } else {
            p = dump_string(p, "\nCS ");
            p = dump16(p, cpu->CS.sel);
            p = dump_string(p, " SS ");
            p = dump16(p, cpu->SS.sel);
            p = dump_string(p, " DS ");
            p = dump16(p, cpu->DS.sel);
            p = dump_string(p, " ES ");
            p = dump16(p, cpu->ES.sel);
            p = dump_string(p, " FS ");
            p = dump16(p, cpu->FS.sel);
            p = dump_string(p, " GS ");
            p = dump16(p, cpu->GS.sel);
        }
    }
    *p++ = '\n';
    p = dump_disasm(p, cpu, eip);
    *p = 0;
    println(buff);
}

void cpu_reset(cpu_state *cpu, int gen) {
    int new_gen;
    if (gen >= 0) {
        new_gen = gen;
    } else {
        new_gen = cpu->cpu_gen;
    }

    memset(cpu, 0, sizeof(cpu_state));

    cpu->n_bps = 0;
    cpu->cpu_gen = new_gen;
    cpu->cpuid_model_id = 0x00 | (new_gen << 8);

    cpu->flags_mask = 0x003F7FD5;
    cpu->flags_mask1 = 0x00000002;
    switch (cpu->cpu_gen) {
        case cpu_gen_8086:
        case cpu_gen_80186:
            cpu->flags_mask1 |= 0x0000F000;
            break;
        case cpu_gen_80286:
            cpu->flags_mask &= 0x00000FFF;
            break;
        case cpu_gen_80386:
            cpu->flags_mask &= 0x0003FFFF;
            break;
        case cpu_gen_80486:
            cpu->flags_mask &= 0x0027FFFF;
            break;
    }
    cpu->flags_mask_intrm = 0xFFFBFCFF;
    cpu->flags_preserve_iret3 = 0x001B7200;
    cpu->flags_preserve_popf = 0;
    LOAD_FLAGS(cpu, 0, 0);

    cpu->cr0_valid = 0xE005003F & INT32_MAX;
    switch (cpu->cpu_gen) {
        case cpu_gen_8086:
        case cpu_gen_80186:
            cpu->cr0_valid = 0;
        case cpu_gen_80286:
            cpu->cr0_valid &= 0x0000FFFF;
            break;
        case cpu_gen_80386:
            cpu->cr0_valid &= 0x8000FFFF;
            break;
        case cpu_gen_80486:
            break;
    }

    cpu->cr4_valid = 0x00000009;

    cpu->RPL = 0;
    cpu->CPL = 0;
    cpu->EIP = 0x0000FFF0;
    cpu->CS.sel = 0xF000;
    cpu->CS.base = 0x000F0000;
    cpu->CS.attrs = 0x009B;
    cpu->CS.limit = 0x0000FFFF;
    LOAD_SEL8086(cpu, &cpu->SS, 0);
    LOAD_SEL8086(cpu, &cpu->DS, 0);
    LOAD_SEL8086(cpu, &cpu->ES, 0);
    LOAD_SEL8086(cpu, &cpu->FS, 0);
    LOAD_SEL8086(cpu, &cpu->GS, 0);
    cpu->CR[0] = 0x00000010 & cpu->cr0_valid;
    cpu->GDT.limit = 0xFFFF;
    cpu->IDT.limit = 0xFFFF;
    cpu->LDT.limit = 0xFFFF;
    cpu->TSS.limit = 0xFFFF;
    cpu->EDX = cpu->cpuid_model_id;
}

static int check_irq(cpu_state *cpu) {
    if (!cpu->IF) return 0;
    int vector = vpc_irq();
    if (!vector) return 0;
    return INVOKE_INT(cpu, vector, external);
}

static int cpu_block(cpu_state *cpu, int speed_status) {
    int periodic = speed_status;

    int status = check_irq(cpu);
    if (status) return status;
    int has_to_trace = 0;
    if (cpu->TF) {
        has_to_trace = 1;
        periodic = 1;
    }
    int i = 0;
    int is_debug = cpu->n_bps;
    for (; i < periodic; i++) {
        // if (is_debug && cpu->bps[0].offset == cpu->EIP && cpu->bps[0].sel == cpu->CS.sel) {
        //     cpu->n_bps = 0;
        //     return cpu_status_icebp;
        // }
        uint32_t last_known_eip = cpu->EIP;
        int status = cpu_step(cpu);
        if (status == cpu_status_periodic) continue;

        if (status == cpu_status_inta) {
            status = check_irq(cpu);
            if (status) return status;
            if (cpu->TF) {
                last_known_eip = cpu->EIP;
                status = cpu_step(cpu);
                if (status) goto check;
                has_to_trace = 0;
                status = INVOKE_INT(cpu, 1, exception);
                if (status) return status;
            }
            continue;
        }
check:
        switch (status) {
            case cpu_status_pause:
                return cpu_status_periodic;
            case cpu_status_div:
                if (cpu->cpu_gen >= cpu_gen_80286) {
                    cpu->EIP = last_known_eip;
                }
                status = INVOKE_INT(cpu, 0, exception); // #DE
                if (status) return status;
                continue;
            case cpu_status_halt:
            case cpu_status_icebp:
                return status;
            case cpu_status_fpu:
                continue;
            case cpu_status_ud:
            default:
                cpu->EIP = last_known_eip;
                return status;
        }
    }

    cpu->time_stamp_counter += (i + 1);

    // status = check_irq(cpu);
    // if (status) return status;
    if (has_to_trace) {
        INVOKE_INT(cpu, 1, exception);
    }
    return cpu_status_periodic;
}


/**
 * Allocate internal CPU structure.
 */
WASM_EXPORT cpu_state *alloc_cpu(int gen) {
    static cpu_state cpu;
    cpu_reset(&cpu, gen);
    return &cpu;
}

/**
 * Run CPU for a while.
 */
WASM_EXPORT int run(cpu_state *cpu, int speed_status) {
    int status = cpu_block(cpu, speed_status);
    switch (status) {
        case cpu_status_periodic:
        case cpu_status_significant:
        case cpu_status_exit:
        case cpu_status_icebp:
            return status;
        case cpu_status_halt:
            if (cpu->IF) {
                return cpu_status_halt;
            } else {
                println("#### SYSTEM HALTED");
                dump_regs(cpu, cpu->EIP);
                return cpu_status_exit;
            }
        case cpu_status_div:
            println("#### DIVIDE ERROR");
            dump_regs(cpu, cpu->EIP);
            return status;

        case cpu_status_ud:
            if (!cpu->VM) {
                println("#### PANIC: UNDEFINED INSTRUCTION");
                dump_regs(cpu, cpu->EIP);
                return status;
            }
        default:
            // if (cpu->CR0.PE && status > cpu_status_exception_base) {
            //     int status2 = INVOKE_INT(cpu, status >> 16, exception);
            //     if (status2) { // DOUBLE FAULT
            //         status2 = INVOKE_INT(cpu, 8, exception);
            //         if (status2 == 0) {
            //             PUSHW(cpu, 0);
            //             return 0;
            //         }
            //     } else {
            //         if (status > cpu_status_ud) {
            //             PUSHW(cpu, status & UINT16_MAX);
            //         }
            //         return 0;
            //     }
            // }
            println("#### PANIC: TRIPLE FAULT!!!");
            dump_regs(cpu, cpu->EIP);
            return status;
    }
}


/**
 * Run CPU step by step.
 * 
 * When an exception occurs during `step`, the status code is returned but no interrupt is generated.
 *
 * @returns Status Code, see below.
 * |Status Code|Cause|Continuity|Description|
 * |-|-|-|-|
 * |0|Periodic|Y|Periodic return|
 * |1|Significant|N/A|OBSOLETED|
 * |2|Pause|Y|CPU runs PAUSE instruction|
 * |3|INTA|Y|Interrupt acknowledge cycle|
 * |4|ICEBP|Y|CPU runs ICEBP instruction|
 * |0x1000|Halt|Y|CPU runs HLT instruction|
 * |>0x10000|Exit|N|CPU enters to shutdown|
 * |0x10001|Shutdown|N|shutdown|
 * |0x10002|#DE|conditional|Divide by zero|
 * |0x60000|#UD|conditional|Undefined instruction|
 * |0x70000|#NM|conditional|FPU Not Available|
 * |0x8XXXX|#DF|N|Double Fault|
 * |0xAXXXX|#TS|conditional|Invalid TSS|
 * |0xBXXXX|#NP|conditional|Segment Not Present|
 * |0xCXXXX|#SS|conditional|Stack Exception|
 * |0xDXXXX|#GP|conditional|General Protection Exception|
 * |0xEXXXX|#PF|conditional|Page Fault (NOT IMPLEMENTED)|
 * 
 */
WASM_EXPORT int step(cpu_state *cpu) {
    uint32_t last_eip = cpu->EIP;
    cpu->time_stamp_counter++;
    int status = cpu_step(cpu);
    if (status >= cpu_status_exception) {
        cpu->EIP = last_eip;
    }
    return status;
}


/**
 * Prepare step over
 * 
 * @retval true next instruction needs breakpoint
 * @retval false next instruction can step
 */
WASM_EXPORT int prepare_step_over(cpu_state *cpu) {
    return 0;
    // TODO:

    // bp_vec_t bp = {
    //     .offset = cpu->EIP + get_inst_len(cpu),
    //     .sel = cpu->CS.sel,
    // };
    // cpu->bps[0] = bp;
    // cpu->n_bps = 1;
    // return 1;
}


/**
 * Dump state of CPU.
 */
WASM_EXPORT void debug_dump(cpu_state *cpu) {
    dump_regs(cpu, cpu->EIP);
}

/**
 * Reset CPU and change generation to specified value.
 * 
 * All registers are reset to predefined values.
 */
WASM_EXPORT void reset(cpu_state *cpu, int gen) {
    cpu_reset(cpu, gen);
}


/**
 * Load Selector into specified Segment for debugging.
 */
WASM_EXPORT int debug_load_selector(cpu_state *cpu, sreg_t *seg, uint16_t selector) {
    return LOAD_DESCRIPTOR(cpu, seg, selector, type_bitmap_SEG_ALL, 1, NULL);
}

WASM_EXPORT uint32_t debug_get_segment_base(cpu_state *cpu, uint16_t selector) {
    sreg_t temp;
    int status = LOAD_DESCRIPTOR(cpu, &temp, selector, type_bitmap_SEG_ALL, 1, NULL);
    if (status) return 0;
    return temp.base;
}

/**
 * Get JSON of register map for debugging.
 */
WASM_EXPORT const char *debug_get_register_map(cpu_state *cpu) {
    static char buffer[1024];
    char *p = buffer;
    p = dump_string(p, "{\"AX\":");
    p = dump_dec(p, (intptr_t)&cpu->AX);
    p = dump_string(p, ",\"BX\":");
    p = dump_dec(p, (intptr_t)&cpu->BX);
    p = dump_string(p, ",\"CX\":");
    p = dump_dec(p, (intptr_t)&cpu->CX);
    p = dump_string(p, ",\"DX\":");
    p = dump_dec(p, (intptr_t)&cpu->DX);
    p = dump_string(p, ",\"BP\":");
    p = dump_dec(p, (intptr_t)&cpu->BP);
    p = dump_string(p, ",\"SP\":");
    p = dump_dec(p, (intptr_t)&cpu->SP);
    p = dump_string(p, ",\"SI\":");
    p = dump_dec(p, (intptr_t)&cpu->SI);
    p = dump_string(p, ",\"DI\":");
    p = dump_dec(p, (intptr_t)&cpu->DI);
    p = dump_string(p, ",\"IP\":");
    p = dump_dec(p, (intptr_t)&cpu->EIP);
    p = dump_string(p, ",\"flags\":");
    p = dump_dec(p, (intptr_t)&cpu->eflags);
    p = dump_string(p, ",\"CS\":");
    p = dump_dec(p, (intptr_t)&cpu->CS.sel);
    p = dump_string(p, ",\"CS.limit\":");
    p = dump_dec(p, (intptr_t)&cpu->CS.limit);
    p = dump_string(p, ",\"CS.base\":");
    p = dump_dec(p, (intptr_t)&cpu->CS.base);
    p = dump_string(p, ",\"CS.attr\":");
    p = dump_dec(p, (intptr_t)&cpu->CS.attrs);
    p = dump_string(p, ",\"DS\":");
    p = dump_dec(p, (intptr_t)&cpu->DS.sel);
    p = dump_string(p, ",\"ES\":");
    p = dump_dec(p, (intptr_t)&cpu->ES.sel);
    p = dump_string(p, ",\"SS\":");
    p = dump_dec(p, (intptr_t)&cpu->SS.sel);
    p = dump_string(p, ",\"FS\":");
    p = dump_dec(p, (intptr_t)&cpu->FS.sel);
    p = dump_string(p, ",\"GS\":");
    p = dump_dec(p, (intptr_t)&cpu->GS.sel);
    p = dump_string(p, ",\"CR0\":");
    p = dump_dec(p, (intptr_t)&cpu->CR[0]);
    p = dump_string(p, "}");
    *p = 0;
    return buffer;
}

/**
 * get vram signature
 */
WASM_EXPORT uint32_t get_vram_signature(uint32_t base, size_t size) {
    int shift = 13;
    uint32_t acc = 0;
    uint32_t *vram = (uint32_t *)(mem + base);
    const uint32_t max_vram = size / 4;
    for (int i = 0; i < max_vram; i++) {
        uint32_t v = vram[i];
        acc = ((acc >> (32 - shift)) | (acc << shift)) + v;
    }
    return acc;
}




static inline int parse_modrm(int use32, uint32_t rip, int *_skip, modrm_t *result) {
    const int REG_NOT_SELECTED = -1;
    int len = 1;
    result->modrm = mem[rip];

    result->parsed.d32 = 0;
    result->parsed.reg = result->reg;
    int mod = result->mod;
    if (mod == 3) {
        result->parsed.base = result->rm;
    } else {
        int base = REG_NOT_SELECTED, index = REG_NOT_SELECTED;
        if (use32) {
            result->parsed.use32 = 1;
            if (result->rm != 4) {
                base = result->rm;
            } else {
                result->sib = mem[rip + len];
                len++;
                base = result->base;
                if (result->index != 4) {
                    index = result->index;
                    result->parsed.scale = result->scale;
                }
            }
            if (mod == 0 && base == index_EBP) {
                base = REG_NOT_SELECTED;
                mod = 4;
            }
            if (mod == 2) {
                mod = 4;
            }
        } else {
            switch (result->rm) {
                case 0:
                    base = index_BX;
                    index = index_SI;
                    break;
                case 1:
                    base = index_BX;
                    index = index_DI;
                    break;
                case 2:
                    base = index_BP;
                    index = index_SI;
                    break;
                case 3:
                    base = index_BP;
                    index = index_DI;
                    break;
                case 4:
                    base = index_SI;
                    break;
                case 5:
                    base = index_DI;
                    break;
                case 6:
                    if (mod == 0) {
                        mod = 2;
                    } else {
                        base = index_BP;
                    }
                    break;
                case 7:
                    base = index_BX;
                    break;
            }
        }
        if (base >= 0) {
            result->parsed.base = base;
            result->parsed.has_base = 1;
        }
        if (index >= 0) {
            result->parsed.index = index;
            result->parsed.has_index = 1;
        }
        result->parsed.disp_bits = mod;
        switch (mod) {
            case 1:
                result->parsed.disp = MOVSXB(mem[rip + len]);
                len++;
                break;
            case 2:
                result->parsed.disp = MOVSXW(READ_LE16(mem + rip + len));
                len += 2;
                break;
            case 4:
                result->parsed.disp = READ_LE32(mem + rip + len);
                len += 4;
                break;
            default:
                // result->parsed.disp = 0;
                break;
        }
    }

    *_skip = len;

    return (result->mod == 3) ? 3 : 0;
}

static inline char *disasm_separator(char *p, int *n_opl) {
    if (*n_opl) {
        p = dump_string(p, ", ");
    } else {
        p = dump_string(p, "\t");
    }
    *n_opl += 1;
    return p;
}


static inline char *disasm_reg(char *p, int *n_opl, int index, disasm_reg_type type) {
    p = disasm_separator(p, n_opl);
    switch (type) {
        case reg_type_al:
            p = dump_string(p, reg_names_AL[index]);
            break;
        case reg_type_ax:
            p = dump_string(p, reg_names_AX[index]);
            break;
        case reg_type_eax:
            p = dump_string(p, reg_names_EAX[index]);
            break;
        case reg_type_sreg:
            p = dump_string(p, reg_names_sreg[index]);
            break;
        case reg_type_creg:
            p = dump_string(p, "CR");
            *p++ = '0' + index;
            break;
        case reg_type_dreg:
            p = dump_string(p, "DR");
            *p++ = '0' + index;
            break;
    }
    return p;
}

static inline char *disasm_Ib(char *p, int *n_opl, uint32_t base, int *_len) {
    int len = *_len;
    p = disasm_separator(p, n_opl);
    int8_t i = mem[base + len];
    p = dump8(p, i);
    len++;
    *_len = len;
    return p;
}

static inline char *disasm_Iw(char *p, int *n_opl, uint32_t base, int *_len) {
    int len = *_len;
    p = disasm_separator(p, n_opl);
    int16_t i = READ_LE16(mem + base + len);
    p = dump16(p, i);
    len += 2;
    *_len = len;
    return p;
}

static inline char *disasm_Iz(char *p, int *n_opl, uint32_t base, int *_len, int use32) {
    int len = *_len;
    p = disasm_separator(p, n_opl);
    if (use32) {
        int32_t i = READ_LE32(mem + base + len);
        p = dump32(p, i);
        len += 4;
    } else {
        int16_t i = READ_LE16(mem + base + len);
        p = dump16(p, i);
        len += 2;
    }
    *_len = len;
    return p;
}

static inline char *disasm_dump_Gx(char *p, int *n_opl, modrm_t modrm, optype_t optype, int use32) {
    int type_gx = optype & opa_Gmask;
    switch (type_gx) {
        case opa_Gb:
            p = disasm_reg(p, n_opl, modrm.reg, reg_type_al);
            break;
        case opa_Gw:
            p = disasm_reg(p, n_opl, modrm.reg, reg_type_ax);
            break;
        case opa_Gv:
            p = disasm_reg(p, n_opl, modrm.reg, reg_type_ax + !!(use32 & CPU_CTX_DATA32));
            break;
        default:
        {
            int type_Ox = optype & opa_Omask;
            switch (type_Ox) {
                case opa_Sw:
                    p = disasm_reg(p, n_opl, modrm.reg, reg_type_sreg);
                    break;
                case opa_RdCd:
                    p = disasm_reg(p, n_opl, modrm.reg, reg_type_creg);
                    break;
                case opa_RdDd:
                    p = disasm_reg(p, n_opl, modrm.reg, reg_type_dreg);
                    break;
                default: break;
            }
        }
    }
    return p;
}

static inline char *disasm_main(char * p, uint16_t sel, uint32_t eip, uint32_t rip, int _use32, int *length) {
    int len = 0;
    int use32 = _use32 ? (CPU_CTX_DATA32 + CPU_CTX_ADDR32) : 0;

    if (sel || !use32) {
        p = dump16(p, sel);
        *p++ = ':';
    }
    if (use32 || eip > 0xFFFF) {
        p = dump32(p, eip);
    } else {
        p = dump16(p, eip);
    }
    *p++ = ' ';
    char *q = p;
    int max_len = 8;
    for (int i = 0; i < max_len * 2 + 1; i++) {
        *p++ = ' ';
    }

    if (rip < max_mem) {
        while (rip < max_mem) {
            unsigned opcode = mem[rip + len];
            len++;
            opmap_t map1 = opcode1[opcode];
            modrm_t modrm;
            const char *name_ptr = NULL;

            switch (map1.optype) {
                case optype_prefix66:
                    use32 ^= 0x1;
                    continue;
                case optype_prefix67:
                    use32 ^= 0x2;
                    continue;
                case optype_extend_0F:
                    opcode = (opcode * 256) + mem[rip + len];
                    len++;
                    map1 = opcode2[opcode & 0xFF];
                    break;
                default: break;
            }

            if (map1.name) {
                if (use32 && map1.name32) {
                    name_ptr = map1.name32;
                } else {
                    name_ptr = map1.name;
                }
            }
            if (map1.optype == optype_prefix) {
                if (name_ptr) {
                    p = dump_string(p, name_ptr);
                }
                *p++ = ' ';
                continue;
            }

            if ((map1.optype & optype_modrm_)) {
                int skip = 0;
                parse_modrm(use32 & CPU_CTX_ADDR32, rip + len, &skip, &modrm);
                len += skip;
                if ((map1.optype & opa_group) != 0 && map1.group != 0) {
                    map1 = map1.group[modrm.reg];
                    name_ptr = map1.name;
                } else if (map1.optype & opa_shift) {
                    name_ptr = shift_names[modrm.reg];
                }
            }
            if (name_ptr) {
                p = dump_string(p, name_ptr);
            } else {
                p = dump_string(p, "???");
            }

            int n_oplands = 0;

            if ((map1.n_oplands & 1) != 0) {
                p = disasm_separator(p, &n_oplands);
                p = dump_string(p, map1.oplands1);
            }

            switch (map1.optype) {
                case optype_implied:
                case optype_string:
                    break;

                case optype_Zb:
                    p = disasm_reg(p, &n_oplands, opcode & 7, reg_type_al);
                    break;

                case optype_ZbIb:
                    p = disasm_reg(p, &n_oplands, opcode & 7, reg_type_al);
                    p = disasm_Ib(p, &n_oplands, rip, &len);
                    break;

                case optype_Zv:
                    p = disasm_reg(p, &n_oplands, opcode & 7, reg_type_ax + !!(use32 & CPU_CTX_DATA32));
                    break;

                case optype_ZvIv:
                    p = disasm_reg(p, &n_oplands, opcode & 7, reg_type_ax + !!(use32 & CPU_CTX_DATA32));
                    p = disasm_Iz(p, &n_oplands, rip, &len, use32 & CPU_CTX_DATA32);
                    break;

                case optype_Ib:
                    p = disasm_Ib(p, &n_oplands, rip, &len);
                    break;

                case optype_ALIb:
                    p = disasm_reg(p, &n_oplands, index_AL, reg_type_al);
                    p = disasm_Ib(p, &n_oplands, rip, &len);
                    break;

                case optype_IbAL:
                    p = disasm_Ib(p, &n_oplands, rip, &len);
                    p = disasm_reg(p, &n_oplands, index_AL, reg_type_al);
                    break;

                case optype_Iw:
                    p = disasm_Iw(p, &n_oplands, rip, &len);
                    break;

                case optype_Iz:
                    p = disasm_Iz(p, &n_oplands, rip, &len, use32 & CPU_CTX_DATA32);
                    break;

                case optype_IwIb:
                    p = disasm_Iw(p, &n_oplands, rip, &len);
                    p = disasm_Ib(p, &n_oplands, rip, &len);
                    break;

                case optype_AXIz:
                    p = disasm_reg(p, &n_oplands, index_AX, reg_type_ax + !!(use32 & CPU_CTX_DATA32));
                    p = disasm_Iz(p, &n_oplands, rip, &len, use32 & CPU_CTX_DATA32);
                    break;

                case optype_Jb:
                {
                    p = disasm_separator(p, &n_oplands);
                    int8_t j = mem[rip + len];
                    len++;
                    if (use32 & CPU_CTX_ADDR32) {
                        p = dump32(p, eip + len + j);
                    } else {
                        p = dump16(p, eip + len + j);
                    }
                    n_oplands++;
                    break;
                }

                case optype_Jz:
                {
                    p = disasm_separator(p, &n_oplands);
                    if (use32 & CPU_CTX_ADDR32) {
                        int32_t j = READ_LE32(mem + rip + len);
                        len += 4;
                        p = dump32(p, eip + len + j);
                    } else {
                        int16_t j = READ_LE16(mem + rip + len);
                        len += 2;
                        p = dump16(p, eip + len + j);
                    }
                    n_oplands++;
                    break;
                }

                case optype_Ap:
                {
                    p = disasm_separator(p, &n_oplands);
                    n_oplands++;

                    uint32_t offset;
                    if (use32 & CPU_CTX_DATA32) {
                        offset = READ_LE32(mem + rip + len);
                        len += 4;
                    } else {
                        offset = READ_LE16(mem + rip + len);
                        len += 2;
                    }
                    int16_t sel = READ_LE16(mem + rip + len);
                    len += 2;

                    p = dump16(p, sel);
                    *p++ = ':';
                    if (use32 & CPU_CTX_DATA32) {
                        p = dump32(p, offset);
                    } else {
                        p = dump16(p, offset);
                    }
                    break;
                }

                case optype_ALOb:
                case optype_AXOv:
                case optype_ObAL:
                case optype_OvAX:
                {
                    switch (map1.optype) {
                    case optype_ALOb:
                        p = disasm_reg(p, &n_oplands, index_AL, reg_type_al);
                        break;
                    case optype_AXOv:
                        p = disasm_reg(p, &n_oplands, index_AX, reg_type_ax + !!(use32 & CPU_CTX_DATA32));
                        break;
                    default: break;
                    }

                    p = disasm_separator(p, &n_oplands);
                    *p++ = '[';
                    if (use32 & CPU_CTX_ADDR32) {
                        int32_t i = READ_LE32(mem + rip + len);
                        p = dump32(p, i);
                        len += 4;
                    } else {
                        int16_t i = READ_LE16(mem + rip + len);
                        p = dump16(p, i);
                        len += 2;
                    }
                    *p++ = ']';

                    switch (map1.optype) {
                    case optype_ObAL:
                        p = disasm_reg(p, &n_oplands, index_AL, reg_type_al);
                        break;
                    case optype_OvAX:
                        p = disasm_reg(p, &n_oplands, index_AX, reg_type_ax + !!(use32 & CPU_CTX_DATA32));
                        break;
                    default: break;
                    }

                    break;
                }

                default:
                {
                    if (map1.optype >= optype_modrm_) {
                        int reverse = map1.optype & opa_reverse;

                        if (reverse != 0) {
                            p = disasm_dump_Gx(p, &n_oplands, modrm, map1.optype, use32);
                        }

                        if (modrm.mod == 3) {
                            switch (map1.optype & opa_Emask) {
                                case opa_Eb:
                                    p = disasm_reg(p, &n_oplands, modrm.rm, reg_type_al);
                                    break;
                                case opa_Ew:
                                    p = disasm_reg(p, &n_oplands, modrm.rm, reg_type_ax);
                                    break;
                                case opa_Ev:
                                    p = disasm_reg(p, &n_oplands, modrm.rm, reg_type_ax + !!(use32 & CPU_CTX_DATA32));
                                    break;
                                default:
                                {
                                    int type_Ox = map1.optype & opa_Omask;
                                    switch (type_Ox) {
                                        case opa_RdCd:
                                        case opa_RdDd:
                                            p = disasm_reg(p, &n_oplands, modrm.rm, reg_type_eax);
                                            break;
                                        default: break;
                                    }
                                }
                            }
                        } else {
                            const char **name_table;
                            int n = 0;

                            if (use32 & CPU_CTX_ADDR32) {
                                name_table = reg_names_EAX;
                            } else {
                                name_table = reg_names_AX;
                            }

                            p = disasm_separator(p, &n_oplands);
                            *p++ = '[';
                            if (modrm.parsed.has_base) {
                                p = dump_string(p, name_table[modrm.parsed.base]);
                                n++;
                            }
                            if (modrm.parsed.has_index) {
                                if (n) {
                                    *p++ = '+';
                                    n++;
                                }
                                p = dump_string(p, name_table[modrm.parsed.index]);
                                if (modrm.parsed.scale > 1) {
                                    *p++ = '*';
                                    *p++ = '0' + (1 << modrm.parsed.scale);
                                }
                            }

                            if (modrm.parsed.disp_bits > 0) {
                                uint32_t disp = modrm.parsed.disp;
                                if (n) {
                                    *p++ = '+';
                                    n++;
                                }
                                switch (modrm.parsed.disp_bits) {
                                case 1:
                                    p = dump8(p, disp);
                                    break;
                                case 2:
                                    p = dump16(p, disp);
                                    break;
                                case 4:
                                    p = dump32(p, disp);
                                    break;
                                }
                            }
                            *p++ = ']';

                        }

                        if (reverse == 0) {
                            p = disasm_dump_Gx(p, &n_oplands, modrm, map1.optype, use32);
                        }

                        int ix = map1.optype & opa_Imask;
                        if (ix) {
                            switch (ix) {
                                case opa_Ib:
                                    p = disasm_Ib(p, &n_oplands, rip, &len);
                                    break;
                                case opa_Iw:
                                    p = disasm_Iw(p, &n_oplands, rip, &len);
                                    break;
                                case opa_Iz:
                                    p = disasm_Iz(p, &n_oplands, rip, &len, !!(use32 & CPU_CTX_DATA32));
                                    break;
                            }
                        }

                    } else {
                        p = disasm_separator(p, &n_oplands);
                        p = dump_string(p, "???");
                    }
                    break;
                }
            }

            if ((map1.n_oplands & 2) != 0) {
                p = disasm_separator(p, &n_oplands);
                p = dump_string(p, map1.oplands2);
            }

            break;
        }

    } else {
        p = dump_string(p, "???");
    }
    *p = '\0';

    if (len > 0) {
        int l = (len < max_len) ? len : max_len;
        for (int i = 0; i < l; i++) {
            uint8_t c = mem[rip + i];
            q = dump8(q, c);
        }
    }

    if (length) {
        *length = len;
    }
    return p;
}

char *dump_disasm(char *p, cpu_state *cpu, uint32_t eip) {
    sreg_t *seg = &cpu->CS;
    p = disasm_main(p, seg->sel, eip, seg->base + eip, seg->attr_D, NULL);
    return p;
}

/**
 * disassemble
 * 
 * @return proceeded bytes
 */
WASM_EXPORT int disasm(cpu_state *cpu, uint32_t sel, uint32_t _offset, int count) {
    static char buff[1024];
    int len;
    sreg_t seg;
    if (LOAD_DESCRIPTOR(cpu, &seg, sel, type_bitmap_SEG_ALL, 1, NULL)) {
        seg.attr_D = cpu->CS.attr_D;
        seg.base = 0;
    }
    int use32 = seg.attr_D;
    int proceeded = 0;
    for (int i = 0; i < count; i++) {
        char *p = buff;
        uint32_t offset = _offset + proceeded;
        uint32_t base = seg.base + offset;
        p = disasm_main(p, sel, offset, base, use32, &len);
        proceeded += len;
        println(buff);
    }
    return proceeded;
}

int get_inst_len(cpu_state *cpu) {
    static char buff[1024];
    char *p = buff;
    sreg_t seg = cpu->CS;
    int use32 = seg.attr_D;
    uint32_t offset = cpu->EIP;
    uint32_t base = seg.base + offset;
    int len;
    disasm_main(p, seg.base, offset, base, use32, &len);
    return len;
}
