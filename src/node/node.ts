import Drawflow from "drawflow";
import { Documentation } from "../documentation/documentation";
import { DecompiledPEReader, ReferenceReader } from "../structure/decompiledReader";
import { InstructionDecompiled } from "../structure/decompiledPE";

const NODE_W            = 360;
const NODE_GAP          = 40;
const ROW               = 19;
const NODE_PADDING      = 24;    // 12px top + 12px bottom
const LAYOUT_ORIGIN_X   = 50;
const LAYOUT_ORIGIN_Y   = 50;
const HEADER_PORT       = 1;     // port index reserved for the function name row
const INSTR_PORT_OFFSET = 2;     // instruction ports start at 2 (port 1 = header)
const DRAWFLOW_ID       = "drawflow";
const NODE_CLASS        = "node";
const NODE_CONTENT_CLASS = "node-content";
const CSS_USED          = "used";
const COLOR_MANUAL      = "#e94560";
const HEADER_STYLE      = "border-bottom:1px solid #555;";
const PORT_PREFIX_OUTPUT = "output_";
const PORT_PREFIX_INPUT  = "input_";
const CSS_MAIN_PATH      = "main-path";
const CSS_NODE_IN        = "node_in_node-";
const CSS_NODE_OUT       = "node_out_node-";

export class Node {

    documentation: Documentation;

    private editor:       Drawflow | null = null;
    private container:    HTMLElement | null = null;
    private instrToPort    = new Map<string, { nodeId: number; inputPort: number }>();
    private offsetToNodeId  = new Map<string, number>();
    private instrByOffset   = new Map<string, InstructionDecompiled>();

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

        // BFS — longest-path level assignment
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
        // Cycles: place unvisited at level 0
        decompiled.functions.forEach(f => {
            if (!levels.has(f.offset.toLowerCase())) levels.set(f.offset.toLowerCase(), 0);
        });

        // Group by level, stack vertically within each column
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
            this.container!.querySelector(`#node-${data.output_id} .output.${data.output_class}`)?.classList.add(CSS_USED);
            this.container!.querySelector(`#node-${data.input_id} .input.${data.input_class}`)?.classList.add(CSS_USED);
        });

        const decompiled = this.documentation.get();
        decompiled.calculateReference();

        const positions = this.computeLayout(decompiled);
        this.offsetToNodeId.clear();
        this.instrToPort.clear();
        this.instrByOffset.clear();

        decompiled.functions.forEach(func => {
            const { x, y } = positions.get(func.offset.toLowerCase()) ?? { x: LAYOUT_ORIGIN_X, y: LAYOUT_ORIGIN_Y };
            const row = (content: string, style = "") =>
                `<div style="height:${ROW}px;line-height:${ROW}px;box-sizing:border-box;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${style}">${content}</div>`;
            const headerRow = row(`<strong>${func.name}</strong>`, HEADER_STYLE);
            const instructionRows = func.Instructions
                .map(instr => row(`<span>${instr.offset}</span> <span>${instr.opcode}</span>`))
                .join("");
            const html = `<div class="${NODE_CONTENT_CLASS}">${headerRow}${instructionRows}</div>`;
            const nodeId = this.editor!.addNode(func.name, func.Instructions.length + 1, func.Instructions.length + 1, x, y, NODE_CLASS, {}, html);

            (["input", "output"] as const).forEach(side => {
                const el = this.container!.querySelector(`#node-${nodeId} .${side}.${side}_${HEADER_PORT}`) as HTMLElement | null;
                if (el) el.style.visibility = "hidden";
            });

            this.offsetToNodeId.set(func.offset.toLowerCase(), nodeId);
            func.Instructions.forEach((instr, i) => {
                this.instrToPort.set(instr.offset.toLowerCase(), { nodeId, inputPort: i + INSTR_PORT_OFFSET });
                this.instrByOffset.set(instr.offset.toLowerCase(), instr);
            });
        });

        decompiled.references.forEach(ref =>
            this._drawConnection(ref.offsetA, ref.offsetB)
        );
    }

    private _drawConnection(fromInstrOffset: string, toOffset: string): void {
        if (!this.editor || !this.container) return;

        const from = this.instrToPort.get(fromInstrOffset.toLowerCase());
        const to   = this.instrToPort.get(toOffset.toLowerCase());
        if (!from || !to) return;

        const outPort = from.inputPort;
        this.editor.addConnection(from.nodeId, to.nodeId, `${PORT_PREFIX_OUTPUT}${outPort}`, `${PORT_PREFIX_INPUT}${to.inputPort}`);

        const markPort = (nodeId: number, side: "input" | "output", port: number) =>
            this.container!.querySelector(`#node-${nodeId} .${side}.${side}_${port}`)?.classList.add(CSS_USED);

        markPort(from.nodeId, "output", outPort);
        markPort(to.nodeId,   "input",  to.inputPort);
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