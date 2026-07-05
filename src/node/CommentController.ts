import { Documentation } from "../documentation/documentation";
import { FunctionReader, InstructionReader } from "../structure/decompiledReader";
import { CSS_INSTR_COMMENT, CSS_FUNC_COMMENT, COMMENT_COLOR } from "./NodeConstants";
import { UndoHistory } from "../undoHistory";

const TOOLTIP_ID = "malw-comment-tooltip";

export class CommentController {

    constructor(
        private readonly container: HTMLElement,
        private readonly instrByOffset: Map<string, InstructionReader>,
        private readonly documentation: Documentation,
        private readonly history: UndoHistory,
    ) {}

    setup(): AbortController {
        const controller = new AbortController();
        const { signal } = controller;

        let _editEl: HTMLElement | null = null;
        let _editBefore = "";

        this.container.addEventListener("focusin", (e) => {
            const t = e.target as HTMLElement;
            if (t.classList.contains(CSS_INSTR_COMMENT) || t.classList.contains(CSS_FUNC_COMMENT)) {
                _editEl = t;
                _editBefore = t.textContent ?? "";
            }
        }, { signal });

        this.container.addEventListener("focusout", () => {
            if (!_editEl) return;
            const el = _editEl;
            const before = _editBefore;
            _editEl = null;
            _editBefore = "";
            const after = el.textContent ?? "";
            if (after === before) return;
            const decomp = this.documentation.get();
            let applyFn: (text: string) => void;
            if (el.classList.contains(CSS_INSTR_COMMENT)) {
                const instr = this.instrByOffset.get(el.dataset.offset!);
                applyFn = text => { el.textContent = text; if (instr) instr.comment = text; };
            } else {
                const func = decomp.functions.find(
                    f => f.offset.toLowerCase() === el.dataset.offset!
                ) as FunctionReader | undefined;
                applyFn = text => { el.textContent = text; if (func) func.comments = text; };
            }
            this.history.push({ undo: () => applyFn(before), redo: () => applyFn(after) });
        }, { signal });

        this.container.addEventListener("input", (e) => {
            const target = e.target as HTMLElement;
            const decomp = this.documentation.get();

            if (target.classList.contains(CSS_INSTR_COMMENT)) {
                const instr = this.instrByOffset.get(target.dataset.offset!);
                if (instr) instr.comment = target.textContent ?? "";
            } else if (target.classList.contains(CSS_FUNC_COMMENT)) {
                const func = decomp.functions.find(
                    f => f.offset.toLowerCase() === target.dataset.offset!
                ) as FunctionReader | undefined;
                if (func) func.comments = target.textContent ?? "";
            }
        }, { signal });

        this._setupTooltip(signal);

        return controller;
    }

    private _setupTooltip(signal: AbortSignal): void {
        let tooltip = document.getElementById(TOOLTIP_ID) as HTMLElement | null;
        if (!tooltip) {
            tooltip = document.createElement("div");
            tooltip.id = TOOLTIP_ID;
            tooltip.style.cssText =
                `position:fixed;z-index:9999;background:#272822;color:${COMMENT_COLOR};` +
                `border:1px solid rgba(230,219,116,0.45);border-radius:4px;padding:3px 10px;` +
                `font-size:12px;font-style:italic;pointer-events:none;display:none;` +
                `font-family:'Segoe UI',system-ui,sans-serif;` +
                `box-shadow:0 4px 14px rgba(0,0,0,0.65);white-space:pre;`;
            document.body.appendChild(tooltip);
        }

        this.container.addEventListener("mouseover", (e) => {
            const t = e.target as HTMLElement;
            if ((t.classList.contains(CSS_INSTR_COMMENT) || t.classList.contains(CSS_FUNC_COMMENT))
                    && t.scrollWidth > t.clientWidth && t.textContent) {
                tooltip!.textContent = t.textContent;
                const r = t.getBoundingClientRect();
                tooltip!.style.left = r.left + "px";
                tooltip!.style.top  = (r.bottom + 5) + "px";
                tooltip!.style.display = "block";
            }
        }, { signal });

        this.container.addEventListener("mouseout", (e) => {
            const t = e.target as HTMLElement;
            if (t.classList.contains(CSS_INSTR_COMMENT) || t.classList.contains(CSS_FUNC_COMMENT))
                tooltip!.style.display = "none";
        }, { signal });

        this.container.addEventListener("mousedown", () => {
            tooltip!.style.display = "none";
        }, { signal });
    }

}
