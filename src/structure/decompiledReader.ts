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
    isHighlighted: boolean;

    constructor(offset : string, opcode : string, comment : string = "", isHighlighted: boolean = false) {
        super(offset, opcode);
        this.comment = comment;
        this.isHighlighted = isHighlighted;
    }
}

export class FunctionReader extends Function<InstructionReader> {

    comments : string;
    x : number;
    y : number;
    visible: boolean;
    isMain: boolean;
    isHighlighted: boolean;

    constructor(name : string, offset : string, comments : string = "", 
        x : number = 0, y : number = 0, visible: boolean = true, isMain: 
        boolean = false, isHighlighted: boolean = false) {
        super(name, offset);
        this.comments = comments;
        this.x = x;
        this.y = y;
        this.visible = visible;
        this.isMain = isMain;
        this.isHighlighted = isHighlighted;
    }

    updatePosition(x : number, y : number) {
        this.x = x;
        this.y = y;
    }

}

export class DecompiledReader extends Decompiled<ReferenceReader, FunctionReader> {

    comment : string;
    x : number;
    y : number;
    zoom: number;

    constructor(comment : string = "", x : number = 0, y : number = 0, zoom: number = 1) {
        super();
        this.comment = comment;
        this.x = x;
        this.y = y;
        this.zoom = zoom;
    }

    updatePositionZoom(x : number, y : number, zoom: number) {
        this.x = x;
        this.y = y;
        this.zoom = zoom;
    }
}