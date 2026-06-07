import { DecompiledPE } from "../structure/decompiledPE";
import YAML from 'yaml';

export class ExportYAML {
    public static export(decompiledPE: DecompiledPE): string {

        const yaml = YAML.stringify(decompiledPE);
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