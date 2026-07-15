// Миниатюра начинки узла (semantic zoom, этап 3.1 плана).
// Рендерится в теле узла-контейнера вместо текста при достаточном зуме.
// Один уровень вглубь: дети узлами, связи линиями, внуки — точкой-индикатором.
// SVG с viewBox: вписывание детского bbox в тело узла бесплатное, pointer-events нет.
function NodePreview({ nodeId }) {
    const { state } = useStore();

    const preview = React.useMemo(() => {
        const bbox = window.HierarchyUtils.getChildrenBBox(nodeId, state.nodes, state.layers);
        if (!bbox) return null;

        const childNodes = Object.values(state.nodes).filter(n => n && n.parentId === nodeId && !n.hidden);
        const childLayers = Object.values(state.layers || {}).filter(l => l && l.parentId === nodeId);

        const childIds = new Set(childNodes.map(n => n.id));
        const innerLinks = (state.links || []).filter(l => {
            if (!l) return false;
            const sp = state.ports[l.sourcePortId];
            const tp = state.ports[l.targetPortId];
            return sp && tp && childIds.has(sp.nodeId) && childIds.has(tp.nodeId);
        }).map(l => {
            const sp = state.ports[l.sourcePortId];
            const tp = state.ports[l.targetPortId];
            const sNode = state.nodes[sp.nodeId];
            const tNode = state.nodes[tp.nodeId];
            const sRel = window.GeometryUtils.getPortRelativePosition(sp, sNode);
            const tRel = window.GeometryUtils.getPortRelativePosition(tp, tNode);
            return {
                id: l.id,
                color: l.color || '#666666',
                x1: (sNode.position?.x || 0) + sRel.x,
                y1: (sNode.position?.y || 0) + sRel.y,
                x2: (tNode.position?.x || 0) + tRel.x,
                y2: (tNode.position?.y || 0) + tRel.y
            };
        });

        const hasGrandchildren = (id) =>
            Object.values(state.nodes).some(n => n && n.parentId === id) ||
            Object.values(state.layers || {}).some(l => l && l.parentId === id);

        return { bbox, childNodes, childLayers, innerLinks, hasGrandchildren };
    }, [state.nodes, state.layers, state.ports, state.links, nodeId]);

    if (!preview) return null;
    const { bbox, childNodes, childLayers, innerLinks, hasGrandchildren } = preview;

    const pad = 40;
    const viewBox = `${bbox.minX - pad} ${bbox.minY - pad} ${bbox.maxX - bbox.minX + pad * 2} ${bbox.maxY - bbox.minY + pad * 2}`;

    const truncate = (name, max = 20) => {
        const s = name || '';
        return s.length > max ? s.slice(0, max - 1) + '…' : s;
    };

    return (
        <svg
            viewBox={viewBox}
            preserveAspectRatio="xMidYMid meet"
            className="flex-1 w-full min-h-0 pointer-events-none opacity-90"
            data-file="components/NodePreview.js"
        >
            {childLayers.map(l => (
                <rect
                    key={l.id}
                    x={l.position?.x || 0}
                    y={l.position?.y || 0}
                    width={l.size?.w || 600}
                    height={l.size?.h || 400}
                    rx="14"
                    fill={l.color ? `${l.color}20` : 'rgba(255,255,255,0.03)'}
                    stroke={l.color || '#444'}
                    strokeWidth="2"
                    strokeDasharray="8 6"
                />
            ))}

            {innerLinks.map(l => (
                <line key={l.id} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.color} strokeWidth="2.5" opacity="0.8" />
            ))}

            {childNodes.map(n => {
                const x = n.position?.x || 0;
                const y = n.position?.y || 0;
                const w = n.size?.w || 200;
                const h = n.size?.h || 100;
                const shape = n.shape || 'rectangle';
                const fill = n.color || 'rgba(26,26,26,0.95)';
                const fontSize = Math.max(14, Math.min(26, h * 0.2));

                return (
                    <g key={n.id} transform={`translate(${x} ${y})`}>
                        {shape === 'rectangle' ? (
                            <rect width={w} height={h} rx="10" fill={fill} stroke="#555" strokeWidth="2" />
                        ) : (
                            <polygon
                                points={window.GeometryUtils.getPolygonPoints(shape, w, h).map(p => p.join(',')).join(' ')}
                                fill={fill}
                                stroke="#555"
                                strokeWidth="2"
                            />
                        )}
                        <text
                            x={w / 2}
                            y={h / 2}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill="#e0e0e0"
                            fontSize={fontSize}
                            fontFamily="Inter, sans-serif"
                        >
                            {truncate(n.name)}
                        </text>
                        {hasGrandchildren(n.id) && (
                            <circle cx={w - 16} cy={16} r="8" fill="#007AFF" opacity="0.9" />
                        )}
                    </g>
                );
            })}
        </svg>
    );
}
