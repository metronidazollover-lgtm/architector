// Пространственная миникарта текущего уровня (этап 4.2 плана).
// Рисуется на <canvas>: дёшево перерисовывать при панораме. Показывает bbox контента
// текущего контекста и рамку вьюпорта; drag по карте = панорама холста.
// Узлы с детьми помечены акцентной точкой — рекурсия видна и здесь.
function MiniMap() {
    const { state, dispatch } = useStore();
    const canvasRef = React.useRef(null);
    const transformRef = React.useRef(null);
    const W = 256, H = 150;

    const { offset, zoom } = state.canvas;

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, W, H);

        const H_UTILS = window.HierarchyUtils;
        const children = [
            ...Object.values(state.layers || {}).filter(l => l && (l.parentId || 'root') === state.currentContext).map(l => ({ e: l, isLayer: true, defW: 600, defH: 400 })),
            ...Object.values(state.nodes).filter(n => n && (n.parentId || 'root') === state.currentContext && !n.hidden).map(n => ({ e: n, isLayer: false, defW: 200, defH: 100 }))
        ];

        // Мировой bbox: контент + вьюпорт (рамка не должна уезжать за край карты)
        const viewport = {
            minX: -offset.x / zoom,
            minY: -offset.y / zoom,
            maxX: (-offset.x + window.innerWidth) / zoom,
            maxY: (-offset.y + window.innerHeight) / zoom
        };
        const bbox = { ...viewport };
        const rects = children.map(({ e, isLayer, defW, defH }) => {
            const abs = H_UTILS.getAbsolutePosition(e.id, state.nodes, state.layers);
            const r = { x: abs.x, y: abs.y, w: e.size?.w || defW, h: e.size?.h || defH, color: e.color, isLayer, id: e.id };
            bbox.minX = Math.min(bbox.minX, r.x);
            bbox.minY = Math.min(bbox.minY, r.y);
            bbox.maxX = Math.max(bbox.maxX, r.x + r.w);
            bbox.maxY = Math.max(bbox.maxY, r.y + r.h);
            return r;
        });

        const fit = window.GeometryUtils.fitBBoxToCanvas(bbox, W, H, 8);
        transformRef.current = fit;

        rects.forEach(r => {
            const p = fit.toMini(r.x, r.y);
            const w = r.w * fit.scale;
            const h = r.h * fit.scale;
            if (r.isLayer) {
                ctx.fillStyle = r.color ? `${r.color}30` : 'rgba(255,255,255,0.05)';
                ctx.strokeStyle = r.color ? `${r.color}80` : '#444';
                ctx.fillRect(p.x, p.y, w, h);
                ctx.strokeRect(p.x, p.y, w, h);
            } else {
                ctx.fillStyle = r.color || '#3a3a3a';
                ctx.fillRect(p.x, p.y, Math.max(2, w), Math.max(2, h));
                const hasKids = Object.values(state.nodes).some(n => n && n.parentId === r.id) ||
                    Object.values(state.layers || {}).some(l => l && l.parentId === r.id);
                if (hasKids) {
                    ctx.fillStyle = '#007AFF';
                    ctx.beginPath();
                    ctx.arc(p.x + Math.max(2, w) - 3, p.y + 3, 2.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        });

        // Рамка вьюпорта
        const v1 = fit.toMini(viewport.minX, viewport.minY);
        const v2 = fit.toMini(viewport.maxX, viewport.maxY);
        ctx.strokeStyle = 'rgba(133, 183, 235, 0.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(v1.x, v1.y, v2.x - v1.x, v2.y - v1.y);
    }, [state.nodes, state.layers, state.currentContext, offset.x, offset.y, zoom]);

    const panTo = (e) => {
        const fit = transformRef.current;
        if (!fit) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const world = fit.toWorld(e.clientX - rect.left, e.clientY - rect.top);
        dispatch({
            type: 'SET_CANVAS',
            payload: { offset: { x: window.innerWidth / 2 - world.x * zoom, y: window.innerHeight / 2 - world.y * zoom } }
        });
    };

    const handleMouseDown = (e) => {
        e.stopPropagation();
        panTo(e);
        const move = (me) => panTo(me);
        const up = () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
    };

    if (state.ui.depthProfileOpen === false) return null;

    return (
        <div className="glass-panel rounded-lg border-[#444] overflow-hidden" data-file="components/MiniMap.js">
            <canvas
                ref={canvasRef}
                width={W}
                height={H}
                className="block cursor-crosshair"
                onMouseDown={handleMouseDown}
                title="Миникарта уровня: клик или перетаскивание — панорама"
            ></canvas>
        </div>
    );
}
