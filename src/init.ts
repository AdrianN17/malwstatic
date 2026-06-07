import { ExportYAML } from "./export/exportYAML";
import { ImportYAML } from "./import/importYAML";
import { initRizin } from "./rizin";
import { Documentation } from "./documentation/documentation";
import { Node} from "./node/node";

initRizin((pe, filename) => {
    const yaml = ExportYAML.export(pe);
    console.log("downloading yaml...");
    ExportYAML.download(`${filename}.yaml`, yaml);
});

let node: Node | null = null;

const yamlFileInput = document.getElementById("yamlFileInput") as HTMLInputElement;
yamlFileInput.addEventListener("change", async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const text = await file.text();
    const decompiled = ImportYAML.import(text);
    const documentation = new Documentation(decompiled);
    node = new Node(documentation);
    node.draw();
});

document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        if (!node) return;
        console.log(node);
    }
});