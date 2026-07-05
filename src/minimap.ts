// ── Types ─────────────────────────────────────────────────────────────────────

interface NodeInfo {
    x: number; y: number; w: number; h: number;
    pinned: boolean; highlighted: boolean; label: string;
}
interface ConnInfo { x1: number; y1: number; x2: number; y2: number; }

/**
 * Minimap — bird's-eye view of the drawflow canvas.
 *
 * DOM reads (querySelectorAll, offsetWidth) are cached and only refreshed
 * every CACHE_MS ms; renders are skipped when nothing changed.
 */
export class Minimap {
    private static readonly CACHE_MS = 120; // how often to re-scan DOM for nodes/paths

    private readonly _canvas: HTMLCanvasElement;
    private readonly _ctx:    CanvasRenderingContext2D;
    private readonly _df:     HTMLElement;
    private readonly _editor: any;
    private readonly _inner:  HTMLElement; // cached .drawflow element

    // World-space projection (updated on full render)
    private _sc   = 1;
    private _ox   = 0;
    private _oy   = 0;
    private _minX = 0;
    private _minY = 0;

    // Cached canvas viewport size (rarely changes)
    private _dfW  = 0;
    private _dfH  = 0;

    // Cached transform
    private _tx   = 0;
    private _ty   = 0;
    private _zoom = 1;

    // Cached node / connection geometry (rebuilt every CACHE_MS)
    private _nodes: NodeInfo[] = [];
    private _conns: ConnInfo[] = [];
    private _lastCacheTime = 0;

    private _dragging  = false;
    private _navPending: MouseEvent | null = null;
    private _dirty     = true;
    private _rafId: number | null = null;

    constructor(canvas: HTMLCanvasElement, container: HTMLElement, editor: any) {
        this._canvas = canvas;
        this._ctx    = canvas.getContext('2d')!;
        this._df     = container;
        this._editor = editor;
        this._inner  = container.querySelector<HTMLElement>('.drawflow')!;
        this._dfW    = container.offsetWidth;
        this._dfH    = container.offsetHeight;

        canvas.addEventListener('mousedown', e => { this._dragging = true;  this._queueNav(e); });
        canvas.addEventListener('mousemove', e => { if (this._dragging) this._queueNav(e); });
        canvas.addEventListener('mouseup',   () => { this._dragging = false; });
        canvas.addEventListener('mouseleave',() => { this._dragging = false; });

        this._loop();
    }

    destroy(): void {
        if (this._rafId !== null) cancelAnimationFrame(this._rafId);
    }

    // ── RAF loop ──────────────────────────────────────────────────────────────

    private _loop(): void {
        // Flush pending nav first (no DOM-read, just apply transform)
        if (this._navPending) {
            this._execNav(this._navPending);
            this._navPending = null;
            this._dirty = true;
        }

        if (this._dirty) {
            this._render();
            this._dirty = false;
        }

        this._rafId = requestAnimationFrame(() => this._loop());
    }

    // ── Cache rebuild ─────────────────────────────────────────────────────────

    /** Re-reads the DOM. Called at most once per CACHE_MS. */
    private _rebuildCache(): void {
        this._lastCacheTime = performance.now();

        const nodeEls = Array.from(
            this._df.querySelectorAll<HTMLElement>('.drawflow-node')
        ).filter(el => el.style.display !== 'none');

        // Read all offsetWidth/offsetHeight in one pass (triggers single layout)
        this._nodes = nodeEls.map(el => ({
            x:           parseFloat(el.style.left) || 0,
            y:           parseFloat(el.style.top)  || 0,
            w:           el.offsetWidth  || 600,
            h:           el.offsetHeight || 120,
            pinned:      el.classList.contains('pinned'),
            highlighted: el.classList.contains('node-highlighted'),
            label:       el.querySelector<HTMLElement>('strong')?.textContent ?? '',
        }));

        this._conns = [];
        this._df.querySelectorAll<SVGPathElement>('.connection .main-path').forEach(p => {
            const d = p.getAttribute('d');
            if (!d) return;
            const sM = d.match(/M\s*([-\d.e+]+)\s+([-\d.e+]+)/i);
            const eM = d.match(/([-\d.e+]+)\s+([-\d.e+]+)\s*$/);
            if (!sM || !eM) return;
            this._conns.push({
                x1: parseFloat(sM[1]), y1: parseFloat(sM[2]),
                x2: parseFloat(eM[1]), y2: parseFloat(eM[2]),
            });
        });

        // Also refresh container size (cheap)
        this._dfW = this._df.offsetWidth;
        this._dfH = this._df.offsetHeight;
    }

    /** Read current CSS transform from the cached inner element. */
    private _readTransform(): void {
        const t  = this._inner.style.transform ?? '';
        const tM = t.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
        const sM = t.match(/scale\(([-\d.]+)\)/);
        this._tx   = tM ? parseFloat(tM[1]) : 0;
        this._ty   = tM ? parseFloat(tM[2]) : 0;
        this._zoom = sM ? parseFloat(sM[1]) : 1;
    }

    // ── Render ────────────────────────────────────────────────────────────────

    private _render(): void {
        const now = performance.now();
        if (now - this._lastCacheTime > Minimap.CACHE_MS) this._rebuildCache();

        this._readTransform();

        const W   = this._canvas.width;
        const H   = this._canvas.height;
        const ctx = this._ctx;

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#1a1b18';
        ctx.fillRect(0, 0, W, H);

        if (this._nodes.length === 0) return;

        // World-space bounding box (from cache — no DOM access)
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const n of this._nodes) {
            if (n.x         < minX) minX = n.x;
            if (n.y         < minY) minY = n.y;
            if (n.x + n.w   > maxX) maxX = n.x + n.w;
            if (n.y + n.h   > maxY) maxY = n.y + n.h;
        }
        const pad    = 60;
        minX -= pad; minY -= pad; maxX += pad; maxY += pad;
        const totalW = maxX - minX;
        const totalH = maxY - minY;

        const sc = Math.min(W / totalW, H / totalH);
        const ox = (W - totalW * sc) / 2;
        const oy = (H - totalH * sc) / 2;

        this._sc = sc; this._ox = ox; this._oy = oy;
        this._minX = minX; this._minY = minY;

        const toMx = (wx: number) => (wx - minX) * sc + ox;
        const toMy = (wy: number) => (wy - minY) * sc + oy;

        // ── Connections ──
        ctx.strokeStyle = 'rgba(174,129,255,0.5)';
        ctx.lineWidth   = 1;
        for (const c of this._conns) {
            ctx.beginPath();
            ctx.moveTo(toMx(c.x1), toMy(c.y1));
            ctx.lineTo(toMx(c.x2), toMy(c.y2));
            ctx.stroke();
        }

        // ── Nodes ──
        const r = Math.max(1, 3 * sc);
        for (const n of this._nodes) {
            const mx = toMx(n.x);
            const my = toMy(n.y);
            const mw = n.w * sc;
            const mh = n.h * sc;

            ctx.fillStyle   = n.pinned ? '#302f25' : n.highlighted ? '#2d2620' : '#2d2e2a';
            ctx.strokeStyle = n.pinned ? '#e6db74' : n.highlighted ? '#fd971f' : '#49483e';
            ctx.lineWidth   = n.pinned ? 1.5 : 1;

            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(mx, my, mw, mh, r);
            else               ctx.rect(mx, my, mw, mh);
            ctx.fill();
            ctx.stroke();

            if (mw > 20 && n.label) {
                ctx.fillStyle    = n.pinned ? '#e6db74' : '#a6e22e';
                ctx.font         = `${Math.max(6, Math.min(9, mw / 8))}px sans-serif`;
                ctx.textBaseline = 'top';
                ctx.fillText(n.label, mx + 2, my + 2, mw - 4);
            }
        }

        // ── Viewport indicator ──
        const vx  = -this._tx / this._zoom;
        const vy  = -this._ty / this._zoom;
        const vw  =  this._dfW / this._zoom;
        const vh  =  this._dfH / this._zoom;

        ctx.fillStyle   = 'rgba(166,226,46,0.07)';
        ctx.strokeStyle = '#a6e22e';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.rect(toMx(vx), toMy(vy), vw * sc, vh * sc);
        ctx.fill();
        ctx.stroke();
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    /** Queue a nav event; executed once per rAF to avoid redundant DOM writes. */
    private _queueNav(e: MouseEvent): void {
        this._navPending = e;
    }

    private _execNav(e: MouseEvent): void {
        const rect = this._canvas.getBoundingClientRect();
        const wx   = (e.clientX - rect.left  - this._ox) / this._sc + this._minX;
        const wy   = (e.clientY - rect.top   - this._oy) / this._sc + this._minY;

        const newTx = this._dfW / 2 - wx * this._zoom;
        const newTy = this._dfH / 2 - wy * this._zoom;

        this._applyTransform(newTx, newTy, this._zoom);
    }

    private _applyTransform(tx: number, ty: number, zoom: number): void {
        this._inner.style.transform   = `translate(${tx}px, ${ty}px) scale(${zoom})`;
        this._editor.canvas_x         = tx;
        this._editor.canvas_y         = ty;
        this._editor.zoom_last_value  = zoom;
        // Sync cached values immediately so next render uses them
        this._tx = tx; this._ty = ty; this._zoom = zoom;
    }

    /** Force a cache refresh + redraw (call after programmatic canvas moves). */
    markDirty(): void {
        this._lastCacheTime = 0;
        this._dirty = true;
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
