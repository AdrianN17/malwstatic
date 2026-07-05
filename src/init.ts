import { ExportYAML } from "./export/exportYAML";
import { ImportYAML } from "./import/importYAML";
import { initRizin } from "./rizin";
import { Documentation } from "./documentation/documentation";
import { Node} from "./node/node";
import { DecompiledReader } from "./structure/decompiledReader";
import { DecompiledMapper } from "./structure/decompiledMapper";
import { Utils } from "./utils";
import { Minimap, fitToView, resetZoom } from "./minimap";

initRizin((pe, filename) => {
    Utils.showToast("✓ Extracted with Rizin");
    loadDecompiled(DecompiledMapper.writerToReader(pe), null, `${filename}.yaml`);
});

let currentDecompiled: DecompiledReader | null = null;
let fileHandle: any = null;
let node: Node | null = null;
let documentation: Documentation | null = null;

const peCommentEl     = document.getElementById("peComment")     as HTMLElement;
const peCommentWrapEl = document.getElementById("peCommentWrap") as HTMLElement;
peCommentEl.addEventListener("input", () => {
    if (currentDecompiled) currentDecompiled.comment = peCommentEl.textContent ?? "";
});

// ── Hide-unreferenced button ──
const hideUnrefSep = document.getElementById("hideUnrefSep")       as HTMLElement;
const hideUnrefBtn = document.getElementById("hideUnreferencedBtn") as HTMLElement;
hideUnrefBtn.addEventListener("click", () => node?.hideUnreferenced());

// ── Main selector ──
const mainSelSep   = document.getElementById("mainSelSep")   as HTMLElement;
const mainSelWrap  = document.getElementById("mainSelectWrap") as HTMLElement;
const mainSelect   = document.getElementById("mainSelect")    as HTMLSelectElement;

mainSelect.addEventListener("change", () => {
    const offset = mainSelect.value;
    if (offset && node) node.setMain(offset);
});

function populateMainSelect(): void {
    if (!documentation) return;
    const decompiled = documentation.get();

    // Functions that appear in at least one reference (as source or destination)
    const refOffsets = new Set<string>();
    decompiled.references.forEach(r => {
        refOffsets.add(r.offsetA.toLowerCase());
        refOffsets.add(r.offsetB.toLowerCase());
    });

    // Map instruction offsets → their parent function offsets
    const instrToFunc = new Map<string, string>();
    decompiled.functions.forEach(f => {
        f.Instructions.forEach(i => instrToFunc.set(i.offset.toLowerCase(), f.offset.toLowerCase()));
    });

    const funcOffsets = new Set<string>();
    refOffsets.forEach(o => {
        const fo = instrToFunc.get(o) ?? o;
        if (decompiled.functions.some(f => f.offset.toLowerCase() === fo)) funcOffsets.add(fo);
    });

    const candidates = decompiled.functions.filter(f => funcOffsets.has(f.offset.toLowerCase()));

    mainSelect.innerHTML = "";
    if (candidates.length === 0) {
        mainSelSep.style.display  = "none";
        mainSelWrap.style.display = "none";
        return;
    }

    candidates.forEach(f => {
        const opt = document.createElement("option");
        opt.value       = f.offset.toLowerCase();
        opt.textContent = f.name;
        mainSelect.appendChild(opt);
    });

    // Default: prefer name containing "main", then "dll", then first
    const currentMain = decompiled.functions.find(f => f.isMain);
    const defaultFunc =
        currentMain ??
        candidates.find(f => /\bmain\b/i.test(f.name)) ??
        candidates.find(f => /dll/i.test(f.name)) ??
        candidates[0];

    mainSelect.value = defaultFunc.offset.toLowerCase();

    mainSelSep.style.display  = "";
    mainSelWrap.style.display = "flex";

    // Apply the default if nothing is pinned yet
    if (!currentMain && node) {
        node.setMain(defaultFunc.offset.toLowerCase());
    }
}

// ── Hidden nodes dropdown ──
const hiddenSep      = document.getElementById("hiddenSep")      as HTMLElement;
const hiddenWrap     = document.getElementById("hiddenNodesWrap") as HTMLElement;
const hiddenBtn      = document.getElementById("hiddenNodesBtn")  as HTMLElement;
const hiddenDropdown = document.getElementById("hiddenDropdown")  as HTMLElement;
const hiddenCountEl  = document.getElementById("hiddenCount")     as HTMLElement;

const hiddenNodes = new Map<string, () => void>();

function addHiddenNode(name: string, restore: () => void): void {
    let key = name;
    let i = 2;
    while (hiddenNodes.has(key)) key = `${name} (${i++})`;
    hiddenNodes.set(key, restore);
    renderHiddenDropdown();
}

function renderHiddenDropdown(): void {
    const count = hiddenNodes.size;
    hiddenCountEl.textContent = String(count);
    hiddenSep.style.display  = count > 0 ? "" : "none";
    hiddenWrap.style.display = count > 0 ? "flex" : "none";
    if (count === 0) hiddenDropdown.classList.remove("open");

    hiddenDropdown.innerHTML = "";
    hiddenNodes.forEach((restore, name) => {
        const label = document.createElement("label");
        label.className = "hidden-dropdown-item";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.addEventListener("change", () => {
            restore();
            hiddenNodes.delete(name);
            renderHiddenDropdown();
        });

        label.appendChild(cb);
        label.appendChild(document.createTextNode(name));
        hiddenDropdown.appendChild(label);
    });
}

hiddenBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    hiddenDropdown.classList.toggle("open");
});

document.addEventListener("click", () => hiddenDropdown.classList.remove("open"));


function loadDecompiled(decompiled: DecompiledReader, handle: any, name: string): void {
    node = null;
    documentation = null;
    currentDecompiled = null;
    fileHandle = null;
    peCommentEl.textContent = "";

    hiddenNodes.clear();
    renderHiddenDropdown();

    peCommentWrapEl.style.display = "none";
    hideUnrefSep.style.display     = "";
    hideUnrefBtn.style.display  = "";
    mainSelSep.style.display    = "none";
    mainSelWrap.style.display   = "none";
    mainSelect.innerHTML        = "";

    fileHandle = handle;

    currentDecompiled = decompiled;
    peCommentEl.textContent        = decompiled.comment ?? "";
    peCommentWrapEl.style.display  = "";

    const span = document.getElementById("yamlFileName") as HTMLElement;
    span.textContent = name
    span.classList.add("chosen");

    documentation = new Documentation(decompiled);
    node = new Node(documentation);
    node.onNodeHidden = addHiddenNode;
    node.onMainChanged = (offset) => {
        if (offset) mainSelect.value = offset;
        // Rebuild options in case visibility changed
        populateMainSelect();
    };
    node.draw();

    // Populate after draw so node map is ready
    requestAnimationFrame(() => {
        populateMainSelect();
    });

    // Start minimap after draw (editor is now initialised)
    minimap?.destroy();
    minimap = null;
    requestAnimationFrame(() => {
        const info = node?.getEditorInfo();
        if (info) minimap = new Minimap(minimapCanvas, info.container, info.editor);
    });
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
        return;
    }
    // Navigation shortcuts (only when not typing in an input / contenteditable)
    const tag = (e.target as HTMLElement).tagName;
    const ce  = (e.target as HTMLElement).isContentEditable;
    if (tag === "INPUT" || tag === "TEXTAREA" || ce) return;

    const info = node?.getEditorInfo();
    if (!info) return;

    if (e.key === "f" || e.key === "F" || e.key === "Home") {
        e.preventDefault();
        fitToView(info.container, info.editor);
    } else if (e.key === "0") {
        e.preventDefault();
        resetZoom(info.container, info.editor);
    } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        info.editor.zoom_in();
    } else if (e.key === "-") {
        e.preventDefault();
        info.editor.zoom_out();
    }
});

// ── Navigation buttons ──────────────────────────────────────────────────────
document.getElementById("fitViewBtn")!.addEventListener("click", () => {
    const info = node?.getEditorInfo();
    if (info) fitToView(info.container, info.editor);
});
document.getElementById("zoomInBtn")!.addEventListener("click", () => {
    node?.getEditorInfo()?.editor.zoom_in();
});
document.getElementById("zoomOutBtn")!.addEventListener("click", () => {
    node?.getEditorInfo()?.editor.zoom_out();
});
document.getElementById("resetZoomBtn")!.addEventListener("click", () => {
    const info = node?.getEditorInfo();
    if (info) resetZoom(info.container, info.editor);
});

// ── Minimap ──────────────────────────────────────────────────────────────────
const minimapCanvas = document.getElementById("minimapCanvas") as HTMLCanvasElement;
const minimapPanel  = document.getElementById("minimapPanel")  as HTMLElement;
const minimapToggle = document.getElementById("minimapToggle") as HTMLButtonElement;
const minimapHeader = document.getElementById("minimapHeader") as HTMLElement;

let minimap: Minimap | null = null;

minimapToggle.addEventListener("click", () => {
    const collapsed = minimapPanel.classList.toggle("collapsed");
    minimapToggle.textContent = collapsed ? "+" : "−";
});

// Drag the minimap panel by its header
let _mm = { dragging: false, ox: 0, oy: 0 };
minimapHeader.addEventListener("mousedown", e => {
    if ((e.target as HTMLElement).id === "minimapToggle") return;
    _mm.dragging = true;
    _mm.ox = e.clientX - minimapPanel.offsetLeft;
    _mm.oy = e.clientY - minimapPanel.offsetTop;
    e.preventDefault();
});
document.addEventListener("mousemove", e => {
    if (!_mm.dragging) return;
    minimapPanel.style.right  = "auto";
    minimapPanel.style.bottom = "auto";
    minimapPanel.style.left   = (e.clientX - _mm.ox) + "px";
    minimapPanel.style.top    = (e.clientY - _mm.oy) + "px";
});
document.addEventListener("mouseup", () => { _mm.dragging = false; });