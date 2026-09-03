// v14 (Фаза 4): порт живёт на узле ИЛИ на рамке (§4.2 LANES_MODEL.md — порты
// рамки привязаны к куску в её homeLaneId; если там сейчас нет видимых членов,
// временно рисуются на первом непустом куске, homeLaneId не переписывается).
// У рамки нет собственного size — геометрия здесь синтезируется из
// прямоугольника её текущего куска (HierarchyUtils.fragmentRect), чтобы
// GeometryUtils.getPortRelativePosition мог работать с ней как с обычным
// «хостом» без собственных правок geometry.js.
//
// Кросс-окно́е «полукольцо» и поиск прокси-порта на грани окна (было в v13 —
// getCrossLevelPortInfo/getProxyPortsForWindow) сюда сознательно НЕ перенесены:
// v14 рисует межоконные связи одной прямой линией в мировых координатах
// (CrossWindowLinkLayer в Canvas.js, см. HierarchyUtils.getPortWorldPositionV14)
// — отдельная прокси-геометрия на грани окна не нужна. Остаётся только кольцо
// внутренней вложенности (maxInternalDepth) — оно чисто локальное.
//
// Кросс-проектный поиск порта (Фаза 5, §5 плана; было в v13 — Фаза 6.1,
// getPortWorldCoordinates) восстановлен ниже как шаг 1.2 — тот же приём: окна
// ДРУГИХ проектов рисуются на том же общем холсте в единой мировой системе
// координат (Canvas.js), так что getProjectFlatView(pid) + getPortWorldPositionV14
// достаточно, чтобы искать порт-цель по абсолютному расстоянию до курсора.
const resolveHostGeometry = (hostId, state) => {
    const H = window.HierarchyUtils;
    const nodes = state.nodes || {};
    if (nodes[hostId]) {
        const node = nodes[hostId];
        const t = H.getWorldTransformV14(hostId, state);
        return { entity: node, size: node.size || { w: 200, h: 100 }, worldTransform: t };
    }
    const frames = state.frames || {};
    const frame = frames[hostId];
    if (!frame) return null;
    const windows = state.windows || {};
    const tryLane = (ownerId) => {
        const win = H.windowsOfLane(ownerId, windows)[0];
        if (!win) return null;
        const rect = H.fragmentRect(win, ownerId, frame.id, state);
        if (!rect) return null;
        const topLeft = H.laneLocalToWorld(win, ownerId, { x: rect.x, y: rect.y });
        if (!topLeft) return null;
        return { size: { w: rect.w, h: rect.h }, worldTransform: topLeft };
    };
    const homeLaneId = frame.homeLaneId || 'root';
    let g = tryLane(homeLaneId);
    if (!g) {
        const altOwnerId = (frame.members || []).map(mid => nodes[mid] && (nodes[mid].parentId || 'root')).find(Boolean);
        if (altOwnerId) g = tryLane(altOwnerId);
    }
    if (!g) return { entity: frame, size: { w: 200, h: 100 }, worldTransform: { x: 0, y: 0, scale: 1 } };
    return { entity: frame, size: g.size, worldTransform: g.worldTransform };
};

const computePortDerived = (view, portId, nodeId) => {
    const empty = {
        port: null, node: null,
        zoom: 1, isPending: false, isSelected: false, isExplicitlySelected: false, maxInternalDepth: 0
    };
    if (!portId || !nodeId || !view) return empty;

    const H = window.HierarchyUtils;
    const nodes = view.nodes || {};
    const ports = view.ports || {};
    const selectedIds = view.selectedIds || [];
    const myLinks = (H && H.getLinksByPortId) ? (H.getLinksByPortId(view.links)[portId] || []) : [];

    const isExplicitlySelected = selectedIds.includes(portId);
    const isOwnedBySelectedNode = selectedIds.includes(nodeId);
    let connectedToSelected = false;
    let maxInternalDepth = 0;

    myLinks.forEach(l => {
        if (!l) return;
        if (selectedIds.includes(l.id)) connectedToSelected = true;
        const oppPortId = l.sourcePortId === portId ? l.targetPortId : l.sourcePortId;
        if (!oppPortId) return;
        if (selectedIds.includes(oppPortId)) connectedToSelected = true;
        const oppPort = ports[oppPortId];
        if (!oppPort) return;
        if (selectedIds.includes(oppPort.nodeId)) connectedToSelected = true;

        // Глубина вложенности внутри СВОЕЙ дорожки: поднимаемся от соседа по
        // parentId, пока не упрёмся в свой узел (только узлы — рамка в
        // цепочке parentId не участвует).
        const otherNode = nodes[oppPort.nodeId];
        if (!otherNode) return;
        let current = otherNode;
        let depth = 0;
        const seen = new Set();
        while (current && current.id !== nodeId && current.parentId && current.parentId !== 'root' && !seen.has(current.id)) {
            seen.add(current.id);
            depth++;
            current = nodes[current.parentId];
        }
        if (current && current.id === nodeId && depth > 0 && depth > maxInternalDepth) maxInternalDepth = depth;
    });

    const host = resolveHostGeometry(nodeId, view);
    const hostForGeometry = host ? { ...host.entity, size: host.size } : null;

    return {
        port: ports[portId] || null,
        node: hostForGeometry,
        zoom: (view.canvas && view.canvas.zoom) || 1,
        isPending: !!(view.pendingConnection && view.pendingConnection.sourcePortId === portId),
        isSelected: isExplicitlySelected || isOwnedBySelectedNode || connectedToSelected,
        isExplicitlySelected,
        maxInternalDepth
    };
};

function Port(props) {
    if (typeof StoreEngine !== 'undefined') StoreEngine.profileRender('Port');
    const dispatch = useProjectDispatch();
    const projectId = React.useContext(ProjectContext);

    const portId = props.portId || (props.data && props.data.id) || (props.port && props.port.id) || null;
    const ownerNodeId = props.nodeId || (props.nodeData && props.nodeData.id) || (props.node && props.node.id) || null;

    const selectDerived = React.useCallback((view) => computePortDerived(view, portId, ownerNodeId), [portId, ownerNodeId]);
    const derived = useProjectSelector(selectDerived);

    const data = derived.port || props.data || props.port;
    const nodeData = derived.node || props.nodeData || props.node;
    if (!data || !nodeData) return null;
    const zoom = derived.zoom;

    const relPos = window.GeometryUtils.getPortRelativePosition(data, nodeData);
    const left = relPos.x;
    const top = relPos.y;

    const handleMouseDown = (e) => {
        e.stopPropagation();

        if (projectId) {
            const rootState = (typeof architectorStore !== 'undefined') ? architectorStore.getState() : null;
            if (rootState && rootState.activeProjectId !== projectId) {
                dispatch({ type: 'SET_ACTIVE_PROJECT', payload: projectId });
            }
        }

        // Shift+Drag — скольжение вдоль всего периметра хоста; Shift+Click — выделение.
        if (e.shiftKey) {
            let hasMoved = false;
            const startX = e.clientX;
            const startY = e.clientY;

            const handleMouseMove = (moveEvent) => {
                const state = getProjectFlatView(projectId);
                if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 3) hasMoved = true;
                if (!hasMoved) return;

                const container = document.getElementById('canvas-container');
                const rect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };
                const mouseX = (moveEvent.clientX - rect.left - state.canvas.offset.x) / zoom;
                const mouseY = (moveEvent.clientY - rect.top - state.canvas.offset.y) / zoom;

                const host = resolveHostGeometry(ownerNodeId, state);
                const t = host ? host.worldTransform : { x: 0, y: 0, scale: 1 };
                const size = host ? host.size : nodeData.size;
                const scale = t.scale || 1;
                const localX = (mouseX - t.x) / scale;
                const localY = (mouseY - t.y) / scale;

                const distTop = Math.abs(localY);
                const distBottom = Math.abs(size.h - localY);
                const distLeft = Math.abs(localX);
                const distRight = Math.abs(size.w - localX);

                const minDist = Math.min(distTop, distBottom, distLeft, distRight);
                let newEdge, newPos;
                if (minDist === distTop) { newEdge = 'top'; newPos = Math.max(0, Math.min(1, localX / size.w)); }
                else if (minDist === distBottom) { newEdge = 'bottom'; newPos = Math.max(0, Math.min(1, localX / size.w)); }
                else if (minDist === distLeft) { newEdge = 'left'; newPos = Math.max(0, Math.min(1, localY / size.h)); }
                else { newEdge = 'right'; newPos = Math.max(0, Math.min(1, localY / size.h)); }

                dispatch({ type: 'UPDATE_PORT', payload: { id: data.id, updates: { edge: newEdge, position: newPos }, skipHistory: true } });
            };

            const handleMouseUp = () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
                if (!hasMoved) dispatch({ type: 'TOGGLE_SELECTED', payload: data.id });
            };

            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return;
        }

        dispatch({ type: 'SET_SELECTED', payload: data.id });

        const startX = e.clientX;
        const startY = e.clientY;
        dispatch({ type: 'SET_PENDING_CONNECTION', payload: { sourcePortId: data.id, endPos: { x: startX, y: startY } } });

        const handleMouseMove = (moveEvent) => {
            dispatch({ type: 'UPDATE_PENDING_CONNECTION', payload: { x: moveEvent.clientX, y: moveEvent.clientY } });
        };

        const handleMouseUp = (upEvent) => {
            const state = getProjectFlatView(projectId);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);

            const distMoved = Math.hypot(upEvent.clientX - startX, upEvent.clientY - startY);
            if (distMoved < 10) {
                dispatch({ type: 'SET_PENDING_CONNECTION', payload: null });
                return;
            }

            const container = document.getElementById('canvas-container');
            const rect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };
            const p2x = (upEvent.clientX - rect.left - state.canvas.offset.x) / zoom;
            const p2y = (upEvent.clientY - rect.top - state.canvas.offset.y) / zoom;

            const H = window.HierarchyUtils;
            let targetPortId = null;
            let targetProjectId = projectId;
            let minDist = 40 / zoom;

            const { ports, nodes, frames, windows } = state;

            // 1. Ближайший существующий порт своего проекта (узел или рамка,
            // в любом открытом окне).
            Object.values(ports || {}).forEach(port => {
                if (port.id === data.id) return;
                const host = (nodes && nodes[port.nodeId]) || (frames && frames[port.nodeId]);
                if (!host) return;
                const absPos = H ? H.getPortWorldPositionV14(port.id, state) : null;
                if (!absPos) return;
                const dist = Math.hypot(p2x - absPos.x, p2y - absPos.y);
                if (dist < minDist) { minDist = dist; targetPortId = port.id; targetProjectId = projectId; }
            });

            // 1.2 Кросс-проектный порт (Фаза 6.1, восстановлено в Фазе 5):
            // те же критерии, что шаг 1, но на портах ДРУГИХ проектов — их
            // окна уже рисуются на этом же общем холсте в единой мировой
            // системе координат.
            if (!targetPortId && H && H.getPortWorldPositionV14 && projectId) {
                (state.projectOrder || []).forEach(pid => {
                    if (pid === projectId) return;
                    const otherView = getProjectFlatView(pid);
                    if (!otherView || !otherView.ports) return;
                    Object.values(otherView.ports).forEach(port => {
                        const host = (otherView.nodes && otherView.nodes[port.nodeId]) || (otherView.frames && otherView.frames[port.nodeId]);
                        if (!host) return;
                        const absPos = H.getPortWorldPositionV14(port.id, otherView);
                        if (!absPos) return;
                        const dist = Math.hypot(p2x - absPos.x, p2y - absPos.y);
                        if (dist < minDist) { minDist = dist; targetPortId = port.id; targetProjectId = pid; }
                    });
                });
            }

            if (targetPortId && targetProjectId !== projectId) {
                dispatch({
                    type: 'ADD_CROSS_PROJECT_LINK',
                    payload: { sourceProjectId: projectId, sourcePortId: data.id, targetProjectId, targetPortId }
                });
                return;
            }

            if (targetPortId && ports && ports[targetPortId]) {
                dispatch({ type: 'ADD_LINK', payload: { sourcePortId: data.id, targetPortId } });
                return;
            }

            // 2. Дроп внутрь контура карточки узла — авто-порт + связь.
            let targetNodeId = null;
            let newEdge = 'top', newPos = 0.5;
            Object.values(nodes || {}).forEach(node => {
                if (node.id === data.nodeId) return;
                const bounds = H ? H.nodeWorldRect(node.id, state) : null;
                if (!bounds) return;
                if (p2x >= bounds.x && p2x <= bounds.x + bounds.w && p2y >= bounds.y && p2y <= bounds.y + bounds.h) {
                    targetNodeId = node.id;
                    const localX = p2x - bounds.x, localY = p2y - bounds.y;
                    const distTop = Math.abs(localY), distBottom = Math.abs(bounds.h - localY);
                    const distLeft = Math.abs(localX), distRight = Math.abs(bounds.w - localX);
                    const minDist2 = Math.min(distTop, distBottom, distLeft, distRight);
                    if (minDist2 === distTop) { newEdge = 'top'; newPos = Math.max(0.05, Math.min(0.95, localX / bounds.w)); }
                    else if (minDist2 === distBottom) { newEdge = 'bottom'; newPos = Math.max(0.05, Math.min(0.95, localX / bounds.w)); }
                    else if (minDist2 === distLeft) { newEdge = 'left'; newPos = Math.max(0.05, Math.min(0.95, localY / bounds.h)); }
                    else { newEdge = 'right'; newPos = Math.max(0.05, Math.min(0.95, localY / bounds.h)); }
                }
            });

            if (targetNodeId) {
                const newPortId = 'port-' + Date.now() + Math.floor(Math.random() * 1000);
                dispatch({ type: 'ADD_PORT', payload: { id: newPortId, nodeId: targetNodeId, type: data.type === 'output' ? 'input' : 'output', edge: newEdge, position: newPos, name: 'Порт' } });
                dispatch({ type: 'ADD_LINK', payload: { sourcePortId: data.id, targetPortId: newPortId } });
                return;
            }

            // 3. Дроп в свободное пространство дорожки — быстрое ветвление
            // графа: новый узел создаётся ПРЯМО ребёнком дорожки под курсором.
            let targetWin = null, targetOwnerId = null;
            Object.entries(windows || {}).forEach(([wid, win]) => {
                if (!win || win.collapsed) return;
                (win.lanes || []).forEach(ownerId => {
                    const laneRect = H.laneRect(win, ownerId);
                    if (laneRect && p2x >= laneRect.x && p2x <= laneRect.x + laneRect.w && p2y >= laneRect.y && p2y <= laneRect.y + laneRect.h) {
                        targetWin = win; targetOwnerId = ownerId;
                    }
                });
            });

            if (targetWin && targetOwnerId) {
                const local = H.laneRect(targetWin, targetOwnerId);
                const camera = targetWin.camera || { offset: { x: 0, y: 0 }, zoom: 1 };
                const localX = Math.round((p2x - local.x - (camera.offset.x || 0)) / (camera.zoom || 1) - 110);
                const localY = Math.round((p2y - local.y - (camera.offset.y || 0)) / (camera.zoom || 1) - 40);

                const newNodeId = 'node-' + Date.now() + Math.floor(Math.random() * 1000);
                const newPortId = 'port-' + Date.now() + Math.floor(Math.random() * 1000);

                dispatch({
                    type: 'ADD_NODE',
                    payload: {
                        id: newNodeId, name: 'Новый узел', content: '', color: '#0f172a',
                        position: { x: Math.max(20, localX), y: Math.max(20, localY) },
                        size: { w: 220, h: 100 }, parentId: targetOwnerId, shape: 'rectangle', type: 'default'
                    }
                });
                dispatch({ type: 'ADD_PORT', payload: { id: newPortId, nodeId: newNodeId, type: data.type === 'output' ? 'input' : 'output', edge: 'left', position: 0.5, name: 'Вход' } });
                dispatch({ type: 'ADD_LINK', payload: { sourcePortId: data.id, targetPortId: newPortId } });
            } else {
                dispatch({ type: 'SET_PENDING_CONNECTION', payload: null });
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleDoubleClick = (e) => {
        e.stopPropagation();
        dispatch({ type: 'SET_SELECTED', payload: data.id });
        dispatch({ type: 'FOCUS_CONNECTED_ELEMENTS', payload: { entityId: data.id } });
    };

    const isPending = derived.isPending;
    const isSelected = derived.isSelected;
    const maxInternalDepth = derived.maxInternalDepth;
    const portColor = data.color || '#374151';

    let ringClasses = '';
    if (!isPending && !isSelected) {
        if (maxInternalDepth === 1) {
            ringClasses = 'ring-2 ring-offset-2 ring-offset-[#0f1115] ring-gray-400';
        } else if (maxInternalDepth >= 2) {
            ringClasses = 'ring-[3px] ring-offset-[3px] ring-offset-[#0f1115] ring-gray-400 shadow-[0_0_0_6px_#0f1115,0_0_0_7px_#9ca3af]';
        }
    }

    return (
        <div
            className={`absolute w-3 h-3 border border-gray-400 rounded-full transform -translate-x-1/2 -translate-y-1/2 transition-all duration-200
                ${isPending ? 'bg-yellow-400 ring-2 ring-yellow-400 z-30' : 'z-20'}
                ${isSelected && !isPending ? 'ring-1 ring-white scale-[2.1] !z-50' : ringClasses}
                cursor-crosshair
            `}
            style={{
                left, top,
                backgroundColor: !isPending ? portColor : undefined,
                ...(isSelected && !isPending ? { boxShadow: `0 0 15px ${portColor}CC` } : {})
            }}
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
            title={`Порт ${data.name ? `${data.name} (${data.type})` : data.type}`}
            data-port-id={data.id}
            data-node-id={nodeData.id}
            data-edge={data.edge}
        />
    );
}

const MemoizedPort = React.memo ? React.memo(Port) : Port;
if (typeof window !== 'undefined') window.Port = MemoizedPort;
if (typeof module !== 'undefined') module.exports = MemoizedPort;
