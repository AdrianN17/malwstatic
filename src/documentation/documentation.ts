import { DecompiledPEReader } from "../structure/decompiledReader";

export class Documentation {

    decompiled: DecompiledPEReader;
    decompiledPEDraft: DecompiledPEReader;

    constructor(decompiled: DecompiledPEReader) {
        this.decompiled = decompiled;
        this.decompiledPEDraft = decompiled;
    }

    savedDraft() {
        this.decompiled = this.decompiledPEDraft;
    }

    get() : DecompiledPEReader {
        return this.decompiledPEDraft;
    }
}
