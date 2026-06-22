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
} from "./NodeConstants";
import { NodeLayout } from "./NodeLayout";
import { ConnectionRenderer } from "./ConnectionRenderer";
import { CommentController } from "./CommentController";
import { highlightAsm } from "./asmHighlight";

export class Node {

    documentation: Documentation;

    private editor:       Drawflow | null = null;
    private container:    HTMLElement | null = null;
    private instrToPort    = new Map<string, { nodeId: number; inputPort: number }>();
    private offsetToNodeId  = new Map<string, number>();
    private instrByOffset   = new Map<string, InstructionReader>();
    private nodePortToOffset = new Map<string, string>();
    private _commentController: AbortController | null = null;
    private _connRenderer: ConnectionRenderer | null = null;
    private readonly _suppress = { connectionCreated: false };

    private readonly layout = new NodeLayout();

    constructor(documentation: Documentation) {
        this.documentation = documentation;
    }

    draw(): void {
        this.container = document.getElementById(DRAWFLOW_ID) as HTMLElement;

        this._commentController?.abort();
        this.container.innerHTML = "";
        this.offsetToNodeId.clear();
        this.instrToPort.clear();
        this.instrByOffset.clear();
        this.nodePortToOffset.clear();

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

        this.offsetToNodeId.clear();
        this.instrToPort.clear();
        this.instrByOffset.clear();
        this.nodePortToOffset.clear();

        const rowStyle = `height:${ROW}px;display:flex;align-items:center;box-sizing:border-box;gap:4px;overflow:hidden;`;

        decompiled.functions.forEach(func => {
            const { x, y } = positions.get(func.offset.toLowerCase()) ?? { x: LAYOUT_ORIGIN_X, y: LAYOUT_ORIGIN_Y };
            const funcOffset = func.offset.toLowerCase();
            const funcComment = (func as FunctionReader).comments ?? "";

            const headerRow =
                `<div style="${rowStyle}${HEADER_STYLE}">` +
                `<strong style="flex-shrink:0;white-space:nowrap;color:#a6e22e;">${func.name}</strong>` +
                `<span class="${CSS_FUNC_COMMENT}" contenteditable="true" data-offset="${funcOffset}">${funcComment}</span>` +
                `</div>`;

            const instructionRows = func.Instructions.map(instr => {
                const comment = (instr as InstructionReader).comment ?? "";
                return `<div style="${rowStyle}">` +
                    `<span style="flex-shrink:0;white-space:nowrap;color:#66d9ef;">${instr.offset}</span>` +
                    `<span style="flex-shrink:0;white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis;">${highlightAsm(instr.opcode)}</span>` +
                    `<span class="${CSS_INSTR_COMMENT}" contenteditable="true" data-offset="${instr.offset.toLowerCase()}">${comment}</span>` +
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

            this.offsetToNodeId.set(funcOffset, nodeId);
            func.Instructions.forEach((instr, i) => {
                const port = i + INSTR_PORT_OFFSET;
                this.instrToPort.set(instr.offset.toLowerCase(), { nodeId, inputPort: port });
                this.nodePortToOffset.set(`${nodeId}_${port}`, instr.offset.toLowerCase());
                this.instrByOffset.set(instr.offset.toLowerCase(), instr);
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
        });
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