const computeLayerDerived = (view, layerId) => {
    if (!layerId || !view) return { ok: false };
    const layers = view.layers || {};
    const layer = layers[layerId];
    if (!layer) return { ok: false };

    const selectedIds = view.selectedIds || [];
    const isExplicitlySelected = selectedIds.includes(layerId);

    const H = window.HierarchyUtils;
    const ports = view.ports || {};
    const myPorts = (H && H.getPortsByNodeId)
        ? (H.getPortsByNodeId(ports)[layerId] || [])
        : Object.values(ports).filter(p => p && p.nodeId === layerId);
    const portIds = myPorts.map(p => p.id);

    let connected = isExplicitlySelected;
    if (!connected && H && H.getLinksByPortId) {
        connected = myPorts.some(p => selectedIds.includes(p.id));
        if (!connected) {
            const linksByPort = H.getLinksByPortId(view.links || {});
            connected = myPorts.some(p => (linksByPort[p.id] || []).some(l => {
                if (!l) return false;
                if (selectedIds.includes(l.id)) return true;
                const oppId = l.sourcePortId === p.id ? l.targetPortId : l.sourcePortId;
                if (!oppId) return false;
                if (selectedIds.includes(oppId)) return true;
                const opp = ports[oppId];
                return !!(opp && selectedIds.includes(opp.nodeId));
            }));
        }
    }
    const isSelected = connected;
    const zoom = (view.canvas && view.canvas.zoom) || 1;
    const nodes = view.nodes || {};
    const absPos = (H && H.getLocalPosition) ? H.getLocalPosition(layerId, nodes, layers) : (layer.position || { x: 0, y: 0 });
    const interactionMode = view.interactionMode || 'default';
    const dropTargetL = view.dragGesture && view.dragGesture.target;
    const isDropReceiver = !!(dropTargetL && dropTargetL.kind === 'layer' && dropTargetL.id === layerId && dropTargetL.valid);

    return {
        ok: true,
        layer,
        isExplicitlySelected,
        isSelected,
        zoom,
        absPos,
        portIds,
        interactionMode,
        isDropReceiver
    };
};

function Layer(props) {
    if (typeof StoreEngine !== 'undefined') StoreEngine.profileRender('Layer');
    const data = props.data || props.layer;
    const layerId = data ? data.id : null;
    const dispatch = useProjectDispatch();
    const projectId = React.useContext(ProjectContext);

    const selectDerived = React.useCallback(
        (view) => computeLayerDerived(view, layerId),
        [layerId]
    );
    const derived = useProjectSelector(selectDerived);

    if (!data || !derived || !derived.ok) return null;
    const isExplicitlySelected = derived.isExplicitlySelected;
    const isSelected = derived.isSelected;
    const zoom = derived.zoom;
    const absPos = derived.absPos;
    const portIds = derived.portIds;
    const interactionMode = derived.interactionMode;
    const isDropReceiver = derived.isDropReceiver;

    const handleMouseDown = (e) => {
        // Prevent map panning on header drag (Shift+LMB handles map panning in Canvas)
        if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
            // Если хотим выделять слои шифтом:
            if (e.shiftKey && e.button === 0) {
                e.stopPropagation();
                dispatch({ type: 'TOGGLE_SELECTED', payload: data.id });
                return;
            }
            return; 
        }
        
        e.stopPropagation();
        if (e.button !== 0) return; // Only left click

        if (projectId) {
            const rootState = (typeof architectorStore !== 'undefined') ? architectorStore.getState() : null;
            if (rootState && rootState.activeProjectId !== projectId) {
                dispatch({ type: 'SET_ACTIVE_PROJECT', payload: projectId });
            }
        }

        if (!isExplicitlySelected) {
            dispatch({ type: 'SET_SELECTED', payload: data.id });
        }

        const state = getProjectFlatView(projectId);
        const startX = e.clientX;
        const startY = e.clientY;

        // Поиск узлов внутри только для этого слоя, если включен замок.
        // v10: дети слоя (parentId === data.id) едут вместе со слоем автоматически,
        // захватываем только соседей по контексту, геометрически лежащих в границах слоя.
        const lw = data.size?.w || 600;
        const lh = data.size?.h || 400;
        const startPosX = absPos.x;
        const startPosY = absPos.y;

        const nodesInside = data.locked ? Object.values(state.nodes || {}).filter(node => {
            if (node.parentId === data.id) return false; // ребёнок, едет сам
            const nodeContext = node.parentId || 'root';
            const layerContext = data.parentId || 'root';
            if (nodeContext !== layerContext) return false;

            const nodeAbs = window.HierarchyUtils.getLocalPosition(node.id, state.nodes, state.layers);
            const nw = node.size?.w || 200;
            const nh = node.size?.h || 100;
            const nodeCX = nodeAbs.x + nw / 2;
            const nodeCY = nodeAbs.y + nh / 2;
            return nodeCX >= startPosX && nodeCX <= startPosX + lw &&
                   nodeCY >= startPosY && nodeCY <= startPosY + lh;
        }).map(n => n.id) : [];

        // Добавляем узлы в массив выделенных виртуально (чтобы двигать их вместе)
        const allIdsToMove = new Set([...(state.selectedIds || []), ...nodesInside]);

        let hasMoved = false;
        const initialSnapshot = { layers: state.layers, nodes: state.nodes, ports: state.ports, links: state.links };

        const initialPositions = {};
        allIdsToMove.forEach(id => {
            if (state.nodes && state.nodes[id]) initialPositions[id] = { ...state.nodes[id].position };
            else if (state.layers && state.layers[id]) initialPositions[id] = { ...state.layers[id].position };
        });

        // ==== Drag&Drop: перенос СЛОЯ (PLAN_LAYERS_AND_CONTEXT_CREATION.md,
        // 2026-08-30 — этап 3 PLAN_DRAG_AND_DROP.md). Портировано из Node.js:
        // резолвер цели, подсветка, подтверждение, откат — тот же паттерн.
        // «Только верхние» из выделения (свои потомки едут в связке), как в Node.js;
        // это ОТДЕЛЬНЫЙ набор от allIdsToMove (тот — визуальные пассажиры-соседи
        // при locked-слое, они не переносятся).
        const H = window.HierarchyUtils;
        // Фикс (2026-08-30, по итогам ручного тестирования): расталкивание
        // соседей должно гаситься ВЕСЬ жест целиком, пока включён режим
        // Drag&Drop — а не только когда резолвер цели (throttled, раз в кадр)
        // уже успел найти конкретный валидный слой/узел под курсором. Иначе
        // расталкивание и резолвер цели гонятся друг за другом, и слой не
        // получается устойчиво навести на другой слой для вложения. Тумблер
        // физически нельзя переключить той же рукой, что держит перетаскивание,
        // поэтому фиксация на старте жеста безопасна.
        // Значение НЕ приводим к boolean: тумблер трёхпозиционный
        // (false / 'deep' / 'shallow' — PLAN_SHALLOW_TRANSFER_DND.md), а не
        // только вкл/выкл, и конкретный выбранный режим переноса нужен ниже,
        // в handleMouseUp, для TRANSFER_NODE (премортем, риск 7: хоткеем можно
        // сменить режим второй рукой посреди жеста — исход уже начатого
        // переноса от этого меняться не должен).
        const dragDropModeAtStart = (state.ui && state.ui.dragDropMode) || false;

        // Deep/Shallow (v13, REPARENT_ENTITY): в отличие от тумблера DnD, режим
        // переноса ЖИВОЙ — Alt можно нажать или отпустить в процессе перетаскивания,
        // не только держать с самого начала (PLAN_V12_CLEAN_HIERARCHY_AND_INTERACTIONS.md,
        // Фаза 5.2). Читается в момент mouseup, а не фиксируется на старте.
        let shallowMode = e.altKey;
        let lastMoveEvent = e;

        const topDraggedIds = (st) => {
            const sel = (st.selectedIds || []).filter(sid => st.nodes[sid] || (st.layers && st.layers[sid]));
            const ids = sel.includes(data.id) && sel.length > 0 ? sel : [data.id];
            return ids.filter(nid => !ids.some(other =>
                other !== nid && H && H.hasAncestorIn && H.hasAncestorIn(nid, [other], st.nodes, st.layers)));
        };

        const computeTarget = (ev) => {
            const st = getProjectFlatView(projectId);
            const container = document.getElementById('canvas-container');
            const rect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };
            const wx = (ev.clientX - rect.left - st.canvas.offset.x) / st.canvas.zoom;
            const wy = (ev.clientY - rect.top - st.canvas.offset.y) / st.canvas.zoom;
            const ids = topDraggedIds(st);
            const target = (H && H.getDropTarget)
                ? H.getDropTarget(ids, { x: wx, y: wy }, st, { dragDropMode: !!(st.ui && st.ui.dragDropMode) })
                : null;
            return { st, ids, target };
        };

        // Резолвер цели (подсветка/курсор/текст подтверждения) считается не
        // чаще раза в кадр (raf) — на решение «гасить ли расталкивание» больше
        // не влияет (см. dragDropModeAtStart выше), это отдельная забота.
        let lastTargetKey = null;
        let gesturePending = null;
        const updateGestureThrottled = (ev) => {
            const point = { clientX: ev.clientX, clientY: ev.clientY };
            if (gesturePending !== null) { gesturePending = point; return; }
            gesturePending = point;
            requestAnimationFrame(() => {
                const p = gesturePending;
                gesturePending = null;
                if (p) updateGesture(p);
            });
        };
        const updateGesture = (ev) => {
            lastMoveEvent = ev;
            const { st, ids, target } = computeTarget(ev);
            const key = (target ? `${target.kind}:${target.id}:${target.valid}` : 'void') + ':' + (shallowMode ? 'shallow' : 'deep');
            if (key === lastTargetKey) return;
            lastTargetKey = key;
            dispatch({ type: 'SET_DRAG_GESTURE', payload: { ids, target, mode: shallowMode ? 'shallow' : 'deep' } });
            const dndOn = !!(st.ui && st.ui.dragDropMode);
            document.body.style.cursor = (dndOn && (!target || !target.valid)) ? 'not-allowed' : '';
        };

        const cleanup = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            document.body.style.cursor = '';
        };

        // Откат жеста: сущности возвращаются к срезу на mousedown (без истории)
        const restoreGesture = () => {
            dispatch({ type: 'RESTORE_ENTITIES', payload: { nodes: initialSnapshot.nodes, layers: initialSnapshot.layers } });
        };

        const handleKeyDown = (kev) => {
            if (kev.key === 'Escape') {
                cleanup();
                if (hasMoved) restoreGesture();
                else dispatch({ type: 'SET_DRAG_GESTURE', payload: null });
                return;
            }
            if (kev.key === 'Alt' && !shallowMode) {
                shallowMode = true;
                if (hasMoved) updateGestureThrottled(lastMoveEvent);
            }
        };
        const handleKeyUp = (kev) => {
            if (kev.key === 'Alt' && shallowMode) {
                shallowMode = false;
                if (hasMoved) updateGestureThrottled(lastMoveEvent);
            }
        };

        const handleMouseMove = (moveEvent) => {
            hasMoved = true;
            let dx = (moveEvent.clientX - startX) / zoom;
            let dy = (moveEvent.clientY - startY) / zoom;

            if (data.snapToGrid) {
                const step = 30; // Grid size
                const targetX = initialPositions[data.id].x + dx;
                const targetY = initialPositions[data.id].y + dy;
                const snappedX = Math.round(targetX / step) * step;
                const snappedY = Math.round(targetY / step) * step;
                dx = snappedX - initialPositions[data.id].x;
                dy = snappedY - initialPositions[data.id].y;
            }

            const rawX = initialPositions[data.id].x + dx;
            const rawY = initialPositions[data.id].y + dy;

            // Расталкивание соседей гасится ВСЮ длительность жеста, пока включён
            // режим Drag&Drop — независимо от того, навелись ли уже точно на
            // конкретную валидную цель. Так другие слои «пропускают» перетаскиваемый
            // слой сквозь себя и дают его вложить — ровно как через поповер
            // «Назначить на слой» (там расталкивания никогда не было).
            const suppressCollision = !!dragDropModeAtStart;
            let resolvedDx, resolvedDy;
            if (suppressCollision) {
                resolvedDx = dx;
                resolvedDy = dy;
            } else {
                const resolved = window.GeometryUtils.resolveLayerCollision(
                    data.id, rawX, rawY, lw, lh, state.layers
                );
                resolvedDx = resolved.x - initialPositions[data.id].x;
                resolvedDy = resolved.y - initialPositions[data.id].y;
            }

            // Только координатное вложение (parentId) — не ownerId (Plan_fix.md):
            // общий HierarchyUtils.hasContainerAncestorIn вместо локальной копии.
            // ⚠️ allIdsToMove — массив, не Set (toFocusList не разворачивает Set).
            const hasSelectedAncestor = (id) => H && H.hasContainerAncestorIn
                ? H.hasContainerAncestorIn(id, allIdsToMove, state.nodes, state.layers)
                : false;

            allIdsToMove.forEach(id => {
                if (initialPositions[id]) {
                    if (hasSelectedAncestor(id)) return;
                    const effectiveDx = resolvedDx;
                    const effectiveDy = resolvedDy;
                    if (state.nodes && state.nodes[id]) {
                        dispatch({ type: 'UPDATE_NODE', payload: { id, updates: { position: { x: initialPositions[id].x + effectiveDx, y: initialPositions[id].y + effectiveDy } }, skipHistory: true } });
                    } else if (state.layers && state.layers[id]) {
                        dispatch({ type: 'UPDATE_LAYER', payload: { id, updates: { position: { x: initialPositions[id].x + effectiveDx, y: initialPositions[id].y + effectiveDy } }, skipHistory: true } });
                    }
                }
            });

            updateGestureThrottled(moveEvent);
        };

        const handleMouseUp = (upEvent) => {
            cleanup();

            if (!hasMoved) return;

            const { st, ids, target } = computeTarget(upEvent);
            const dndOn = !!(st.ui && st.ui.dragDropMode);
            const clearGesture = () => dispatch({ type: 'SET_DRAG_GESTURE', payload: null });

            const isTransfer = target && target.valid && !(target.kind === 'window' && target.isMove);
            if (isTransfer && H) {
                const mode = shallowMode ? 'shallow' : 'deep';
                const text = H.buildTransferConfirmText
                    ? H.buildTransferConfirmText(ids, target, st, mode)
                    : 'Перенести выбранные элементы?';
                if (window.confirm(text)) {
                    clearGesture();
                    const basePayload = {
                        ids,
                        mode,
                        historySnapshot: {
                            nodes: initialSnapshot.nodes,
                            layers: initialSnapshot.layers,
                            ports: initialSnapshot.ports,
                            links: initialSnapshot.links
                        }
                    };
                    // v13 REPARENT_ENTITY: цель узла/слоя — напрямую targetParentId
                    // (единственное поле родства), окно резолвится в targetLevelIndex.
                    if (target.kind === 'node' || target.kind === 'layer') {
                        dispatch({ type: 'REPARENT_ENTITY', payload: { ...basePayload, targetParentId: target.id } });
                    } else {
                        const win = st.levelWindows[target.id];
                        const positionsById = H.computeDropPositions
                            ? H.computeDropPositions(ids, win, st)
                            : null;
                        dispatch({ type: 'REPARENT_ENTITY', payload: { ...basePayload, targetLevelIndex: win.levelIndex, ...(positionsById ? { positionsById } : {}) } });
                    }
                } else {
                    restoreGesture();
                }
                return;
            }

            if (dndOn && (!target || !target.valid)) {
                restoreGesture();
                return;
            }

            clearGesture();
            dispatch({
                type: 'COMMIT_HISTORY',
                payload: { snapshot: initialSnapshot, logMessage: `Перемещение слоя: ${data.name}` }
            });
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
    };

    const handleResizeMouseDown = (e) => {
        e.stopPropagation();
        e.preventDefault();
        dispatch({ type: 'SET_SELECTED', payload: data.id });

        const state = getProjectFlatView(projectId);
        const startX = e.clientX;
        const startY = e.clientY;
        const startW = data.size?.w || 600;
        const startH = data.size?.h || 400;
        
        let hasMoved = false;
        const initialSnapshot = { layers: state.layers, nodes: state.nodes, ports: state.ports, links: state.links };

        const handleMouseMove = (moveEvent) => {
            hasMoved = true;
            const dx = (moveEvent.clientX - startX) / zoom;
            const dy = (moveEvent.clientY - startY) / zoom;
            
            const newW = Math.max(200, startW + dx);
            const newH = Math.max(100, startH + dy);

            dispatch({
                type: 'UPDATE_LAYER',
                payload: {
                    id: data.id,
                    updates: { size: { w: newW, h: newH } },
                    skipHistory: true
                }
            });
        };

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            if (hasMoved) {
                dispatch({
                    type: 'COMMIT_HISTORY',
                    payload: { snapshot: initialSnapshot, logMessage: `Изменен размер слоя: ${data.name}` }
                });
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleAutoLayout = (e) => {
        e.stopPropagation();
        const state = getProjectFlatView(projectId);
        const layerNodes = (window.HierarchyUtils && window.HierarchyUtils.getNodesByParentId)
            ? (window.HierarchyUtils.getNodesByParentId(state.nodes)[data.id] || [])
            : Object.values(state.nodes || {}).filter(n => n.parentId === data.id);
        if (layerNodes.length === 0) return;
        
        const { updatesById, newLayerSize } = window.GeometryUtils.getSmartPlacement(layerNodes, data, state.nodes, state.layers);
        
        dispatch({ type: 'UPDATE_LAYER', payload: { id: data.id, updates: { size: newLayerSize } } });
        dispatch({ type: 'MASS_UPDATE', payload: { ids: layerNodes.map(n=>n.id), updatesById } });
    };

    const handleBodyClick = (e) => {
        // Selection on body click
        e.stopPropagation();
        if (projectId) {
            const rootState = (typeof architectorStore !== 'undefined') ? architectorStore.getState() : null;
            if (rootState && rootState.activeProjectId !== projectId) {
                dispatch({ type: 'SET_ACTIVE_PROJECT', payload: projectId });
            }
        }
        if (e.shiftKey) {
            dispatch({ type: 'TOGGLE_SELECTED', payload: data.id });
        } else {
            dispatch({ type: 'SET_SELECTED', payload: data.id });
        }
    };

    return (
        <div
            className={`absolute flex flex-col transition-all duration-200 border-2 rounded-xl pointer-events-auto
                ${isSelected || isDropReceiver ? 'z-0 shadow-lg' : '-z-10 shadow-sm'}
            `}
            style={{
                left: absPos.x,
                top: absPos.y,
                width: data.size?.w || 600,
                height: data.size?.h || 400,
                backgroundColor: data.color ? `${data.color}20` : 'rgba(255,255,255,0.02)', // 20 hex is ~12% opacity
                borderColor: isDropReceiver ? '#34d399' : (isSelected ? (data.color || '#444') : (data.color ? `${data.color}40` : '#333')),
                ...(isDropReceiver ? { boxShadow: '0 0 30px rgba(52,211,153,0.6)' } : {})
            }}
            onClick={handleBodyClick}
            onDoubleClick={(e) => {
                e.stopPropagation();
                dispatch({ type: 'FOCUS_CONNECTED_ELEMENTS', payload: { entityId: data.id } });
            }}
            data-file="components/Layer.js"
        >
            <div 
                className="px-4 py-3 rounded-t-xl flex flex-col justify-center text-sm cursor-move z-10 shrink-0 select-none"
                style={{
                    backgroundColor: data.color ? `${data.color}40` : 'rgba(0,0,0,0.4)',
                    borderBottom: `2px solid ${isSelected ? (data.color || '#444') : (data.color ? `${data.color}40` : '#333')}`,
                    fontFamily: data.fontFamily || 'inherit'
                }}
                onMouseDown={handleMouseDown}
            >
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-[#eee] text-base overflow-hidden">
                        <span 
                            className="truncate"
                            style={{ fontSize: data.fontSize ? `${Math.max(14, Math.round(data.fontSize * 1.15))}px` : undefined }}
                        >
                            {data.name}
                        </span>
                    </div>
                    <div className="flex gap-1">
                        <button 
                            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={handleAutoLayout}
                            title="Авто-выравнивание элементов"
                        >
                            <div className="icon-layout-grid"></div>
                        </button>
                        <button 
                            className={`p-1.5 rounded transition-colors ${data.locked ? 'text-white bg-white/20' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                dispatch({
                                    type: 'UPDATE_LAYER',
                                    payload: { id: data.id, updates: { locked: !data.locked } }
                                });
                            }}
                            title={data.locked ? "Открепить элементы" : "Закрепить элементы (перемещать вместе со слоем)"}
                        >
                            <div className={data.locked ? "icon-lock" : "icon-lock-open"}></div>
                        </button>
                    </div>
                </div>
                {data.content && (
                    <div 
                        className="text-xs text-gray-300 mt-1 line-clamp-2 leading-tight opacity-80"
                        style={{ fontSize: data.fontSize ? `${data.fontSize}px` : undefined }}
                    >
                        {data.content}
                    </div>
                )}
            </div>
            
            <div className="flex-1 pointer-events-none"></div>
            
            {/* Render Ports */}
            {zoom >= 0.4 && portIds.map(portId => (
                <Port key={portId} portId={portId} nodeId={data.id} localZoom={1} />
            ))}

            {/* Overlay for Add Port Mode */}
            {interactionMode === 'add-port' && (
                <div 
                    className="absolute inset-[-4px] cursor-crosshair border-2 border-dashed border-green-500/50 z-20 rounded-xl"
                    onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const y = e.clientY - rect.top;
                        const w = rect.width;
                        const h = rect.height;
                        
                        // Determine closest edge
                        const distTop = y;
                        const distBottom = h - y;
                        const distLeft = x;
                        const distRight = w - x;
                        
                        const minDist = Math.min(distTop, distBottom, distLeft, distRight);
                        let edge, position;
                        
                        if (minDist === distTop) { edge = 'top'; position = Math.max(0.05, Math.min(0.95, x / w)); }
                        else if (minDist === distBottom) { edge = 'bottom'; position = Math.max(0.05, Math.min(0.95, x / w)); }
                        else if (minDist === distLeft) { edge = 'left'; position = Math.max(0.05, Math.min(0.95, y / h)); }
                        else { edge = 'right'; position = Math.max(0.05, Math.min(0.95, y / h)); }

                        dispatch({
                            type: 'ADD_PORT',
                            payload: {
                                nodeId: data.id,
                                type: edge === 'left' ? 'input' : 'output',
                                position: position,
                                edge: edge,
                                name: 'Порт'
                            }
                        });
                    }}
                >
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-500/80 text-white text-xs px-2 py-1 rounded shadow select-none pointer-events-none">
                        Клик по грани слоя
                    </div>
                </div>
            )}

            <div 
                className="absolute bottom-0 right-0 w-8 h-8 cursor-nwse-resize z-20 flex items-end justify-end p-2 group"
                onMouseDown={handleResizeMouseDown}
                title="Потяните, чтобы изменить размер"
            >
                <div className="w-3 h-3 border-r-[3px] border-b-[3px] border-gray-500 rounded-br-[3px] group-hover:border-white transition-colors"></div>
            </div>
        </div>
    );
}