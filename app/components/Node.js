// v14 (Фаза 4): позиция узла — ЛОКАЛЬНАЯ координата внутри дорожки его
// родителя (§2.3 LANES_MODEL.md: «position ребёнка считается от дорожки, то
// есть от родителя»), без накопления через цепочку слоёв, как было в v13
// (getLocalPosition). Поэтому node.position используется здесь НАПРЯМУЮ как
// CSS left/top — Lane.js уже поместил этот компонент внутрь уже
// трансформированного (translate/scale камеры окна) контейнера дорожки.
const computeNodeDerived = (view, nodeId, projectId) => {
    const empty = {
        node: null, portIdsKey: '', frameChipsKey: '', interactionMode: 'default', zoom: 1,
        isSelected: false, isExplicitlySelected: false, childCount: 0, isDropReceiver: false
    };
    if (!nodeId || !view) return empty;

    const H = window.HierarchyUtils;
    const ports = view.ports || {};
    const selectedIds = view.selectedIds || [];

    const isExplicitlySelected = selectedIds.includes(nodeId);
    let connected = isExplicitlySelected;

    if (!connected && H && H.getPortsByNodeId && H.getLinksByPortId) {
        const myPorts = H.getPortsByNodeId(ports)[nodeId] || [];
        connected = myPorts.some(p => selectedIds.includes(p.id));
        if (!connected) {
            const linksByPort = H.getLinksByPortId(view.links);
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

    const childCount = (H && H.getChildrenByParent)
        ? (H.getChildrenByParent(view.nodes)[nodeId] || []).length
        : Object.values(view.nodes || {}).filter(n => n && (n.parentId || 'root') === nodeId).length;

    const dropTarget = view.dragGesture && view.dragGesture.target;

    const myPorts = (H && H.getPortsByNodeId) ? (H.getPortsByNodeId(ports)[nodeId] || []) : [];
    const portIdsKey = myPorts.map(p => p.id).sort().join(',');

    // Чипы рамок-владельцев (§12 LANES_MODEL.md): узел может состоять в
    // нескольких рамках одновременно — карточка показывает все.
    const frames = (H && H.framesOf) ? H.framesOf(nodeId, view.frames) : [];
    const frameChipsKey = frames.map(f => `${f.id}:${f.name || ''}:${f.color || ''}`).join('|');

    return {
        node: (view.nodes || {})[nodeId] || null,
        portIdsKey,
        frameChipsKey,
        interactionMode: view.interactionMode || 'default',
        zoom: (view.canvas && view.canvas.zoom) || 1,
        isSelected: connected,
        isExplicitlySelected,
        childCount,
        isDropReceiver: !!(dropTarget && dropTarget.nodeId === nodeId && dropTarget.valid
            && (!dropTarget.projectId || dropTarget.projectId === projectId))
    };
};

function NodeView(props) {
    if (typeof StoreEngine !== 'undefined') StoreEngine.profileRender('Node');
    const dispatch = useProjectDispatch();
    const projectId = React.useContext(ProjectContext);

    const nodeId = props.nodeId || (props.data && props.data.id) || (props.node && props.node.id) || null;
    const selectDerived = React.useCallback((view) => computeNodeDerived(view, nodeId, projectId), [nodeId, projectId]);
    const derived = useProjectSelector(selectDerived);

    const data = derived.node || props.data || props.node;
    if (!data) return null;

    const stateRef = { get current() { return getProjectFlatView(projectId); } };
    const state = React.useMemo(() => (typeof Proxy !== 'undefined'
        ? new Proxy({}, { get: (_t, key) => getProjectFlatView(projectId)[key] })
        : null), [projectId]);

    const isExplicitlySelected = derived.isExplicitlySelected;
    const isSelected = derived.isSelected;

    const zoom = derived.zoom;
    const localZoom = props.zoom || 1;
    const effectiveZoom = zoom * localZoom;

    const H = window.HierarchyUtils;
    const isDropReceiver = derived.isDropReceiver;

    const handleMouseDown = (e) => {
        if (e.button === 1) return;
        e.stopPropagation();
        if (e.button !== 0) return;

        if (projectId) {
            const rootState = (typeof architectorStore !== 'undefined') ? architectorStore.getState() : null;
            if (rootState && rootState.activeProjectId !== projectId) {
                dispatch({ type: 'SET_ACTIVE_PROJECT', payload: projectId });
            }
        }

        if (!e.shiftKey && !isExplicitlySelected) {
            dispatch({ type: 'SET_SELECTED', payload: data.id });
        }

        const startX = e.clientX;
        const startY = e.clientY;

        let hasMoved = false;
        const initialSnapshot = { nodes: state.nodes, frames: state.frames, ports: state.ports, links: state.links };

        let cumulativeDx = 0;
        let cumulativeDy = 0;

        // Deep/Shallow — живой, Alt читается весь жест (§7 LANES_MODEL.md).
        let shallowMode = e.altKey;

        const topDraggedIds = (st) => {
            const sel = (st.selectedIds || []).filter(sid => st.nodes[sid]);
            const ids = sel.includes(data.id) && sel.length > 0 ? sel : [data.id];
            return ids.filter(nid => !ids.some(other =>
                other !== nid && H && H.isDescendantOfV14 && H.isDescendantOfV14(nid, other, st.nodes)));
        };

        const computeTarget = (ev) => {
            const st = stateRef.current;
            const container = document.getElementById('canvas-container');
            const rect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };
            const wx = (ev.clientX - rect.left - st.canvas.offset.x) / st.canvas.zoom;
            const wy = (ev.clientY - rect.top - st.canvas.offset.y) / st.canvas.zoom;
            const ids = topDraggedIds(st);
            const opts = { dragDropMode: !!(st.ui && st.ui.dragDropMode) };
            // Однопроектный резолвер (Фаза 5 — кросс-проектный перенос узлов
            // через drag&drop, см. §5 плана «Порты, связи, мульти-проект»).
            const target = (H && H.resolveDropTarget) ? H.resolveDropTarget({ x: wx, y: wy }, ids, st, opts) : { ok: false };
            return { st, ids, target, world: { x: wx, y: wy } };
        };

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
            const key = `${target.ok}:${target.windowId || ''}:${target.ownerId || ''}:${target.nodeId || ''}:${target.frameId || ''}:${target.isMove}` + ':' + (shallowMode ? 'shallow' : 'deep');
            if (key === lastTargetKey) return;
            lastTargetKey = key;
            dispatch({ type: 'SET_DRAG_GESTURE', payload: { ids, target, mode: shallowMode ? 'shallow' : 'deep' } });
            const dndOn = !!(st.ui && st.ui.dragDropMode);
            document.body.style.cursor = (dndOn && !target.ok) ? 'not-allowed' : '';
        };

        const cleanup = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            document.body.style.cursor = '';
        };

        const restoreGesture = () => {
            dispatch({ type: 'RESTORE_ENTITIES', payload: { nodes: initialSnapshot.nodes } });
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
        let lastMoveEvent = e;

        const handleMouseMove = (moveEvent) => {
            const distMoved = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
            if (distMoved > 3) hasMoved = true;
            if (!hasMoved) return;

            const totalDx = (moveEvent.clientX - startX) / effectiveZoom;
            const totalDy = (moveEvent.clientY - startY) / effectiveZoom;

            let stepDx = totalDx - cumulativeDx;
            let stepDy = totalDy - cumulativeDy;

            if (data.snapToGrid) {
                const step = 30;
                const targetX = initialSnapshot.nodes[data.id].position.x + totalDx;
                const targetY = initialSnapshot.nodes[data.id].position.y + totalDy;
                const newX = Math.round(targetX / step) * step;
                const newY = Math.round(targetY / step) * step;
                stepDx = newX - (initialSnapshot.nodes[data.id].position.x + cumulativeDx);
                stepDy = newY - (initialSnapshot.nodes[data.id].position.y + cumulativeDy);
            }

            if (stepDx !== 0 || stepDy !== 0) {
                cumulativeDx += stepDx;
                cumulativeDy += stepDy;
                // MOVE_SELECTED сам клампит дельту дорожкой, если ui.dragDropMode
                // выключен (§6 LANES_MODEL.md — «мягкая остановка на границе»).
                dispatch({ type: 'MOVE_SELECTED', payload: { dx: stepDx, dy: stepDy, skipHistory: true } });
            }

            updateGestureThrottled(moveEvent);
        };

        const handleMouseUp = (upEvent) => {
            cleanup();

            if (!hasMoved) {
                if (e.shiftKey) {
                    dispatch({ type: 'TOGGLE_SELECTED', payload: data.id });
                } else if (!isExplicitlySelected || (state.selectedIds && state.selectedIds.length > 1)) {
                    dispatch({ type: 'SET_SELECTED', payload: data.id });
                }
                return;
            }

            const { st, ids, target, world } = computeTarget(upEvent);
            const dndOn = !!(st.ui && st.ui.dragDropMode);
            const clearGesture = () => dispatch({ type: 'SET_DRAG_GESTURE', payload: null });

            if (!target.ok) {
                if (dndOn) { restoreGesture(); return; }
                clearGesture();
                dispatch({ type: 'COMMIT_HISTORY', payload: { snapshot: initialSnapshot, logMessage: `Перемещен узел: ${data.name}` } });
                return;
            }

            const applyFrameMembership = () => {
                if (target.frameId) dispatch({ type: 'FRAME_ADD_MEMBERS', payload: { frameId: target.frameId, ids } });
            };

            if (target.isMove) {
                // Перемещение в пределах своей же дорожки — не перенос.
                clearGesture();
                dispatch({ type: 'COMMIT_HISTORY', payload: { snapshot: initialSnapshot, logMessage: `Перемещен узел: ${data.name}` } });
                applyFrameMembership();
                return;
            }

            // Nest/Extract: targetParentId — карточка (nodeId) либо дорожка (ownerId).
            const mode = shallowMode ? 'shallow' : 'deep';
            const targetParentId = target.nodeId || target.ownerId;
            clearGesture();
            const payload = {
                ids, mode,
                // Весь жест (движение + перенос) — один шаг Undo (§7.3 LANES_MODEL.md).
                historySnapshot: initialSnapshot,
                targetParentId
            };
            if (ids.length === 1 && target.ownerId && !target.nodeId) {
                // Одиночный дроп на фон дорожки — узел приземляется туда, куда
                // реально указал курсор, а не в авто-найденную свободную точку.
                const win = st.windows[target.windowId];
                const lane = H.laneRect(win, target.ownerId);
                const camera = win.camera || { offset: { x: 0, y: 0 }, zoom: 1 };
                if (lane) {
                    payload.position = {
                        x: (world.x - lane.x - (camera.offset.x || 0)) / (camera.zoom || 1),
                        y: (world.y - lane.y - (camera.offset.y || 0)) / (camera.zoom || 1)
                    };
                }
            }
            dispatch({ type: 'REPARENT_ENTITY', payload });
            applyFrameMembership();
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

        const startX = e.clientX;
        const startY = e.clientY;
        const startW = data.size?.w || 200;
        const startH = data.size?.h || 100;

        let hasMoved = false;
        const initialSnapshot = { nodes: state.nodes, ports: state.ports, links: state.links };

        const handleMouseMove = (moveEvent) => {
            hasMoved = true;
            const dx = (moveEvent.clientX - startX) / effectiveZoom;
            const dy = (moveEvent.clientY - startY) / effectiveZoom;

            const newW = Math.max(100, startW + dx);
            const newH = Math.max(80, startH + dy);

            dispatch({ type: 'UPDATE_NODE', payload: { id: data.id, updates: { size: { w: newW, h: newH }, userResized: true }, skipHistory: true } });
        };

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            if (hasMoved) {
                dispatch({ type: 'COMMIT_HISTORY', payload: { snapshot: initialSnapshot, logMessage: `Изменен размер узла: ${data.name}` } });
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleImageLoad = (e) => {
        const { naturalWidth, naturalHeight } = e.target;
        if (naturalWidth && naturalHeight && !data.mediaHeight) {
            const targetW = Math.max(200, Math.min(naturalWidth, 400));
            const targetH = Math.round(targetW * (naturalHeight / naturalWidth));
            dispatch({ type: 'UPDATE_NODE', payload: { id: data.id, updates: { mediaHeight: targetH }, skipHistory: true } });
        }
    };

    const [isEditingName, setIsEditingName] = React.useState(false);
    const [tempName, setTempName] = React.useState(data.name || '');
    const nameInitialSnapshotRef = React.useRef(null);
    const nameInitialValueRef = React.useRef('');
    const nameTextareaRef = React.useRef(null);
    const [isEditingContent, setIsEditingContent] = React.useState(false);
    const [tempContent, setTempContent] = React.useState(data.content || '');
    const contentInitialSnapshotRef = React.useRef(null);
    const contentInitialValueRef = React.useRef('');
    const contentTextareaRef = React.useRef(null);

    React.useLayoutEffect(() => {
        if (isEditingName && nameTextareaRef.current) {
            nameTextareaRef.current.style.height = 'auto';
            nameTextareaRef.current.style.height = `${nameTextareaRef.current.scrollHeight}px`;
        }
    }, [isEditingName, tempName]);

    React.useLayoutEffect(() => {
        if (isEditingContent && contentTextareaRef.current) {
            contentTextareaRef.current.style.height = 'auto';
            contentTextareaRef.current.style.height = `${contentTextareaRef.current.scrollHeight}px`;
        }
    }, [isEditingContent, tempContent]);

    React.useEffect(() => { setTempName(data.name || ''); }, [data.name]);
    React.useEffect(() => { setTempContent(data.content || ''); }, [data.content]);

    const childCount = derived.childCount;
    const portIds = React.useMemo(
        () => (derived.portIdsKey ? derived.portIdsKey.split(',') : []),
        [derived.portIdsKey]
    );
    const frameChips = React.useMemo(
        () => (derived.frameChipsKey ? derived.frameChipsKey.split('|').map(s => {
            const [id, name, color] = s.split(':');
            return { id, name, color };
        }) : []),
        [derived.frameChipsKey]
    );

    return (
        <div
            className={`node-entity absolute flex flex-col cursor-move transition-all duration-200 panel rounded-lg border
                ${isSelected ? 'outline outline-[2px] outline-offset-[4px] z-30 shadow-lg' : 'border-[var(--line)] shadow-lg'}
            `}
            style={{
                left: data.position.x,
                top: data.position.y,
                width: data.size?.w || 200,
                height: data.size?.h || 100,
                backgroundColor: data.color || 'rgba(26,26,26,0.9)',
                borderColor: isDropReceiver ? 'var(--ok)' : (isSelected ? (data.color || 'var(--accent)') : 'var(--line)'),
                outlineColor: isDropReceiver ? 'var(--ok)' : (isSelected ? (data.color || 'var(--accent)') : 'transparent'),
                ...(isDropReceiver ? {
                    outlineStyle: 'solid', outlineWidth: '2px', boxShadow: '0 0 30px rgba(52,211,153,0.8)'
                } : (isSelected ? { boxShadow: `0 0 40px ${data.color || 'var(--accent)'}` } : {}))
            }}
            onMouseDown={handleMouseDown}
            onDoubleClick={(e) => {
                e.stopPropagation();
                dispatch({ type: 'FOCUS_CONNECTED_ELEMENTS', payload: { entityId: data.id } });
            }}
            data-file="components/Node.js"
        >
            {frameChips.length > 0 && (
                <div className="absolute -top-2.5 left-1.5 flex gap-1 z-20">
                    {frameChips.map(f => (
                        <button
                            key={f.id}
                            className="flex items-center gap-1 px-1.5 rounded-full text-[9px] text-white leading-4 shadow"
                            style={{ backgroundColor: f.color || '#0284c7' }}
                            title={`Убрать из рамки «${f.name || f.id}»`}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                dispatch({ type: 'FRAME_REMOVE_MEMBERS', payload: { frameId: f.id, ids: [data.id] } });
                            }}
                        >{f.name || 'рамка'} ×</button>
                    ))}
                </div>
            )}

            <div
                className="px-3 py-2 border-b border-[var(--line)] bg-black/20 rounded-t-lg flex items-start justify-between text-sm font-medium z-10 shrink-0 gap-2"
                style={{ fontFamily: data.fontFamily || 'inherit', fontSize: data.fontSize ? `${data.fontSize}px` : undefined }}
            >
                <div className="flex items-start gap-2 text-[var(--text)] flex-1 min-w-0">
                    {data.icon && (
                        data.icon.startsWith('icon-') ? (
                            <div className={`${data.icon} w-4 h-4 text-amber-400 shrink-0 mt-0.5`}></div>
                        ) : (
                            <span className="text-xs shrink-0 mt-0.5">{data.icon}</span>
                        )
                    )}
                    {isEditingName ? (
                        <textarea
                            ref={nameTextareaRef}
                            value={tempName}
                            rows={1}
                            autoFocus
                            className="bg-black/90 text-white px-1.5 py-0.5 rounded border border-[var(--accent-blue)] text-sm font-medium w-full outline-none resize-none font-sans break-all whitespace-pre-wrap leading-snug custom-scrollbar overflow-hidden"
                            style={{ minHeight: '26px', fontFamily: data.fontFamily || 'inherit', fontSize: data.fontSize ? `${data.fontSize}px` : undefined }}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onChange={(e) => {
                                const nextName = e.target.value;
                                setTempName(nextName);
                                dispatch({ type: 'UPDATE_NODE', payload: { id: data.id, updates: { name: nextName }, skipHistory: true } });
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    setIsEditingName(false);
                                    if (tempName.trim() !== nameInitialValueRef.current && nameInitialSnapshotRef.current) {
                                        dispatch({ type: 'COMMIT_HISTORY', payload: { snapshot: nameInitialSnapshotRef.current, logMessage: `Изменено имя узла: ${tempName.trim() || data.id}` } });
                                    }
                                } else if (e.key === 'Escape') {
                                    const prev = nameInitialValueRef.current;
                                    setTempName(prev);
                                    dispatch({ type: 'UPDATE_NODE', payload: { id: data.id, updates: { name: prev }, skipHistory: true } });
                                    setIsEditingName(false);
                                }
                            }}
                            onBlur={() => {
                                setIsEditingName(false);
                                if (tempName.trim() !== nameInitialValueRef.current && nameInitialSnapshotRef.current) {
                                    dispatch({ type: 'COMMIT_HISTORY', payload: { snapshot: nameInitialSnapshotRef.current, logMessage: `Изменено имя узла: ${tempName.trim() || data.id}` } });
                                }
                            }}
                        />
                    ) : (
                        <span
                            className="break-all whitespace-pre-wrap leading-snug cursor-text hover:text-white hover:underline transition-colors select-none font-medium flex-1"
                            style={{ fontFamily: data.fontFamily || 'inherit', fontSize: data.fontSize ? `${data.fontSize}px` : undefined }}
                            title="Кликните, чтобы переименовать узел"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!isEditingName) {
                                    nameInitialSnapshotRef.current = { nodes: state.nodes, frames: state.frames, ports: state.ports, links: state.links };
                                    nameInitialValueRef.current = data.name || '';
                                    setIsEditingName(true);
                                }
                            }}
                            onDoubleClick={(e) => e.stopPropagation()}
                        >
                            {data.name}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-1">
                    {childCount > 0 && (
                        <button
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/40 hover:bg-black/60 text-amber-300 hover:text-amber-200 border border-amber-500/30 text-[11px] font-mono transition-all"
                            title={`Вложено детей: ${childCount}. Клик — открыть дорожку этого узла`}
                            onClick={(e) => {
                                e.stopPropagation();
                                dispatch({ type: 'OPEN_LANE', payload: { ownerId: data.id } });
                                dispatch({ type: 'SET_ACTIVE_LANE', payload: data.id });
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <span className="text-xs">📁</span>
                            <span className="font-bold">{childCount}</span>
                        </button>
                    )}
                </div>
            </div>

            <div className={`flex-1 flex flex-col overflow-hidden transition-opacity duration-300 ${effectiveZoom < 0.4 ? 'opacity-0 hidden' : 'opacity-100'}`}>
                {data.type === 'ai-agent' ? (
                    <AIAgentNodeContent nodeId={data.id} />
                ) : (
                    <div
                        className={`flex-1 p-2.5 flex flex-col gap-2.5 cursor-text select-text z-10 ${data.userResized ? 'overflow-y-auto custom-scrollbar' : 'overflow-hidden'}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!isEditingContent) {
                                contentInitialSnapshotRef.current = { nodes: state.nodes, frames: state.frames, ports: state.ports, links: state.links };
                                contentInitialValueRef.current = data.content || '';
                                setIsEditingContent(true);
                            }
                        }}
                    >
                        {data.mediaUrl && (
                            <img
                                src={data.mediaUrl}
                                alt="media"
                                className="w-full object-contain rounded border border-[var(--line)] bg-black/50 shrink-0 pointer-events-none"
                                style={{ height: data.mediaHeight || 150 }}
                                onLoad={handleImageLoad}
                                onError={(e) => e.target.style.display = 'none'}
                            />
                        )}
                        {isEditingContent ? (
                            <textarea
                                ref={contentTextareaRef}
                                value={tempContent}
                                autoFocus
                                className={`w-full flex-1 bg-black/80 text-gray-200 p-2 rounded border border-[var(--accent-blue)] text-sm outline-none resize-none font-sans break-all whitespace-pre-wrap leading-snug ${data.userResized ? 'custom-scrollbar' : 'overflow-hidden'}`}
                                style={{ minHeight: '50px', fontFamily: data.fontFamily || 'inherit', fontSize: data.fontSize ? `${data.fontSize}px` : undefined }}
                                placeholder="Введите описание или текст узла..."
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                    const nextVal = e.target.value;
                                    setTempContent(nextVal);
                                    dispatch({ type: 'UPDATE_NODE', payload: { id: data.id, updates: { content: nextVal }, skipHistory: true } });
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                        setIsEditingContent(false);
                                        if (tempContent !== contentInitialValueRef.current && contentInitialSnapshotRef.current) {
                                            dispatch({ type: 'COMMIT_HISTORY', payload: { snapshot: contentInitialSnapshotRef.current, logMessage: `Изменено описание узла: ${data.name || data.id}` } });
                                        }
                                    } else if (e.key === 'Escape') {
                                        const prev = contentInitialValueRef.current;
                                        setTempContent(prev);
                                        dispatch({ type: 'UPDATE_NODE', payload: { id: data.id, updates: { content: prev }, skipHistory: true } });
                                        setIsEditingContent(false);
                                    }
                                }}
                                onBlur={() => {
                                    setIsEditingContent(false);
                                    if (tempContent !== contentInitialValueRef.current && contentInitialSnapshotRef.current) {
                                        dispatch({ type: 'COMMIT_HISTORY', payload: { snapshot: contentInitialSnapshotRef.current, logMessage: `Изменено описание узла: ${data.name || data.id}` } });
                                    }
                                }}
                            />
                        ) : (
                            data.content ? (
                                <div
                                    className="text-sm text-gray-200 whitespace-pre-wrap break-all leading-snug"
                                    style={{ fontFamily: data.fontFamily || 'inherit', fontSize: data.fontSize ? `${data.fontSize}px` : undefined }}
                                >
                                    {data.content}
                                </div>
                            ) : (
                                <div className="text-xs text-gray-500 italic py-1 opacity-50 hover:opacity-90 transition-opacity select-none">
                                    Кликните, чтобы добавить описание...
                                </div>
                            )
                        )}
                    </div>
                )}
            </div>

            {effectiveZoom >= 0.4 && portIds.map(portId => (
                <Port key={portId} portId={portId} nodeId={data.id} localZoom={localZoom} />
            ))}

            {derived.interactionMode === 'add-port' && (
                <div
                    className="absolute inset-[-4px] cursor-crosshair border-2 border-dashed border-green-500/50 z-10"
                    onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const y = e.clientY - rect.top;
                        const w = rect.width;
                        const h = rect.height;

                        const distTop = y, distBottom = h - y, distLeft = x, distRight = w - x;
                        const minDist = Math.min(distTop, distBottom, distLeft, distRight);
                        let edge, position;
                        if (minDist === distTop) { edge = 'top'; position = x / w; }
                        else if (minDist === distBottom) { edge = 'bottom'; position = x / w; }
                        else if (minDist === distLeft) { edge = 'left'; position = y / h; }
                        else { edge = 'right'; position = y / h; }

                        dispatch({ type: 'ADD_PORT', payload: { nodeId: data.id, type: edge === 'left' ? 'input' : 'output', position, edge } });
                    }}
                >
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-500/80 text-white text-xs px-2 py-1 rounded">
                        Клик по грани
                    </div>
                </div>
            )}

            <div
                className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize z-20 flex items-end justify-end p-1.5 group"
                onMouseDown={handleResizeMouseDown}
                title="Потяните, чтобы изменить размер"
            >
                <div className="w-2.5 h-2.5 border-r-[2px] border-b-[2px] border-gray-500 rounded-br-[2px] group-hover:border-[var(--accent-blue)] transition-colors"></div>
            </div>
        </div>
    );
}

const MemoizedNode = React.memo ? React.memo(NodeView) : NodeView;
// ВАЖНО: компонент называется NodeView, а не Node, и в глобальную область
// кладётся только window.NodeComponent (Node — нативный DOM-интерфейс).
if (typeof window !== 'undefined') window.NodeComponent = MemoizedNode;
if (typeof module !== 'undefined') module.exports = MemoizedNode;
