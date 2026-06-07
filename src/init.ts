import { ExportYAML } from "./export/exportYAML";
import { ImportYAML } from "./import/importYAML";
import { initRizin } from "./rizin";
import { Documentation } from "./documentation/documentation";
import { Node} from "./node/node";
import { DecompiledPEReader } from "./structure/decompiledReader";

initRizin((pe, filename) => {
    const yaml = ExportYAML.export(pe);
    ExportYAML.download(`${filename}.yaml`, yaml);
});

let currentDecompiled: DecompiledPEReader | null = null;
let fileHandle: any = null;
let node: Node | null = null;
let documentation: Documentation | null = null;

const peCommentEl = document.getElementById("peComment") as HTMLElement;
peCommentEl.addEventListener("input", () => {
    if (currentDecompiled) currentDecompiled.comment = peCommentEl.textContent ?? "";
});

async function loadYAML(file: File, handle: unknown = null): Promise<void> {
    // Reset bar with no transition so the sweep starts from 0
    const bar = document.getElementById("loadBar") as HTMLElement;
    bar.style.width = "0%";

    fileHandle = handle;

    const text = await file.text();   // suspends here → browser repaints at 0%
    const decompiled = ImportYAML.import(text);
    currentDecompiled = decompiled;
    peCommentEl.textContent = decompiled.comment ?? "";

    const span = document.getElementById("yamlFileName") as HTMLElement;
    span.textContent = file.name;
    span.classList.add("chosen");

    documentation = new Documentation(decompiled);
    node = new Node(documentation);
    node.draw();

    // Animate bar to loaded fraction
    const pct = decompiled.maxFunctions > 0
        ? Math.round(decompiled.functions.length / decompiled.maxFunctions * 100)
        : 100;
    bar.style.width = `${pct}%`;
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
            showToast("✓ Saved");
            return;
        } catch {
        }
    }

    const name = (document.getElementById("yamlFileName") as HTMLElement).textContent || "output.yaml";
    ExportYAML.download(name, yaml);
    showToast("✓ Downloaded");
}

function showToast(msg: string): void {
    const el = document.getElementById("saveToast") as HTMLElement;
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2200);
}

document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        saveYAML();
    }
});