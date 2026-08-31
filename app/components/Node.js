// Производные значения узла: подсветка связанной сети, локальная позиция,
// число детей, признак приёмника Drag&Drop.
//
// Три прежних useMemo перебирали ВСЕ связи проекта на каждый пересчёт; теперь
// сеть обходится по связям портов самого узла через индексы. Результат плоский
// и сравнивается поверхностно: пока эти значения не изменились, узел не
// перерисовывается. Изменение далёкого предка меняет здесь localPos — то есть
// «рябь» доходит до узла именно потому, что сравнивается РЕЗУЛЬТАТ.
const computeNodeDerived = (view, nodeId) => {
    const empty = {
        node: null, portIdsKey: '', interactionMode: 'default', zoom: 1, isSelected: false, isExplicitlySelected: false,
        localX: 0, localY: 0, childCount: 0, isDropReceiver: false
    };
    if (!nodeId || !view) return empty;

    const H = window.HierarchyUtils;
    const ports = view.ports || {};
    const selectedIds = view.selectedIds || [];

    const isExplicitlySelected = selectedIds.includes(nodeId);
    let connected = isExplicitlySelected;

    if (!connected && H && H.getPortsByNodeId && H.getLinksByPortId) {
        const myPorts = H.getPortsByNodeId(ports)[nodeId] || [];
        // Выделен порт этого узла
        connected = myPorts.some(p => selectedIds.includes(p.id));
        if (!connected) {
            const linksByPort = H.getLinksByPortId(view.links);
            connected = myPorts.some(p => (linksByPort[p.id] || []).some(l => {
                if (!l) return false;
                if (selectedIds.includes(l.id)) return true;              // выделена связь
                const oppId = l.sourcePortId === p.id ? l.targetPortId : l.sourcePortId;
                if (!oppId) return false;
                if (selectedIds.includes(oppId)) return true;             // выделен порт на том конце
                const opp = ports[oppId];
                return !!(opp && selectedIds.includes(opp.nodeId));       // выделен узел на том конце
            }));
        }
    }

    const localPos = (H && H.getLocalPosition)
        ? H.getLocalPosition(nodeId, view.nodes, view.layers)
        : ((view.nodes && view.nodes[nodeId] && view.nodes[nodeId].position) || { x: 0, y: 0 });

    const childCount = (H && H.getNodesByParentId)
        ? (H.getNodesByParentId(view.nodes)[nodeId] || []).length
        : Object.values(view.nodes || {}).filter(n => n && n.parentId === nodeId).length;

    const dropTarget = view.dragGesture && view.dragGesture.target;

    // Состав портов узла строкой: их поля порт рисует сам по своей подписке,
    // узлу важно лишь, не появился ли новый порт и не исчез ли старый.
    const myPorts = (H && H.getPortsByNodeId) ? (H.getPortsByNodeId(ports)[nodeId] || []) : [];
    const portIdsKey = myPorts.map(p => p.id).sort().join(',');

    return {
        // Запись узла — по ссылке: пока она та же, узлу нечего перерисовывать.
        // Родитель передаёт только id, поэтому его собственная перерисовка
        // больше не тащит за собой всё поддерево.
        node: (view.nodes || {})[nodeId] || null,
        portIdsKey,
        interactionMode: view.interactionMode || 'default',
        zoom: (view.canvas && view.canvas.zoom) || 1,
        isSelected: connected,
        isExplicitlySelected,
        localX: localPos.x,
        localY: localPos.y,
        childCount,
        isDropReceiver: !!(dropTarget && dropTarget.kind === 'node' && dropTarget.id === nodeId && dropTarget.valid)
    };
};

function NodeView(props) {
    if (typeof StoreEngine !== 'undefined') StoreEngine.profileRender('Node');
    const dispatch = useProjectDispatch();
    const projectId = React.useContext(ProjectContext);

    // Все хуки — ДО раннего выхода: порядок хуков между рендерами обязан совпадать
    const nodeId = props.nodeId || (props.data && props.data.id) || (props.node && props.node.id) || null;
    const selectDerived = React.useCallback((view) => computeNodeDerived(view, nodeId), [nodeId]);
    const derived = useProjectSelector(selectDerived);

    const data = derived.node || props.data || props.node;
    if (!data) return null;

    // Актуальный стейт для обработчиков жеста Drag&Drop: замыкания mousedown
    // живут дольше рендера, а резолверу целей нужны СВЕЖИЕ позиции элементов.
    // Читаем плоский вид соответствующего проекта.
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
    // v10: позиция узла внутри окна его уровня (с учетом смещения внутри слоев)
    const localPos = { x: derived.localX, y: derived.localY };

    // Drag&Drop: узел-приёмник подсвечивается, когда контур перетаскиваемого
    // элемента пересёк его контур и дроп сюда валиден (станет родителем)
    const isDropReceiver = derived.isDropReceiver;

    const handleMouseDown = (e) => {
        // Разрешаем панорамирование колесиком (1) на любом узле
        if (e.button === 1) return;

        e.stopPropagation();
        if (e.button !== 0) return; // Only left click

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
        const initialSnapshot = { layers: state.layers, nodes: state.nodes, ports: state.ports, links: state.links };

        let cumulativeDx = 0;
        let cumulativeDy = 0;

        // Режим переноса (обычный/'shallow') фиксируется на старте жеста, а не
        // читается заново в момент отпускания мыши: переключить тумблер той же
        // рукой, что держит перетаскивание, нельзя, но хоткеем — можно, и это
        // не должно подменить исход уже начатого переноса (PLAN_SHALLOW_TRANSFER_DND.md,
        // премортем, риск 7).
        const dragDropModeAtStart = (state.ui && state.ui.dragDropMode) || false;

        // ==== Drag&Drop: резолвер цели под перетаскиваемыми элементами ====
        const H = window.HierarchyUtils;

        // «Только верхние» из текущего выделения (потомки едут в связке)
        const topDraggedIds = (st) => {
            const sel = (st.selectedIds || []).filter(sid => st.nodes[sid] || (st.layers && st.layers[sid]));
            const ids = sel.includes(data.id) && sel.length > 0 ? sel : [data.id];
            return ids.filter(nid => !ids.some(other =>
                other !== nid && H && H.hasAncestorIn && H.hasAncestorIn(nid, [other], st.nodes, st.layers)));
        };

        const computeTarget = (ev) => {
            const st = stateRef.current;
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

        let lastTargetKey = null;
        // Резолвер цели дроп-зоны сканирует сущности сцены, а mousemove приходит
        // чаще кадра. Считаем не более одного раза на кадр: чаще — бессмысленно,
        // всё равно отрисуется один результат.
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
            const { st, ids, target } = computeTarget(ev);
            const key = target ? `${target.kind}:${target.id}:${target.valid}` : 'void';
            if (key === lastTargetKey) return;
            lastTargetKey = key;
            dispatch({ type: 'SET_DRAG_GESTURE', payload: { ids, target } });
            // Курсор «нельзя»: в режиме Drag&Drop — пустота и невалидные цели
            const dndOn = !!(st.ui && st.ui.dragDropMode);
            document.body.style.cursor = (dndOn && (!target || !target.valid)) ? 'not-allowed' : '';
        };

        const cleanup = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.cursor = '';
        };

        // Откат жеста: сущности возвращаются к срезу на mousedown (без истории)
        const restoreGesture = () => {
            dispatch({ type: 'RESTORE_ENTITIES', payload: { nodes: initialSnapshot.nodes, layers: initialSnapshot.layers } });
        };

        const handleKeyDown = (kev) => {
            if (kev.key !== 'Escape') return;
            cleanup();
            if (hasMoved) restoreGesture();
            else dispatch({ type: 'SET_DRAG_GESTURE', payload: null });
        };

        const handleMouseMove = (moveEvent) => {
            const distMoved = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
            if (distMoved > 3) {
                if (!hasMoved) {
                    hasMoved = true;
                }
            }

            if (!hasMoved) return;

            const totalDx = (moveEvent.clientX - startX) / effectiveZoom;
            const totalDy = (moveEvent.clientY - startY) / effectiveZoom;

            let stepDx = totalDx - cumulativeDx;
            let stepDy = totalDy - cumulativeDy;

            if (data.snapToGrid) {
                const step = 30; // Grid size
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
                dispatch({
                    type: 'MOVE_SELECTED',
                    payload: { dx: stepDx, dy: stepDy, skipHistory: true }
                });
            }

            updateGestureThrottled(moveEvent);
        };

        const handleMouseUp = (upEvent) => {
            cleanup();

            if (!hasMoved) {
                // Одиночный клик (нажали и отпустили без сдвига)
                if (e.shiftKey) {
                    dispatch({ type: 'TOGGLE_SELECTED', payload: data.id });
                } else {
                    // Клик без сдвига схлопывает массовое выделение до этого узла
                    // (на mousedown группа сохраняется, чтобы работал драг группы)
                    if (!isExplicitlySelected || (state.selectedIds && state.selectedIds.length > 1)) {
                        dispatch({ type: 'SET_SELECTED', payload: data.id });
                    }
                }
                return;
            }

            const { st, ids, target } = computeTarget(upEvent);
            const dndOn = !!(st.ui && st.ui.dragDropMode);
            const clearGesture = () => dispatch({ type: 'SET_DRAG_GESTURE', payload: null });

            // Перенос: валидная цель, не являющаяся «своим окном» (обычным перемещением)
            const isTransfer = target && target.valid && !(target.kind === 'window' && target.isMove);
            if (isTransfer && H) {
                const text = H.buildTransferConfirmText
                    ? H.buildTransferConfirmText(ids, target, st, dragDropModeAtStart)
                    : 'Перенести выбранные элементы?';
                if (window.confirm(text)) {
                    clearGesture();
                    const basePayload = {
                        ids,
                        mode: dragDropModeAtStart,
                        // Весь жест (движение + перенос) — один шаг Undo
                        historySnapshot: {
                            nodes: initialSnapshot.nodes,
                            layers: initialSnapshot.layers,
                            ports: initialSnapshot.ports,
                            links: initialSnapshot.links
                        }
                    };
                    if (target.kind === 'node') {
                        const ownerLvl = H.getEntityLevel(target.id, st.nodes, st.layers);
                        dispatch({ type: 'TRANSFER_NODE', payload: { ...basePayload, targetLevelIndex: ownerLvl + 1, newOwnerId: target.id } });
                    } else if (target.kind === 'layer') {
                        dispatch({ type: 'TRANSFER_NODE', payload: { ...basePayload, targetLayerId: target.id } });
                    } else {
                        const win = st.levelWindows[target.id];
                        const positionsById = H.computeDropPositions
                            ? H.computeDropPositions(ids, win, st)
                            : null;
                        dispatch({ type: 'TRANSFER_NODE', payload: { ...basePayload, targetLevelIndex: win.levelIndex, ...(positionsById ? { positionsById } : {}) } });
                    }
                } else {
                    restoreGesture();
                }
                return;
            }

            // Режим Drag&Drop: пустота или невалидная цель — жест отменяется
            if (dndOn && (!target || !target.valid)) {
                restoreGesture();
                return;
            }

            // Обычное перемещение: фиксируем историю
            clearGesture();
            dispatch({
                type: 'COMMIT_HISTORY',
                payload: { snapshot: initialSnapshot, logMessage: `Перемещен узел: ${data.name}` }
            });
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('keydown', handleKeyDown);
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

            dispatch({
                type: 'UPDATE_NODE',
                payload: {
                    id: data.id,
                    updates: { size: { w: newW, h: newH }, userResized: true },
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
                    payload: { snapshot: initialSnapshot, logMessage: `Изменен размер узла: ${data.name}` }
                });
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
            dispatch({
                type: 'UPDATE_NODE',
                payload: {
                    id: data.id,
                    updates: { mediaHeight: targetH },
                    skipHistory: true
                }
            });
        }
    };

    const [isNodeHovered, setIsNodeHovered] = React.useState(false);
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

    React.useEffect(() => {
        setTempName(data.name || '');
    }, [data.name]);

    React.useEffect(() => {
        setTempContent(data.content || '');
    }, [data.content]);

    const childCount = derived.childCount;
    // Из строки — обратно в список: срез сравнивается поверхностно, а новый
    // массив на каждый пересчёт всегда «не равен» прежнему
    const portIds = React.useMemo(
        () => (derived.portIdsKey ? derived.portIdsKey.split(',') : []),
        [derived.portIdsKey]
    );

    return (
        <div
            className={`absolute flex flex-col cursor-move transition-all duration-200 glass-panel rounded-lg border
                ${isSelected ? 'outline outline-[2px] outline-offset-[4px] z-30 shadow-lg' : 'border-[#333] shadow-lg'}
            `}
            style={{
                left: localPos.x,
                top: localPos.y,
                width: data.size?.w || 200,
                height: data.size?.h || 100,
                backgroundColor: data.color || 'rgba(26,26,26,0.9)',
                borderColor: isDropReceiver ? '#34d399' : (isSelected ? (data.color || '#007AFF') : '#333'),
                outlineColor: isDropReceiver ? '#34d399' : (isSelected ? (data.color || '#007AFF') : 'transparent'),
                ...(isDropReceiver ? {
                    outlineStyle: 'solid',
                    outlineWidth: '2px',
                    boxShadow: '0 0 30px rgba(52,211,153,0.8)'
                } : (isSelected ? {
                    boxShadow: `0 0 40px ${data.color || '#007AFF'}`
                } : {}))
            }}
            onMouseDown={handleMouseDown}
            onDoubleClick={(e) => {
                e.stopPropagation();
                dispatch({ type: 'FOCUS_CONNECTED_ELEMENTS', payload: { entityId: data.id } });
            }}
            onMouseEnter={() => setIsNodeHovered(true)}
            onMouseLeave={() => setIsNodeHovered(false)}
            data-file="components/Node.js"
        >
            {/* Шапка узла с инлайн-редактированием имени, бейджем детей и кнопкой + */}
            <div 
                className="px-3 py-2 border-b border-[#333] bg-black/20 rounded-t-lg flex items-start justify-between text-sm font-medium z-10 shrink-0 gap-2"
                style={{ fontFamily: data.fontFamily || 'inherit', fontSize: data.fontSize ? `${data.fontSize}px` : undefined }}
            >
                <div className="flex items-start gap-2 text-[#eee] flex-1 min-w-0">
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
                                dispatch({
                                    type: 'UPDATE_NODE',
                                    payload: {
                                        id: data.id,
                                        updates: { name: nextName },
                                        skipHistory: true
                                    }
                                });
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    setIsEditingName(false);
                                    if (tempName.trim() !== nameInitialValueRef.current && nameInitialSnapshotRef.current) {
                                        dispatch({
                                            type: 'COMMIT_HISTORY',
                                            payload: {
                                                snapshot: nameInitialSnapshotRef.current,
                                                logMessage: `Изменено имя узла: ${tempName.trim() || data.id}`
                                            }
                                        });
                                    }
                                } else if (e.key === 'Escape') {
                                    const prev = nameInitialValueRef.current;
                                    setTempName(prev);
                                    dispatch({
                                        type: 'UPDATE_NODE',
                                        payload: {
                                            id: data.id,
                                            updates: { name: prev },
                                            skipHistory: true
                                        }
                                    });
                                    setIsEditingName(false);
                                }
                            }}
                            onBlur={() => {
                                setIsEditingName(false);
                                if (tempName.trim() !== nameInitialValueRef.current && nameInitialSnapshotRef.current) {
                                    dispatch({
                                        type: 'COMMIT_HISTORY',
                                        payload: {
                                            snapshot: nameInitialSnapshotRef.current,
                                            logMessage: `Изменено имя узла: ${tempName.trim() || data.id}`
                                        }
                                    });
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
                                    nameInitialSnapshotRef.current = { nodes: state.nodes, layers: state.layers, ports: state.ports, links: state.links };
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

                {/* Правая часть шапки: Бейдж детей и кнопка + */}
                <div className="flex items-center gap-1 shrink-0 ml-1">
                    {childCount > 0 && (
                        <button
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/40 hover:bg-black/60 text-amber-300 hover:text-amber-200 border border-amber-500/30 text-[11px] font-mono transition-all"
                            title={`Вложено детей: ${childCount}. Клик — показать детей на следующем уровне`}
                            onClick={(e) => {
                                e.stopPropagation();
                                dispatch({ type: 'FOCUS_CHILDREN_OF_NODE', payload: { parentId: data.id } });
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <span className="text-xs">📁</span>
                            <span className="font-bold">{childCount}</span>
                        </button>
                    )}
                    {/* Кнопка «+» удалена (PLAN_LAYERS_AND_CONTEXT_CREATION.md, разд.4,
                        осознанный компромисс ⚠️ п.0.7): создание потомка на следующем
                        уровне централизовано в FAB тулбара — выделите узел, наведите
                        на «+» справа по центру экрана. */}
                </div>
            </div>

            {/* Тело узла с инлайн-редактированием описания (Content) */}
            <div className={`flex-1 flex flex-col overflow-hidden transition-opacity duration-300 ${effectiveZoom < 0.4 ? 'opacity-0 hidden' : 'opacity-100'}`}>
                {data.type === 'ai-agent' ? (
                    <AIAgentNodeContent nodeId={data.id} />
                ) : (
                    <div 
                        className={`flex-1 p-2.5 flex flex-col gap-2.5 cursor-text select-text z-10 ${data.userResized ? 'overflow-y-auto custom-scrollbar' : 'overflow-hidden'}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!isEditingContent) {
                                contentInitialSnapshotRef.current = { nodes: state.nodes, layers: state.layers, ports: state.ports, links: state.links };
                                contentInitialValueRef.current = data.content || '';
                                setIsEditingContent(true);
                            }
                        }}
                    >
                        {data.mediaUrl && (
                            <img 
                                src={data.mediaUrl} 
                                alt="media" 
                                className="w-full object-contain rounded border border-[#444] bg-black/50 shrink-0 pointer-events-none" 
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
                                    dispatch({
                                        type: 'UPDATE_NODE',
                                        payload: {
                                            id: data.id,
                                            updates: { content: nextVal },
                                            skipHistory: true
                                        }
                                    });
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                        setIsEditingContent(false);
                                        if (tempContent !== contentInitialValueRef.current && contentInitialSnapshotRef.current) {
                                            dispatch({
                                                type: 'COMMIT_HISTORY',
                                                payload: {
                                                    snapshot: contentInitialSnapshotRef.current,
                                                    logMessage: `Изменено описание узла: ${data.name || data.id}`
                                                }
                                            });
                                        }
                                    } else if (e.key === 'Escape') {
                                        const prev = contentInitialValueRef.current;
                                        setTempContent(prev);
                                        dispatch({
                                            type: 'UPDATE_NODE',
                                            payload: {
                                                id: data.id,
                                                updates: { content: prev },
                                                skipHistory: true
                                            }
                                        });
                                        setIsEditingContent(false);
                                    }
                                }}
                                onBlur={() => {
                                    setIsEditingContent(false);
                                    if (tempContent !== contentInitialValueRef.current && contentInitialSnapshotRef.current) {
                                        dispatch({
                                            type: 'COMMIT_HISTORY',
                                            payload: {
                                                snapshot: contentInitialSnapshotRef.current,
                                                logMessage: `Изменено описание узла: ${data.name || data.id}`
                                            }
                                        });
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
            
            {/* Render Ports */}
            {effectiveZoom >= 0.4 && portIds.map(portId => (
                <Port key={portId} portId={portId} nodeId={data.id} localZoom={localZoom} />
            ))}

            {/* Overlay for Add Port Mode */}
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
                        
                        // Determine closest edge
                        const distTop = y;
                        const distBottom = h - y;
                        const distLeft = x;
                        const distRight = w - x;
                        
                        const minDist = Math.min(distTop, distBottom, distLeft, distRight);
                        let edge, position;
                        
                        if (minDist === distTop) { edge = 'top'; position = x / w; }
                        else if (minDist === distBottom) { edge = 'bottom'; position = x / w; }
                        else if (minDist === distLeft) { edge = 'left'; position = y / h; }
                        else { edge = 'right'; position = y / h; }

                        dispatch({
                            type: 'ADD_PORT',
                            payload: {
                                nodeId: data.id,
                                type: edge === 'left' ? 'input' : 'output',
                                position: position,
                                edge: edge
                            }
                        });
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
// кладётся только window.NodeComponent. Объявление `function Node` затирало бы
// нативный DOM-интерфейс Node (Node.TEXT_NODE, `x instanceof Node`), ломая
// сторонний код и расширения. Потребители пишут <NodeComponent />.
if (typeof window !== 'undefined') window.NodeComponent = MemoizedNode;
if (typeof module !== 'undefined') module.exports = MemoizedNode;

