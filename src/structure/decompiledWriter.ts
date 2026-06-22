import { Reference, Function, Instruction, Decompiled } from "./decompiledGeneric";

export class ReferenceWriter extends Reference {

    constructor(
        offsetA: string,
        offsetB: string
    ) {
        super(offsetA, offsetB);
    }

}

export class InstructionWriter extends Instruction {

    constructor(offset : string, opcode : string) {
        super(offset, opcode);
    }

}

export class FunctionWriter extends Function<InstructionWriter> {

    constructor(name : string, offset : string) {
        super(name, offset);
    }

    public add(instruction: InstructionWriter) {
        this.Instructions.push(instruction);
    }

}

export class DecompiledWriter extends Decompiled<ReferenceWriter, FunctionWriter> {
    
    constructor() {
        super();
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
                    if (allOffsets.has(target)) {
                        this.references.push(new ReferenceWriter(instr.offset, target));
                    }
                }
            })
        );
    }
}