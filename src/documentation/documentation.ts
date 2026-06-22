import { DecompiledReader } from "../structure/decompiledReader";

export class Documentation {

    decompiled: DecompiledReader;
    decompiledPEDraft: DecompiledReader;

    constructor(decompiled: DecompiledReader) {
        this.decompiled = decompiled;
        this.decompiledPEDraft = decompiled;
    }

    savedDraft() {
        this.decompiled = this.decompiledPEDraft;
    }

    get() : DecompiledReader {
        return this.decompiledPEDraft;
    }
}
