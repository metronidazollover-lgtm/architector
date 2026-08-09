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

HierarchyUtils.getBreadcrumbPath = (targetId, nodes, layers, ports, links) => {
    const breadcrumbs = [{ id: 'root', name: 'Главный холст' }];
    if (!targetId || targetId === 'root') return breadcrumbs;

    let effectiveId = targetId;
    if (ports && ports[targetId]) {
        effectiveId = ports[targetId].nodeId;
    } else if (links && links[targetId]) {
        const link = links[targetId];
        const sp = ports ? ports[link.sourcePortId] : null;
        effectiveId = sp ? sp.nodeId : 'root';
    }

    if (!effectiveId || effectiveId === 'root') return breadcrumbs;

    const path = [];
    let current = nodes[effectiveId] || (layers && layers[effectiveId]);
    const visited = new Set();

    while (current && current.id !== 'root' && !visited.has(current.id)) {
        visited.add(current.id);
        path.unshift({ id: current.id, name: current.name || current.id });
        const parentId = current.parentId;
        if (!parentId || parentId === 'root') break;
        current = nodes[parentId] || (layers && layers[parentId]);
    }

    return [...breadcrumbs, ...path];
};

/**
 * Относительная глубина сущности от заданного контекста.
 * Положительное число — потомок (1 = прямой ребёнок, 2 = внук и т.д.),
 * 0 — сама сущность, отрицательное — предок, null — разные ветки.
 * Слои прозрачны (не инкрементируют глубину), кроме случая когда
 * запрашиваемая сущность сама является слоем (первый хоп).
 * Порты приводятся к узлу-владельцу.
 * @param {string} entityId
 * @param {string} contextId
 * @param {Object} nodes
 * @param {Object} [layers]
 * @param {Object} [ports]
 * @param {Object} [links]
 * @returns {number|null}
 */
HierarchyUtils.getRelativeDepth = (entityId, contextId, nodes, layers, ports, links) => {
    if (!entityId || !contextId) return null;
    if (entityId === contextId) return 0;

    const safeNodes = nodes || {};
    const safeLayers = layers || {};
    const safePorts = ports || {};
    const safeLinks = (Array.isArray(links) ? links.reduce((a, l) => { if (l && l.id) a[l.id] = l; return a; }, {}) : links) || {};

    // Подъём от fromId к toId с подсчётом хопов.
    // Первый хоп всегда считается (сущность сама — ребёнок чего-то),
    // промежуточные слои — прозрачны, промежуточные порты — прозрачны.
    const walkUp = (fromId, toId) => {
        // Порт приводим к узлу-владельцу
        let resolvedFrom = fromId;
        if (safePorts[resolvedFrom]) resolvedFrom = safePorts[resolvedFrom].nodeId;
        if (resolvedFrom === toId) return 0;

        let depth = 0;
        let cId = resolvedFrom;
        const visited = new Set();
        let firstHop = true;

        while (cId && cId !== 'root' && !visited.has(cId)) {
            visited.add(cId);

            let parentId;
            let isTransparent = false;

            if (safePorts[cId]) {
                // Порт → узел-владелец: тот же уровень
                parentId = safePorts[cId].nodeId;
                isTransparent = true;
            } else if (safeLinks[cId]) {
                parentId = safeLinks[cId].context || 'root';
            } else if (safeLayers[cId]) {
                parentId = (safeLayers[cId].parentId || 'root');
                // Слой прозрачен только как промежуточный контейнер, не на первом хопе
                isTransparent = !firstHop;
            } else if (safeNodes[cId]) {
                parentId = (safeNodes[cId].parentId || 'root');
            } else {
                break;
            }

            if (!isTransparent) depth++;
            firstHop = false;

            // Достигли цели напрямую?
            if (parentId === toId) return depth;
            // Родитель — слой, чей parentId = цель? (пропуск слоя)
            if (safeLayers[parentId] && (safeLayers[parentId].parentId || 'root') === toId) return depth;

            cId = parentId;
        }
        // Если цель — root и мы вышли из цикла
        if (toId === 'root') return depth;
        return null;
    };

    // Проверяем, является ли сущность потомком контекста
    const descDepth = walkUp(entityId, contextId);
    if (descDepth !== null) return descDepth;

    // Проверяем, является ли сущность предком контекста
    const ancDepth = walkUp(contextId, entityId);
    if (ancDepth !== null) return -ancDepth;

    return null; // Разные ветки
};

/**
 * Динамический расчет максимальных глубин потомков и предков текущего контекста.
 * @param {string} contextId
 * @param {Object} nodes
 * @param {Object} [layers]
 * @param {Object} [ports]
 * @param {Object} [links]
 * @returns {{ maxDown: number, maxUp: number }}
 */
HierarchyUtils.getMaxRelativeDepths = (contextId, nodes, layers, ports, links) => {
    let maxDown = 0;
    let maxUp = 0;
    const safeNodes = nodes || {};
    const safeLayers = layers || {};

    Object.values(safeNodes).forEach(n => {
        if (!n || !n.id) return;
        const rel = HierarchyUtils.getRelativeDepth(n.id, contextId, nodes, layers, ports, links);
        if (rel !== null) {
            if (rel > 1) maxDown = Math.max(maxDown, rel - 1);
            if (rel < 0) maxUp = Math.max(maxUp, Math.abs(rel));
        }
    });

    Object.values(safeLayers).forEach(l => {
        if (!l || !l.id) return;
        const rel = HierarchyUtils.getRelativeDepth(l.id, contextId, nodes, layers, ports, links);
        if (rel !== null) {
            if (rel > 1) maxDown = Math.max(maxDown, rel - 1);
            if (rel < 0) maxUp = Math.max(maxUp, Math.abs(rel));
        }
    });

    return { maxDown, maxUp };
};

/**
 * Единая функция видимости: заменяет 13-булевый спагетти в Canvas.js.
 * Возвращает полный дескриптор видимости для одной сущности.
 *
 * @param {string} entityId
 * @param {string} currentContext
 * @param {number} xRayDown  — сколько уровней вглубь просвечивать (динамически 0..N)
 * @param {number} xRayUp    — сколько уровней вверх просвечивать (динамически 0..N)
 * @param {Object} nodes
 * @param {Object} layers
 * @param {Object} ports
 * @param {Object} links
 * @param {Object} extras  — { selectedIds, peekNodeId, transitionFromContext, isolatedIds, breadcrumbs }
 * @returns {{ visible:boolean, opacity:number, interactive:boolean, role:string, zIndex:number, isContextNode:boolean, isParentOfSelected:boolean }}
 */
HierarchyUtils.getVisibilityState = (entityId, currentContext, xRayDown, xRayUp, nodes, layers, ports, links, extras) => {
    const safeNodes = nodes || {};
    const safeLayers = layers || {};
    const safePorts = ports || {};
    const safeLinks = (Array.isArray(links) ? links.reduce((a, l) => { if (l && l.id) a[l.id] = l; return a; }, {}) : links) || {};
    const selectedIds = (extras && extras.selectedIds) || [];
    const peekNodeId = extras && extras.peekNodeId;
    const transitionCtx = extras && extras.transitionFromContext;
    const isolatedIds = (extras && extras.isolatedIds) || [];
    const breadcrumbs = (extras && extras.breadcrumbs) || [];

    const HIDDEN = { visible: false, opacity: 0, interactive: false, role: 'hidden', zIndex: 0, isContextNode: false, isParentOfSelected: false };

    // ——— Фильтр изоляции ———
    if (isolatedIds.length > 0 && !isolatedIds.includes(entityId)) return HIDDEN;

    // ——— Хелпер: «истинный» родительский контекст (пропуск слоёв) ———
    const getTrueParent = (id) => {
        const n = safeNodes[id];
        if (n) {
            const p = n.parentId || 'root';
            if (safeLayers[p]) return safeLayers[p].parentId || 'root';
            return p;
        }
        const ly = safeLayers[id];
        if (ly) return ly.parentId || 'root';
        const port = safePorts[id];
        if (port) return getTrueParent(port.nodeId);
        const lnk = safeLinks[id];
        if (lnk) return lnk.context || 'root';
        return 'root';
    };

    // ——— Относительная глубина ———
    const relDepth = HierarchyUtils.getRelativeDepth(entityId, currentContext, safeNodes, safeLayers, safePorts, safeLinks);

    // ——— 0. Сам контекст ———
    if (entityId === currentContext) {
        return { visible: true, opacity: 1, interactive: true, role: 'context', zIndex: 5, isContextNode: true, isParentOfSelected: false };
    }

    // ——— 1. Родитель текущего порта-контекста ———
    if (safePorts[currentContext] && safePorts[currentContext].nodeId === entityId) {
        return { visible: true, opacity: 1, interactive: true, role: 'port-parent', zIndex: 5, isContextNode: true, isParentOfSelected: false };
    }

    // ——— 2. Якорь связи-контекста ———
    if (safeLinks[currentContext]) {
        const ctxLink = safeLinks[currentContext];
        const sp = safePorts[ctxLink.sourcePortId];
        const tp = safePorts[ctxLink.targetPortId];
        if ((sp && sp.nodeId === entityId) || (tp && tp.nodeId === entityId)) {
            return { visible: true, opacity: 1, interactive: true, role: 'link-endpoint', zIndex: 5, isContextNode: true, isParentOfSelected: false };
        }
    }

    // ——— 3. Связанные узлы порта-контекста ———
    if (safePorts[currentContext]) {
        const activePort = safePorts[currentContext];
        const isConnectedViaLink = Object.values(safeLinks).some(l =>
            l && ((l.sourcePortId === activePort.id && safePorts[l.targetPortId] && safePorts[l.targetPortId].nodeId === entityId) ||
                  (l.targetPortId === activePort.id && safePorts[l.sourcePortId] && safePorts[l.sourcePortId].nodeId === entityId))
        );
        if (isConnectedViaLink) {
            return { visible: true, opacity: 1, interactive: true, role: 'port-connected', zIndex: 5, isContextNode: false, isParentOfSelected: false };
        }
    }

    // ——— 4. Подсветка выделенной цепочки (сквозная) ———
    const isExplicitlySelected = selectedIds.includes(entityId);
    const isConnectedToSelected = !isExplicitlySelected && selectedIds.length > 0 && (() => {
        const nodeId = safePorts[entityId] ? safePorts[entityId].nodeId : entityId;
        if (!safeNodes[nodeId]) return false;
        return Object.values(safeLinks).some(l => {
            if (!l) return false;
            const sp = safePorts[l.sourcePortId];
            const tp = safePorts[l.targetPortId];
            if (!sp || !tp) return false;
            if (sp.nodeId !== nodeId && tp.nodeId !== nodeId) return false;
            return selectedIds.includes(l.id) || selectedIds.includes(sp.id) || selectedIds.includes(tp.id) ||
                   selectedIds.includes(sp.nodeId) || selectedIds.includes(tp.nodeId);
        });
    })();

    if (isExplicitlySelected || isConnectedToSelected) {
        return { visible: true, opacity: 1, interactive: true, role: 'selected-chain', zIndex: 30, isContextNode: false, isParentOfSelected: false };
    }

    // ——— 5. Peek (Alt+hover) ———
    if (peekNodeId) {
        const peekParent = getTrueParent(entityId);
        if (peekParent === peekNodeId) {
            return { visible: true, opacity: 1, interactive: false, role: 'peek', zIndex: 35, isContextNode: false, isParentOfSelected: false };
        }
    }

    // ——— 6. Прямой ребёнок текущего контекста (relDepth === 1) ———
    if (relDepth !== null && relDepth === 1) {
        // Peek: пока peek активен, все дети кроме peek-источника затухают
        if (peekNodeId) {
            if (peekNodeId === entityId) {
                return { visible: true, opacity: 1, interactive: true, role: 'peek-source', zIndex: 12, isContextNode: false, isParentOfSelected: false };
            }
            return { visible: true, opacity: 0.25, interactive: false, role: 'peek-dimmed', zIndex: 10, isContextNode: false, isParentOfSelected: false };
        }

        // Есть ли у этого узла выделенный ребёнок (пульсация)?
        const hasSelectedChild = selectedIds.some(sid => {
            const n = safeNodes[sid];
            if (!n) return false;
            const p = n.parentId || 'root';
            if (safeLayers[p]) return (safeLayers[p].parentId || 'root') === entityId;
            return p === entityId;
        });

        return { visible: true, opacity: 1, interactive: true, role: 'child', zIndex: 10, isContextNode: false, isParentOfSelected: hasSelectedChild };
    }

    // ——— 7. xRayDown: потомки глубже прямых детей ———
    if (relDepth !== null && relDepth > 1 && relDepth <= xRayDown + 1) {
        const opacity = Math.max(0.35, 1 - (relDepth - 1) * 0.2);
        return { visible: true, opacity, interactive: true, role: 'xray-down', zIndex: Math.max(1, 10 - relDepth * 2), isContextNode: false, isParentOfSelected: false };
    }

    // ——— 8. Предок (только при явном xRayUp > 0) ———
    if (relDepth !== null && relDepth < 0) {
        if (xRayUp > 0 && Math.abs(relDepth) <= xRayUp) {
            const opacity = Math.max(0.5, 1 - Math.abs(relDepth) * 0.25);
            return { visible: true, opacity, interactive: true, role: 'xray-up', zIndex: 1, isContextNode: false, isParentOfSelected: false };
        }
        return HIDDEN;
    }

    // ——— 9. Хвост перехода (анимация при смене уровня) ———
    if (transitionCtx) {
        const transRelDepth = HierarchyUtils.getRelativeDepth(entityId, transitionCtx, safeNodes, safeLayers, safePorts, safeLinks);
        if (transRelDepth !== null && transRelDepth === 1) {
            return { visible: true, opacity: 0.5, interactive: false, role: 'transition', zIndex: 2, isContextNode: false, isParentOfSelected: false };
        }
    }

    return HIDDEN;
};

if (typeof window !== 'undefined') window.HierarchyUtils = HierarchyUtils;
if (typeof module !== 'undefined') module.exports = HierarchyUtils;

