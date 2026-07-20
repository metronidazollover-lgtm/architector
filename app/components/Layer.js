function Layer({ data }) {
    const { state, dispatch } = useStore();
    const isSelected = state.selectedIds.includes(data.id);
    const { zoom } = state.canvas;

    // v10: position относительна родителю, на экран идут мировые координаты
    const absPos = window.HierarchyUtils.getAbsolutePosition(data.id, state.nodes, state.layers);

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

        if (!isSelected) {
            dispatch({ type: 'SET_SELECTED', payload: data.id });
        }

        const startX = e.clientX;
        const startY = e.clientY;

        // Поиск узлов внутри только для этого слоя, если включен замок.
        // v10: дети слоя (parentId === data.id) едут вместе со слоем автоматически,
        // захватываем только соседей по контексту, геометрически лежащих в границах слоя.
        const lw = data.size?.w || 600;
        const lh = data.size?.h || 400;
        const startPosX = absPos.x;
        const startPosY = absPos.y;

        const nodesInside = data.locked ? Object.values(state.nodes).filter(node => {
            if (node.parentId === data.id) return false; // ребёнок, едет сам
            const nodeContext = node.parentId || 'root';
            const layerContext = data.parentId || 'root';
            if (nodeContext !== layerContext) return false;

            const nodeAbs = window.HierarchyUtils.getAbsolutePosition(node.id, state.nodes, state.layers);
            const nw = node.size?.w || 200;
            const nh = node.size?.h || 100;
            const nodeCX = nodeAbs.x + nw / 2;
            const nodeCY = nodeAbs.y + nh / 2;
            return nodeCX >= startPosX && nodeCX <= startPosX + lw &&
                   nodeCY >= startPosY && nodeCY <= startPosY + lh;
        }).map(n => n.id) : [];

        // Добавляем узлы в массив выделенных виртуально (чтобы двигать их вместе)
        const allIdsToMove = new Set([...state.selectedIds, ...nodesInside]);

        let hasMoved = false;
        const initialSnapshot = { layers: state.layers, nodes: state.nodes, ports: state.ports, links: state.links };

        const initialPositions = {};
        allIdsToMove.forEach(id => {
            if (state.nodes[id]) initialPositions[id] = { ...state.nodes[id].position };
            else if (state.layers[id]) initialPositions[id] = { ...state.layers[id].position };
        });

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

            // Коллизия слоёв: корректируем позицию, чтобы не перекрывать соседей
            const rawX = initialPositions[data.id].x + dx;
            const rawY = initialPositions[data.id].y + dy;
            const resolved = window.GeometryUtils.resolveLayerCollision(
                data.id, rawX, rawY, lw, lh, state.layers
            );
            const resolvedDx = resolved.x - initialPositions[data.id].x;
            const resolvedDy = resolved.y - initialPositions[data.id].y;
            
            const selectedSet = new Set(allIdsToMove);
            const hasSelectedAncestor = (id) => {
                let current = state.nodes[id] || (state.layers && state.layers[id]);
                const visited = new Set();
                while (current && current.parentId && current.parentId !== 'root' && !visited.has(current.parentId)) {
                    if (selectedSet.has(current.parentId)) return true;
                    visited.add(current.parentId);
                    current = state.nodes[current.parentId] || (state.layers && state.layers[current.parentId]) || null;
                }
                return false;
            };

            allIdsToMove.forEach(id => {
                if (initialPositions[id]) {
                    if (hasSelectedAncestor(id)) return;
                    const effectiveDx = resolvedDx;
                    const effectiveDy = resolvedDy;
                    if (state.nodes[id]) {
                        dispatch({ type: 'UPDATE_NODE', payload: { id, updates: { position: { x: initialPositions[id].x + effectiveDx, y: initialPositions[id].y + effectiveDy } }, skipHistory: true } });
                    } else if (state.layers[id]) {
                        dispatch({ type: 'UPDATE_LAYER', payload: { id, updates: { position: { x: initialPositions[id].x + effectiveDx, y: initialPositions[id].y + effectiveDy } }, skipHistory: true } });
                    }
                }
            });
        };

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            if (hasMoved) {
                dispatch({
                    type: 'COMMIT_HISTORY',
                    payload: { snapshot: initialSnapshot, logMessage: `Перемещен слой: ${data.name}` }
                });
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleResizeMouseDown = (e) => {
        e.stopPropagation();
        e.preventDefault();
        dispatch({ type: 'SET_SELECTED', payload: data.id });

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
        const layerNodes = Object.values(state.nodes).filter(n => n.parentId === data.id);
        if (layerNodes.length === 0) return;
        
        const { updatesById, newLayerSize } = window.GeometryUtils.getSmartPlacement(layerNodes, data, state.nodes);
        
        dispatch({ type: 'UPDATE_LAYER', payload: { id: data.id, updates: { size: newLayerSize } } });
        dispatch({ type: 'MASS_UPDATE', payload: { ids: layerNodes.map(n=>n.id), updatesById } });
    };

    const handleBodyClick = (e) => {
        // Selection on body click
        e.stopPropagation();
        if (e.shiftKey) {
            dispatch({ type: 'TOGGLE_SELECTED', payload: data.id });
        } else {
            dispatch({ type: 'SET_SELECTED', payload: data.id });
        }
    };

    return (
        <div
            className={`absolute flex flex-col transition-all duration-200 border-2 rounded-xl pointer-events-auto
                ${isSelected ? 'z-0 shadow-lg' : '-z-10 shadow-sm'}
            `}
            style={{
                left: absPos.x,
                top: absPos.y,
                width: data.size?.w || 600,
                height: data.size?.h || 400,
                backgroundColor: data.color ? `${data.color}20` : 'rgba(255,255,255,0.02)', // 20 hex is ~12% opacity
                borderColor: isSelected ? (data.color || '#444') : (data.color ? `${data.color}40` : '#333'),
            }}
            onClick={handleBodyClick}
            data-file="components/Layer.js"
        >
            <div 
                className="px-4 py-3 rounded-t-xl flex flex-col justify-center text-sm cursor-move z-10 shrink-0 select-none"
                style={{
                    backgroundColor: data.color ? `${data.color}40` : 'rgba(0,0,0,0.4)',
                    borderBottom: `2px solid ${isSelected ? (data.color || '#444') : (data.color ? `${data.color}40` : '#333')}`
                }}
                onMouseDown={handleMouseDown}
            >
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-[#eee] text-base overflow-hidden">
                        <span className="truncate">{data.name}</span>
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
                    <div className="text-xs text-gray-300 mt-1 line-clamp-2 leading-tight opacity-80">
                        {data.content}
                    </div>
                )}
            </div>
            
            <div className="flex-1 pointer-events-none"></div>
            
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