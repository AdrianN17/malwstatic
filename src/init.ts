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

const yamlFileInput = document.getElementById("yamlFileInput") as HTMLInputElement;
yamlFileInput.addEventListener("change", async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const text = await file.text();
    const decompiled = ImportYAML.import(text);
    const documentation = new Documentation(decompiled);
    const node = new Node(documentation);
    node.draw();
});