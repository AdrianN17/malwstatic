import Drawflow from "drawflow";
import { Documentation } from "../documentation/documentation";
import { DecompiledPEReader, FunctionDecompiledReader, InstructionDecompiledReader, ReferenceReader } from "../structure/decompiledReader";
import { InstructionDecompiled } from "../structure/decompiledPE";

const NODE_W            = 360;
const NODE_GAP          = 40;
const ROW               = 19;
const NODE_PADDING      = 24;   
const LAYOUT_ORIGIN_X   = 50;
const LAYOUT_ORIGIN_Y   = 50;
const HEADER_PORT       = 1;     
const INSTR_PORT_OFFSET = 2;     
const DRAWFLOW_ID       = "drawflow";
const NODE_CLASS        = "node";
const NODE_CONTENT_CLASS = "node-content";
const CSS_USED          = "used";
const COLOR_MANUAL      = "#f92672";
const HEADER_STYLE      = "border-bottom:1px solid #49483e;";
const PORT_PREFIX_OUTPUT = "output_";
const PORT_PREFIX_INPUT  = "input_";
const CSS_MAIN_PATH      = "main-path";
const CSS_NODE_IN        = "node_in_node-";
const CSS_NODE_OUT       = "node_out_node-";
const COMMENT_COLOR      = "#e6db74";
const CSS_FUNC_COMMENT   = "func-comment";
const CSS_INSTR_COMMENT  = "instr-comment";
const CSS_REF_COMMENT    = "ref-comment";

export class Node {

    documentation: Documentation;

    private editor:       Drawflow | null = null;
    private container:    HTMLElement | null = null;
    private instrToPort    = new Map<string, { nodeId: number; inputPort: number }>();
    private offsetToNodeId  = new Map<string, number>();
    private instrByOffset   = new Map<string, InstructionDecompiled>();
    private nodePortToOffset = new Map<string, string>();
    private _suppressConnectionCreated = false;
    private _commentInputController: AbortController | null = null;

    constructor(documentation: Documentation) {
        this.documentation = documentation;
    }

    private computeLayout(decompiled: DecompiledPEReader): Map<string, { x: number; y: number }> {
        const instrToFuncOffset = new Map<string, string>();
        decompiled.functions.forEach(func =>
            func.Instructions.forEach(instr =>
                instrToFuncOffset.set(instr.offset.toLowerCase(), func.offset.toLowerCase())
            )
        );

        const outEdges = new Map<string, Set<string>>();
        const inDegree  = new Map<string, number>();
        decompiled.functions.forEach(func => {
            outEdges.set(func.offset.toLowerCase(), new Set());
            inDegree.set(func.offset.toLowerCase(), 0);
        });

        decompiled.functions.forEach(func => {
            const src = func.offset.toLowerCase();
            func.Instructions.forEach(instr => {
                if (!instr.reference) return;
                const dst = instrToFuncOffset.get(instr.reference.toLowerCase());
                if (!dst || dst === src || outEdges.get(src)!.has(dst)) return;
                outEdges.get(src)!.add(dst);
                inDegree.set(dst, inDegree.get(dst)! + 1);
            });
        });

        const levels = new Map<string, number>();
        const queue = decompiled.functions
            .map(f => f.offset.toLowerCase())
            .filter(off => inDegree.get(off) === 0);
        queue.forEach(off => levels.set(off, 0));

        for (let i = 0; i < queue.length; i++) {
            const curr = queue[i];
            outEdges.get(curr)!.forEach(dst => {
                levels.set(dst, Math.max(levels.get(dst) ?? 0, levels.get(curr)! + 1));
                inDegree.set(dst, inDegree.get(dst)! - 1);
                if (inDegree.get(dst) === 0) queue.push(dst);
            });
        }

        decompiled.functions.forEach(f => {
            if (!levels.has(f.offset.toLowerCase())) levels.set(f.offset.toLowerCase(), 0);
        });

        const byLevel = new Map<number, string[]>();
        decompiled.functions.forEach(f => {
            const lvl = levels.get(f.offset.toLowerCase())!;
            if (!byLevel.has(lvl)) byLevel.set(lvl, []);
            byLevel.get(lvl)!.push(f.offset.toLowerCase());
        });

        const funcMap = new Map(decompiled.functions.map(f => [f.offset.toLowerCase(), f]));
        const positions = new Map<string, { x: number; y: number }>();

        byLevel.forEach((offsets, level) => {
            let y = LAYOUT_ORIGIN_Y;
            offsets.forEach(off => {
                positions.set(off, { x: LAYOUT_ORIGIN_X + level * NODE_W, y });
                const func = funcMap.get(off)!;
                y += (func.Instructions.length + 1) * ROW + NODE_PADDING + NODE_GAP;
            });
        });

        return positions;
    }

    draw(): void {
        this.container = document.getElementById(DRAWFLOW_ID) as HTMLElement;
        this.editor = new Drawflow(this.container);
        this.editor.start();
        (this.editor as any).removeNodeId = () => {};

        this.editor.on("connectionCreated", (data: any) => {
            if (this._suppressConnectionCreated) return;

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
                this.instrByOffset.get(offsetA)?.addReference(offsetB);
            }

            const svg = this.container!.querySelector(
                `.connection.${CSS_NODE_IN}${data.input_id}.${CSS_NODE_OUT}${data.output_id}.${data.output_class}.${data.input_class}`
            ) as SVGElement | null;
            if (svg) this._addRefCommentLabel(svg, "", offsetA, offsetB);
        });

        const decompiled = this.documentation.get();
        decompiled.calculateReference();

        const positions = this.computeLayout(decompiled);
        this.offsetToNodeId.clear();
        this.instrToPort.clear();
        this.instrByOffset.clear();
        this.nodePortToOffset.clear();

        const rowStyle = `height:${ROW}px;display:flex;align-items:center;box-sizing:border-box;gap:4px;overflow:hidden;`;

        decompiled.functions.forEach(func => {
            const { x, y } = positions.get(func.offset.toLowerCase()) ?? { x: LAYOUT_ORIGIN_X, y: LAYOUT_ORIGIN_Y };
            const funcOffset = func.offset.toLowerCase();
            const funcComment = (func as FunctionDecompiledReader).comments ?? "";

            const headerRow =
                `<div style="${rowStyle}${HEADER_STYLE}">` +
                `<strong style="flex-shrink:0;white-space:nowrap;color:#a6e22e;">${func.name}</strong>` +
                `<span class="${CSS_FUNC_COMMENT}" contenteditable="true" data-offset="${funcOffset}">${funcComment}</span>` +
                `</div>`;

            const instructionRows = func.Instructions.map(instr => {
                const comment = (instr as InstructionDecompiledReader).comment ?? "";
                return `<div style="${rowStyle}">` +
                    `<span style="flex-shrink:0;white-space:nowrap;color:#66d9ef;">${instr.offset}</span>` +
                    `<span style="flex-shrink:0;white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis;color:#f8f8f2;">${instr.opcode}</span>` +
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

        this._commentInputController?.abort();
        this._commentInputController = new AbortController();
        this.container!.addEventListener("input", (e) => {
            const target = e.target as HTMLElement;
            const decomp = this.documentation.get();
            if (target.classList.contains(CSS_INSTR_COMMENT)) {
                const instr = this.instrByOffset.get(target.dataset.offset!) as InstructionDecompiledReader | undefined;
                if (instr) instr.comment = target.textContent ?? "";
            } else if (target.classList.contains(CSS_FUNC_COMMENT)) {
                const func = decomp.functions.find(f => f.offset.toLowerCase() === target.dataset.offset!) as FunctionDecompiledReader | undefined;
                if (func) func.comments = target.textContent ?? "";
            }
        }, { signal: this._commentInputController.signal });

        const TOOLTIP_ID = "malw-comment-tooltip";
        let tooltip = document.getElementById(TOOLTIP_ID) as HTMLElement | null;
        if (!tooltip) {
            tooltip = document.createElement("div");
            tooltip.id = TOOLTIP_ID;
            tooltip.style.cssText =
                `position:fixed;z-index:9999;background:#272822;color:${COMMENT_COLOR};` +
                `border:1px solid rgba(230,219,116,0.45);border-radius:4px;padding:3px 10px;` +
                `font-size:12px;font-style:italic;pointer-events:none;display:none;` +
                `font-family:'Segoe UI',system-ui,sans-serif;` +
                `box-shadow:0 4px 14px rgba(0,0,0,0.65);white-space:pre;`;
            document.body.appendChild(tooltip);
        }
        const sig = this._commentInputController.signal;
        this.container!.addEventListener("mouseover", (e) => {
            const t = e.target as HTMLElement;
            if ((t.classList.contains(CSS_INSTR_COMMENT) || t.classList.contains(CSS_FUNC_COMMENT))
                    && t.scrollWidth > t.clientWidth && t.textContent) {
                tooltip!.textContent = t.textContent;
                const r = t.getBoundingClientRect();
                tooltip!.style.left = r.left + "px";
                tooltip!.style.top  = (r.bottom + 5) + "px";
                tooltip!.style.display = "block";
            }
        }, { signal: sig });
        this.container!.addEventListener("mouseout", (e) => {
            const t = e.target as HTMLElement;
            if (t.classList.contains(CSS_INSTR_COMMENT) || t.classList.contains(CSS_FUNC_COMMENT))
                tooltip!.style.display = "none";
        }, { signal: sig });
        this.container!.addEventListener("mousedown", () => {
            tooltip!.style.display = "none";
        }, { signal: sig });

        decompiled.references.forEach(ref =>
            this._drawConnection(ref.offsetA, ref.offsetB, (ref as ReferenceReader).comment ?? "")
        );
    }

    private _drawConnection(fromInstrOffset: string, toOffset: string, comment = ""): void {
        if (!this.editor || !this.container) return;

        const from = this.instrToPort.get(fromInstrOffset.toLowerCase());
        const to   = this.instrToPort.get(toOffset.toLowerCase());
        if (!from || !to) return;

        const outPort = from.inputPort;
        this._suppressConnectionCreated = true;
        this.editor.addConnection(from.nodeId, to.nodeId, `${PORT_PREFIX_OUTPUT}${outPort}`, `${PORT_PREFIX_INPUT}${to.inputPort}`);
        this._suppressConnectionCreated = false;

        const markPort = (nodeId: number, side: "input" | "output", port: number) =>
            this.container!.querySelector(`#node-${nodeId} .${side}.${side}_${port}`)?.classList.add(CSS_USED);

        markPort(from.nodeId, "output", outPort);
        markPort(to.nodeId,   "input",  to.inputPort);

        const svg = this.container!.querySelector(
            `.connection.${CSS_NODE_IN}${to.nodeId}.${CSS_NODE_OUT}${from.nodeId}` +
            `.${PORT_PREFIX_OUTPUT}${outPort}.${PORT_PREFIX_INPUT}${to.inputPort}`
        ) as SVGElement | null;
        if (svg) this._addRefCommentLabel(svg, comment, fromInstrOffset.toLowerCase(), toOffset.toLowerCase());
    }

    private _addRefCommentLabel(svg: SVGElement, comment: string, offsetA: string, offsetB: string): void {
        const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
        fo.setAttribute("width", "150");
        fo.setAttribute("height", "22");

        const div = document.createElement("div");
        div.contentEditable = "true";
        div.textContent = comment;
        div.className = CSS_REF_COMMENT;
        div.dataset.offsetA = offsetA;
        div.dataset.offsetB = offsetB;
        div.addEventListener("mousedown", e => e.stopPropagation());
        div.addEventListener("input", () => {
            const ref = this.documentation.get().references.find(
                r => r.offsetA === offsetA && r.offsetB === offsetB
            ) as ReferenceReader | undefined;
            if (ref) ref.comment = div.textContent ?? "";
        });

        fo.appendChild(div);
        svg.appendChild(fo);

        requestAnimationFrame(() => {
            const path = svg.querySelector(`.${CSS_MAIN_PATH}`) as SVGPathElement | null;
            if (!path) return;
            const len = path.getTotalLength();
            if (!len) return;
            const mid = path.getPointAtLength(len / 2);
            fo.setAttribute("x", String(mid.x - 75));
            fo.setAttribute("y", String(mid.y - 11));
        });
    }

    connect(fromInstrOffset: string, toOffset: string): void {
        const decompiled = this.documentation.get();
        const a = fromInstrOffset.toLowerCase();
        const b = toOffset.toLowerCase();

        const alreadyExists = decompiled.references.some(r => r.offsetA === a && r.offsetB === b);
        if (!alreadyExists) {
            decompiled.references.push(new ReferenceReader(a, b));
            this.instrByOffset.get(a)?.addReference(b);
        }

        this._drawConnection(a, b);

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