// Иерархия сущностей: абсолютные координаты, статистика вложенности.
// Двойной экспорт: window для браузера, module.exports для node:test (см. docs/PLAN.md, этап 0.2).

// Кэш абсолютных позиций на поколение стейта: state.nodes пересоздаётся при каждом
// изменении, поэтому WeakMap по nodes инвалидируется сам.
const _absCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

const HierarchyUtils = {
    /**
     * Абсолютная (мировая) позиция сущности: подъём по цепочке parentId
     * с суммированием относительных позиций. Для parentId === 'root' или
     * неизвестного родителя подъём останавливается.
     * @param {string} id
     * @param {Object<string, NodeEntity>} nodes
     * @param {?Object<string, LayerEntity>} layers
     * @param {?Object<string, PortEntity>} [ports]
     * @returns {Point}
     */
    getAbsolutePosition: (id, nodes, layers, ports = null) => {

        let generation = _absCache && _absCache.get(nodes);
        if (generation && generation.layersRef === layers) {
            const hit = generation.map.get(id);
            if (hit) return hit;
        } else if (_absCache) {
            generation = { layersRef: layers, map: new Map() };
            _absCache.set(nodes, generation);
        }

        let x = 0, y = 0;
        let current = nodes[id] || (layers && layers[id]);
        const visited = new Set();
        while (current && !visited.has(current.id)) {
            visited.add(current.id);
            x += current.position?.x || 0;
            y += current.position?.y || 0;
            const parentId = current.parentId;
            if (!parentId || parentId === 'root') break;
            if (nodes[parentId]) {
                current = nodes[parentId];
            } else if (layers && layers[parentId]) {
                current = layers[parentId];
            } else if (ports && ports[parentId]) {
                const port = ports[parentId];
                const ownerNode = nodes[port.nodeId];
                if (ownerNode) {
                    const geom = typeof window !== 'undefined' ? window.GeometryUtils : null;
                    if (geom && geom.getPortAbsolutePosition) {
                        const ownerAbs = HierarchyUtils.getAbsolutePosition(ownerNode.id, nodes, layers, ports);
                        const portAbs = geom.getPortAbsolutePosition(port, ownerNode, ownerAbs);
                        x += portAbs.x;
                        y += portAbs.y;
                    } else {
                        const ownerAbs = HierarchyUtils.getAbsolutePosition(ownerNode.id, nodes, layers, ports);
                        x += ownerAbs.x;
                        y += ownerAbs.y;
                    }
                }
                break;
            } else {
                break;
            }
        }

        const result = { x, y };
        if (generation) generation.map.set(id, result);
        return result;
    },


    /**
     * Пересчёт абсолютной позиции в систему координат нового родителя.
     * @param {Point} absPos
     * @param {string} newParentId
     * @param {Object<string, NodeEntity>} nodes
     * @param {?Object<string, LayerEntity>} layers
     * @param {?Object<string, PortEntity>} [ports]
     * @returns {Point}
     */
    toRelativePosition: (absPos, newParentId, nodes, layers, ports = null) => {
        if (!newParentId || newParentId === 'root') return { x: absPos.x, y: absPos.y };
        const parentAbs = HierarchyUtils.getAbsolutePosition(newParentId, nodes, layers, ports);
        return { x: absPos.x - parentAbs.x, y: absPos.y - parentAbs.y };
    },


    /**
     * Ограничивающий прямоугольник прямых детей узла (узлы и слои)
     * в системе координат родителя. null, если детей нет.
     * @returns {?{minX:number,minY:number,maxX:number,maxY:number}}
     */
    getChildrenBBox: (parentId, nodes, layers) => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let found = false;

        const extend = (entity, defW, defH) => {
            if (!entity || entity.parentId !== parentId) return;
            found = true;
            const x = entity.position?.x || 0;
            const y = entity.position?.y || 0;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + (entity.size?.w || defW));
            maxY = Math.max(maxY, y + (entity.size?.h || defH));
        };

        Object.values(nodes || {}).forEach(n => extend(n, 200, 100));
        Object.values(layers || {}).forEach(l => extend(l, 600, 400));

        return found ? { minX, minY, maxX, maxY } : null;
    },

    /**
     * Точный глобальный уровень вложенности (depth, 0-based) сущности графа.
     * Узлы на Главном холсте, порты и связи на них — уровень 0.
     * Элементы внутри контейнеров — уровень 1, 2 и т.д.
     * @param {string} id
     * @param {Object} nodes
     * @param {Object} [layers]
     * @param {Object} [ports]
     * @param {Object} [links]
     * @returns {number}
     */
    getEntityDepth: (id, nodes, layers = null, ports = null, links = null) => {
        if (!id || id === 'root') return 0;
        
        const safeNodes = nodes || {};
        const safeLayers = layers || {};
        const safePorts = ports || {};
        const safeLinks = Array.isArray(links) ? links.reduce((acc, l) => { if (l && l.id) acc[l.id] = l; return acc; }, {}) : (links || {});

        // 1. Если это порт
        if (safePorts[id]) {
            const port = safePorts[id];
            return HierarchyUtils.getEntityDepth(port.nodeId, safeNodes, safeLayers, safePorts, safeLinks);
        }

        // 2. Если это связь
        if (safeLinks[id]) {
            const link = safeLinks[id];
            if (!link.context || link.context === 'root') return 0;
            return HierarchyUtils.getEntityDepth(link.context, safeNodes, safeLayers, safePorts, safeLinks) + 1;
        }

        // 3. Если это слой
        if (safeLayers[id]) {
            const layer = safeLayers[id];
            return HierarchyUtils.getEntityDepth(layer.parentId || 'root', safeNodes, safeLayers, safePorts, safeLinks);
        }

        // 4. Если это узел
        if (safeNodes[id]) {
            let depth = 0;
            let pId = safeNodes[id].parentId;
            const visited = new Set([id]);
            while (pId && pId !== 'root' && !visited.has(pId)) {
                visited.add(pId);
                if (safeLayers[pId]) {
                    pId = safeLayers[pId].parentId;
                } else if (safeNodes[pId]) {
                    depth++;
                    pId = safeNodes[pId].parentId;
                } else if (safePorts[pId]) {
                    depth++;
                    pId = safePorts[pId].nodeId;
                } else if (safeLinks[pId]) {
                    depth++;
                    pId = safeLinks[pId].context;
                } else {
                    break;
                }
            }
            return depth;
        }

        return 0;
    },

    /**
     * Является ли candidateId потомком (или самим) ancestorId по цепочке parentId.
     * Защита от циклов при перевложении.
     */
    isDescendantOf: (candidateId, ancestorId, nodes, layers, ports = null, links = null) => {
        if (candidateId === ancestorId) return true;
        let current = (nodes && nodes[candidateId]) || (layers && layers[candidateId]) || (ports && ports[candidateId]) || (links && links[candidateId]);
        const visited = new Set();
        while (current && !visited.has(current.id)) {
            visited.add(current.id);
            if (current.parentId === ancestorId) return true;
            current = (nodes && nodes[current.parentId]) || (layers && layers[current.parentId]) || (ports && ports[current.parentId]) || (links && links[current.parentId]) || null;
        }
        return false;
    },
    // Прямые дети узла/контекста: узлы, слои и связи, у которых оба конца внутри
    getChildrenStats: (nodes, layers, ports, links, parentId) => {
        let nodeCount = 0;
        let layerCount = 0;
        const childNodeIds = new Set();

        Object.values(nodes || {}).forEach(n => {
            if (n && n.parentId === parentId) {
                nodeCount++;
                childNodeIds.add(n.id);
            }
        });

        Object.values(layers || {}).forEach(l => {
            if (l && l.parentId === parentId) layerCount++;
        });

        let linkCount = 0;
        const linkList = Array.isArray(links) ? links : Object.values(links || {});
        linkList.forEach(l => {
            if (!l) return;
            const sourcePort = ports[l.sourcePortId];
            const targetPort = ports[l.targetPortId];
            if (sourcePort && targetPort && childNodeIds.has(sourcePort.nodeId) && childNodeIds.has(targetPort.nodeId)) {
                linkCount++;
            }
        });

        return { nodeCount, layerCount, linkCount, total: nodeCount + layerCount };
    }
};

/**
 * Связи, пересекающие границу контекста (этап 5.3a): один конец у строгого
 * потомка contextId, другой — снаружи. Сам контекст-узел «внутренним» не считается:
 * его порты лежат на границе и принадлежат родительскому уровню.
 * @returns {{incoming: Array<{link:any, outerNodeId:string, innerNodeId:string}>, outgoing: Array<{link:any, outerNodeId:string, innerNodeId:string}>}}
 */
HierarchyUtils.getBoundaryLinks = (contextId, nodes, layers, ports, links) => {
    const inside = (nodeId) =>
        nodeId !== contextId && HierarchyUtils.isDescendantOf(nodeId, contextId, nodes, layers);

    const result = { incoming: [], outgoing: [] };
    const linkList = Array.isArray(links) ? links : Object.values(links || {});
    linkList.forEach(link => {
        if (!link) return;
        const sourcePort = ports[link.sourcePortId];
        const targetPort = ports[link.targetPortId];
        if (!sourcePort || !targetPort) return;
        const sIn = inside(sourcePort.nodeId);
        const tIn = inside(targetPort.nodeId);
        if (sIn === tIn) return;
        if (sIn) {
            result.outgoing.push({ link, outerNodeId: targetPort.nodeId, innerNodeId: sourcePort.nodeId });
        } else {
            result.incoming.push({ link, outerNodeId: sourcePort.nodeId, innerNodeId: targetPort.nodeId });
        }
    });
    return result;
};

if (typeof window !== 'undefined') window.HierarchyUtils = HierarchyUtils;
if (typeof module !== 'undefined') module.exports = HierarchyUtils;
