// Производные значения порта: подсветка сети, глубина внутренних связей и
// межуровневая информация. Считается по связям ИМЕННО ЭТОГО порта через индекс
// getLinksByPortId — прежние пять независимых проходов по всем связям проекта
// стоили 139 мс на кадр при 500 узлах.
//
// Возвращается плоский объект: срез сравнивается поверхностно, и пока эти
// значения не изменились, порт не перерисовывается. Считать здесь можно что
// угодно — сравнение идёт по РЕЗУЛЬТАТУ, поэтому изменение далёкого предка
// (перенос ветки, смена владельца) корректно доходит до порта.
const computePortDerived = (view, portId, nodeId) => {
    const empty = {
        port: null, node: null,
        zoom: 1, isPending: false, isSelected: false, isExplicitlySelected: false,
        maxInternalDepth: 0, isCrossLevel: false, maxConnectedLevel: 0, targetLevelsKey: ''
    };
    if (!portId || !nodeId || !view) return empty;

    const H = window.HierarchyUtils;
    const nodes = view.nodes || {};
    const layers = view.layers || {};
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

        // Глубина вложенности: поднимаемся от узла-соседа по координатным
        // контейнерам, пока не упрёмся в свой узел.
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

    const cross = (H && H.getCrossLevelPortInfo)
        ? H.getCrossLevelPortInfo(portId, ports, view.links, nodes, layers)
        : { isCrossLevel: false, maxConnectedLevel: 0, targetLevels: [] };

    const hostEntity = nodes[nodeId] || layers[nodeId] || null;

    return {
        port: ports[portId] || null,
        node: hostEntity,
        zoom: (view.canvas && view.canvas.zoom) || 1,
        isPending: !!(view.pendingConnection && view.pendingConnection.sourcePortId === portId),
        isSelected: isExplicitlySelected || isOwnedBySelectedNode || connectedToSelected,
        isExplicitlySelected,
        maxInternalDepth,
        isCrossLevel: !!cross.isCrossLevel,
        maxConnectedLevel: cross.maxConnectedLevel || 0,
        targetLevelsKey: (cross.targetLevels || []).join(',')
    };
};

function Port(props) {
    if (typeof StoreEngine !== 'undefined') StoreEngine.profileRender('Port');
    const dispatch = useProjectDispatch();
    const projectId = React.useContext(ProjectContext);

    // Идентификаторы приходят пропсами, сами записи — из подписки: так порт
    // остаётся живым, даже когда его узел не перерисовывается.
    const portId = props.portId || (props.data && props.data.id) || (props.port && props.port.id) || null;
    const ownerNodeId = props.nodeId
        || (props.nodeData && props.nodeData.id)
        || (props.node && props.node.id)
        || null;

    // Все хуки — ДО раннего выхода: порядок хуков между рендерами обязан совпадать
    const selectDerived = React.useCallback(
        (view) => computePortDerived(view, portId, ownerNodeId),
        [portId, ownerNodeId]
    );
    const derived = useProjectSelector(selectDerived);

    const data = derived.port || props.data || props.port;
    const nodeData = derived.node || props.nodeData || props.node;
    if (!data || !nodeData) return null;
    const zoom = derived.zoom;

    // Calculate relative position based on node size, shape and edge
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

        // Shift + Drag for sliding the port along the entire perimeter, Shift+Click for selection
        if (e.shiftKey) {
            let hasMoved = false;
            const startX = e.clientX;
            const startY = e.clientY;

            const handleMouseMove = (moveEvent) => {
                // Состояние берётся в момент события для текущего проекта
                const state = getProjectFlatView(projectId);
                // Если мышь сдвинулась более чем на 3 пикселя, считаем это перетаскиванием (drag)
                if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 3) {
                    hasMoved = true;
                }

                if (!hasMoved) return;

                // Calculate absolute coordinates inside the canvas
                const container = document.getElementById('canvas-container');
                const rect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };
                const mouseX = (moveEvent.clientX - rect.left - state.canvas.offset.x) / zoom;
                const mouseY = (moveEvent.clientY - rect.top - state.canvas.offset.y) / zoom;
                
                // Get relative position to the node's top-left corner using getWorldTransform
                const H = window.HierarchyUtils;
                const transform = (H && H.getWorldTransform) ? H.getWorldTransform(nodeData.id, state) : { x: 0, y: 0, scale: 1 };
                const scale = transform.scale || 1;
                const localX = (mouseX - transform.x) / scale;
                const localY = (mouseY - transform.y) / scale;
                
                // Calculate distances to all 4 edges
                const distTop = Math.abs(localY);
                const distBottom = Math.abs(nodeData.size.h - localY);
                const distLeft = Math.abs(localX);
                const distRight = Math.abs(nodeData.size.w - localX);
                
                const minDist = Math.min(distTop, distBottom, distLeft, distRight);
                
                let newEdge, newPos;
                if (minDist === distTop) {
                    newEdge = 'top';
                    newPos = Math.max(0, Math.min(1, localX / nodeData.size.w));
                } else if (minDist === distBottom) {
                    newEdge = 'bottom';
                    newPos = Math.max(0, Math.min(1, localX / nodeData.size.w));
                } else if (minDist === distLeft) {
                    newEdge = 'left';
                    newPos = Math.max(0, Math.min(1, localY / nodeData.size.h));
                } else {
                    newEdge = 'right';
                    newPos = Math.max(0, Math.min(1, localY / nodeData.size.h));
                }

                dispatch({
                    type: 'UPDATE_PORT',
                    payload: {
                        id: data.id,
                        updates: { edge: newEdge, position: newPos },
                        skipHistory: true
                    }
                });
            };

            const handleMouseUp = () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);

                if (!hasMoved) {
                    // Это был просто Shift+Click (без перетаскивания)
                    dispatch({ type: 'TOGGLE_SELECTED', payload: data.id });
                }
            };

            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return;
        }

        // Выделение порта при обычном клике
        dispatch({ type: 'SET_SELECTED', payload: data.id });

        // Default: Drag to create a link
        const startX = e.clientX;
        const startY = e.clientY;

        dispatch({ 
            type: 'SET_PENDING_CONNECTION', 
            payload: { sourcePortId: data.id, endPos: { x: startX, y: startY } } 
        });

        const handleMouseMove = (moveEvent) => {
            dispatch({
                type: 'UPDATE_PENDING_CONNECTION',
                payload: { x: moveEvent.clientX, y: moveEvent.clientY }
            });
        };

        const handleMouseUp = (upEvent) => {
            const state = getProjectFlatView(projectId);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            
            // Deadzone (Решение 1): Игнорируем микросдвиги (< 10px) как случайные
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
            let minDist = 40 / zoom; // Snapping distance (40 screen pixels)

            const { ports, nodes, layers } = state;

            // 1. Поиск ближайшего существующего порта (на любом уровне / окне, узла или слоя)
            Object.values(ports || {}).forEach(port => {
                if (port.id === data.id) return;
                const host = (nodes && nodes[port.nodeId]) || (layers && layers[port.nodeId]);
                if (!host) return;

                const absPos = H ? H.getPortWorldCoordinates(port.id, state) : null;
                if (!absPos) return;

                const dist = Math.hypot(p2x - absPos.x, p2y - absPos.y);
                if (dist < minDist) {
                    minDist = dist;
                    targetPortId = port.id;
                    targetProjectId = projectId;
                }
            });

            // 1.1 Поиск прокси-порта на гранях рамки окон
            if (!targetPortId && H && H.getProxyPortsForWindow) {
                Object.values(state.levelWindows || {}).forEach(win => {
                    const proxies = H.getProxyPortsForWindow(win.id, state);
                    proxies.forEach(proxy => {
                        const dist = Math.hypot(p2x - proxy.worldPos.x, p2y - proxy.worldPos.y);
                        if (dist < minDist) {
                            minDist = dist;
                            targetPortId = proxy.myPortId !== data.id ? proxy.myPortId : proxy.otherPortId;
                            targetProjectId = projectId;
                        }
                    });
                });
            }

            // 1.2 Кросс-проектный порт (Фаза 6.1): те же критерии, что 1., но
            // на портах ДРУГИХ проектов — их окна уже рисуются на этом же
            // общем холсте в единой мировой системе координат (Canvas.js).
            // Только реальные порты, не чужие прокси — прокси уже обозначает
            // существующую связь, не место для новой.
            if (!targetPortId && H && H.getPortWorldCoordinates) {
                (state.projectOrder || []).forEach(pid => {
                    if (pid === projectId) return;
                    const otherView = getProjectFlatView(pid);
                    if (!otherView || !otherView.ports) return;
                    Object.values(otherView.ports).forEach(port => {
                        const host = (otherView.nodes && otherView.nodes[port.nodeId]) || (otherView.layers && otherView.layers[port.nodeId]);
                        if (!host) return;
                        const absPos = H.getPortWorldCoordinates(port.id, otherView);
                        if (!absPos) return;
                        const dist = Math.hypot(p2x - absPos.x, p2y - absPos.y);
                        if (dist < minDist) {
                            minDist = dist;
                            targetPortId = port.id;
                            targetProjectId = pid;
                        }
                    });
                });
            }

            if (targetPortId && targetProjectId !== projectId) {
                dispatch({
                    type: 'ADD_CROSS_PROJECT_LINK',
                    payload: {
                        sourceProjectId: projectId,
                        sourcePortId: data.id,
                        targetProjectId,
                        targetPortId
                    }
                });
            } else if (targetPortId && ports && ports[targetPortId]) {
                dispatch({
                    type: 'ADD_LINK',
                    payload: { sourcePortId: data.id, targetPortId: targetPortId }
                });
            } else {
                // 2. Дроп внутрь контура: Приоритет 1 = Узел, Приоритет 2 = Слой
                let targetEntityId = null;
                let newEdge = 'top';
                let newPos = 0.5;

                // 2.1 Проверка узлов
                Object.values(nodes || {}).forEach(node => {
                    if (node.id === data.nodeId) return;
                    const bounds = H ? H.getNodeWorldBounds(node.id, state) : null;
                    if (!bounds) return;

                    if (p2x >= bounds.x && p2x <= bounds.x + bounds.w &&
                        p2y >= bounds.y && p2y <= bounds.y + bounds.h) {
                        targetEntityId = node.id;

                        const localX = p2x - bounds.x;
                        const localY = p2y - bounds.y;
                        
                        const distTop = Math.abs(localY);
                        const distBottom = Math.abs(bounds.h - localY);
                        const distLeft = Math.abs(localX);
                        const distRight = Math.abs(bounds.w - localX);
                        
                        const minDist2 = Math.min(distTop, distBottom, distLeft, distRight);
                        if (minDist2 === distTop) { newEdge = 'top'; newPos = Math.max(0.05, Math.min(0.95, localX / bounds.w)); }
                        else if (minDist2 === distBottom) { newEdge = 'bottom'; newPos = Math.max(0.05, Math.min(0.95, localX / bounds.w)); }
                        else if (minDist2 === distLeft) { newEdge = 'left'; newPos = Math.max(0.05, Math.min(0.95, localY / bounds.h)); }
                        else { newEdge = 'right'; newPos = Math.max(0.05, Math.min(0.95, localY / bounds.h)); }
                    }
                });

                // 2.2 Если не попали в узел, проверяем слои
                if (!targetEntityId && layers) {
                    Object.values(layers).forEach(layer => {
                        if (layer.id === data.nodeId) return;
                        const bounds = H ? H.getLayerWorldBounds(layer.id, state) : null;
                        if (!bounds) return;

                        if (p2x >= bounds.x && p2x <= bounds.x + bounds.w &&
                            p2y >= bounds.y && p2y <= bounds.y + bounds.h) {
                            targetEntityId = layer.id;

                            const localX = p2x - bounds.x;
                            const localY = p2y - bounds.y;
                            
                            const distTop = Math.abs(localY);
                            const distBottom = Math.abs(bounds.h - localY);
                            const distLeft = Math.abs(localX);
                            const distRight = Math.abs(bounds.w - localX);
                            
                            const minDist2 = Math.min(distTop, distBottom, distLeft, distRight);
                            if (minDist2 === distTop) { newEdge = 'top'; newPos = Math.max(0.05, Math.min(0.95, localX / bounds.w)); }
                            else if (minDist2 === distBottom) { newEdge = 'bottom'; newPos = Math.max(0.05, Math.min(0.95, localX / bounds.w)); }
                            else if (minDist2 === distLeft) { newEdge = 'left'; newPos = Math.max(0.05, Math.min(0.95, localY / bounds.h)); }
                            else { newEdge = 'right'; newPos = Math.max(0.05, Math.min(0.95, localY / bounds.h)); }
                        }
                    });
                }

                if (targetEntityId) {
                    const newPortId = 'port-' + Date.now() + Math.floor(Math.random() * 1000);
                    dispatch({
                        type: 'ADD_PORT',
                        payload: {
                            id: newPortId,
                            nodeId: targetEntityId,
                            type: data.type === 'output' ? 'input' : 'output',
                            edge: newEdge,
                            position: newPos,
                            name: 'Порт'
                        }
                    });
                    dispatch({ 
                        type: 'ADD_LINK', 
                        payload: { sourcePortId: data.id, targetPortId: newPortId } 
                    });
                } else {
                    // 3. Дроп в свободное пространство окна уровня (Быстрое ветвление графа)
                    let targetWin = null;
                    Object.values(state.levelWindows || {}).forEach(win => {
                        const winPos = win.position || { x: 0, y: 0 };
                        const winSize = win.size || { w: 1000, h: 700 };
                        if (p2x >= winPos.x && p2x <= winPos.x + winSize.w &&
                            p2y >= winPos.y && p2y <= winPos.y + winSize.h) {
                            targetWin = win;
                        }
                    });

                    const targetView = (H && targetWin) ? H.getLevelView(targetWin.id, state) : null;
                    if (targetWin && targetView && !targetView.isCollapsed) {
                        const innerZ = targetView.innerZoom || 1;
                        const innerOffX = targetView.innerOffset?.x || 0;
                        const innerOffY = targetView.innerOffset?.y || 0;
                        const localX = Math.round((p2x - targetWin.position.x - innerOffX) / innerZ - 110);
                        const localY = Math.round((p2y - targetWin.position.y - 40 - innerOffY) / innerZ - 40);

                        const newNodeId = 'node-' + Date.now() + Math.floor(Math.random() * 1000);
                        const newPortId = 'port-' + Date.now() + Math.floor(Math.random() * 1000);

                        let newParentId = 'root';
                        if (targetWin.index > 0) {
                            // Фокус ветки уровня — массив владельцев (мульти-выделение);
                            // берём первого живого, иначе родителем станет узел-источник
                            const focusList = (H && H.toFocusList)
                                ? H.toFocusList(state.levelFocusParentId && state.levelFocusParentId[targetWin.index])
                                : [];
                            const focusOwner = focusList.find(fid => state.nodes[fid]);
                            if (focusOwner) {
                                newParentId = focusOwner;
                            } else if (data.nodeId && state.nodes[data.nodeId]) {
                                newParentId = data.nodeId;
                            }
                        }

                        dispatch({
                            type: 'ADD_NODE',
                            payload: {
                                id: newNodeId,
                                name: 'Новый узел',
                                content: '',
                                color: '#0f172a',
                                position: { x: Math.max(20, localX), y: Math.max(20, localY) },
                                size: { w: 220, h: 100 },
                                parentId: newParentId,
                                shape: 'rectangle',
                                type: 'default'
                            }
                        });

                        dispatch({
                            type: 'ADD_PORT',
                            payload: {
                                id: newPortId,
                                nodeId: newNodeId,
                                type: data.type === 'output' ? 'input' : 'output',
                                edge: 'left',
                                position: 0.5,
                                name: 'Вход'
                            }
                        });

                        dispatch({
                            type: 'ADD_LINK',
                            payload: {
                                sourcePortId: data.id,
                                targetPortId: newPortId
                            }
                        });
                    } else {
                        dispatch({ type: 'SET_PENDING_CONNECTION', payload: null });
                    }
                }
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
    const isExplicitlySelected = derived.isExplicitlySelected;
    const maxInternalDepth = derived.maxInternalDepth;

    const portColor = data.color || '#374151'; // default gray-700 equivalent

    const edge = data.edge || 'right';
    // Строка вместо массива: срез сравнивается поверхностно, а новый массив на
    // каждый пересчёт всегда «не равен» прежнему и сводил бы мемоизацию на нет
    const targetLevels = React.useMemo(
        () => (derived.targetLevelsKey ? derived.targetLevelsKey.split(',').map(Number) : []),
        [derived.targetLevelsKey]
    );
    const crossInfo = { isCrossLevel: derived.isCrossLevel, maxConnectedLevel: derived.maxConnectedLevel, targetLevels };
    const maxLvl = derived.maxConnectedLevel || 0;

    // Генерация SVG-полуколец (дуг наружу от грани узла)
    const renderHalfRings = () => {
        if (!crossInfo.isCrossLevel || maxLvl <= 1) return null;

        const count = Math.min(maxLvl, 5);
        const paths = [];

        for (let lvl = 2; lvl <= count; lvl++) {
            const r = 6 + (lvl - 1) * 5; // Радиус дуги: 11px, 16px, 21px, 26px...
            let d = '';

            if (edge === 'top') {
                // Дуга выгибается строго вверх (наружу)
                d = `M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0`;
            } else if (edge === 'bottom') {
                // Дуга выгибается строго вниз (наружу)
                d = `M ${-r} 0 A ${r} ${r} 0 0 0 ${r} 0`;
            } else if (edge === 'left') {
                // Дуга выгибается строго влево (наружу)
                d = `M 0 ${-r} A ${r} ${r} 0 0 0 0 ${r}`;
            } else { // right
                // Дуга выгибается строго вправо (наружу)
                d = `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r}`;
            }

            paths.push(
                <path
                    key={lvl}
                    d={d}
                    fill="none"
                    stroke={portColor}
                    strokeWidth="1.5"
                    strokeOpacity={0.85}
                    strokeLinecap="round"
                />
            );
        }

        return (
            <svg
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-visible pointer-events-none"
                style={{ width: '40px', height: '40px' }}
                viewBox="-20 -20 40 40"
            >
                {paths}
            </svg>
        );
    };

    let ringClasses = '';
    if (!isPending && !isSelected) {
        if (crossInfo.isCrossLevel) {
            ringClasses = 'ring-2 ring-offset-2 ring-offset-[#0f1115] ring-[var(--accent-blue)]/80 shadow-[0_0_10px_rgba(0,122,255,0.4)]';
        } else if (maxInternalDepth === 1) {
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
                left, 
                top,
                backgroundColor: !isPending ? portColor : undefined,
                ...(isSelected && !isPending ? {
                    boxShadow: `0 0 15px ${portColor}CC`
                } : {})
            }}
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
            title={`Порт ${data.name ? `${data.name} (${data.type})` : data.type}${crossInfo.isCrossLevel ? ` • Межуровневая связь (целевые уровни: ${targetLevels.join(', ')})` : ''}`}
            data-port-id={data.id}
            data-node-id={nodeData.id}
            data-edge={data.edge}
        >
            {renderHalfRings()}
        </div>
    );
}

// Мемоизация работает только вместе с точечной подпиской: раньше компонент
// читал весь стор через useStore и перерисовывался на любой dispatch, обходя
// React.memo стороной (контекст мемоизацию не останавливает).
const MemoizedPort = React.memo ? React.memo(Port) : Port;
if (typeof window !== 'undefined') window.Port = MemoizedPort;
if (typeof module !== 'undefined') module.exports = MemoizedPort;
