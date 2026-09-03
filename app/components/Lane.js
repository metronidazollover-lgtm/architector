// v14 (Фаза 4): Дорожка (lane) — внутренность одного узла (или корня),
// отрисованная как колонка внутри окна (LaneWindow.js кладёт несколько Lane
// рядом, см. §1/§11 LANES_MODEL.md). Дорожка ничего не хранит сама — вся её
// «личность» (имя/цвет/путь) выводится из ownerId, а геометрия — из
// HierarchyUtils.laneRect/laneOffset. Камера общая на всё окно (win.camera),
// поэтому у Lane нет своего pan/zoom — только фиксированная ширина.
const MIME_LANE = 'application/x-architector-lane';

const computeLaneDerived = (view, windowId, ownerId) => {
    const windows = view.windows || {};
    const win = windows[windowId];
    if (!win || !Array.isArray(win.lanes) || !win.lanes.includes(ownerId)) return { ok: false };

    const H = window.HierarchyUtils;
    const nodes = view.nodes || {};
    const owner = ownerId === 'root' ? null : nodes[ownerId];
    if (ownerId !== 'root' && !owner) return { ok: false };

    const hidden = (win.hidden || []).includes(ownerId);
    const width = hidden ? (H.HIDDEN_LANE_W || 26) : (ownerId === 'root' ? (H.ROOT_LANE_W || 520) : (H.LANE_W || 420));
    const name = ownerId === 'root' ? 'Проект' : (owner.name || ownerId);
    const color = ownerId === 'root' ? '' : (owner.color || '#334155');
    const path = ownerId === 'root' ? '/' : ('/' + (H.getPath ? H.getPath(ownerId, nodes).map(id => (nodes[id] && nodes[id].name) || id).join('/') : name));

    const byParent = H.getChildrenByParent ? H.getChildrenByParent(nodes) : {};
    const childIds = (byParent[ownerId] || []).map(n => n.id);

    const frames = view.frames || {};
    const frameIdsHere = Object.keys(frames).filter(fid => {
        const f = frames[fid];
        return f && (f.members || []).some(mid => nodes[mid] && (nodes[mid].parentId || 'root') === ownerId);
    });

    // Link.js рисует только связи ЦЕЛИКОМ внутри своей дорожки (оба конца —
    // здесь): и узел, и рамка (через кусок) дают чистые ЛОКАЛЬНЫЕ координаты
    // без пересчёта камеры. Связи между разными дорожками/окнами рисует
    // отдельный оверлей Canvas.js в мировых координатах (см. Link.js).
    const links = view.links || {};
    const linksList = Array.isArray(links) ? links : Object.values(links);
    const linkIdsHere = linksList.filter(l => l && H.getPortHostOwnerId
        && H.getPortHostOwnerId(l.sourcePortId, view) === ownerId
        && H.getPortHostOwnerId(l.targetPortId, view) === ownerId
    ).map(l => l.id);

    const dropTarget = view.dragGesture && view.dragGesture.target;
    const isDropReceiver = !!(dropTarget && dropTarget.windowId === windowId && dropTarget.ownerId === ownerId
        && !dropTarget.nodeId && dropTarget.valid);

    const camera = win.camera || { offset: { x: 0, y: 0 }, zoom: 1 };

    return {
        ok: true, hidden, width, name, color, path, childIds, frameIdsHere, linkIdsHere,
        isDropReceiver, zoom: camera.zoom || 1, offset: camera.offset || { x: 0, y: 0 }
    };
};

function Lane(props) {
    if (typeof StoreEngine !== 'undefined') StoreEngine.profileRender('Lane');
    const { windowId, ownerId } = props;
    const dispatch = useProjectDispatch();
    const projectId = React.useContext(ProjectContext);

    const selectDerived = React.useCallback((view) => computeLaneDerived(view, windowId, ownerId), [windowId, ownerId]);
    const derived = useProjectSelector(selectDerived);
    if (!derived.ok) return null;
    const { hidden, width, name, color, path, childIds, frameIdsHere, linkIdsHere, isDropReceiver, zoom, offset } = derived;

    const activate = () => {
        const st = getProjectFlatView(projectId);
        if (projectId && projectId !== st.activeProjectId) dispatch({ type: 'SET_ACTIVE_PROJECT', payload: projectId });
    };

    const toggleHidden = (e) => { e.stopPropagation(); activate(); dispatch({ type: 'TOGGLE_LANE_HIDDEN', payload: { windowId, ownerId } }); };
    const detach = (e) => { e.stopPropagation(); activate(); dispatch({ type: 'DETACH_LANE', payload: { windowId, ownerId } }); };
    const close = (e) => { e.stopPropagation(); activate(); dispatch({ type: 'CLOSE_LANE', payload: { windowId, ownerId } }); };

    const handleHeaderClick = (e) => {
        if (e.target.closest('button')) return;
        activate();
        dispatch({ type: 'SET_ACTIVE_LANE', payload: ownerId });
        if (ownerId !== 'root') dispatch({ type: 'SET_SELECTED', payload: ownerId });
    };

    const handleDragStart = (e) => {
        e.dataTransfer.setData(MIME_LANE, JSON.stringify({ fromWindowId: windowId, ownerId }));
        e.dataTransfer.effectAllowed = 'move';
    };
    const handleHeaderDragOver = (e) => {
        if (!e.dataTransfer.types.includes(MIME_LANE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };
    const handleHeaderDrop = (e) => {
        if (!e.dataTransfer.types.includes(MIME_LANE)) return;
        e.preventDefault();
        let payload;
        try { payload = JSON.parse(e.dataTransfer.getData(MIME_LANE)); } catch (err) { return; }
        if (!payload || payload.fromWindowId === windowId) return;
        dispatch({ type: 'DOCK_LANE', payload: { ownerId: payload.ownerId, fromWindowId: payload.fromWindowId, toWindowId: windowId } });
    };

    const handleBodyClick = (e) => {
        if (e.target.closest('.node-entity, .frame-fragment')) return;
        activate();
        dispatch({ type: 'SET_ACTIVE_LANE', payload: ownerId });
        dispatch({ type: 'SET_SELECTED', payload: null });
    };

    const bodyDragOver = (e) => {
        if (!hidden) return;
        // Дроп на свёрнутую («глазом») дорожку сначала автоматически её
        // разворачивает, а не отклоняет дроп (§11.1 LANES_MODEL.md).
        dispatch({ type: 'TOGGLE_LANE_HIDDEN', payload: { windowId, ownerId } });
    };

    if (hidden) {
        return (
            <div
                className="lane-hidden relative shrink-0 h-full flex items-center justify-center cursor-pointer border-r border-white/10"
                style={{ width }}
                title={`${name} — скрыта, кликните чтобы развернуть`}
                onClick={toggleHidden}
                onDragEnter={bodyDragOver}
            >
                <span
                    className="text-[11px] text-slate-400 select-none whitespace-nowrap"
                    style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                >{name}</span>
            </div>
        );
    }

    return (
        <div className="lane relative shrink-0 h-full flex flex-col border-r border-white/10" style={{ width }}>
            <div
                className="lane-header h-7 shrink-0 flex items-center gap-1.5 px-2 text-xs text-white cursor-move select-none"
                style={{ backgroundColor: color || '#1e293b' }}
                draggable
                onDragStart={handleDragStart}
                onDragOver={handleHeaderDragOver}
                onDrop={handleHeaderDrop}
                onClick={handleHeaderClick}
                title={path}
            >
                <span className="w-2 h-2 rounded-full shrink-0 border border-white/40" style={{ backgroundColor: color || '#64748b' }} />
                <span className="truncate flex-1 font-medium">{name}</span>
                <button onClick={toggleHidden} title="Скрыть дорожку" className="opacity-80 hover:opacity-100">
                    <div className="icon-eye w-3.5 h-3.5" />
                </button>
                <button onClick={detach} title="Отстыковать в своё окно" className="opacity-80 hover:opacity-100">⇱</button>
                <button onClick={close} title="Закрыть дорожку" className="opacity-80 hover:opacity-100">✕</button>
            </div>
            <div
                className={`lane-body relative flex-1 overflow-hidden ${isDropReceiver ? 'ring-2 ring-inset ring-emerald-400/60' : ''}`}
                onDragOver={bodyDragOver}
                onClick={handleBodyClick}
            >
                <div className="absolute inset-0 origin-top-left" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}>
                    {childIds.length === 0 && (
                        <div className="absolute top-6 left-1/2 -translate-x-1/2 text-xs text-slate-500 whitespace-nowrap pointer-events-none">
                            пусто — бросьте сюда узел
                        </div>
                    )}
                    {frameIdsHere.map(fid => (
                        <Frame key={fid} frameId={fid} windowId={windowId} ownerId={ownerId} />
                    ))}
                    {linkIdsHere.map(id => (
                        <Link key={id} linkId={id} windowId={windowId} ownerId={ownerId} />
                    ))}
                    {childIds.map(id => (
                        <NodeComponent key={id} nodeId={id} zoom={zoom} />
                    ))}
                </div>
            </div>
        </div>
    );
}

if (typeof window !== 'undefined') {
    window.Lane = Lane;
}
if (typeof module !== 'undefined') {
    module.exports = { Lane, computeLaneDerived };
}
