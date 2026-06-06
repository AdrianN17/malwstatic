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

function getDecompiledFunction(func: RizinFunction, session: number, cmd: (session: number, command: string) => string) {
    const pdfj = JSON.parse(cmd(session,`pdfj @ ${func.offset}`)) as PdfjResponse;

    let asm : string = "";

    if (pdfj.ops) {
        for (const op of pdfj.ops) {

            const offset = op.offset.toString(16);

            const opcode = op.opcode ?? "";

            asm += `${offset} : ${opcode}\n`;
        }
    }

    console.log(asm);
}

function getDecompiledFunctions(funcs: RizinFunction[], session: number, cmd: (session: number, command: string) => string) {
    
    for (const func of funcs) {
        try {
            getDecompiledFunction(func, session, cmd);
        } catch (err) {
            console.error(func, err);
        }
    }
}

Module.onRuntimeInitialized = () => {

    console.log("Rizin WASM loaded");

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

            Module.FS.writeFile(path,bytes);

            const session = createSession();

            openFile(session, path, 0, 1);

            cmd(session, "aaa");

            const funcs = JSON.parse(cmd(session, "aflj")) as RizinFunction[];

            getDecompiledFunctions(funcs, session, cmd);

            console.log("Analisis terminado");
        }
    );
};