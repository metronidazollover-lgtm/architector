// Статистика вложенности: сколько элементов и связей живёт внутри узла.
// Двойной экспорт: window для браузера, module.exports для node:test (см. docs/PLAN.md, этап 0.2).
const HierarchyUtils = {
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
