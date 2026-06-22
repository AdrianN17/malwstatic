import Drawflow from "drawflow";
import { Documentation } from "../documentation/documentation";
import { ReferenceReader } from "../structure/decompiledReader";
import {
    PORT_PREFIX_OUTPUT, PORT_PREFIX_INPUT,
    CSS_MAIN_PATH, CSS_NODE_IN, CSS_NODE_OUT,
    CSS_USED, CSS_REF_COMMENT,
} from "./NodeConstants";

export class ConnectionRenderer {

    private readonly _positionUpdaters: (() => void)[] = [];

    constructor(
        private readonly editor: Drawflow,
        private readonly container: HTMLElement,
        private readonly instrToPort: Map<string, { nodeId: number; inputPort: number }>,
        private readonly documentation: Documentation,
        private readonly suppress: { connectionCreated: boolean },
    ) {
        const scheduleUpdate = () => {
            requestAnimationFrame(() => this._positionUpdaters.forEach(fn => fn()));
        };
        this.editor.on("translate", scheduleUpdate);
        this.editor.on("zoom",      scheduleUpdate);
        this.editor.on("nodeMoved", scheduleUpdate);
    }

    draw(fromInstrOffset: string, toOffset: string, comment = ""): void {
        const from = this.instrToPort.get(fromInstrOffset.toLowerCase());
        const to   = this.instrToPort.get(toOffset.toLowerCase());
        if (!from || !to) return;

        const outPort = from.inputPort;

        this.suppress.connectionCreated = true;
        this.editor.addConnection(
            from.nodeId, to.nodeId,
            `${PORT_PREFIX_OUTPUT}${outPort}`,
            `${PORT_PREFIX_INPUT}${to.inputPort}`
        );
        this.suppress.connectionCreated = false;

        this._markPort(from.nodeId, "output", outPort);
        this._markPort(to.nodeId,   "input",  to.inputPort);

        const svg = this.container.querySelector(
            `.connection.${CSS_NODE_IN}${to.nodeId}.${CSS_NODE_OUT}${from.nodeId}` +
            `.${PORT_PREFIX_OUTPUT}${outPort}.${PORT_PREFIX_INPUT}${to.inputPort}`
        ) as SVGElement | null;
        if (svg) this.addRefCommentLabel(svg, comment, fromInstrOffset.toLowerCase(), toOffset.toLowerCase());
    }

    addRefCommentLabel(svg: SVGElement, comment: string, offsetA: string, offsetB: string): void {
        const div = document.createElement("div");
        div.contentEditable = "true";
        div.textContent = comment;
        div.className = CSS_REF_COMMENT;
        div.dataset.offsetA = offsetA;
        div.dataset.offsetB = offsetB;
        div.style.display = "none";
        div.addEventListener("mousedown", e => e.stopPropagation());
        div.addEventListener("input", () => {
            const ref = this.documentation.get().references.find(
                r => r.offsetA === offsetA && r.offsetB === offsetB
            ) as ReferenceReader | undefined;
            if (ref) ref.comment = div.textContent ?? "";
        });

        this.container.appendChild(div);

        const reposition = () => {
            if (!svg.isConnected) { div.remove(); return; }
            const path = svg.querySelector(`.${CSS_MAIN_PATH}`) as SVGPathElement | null;
            if (!path) return;
            const len = path.getTotalLength();
            if (!len) return;
            const mid = path.getPointAtLength(len / 2);
            const pt  = (svg as SVGSVGElement).createSVGPoint();
            pt.x = mid.x;
            pt.y = mid.y;
            const ctm = path.getScreenCTM();
            if (!ctm) return;
            const screen = pt.matrixTransform(ctm);
            div.style.left    = `${screen.x}px`;
            div.style.top     = `${screen.y}px`;
            div.style.display = "";
        };

        this._positionUpdaters.push(reposition);
        requestAnimationFrame(reposition);
    }

    private _markPort(nodeId: number, side: "input" | "output", port: number): void {
        this.container
            .querySelector(`#node-${nodeId} .${side}.${side}_${port}`)
            ?.classList.add(CSS_USED);
    }

}
