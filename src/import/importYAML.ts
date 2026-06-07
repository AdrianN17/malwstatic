import { DecompiledPEReader, FunctionDecompiledReader, InstructionDecompiledReader } from "../structure/decompiledReader";
import YAML from 'yaml';

export class ImportYAML {
    public static import(yamlText: string): DecompiledPEReader {
        const parsed = YAML.parse(yamlText);

        const decompiledPE = new DecompiledPEReader(0, parsed.comment ?? "");

        for (const func of parsed.functions ?? []) {
            const fn = new FunctionDecompiledReader(func.name ?? "", func.offset ?? "", func.comments ?? "");
            for (const instr of func.Instructions ?? []) {
                fn.Instructions.push(new InstructionDecompiledReader(instr.offset ?? "", instr.opcode ?? "", instr.comment ?? ""));
            }
            decompiledPE.add(fn);
        }

        return decompiledPE;
    }
}
