import { DecompiledPE, FunctionDecompiled, InstructionDecompiled, Reference } from "./decompiledPE";

export class DecompiledPEReader extends DecompiledPE {

    comment : string;

    constructor(maxFunctions : number, comment : string = "") {
        super(maxFunctions);
        this.comment = comment;
    }
}

export class InstructionDecompiledReader extends InstructionDecompiled {

    comment : string;

    constructor(offset : string, opcode : string, comment : string = "") {
        super(offset, opcode);
        this.comment = comment;
    }
}

export class FunctionDecompiledReader extends FunctionDecompiled {

    comments : string;

    constructor(name : string, offset : string, comments : string = "") {
        super(name, offset);
        this.comments = comments;
    }

}

export class ReferenceReader extends Reference {

    comment : string;

    constructor(offsetA : string, offsetB : string, comment : string = "") {
        super(offsetA, offsetB);
        this.comment = comment;
    }

}