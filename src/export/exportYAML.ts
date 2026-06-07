import { DecompiledPE } from "../structure/decompiledPE.js";

export class ExportYAML {
    public static export(decompiledPE: DecompiledPE): string {
        let yaml = "functions:\n";

        for (const func of decompiledPE.functions) {
            yaml += `  - name: ${func.name}\n`;
            yaml += `    offset: "${func.offset}"\n`;
            yaml += `    instructions:\n`;

            func.Instructions.forEach(instr => {
                yaml += `      - offset: "${instr.offset}"\n`;
                yaml += `        opcode: "${instr.opcode}"\n`;
            });
        }

        return yaml;
    }

    public static download(filename: string, content: string) {
        const blob = new Blob([content], { type: "text/yaml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
}