export interface Command {
    undo(): void;
    redo(): void;
}

export class UndoHistory {
    private _undo: Command[] = [];
    private _redo: Command[] = [];

    push(cmd: Command): void {
        this._undo.push(cmd);
        this._redo = [];
    }

    undo(): void {
        const cmd = this._undo.pop();
        if (!cmd) return;
        cmd.undo();
        this._redo.push(cmd);
    }

    redo(): void {
        const cmd = this._redo.pop();
        if (!cmd) return;
        cmd.redo();
        this._undo.push(cmd);
    }

    clear(): void {
        this._undo = [];
        this._redo = [];
    }
}
