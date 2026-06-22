export abstract class Reference {

    offsetA: string;
    offsetB: string;

    constructor(offsetA: string, offsetB: string) {
        this.offsetA = offsetA.toLowerCase();
        this.offsetB = offsetB.toLowerCase();
    }

    involves(offset: string): boolean {
        const o = offset.toLowerCase();
        return this.offsetA === o || this.offsetB === o;
    }

    otherEnd(offset: string): string | null {
        const o = offset.toLowerCase();

        if (this.offsetA === o) {
            return this.offsetB;
        }

        if (this.offsetB === o) {
            return this.offsetA;
        }

        return null;
    }
}

export abstract class Function<TInstruction extends Instruction> {

    name : string;
    offset : string;
    Instructions : TInstruction[];

    constructor(name : string, offset : string) {
        this.name = name;
        this.offset = offset;
        this.Instructions = [];
    }

    public add(instruction: TInstruction) {
        this.Instructions.push(instruction);
    }

}

export abstract class Instruction {

    offset : string;
    opcode : string;

    constructor(offset : string, opcode : string) {
        this.offset = offset;
        this.opcode = opcode;
    }

}

export abstract class Decompiled<TReference extends Reference, TFunction extends Function<any>> {
    
    functions : TFunction[];
    references : TReference[] = [];

    constructor() {
        this.functions = [];
    }

    public add(func: TFunction) {
        this.functions.push(func);
    }

    public findReferences(offset: string): TReference[] {
        return this.references.filter(r => r.involves(offset));
    }
}