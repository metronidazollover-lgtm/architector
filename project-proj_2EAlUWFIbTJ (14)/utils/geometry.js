window.GeometryUtils = {
    getPolygonPoints: (shape, w, h) => {
        switch(shape) {
            case 'triangle': return [[w/2,0], [0,h], [w,h]];
            case 'pentagon': return [[w/2,0], [w,h*0.38], [w*0.82,h], [w*0.18,h], [0,h*0.38]];
            case 'hexagon': return [[w*0.25,0], [w*0.75,0], [w,h/2], [w*0.75,h], [w*0.25,h], [0,h/2]];
            case 'octagon': return [[w*0.3,0], [w*0.7,0], [w,h*0.3], [w,h*0.7], [w*0.7,h], [w*0.3,h], [0,h*0.7], [0,h*0.3]];
            default: return [[0,0], [w,0], [w,h], [0,h]]; // rectangle
        }
    },
    getClosestPointOnSegment: (p, a, b) => {
        const atob = { x: b[0] - a[0], y: b[1] - a[1] };
        const atop = { x: p.x - a[0], y: p.y - a[1] };
        const len2 = atob.x * atob.x + atob.y * atob.y;
        if (len2 === 0) return { x: a[0], y: a[1] };
        let dot = atop.x * atob.x + atop.y * atob.y;
        const t = Math.max(0, Math.min(1, dot / len2));
        return { x: a[0] + atob.x * t, y: a[1] + atob.y * t };
    },
    getClosestPointOnPolygon: (shape, w, h, targetX, targetY) => {
        if (shape === 'rectangle' || !shape) return { x: targetX, y: targetY };
        const pts = window.GeometryUtils.getPolygonPoints(shape, w, h);
        let minDist = Infinity;
        let closest = { x: targetX, y: targetY };
        for(let i=0; i<pts.length; i++) {
            const a = pts[i];
            const b = pts[(i+1)%pts.length];
            const cp = window.GeometryUtils.getClosestPointOnSegment({x: targetX, y: targetY}, a, b);
            const dist = Math.hypot(cp.x - targetX, cp.y - targetY);
            if (dist < minDist) {
                minDist = dist;
                closest = cp;
            }
        }
        return closest;
    },
    getEdgePos: (edge, pos, w, h) => {
        if (edge === 'top') return { x: pos * w, y: 0 };
        if (edge === 'bottom') return { x: pos * w, y: h };
        if (edge === 'left') return { x: 0, y: pos * h };
        if (edge === 'right') return { x: w, y: pos * h };
        return { x: 0, y: 0 };
    },
    getPortAbsolutePosition: (port, node) => {
        if (!node) return { x: 0, y: 0, edge: port?.edge || 'top' };
        const shape = node.shape || 'rectangle';
        const { w, h } = node.size || { w: 200, h: 100 };
        const target = window.GeometryUtils.getEdgePos(port.edge, port.position, w, h);
        const cp = window.GeometryUtils.getClosestPointOnPolygon(shape, w, h, target.x, target.y);
        const nx = node.position?.x || 0;
        const ny = node.position?.y || 0;
        return { x: nx + cp.x, y: ny + cp.y, edge: port.edge };
    },
    getPortRelativePosition: (port, node) => {
        const shape = node.shape || 'rectangle';
        const { w, h } = node.size || { w: 200, h: 100 };
        const target = window.GeometryUtils.getEdgePos(port.edge, port.position, w, h);
        return window.GeometryUtils.getClosestPointOnPolygon(shape, w, h, target.x, target.y);
    },
    getSmartPlacement: (nodesToPlace, layer, allNodes) => {
        const existingNodes = Object.values(allNodes).filter(n => n.parentId === layer.id && !nodesToPlace.find(ntp => ntp.id === n.id));
        
        const padding = 20;
        const startX = layer.position.x + padding;
        const startY = layer.position.y + 90; // Увеличенный отступ для шапки слоя
        
        let layerW = layer.size?.w || 600;
        let layerH = layer.size?.h || 400;

        const updatesById = {};
        const placedRects = existingNodes.map(n => ({ x: n.position.x, y: n.position.y, w: n.size?.w || 200, h: n.size?.h || 100 }));

        const checkOverlap = (x, y, w, h) => {
            for (let r of placedRects) {
                if (x < r.x + r.w + padding && x + w + padding > r.x &&
                    y < r.y + r.h + padding && y + h + padding > r.y) {
                    return true;
                }
            }
            return false;
        };

        nodesToPlace.forEach(node => {
            const nw = node.size?.w || 200;
            const nh = node.size?.h || 100;
            
            let placed = false;
            let searchY = startY;
            
            while (!placed) {
                let searchX = startX;
                while (searchX < layer.position.x + Math.max(layerW, 3000)) {
                    if (!checkOverlap(searchX, searchY, nw, nh)) {
                        updatesById[node.id] = { parentId: layer.id, position: { x: searchX, y: searchY } };
                        placedRects.push({ x: searchX, y: searchY, w: nw, h: nh });
                        
                        if (searchX - layer.position.x + nw + padding > layerW) {
                            layerW = searchX - layer.position.x + nw + padding;
                        }
                        if (searchY - layer.position.y + nh + padding > layerH) {
                            layerH = searchY - layer.position.y + nh + padding;
                        }
                        
                        placed = true;
                        break;
                    }
                    searchX += 40;
                }
                if (!placed) searchY += 40;
            }
        });

        return { updatesById, newLayerSize: { w: layerW, h: layerH } };
    }
};
