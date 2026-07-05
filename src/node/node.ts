import Drawflow from "drawflow";
import { Documentation } from "../documentation/documentation";
import { FunctionReader, InstructionReader, ReferenceReader } from "../structure/decompiledReader";
import {
    DRAWFLOW_ID, NODE_CLASS, NODE_CONTENT_CLASS,
    HEADER_PORT, INSTR_PORT_OFFSET,
    HEADER_STYLE, ROW,
    PORT_PREFIX_OUTPUT, PORT_PREFIX_INPUT,
    CSS_NODE_IN, CSS_NODE_OUT, CSS_MAIN_PATH,
    CSS_FUNC_COMMENT, CSS_INSTR_COMMENT,
    CSS_USED, COLOR_MANUAL,
    LAYOUT_ORIGIN_X, LAYOUT_ORIGIN_Y,
    CSS_INSTR_ROW, CSS_HIGHLIGHTED, CSS_NODE_HIGHLIGHTED,
    CSS_COLLAPSE_BTN, CSS_COLLAPSED, CSS_PIN_BTN, CSS_PINNED,
} from "./NodeConstants";
import { NodeLayout } from "./NodeLayout";
import { ConnectionRenderer } from "./ConnectionRenderer";
import { CommentController } from "./CommentController";
import { highlightAsm } from "./asmHighlight";

export class Node {

    documentation: Documentation;
    onNodeHidden:   ((name: string, restore: () => void) => void) | null = null;
    /** Fires whenever the pinned main changes — passes the new main's offset (or "" if unpinned). */
    onMainChanged:  ((offset: string) => void) | null = null;

    private editor:       Drawflow | null = null;
    private container:    HTMLElement | null = null;
    private instrToPort    = new Map<string, { nodeId: number; inputPort: number }>();
    private offsetToNodeId  = new Map<string, number>();
    private instrByOffset   = new Map<string, InstructionReader>();
    private nodePortToOffset = new Map<string, string>();
    private nodeIdToFuncOffset = new Map<number, string>();
    private _commentController: AbortController | null = null;
    private _connRenderer: ConnectionRenderer | null = null;
    private readonly _suppress = { connectionCreated: false };

    private readonly layout = new NodeLayout();

    constructor(documentation: Documentation) {
        this.documentation = documentation;
    }

    /** Expose the drawflow editor and container for external tooling (minimap, navigation). */
    getEditorInfo(): { editor: any; container: HTMLElement } | null {
        if (!this.editor || !this.container) return null;
        return { editor: this.editor as any, container: this.container };
    }

    /**
     * Programmatically set the pinned main function by offset.
     * Unpins the previous main, pins the new one, and triggers relayout.
     */
    setMain(offset: string): void {
        if (!this.container) return;
        const decompiled = this.documentation.get();
        const lower = offset.toLowerCase();

        // Unpin previous main
        const prev = decompiled.functions.find(f => f.isMain);
        if (prev) {
            prev.isMain = false;
            const prevId = this.offsetToNodeId.get(prev.offset.toLowerCase());
            if (prevId !== undefined) {
                const prevEl = this.container.querySelector(`#node-${prevId}`) as HTMLElement | null;
                if (prevEl) {
                    prevEl.classList.remove(CSS_PINNED);
                    const pb = prevEl.querySelector<HTMLElement>(`.${CSS_PIN_BTN}`);
                    if (pb) pb.style.color = "";
                }
            }
        }

        // Pin new main
        const next = decompiled.functions.find(f => f.offset.toLowerCase() === lower);
        if (!next) return;
        next.isMain = true;
        const nextId = this.offsetToNodeId.get(lower);
        if (nextId !== undefined) {
            const nextEl = this.container.querySelector(`#node-${nextId}`) as HTMLElement | null;
            if (nextEl) {
                nextEl.classList.add(CSS_PINNED);
                const pb = nextEl.querySelector<HTMLElement>(`.${CSS_PIN_BTN}`);
                if (pb) pb.style.color = "#e6db74";
            }
        }

        this.relayout();
    }

    draw(): void {
        this.container = document.getElementById(DRAWFLOW_ID) as HTMLElement;

        this._commentController?.abort();
        this.container.innerHTML = "";
        this.offsetToNodeId.clear();
        this.instrToPort.clear();
        this.instrByOffset.clear();
        this.nodePortToOffset.clear();
        this.nodeIdToFuncOffset.clear();

        this.editor = new Drawflow(this.container);
        this.editor.start();
        (this.editor as any).removeNodeId = () => {};

        this.editor.on("connectionCreated", (data: any) => {
            if (this._suppress.connectionCreated) return;

            this.container!.querySelector(`#node-${data.output_id} .output.${data.output_class}`)?.classList.add(CSS_USED);
            this.container!.querySelector(`#node-${data.input_id} .input.${data.input_class}`)?.classList.add(CSS_USED);

            const outPort = parseInt(data.output_class.slice(PORT_PREFIX_OUTPUT.length), 10);
            const inPort  = parseInt(data.input_class.slice(PORT_PREFIX_INPUT.length), 10);
            const offsetA = this.nodePortToOffset.get(`${data.output_id}_${outPort}`) ?? "";
            const offsetB = this.nodePortToOffset.get(`${data.input_id}_${inPort}`) ?? "";
            if (!offsetA || !offsetB) return;

            const decompiled = this.documentation.get();
            if (!decompiled.references.some(r => r.offsetA === offsetA && r.offsetB === offsetB)) {
                decompiled.references.push(new ReferenceReader(offsetA, offsetB));
            }

            const svg = this.container!.querySelector(
                `.connection.${CSS_NODE_IN}${data.input_id}.${CSS_NODE_OUT}${data.output_id}.${data.output_class}.${data.input_class}`
            ) as SVGElement | null;
            if (svg) this._connRenderer!.addRefCommentLabel(svg, "", offsetA, offsetB);
        });

        const decompiled = this.documentation.get();
        const positions = this.layout.compute(decompiled);
        const funcByOffset = new Map<string, FunctionReader>(
            decompiled.functions.map(f => [f.offset.toLowerCase(), f as FunctionReader])
        );

        let _rebuildTimer: ReturnType<typeof setTimeout> | null = null;
        this.editor.on("nodeMoved", (id: string) => {
            const nid = parseInt(id, 10);
            const funcOffset = this.nodeIdToFuncOffset.get(nid);
            if (!funcOffset) return;
            const func = funcByOffset.get(funcOffset);
            if (!func) return;
            const data = this.editor!.getNodeFromId(nid);
            func.updatePosition(data.pos_x, data.pos_y);

            // Debounced rebuild: recalculates optimal port side + path after drag ends.
            if (_rebuildTimer) clearTimeout(_rebuildTimer);
            _rebuildTimer = setTimeout(() => this._connRenderer?.rebuildConnections(), 180);
        });

        this.offsetToNodeId.clear();
        this.instrToPort.clear();
        this.instrByOffset.clear();
        this.nodePortToOffset.clear();
        this.nodeIdToFuncOffset.clear();

        const rowStyle = `height:${ROW}px;display:flex;align-items:center;box-sizing:border-box;gap:4px;`;

        decompiled.functions.forEach(func => {
            const { x, y } = positions.get(func.offset.toLowerCase()) ?? { x: LAYOUT_ORIGIN_X, y: LAYOUT_ORIGIN_Y };
            const funcOffset = func.offset.toLowerCase();
            const funcComment = (func as FunctionReader).comments ?? "";

            const headerRow =
                `<div style="${rowStyle}${HEADER_STYLE}">` +
                `<strong style="flex-shrink:0;white-space:nowrap;color:#a6e22e;">${func.name}</strong>` +
                `<span class="${CSS_FUNC_COMMENT}" contenteditable="true" data-offset="${funcOffset}">${funcComment}</span>` +
                `<button class="${CSS_PIN_BTN}" title="Pin">&#128204;</button>` +
                `<button class="${CSS_COLLAPSE_BTN}" title="Hide node">&times;</button>` +
                `</div>`;

            const instructionRows = func.Instructions.map(instr => {
                const comment = (instr as InstructionReader).comment ?? "";
                return `<div class="${CSS_INSTR_ROW}" data-offset="${instr.offset.toLowerCase()}" style="${rowStyle}">` +
                    `<span style="flex-shrink:0;white-space:nowrap;color:#66d9ef;">${instr.offset}</span>` +
                    `<span style="flex-shrink:0;white-space:nowrap;">${highlightAsm(instr.opcode)}</span>` +
                    `<span class="${CSS_INSTR_COMMENT}" contenteditable="true" data-offset="${instr.offset.toLowerCase()}" style="min-width:80px;">${comment}</span>` +
                    `</div>`;
            }).join("");

            const html = `<div class="${NODE_CONTENT_CLASS}">${headerRow}${instructionRows}</div>`;
            const nodeId = this.editor!.addNode(func.name, func.Instructions.length + 1, func.Instructions.length + 1, x, y, NODE_CLASS, {}, html);

            (["input", "output"] as const).forEach(side => {
                const el = this.container!.querySelector(`#node-${nodeId} .${side}.${side}_${HEADER_PORT}`) as HTMLElement | null;
                if (el) el.style.visibility = "hidden";
            });

            this.container!.querySelector(`#node-${nodeId}`)!
                .querySelectorAll(`.${CSS_INSTR_COMMENT},.${CSS_FUNC_COMMENT}`)
                .forEach(el => el.addEventListener("mousedown", e => e.stopPropagation()));

            const nodeEl = this.container!.querySelector(`#node-${nodeId}`) as HTMLElement;

            const collapseBtn = nodeEl.querySelector<HTMLElement>(`.${CSS_COLLAPSE_BTN}`);
            if (collapseBtn) {
                collapseBtn.addEventListener("mousedown", e => e.stopPropagation());
                collapseBtn.addEventListener("click", e => {
                    e.stopPropagation();
                    nodeEl.style.display = "none";
                    func.visible = false;
                    this.onNodeHidden?.(func.name, () => {
                        nodeEl.style.display = "";
                        func.visible = true;
                    });
                });
            }

            const pinBtn = nodeEl.querySelector<HTMLElement>(`.${CSS_PIN_BTN}`);
            if (pinBtn) {
                pinBtn.addEventListener("mousedown", e => e.stopPropagation());
                pinBtn.addEventListener("click", e => {
                    e.stopPropagation();

                    // Unpin the current main if it's a different node
                    const currentMain = this.documentation.get().functions.find(f => f.isMain);
                    if (currentMain && currentMain.offset.toLowerCase() !== funcOffset) {
                        const prevId = this.offsetToNodeId.get(currentMain.offset.toLowerCase());
                        if (prevId !== undefined) {
                            const prevEl = this.container!.querySelector(`#node-${prevId}`) as HTMLElement | null;
                            if (prevEl) {
                                prevEl.classList.remove(CSS_PINNED);
                                prevEl.querySelector<HTMLElement>(`.${CSS_PIN_BTN}`)!.style.color = "";
                            }
                        }
                        currentMain.isMain = false;
                    }

                    const pinned = nodeEl.classList.toggle(CSS_PINNED);
                    func.isMain = pinned;
                    pinBtn.style.color = pinned ? "#e6db74" : "";
                    if (pinned) {
                        this.relayout();
                        this.onMainChanged?.(func.offset.toLowerCase());
                    } else {
                        this.onMainChanged?.("");
                    }
                });
            }

            nodeEl.addEventListener("contextmenu", e => {
                e.preventDefault();
                if (nodeEl.classList.contains(CSS_PINNED)) return;
                const highlighted = nodeEl.classList.toggle(CSS_NODE_HIGHLIGHTED);
                func.isHighlighted = highlighted;
            });
            nodeEl.querySelectorAll<HTMLElement>(`.${CSS_INSTR_ROW}`).forEach(rowEl => {
                rowEl.addEventListener("contextmenu", e => {
                    e.preventDefault();
                    e.stopPropagation();
                    const highlighted = rowEl.classList.toggle(CSS_HIGHLIGHTED);
                    const offset = rowEl.dataset.offset;
                    if (offset) {
                        const instr = this.instrByOffset.get(offset);
                        if (instr) instr.isHighlighted = highlighted;
                    }
                });
            });

            // Restore persisted states
            if (!func.visible) {
                nodeEl.style.display = "none";
                this.onNodeHidden?.(func.name, () => {
                    nodeEl.style.display = "";
                    func.visible = true;
                });
            }
            if (func.isMain) {
                nodeEl.classList.add(CSS_PINNED);
                if (pinBtn) pinBtn.style.color = "#e6db74";
            }
            if (func.isHighlighted && !func.isMain) {
                nodeEl.classList.add(CSS_NODE_HIGHLIGHTED);
            }

            this._makePortsBidirectional(nodeEl);

            this.offsetToNodeId.set(funcOffset, nodeId);
            this.nodeIdToFuncOffset.set(nodeId, funcOffset);
            func.Instructions.forEach((instr, i) => {
                const port = i + INSTR_PORT_OFFSET;
                this.instrToPort.set(instr.offset.toLowerCase(), { nodeId, inputPort: port });
                this.nodePortToOffset.set(`${nodeId}_${port}`, instr.offset.toLowerCase());
                this.instrByOffset.set(instr.offset.toLowerCase(), instr);
                if (instr.isHighlighted) {
                    const rowEl = nodeEl.querySelector<HTMLElement>(`.${CSS_INSTR_ROW}[data-offset="${instr.offset.toLowerCase()}"]`);
                    if (rowEl) rowEl.classList.add(CSS_HIGHLIGHTED);
                }
            });
        });

        this._connRenderer = new ConnectionRenderer(
            this.editor, this.container, this.instrToPort, this.documentation, this._suppress
        );
        this._commentController = new CommentController(
            this.container, this.instrByOffset, this.documentation
        ).setup();

        requestAnimationFrame(() => {
            decompiled.references.forEach(ref =>
                this._connRenderer!.draw(ref.offsetA, ref.offsetB, (ref as ReferenceReader).comment ?? "")
            );
            if (decompiled.functions.some(f => f.isMain)) {
                this.relayout();
            }
        });
    }

    /** Make every input/output port pair behave as a single bidirectional port. */
    private _makePortsBidirectional(nodeEl: HTMLElement): void {
        // Drag starts on LEFT (input) → redirect mousedown to RIGHT (output) so drawflow starts a drag
        nodeEl.querySelectorAll<HTMLElement>('.input').forEach(inputEl => {
            const portClass = [...inputEl.classList].find(c => c.startsWith('input_'));
            if (!portClass) return;
            const portNum = portClass.slice('input_'.length);
            inputEl.addEventListener('mousedown', (e: MouseEvent) => {
                const outputEl = nodeEl.querySelector<HTMLElement>(`.output.output_${portNum}`);
                if (!outputEl) return;
                e.stopPropagation();
                outputEl.dispatchEvent(new MouseEvent('mousedown', {
                    bubbles: true, cancelable: true,
                    clientX: e.clientX, clientY: e.clientY,
                    buttons: e.buttons, button: e.button,
                }));
            });
        });

        // Drag ends on RIGHT (output) → redirect mouseup to LEFT (input) so drawflow accepts the drop
        nodeEl.querySelectorAll<HTMLElement>('.output').forEach(outputEl => {
            const portClass = [...outputEl.classList].find(c => c.startsWith('output_'));
            if (!portClass) return;
            const portNum = portClass.slice('output_'.length);
            outputEl.addEventListener('mouseup', (e: MouseEvent) => {
                const inputEl = nodeEl.querySelector<HTMLElement>(`.input.input_${portNum}`);
                if (!inputEl) return;
                // Dispatch on input first (synchronous) so drawflow's document mouseup sees target=input
                inputEl.dispatchEvent(new MouseEvent('mouseup', {
                    bubbles: true, cancelable: true,
                    clientX: e.clientX, clientY: e.clientY,
                    buttons: e.buttons, button: e.button,
                }));
                // Stop original so drawflow doesn't also process a drop on an output port
                e.stopPropagation();
            });
        });
    }

    /** Hide every node that has no reference connections (neither as source nor destination). */
    hideUnreferenced(): void {
        if (!this.container || !this.editor) return;
        const decompiled = this.documentation.get();

        // Collect all function offsets that appear in at least one reference
        const referenced = new Set<string>();
        decompiled.references.forEach(r => {
            const fromEntry = this.instrToPort.get(r.offsetA.toLowerCase());
            const toEntry   = this.instrToPort.get(r.offsetB.toLowerCase());
            if (fromEntry) {
                const fo = this.nodeIdToFuncOffset.get(fromEntry.nodeId);
                if (fo) referenced.add(fo);
            }
            if (toEntry) {
                const fo = this.nodeIdToFuncOffset.get(toEntry.nodeId);
                if (fo) referenced.add(fo);
            }
        });

        decompiled.functions.forEach(func => {
            if (referenced.has(func.offset.toLowerCase())) return;
            const nodeId = this.offsetToNodeId.get(func.offset.toLowerCase());
            if (nodeId === undefined) return;
            const nodeEl = this.container!.querySelector(`#node-${nodeId}`) as HTMLElement | null;
            if (!nodeEl || nodeEl.style.display === "none") return;
            nodeEl.style.display = "none";
            func.visible = false;
            this.onNodeHidden?.(func.name, () => {
                nodeEl.style.display = "";
                func.visible = true;
            });
        });
    }

    relayout(): void {
        const decompiled = this.documentation.get();
        const positions  = this.layout.computeFromMain(decompiled);
        const dfData     = (this.editor as any).drawflow.drawflow.Home.data as Record<string, any>;

        decompiled.functions.forEach(func => {
            const pos    = positions.get(func.offset.toLowerCase());
            if (!pos) return;

            func.updatePosition(pos.x, pos.y);

            const nodeId = this.offsetToNodeId.get(func.offset.toLowerCase());
            if (nodeId === undefined) return;

            const nodeEl = this.container!.querySelector(`#node-${nodeId}`) as HTMLElement | null;
            if (!nodeEl) return;

            nodeEl.style.left = pos.x + "px";
            nodeEl.style.top  = pos.y + "px";

            // Keep drawflow's internal model in sync so addConnection and
            // updateConnectionNodes both calculate paths from correct positions.
            if (dfData[nodeId]) {
                dfData[nodeId].pos_x = pos.x;
                dfData[nodeId].pos_y = pos.y;
            }

            (this.editor as any).updateConnectionNodes(`node-${nodeId}`);
        });

        requestAnimationFrame(() => this._connRenderer?.rebuildConnections());
    }

    connect(fromInstrOffset: string, toOffset: string): void {
        const decompiled = this.documentation.get();
        const a = fromInstrOffset.toLowerCase();
        const b = toOffset.toLowerCase();

        if (!decompiled.references.some(r => r.offsetA === a && r.offsetB === b)) {
            decompiled.references.push(new ReferenceReader(a, b));
        }

        this._connRenderer?.draw(a, b);

        const from = this.instrToPort.get(a);
        const to   = this.instrToPort.get(b);
        if (from && to) {
            const path = this.container!.querySelector(
                `.connection.${CSS_NODE_IN}${to.nodeId}.${CSS_NODE_OUT}${from.nodeId}` +
                `.${PORT_PREFIX_OUTPUT}${from.inputPort}.${PORT_PREFIX_INPUT}${to.inputPort} .${CSS_MAIN_PATH}`
            ) as SVGPathElement | null;
            if (path) path.style.stroke = COLOR_MANUAL;
        }
    }

}