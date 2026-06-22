import { ExportYAML } from "./export/exportYAML";
import { ImportYAML } from "./import/importYAML";
import { initRizin } from "./rizin";
import { Documentation } from "./documentation/documentation";
import { Node} from "./node/node";
import { DecompiledReader } from "./structure/decompiledReader";
import { DecompiledMapper } from "./structure/decompiledMapper";
import { Utils } from "./utils";

initRizin((pe, filename) => {
    Utils.showToast("✓ Extracted with Rizin");
    loadDecompiled(DecompiledMapper.writerToReader(pe), null, `${filename}.yaml`);
});

let currentDecompiled: DecompiledReader | null = null;
let fileHandle: any = null;
let node: Node | null = null;
let documentation: Documentation | null = null;

const peCommentEl = document.getElementById("peComment") as HTMLElement;
peCommentEl.addEventListener("input", () => {
    if (currentDecompiled) currentDecompiled.comment = peCommentEl.textContent ?? "";
});


function loadDecompiled(decompiled: DecompiledReader, handle: any, name: string): void {
    node = null;
    documentation = null;
    currentDecompiled = null;
    fileHandle = null;
    peCommentEl.textContent = "";

    fileHandle = handle;

    currentDecompiled = decompiled;
    peCommentEl.textContent = decompiled.comment ?? "";

    const span = document.getElementById("yamlFileName") as HTMLElement;
    span.textContent = name
    span.classList.add("chosen");

    documentation = new Documentation(decompiled);
    node = new Node(documentation);
    node.draw();
}

async function loadYAML(file: File, handle: unknown = null): Promise<void> {
    const text = await file.text();
    const decompiled = ImportYAML.import(text);

    loadDecompiled(decompiled, handle, file.name);
}

document.getElementById("yamlBtn")!.addEventListener("click", async () => {
    const result = await ExportYAML.openFilePicker();
    if (result) {
        await loadYAML(result.file, result.handle);
    } else if (!("showOpenFilePicker" in window)) {
        (document.getElementById("yamlFileInput") as HTMLInputElement).click();
    }
});

const yamlFileInput = document.getElementById("yamlFileInput") as HTMLInputElement;
yamlFileInput.addEventListener("change", async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await loadYAML(file, null);
});

async function saveYAML(): Promise<void> {
    if (!currentDecompiled) return;
    const yaml = ExportYAML.export(currentDecompiled);

    if (fileHandle) {
        try {
            await ExportYAML.saveToHandle(fileHandle, yaml);
            Utils.showToast("✓ Saved");
            return;
        } catch {
        }
    }

    const name = (document.getElementById("yamlFileName") as HTMLElement).textContent || "output.yaml";
    ExportYAML.download(name, yaml);
    Utils.showToast("✓ Downloaded");
}

document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        saveYAML();
    }
});