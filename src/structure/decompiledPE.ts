export class DecompiledPE {
    
    functions : FunctionDecompiled[];
    maxFunctions : number;
    count : number;

    constructor(maxFunctions : number) {
        this.functions = [];
        this.maxFunctions = maxFunctions;
        this.count = maxFunctions;
    }

    public add(func: FunctionDecompiled) {
        this.functions.push(func);
        this.count--;
    }

    public calculateReference() {
        const allOffsets = new Set<string>(
            this.functions.flatMap(func =>
                func.Instructions.map(instr => instr.offset.toLowerCase())
            )
        );

        this.functions.forEach(func =>
            func.Instructions.forEach(instr => {
                const match = instr.opcode.match(/^call\s+(0x)?([0-9a-fA-F]+)/);
                if (match) {
                    const target = match[2].toLowerCase();
                    if (allOffsets.has(target)) instr.addReference(target);
                }
            })
        );
    }

}

export class InstructionDecompiled {

    offset : string;
    opcode : string;
    reference: string | null = null;

    constructor(offset : string, opcode : string) {
        this.offset = offset;
        this.opcode = opcode;
    }

    addReference(ref: string) {
        this.reference = ref;
    }

}

export class FunctionDecompiled {

    name : string;
    offset : string;
    Instructions : InstructionDecompiled[];

    constructor(name : string, offset : string) {
        this.name = name;
        this.offset = offset;
        this.Instructions = [];
    }

    public add(instruction: InstructionDecompiled) {
        this.Instructions.push(instruction);
    }

}