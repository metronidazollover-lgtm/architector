// v14 (Фаза 4, заменяет Layer.js): Рамка (frame) — множество узлов, рисуемое
// кусками (fragments), по одному на дорожку, в которой у рамки есть видимые
// члены (§1/§12 LANES_MODEL.md). Рамка не имеет собственных position/size и
// не участвует в parentId — кусок в каждой дорожке пересчитывается на лету из
// bbox её членов (HierarchyUtils.fragmentRect), поэтому Frame не таскает сам
// себя целиком: перетаскивание ярлыка двигает САМИХ членов (MOVE_FRAGMENT).
//
// Один Frame — один кусок в ОДНОЙ конкретной дорожке ОДНОГО конкретного окна
// (Lane.js рендерит по одному <Frame> на каждую рамку, у которой в этой
// дорожке есть видимые члены). Ярлык (имя, счётчик, ⧉) рисуется только на
// куске в «домашней» дорожке рамки (frame.homeLaneId); на остальных кусках —
// точка-заглушка со счётчиком. Порты рамки — только на кусок в homeLaneId.
const computeFrameDerived = (view, frameId, windowId, ownerId) => {
    const frames = view.frames || {};
    const frame = frames[frameId];
    const windows = view.windows || {};
    const win = windows[windowId];
    if (!frame || !win) return { ok: false };

    const H = window.HierarchyUtils;
    const local = H ? H.fragmentRect(win, ownerId, frameId, view) : null;
    if (!local) return { ok: false };

    const nodes = view.nodes || {};
    const membersHere = (frame.members || []).filter(mid => nodes[mid] && (nodes[mid].parentId || 'root') === ownerId);
    const visibleCount = membersHere.length;
    const totalCount = (frame.members || []).length;
    const homeLaneId = frame.homeLaneId || 'root';
    // Ярлык живёт на homeLaneId, если там есть видимые члены; иначе — на первом
    // непустом куске (см. §4.2 LANES_MODEL.md — homeLaneId не переписывается).
    const homeHasMembers = (frame.members || []).some(mid => nodes[mid] && (nodes[mid].parentId || 'root') === homeLaneId);
    const isHome = homeHasMembers ? (ownerId === homeLaneId) : (() => {
        const firstOwnerWithMembers = (frame.members || [])
            .map(mid => nodes[mid] && (nodes[mid].parentId || 'root'))
            .find(Boolean);
        return ownerId === firstOwnerWithMembers;
    })();

    const selectedIds = view.selectedIds || [];
    const isSelected = selectedIds.includes(frameId);
    const isActive = view.activeFrameId === frameId;

    const ports = view.ports || {};
    const portIds = isHome
        ? ((H && H.getPortsByNodeId ? H.getPortsByNodeId(ports)[frameId] : Object.values(ports).filter(p => p && p.nodeId === frameId)) || []).map(p => p.id)
        : [];

    const dropTarget = view.dragGesture && view.dragGesture.target;
    const isDropReceiver = !!(dropTarget && dropTarget.kind === 'frame' && dropTarget.id === frameId
        && dropTarget.windowId === windowId && dropTarget.ownerId === ownerId && dropTarget.valid);

    // Вложенные рамки на одной карточке — контуры вложенные, каждый своим
    // цветом (§12.1 LANES_MODEL.md): ступенчатый отступ по числу рамок, куски
    // которых в этой дорожке содержат ХОТЯ БЫ ОДНОГО общего члена и физически
    // старше (раньше в словаре frames) текущей — стабильный, детерминированный
    // порядок вложенности без отдельного поля «depth» у рамки.
    let nestDepth = 0;
    Object.keys(frames).forEach(otherId => {
        if (otherId === frameId) return;
        const other = frames[otherId];
        if (!other) return;
        const otherHasHere = (other.members || []).some(mid => membersHere.includes(mid) || (nodes[mid] && (nodes[mid].parentId || 'root') === ownerId && other.members.includes(mid)));
        if (otherHasHere && otherId < frameId) nestDepth++;
    });

    return {
        ok: true,
        frame,
        rect: local,
        isHome,
        isSelected,
        isActive,
        isDropReceiver,
        visibleCount,
        totalCount,
        portIds,
        nestDepth
    };
};

function Frame(props) {
    if (typeof StoreEngine !== 'undefined') StoreEngine.profileRender('Frame');
    const { frameId, windowId, ownerId } = props;
    const dispatch = useProjectDispatch();
    const projectId = React.useContext(ProjectContext);

    const selectDerived = React.useCallback(
        (view) => computeFrameDerived(view, frameId, windowId, ownerId),
        [frameId, windowId, ownerId]
    );
    const derived = useProjectSelector(selectDerived);
    if (!derived.ok) return null;
    const { frame, rect, isHome, isSelected, isActive, isDropReceiver, visibleCount, totalCount, portIds, nestDepth } = derived;

    const pad = nestDepth * (window.HierarchyUtils.FRAME_NEST_STEP || 12);

    const handleLabelMouseDown = (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const stateRef = () => getProjectFlatView(projectId);
        const st0 = stateRef();
        if (projectId && projectId !== st0.activeProjectId) {
            dispatch({ type: 'SET_ACTIVE_PROJECT', payload: projectId });
        }
        dispatch({ type: 'SET_SELECTED', payload: [frameId] });
        dispatch({ type: 'SET_ACTIVE_FRAME', payload: frameId });

        const startX = e.clientX, startY = e.clientY;
        let hasMoved = false;
        let lastDx = 0, lastDy = 0;

        const handleMove = (moveEvent) => {
            const st = stateRef();
            const win = st.windows && st.windows[windowId];
            const zoom = (win && win.camera && win.camera.zoom) || 1;
            const dx = (moveEvent.clientX - startX) / zoom;
            const dy = (moveEvent.clientY - startY) / zoom;
            if (Math.abs(dx) + Math.abs(dy) > 2) hasMoved = true;
            const stepDx = dx - lastDx, stepDy = dy - lastDy;
            lastDx = dx; lastDy = dy;
            if (stepDx || stepDy) {
                dispatch({ type: 'MOVE_FRAGMENT', payload: { frameId, ownerId, dx: stepDx, dy: stepDy, skipHistory: true } });
            }
        };
        const handleUp = () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
            if (hasMoved) {
                dispatch({ type: 'COMMIT_HISTORY', payload: { snapshot: { nodes: st0.nodes }, logMessage: `Перемещён кусок рамки: ${frame.name || frameId}` } });
            }
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
    };

    const handleOpenAsWindow = (e) => {
        e.stopPropagation();
        dispatch({ type: 'OPEN_FRAME_WINDOW', payload: { frameId } });
    };

    const borderColor = frame.color || '#0284c7';

    return (
        <div
            className="frame-fragment absolute pointer-events-none"
            style={{
                left: rect.x - pad, top: rect.y - pad, width: rect.w + pad * 2, height: rect.h + pad * 2,
                border: `2px ${isSelected || isActive ? 'solid' : 'dashed'} ${borderColor}`,
                borderRadius: 10,
                boxShadow: isActive ? `0 0 0 3px ${borderColor}55` : (isDropReceiver ? '0 0 0 3px #34d399aa' : 'none'),
                zIndex: 5
            }}
        >
            {isHome && (
                <div
                    className="frame-label absolute pointer-events-auto flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs text-white cursor-move select-none"
                    style={{ top: -12, left: 8, backgroundColor: borderColor }}
                    onMouseDown={handleLabelMouseDown}
                    title={frame.content || frame.name}
                >
                    <span className="truncate max-w-[140px]">{frame.name || 'Рамка'}</span>
                    <span className="opacity-80">{visibleCount}/{totalCount}</span>
                    <button
                        className="opacity-90 hover:opacity-100"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={handleOpenAsWindow}
                        title="Открыть рамку как окно"
                    >⧉</button>
                </div>
            )}
            {!isHome && (
                <div
                    className="frame-dot absolute pointer-events-auto flex items-center justify-center rounded-full text-[10px] text-white cursor-pointer select-none"
                    style={{ top: -8, left: 8, width: 16, height: 16, backgroundColor: borderColor }}
                    title={`${frame.name || 'Рамка'}: ${visibleCount} здесь`}
                    onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_SELECTED', payload: [frameId] }); dispatch({ type: 'SET_ACTIVE_FRAME', payload: frameId }); }}
                >{visibleCount}</div>
            )}
            {isHome && portIds.map(portId => (
                <div key={portId} className="pointer-events-auto">
                    <Port portId={portId} nodeId={frameId} localZoom={1} />
                </div>
            ))}
        </div>
    );
}

if (typeof window !== 'undefined') {
    window.Frame = Frame;
}
if (typeof module !== 'undefined') {
    module.exports = { Frame, computeFrameDerived };
}
