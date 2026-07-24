function Node({ data, isContextNode, isParentOfSelected }) {
    const { state, dispatch } = useStore();

    const isConnectedToSelectedLink = React.useMemo(() => {
        return state.links.some(l => {
            if (!l || !state.selectedIds.includes(l.id)) return false;
            const sPort = state.ports[l.sourcePortId];
            const tPort = state.ports[l.targetPortId];
            return (sPort && sPort.nodeId === data.id) || (tPort && tPort.nodeId === data.id);
        });
    }, [state.links, state.selectedIds, state.ports, data.id]);

    const isConnectedToSelectedPort = React.useMemo(() => {
        const ownsSelectedPort = state.selectedIds.some(sid => state.ports[sid] && state.ports[sid].nodeId === data.id);
        if (ownsSelectedPort) return true;

        return state.links.some(l => {
            if (!l) return false;
            const sPort = state.ports[l.sourcePortId];
            const tPort = state.ports[l.targetPortId];
            if (!sPort || !tPort) return false;
            if (state.selectedIds.includes(sPort.id) && tPort.nodeId === data.id) return true;
            if (state.selectedIds.includes(tPort.id) && sPort.nodeId === data.id) return true;
            return false;
        });
    }, [state.links, state.selectedIds, state.ports, data.id]);

    const isExplicitlySelected = state.selectedIds.includes(data.id);
    const isSelected = isExplicitlySelected || isConnectedToSelectedLink || isConnectedToSelectedPort;
    const { zoom } = state.canvas;





    const childrenStats = React.useMemo(
        () => window.HierarchyUtils.getChildrenStats(state.nodes, state.layers, state.ports, state.links, data.id),
        [state.nodes, state.layers, state.ports, state.links, data.id]
    );

    // v10: position относительна родителю, на экран идут мировые координаты
    const absPos = window.HierarchyUtils.getAbsolutePosition(data.id, state.nodes, state.layers);

    // Alt+hover peek: начинка этого узла показывается в полный размер (Canvas)
    const isPeeked = state.ui.peekNodeId === data.id;

    // Semantic zoom disabled: always show normal content instead of nested preview
    const showPreview = false;

    const handlePeekMove = (e) => {
        if (e.altKey && childrenStats.total > 0 && state.ui.peekNodeId !== data.id) {
            dispatch({ type: 'SET_UI', payload: { peekNodeId: data.id } });
        } else if (!e.altKey && isPeeked) {
            dispatch({ type: 'SET_UI', payload: { peekNodeId: null } });
        }
    };

    const handlePeekLeave = () => {
        if (isPeeked) dispatch({ type: 'SET_UI', payload: { peekNodeId: null } });
    };

    const handleMouseDown = (e) => {
        // Разрешаем панорамирование колесиком (1) на любом узле
        if (e.button === 1) return;

        e.stopPropagation();
        if (e.button !== 0) return; // Only left click

        if (e.shiftKey) {
            dispatch({ type: 'TOGGLE_SELECTED', payload: data.id });
            return; // Не перетаскиваем при Shift-клике
        } else {
            if (isContextNode) {
                if (!isExplicitlySelected) {
                    const childrenIds = [
                        ...Object.values(state.nodes).filter(n => n && n.parentId === data.id).map(n => n.id),
                        ...Object.values(state.layers).filter(l => l && l.parentId === data.id).map(l => l.id)
                    ];
                    dispatch({ type: 'SET_MULTI_SELECTED', payload: childrenIds });
                }
            } else if (!isExplicitlySelected) {
                dispatch({ type: 'SET_SELECTED', payload: data.id });
            }
        }


        const startX = e.clientX;
        const startY = e.clientY;

        let hasMoved = false;
        const initialSnapshot = { layers: state.layers, nodes: state.nodes, ports: state.ports, links: state.links };

        let cumulativeDx = 0;
        let cumulativeDy = 0;

        const handleMouseMove = (moveEvent) => {
            hasMoved = true;
            const totalDx = (moveEvent.clientX - startX) / zoom;
            const totalDy = (moveEvent.clientY - startY) / zoom;

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
        };

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            if (hasMoved) {
                dispatch({
                    type: 'COMMIT_HISTORY',
                    payload: { snapshot: initialSnapshot, logMessage: `Перемещен узел: ${data.name}` }
                });
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleDoubleClick = (e) => {
        e.stopPropagation();
        dispatch({ type: 'DIVE_INTO', payload: { id: data.id, name: data.name } });
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
            const dx = (moveEvent.clientX - startX) / zoom;
            const dy = (moveEvent.clientY - startY) / zoom;
            
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

    return (
        <div
            className={`absolute flex flex-col cursor-move transition-all duration-200 glass-panel rounded-lg border
                ${isSelected ? 'outline outline-[2px] outline-offset-[4px] z-30 shadow-lg' : 'border-[#333] shadow-lg'}
                ${isParentOfSelected ? 'animate-parent-pulse' : ''}
            `}
            style={{
                left: absPos.x,
                top: absPos.y,
                width: data.size?.w || 200,
                height: data.size?.h || 100,
                backgroundColor: data.color || 'rgba(26,26,26,0.9)',
                borderColor: isSelected ? (data.color || '#007AFF') : '#333',
                outlineColor: isSelected ? (data.color || '#007AFF') : 'transparent',
                ...(isSelected ? {
                    boxShadow: `0 0 40px ${data.color || '#007AFF'}`
                } : {}),
                '--parent-pulse-color': data.color || '#007AFF'
            }}
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
            onMouseMove={handlePeekMove}
            onMouseLeave={handlePeekLeave}
            data-file="components/Node.js"
        >
            <div className="px-3 py-2 border-b border-[#333] bg-black/20 rounded-t-lg flex items-center justify-between text-sm font-medium z-10 shrink-0">
                <div className="flex items-center gap-2 text-[#eee] overflow-hidden">
                    <div className="icon-box w-4 h-4 text-gray-400"></div>
                    <span className="truncate">{data.name}</span>
                </div>
                {childrenStats.total > 0 && (
                    <button
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10 text-[11px] text-gray-300 hover:bg-[var(--accent-blue)] hover:text-white transition-colors shrink-0 cursor-pointer"
                        onMouseDown={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            dispatch({ type: 'DIVE_INTO', payload: { id: data.id, name: data.name } });
                        }}
                        title={`Внутри: ${childrenStats.nodeCount} узл. ${childrenStats.layerCount} сл. ${childrenStats.linkCount} связ. Клик — войти внутрь`}
                    >
                        <div className="icon-boxes text-xs"></div>
                        <span>{childrenStats.total}</span>
                    </button>
                )}
            </div>
            <div className={`flex-1 flex flex-col overflow-hidden transition-opacity duration-300 ${zoom < 0.4 ? 'opacity-0 hidden' : 'opacity-100'}`}>
                {data.type === 'ai-agent' ? (
                    <AIAgentNodeContent nodeId={data.id} />
                ) : showPreview ? (
                    <NodePreview nodeId={data.id} />
                ) : (
                    <div className="flex-1 overflow-y-auto no-scrollbar p-2.5 flex flex-col gap-2.5 pointer-events-none z-10">
                        {data.mediaUrl && (
                            <img 
                                src={data.mediaUrl} 
                                alt="media" 
                                className="w-full object-contain rounded border border-[#444] bg-black/50 shrink-0" 
                                style={{ height: data.mediaHeight || 150 }}
                                onLoad={handleImageLoad}
                                onError={(e) => e.target.style.display = 'none'}
                            />
                        )}
                        {data.content && (
                            <div className="text-sm text-gray-200 whitespace-pre-wrap break-words">
                                {data.content}
                            </div>
                        )}
                    </div>
                )}
            </div>
            
            {/* Render Ports */}
            {zoom >= 0.4 && Object.values(state.ports)
                .filter(port => port.nodeId === data.id)
                .map(port => (
                    <Port key={port.id} data={port} nodeData={data} />
                ))
            }

            {/* Overlay for Add Port Mode */}
            {state.interactionMode === 'add-port' && (
                <div 
                    className={`absolute inset-[-4px] cursor-crosshair border-2 border-dashed border-green-500/50 ${isContextNode ? 'z-0' : 'z-10'}`}
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

            {!isContextNode && (
                <div 
                    className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize z-20 flex items-end justify-end p-1.5 group"
                    onMouseDown={handleResizeMouseDown}
                    title="Потяните, чтобы изменить размер"
                >
                    <div className="w-2.5 h-2.5 border-r-[2px] border-b-[2px] border-gray-500 rounded-br-[2px] group-hover:border-[var(--accent-blue)] transition-colors"></div>
                </div>
            )}
        </div>
    );
}
