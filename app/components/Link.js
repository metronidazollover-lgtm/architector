function Link({ data }) {
    const { state, dispatch } = useStore();
    const { nodes, ports } = state;
    const isConnectedToSelectedPort = state.selectedIds.some(sid => 
        state.ports[sid] && (data.sourcePortId === sid || data.targetPortId === sid)
    );
    const isConnectedToSelectedNode = state.selectedIds.some(sid => 
        state.nodes[sid] && ((state.ports[data.sourcePortId]?.nodeId === sid) || (state.ports[data.targetPortId]?.nodeId === sid))
    );
    const isSelected = state.selectedIds.includes(data.id) || isConnectedToSelectedPort || isConnectedToSelectedNode;




    const sourcePort = ports[data.sourcePortId];
    const targetPort = ports[data.targetPortId];

    if (!sourcePort || !targetPort) return null;

    const sourceNode = nodes[sourcePort.nodeId];
    const targetNode = nodes[targetPort.nodeId];

    if (!sourceNode || !targetNode) return null;
    if (sourceNode.hidden || targetNode.hidden) return null;

    const sourceAbs = window.HierarchyUtils.getAbsolutePosition(sourceNode.id, nodes, state.layers);
    const targetAbs = window.HierarchyUtils.getAbsolutePosition(targetNode.id, nodes, state.layers);
    const p1 = window.GeometryUtils.getPortAbsolutePosition(sourcePort, sourceNode, sourceAbs);
    const p2 = window.GeometryUtils.getPortAbsolutePosition(targetPort, targetNode, targetAbs);

    // Bezier curve calculation
    const dx = Math.max(Math.abs(p2.x - p1.x) / 2, 50);
    const dy = Math.max(Math.abs(p2.y - p1.y) / 2, 50);

    let cp1x = p1.x; let cp1y = p1.y;
    let cp2x = p2.x; let cp2y = p2.y;

    if (p1.edge === 'left') cp1x -= dx;
    if (p1.edge === 'right') cp1x += dx;
    if (p1.edge === 'top') cp1y -= dy;
    if (p1.edge === 'bottom') cp1y += dy;

    if (p2.edge === 'left') cp2x -= dx;
    if (p2.edge === 'right') cp2x += dx;
    if (p2.edge === 'top') cp2y -= dy;
    if (p2.edge === 'bottom') cp2y += dy;

    const linkColor = data.color || '#666666';
    let pathD = '';
    
    if (data.linkStyle === 'orthogonal') {
        // Уникальный отступ для каждой линии, чтобы они не сливались
        const linkIndex = state.links ? state.links.findIndex(l => l && l.id === data.id) : -1;
        const marginOffset = (linkIndex > -1 ? linkIndex % 6 : 0) * 8;
        const margin = 20 + marginOffset;
        let m1 = margin;
        let m2 = margin;

        if (p1.edge === 'bottom' && p2.edge === 'top' && p2.y > p1.y) {
            m1 = m2 = Math.max(5, Math.min(margin, (p2.y - p1.y) / 2));
        } else if (p1.edge === 'top' && p2.edge === 'bottom' && p2.y < p1.y) {
            m1 = m2 = Math.max(5, Math.min(margin, (p1.y - p2.y) / 2));
        } else if (p1.edge === 'right' && p2.edge === 'left' && p2.x > p1.x) {
            m1 = m2 = Math.max(5, Math.min(margin, (p2.x - p1.x) / 2));
        } else if (p1.edge === 'left' && p2.edge === 'right' && p2.x < p1.x) {
            m1 = m2 = Math.max(5, Math.min(margin, (p1.x - p2.x) / 2));
        }

        let p1Out = { x: p1.x, y: p1.y };
        let p2Out = { x: p2.x, y: p2.y };
        
        if (p1.edge === 'left') p1Out.x -= m1;
        if (p1.edge === 'right') p1Out.x += m1;
        if (p1.edge === 'top') p1Out.y -= m1;
        if (p1.edge === 'bottom') p1Out.y += m1;

        if (p2.edge === 'left') p2Out.x -= m2;
        if (p2.edge === 'right') p2Out.x += m2;
        if (p2.edge === 'top') p2Out.y -= m2;
        if (p2.edge === 'bottom') p2Out.y += m2;

        const isP1Horiz = p1.edge === 'left' || p1.edge === 'right';
        const isP2Horiz = p2.edge === 'left' || p2.edge === 'right';

        let pts = [];
        let midX = (p1Out.x + p2Out.x) / 2;
        let midY = (p1Out.y + p2Out.y) / 2;

        if (isP1Horiz && isP2Horiz) {
            if (p1.edge === p2.edge) {
                let outX = p1.edge === 'left' ? Math.min(p1Out.x, p2Out.x) : Math.max(p1Out.x, p2Out.x);
                pts = [p1, p1Out, {x: outX, y: p1Out.y}, {x: outX, y: p2Out.y}, p2Out, p2];
            } else {
                if ((p1.edge === 'right' && p1Out.x < p2Out.x) || (p1.edge === 'left' && p1Out.x > p2Out.x)) {
                    pts = [p1, p1Out, {x: midX, y: p1Out.y}, {x: midX, y: p2Out.y}, p2Out, p2];
                } else {
                    pts = [p1, p1Out, {x: p1Out.x, y: midY}, {x: p2Out.x, y: midY}, p2Out, p2];
                }
            }
        } else if (!isP1Horiz && !isP2Horiz) {
            if (p1.edge === p2.edge) {
                let outY = p1.edge === 'top' ? Math.min(p1Out.y, p2Out.y) : Math.max(p1Out.y, p2Out.y);
                pts = [p1, p1Out, {x: p1Out.x, y: outY}, {x: p2Out.x, y: outY}, p2Out, p2];
            } else {
                if ((p1.edge === 'bottom' && p1Out.y < p2Out.y) || (p1.edge === 'top' && p1Out.y > p2Out.y)) {
                    pts = [p1, p1Out, {x: p1Out.x, y: midY}, {x: p2Out.x, y: midY}, p2Out, p2];
                } else {
                    pts = [p1, p1Out, {x: midX, y: p1Out.y}, {x: midX, y: p2Out.y}, p2Out, p2];
                }
            }
        } else {
            let ix = isP1Horiz ? p2Out.x : p1Out.x;
            let iy = isP1Horiz ? p1Out.y : p2Out.y;
            
            let p1Forward = isP1Horiz ? 
                ((p1.edge === 'right' && ix >= p1Out.x) || (p1.edge === 'left' && ix <= p1Out.x)) :
                ((p1.edge === 'bottom' && iy >= p1Out.y) || (p1.edge === 'top' && iy <= p1Out.y));
            
            let p2Forward = isP2Horiz ? 
                ((p2.edge === 'right' && ix >= p2Out.x) || (p2.edge === 'left' && ix <= p2Out.x)) :
                ((p2.edge === 'bottom' && iy >= p2Out.y) || (p2.edge === 'top' && iy <= p2Out.y));

            if (p1Forward && p2Forward) {
                pts = [p1, p1Out, {x: ix, y: iy}, p2Out, p2];
            } else {
                if (isP1Horiz) pts = [p1, p1Out, {x: p1Out.x, y: p2Out.y}, p2Out, p2];
                else pts = [p1, p1Out, {x: p2Out.x, y: p1Out.y}, p2Out, p2];
            }
        }

        let cleanPts = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
            let curr = pts[i];
            let prev = cleanPts[cleanPts.length - 1];
            
            if (Math.abs(curr.x - prev.x) < 0.1 && Math.abs(curr.y - prev.y) < 0.1) continue;
            
            if (cleanPts.length > 1) {
                let pPrev = cleanPts[cleanPts.length - 2];
                if ((Math.abs(pPrev.x - prev.x) < 0.1 && Math.abs(prev.x - curr.x) < 0.1) ||
                    (Math.abs(pPrev.y - prev.y) < 0.1 && Math.abs(prev.y - curr.y) < 0.1)) {
                    cleanPts.pop();
                }
            }
            cleanPts.push(curr);
        }
        pts = cleanPts;

        pathD = `M ${pts[0].x} ${pts[0].y} ` + pts.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
    } else {
        pathD = `M ${p1.x} ${p1.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    const handleClick = (e) => {
        e.stopPropagation();
        if (e.shiftKey) {
            dispatch({ type: 'TOGGLE_SELECTED', payload: data.id });
        } else {
            dispatch({ type: 'SET_SELECTED', payload: data.id });
        }
    };

    const handleDoubleClick = (e) => {
        e.stopPropagation();
        dispatch({ type: 'DIVE_INTO', payload: { id: data.id, name: `Связь: ${data.id.split('-')[1]}` } });
    };

    return (
        <svg className="absolute top-0 left-0 pointer-events-none" style={{ width: '1px', height: '1px', overflow: 'visible' }}>
            {/* Hitbox for easier clicking */}
            <path
                d={pathD}
                fill="none"
                stroke="transparent"
                strokeWidth="15"
                className="pointer-events-auto cursor-pointer"
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
            />
            {/* Visual line */}
            <path
                d={pathD}
                fill="none"
                stroke={linkColor}
                strokeWidth={isSelected ? "6" : "2"}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={data.style === 'dashed' ? '5,5' : 'none'}
                className="transition-all duration-200 pointer-events-none"
                style={{
                    filter: isSelected ? `drop-shadow(0 0 8px ${linkColor}AA)` : 'none'
                }}
            />
        </svg>
    );
}

function PendingLink() {
    const { state } = useStore();
    if (!state.pendingConnection) return null;

    const { sourcePortId, endPos } = state.pendingConnection;
    const sourcePort = state.ports[sourcePortId];
    if (!sourcePort) return null;

    const sourceNode = state.nodes[sourcePort.nodeId];
    if (!sourceNode) return null;

    const { offset, zoom } = state.canvas;

    const sourceAbs = window.HierarchyUtils.getAbsolutePosition(sourceNode.id, state.nodes, state.layers);
    const p1 = window.GeometryUtils.getPortAbsolutePosition(sourcePort, sourceNode, sourceAbs);

    // Convert screen endPos to canvas absolute with container rect offset check
    const container = typeof document !== 'undefined' ? document.getElementById('canvas-container') : null;
    const rect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };

    const p2x = (endPos.x - rect.left - offset.x) / zoom;
    const p2y = (endPos.y - rect.top - offset.y) / zoom;

    const dx = p2x - p1.x;
    const dy = p2y - p1.y;

    let cp1x = p1.x;
    let cp1y = p1.y;

    // Плавный вылет добавляется ТОЛЬКО если курсор тянется в естественную сторону грани порта.
    // Если мышь тянется в любом другом направлении, линия идет напрямую ровно к курсору.
    if (p1.edge === 'left' || p1.edge === 'right') {
        const factor = p1.edge === 'right' ? 1 : -1;
        const outDist = (dx * factor > 0) ? Math.min(dx * factor * 0.4, 80) : 0;
        cp1x += factor * outDist;
    } else {
        const factor = p1.edge === 'bottom' ? 1 : -1;
        const outDist = (dy * factor > 0) ? Math.min(dy * factor * 0.4, 80) : 0;
        cp1y += factor * outDist;
    }

    const cp2x = p2x - (cp1x - p1.x);
    const cp2y = p2y - (cp1y - p1.y);

    const pathD = `M ${p1.x} ${p1.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2x} ${p2y}`;

    return (
        <svg className="absolute top-0 left-0 pointer-events-none z-50" style={{ width: '1px', height: '1px', overflow: 'visible' }}>
            <path
                d={pathD}
                fill="none"
                stroke="var(--accent-blue)"
                strokeWidth="2"
                strokeDasharray="5,5"
            />
        </svg>
    );
}


