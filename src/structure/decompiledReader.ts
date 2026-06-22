import { Reference, Function, Instruction, Decompiled } from "./decompiledGeneric";

export class ReferenceReader extends Reference {

    comment: string;

    constructor(
        offsetA: string,
        offsetB: string,
        comment: string = ""
    ) {
        super(offsetA, offsetB);
        this.comment = comment;
    }

}

export class InstructionReader extends Instruction {

    comment : string;

    constructor(offset : string, opcode : string, comment : string = "") {
        super(offset, opcode);
        this.comment = comment;
    }
}

export class FunctionReader extends Function<InstructionReader> {

    comments : string;

    constructor(name : string, offset : string, comments : string = "") {
        super(name, offset);
        this.comments = comments;
    }

}

export class DecompiledReader extends Decompiled<ReferenceReader, FunctionReader> {

    comment : string;

    constructor(comment : string = "") {
        super();
        this.comment = comment;
    }
}