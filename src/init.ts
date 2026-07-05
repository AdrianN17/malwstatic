import { ExportYAML } from "./export/exportYAML";
import { ImportYAML } from "./import/importYAML";
import { initRizin } from "./rizin";
import { Documentation } from "./documentation/documentation";
import { Node} from "./node/node";
import { DecompiledReader } from "./structure/decompiledReader";
import { DecompiledMapper } from "./structure/decompiledMapper";
import { Utils } from "./utils";
import { Minimap, resetZoom } from "./minimap";
import { UndoHistory } from "./undoHistory";

initRizin((pe, filename) => {
    Utils.showToast("✓ Extracted with Rizin");
    loadDecompiled(DecompiledMapper.writerToReader(pe), null, `${filename}.yaml`);
});

let currentDecompiled: DecompiledReader | null = null;
let fileHandle: any = null;
let node: Node | null = null;
let documentation: Documentation | null = null;
let canvasObserver: MutationObserver | null = null;
const history = new UndoHistory();

const peCommentEl     = document.getElementById("peComment")     as HTMLElement;
const peCommentWrapEl = document.getElementById("peCommentWrap") as HTMLElement;
let _peCommentBefore = "";
peCommentEl.addEventListener("focusin", () => { _peCommentBefore = peCommentEl.textContent ?? ""; });
peCommentEl.addEventListener("focusout", () => {
    const after = peCommentEl.textContent ?? "";
    if (!currentDecompiled || after === _peCommentBefore) return;
    const before = _peCommentBefore;
    const decomp = currentDecompiled;
    history.push({
        undo: () => { peCommentEl.textContent = before; decomp.comment = before; },
        redo: () => { peCommentEl.textContent = after;  decomp.comment = after;  },
    });
});
peCommentEl.addEventListener("input", () => {
    if (currentDecompiled) currentDecompiled.comment = peCommentEl.textContent ?? "";
});

// ── Function panel (hamburger) ──
const funcPanelSep   = document.getElementById("funcPanelSep")   as HTMLElement;
const funcPanelBtn   = document.getElementById("funcPanelBtn")   as HTMLButtonElement;
const funcPanel      = document.getElementById("funcPanel")      as HTMLElement;
const funcPanelClose = document.getElementById("funcPanelClose") as HTMLButtonElement;
const funcSearch     = document.getElementById("funcSearch")     as HTMLInputElement;
const funcList       = document.getElementById("funcList")       as HTMLElement;

funcPanelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = funcPanel.classList.toggle("open");
    funcPanelBtn.classList.toggle("active", open);
    if (open) {
        funcSearch.value = "";
        renderFuncList("");
        funcSearch.focus();
    }
});

funcPanelClose.addEventListener("click", () => {
    funcPanel.classList.remove("open");
    funcPanelBtn.classList.remove("active");
});

funcSearch.addEventListener("input", () => renderFuncList(funcSearch.value));

// Close panel when clicking outside of it
document.addEventListener("click", (e) => {
    if (funcPanel.classList.contains("open") &&
        !funcPanel.contains(e.target as globalThis.Node) &&
        e.target !== funcPanelBtn) {
        funcPanel.classList.remove("open");
        funcPanelBtn.classList.remove("active");
    }
});

function renderFuncList(query: string): void {
    funcList.innerHTML = "";
    if (!documentation) return;
    const q = query.trim().toLowerCase();
    const funcs = documentation.get().functions
        .filter(f => !q || f.name.toLowerCase().includes(q) || f.offset.toLowerCase().includes(q));

    if (funcs.length === 0) {
        const empty = document.createElement("div");
        empty.className = "func-empty";
        empty.textContent = "No functions found";
        funcList.appendChild(empty);
        return;
    }

    funcs.forEach(f => {
        const item = document.createElement("div");
        item.className = "func-item";
        item.title = `${f.name}  (${f.offset})`;

        const nameEl = document.createElement("div");
        nameEl.className = "func-item-name";
        nameEl.textContent = f.name;

        const offEl = document.createElement("div");
        offEl.className = "func-item-offset";
        offEl.textContent = f.offset;

        item.appendChild(nameEl);
        item.appendChild(offEl);

        item.addEventListener("click", () => {
            node?.focusFunctionByOffset(f.offset);
        });

        funcList.appendChild(item);
    });
}

function showFuncPanel(): void {
    funcPanelSep.style.display = "";
    funcPanelBtn.style.display = "";
}

function hideFuncPanel(): void {
    funcPanelSep.style.display = "none";
    funcPanelBtn.style.display = "none";
    funcPanel.classList.remove("open");
    funcPanelBtn.classList.remove("active");
}

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
    hideFuncPanel();

    fileHandle = handle;
    history.clear();
    (document.getElementById("welcomeOverlay") as HTMLElement).style.display = "none";

    currentDecompiled = decompiled;
    peCommentEl.textContent        = decompiled.comment ?? "";
    peCommentWrapEl.style.display  = "";

    const span = document.getElementById("yamlFileName") as HTMLElement;
    span.textContent = name
    span.classList.add("chosen");

    documentation = new Documentation(decompiled);
    node = new Node(documentation, history);
    node.onNodeHidden = addHiddenNode;
    node.onNodeRestored = (funcName) => {
        for (const key of hiddenNodes.keys()) {
            if (key === funcName || key.startsWith(funcName + " (")) {
                hiddenNodes.delete(key);
                break;
            }
        }
        renderHiddenDropdown();
    };
    node.onMainChanged = (offset) => {
        if (offset) mainSelect.value = offset;
        // Rebuild options in case visibility changed
        populateMainSelect();
    };
    node.draw();

    // Populate after draw so node map is ready
    requestAnimationFrame(() => {
        populateMainSelect();
        showFuncPanel();
        renderFuncList("");
    });

    // Start minimap after draw (editor is now initialised)
    minimap?.destroy();
    minimap = null;
    canvasObserver?.disconnect();
    canvasObserver = null;
    requestAnimationFrame(() => {
        const info = node?.getEditorInfo();
        if (info) {
            minimap = new Minimap(minimapCanvas, info.container, info.editor);

            // Restore saved pan / zoom position
            const { x, y, zoom } = decompiled;
            if (x !== 0 || y !== 0 || zoom !== 1) {
                const cvs = info.container.querySelector<HTMLElement>('.drawflow');
                if (cvs) {
                    cvs.style.transform          = `translate(${x}px, ${y}px) scale(${zoom})`;
                    info.editor.canvas_x         = x;
                    info.editor.canvas_y         = y;
                    info.editor.zoom_last_value  = zoom;
                }
            }

            // Track pan / zoom and persist into the decompiled model
            const inner = info.container.querySelector<HTMLElement>('.drawflow');
            if (inner) {
                canvasObserver = new MutationObserver(() => {
                    if (!currentDecompiled) return;
                    const ed = info.editor;
                    currentDecompiled.updatePositionZoom(
                        ed.canvas_x ?? 0,
                        ed.canvas_y ?? 0,
                        ed.zoom_last_value ?? 1
                    );
                });
                canvasObserver.observe(inner, { attributes: true, attributeFilter: ['style'] });
            }
        }
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

    // Undo / Redo
    if (e.ctrlKey && e.key === "z" && !e.shiftKey) { e.preventDefault(); history.undo(); return; }
    if (e.ctrlKey && (e.key === "Z" || (e.key === "z" && e.shiftKey) || e.key === "y")) { e.preventDefault(); history.redo(); return; }

    const info = node?.getEditorInfo();
    if (!info) return;

    if (e.key === "0") {
        e.preventDefault();
        resetZoom(info.container, info.editor);
    } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        info.editor.zoom_in();
    } else if (e.key === "-") {
        e.preventDefault();
        info.editor.zoom_out();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown" ||
               e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const step = e.shiftKey ? 200 : 60;
        const cvs  = info.container.querySelector<HTMLElement>('.drawflow')!;
        const dx   = e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0;
        const dy   = e.key === "ArrowUp"   ? step : e.key === "ArrowDown"  ? -step : 0;
        const newX = info.editor.canvas_x + dx;
        const newY = info.editor.canvas_y + dy;
        cvs.style.transform         = `translate(${newX}px, ${newY}px) scale(${info.editor.zoom_last_value})`;
        info.editor.canvas_x        = newX;
        info.editor.canvas_y        = newY;
    }
});

// ── Navigation buttons ──────────────────────────────────────────────────────
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