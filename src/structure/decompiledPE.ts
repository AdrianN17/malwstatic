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

}

export class InstructionDecompiled {

    offset : string;
    opcode : string;

    constructor(offset : string, opcode : string) {
        this.offset = offset;
        this.opcode = opcode;
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