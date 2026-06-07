import Drawflow from "drawflow";
import { Documentation } from "../documentation/documentation";

const POS_X = 100;
const POS_Y = 100;
const INDEX_OFFSET = 150;
const ROW = 19;

export class Node {

    documentation: Documentation;

    constructor(documentation: Documentation) {
        this.documentation = documentation;
    }

    draw(): void {
        const container = document.getElementById("drawflow") as HTMLElement;
        const editor = new Drawflow(container);
        editor.start();

        const decompiled = this.documentation.get();
        decompiled.calculateReference();

        const offsetToNodeId = new Map<string, number>();
        const instrToPort = new Map<string, { nodeId: number; inputPort: number }>();

        decompiled.functions.forEach((func, index) => {
            const pos_x = POS_X;
            const pos_y = POS_Y + index * INDEX_OFFSET;
            const row = (content: string, style = "") =>
                `<div style="height:${ROW}px;line-height:${ROW}px;box-sizing:border-box;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${style}">${content}</div>`;
            const headerRow = row(`<strong>${func.name}</strong>`, "border-bottom:1px solid #555;");
            const instructionRows = func.Instructions
                .map(instr => row(`<span>${instr.offset}</span> <span>${instr.opcode}</span>`))
                .join("");
            const html = `<div class="node-content">${headerRow}${instructionRows}</div>`;
            const nodeId = editor.addNode(func.name, func.Instructions.length + 1, func.Instructions.length + 1, pos_x, pos_y, "node", {}, html);
            offsetToNodeId.set(func.offset.toLowerCase(), nodeId);
            func.Instructions.forEach((instr, i) =>
                instrToPort.set(instr.offset.toLowerCase(), { nodeId, inputPort: i + 2 })
            );
        });

        decompiled.functions.forEach(func => {
            const sourceId = offsetToNodeId.get(func.offset.toLowerCase());
            if (!sourceId) return;
            func.Instructions.forEach((instr, instrIndex) => {
                if (!instr.reference) return;
                const target = instrToPort.get(instr.reference.toLowerCase());
                if (!target) return;
                const outputPort = instrIndex + 2;
                editor.addConnection(sourceId, target.nodeId, `output_${outputPort}`, `input_${target.inputPort}`);
            });
        });
    }

}