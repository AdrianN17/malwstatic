/**
 * Minimap — bird's-eye view of the drawflow canvas.
 *
 * Reads node / connection positions directly from the DOM so it never needs
 * to be wired into drawflow's internal model.
 *
 * Click or drag on the minimap to pan the main canvas to that position.
 */
export class Minimap {
    private readonly _canvas: HTMLCanvasElement;
    private readonly _ctx:    CanvasRenderingContext2D;
    private readonly _df:     HTMLElement;   // drawflow container (#drawflow)
    private readonly _editor: any;           // drawflow instance (for zoom API)

    // Cached world-space projection from last render — used for click→pan
    private _sc  = 1;
    private _ox  = 0;
    private _oy  = 0;
    private _minX = 0;
    private _minY = 0;

    private _dragging = false;
    private _rafId: number | null = null;

    constructor(canvas: HTMLCanvasElement, container: HTMLElement, editor: any) {
        this._canvas = canvas;
        this._ctx    = canvas.getContext('2d')!;
        this._df     = container;
        this._editor = editor;

        canvas.addEventListener('mousedown', e => { this._dragging = true;  this._nav(e); });
        canvas.addEventListener('mousemove', e => { if (this._dragging) this._nav(e); });
        canvas.addEventListener('mouseup',   () => { this._dragging = false; });
        canvas.addEventListener('mouseleave',() => { this._dragging = false; });

        this._loop();
    }

    destroy(): void {
        if (this._rafId !== null) cancelAnimationFrame(this._rafId);
    }

    private _loop(): void {
        this._render();
        this._rafId = requestAnimationFrame(() => this._loop());
    }

    // ── Viewport helpers ──────────────────────────────────────────────────────

    private _getTransform(): { tx: number; ty: number; zoom: number } {
        const cvs = this._df.querySelector<HTMLElement>('.drawflow');
        if (!cvs) return { tx: 0, ty: 0, zoom: 1 };
        const t   = cvs.style.transform ?? '';
        const tM  = t.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
        const sM  = t.match(/scale\(([-\d.]+)\)/);
        return {
            tx:   tM ? parseFloat(tM[1]) : 0,
            ty:   tM ? parseFloat(tM[2]) : 0,
            zoom: sM ? parseFloat(sM[1]) : 1,
        };
    }

    // ── Render ────────────────────────────────────────────────────────────────

    private _render(): void {
        const W   = this._canvas.width;
        const H   = this._canvas.height;
        const ctx = this._ctx;

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#1a1b18';
        ctx.fillRect(0, 0, W, H);

        // Collect visible node elements
        const nodes = Array.from(
            this._df.querySelectorAll<HTMLElement>('.drawflow-node')
        ).filter(el => el.style.display !== 'none');

        if (nodes.length === 0) return;

        // World-space bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodes.forEach(el => {
            const x = parseFloat(el.style.left) || 0;
            const y = parseFloat(el.style.top)  || 0;
            const w = el.offsetWidth  || 600;
            const h = el.offsetHeight || 120;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x + w > maxX) maxX = x + w;
            if (y + h > maxY) maxY = y + h;
        });

        const pad   = 60;
        minX -= pad; minY -= pad; maxX += pad; maxY += pad;
        const totalW = maxX - minX;
        const totalH = maxY - minY;

        const sc = Math.min(W / totalW, H / totalH);
        const ox = (W - totalW * sc) / 2;
        const oy = (H - totalH * sc) / 2;

        // Cache for click→nav
        this._sc   = sc;
        this._ox   = ox;
        this._oy   = oy;
        this._minX = minX;
        this._minY = minY;

        const toM = (wx: number, wy: number) => ({
            x: (wx - minX) * sc + ox,
            y: (wy - minY) * sc + oy,
        });

        // ── Connections (simplified straight lines) ──
        ctx.strokeStyle = 'rgba(174,129,255,0.5)';
        ctx.lineWidth   = 1;
        this._df.querySelectorAll<SVGPathElement>('.connection .main-path').forEach(p => {
            const d  = p.getAttribute('d');
            if (!d) return;
            const sM = d.match(/M\s*([-\d.e+]+)\s+([-\d.e+]+)/i);
            const eM = d.match(/([-\d.e+]+)\s+([-\d.e+]+)\s*$/);
            if (!sM || !eM) return;
            const s = toM(parseFloat(sM[1]), parseFloat(sM[2]));
            const e = toM(parseFloat(eM[1]), parseFloat(eM[2]));
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(e.x, e.y);
            ctx.stroke();
        });

        // ── Nodes ──
        nodes.forEach(el => {
            const x  = parseFloat(el.style.left) || 0;
            const y  = parseFloat(el.style.top)  || 0;
            const w  = el.offsetWidth;
            const h  = el.offsetHeight;
            const m  = toM(x, y);
            const mw = w * sc;
            const mh = h * sc;

            const pinned      = el.classList.contains('pinned');
            const highlighted = el.classList.contains('node-highlighted');

            ctx.fillStyle   = pinned ? '#302f25' : highlighted ? '#2d2620' : '#2d2e2a';
            ctx.strokeStyle = pinned ? '#e6db74' : highlighted ? '#fd971f' : '#49483e';
            ctx.lineWidth   = pinned ? 1.5 : 1;

            const r = Math.max(1, 3 * sc);
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(m.x, m.y, mw, mh, r);
            } else {
                ctx.rect(m.x, m.y, mw, mh);
            }
            ctx.fill();
            ctx.stroke();

            // Node label (only if big enough)
            if (mw > 20) {
                const nameEl = el.querySelector<HTMLElement>('strong');
                if (nameEl) {
                    ctx.fillStyle   = pinned ? '#e6db74' : '#a6e22e';
                    ctx.font        = `${Math.max(6, Math.min(9, mw / 8))}px sans-serif`;
                    ctx.textBaseline = 'top';
                    ctx.fillText(
                        nameEl.textContent ?? '',
                        m.x + 2,
                        m.y + 2,
                        mw - 4
                    );
                }
            }
        });

        // ── Viewport indicator ──
        const { tx, ty, zoom } = this._getTransform();
        const cw = this._df.offsetWidth;
        const ch = this._df.offsetHeight;
        const vx = -tx / zoom;
        const vy = -ty / zoom;
        const vw =  cw / zoom;
        const vh =  ch / zoom;
        const vm  = toM(vx, vy);
        const vmw = vw * sc;
        const vmh = vh * sc;

        ctx.fillStyle   = 'rgba(166,226,46,0.07)';
        ctx.strokeStyle = '#a6e22e';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.rect(vm.x, vm.y, vmw, vmh);
        ctx.fill();
        ctx.stroke();
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    /** Pan the main canvas so the clicked world position is centred in the viewport. */
    private _nav(e: MouseEvent): void {
        const rect  = this._canvas.getBoundingClientRect();
        const mx    = e.clientX - rect.left;
        const my    = e.clientY - rect.top;

        // minimap → world
        const wx = (mx - this._ox) / this._sc + this._minX;
        const wy = (my - this._oy) / this._sc + this._minY;

        const { zoom } = this._getTransform();
        const cw = this._df.offsetWidth;
        const ch = this._df.offsetHeight;

        // Centre the world point in the viewport
        const newTx = cw / 2 - wx * zoom;
        const newTy = ch / 2 - wy * zoom;

        this._applyTransform(newTx, newTy, zoom);
    }

    private _applyTransform(tx: number, ty: number, zoom: number): void {
        const cvs = this._df.querySelector<HTMLElement>('.drawflow');
        if (!cvs) return;
        cvs.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom})`;
        this._editor.canvas_x        = tx;
        this._editor.canvas_y        = ty;
        this._editor.zoom_last_value = zoom;
    }
}

// ── Standalone navigation helpers (fit-to-view, reset zoom) ──────────────────

export function fitToView(container: HTMLElement, editor: any): void {
    const nodes = Array.from(
        container.querySelectorAll<HTMLElement>('.drawflow-node')
    ).filter(el => el.style.display !== 'none');

    if (nodes.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(el => {
        const x = parseFloat(el.style.left) || 0;
        const y = parseFloat(el.style.top)  || 0;
        const w = el.offsetWidth  || 600;
        const h = el.offsetHeight || 120;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x + w > maxX) maxX = x + w;
        if (y + h > maxY) maxY = y + h;
    });

    const pad  = 60;
    const cw   = container.offsetWidth;
    const ch   = container.offsetHeight;
    const zoom = Math.min(
        (cw - pad * 2) / (maxX - minX),
        (ch - pad * 2) / (maxY - minY),
        1   // never zoom IN beyond 100 %
    );
    const tx = cw / 2 - ((minX + maxX) / 2) * zoom;
    const ty = ch / 2 - ((minY + maxY) / 2) * zoom;

    const cvs = container.querySelector<HTMLElement>('.drawflow');
    if (!cvs) return;
    cvs.style.transform      = `translate(${tx}px, ${ty}px) scale(${zoom})`;
    editor.canvas_x          = tx;
    editor.canvas_y          = ty;
    editor.zoom_last_value   = zoom;
}

export function resetZoom(container: HTMLElement, editor: any): void {
    const cvs = container.querySelector<HTMLElement>('.drawflow');
    if (!cvs) return;
    cvs.style.transform    = 'translate(0px, 0px) scale(1)';
    editor.canvas_x        = 0;
    editor.canvas_y        = 0;
    editor.zoom_last_value = 1;
}
