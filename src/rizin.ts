import { DecompiledWriter, FunctionWriter, InstructionWriter } from "./structure/decompiledWriter";

declare const Module: {
    onRuntimeInitialized: () => void;

    cwrap: (
        name: string,
        returnType: string,
        argTypes: string[]
    ) => (...args: any[]) => any;

    FS: {
        mkdir(path: string): void;
        writeFile(path: string, data: Uint8Array): void;
    };
};

interface RizinFunction {
    name: string;
    offset: number;
}

interface RizinOp {
    offset: number;
    opcode?: string;
}

interface PdfjResponse {
    ops?: RizinOp[];
}

function getFilePE() {
    const fileInput = document.getElementById("pefileInput") as HTMLInputElement | null;

    if (!fileInput) throw new Error("fileInput no encontrado");

    return fileInput;
}

async function getDecompiledFunction(func: RizinFunction, 
    session: number, 
    cmd: (session: number, command: string) => string, 
    decompiledPE: DecompiledWriter) {
    const pdfj = JSON.parse(cmd(session,`pdfj @ ${func.offset}`)) as PdfjResponse;

    let functionStore = new FunctionWriter(func.name, func.offset.toString(16));

    if (pdfj.ops) {
        pdfj.ops.forEach(op => {

            const offset : string = op.offset.toString(16);
            const opcode : string = op.opcode ?? "";

            if (opcode.startsWith(";")) return;

            functionStore.add(new InstructionWriter(offset, opcode));
        });
    }

    decompiledPE.add(functionStore);
}

async function getDecompiledFunctions(
    funcs: RizinFunction[], 
    session: number, 
    cmd: (session: number, command: string) => string): Promise<DecompiledWriter> {

    const decompiledPE: DecompiledWriter = new DecompiledWriter();

    for (const func of funcs) {
        try {
            await getDecompiledFunction(func, session, cmd, decompiledPE);
        } catch (err) {
            console.error(func, err);
        }
    }

    decompiledPE.calculateReference();

    return decompiledPE;
}

export function initRizin(onAnalyzed: (pe: DecompiledWriter, filename: string) => void): void {
    Module.onRuntimeInitialized = () => {

        const createSession = Module.cwrap(
            "rzweb_create_session",
            "number",
            []) as () => number;

        const openFile = Module.cwrap(
            "rzweb_open_file",
            "number",
            [
                "number",
                "string",
                "number",
                "number"
            ]
        ) as (
            session: number,
            path: string,
            baseAddr: number,
            writable: number) => number;

        const cmd = Module.cwrap(
            "rzweb_cmd",
            "string",
            [
                "number",
                "string"
            ]
        ) as (
            session: number,
            command: string) => string;

        getFilePE().addEventListener(
            "change",
            async (e: Event) => {

                const target = e.target as HTMLInputElement;
                const file = target.files?.[0];

                if (!file) return;

                const bytes = new Uint8Array(await file.arrayBuffer());

                try {
                    Module.FS.mkdir("/work");
                } catch {
                }

                const path = `/work/${file.name}`;

                Module.FS.writeFile(path, bytes);

                const session = createSession();

                openFile(session, path, 0, 1);

                cmd(session, "aaa");

                const funcs = JSON.parse(cmd(session, "aflj")) as RizinFunction[];

                const pe = await getDecompiledFunctions(funcs, session, cmd);

                onAnalyzed(pe, file.name);
            }
        );
    };
}