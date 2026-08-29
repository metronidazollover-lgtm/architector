const computeLinkDerived = (view, linkId) => {
    if (!linkId || !view) return { ok: false };
    const link = (view.links || {})[linkId];
    if (!link || !link.sourcePortId || !link.targetPortId) return { ok: false };

    const ports = view.ports || {};
    const nodes = view.nodes || {};
    const layers = view.layers || {};
    const sourcePort = ports[link.sourcePortId];
    const targetPort = ports[link.targetPortId];
    if (!sourcePort || !targetPort) return { ok: false };

    const sourceNode = nodes[sourcePort.nodeId] || layers[sourcePort.nodeId];
    const targetNode = nodes[targetPort.nodeId] || layers[targetPort.nodeId];
    if (!sourceNode || !targetNode) return { ok: false };
    if (sourceNode.hidden || targetNode.hidden) return { ok: false };

    const H = window.HierarchyUtils;
    const G = window.GeometryUtils;
    if (!H || !G) return { ok: false };

    const selectedIds = view.selectedIds || [];
    const isSelected = selectedIds.includes(linkId)
        || selectedIds.includes(link.sourcePortId)
        || selectedIds.includes(link.targetPortId)
        || selectedIds.includes(sourcePort.nodeId)
        || selectedIds.includes(targetPort.nodeId);

    // ВАЖНО: компонент рендерится внутри вьюпорта окна (transform: translate+scale),
    // поэтому здесь нужны ЛОКАЛЬНЫЕ координаты уровня. Мировые координаты — только
    // у межуровневых связей в глобальном слое (Canvas.js).
    const sourceAbs = H.getLocalPosition(sourceNode.id, nodes, view.layers);
    const targetAbs = H.getLocalPosition(targetNode.id, nodes, view.layers);
    const p1 = G.getPortAbsolutePosition(sourcePort, sourceNode, sourceAbs);
    const p2 = G.getPortAbsolutePosition(targetPort, targetNode, targetAbs);
    if (!p1 || !p2) return { ok: false };

    const linkIndex = H.getLinkOrderIndex ? (H.getLinkOrderIndex(view.links)[linkId] ?? -1) : -1;
    const sLvl = H.getEntityLevel(sourceNode.id, nodes, view.layers);
    const tLvl = H.getEntityLevel(targetNode.id, nodes, view.layers);

    return {
        ok: true,
        link,
        isSelected,
        // Плоские координаты: срез сравнивается поверхностно, объекты давали бы
        // «изменение» на каждом пересчёте
        p1x: p1.x, p1y: p1.y, p1edge: p1.edge,
        p2x: p2.x, p2y: p2.y, p2edge: p2.edge,
        linkIndex,
        isCrossLevel: sLvl !== tLvl
    };
};

function Link(props) {
    if (typeof StoreEngine !== 'undefined') StoreEngine.profileRender('Link');
    const dispatch = useProjectDispatch();
    const linkId = props.linkId
        || (props.data && props.data.id)
        || (props.link && props.link.id)
        || null;

    // Все хуки — ДО раннего выхода
    const selectDerived = React.useCallback((view) => computeLinkDerived(view, linkId), [linkId]);
    const derived = useProjectSelector(selectDerived);

    if (!derived || !derived.ok) return null;
    const data = derived.link;
    if (!data) return null;
    const isSelected = derived.isSelected;

    const p1 = { x: derived.p1x, y: derived.p1y, edge: derived.p1edge };
    const p2 = { x: derived.p2x, y: derived.p2y, edge: derived.p2edge };

    const linkColor = data.color || '#666666';
    const pathD = window.GeometryUtils.buildLinkPath(p1, p2, data.linkStyle, derived.linkIndex);

    const handleClick = (e) => {
        e.stopPropagation();
        if (e.shiftKey) {
            dispatch({ type: 'TOGGLE_SELECTED', payload: data.id });
        } else {
            dispatch({ type: 'SET_SELECTED', payload: data.id });
        }
    };

    const handleDoubleClick = (e) => {
        e.stopPropagation();
        dispatch({ type: 'SET_SELECTED', payload: data.id });
        dispatch({ type: 'FOCUS_CONNECTED_ELEMENTS', payload: { entityId: data.id } });
    };

    const isCrossLevel = derived.isCrossLevel;

    return (
        <svg className="absolute top-0 left-0 pointer-events-none" style={{ width: '1px', height: '1px', overflow: 'visible' }}>
            {/* Hitbox for easier clicking */}
            <path
                d={pathD}
                fill="none"
                stroke="transparent"
                strokeWidth="15"
                className="pointer-events-auto cursor-pointer"
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
            />
            {/* Visual line */}
            <path
                d={pathD}
                fill="none"
                stroke={linkColor}
                strokeWidth={isSelected ? "5" : (isCrossLevel ? "2.5" : "2")}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                strokeDasharray={isCrossLevel ? '2, 6' : (data.linkStyle === 'dashed' ? '5, 5' : 'none')}
                className="transition-all duration-200 pointer-events-none"
                style={{
                    filter: isSelected ? `drop-shadow(0 0 8px ${linkColor}AA)` : 'none'
                }}
            />
        </svg>
    );
}

function PendingLink() {
    const { state } = useStore();
    if (!state.pendingConnection) return null;

    const { sourcePortId, endPos } = state.pendingConnection;
    let sourcePort = state.ports && state.ports[sourcePortId];
    let projectState = state;
    if (!sourcePort && state.projects) {
        for (const pid of (state.projectOrder || [])) {
            const p = state.projects[pid];
            if (p && p.ports && p.ports[sourcePortId]) {
                sourcePort = p.ports[sourcePortId];
                projectState = typeof getProjectFlatView === 'function' ? getProjectFlatView(pid) : p;
                break;
            }
        }
    }
    if (!sourcePort) return null;

    const sourceNode = (projectState.nodes && projectState.nodes[sourcePort.nodeId]) || (projectState.layers && projectState.layers[sourcePort.nodeId]);
    if (!sourceNode) return null;

    const { offset, zoom } = state.canvas;

    const H = window.HierarchyUtils;
    const p1 = H ? H.getPortWorldCoordinates(sourcePortId, projectState) : null;
    if (!p1) return null;
    p1.edge = sourcePort.edge || 'right';

    // Convert screen endPos to canvas absolute with container rect offset check
    const container = typeof document !== 'undefined' ? document.getElementById('canvas-container') : null;
    const rect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };

    const p2x = (endPos.x - rect.left - offset.x) / zoom;
    const p2y = (endPos.y - rect.top - offset.y) / zoom;

    const dx = p2x - p1.x;
    const dy = p2y - p1.y;

    let cp1x = p1.x;
    let cp1y = p1.y;

    // Плавный вылет добавляется ТОЛЬКО если курсор тянется в естественную сторону грани порта.
    // Если мышь тянется в любом другом направлении, линия идет напрямую ровно к курсору.
    if (p1.edge === 'left' || p1.edge === 'right') {
        const factor = p1.edge === 'right' ? 1 : -1;
        const outDist = (dx * factor > 0) ? Math.min(dx * factor * 0.4, 80) : 0;
        cp1x += factor * outDist;
    } else {
        const factor = p1.edge === 'bottom' ? 1 : -1;
        const outDist = (dy * factor > 0) ? Math.min(dy * factor * 0.4, 80) : 0;
        cp1y += factor * outDist;
    }

    const cp2x = p2x - (cp1x - p1.x);
    const cp2y = p2y - (cp1y - p1.y);

    const pathD = `M ${p1.x} ${p1.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2x} ${p2y}`;

    return (
        <svg className="absolute top-0 left-0 pointer-events-none z-50" style={{ width: '1px', height: '1px', overflow: 'visible' }}>
            <path
                d={pathD}
                fill="none"
                stroke="var(--accent-blue)"
                strokeWidth="2"
                strokeDasharray="5,5"
            />
        </svg>
    );
}

const MemoizedLink = React.memo ? React.memo(Link) : Link;
if (typeof window !== 'undefined') {
    window.Link = MemoizedLink;
    window.PendingLink = PendingLink;
}
if (typeof module !== 'undefined') {
    module.exports = { Link: MemoizedLink, PendingLink };
}



