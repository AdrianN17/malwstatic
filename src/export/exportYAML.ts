import { Decompiled, Reference, Function, Instruction } from "../structure/decompiledGeneric";
import YAML from 'yaml';

export class ExportYAML {
    public static export(decompiled: Decompiled<Reference, Function<Instruction>>): string {
        return YAML.stringify(decompiled);
    }

    public static download(filename: string, content: string): void {
        const blob = new Blob([content], { type: "text/yaml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    public static async openFilePicker(): Promise<{ handle: any; file: File } | null> {
        if (!("showOpenFilePicker" in window)) return null;
        try {
            const [handle] = await (window as any).showOpenFilePicker({
                types: [{ description: "YAML", accept: { "text/yaml": [".yaml", ".yml"] } }],
                multiple: false,
            });
            const file: File = await handle.getFile();
            return { handle, file };
        } catch {
            return null;
        }
    }

    public static async saveToHandle(handle: any, content: string): Promise<void> {
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
    }
}