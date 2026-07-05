import { DecompiledReader, FunctionReader, InstructionReader, ReferenceReader } from "../structure/decompiledReader";
import YAML from 'yaml';

export class ImportYAML {
    public static import(yamlText: string): DecompiledReader {
        const parsed = YAML.parse(yamlText);

        const decompiled = new DecompiledReader(parsed.comment ?? "", parsed.x ?? 0, parsed.y ?? 0, parsed.zoom ?? 1);

        for (const func of parsed.functions ?? []) {
            const fn = new FunctionReader(func.name ?? "", func.offset ?? "", func.comments ?? "", func.x ?? 0, func.y ?? 0, func.visible ?? true, func.isMain ?? false, func.isHighlighted ?? false);
            for (const instr of func.Instructions ?? []) {
                fn.Instructions.push(new InstructionReader(instr.offset ?? "", instr.opcode ?? "", instr.comment ?? "", instr.isHighlighted ?? false));
            }
            decompiled.add(fn);
        }

        for (const ref of parsed.references ?? []) {
            decompiled.references.push(new ReferenceReader(ref.offsetA ?? "", ref.offsetB ?? "", ref.comment ?? ""));
        }

        return decompiled;
    }
}
