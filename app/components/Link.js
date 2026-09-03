// v14 (Фаза 4): Link.js рисует ТОЛЬКО связи, у которых оба конца лежат в ОДНОЙ
// и той же дорожке (см. Lane.js, фильтр linkIdsHere через
// HierarchyUtils.getPortHostOwnerId) — тогда координаты обоих концов чисто
// ЛОКАЛЬНЫЕ (позиция узла как есть, либо прямоугольник куска рамки в этой же
// дорожке), без пересчёта камеры окна, ровно как у Node.js/Frame.js.
//
// Связи между РАЗНЫМИ дорожками (в одном окне или в разных) сюда сознательно
// не попадают — их рисует CrossWindowLinkLayer в Canvas.js мировыми
// координатами (HierarchyUtils.getPortWorldPositionV14), одной прямой линией
// без прокси-порта на рамке окна: полноценная геометрия прокси — Фаза 5
// («Порты, связи, мульти-проект», §5 плана), это временное МВП-упрощение.
const computeLinkDerived = (view, linkId, windowId, ownerId) => {
    if (!linkId || !view) return { ok: false };
    const link = (view.links || {})[linkId];
    if (!link || !link.sourcePortId || !link.targetPortId) return { ok: false };

    const ports = view.ports || {};
    const nodes = view.nodes || {};
    const frames = view.frames || {};
    const windows = view.windows || {};
    const sourcePort = ports[link.sourcePortId];
    const targetPort = ports[link.targetPortId];
    if (!sourcePort || !targetPort) return { ok: false };

    const H = window.HierarchyUtils;
    const G = window.GeometryUtils;
    if (!H || !G) return { ok: false };

    const localHost = (hostId) => {
        const node = nodes[hostId];
        if (node) return { entity: node, pos: node.position || { x: 0, y: 0 }, size: node.size || { w: 200, h: 100 } };
        const frame = frames[hostId];
        if (!frame) return null;
        const win = windows[windowId];
        const rect = win ? H.fragmentRect(win, ownerId, frame.id, view) : null;
        if (!rect) return null;
        return { entity: frame, pos: { x: rect.x, y: rect.y }, size: { w: rect.w, h: rect.h } };
    };

    const sourceHost = localHost(sourcePort.nodeId);
    const targetHost = localHost(targetPort.nodeId);
    if (!sourceHost || !targetHost) return { ok: false };
    if (sourceHost.entity.hidden || targetHost.entity.hidden) return { ok: false };

    const p1 = G.getPortAbsolutePosition(sourcePort, { size: sourceHost.size }, sourceHost.pos);
    const p2 = G.getPortAbsolutePosition(targetPort, { size: targetHost.size }, targetHost.pos);
    if (!p1 || !p2) return { ok: false };

    const selectedIds = view.selectedIds || [];
    const isSelected = selectedIds.includes(linkId)
        || selectedIds.includes(link.sourcePortId)
        || selectedIds.includes(link.targetPortId)
        || selectedIds.includes(sourcePort.nodeId)
        || selectedIds.includes(targetPort.nodeId);

    const linkIndex = H.getLinkOrderIndex ? (H.getLinkOrderIndex(view.links)[linkId] ?? -1) : -1;

    return {
        ok: true, link, isSelected,
        p1x: p1.x, p1y: p1.y, p1edge: p1.edge,
        p2x: p2.x, p2y: p2.y, p2edge: p2.edge,
        linkIndex
    };
};

function Link(props) {
    if (typeof StoreEngine !== 'undefined') StoreEngine.profileRender('Link');
    const dispatch = useProjectDispatch();
    const projectId = React.useContext(ProjectContext);
    const linkId = props.linkId || (props.data && props.data.id) || (props.link && props.link.id) || null;
    const { windowId, ownerId } = props;

    const selectDerived = React.useCallback((view) => computeLinkDerived(view, linkId, windowId, ownerId), [linkId, windowId, ownerId]);
    const derived = useProjectSelector(selectDerived);

    if (!derived || !derived.ok) return null;
    const data = derived.link;
    const isSelected = derived.isSelected;

    const p1 = { x: derived.p1x, y: derived.p1y, edge: derived.p1edge };
    const p2 = { x: derived.p2x, y: derived.p2y, edge: derived.p2edge };

    const linkColor = data.color || '#666666';
    const pathD = window.GeometryUtils.buildLinkPath(p1, p2, data.linkStyle, derived.linkIndex);

    const activateAndSelect = (mode) => {
        if (projectId) {
            const rootState = (typeof architectorStore !== 'undefined') ? architectorStore.getState() : null;
            if (rootState && rootState.activeProjectId !== projectId) {
                dispatch({ type: 'SET_ACTIVE_PROJECT', payload: projectId });
            }
        }
        dispatch({ type: mode, payload: data.id });
    };

    const handleClick = (e) => {
        e.stopPropagation();
        activateAndSelect(e.shiftKey ? 'TOGGLE_SELECTED' : 'SET_SELECTED');
    };

    const handleDoubleClick = (e) => {
        e.stopPropagation();
        activateAndSelect('SET_SELECTED');
        dispatch({ type: 'FOCUS_CONNECTED_ELEMENTS', payload: { entityId: data.id } });
    };

    return (
        <svg className="absolute top-0 left-0 pointer-events-none" style={{ width: '1px', height: '1px', overflow: 'visible' }}>
            <path
                d={pathD}
                fill="none"
                stroke="transparent"
                strokeWidth="15"
                className="pointer-events-auto cursor-pointer"
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
            />
            <path
                d={pathD}
                fill="none"
                stroke={linkColor}
                strokeWidth={isSelected ? '5' : '2'}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                strokeDasharray={data.linkStyle === 'dashed' ? '5, 5' : 'none'}
                className="transition-all duration-200 pointer-events-none"
                style={{ filter: isSelected ? `drop-shadow(0 0 8px ${linkColor}AA)` : 'none' }}
            />
        </svg>
    );
}

// Линия перетаскивания нового соединения (Port.js: SET_PENDING_CONNECTION) —
// рисуется В МИРОВЫХ координатах (глобальный оверлей, не внутри дорожки).
function PendingLink() {
    const state = useProjectStore().state;
    const pending = state.pendingConnection;
    if (!pending) return null;

    const H = window.HierarchyUtils;
    const sourcePort = state.ports && state.ports[pending.sourcePortId];
    if (!sourcePort) return null;

    const p1 = H && H.getPortWorldPositionV14 ? H.getPortWorldPositionV14(pending.sourcePortId, state) : null;
    if (!p1) return null;

    const container = document.getElementById('canvas-container');
    const rect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };
    const zoom = (state.canvas && state.canvas.zoom) || 1;
    const offset = (state.canvas && state.canvas.offset) || { x: 0, y: 0 };
    const p2 = {
        x: (pending.endPos.x - rect.left - offset.x) / zoom,
        y: (pending.endPos.y - rect.top - offset.y) / zoom
    };

    const port = sourcePort;
    const edge = port.edge || 'right';
    const outward = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[edge] || { x: 1, y: 0 };
    const dirX = p2.x - p1.x, dirY = p2.y - p1.y;
    const movesOutward = (dirX * outward.x + dirY * outward.y) > 0;
    const bulge = 60;
    const c1 = movesOutward
        ? { x: p1.x + outward.x * bulge, y: p1.y + outward.y * bulge }
        : { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    const d = `M ${p1.x} ${p1.y} Q ${c1.x} ${c1.y} ${p2.x} ${p2.y}`;

    return (
        <svg className="absolute top-0 left-0 pointer-events-none z-50" style={{ width: '1px', height: '1px', overflow: 'visible' }}>
            <path d={d} fill="none" stroke="var(--accent-blue)" strokeWidth="2" strokeDasharray="5,5" vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

const MemoizedLink = React.memo ? React.memo(Link) : Link;
if (typeof window !== 'undefined') {
    window.Link = MemoizedLink;
    window.PendingLink = PendingLink;
}
if (typeof module !== 'undefined') module.exports = { Link: MemoizedLink, PendingLink };
