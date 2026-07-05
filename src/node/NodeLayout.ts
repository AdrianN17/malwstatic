import { DecompiledReader } from "../structure/decompiledReader";
import {
    NODE_W, NODE_GAP, ROW, NODE_PADDING,
    LAYOUT_ORIGIN_X, LAYOUT_ORIGIN_Y, CFG_MAX_COLS,
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

        // Override with saved positions when available
        decompiled.functions.forEach(f => {
            if (f.x !== 0 || f.y !== 0) {
                positions.set(f.offset.toLowerCase(), { x: f.x, y: f.y });
            }
        });

        return positions;
    }

    computeFromMain(decompiled: DecompiledReader): Map<string, { x: number; y: number }> {
        const mainFunc = decompiled.functions.find(f => f.isMain);
        if (!mainFunc) return this.compute(decompiled);

        // Build call graph (func → func edges)
        const instrToFunc = new Map<string, string>();
        decompiled.functions.forEach(func =>
            func.Instructions.forEach(instr =>
                instrToFunc.set(instr.offset.toLowerCase(), func.offset.toLowerCase())
            )
        );

        const outEdges = new Map<string, Set<string>>();
        decompiled.functions.forEach(func => outEdges.set(func.offset.toLowerCase(), new Set()));
        decompiled.references.forEach(ref => {
            const src = instrToFunc.get(ref.offsetA.toLowerCase());
            const dst = instrToFunc.get(ref.offsetB.toLowerCase());
            if (!src || !dst || src === dst || outEdges.get(src)!.has(dst)) return;
            outEdges.get(src)!.add(dst);
        });

        // BFS from main to assign levels
        const mainOffset = mainFunc.offset.toLowerCase();
        const levels = new Map<string, number>();
        levels.set(mainOffset, 0);
        const queue = [mainOffset];
        for (let i = 0; i < queue.length; i++) {
            outEdges.get(queue[i])?.forEach(dst => {
                if (!levels.has(dst)) {
                    levels.set(dst, levels.get(queue[i])! + 1);
                    queue.push(dst);
                }
            });
        }

        // Separate reachable from unreachable
        const unreachable = decompiled.functions.filter(f => !levels.has(f.offset.toLowerCase()));

        // Group reachable by level
        const byLevel = new Map<number, string[]>();
        decompiled.functions.forEach(f => {
            if (!levels.has(f.offset.toLowerCase())) return;
            const lvl = levels.get(f.offset.toLowerCase())!;
            if (!byLevel.has(lvl)) byLevel.set(lvl, []);
            byLevel.get(lvl)!.push(f.offset.toLowerCase());
        });

        const funcMap = new Map(decompiled.functions.map(f => [f.offset.toLowerCase(), f]));
        const nodeH = (off: string) => (funcMap.get(off)!.Instructions.length + 1) * ROW + NODE_PADDING;

        // Expand each level into wrapped rows of max CFG_MAX_COLS nodes
        // Each entry: { offsets[], y, rowHeight }
        const rows: { offsets: string[]; y: number; rowH: number }[] = [];
        const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);
        let curY = LAYOUT_ORIGIN_Y;
        for (const lvl of sortedLevels) {
            const all = byLevel.get(lvl)!;
            for (let i = 0; i < all.length; i += CFG_MAX_COLS) {
                const chunk = all.slice(i, i + CFG_MAX_COLS);
                const rowH = Math.max(...chunk.map(nodeH));
                rows.push({ offsets: chunk, y: curY, rowH });
                curY += rowH + NODE_GAP * 2;
            }
        }

        // Centered X axis based on max row width (capped by CFG_MAX_COLS)
        const maxRowWidth = CFG_MAX_COLS * NODE_W + (CFG_MAX_COLS - 1) * NODE_GAP;
        const centerX = LAYOUT_ORIGIN_X + maxRowWidth / 2;

        const positions = new Map<string, { x: number; y: number }>();
        rows.forEach(({ offsets, y }) => {
            const rowWidth = offsets.length * NODE_W + (offsets.length - 1) * NODE_GAP;
            let x = centerX - rowWidth / 2;
            offsets.forEach(off => {
                positions.set(off, { x: Math.round(x), y: Math.round(y) });
                x += NODE_W + NODE_GAP;
            });
        });

        // Unreachable nodes: stacked to the right of the CFG
        const cfgMaxX = LAYOUT_ORIGIN_X + maxRowWidth + NODE_GAP * 2;
        let unreachableY = LAYOUT_ORIGIN_Y;
        unreachable.forEach(f => {
            positions.set(f.offset.toLowerCase(), { x: Math.round(cfgMaxX), y: Math.round(unreachableY) });
            unreachableY += (f.Instructions.length + 1) * ROW + NODE_PADDING + NODE_GAP;
        });

        return positions;
    }

}
