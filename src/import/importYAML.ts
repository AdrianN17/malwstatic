import { DecompiledReader, FunctionReader, InstructionReader, ReferenceReader } from "../structure/decompiledReader";
import YAML from 'yaml';

export class ImportYAML {
    public static import(yamlText: string): DecompiledReader {
        const parsed = YAML.parse(yamlText);

        const decompiled = new DecompiledReader(parsed.comment ?? "");

        for (const func of parsed.functions ?? []) {
            const fn = new FunctionReader(func.name ?? "", func.offset ?? "", func.comments ?? "");
            for (const instr of func.Instructions ?? []) {
                fn.Instructions.push(new InstructionReader(instr.offset ?? "", instr.opcode ?? "", instr.comment ?? ""));
            }
            decompiled.add(fn);
        }

        for (const ref of parsed.references ?? []) {
            decompiled.references.push(new ReferenceReader(ref.offsetA ?? "", ref.offsetB ?? "", ref.comment ?? ""));
        }

        return decompiled;
    }
}
