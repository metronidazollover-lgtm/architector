function Port({ data, nodeData }) {
    const { state, dispatch } = useStore();
    const { zoom } = state.canvas;

    // Calculate relative position based on node size, shape and edge
    const relPos = window.GeometryUtils.getPortRelativePosition(data, nodeData);
    const left = relPos.x;
    const top = relPos.y;

    const handleMouseDown = (e) => {
        e.stopPropagation();

        // Shift + Drag for sliding the port along the entire perimeter, Shift+Click for selection
        if (e.shiftKey) {
            let hasMoved = false;
            const startX = e.clientX;
            const startY = e.clientY;

            const handleMouseMove = (moveEvent) => {
                // Если мышь сдвинулась более чем на 3 пикселя, считаем это перетаскиванием (drag)
                if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 3) {
                    hasMoved = true;
                }

                if (!hasMoved) return;

                // Calculate absolute coordinates inside the canvas
                const mouseX = (moveEvent.clientX - state.canvas.offset.x) / zoom;
                const mouseY = (moveEvent.clientY - state.canvas.offset.y) / zoom;
                
                // Get relative position to the node's top-left corner (v10: мировая позиция узла)
                const nodeAbs = window.HierarchyUtils.getAbsolutePosition(nodeData.id, state.nodes, state.layers);
                const localX = mouseX - nodeAbs.x;
                const localY = mouseY - nodeAbs.y;
                
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
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            
            // Deadzone (Решение 1): Игнорируем микросдвиги (< 10px) как случайные
            const distMoved = Math.hypot(upEvent.clientX - startX, upEvent.clientY - startY);
            if (distMoved < 10) {
                dispatch({ type: 'SET_PENDING_CONNECTION', payload: null });
                return;
            }

            const p2x = (upEvent.clientX - state.canvas.offset.x) / zoom;
            const p2y = (upEvent.clientY - state.canvas.offset.y) / zoom;

            let targetPortId = null;
            let minDist = 30 / zoom; // Snapping distance 30px
            
            const { ports, nodes } = state;
            Object.values(ports).forEach(port => {
                if (port.id === data.id) return;
                const node = nodes[port.nodeId];
                if (!node) return;
                
                const nodeAbs = window.HierarchyUtils.getAbsolutePosition(node.id, nodes, state.layers);
                const absPos = window.GeometryUtils.getPortAbsolutePosition(port, node, nodeAbs);
                const dist = Math.hypot(p2x - absPos.x, p2y - absPos.y);
                if (dist < minDist) {
                    minDist = dist;
                    targetPortId = port.id;
                }
            });
            
            if (targetPortId) {
                dispatch({ 
                    type: 'ADD_LINK', 
                    payload: { sourcePortId: data.id, targetPortId: targetPortId } 
                });
            } else {
                // Smart Port Creation
                let targetNodeId = null;
                let newEdge = 'top';
                let newPos = 0.5;

                // Check if dropped inside a node
                Object.values(nodes).forEach(node => {
                    const nw = node.size?.w || 200;
                    const nh = node.size?.h || 100;
                    const nodeAbs = window.HierarchyUtils.getAbsolutePosition(node.id, nodes, state.layers);
                    if (p2x >= nodeAbs.x && p2x <= nodeAbs.x + nw &&
                        p2y >= nodeAbs.y && p2y <= nodeAbs.y + nh) {
                        targetNodeId = node.id;

                        const localX = p2x - nodeAbs.x;
                        const localY = p2y - nodeAbs.y;
                        
                        const distTop = Math.abs(localY);
                        const distBottom = Math.abs(nh - localY);
                        const distLeft = Math.abs(localX);
                        const distRight = Math.abs(nw - localX);
                        
                        const minDist2 = Math.min(distTop, distBottom, distLeft, distRight);
                        if (minDist2 === distTop) { newEdge = 'top'; newPos = localX / nw; }
                        else if (minDist2 === distBottom) { newEdge = 'bottom'; newPos = localX / nw; }
                        else if (minDist2 === distLeft) { newEdge = 'left'; newPos = localY / nh; }
                        else { newEdge = 'right'; newPos = localY / nh; }
                    }
                });

                if (targetNodeId) {
                    const newPortId = 'port-' + Date.now() + Math.floor(Math.random() * 1000);
                    dispatch({
                        type: 'ADD_PORT',
                        payload: {
                            id: newPortId,
                            nodeId: targetNodeId,
                            type: data.type === 'output' ? 'input' : 'output',
                            edge: newEdge,
                            position: newPos,
                            name: 'Новый порт'
                        }
                    });
                    dispatch({ 
                        type: 'ADD_LINK', 
                        payload: { sourcePortId: data.id, targetPortId: newPortId } 
                    });
                } else {
                    dispatch({ type: 'SET_PENDING_CONNECTION', payload: null });
                }
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleDoubleClick = (e) => {
        e.stopPropagation();
        dispatch({ type: 'DIVE_INTO', payload: { id: data.id, name: `Порт: ${data.type}` } });
    };

    const isPending = state.pendingConnection && state.pendingConnection.sourcePortId === data.id;
    const isSelected = state.selectedIds.includes(data.id);
    const portColor = data.color || '#374151'; // default gray-700 equivalent

    // Calculate internal connections depth
    let maxInternalDepth = 0;
    state.links.forEach(link => {
        let otherPortId = null;
        if (link.sourcePortId === data.id) otherPortId = link.targetPortId;
        else if (link.targetPortId === data.id) otherPortId = link.sourcePortId;

        if (otherPortId) {
            const otherPort = state.ports[otherPortId];
            if (otherPort) {
                const otherNode = state.nodes[otherPort.nodeId];
                if (otherNode) {
                    let current = otherNode;
                    let depth = 0;
                    while (current && current.id !== nodeData.id && current.parentId && current.parentId !== 'root') {
                        depth++;
                        current = state.nodes[current.parentId];
                    }
                    if (current && current.id === nodeData.id && depth > 0) {
                        if (depth > maxInternalDepth) maxInternalDepth = depth;
                    }
                }
            }
        }
    });

    // Check cross-level link
    let isCrossLevel = false;
    state.links.forEach(l => {
        if (l.sourcePortId === data.id || l.targetPortId === data.id) {
            const otherPortId = l.sourcePortId === data.id ? l.targetPortId : l.sourcePortId;
            const otherPort = state.ports[otherPortId];
            if (otherPort) {
                const otherNode = state.nodes[otherPort.nodeId];
                const myNode = state.nodes[nodeData.id];
                if (otherNode && myNode) {
                    const myContext = state.layers && state.layers[myNode.parentId] ? state.layers[myNode.parentId].parentId || 'root' : myNode.parentId || 'root';
                    const otherContext = state.layers && state.layers[otherNode.parentId] ? state.layers[otherNode.parentId].parentId || 'root' : otherNode.parentId || 'root';
                    if (myContext !== otherContext) {
                        isCrossLevel = true;
                    }
                }
            }
        }
    });

    let ringClasses = '';
    if (!isPending && !isSelected) {
        if (isCrossLevel) {
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
                ${isSelected && !isPending ? 'ring-1 ring-white scale-[3] !z-50' : ringClasses}
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
            title={`Порт ${data.type} (Двойной клик для погружения)`}
            data-port-id={data.id}
            data-node-id={nodeData.id}
            data-edge={data.edge}
        />
    );
}