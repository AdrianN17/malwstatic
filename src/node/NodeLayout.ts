import { DecompiledReader } from "../structure/decompiledReader";
import {
    NODE_W, NODE_GAP, ROW, NODE_PADDING,
    LAYOUT_ORIGIN_X, LAYOUT_ORIGIN_Y,
} from "./NodeConstants";

export class NodeLayout {

    compute(decompiled: DecompiledReader): Map<string, { x: number; y: number }> {
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

        decompiled.references.forEach(ref => {
            const src = instrToFuncOffset.get(ref.offsetA.toLowerCase());
            const dst = instrToFuncOffset.get(ref.offsetB.toLowerCase());
            if (!src || !dst || src === dst || outEdges.get(src)!.has(dst)) return;
            outEdges.get(src)!.add(dst);
            inDegree.set(dst, inDegree.get(dst)! + 1);
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

}
