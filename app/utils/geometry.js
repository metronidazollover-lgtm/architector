// Геометрия портов, элементов и авторасстановки. Двойной экспорт: браузер + node:test.
const GeometryUtils = {
    getEdgePos: (edge, pos, w, h) => {
        if (edge === 'top') return { x: pos * w, y: 0 };
        if (edge === 'bottom') return { x: pos * w, y: h };
        if (edge === 'left') return { x: 0, y: pos * h };
        if (edge === 'right') return { x: w, y: pos * h };
        return { x: 0, y: 0 };
    },
    /**
     * Мировая позиция порта. С формата v10 позиция узла может быть относительной,
     * поэтому вызывающий передаёт absNodePos (HierarchyUtils.getLocalPosition).
     * Без absNodePos используется node.position как есть (узлы корня).
     */
    getPortAbsolutePosition: (port, node, absNodePos) => {
        if (!node) return { x: 0, y: 0, edge: port?.edge || 'top' };
        const { w, h } = node.size || { w: 200, h: 100 };
        const cp = GeometryUtils.getEdgePos(port.edge, port.position, w, h);
        const nx = absNodePos ? absNodePos.x : (node.position?.x || 0);
        const ny = absNodePos ? absNodePos.y : (node.position?.y || 0);
        return { x: nx + cp.x, y: ny + cp.y, edge: port.edge };
    },
    /**
     * Построение пути связи — ЕДИНСТВЕННАЯ реализация на всё приложение.
     * Используется и внутриуровневыми связями (локальные координаты окна),
     * и магистральным отрезком межуровневой связи (мировые координаты).
     * Пока функция одна, стиль линии не может работать в одном месте и не работать в другом.
     * @param {{x:number,y:number,edge:string}} p1
     * @param {{x:number,y:number,edge:string}} p2
     * @param {string} style 'orthogonal' | 'bezier'
     * @param {number} [marginIndex] порядковый номер связи — разводит параллельные ортогональные линии
     * @returns {string}
     */
    buildLinkPath: (p1, p2, style, marginIndex) => {
        let pathD = '';
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

        
    if (style === 'orthogonal') {
        // Уникальный отступ для каждой линии, чтобы они не сливались
        const linkIndex = (marginIndex === undefined || marginIndex === null) ? -1 : marginIndex;
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
        return pathD;
    },

    getPortRelativePosition: (port, node) => {
        const { w, h } = node.size || { w: 200, h: 100 };
        return GeometryUtils.getEdgePos(port.edge, port.position, w, h);
    },
    /**
     * Авторасстановка узлов внутри слоя без перекрытий.
     * С формата v10 работает в координатах, относительных к слою:
     * и existingNodes (дети слоя), и результат — относительные позиции.
     *
     * `allLayers` (опционально, PLAN_LAYERS_AND_CONTEXT_CREATION.md, 2026-08-30):
     * вложенные слои этого же слоя-контейнера учитываются в bounding-box и
     * проверке перекрытия наравне с узлами, чтобы новый узел не лёг поверх
     * уже существующего вложенного слоя. Без аргумента поведение не меняется
     * (обратная совместимость с существующими вызовами).
     */
    getSmartPlacement: (nodesToPlace, layer, allNodes, allLayers = null) => {
        const existingNodes = Object.values(allNodes).filter(n => n.parentId === layer.id && !nodesToPlace.find(ntp => ntp.id === n.id));
        const existingLayers = allLayers
            ? Object.values(allLayers).filter(l => l.id !== layer.id && l.parentId === layer.id)
            : [];

        const padding = 20;
        const startX = padding;
        const startY = Math.max(90, (layer.fontSize ? Math.round(layer.fontSize * 2.5 + 45) : 90)); // Отступ под шапку слоя

        let layerW = layer.size?.w || 600;
        let layerH = layer.size?.h || 400;

        const updatesById = {};
        const placedRects = [
            ...existingNodes.map(n => ({ x: n.position.x, y: n.position.y, w: n.size?.w || 200, h: n.size?.h || 100 })),
            ...existingLayers.map(l => ({ x: l.position.x, y: l.position.y, w: l.size?.w || 600, h: l.size?.h || 400 }))
        ];

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
                while (searchX < Math.max(layerW, 3000)) {
                    if (!checkOverlap(searchX, searchY, nw, nh)) {
                        updatesById[node.id] = { parentId: layer.id, position: { x: searchX, y: searchY } };
                        placedRects.push({ x: searchX, y: searchY, w: nw, h: nh });
                        placed = true;
                        break;
                    }
                    searchX += 40;
                }
                if (!placed) searchY += 40;
            }
        });

        // Оптимизация размера слоя: fit-to-content (bounding box всех нод + padding)
        let maxR = 0, maxB = 0;
        placedRects.forEach(r => {
            maxR = Math.max(maxR, r.x + r.w);
            maxB = Math.max(maxB, r.y + r.h);
        });
        const optimalW = placedRects.length > 0 ? Math.max(300, maxR + padding) : layerW;
        const optimalH = placedRects.length > 0 ? Math.max(200, maxB + padding) : layerH;

        return { updatesById, newLayerSize: { w: optimalW, h: optimalH } };
    },
    /**
     * Разрешение коллизии слоёв: корректирует позицию перемещаемого слоя,
     * чтобы он не перекрывал другие слои в том же контексте.
     * Возвращает скорректированные {x, y} или исходные, если коллизий нет.
     * @param {string} movingId — ID перемещаемого слоя
     * @param {number} targetX, targetY — целевая позиция (относительная)
     * @param {number} movingW, movingH — размеры перемещаемого слоя
     * @param {Object} allLayers — все слои из state.layers
     * @param {number} gap — зазор между слоями (px)
     */
    resolveLayerCollision: (movingId, targetX, targetY, movingW, movingH, allLayers, gap = 10) => {
        let x = targetX, y = targetY;
        const movingLayer = allLayers[movingId];
        if (!movingLayer) return { x, y };
        const parentId = movingLayer.parentId || 'root';

        const siblings = Object.values(allLayers).filter(l =>
            l.id !== movingId && (l.parentId || 'root') === parentId
        );

        // Итеративное разрешение коллизий (макс. 5 проходов для каскадных случаев)
        for (let iter = 0; iter < 5; iter++) {
            let resolved = true;
            for (const other of siblings) {
                const ox = other.position?.x || 0;
                const oy = other.position?.y || 0;
                const ow = other.size?.w || 600;
                const oh = other.size?.h || 400;

                // Проверка перекрытия по обеим осям
                const overlapX = x < ox + ow + gap && x + movingW + gap > ox;
                const overlapY = y < oy + oh + gap && y + movingH + gap > oy;

                if (overlapX && overlapY) {
                    resolved = false;
                    // Выталкивание по кратчайшему направлению
                    const pushRight = (ox + ow + gap) - x;
                    const pushLeft = x + movingW + gap - ox;
                    const pushDown = (oy + oh + gap) - y;
                    const pushUp = y + movingH + gap - oy;

                    const minPush = Math.min(
                        Math.abs(pushRight), Math.abs(pushLeft),
                        Math.abs(pushDown), Math.abs(pushUp)
                    );

                    if (minPush === Math.abs(pushRight)) x = ox + ow + gap;
                    else if (minPush === Math.abs(pushLeft)) x = ox - movingW - gap;
                    else if (minPush === Math.abs(pushDown)) y = oy + oh + gap;
                    else y = oy - movingH - gap;
                }
            }
            if (resolved) break;
        }

        return { x, y };
    },
    /**
     * Разрешает коллизии на одном уровне иерархии:
     * - Отдельные ноды от слоев (зазор 30px)
     * - Отдельные ноды друг от друга (зазор 30px)
     */
    resolveContextCollisions: (nodes, layers) => {
        const updatedNodes = { ...nodes };
        const nodeIds = Object.keys(updatedNodes);
        const gap = 30; // Единый зазор 30px для всех коллизий на уровне

        for (let iter = 0; iter < 5; iter++) {
            let anyChange = false;

            nodeIds.forEach(nodeId => {
                const node = updatedNodes[nodeId];
                if (!node) return;

                // Пропускаем ноды, находящиеся внутри слоев
                const isInsideLayer = node.parentId && layers[node.parentId];
                if (isInsideLayer) return;

                const parentId = node.parentId || 'root';
                const nw = node.size?.w || 200;
                const nh = node.size?.h || 100;
                let nx = node.position?.x || 0;
                let ny = node.position?.y || 0;

                // 1. Коллизии с другими отдельными нодами в том же контексте
                nodeIds.forEach(otherId => {
                    if (otherId === nodeId) return;
                    const other = updatedNodes[otherId];
                    if (!other || (other.parentId || 'root') !== parentId) return;
                    if (other.parentId && layers[other.parentId]) return; // Другая нода внутри слоя

                    const ow = other.size?.w || 200;
                    const oh = other.size?.h || 100;
                    const ox = other.position?.x || 0;
                    const oy = other.position?.y || 0;

                    const overlapX = nx < ox + ow + gap && nx + nw + gap > ox;
                    const overlapY = ny < oy + oh + gap && ny + nh + gap > oy;

                    if (overlapX && overlapY) {
                        anyChange = true;
                        const pushRight = (ox + ow + gap) - nx;
                        const pushLeft = nx + nw + gap - ox;
                        const pushDown = (oy + oh + gap) - ny;
                        const pushUp = ny + nh + gap - oy;

                        const minPush = Math.min(Math.abs(pushRight), Math.abs(pushLeft), Math.abs(pushDown), Math.abs(pushUp));

                        if (minPush === Math.abs(pushRight)) nx = ox + ow + gap;
                        else if (minPush === Math.abs(pushLeft)) nx = ox - nw - gap;
                        else if (minPush === Math.abs(pushDown)) ny = oy + oh + gap;
                        else ny = oy - nh - gap;
                    }
                });

                // 2. Коллизии со слоями в том же контексте
                const contextLayers = Object.values(layers).filter(l => (l.parentId || 'root') === parentId);
                contextLayers.forEach(layer => {
                    const lx = layer.position?.x || 0;
                    const ly = layer.position?.y || 0;
                    const lw = layer.size?.w || 600;
                    const lh = layer.size?.h || 400;

                    const overlapX = nx < lx + lw + gap && nx + nw + gap > lx;
                    const overlapY = ny < ly + lh + gap && ny + nh + gap > ly;

                    if (overlapX && overlapY) {
                        anyChange = true;
                        const pushRight = (lx + lw + gap) - nx;
                        const pushLeft = nx + nw + gap - lx;
                        const pushDown = (ly + lh + gap) - ny;
                        const pushUp = ny + nh + gap - ly;

                        const minPush = Math.min(Math.abs(pushRight), Math.abs(pushLeft), Math.abs(pushDown), Math.abs(pushUp));

                        if (minPush === Math.abs(pushRight)) nx = lx + lw + gap;
                        else if (minPush === Math.abs(pushLeft)) nx = lx - nw - gap;
                        else if (minPush === Math.abs(pushDown)) ny = ly + lh + gap;
                        else ny = ly - nh - gap;
                    }
                });

                if (nx !== node.position.x || ny !== node.position.y) {
                    updatedNodes[nodeId] = {
                        ...node,
                        position: { x: nx, y: ny }
                    };
                }
            });

            if (!anyChange) break;
        }

        return updatedNodes;
    },
    /**
     * Выстраивает слои в указанном контексте вертикально в логическом порядке по имени (natural sort).
     * Для вложенных уровней вычисляет отступ 100px вправо от самого широкого слоя предыдущего уровня.
     * Зазор между слоями gap (по умолчанию 90px).
     */
    alignLayers: (layers, nodes = {}, contextId = 'root', gap = 90) => {
        const updatedLayers = { ...layers };
        
        // Находим все слои в этом контексте
        const contextLayers = Object.values(updatedLayers)
            .filter(l => (l.parentId || 'root') === contextId)
            // Сортируем с использованием natural sort
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        if (contextLayers.length === 0) return updatedLayers;

        let startX = null;

        if (contextId !== 'root' && nodes && nodes[contextId]) {
            const contextNode = nodes[contextId];
            const H = (typeof window !== 'undefined' && window.HierarchyUtils) ? window.HierarchyUtils :
                      (typeof global !== 'undefined' && global.HierarchyUtils) ? global.HierarchyUtils :
                      (typeof require !== 'undefined' ? (function() { try { return require('./hierarchy.js'); } catch(e) { return null; } })() : null);

            if (H) {
                // Ищем родительский контекст уровня выше
                const parentContextId = layers[contextNode.parentId] 
                    ? (layers[contextNode.parentId].parentId || 'root') 
                    : (contextNode.parentId || 'root');

                const parentLayers = Object.values(layers).filter(l => (l.parentId || 'root') === parentContextId);
                
                if (parentLayers.length > 0) {
                    // Абсолютный правый край самого широкого слоя предыдущего уровня
                    const rightEdges = parentLayers.map(l => {
                        const abs = H.getLocalPosition(l.id, nodes, layers);
                        const w = l.size?.w || 600;
                        return abs.x + w;
                    });
                    const maxRightAbs = Math.max(...rightEdges);
                    
                    // Абсолютная позиция текущего узла-контекста
                    const nodeAbs = H.getLocalPosition(contextId, nodes, layers);
                    
                    // Относительный X: отступаем 100px от правого края родительского слоя
                    startX = Math.max(30, (maxRightAbs + 100) - nodeAbs.x);
                }
            }
        }

        // Если не вложенный уровень или на предыдущем уровне слоев нет — используем левую границу первого слоя
        if (startX === null) {
            startX = Math.min(...contextLayers.map(l => l.position?.x || 0));
        }

        let currentY = contextLayers[0].position?.y || 0;

        contextLayers.forEach((layer) => {
            updatedLayers[layer.id] = {
                ...layer,
                position: { x: startX, y: currentY }
            };
            const lh = layer.size?.h || 400;
            currentY += lh + gap;
        });

        return updatedLayers;
    },
    /**
     * Проверяет и устраняет перекрытие слоев в одном контексте при загрузке.
     * Сохраняет пользовательскую позицию, раздвигая слои при коллизиях.
     */
    resolveLayerCollisionsOnLoad: (layers, gap = 30) => {
        const updatedLayers = { ...layers };
        const layerIds = Object.keys(updatedLayers);

        for (let iter = 0; iter < 5; iter++) {
            let anyChange = false;

            layerIds.forEach(id1 => {
                const l1 = updatedLayers[id1];
                if (!l1) return;

                const parentId = l1.parentId || 'root';
                let x1 = l1.position?.x || 0;
                let y1 = l1.position?.y || 0;
                const w1 = l1.size?.w || 600;
                const h1 = l1.size?.h || 400;

                layerIds.forEach(id2 => {
                    if (id2 === id1) return;
                    const l2 = updatedLayers[id2];
                    if (!l2 || (l2.parentId || 'root') !== parentId) return;

                    let x2 = l2.position?.x || 0;
                    let y2 = l2.position?.y || 0;
                    const w2 = l2.size?.w || 600;
                    const h2 = l2.size?.h || 400;

                    const overlapX = x1 < x2 + w2 + gap && x1 + w1 + gap > x2;
                    const overlapY = y1 < y2 + h2 + gap && y1 + h1 + gap > y2;

                    if (overlapX && overlapY) {
                        anyChange = true;
                        
                        // Выталкиваем l1 относительно l2
                        const pushRight = (x2 + w2 + gap) - x1;
                        const pushLeft = x1 + w1 + gap - x2;
                        const pushDown = (y2 + h2 + gap) - y1;
                        const pushUp = y1 + h1 + gap - y2;

                        const minPush = Math.min(Math.abs(pushRight), Math.abs(pushLeft), Math.abs(pushDown), Math.abs(pushUp));

                        if (minPush === Math.abs(pushRight)) x1 = x2 + w2 + gap;
                        else if (minPush === Math.abs(pushLeft)) x1 = x2 - w1 - gap;
                        else if (minPush === Math.abs(pushDown)) y1 = y2 + h2 + gap;
                        else y1 = y2 - h1 - gap;
                    }
                });

                if (x1 !== l1.position.x || y1 !== l1.position.y) {
                    updatedLayers[id1] = {
                        ...l1,
                        position: { x: x1, y: y1 }
                    };
                }
            });

            if (!anyChange) break;
        }

        return updatedLayers;
    }
};

/**
 * Вписывание мирового bbox в холст миникарты (этап 4.2).
 * Возвращает преобразование мир -> миникарта: mini = (world - center) * scale + canvasCenter.
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} bbox
 * @param {number} canvasW @param {number} canvasH @param {number} pad
 * @returns {{scale:number, toMini:(x:number,y:number)=>{x:number,y:number}, toWorld:(x:number,y:number)=>{x:number,y:number}}}
 */
GeometryUtils.fitBBoxToCanvas = (bbox, canvasW, canvasH, pad = 10) => {
    const w = Math.max(1, bbox.maxX - bbox.minX);
    const h = Math.max(1, bbox.maxY - bbox.minY);
    const scale = Math.min((canvasW - pad * 2) / w, (canvasH - pad * 2) / h);
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;
    return {
        scale,
        toMini: (x, y) => ({ x: (x - cx) * scale + canvasW / 2, y: (y - cy) * scale + canvasH / 2 }),
        toWorld: (x, y) => ({ x: (x - canvasW / 2) / scale + cx, y: (y - canvasH / 2) / scale + cy })
    };
};

if (typeof window !== 'undefined') window.GeometryUtils = GeometryUtils;
if (typeof module !== 'undefined') module.exports = GeometryUtils;
