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
     * @returns {Point}
     */
    getAbsolutePosition: (id, nodes, layers) => {
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
            current = nodes[parentId] || (layers && layers[parentId]) || null;
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
     * @returns {Point}
     */
    toRelativePosition: (absPos, newParentId, nodes, layers) => {
        if (!newParentId || newParentId === 'root') return { x: absPos.x, y: absPos.y };
        const parentAbs = HierarchyUtils.getAbsolutePosition(newParentId, nodes, layers);
        return { x: absPos.x - parentAbs.x, y: absPos.y - parentAbs.y };
    },

    /**
     * Является ли candidateId потомком (или самим) ancestorId по цепочке parentId.
     * Защита от циклов при перевложении.
     */
    isDescendantOf: (candidateId, ancestorId, nodes, layers) => {
        if (candidateId === ancestorId) return true;
        let current = nodes[candidateId] || (layers && layers[candidateId]);
        const visited = new Set();
        while (current && !visited.has(current.id)) {
            visited.add(current.id);
            if (current.parentId === ancestorId) return true;
            current = nodes[current.parentId] || (layers && layers[current.parentId]) || null;
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
        (links || []).forEach(l => {
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

if (typeof window !== 'undefined') window.HierarchyUtils = HierarchyUtils;
if (typeof module !== 'undefined') module.exports = HierarchyUtils;
