import Drawflow from "drawflow";
import { Documentation } from "../documentation/documentation";
import { ReferenceReader } from "../structure/decompiledReader";
import {
    PORT_PREFIX_OUTPUT, PORT_PREFIX_INPUT,
    CSS_MAIN_PATH, CSS_NODE_IN, CSS_NODE_OUT,
    CSS_USED, CSS_REF_COMMENT, NODE_W,
} from "./NodeConstants";

export class ConnectionRenderer {

    /** Label reposition closures only (path midpoints depend on rerouted paths). */
    private readonly _labelUpdaters: (() => void)[] = [];
    /** All auto-drawn connections — used to rebuild with fresh port choices after relayout. */
    private _connections: Array<{ from: string; to: string; comment: string }> = [];

    constructor(
        private readonly editor: Drawflow,
        private readonly container: HTMLElement,
        private readonly instrToPort: Map<string, { nodeId: number; inputPort: number }>,
        private readonly documentation: Documentation,
        private readonly suppress: { connectionCreated: boolean },
    ) {
        // Reroute paths on node movement (translate/zoom don't change world-space paths)
        const scheduleReroute = () => {
            requestAnimationFrame(() => {
                this._rerouteAll();
                this._labelUpdaters.forEach(fn => fn());
            });
        };
        this.editor.on("nodeMoved", scheduleReroute);
        this.editor.on("mouseMove", scheduleReroute);
    }

    /** Record and draw a reference connection. */
    draw(fromInstrOffset: string, toOffset: string, comment = ""): void {
        this._connections.push({ from: fromInstrOffset, to: toOffset, comment });
        this._drawOne(fromInstrOffset, toOffset, comment);
    }

    /**
     * Clear and re-draw all connections choosing the nearest port side for each.
     * Call after relayout() when node positions have changed.
     */
    rebuildConnections(): void {
        // Remove all connection SVGs
        this.container.querySelectorAll('.connection').forEach(el => el.remove());
        // Remove all ref-comment label divs
        this.container.querySelectorAll(`.${CSS_REF_COMMENT}`).forEach(el => el.remove());
        // Reset used-port indicators
        this.container.querySelectorAll(`.${CSS_USED}`).forEach(el => el.classList.remove(CSS_USED));
        // Clear drawflow internal connection model
        const data = (this.editor as any).drawflow.drawflow.Home.data as Record<string, any>;
        Object.values(data).forEach((node: any) => {
            Object.keys(node.inputs).forEach(k  => { node.inputs[k].connections  = []; });
            Object.keys(node.outputs).forEach(k => { node.outputs[k].connections = []; });
        });
        // Clear label updaters
        this._labelUpdaters.length = 0;
        // Re-draw with fresh port choices
        this._connections.forEach(c => this._drawOne(c.from, c.to, c.comment));
        this.scheduleReroute();
    }

    /** Draw one connection.
     * - Same column (|ΔX| < NODE_W/2): normal direction, U-curve routed outside both nodes.
     * - Different column: pick the nearer destination port (reversed if dst.right is closer).
     * Path is applied synchronously so it's correct on first paint.
     */
    private _drawOne(fromInstrOffset: string, toOffset: string, comment: string): void {
        const from = this.instrToPort.get(fromInstrOffset.toLowerCase());
        const to   = this.instrToPort.get(toOffset.toLowerCase());
        if (!from || !to) return;

        const outPort = from.inputPort;

        const srcEl = this.container.querySelector(`#node-${from.nodeId}`) as HTMLElement | null;
        const dstEl = this.container.querySelector(`#node-${to.nodeId}`)   as HTMLElement | null;
        const srcX  = srcEl ? (parseFloat(srcEl.style.left) || 0) : 0;
        const dstX  = dstEl ? (parseFloat(dstEl.style.left) || 0) : 0;

        // Nodes in the same column → use normal direction, route around the outside.
        // Different column → pick destination port closest to source output.
        const sameColumn = Math.abs(srcX - dstX) < NODE_W / 2;
        const srcOutX    = srcX + NODE_W;
        const distLeft   = Math.abs(srcOutX - dstX);
        const distRight  = Math.abs(srcOutX - (dstX + NODE_W));
        const reversed   = !sameColumn && distRight < distLeft;

        let svgSelector: string;
        this.suppress.connectionCreated = true;
        if (!reversed) {
            this.editor.addConnection(
                from.nodeId, to.nodeId,
                `${PORT_PREFIX_OUTPUT}${outPort}`,
                `${PORT_PREFIX_INPUT}${to.inputPort}`
            );
            this._markPort(from.nodeId, "output", outPort);
            this._markPort(to.nodeId,   "input",  to.inputPort);
            svgSelector =
                `.connection.${CSS_NODE_IN}${to.nodeId}.${CSS_NODE_OUT}${from.nodeId}` +
                `.${PORT_PREFIX_OUTPUT}${outPort}.${PORT_PREFIX_INPUT}${to.inputPort}`;
        } else {
            // Reversed: to.right → from.left  (drawflow only allows output→input)
            this.editor.addConnection(
                to.nodeId, from.nodeId,
                `${PORT_PREFIX_OUTPUT}${to.inputPort}`,
                `${PORT_PREFIX_INPUT}${outPort}`
            );
            this._markPort(to.nodeId,   "output", to.inputPort);
            this._markPort(from.nodeId, "input",  outPort);
            svgSelector =
                `.connection.${CSS_NODE_IN}${from.nodeId}.${CSS_NODE_OUT}${to.nodeId}` +
                `.${PORT_PREFIX_OUTPUT}${to.inputPort}.${PORT_PREFIX_INPUT}${outPort}`;
        }
        this.suppress.connectionCreated = false;

        const svg = this.container.querySelector(svgSelector) as SVGElement | null;
        if (svg) {
            svg.dataset.offsetA    = fromInstrOffset.toLowerCase();
            svg.dataset.offsetB    = toOffset.toLowerCase();
            svg.dataset.sameColumn = String(sameColumn);
            const path = svg.querySelector<SVGPathElement>(`.${CSS_MAIN_PATH}`);
            if (path) {
                path.addEventListener('contextmenu', (e: Event) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this._deleteConnection(fromInstrOffset.toLowerCase(), toOffset.toLowerCase());
                });
            }
            // Apply path synchronously — drawflow sets `d` inside addConnection, so it's ready now.
            this._reroutePath(svg);
            this.addRefCommentLabel(svg, comment, fromInstrOffset.toLowerCase(), toOffset.toLowerCase());
        }
    }

    /** Delete a connection and its reference entirely. */
    private _deleteConnection(offsetA: string, offsetB: string): void {
        // Remove from tracked list
        this._connections = this._connections.filter(
            c => !(c.from === offsetA && c.to === offsetB)
        );

        // Remove from documentation
        const decompiled = this.documentation.get();
        decompiled.references = decompiled.references.filter(
            r => !(r.offsetA === offsetA && r.offsetB === offsetB)
        );

        // Find the SVG and clean up drawflow's internal model
        const svg = this.container.querySelector<SVGElement>(
            `.connection[data-offset-a="${offsetA}"][data-offset-b="${offsetB}"]`
        );
        if (svg) {
            const nodeInClass  = [...svg.classList].find(c => c.startsWith(CSS_NODE_IN));
            const nodeOutClass = [...svg.classList].find(c => c.startsWith(CSS_NODE_OUT));
            const outClass     = [...svg.classList].find(c => c.startsWith(PORT_PREFIX_OUTPUT));
            const inClass      = [...svg.classList].find(c => c.startsWith(PORT_PREFIX_INPUT));

            if (nodeInClass && nodeOutClass && outClass && inClass) {
                const inputId  = nodeInClass.slice(CSS_NODE_IN.length);
                const outputId = nodeOutClass.slice(CSS_NODE_OUT.length);
                const data = (this.editor as any).drawflow.drawflow.Home.data as Record<string, any>;

                const outNode = data[outputId];
                if (outNode?.outputs?.[outClass]) {
                    outNode.outputs[outClass].connections =
                        outNode.outputs[outClass].connections.filter(
                            (c: any) => !(String(c.node) === inputId && c.output === inClass)
                        );
                    if (outNode.outputs[outClass].connections.length === 0)
                        this.container.querySelector(`#node-${outputId} .output.${outClass}`)?.classList.remove(CSS_USED);
                }
                const inNode = data[inputId];
                if (inNode?.inputs?.[inClass]) {
                    inNode.inputs[inClass].connections =
                        inNode.inputs[inClass].connections.filter(
                            (c: any) => !(String(c.node) === outputId && c.input === outClass)
                        );
                    if (inNode.inputs[inClass].connections.length === 0)
                        this.container.querySelector(`#node-${inputId} .input.${inClass}`)?.classList.remove(CSS_USED);
                }
            }
            svg.remove();
        }

        // Remove label div
        this.container.querySelector<HTMLElement>(
            `.${CSS_REF_COMMENT}[data-offset-a="${offsetA}"][data-offset-b="${offsetB}"]`
        )?.remove();
    }

    /** Re-apply routing to every connection + reposition all labels. */
    scheduleReroute(): void {
        requestAnimationFrame(() => {
            this._rerouteAll();
            this._labelUpdaters.forEach(fn => fn());
        });
    }

    /** Query the DOM fresh and reroute every connection. */
    private _rerouteAll(): void {
        this.container.querySelectorAll<SVGElement>('.connection').forEach(svg => {
            this._reroutePath(svg);
        });
    }

    /**
     * Overrides the drawflow bezier path with CFG-style routing.
     *
     * Same-column (svg.dataset.sameColumn=="true"):
     *   U-curve arcing to the RIGHT of both nodes — path never crosses through node bodies.
     *
     * Different-column:
     *   Inward S-curve — control points pulled toward the midpoint so path stays short.
     */
    private _reroutePath(svg: SVGElement): void {
        const path = svg.querySelector(`.${CSS_MAIN_PATH}`) as SVGPathElement | null;
        if (!path) return;
        const d = path.getAttribute('d');
        if (!d) return;

        // Drawflow path: " M x1 y1 C cx cy cx cy x2  y2" (leading space, no commas).
        const startM = d.match(/M\s*([-\d.e+]+)\s+([-\d.e+]+)/i);
        const endM   = d.match(/([-\d.e+]+)\s+([-\d.e+]+)\s*$/);
        if (!startM || !endM) return;

        const x1 = parseFloat(startM[1]), y1 = parseFloat(startM[2]);
        const x2 = parseFloat(endM[1]),   y2 = parseFloat(endM[2]);
        if ([x1, y1, x2, y2].some(isNaN)) return;

        const dx = x2 - x1;
        let newD: string;

        if (svg.dataset.sameColumn === 'true') {
            // U-curve to the RIGHT: both control points beyond the rightmost port.
            // This routes the connection cleanly outside both node bodies.
            const rightX = Math.max(x1, x2) + NODE_W * 0.7;
            newD = `M ${x1} ${y1} C ${rightX} ${y1} ${rightX} ${y2} ${x2} ${y2}`;
        } else {
            // Inward S-curve: control points pulled toward the centre.
            // Works for left→right (dx>0) and right→left (dx<0) without looping.
            const dir = dx >= 0 ? 1 : -1;
            const cpH = Math.max(Math.abs(dx) / 2, 60);
            newD = `M ${x1} ${y1} C ${x1 + dir * cpH} ${y1} ${x2 - dir * cpH} ${y2} ${x2} ${y2}`;
        }
        path.setAttribute('d', newD);
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

        // Append inside the inner canvas so pan/zoom moves the label automatically
        const innerCanvas = this.container.querySelector<HTMLElement>('.drawflow') ?? this.container;
        innerCanvas.appendChild(div);

        const reposition = () => {
            if (!svg.isConnected) { div.remove(); return; }
            const path = svg.querySelector(`.${CSS_MAIN_PATH}`) as SVGPathElement | null;
            if (!path) return;
            const len = path.getTotalLength();
            if (!len) return;
            const mid = path.getPointAtLength(len / 2);
            // mid.x/y are already in world-space (same coordinate system as node left/top)
            div.style.left    = `${mid.x}px`;
            div.style.top     = `${mid.y}px`;
            div.style.display = "";
        };

        this._labelUpdaters.push(reposition);
        requestAnimationFrame(reposition);
    }

    private _markPort(nodeId: number, side: "input" | "output", port: number): void {
        this.container
            .querySelector(`#node-${nodeId} .${side}.${side}_${port}`)
            ?.classList.add(CSS_USED);
    }

}
