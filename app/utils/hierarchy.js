// Иерархия сущностей: абсолютные координаты, статистика вложенности.
// Двойной экспорт: window для браузера, module.exports для node:test.

// Кэш абсолютных позиций, уровней и пространственных индексов на поколение стейта:
// объекты пересоздаются редьюсером при каждом изменении, поэтому WeakMap инвалидируется сам.
const _absCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
const _levelCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
const _portsByNodeCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
const _linksByPortCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
const _linkOrderCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

// Стабильные пустышки. Литерал `layers || {}` создавал НОВЫЙ объект на каждый
// вызов, и кэш уровней, ключом которого служит ссылка на словарь, промахивался
// всегда: поколение пересоздавалось на каждом обращении. По профилю это был
// самый дорогой участок кадра.
const EMPTY_DICT = Object.freeze({});
const _crossLinksCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
const _byLevelCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
const _proxyIndexCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
const _nodesByParentCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
const _layersByParentCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

const HierarchyUtils = {
    /**
     * Быстрый индекс портов по nodeId: O(1) чтение массива портов конкретного узла.
     * Автоматически кэшируется по ссылке на словарь ports (WeakMap).
     */
    getPortsByNodeId: (ports) => {
        if (!ports || typeof ports !== 'object') return {};
        if (_portsByNodeCache && _portsByNodeCache.has(ports)) {
            return _portsByNodeCache.get(ports);
        }
        const index = {};
        Object.values(ports).forEach(p => {
            if (p && p.nodeId) {
                if (!index[p.nodeId]) index[p.nodeId] = [];
                index[p.nodeId].push(p);
            }
        });
        if (_portsByNodeCache) _portsByNodeCache.set(ports, index);
        return index;
    },

    /**
     * Порядковый номер связи в словаре: им разводятся параллельные
     * ортогональные линии. Прежде каждая связь считала его через
     * Object.keys(links).indexOf(id) — O(связи) на связь, то есть O(связи²)
     * на кадр: 450 тысяч операций уже на 700 связях.
     * @param {Object} links
     * @returns {Object<string, number>}
     */
    getLinkOrderIndex: (links) => {
        if (!links || typeof links !== 'object') return {};
        if (_linkOrderCache && _linkOrderCache.has(links)) return _linkOrderCache.get(links);
        const index = {};
        Object.keys(links).forEach((id, i) => { index[id] = i; });
        if (_linkOrderCache) _linkOrderCache.set(links, index);
        return index;
    },

    /**
     * Быстрый индекс связей по portId: O(1) чтение связей (входящих и исходящих) для порта.
     * Автоматически кэшируется по ссылке на словарь links (WeakMap).
     */
    getLinksByPortId: (links) => {
        if (!links || typeof links !== 'object') return {};
        if (_linksByPortCache && _linksByPortCache.has(links)) {
            return _linksByPortCache.get(links);
        }
        const index = {};
        Object.values(links).forEach(l => {
            if (l) {
                if (l.sourcePortId) {
                    if (!index[l.sourcePortId]) index[l.sourcePortId] = [];
                    index[l.sourcePortId].push(l);
                }
                if (l.targetPortId && l.targetPortId !== l.sourcePortId) {
                    if (!index[l.targetPortId]) index[l.targetPortId] = [];
                    index[l.targetPortId].push(l);
                }
            }
        });
        if (_linksByPortCache) _linksByPortCache.set(links, index);
        return index;
    },

    /**
     * Быстрый индекс узлов по parentId (слой или 'root'): O(1) чтение дочерних узлов.
     * Автоматически кэшируется по ссылке на словарь nodes (WeakMap).
     */
    getNodesByParentId: (nodes) => {
        if (!nodes || typeof nodes !== 'object') return {};
        if (_nodesByParentCache && _nodesByParentCache.has(nodes)) {
            return _nodesByParentCache.get(nodes);
        }
        const index = {};
        Object.values(nodes).forEach(n => {
            if (n) {
                const pid = n.parentId || 'root';
                if (!index[pid]) index[pid] = [];
                index[pid].push(n);
            }
        });
        if (_nodesByParentCache) _nodesByParentCache.set(nodes, index);
        return index;
    },

    /**
     * Быстрый индекс слоев по parentId (узел, слой или 'root').
     * Автоматически кэшируется по ссылке на словарь layers (WeakMap).
     */
    getLayersByParentId: (layers) => {
        if (!layers || typeof layers !== 'object') return {};
        if (_layersByParentCache && _layersByParentCache.has(layers)) {
            return _layersByParentCache.get(layers);
        }
        const index = {};
        Object.values(layers).forEach(l => {
            if (l) {
                const pid = l.parentId || 'root';
                if (!index[pid]) index[pid] = [];
                index[pid].push(l);
            }
        });
        if (_layersByParentCache) _layersByParentCache.set(layers, index);
        return index;
    },

    /**
     * Метрики рамки окна уровня — ЕДИНСТВЕННЫЙ источник правды.
     * Читаются и ядром координат, и компонентом LevelWindow: пока значение
     * лежит в одном месте, расчётные точки привязки не могут разойтись с DOM.
     * headerH — высота шапки окна (Tailwind h-10), borderW — толщина рамки
     * контейнера окна (box-sizing: border-box сдвигает содержимое внутрь).
     */
    LEVEL_WINDOW_METRICS: { headerH: 40, borderW: 2 },

    // Шаг сетки перетаскивания узлов/слоёв (см. `snapToGrid` в Node.js/Layer.js,
    // step = 30) — используется расчётом размещения нового независимого слоя,
    // чтобы вычисленный зазор не «съедался» последующим снапом к сетке.
    LAYER_GRID_STEP: 30,

    /**
     * Сырая сумма позиций по всей цепочке parentId, включая узлы-родители.
     * ЛЕГАСИ: используется ТОЛЬКО миграциями (в формате v10 позиция ребёнка
     * задавалась относительно родительского узла). Для рендера и геометрии
     * применяется getLocalPosition — цепочка parentId там не пересекает уровень.
     * @param {string} id
     * @param {Object<string, NodeEntity>} nodes
     * @param {?Object<string, LayerEntity>} layers
     * @returns {Point}
     */
    getRawChainSum: (id, nodes, layers) => {
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
            } else {
                break;
            }
        }
        return { x, y };
    },

    /**
     * Локальная позиция сущности внутри холста своего уровня.
     * Модель v11: parentId — координатный контейнер ('root' или слой) и
     * НИКОГДА не узел, поэтому цепочка не пересекает границу уровня.
     * Защитный break на узле оставлен для данных, не прошедших миграцию.
     * @param {string} id
     * @param {Object<string, NodeEntity>} nodes
     * @param {?Object<string, LayerEntity>} layers
     * @returns {Point}
     */
    getLocalPosition: (id, nodes, layers) => {
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
            if (nodes[parentId]) break; // граница уровня: выше подниматься нельзя
            if (layers && layers[parentId]) {
                current = layers[parentId];
            } else {
                break;
            }
        }

        const result = { x, y };
        if (generation) generation.map.set(id, result);
        return result;
    },

    /**
     * Номер уровня сущности. Выводится, а не хранится: уровень задаётся
     * цепочкой ownerId (семантический владелец на предыдущем уровне), а
     * вложенность в слои уровень не меняет. Так поле levelIndex и фактическое
     * положение сущности не могут разойтись.
     *
     * СВЯЗЬ ЧЕРЕЗ ПОКОЛЕНИЕ (ownerGap): обычно владелец живёт ровно на один
     * уровень выше (gap = 1). После очистки промежуточного уровня ребёнок
     * пере-якоривается на ближайшего живого предка («внук — деду») и запоминает
     * дистанцию в ownerGap: узел на Главном холсте может не иметь ребёнка на
     * уровне 1, но иметь «внука» на уровне 2. Отсутствие поля означает 1 —
     * старые проекты читаются без миграции.
     * @param {string} id
     * @param {Object<string, NodeEntity>} nodes
     * @param {?Object<string, LayerEntity>} layers
     * @returns {number}
     */
    getLevel: (id, nodes, layers = null) => {
        if (!id || id === 'root') return 0;
        const safeNodes = nodes || EMPTY_DICT;
        const safeLayers = layers || EMPTY_DICT;

        let generation = _levelCache && _levelCache.get(safeNodes);
        if (generation && generation.layersRef === safeLayers) {
            const hit = generation.map.get(id);
            if (hit !== undefined) return hit;
        } else if (_levelCache && nodes && typeof nodes === 'object') {
            generation = { layersRef: safeLayers, map: new Map() };
            _levelCache.set(safeNodes, generation);
        }

        let level = 0;
        let current = safeNodes[id] || safeLayers[id];
        const visited = new Set();

        while (current && !visited.has(current.id)) {
            visited.add(current.id);
            const parentId = current.parentId;

            // Внутри слоя уровень наследуется от координатного контейнера
            if (parentId && parentId !== 'root' && safeLayers[parentId]) {
                current = safeLayers[parentId];
                continue;
            }

            // ЛЕГАСИ до миграции: parentId указывает на узел другого уровня
            if (parentId && parentId !== 'root' && safeNodes[parentId] && !current.ownerId) {
                level++;
                current = safeNodes[parentId];
                continue;
            }

            const ownerId = current.ownerId;
            if (!ownerId) {
                // ЯКОРЬ НЕЗАВИСИМОЙ ВЕТКИ: сирота (без владельца) может нести
                // homeLevel — «домашний уровень». Вся его ветка живёт от этого
                // якоря: сам сирота на homeLevel, дети на homeLevel+1 и глубже.
                // Поля нет (старые проекты) — 0, прежнее поведение.
                const res = level + (current.homeLevel || 0);
                if (generation) generation.map.set(id, res);
                return res;
            }
            const owner = safeNodes[ownerId] || safeLayers[ownerId];
            if (!owner) {
                const res = level + (current.homeLevel || 0);
                if (generation) generation.map.set(id, res);
                return res;
            }
            level += HierarchyUtils.getOwnerGap(current);
            current = owner;
        }

        if (generation) generation.map.set(id, level);
        return level;
    },

    /**
     * Дистанция поколений до владельца: на сколько уровней ниже владельца
     * живёт сущность. 1 — обычное родство «родитель — ребёнок»; больше 1 —
     * связь через поколение (владелец — дед, прадед и т.д. после очистки
     * промежуточных уровней). Значения вне диапазона схлопываются в 1.
     * @param {{ownerGap?: number}} entity
     * @returns {number}
     */
    getOwnerGap: (entity) => {
        const g = entity && entity.ownerGap;
        return (typeof g === 'number' && isFinite(g) && g > 1) ? Math.floor(g) : 1;
    },

    /**
     * Локальная позиция сущности внутри окна ее уровня (с учетом вложенности в слои).
     * @param {string} id
     * @param {Object<string, NodeEntity>} nodes
     * @param {?Object<string, LayerEntity>} layers
     * @returns {Point}
     */
    // getLevelLocalPosition удалён: остался единственный getLocalPosition.
    // Две похоже названные функции координат — та самая причина разъезжавшихся связей.

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
        const parentAbs = HierarchyUtils.getLocalPosition(newParentId, nodes, layers);
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
    isDescendantOf: (candidateId, ancestorId, nodes, layers) => {
        if (candidateId === ancestorId) return true;
        let current = (nodes && nodes[candidateId]) || (layers && layers[candidateId]);
        const visited = new Set();
        while (current && !visited.has(current.id)) {
            visited.add(current.id);
            if (current.parentId === ancestorId) return true;
            current = (nodes && nodes[current.parentId]) || (layers && layers[current.parentId]) || null;
        }
        return false;
    },

    // Прямые дети узла/контекста: узлы, слои и связи, у которых оба конца внутри
    getChildrenStats: (nodes, layers, ports, links, parentId) => {
        let nodeCount = 0;
        let layerCount = 0;
        const childNodeIds = new Set();

        // Родство считается по ownerId (узел-владелец на предыдущем уровне),
        // а для слоя-контейнера — по parentId. Иначе бейдж папки молча покажет 0.
        const isChild = (e) => e && (e.ownerId === parentId || (!e.ownerId && e.parentId === parentId));

        Object.values(nodes || {}).forEach(n => {
            if (isChild(n)) {
                nodeCount++;
                childNodeIds.add(n.id);
            }
        });

        Object.values(layers || {}).forEach(l => {
            if (isChild(l)) layerCount++;
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
    },

    /**
     * Точный уровень глубины узла или слоя (0 для root, 1 для детей root, 2 для внуков и т.д.)
     * @param {string} id
     * @param {Object<string, NodeEntity>} nodes
     * @param {?Object<string, LayerEntity>} [layers]
     * @returns {number}
     */
    getEntityLevel: (id, nodes, layers = null) => HierarchyUtils.getLevel(id, nodes, layers),

    /**
     * Максимальный уровень глубины сущностей в текущем проекте.
     * @param {Object<string, NodeEntity>} nodes
     * @param {?Object<string, LayerEntity>} [layers]
     * @returns {number}
     */
    getMaxProjectLevel: (nodes, layers = null) => {
        let maxLvl = 0;
        Object.keys(nodes || {}).forEach(id => {
            const lvl = HierarchyUtils.getEntityLevel(id, nodes, layers);
            if (lvl > maxLvl) maxLvl = lvl;
        });
        return maxLvl;
    },

    /**
     * Нормализация значения фокуса ветки: исторически levelFocusParentId
     * хранил одиночный id (строку), теперь — массив id (мульти-выделение).
     * @param {string|Array<string>|null|undefined} value
     * @returns {Array<string>}
     */
    toFocusList: (value) => {
        if (Array.isArray(value)) return value.filter(Boolean);
        return value ? [value] : [];
    },

    /**
     * Владелец ветки сущности на её уровне: собственный ownerId, либо владелец
     * содержащего слоя (вложенность в слои не меняет ветку), либо легаси-родитель.
     * @param {string} id
     * @param {Object<string, NodeEntity>} nodes
     * @param {?Object<string, LayerEntity>} [layers]
     * @returns {?string}
     */
    getBranchOwner: (id, nodes, layers = null) => {
        const safeNodes = nodes || {};
        const safeLayers = layers || {};
        let current = safeNodes[id] || safeLayers[id];
        const visited = new Set();
        while (current && !visited.has(current.id)) {
            visited.add(current.id);
            if (current.ownerId) return current.ownerId;
            const pid = current.parentId;
            if (pid && pid !== 'root' && safeLayers[pid]) { current = safeLayers[pid]; continue; }
            if (pid && pid !== 'root' && safeNodes[pid]) return pid; // легаси parentId-родство
            return null;
        }
        return null;
    },

    /**
     * Проходит ли цепочка предков сущности (владельцы + содержащие слои)
     * через хотя бы один id из набора.
     * @param {string} id
     * @param {Array<string>} ancestorIds
     * @param {Object<string, NodeEntity>} nodes
     * @param {?Object<string, LayerEntity>} [layers]
     * @returns {boolean}
     */
    hasAncestorIn: (id, ancestorIds, nodes, layers = null) => {
        const set = HierarchyUtils.toFocusList(ancestorIds);
        if (set.length === 0) return false;
        const safeNodes = nodes || {};
        const safeLayers = layers || {};
        let current = safeNodes[id] || safeLayers[id];
        const visited = new Set();
        while (current && !visited.has(current.id)) {
            visited.add(current.id);
            const pid = current.parentId;
            let nextId = null;
            if (pid && pid !== 'root' && safeLayers[pid]) nextId = pid;                    // слой-контейнер
            else if (pid && pid !== 'root' && safeNodes[pid] && !current.ownerId) nextId = pid; // легаси
            else if (current.ownerId) nextId = current.ownerId;
            if (!nextId) return false;
            if (set.includes(nextId)) return true;
            current = safeNodes[nextId] || safeLayers[nextId];
        }
        return false;
    },

    /**
     * Проходит ли цепочка КООРДИНАТНЫХ КОНТЕЙНЕРОВ сущности (только `parentId`,
     * через слои) через хотя бы один id из набора. В отличие от `hasAncestorIn`,
     * НЕ поднимается по `ownerId` — межуровневое родство (владение) для этой
     * проверки не считается «содержанием» (Plan_fix.md: баг — при перетаскивании
     * узла его ownerId-потомок на другом уровне ошибочно материализовался в
     * нескливаемом drag-оверлее `Canvas.js`, потому что `hasAncestorIn` посчитал
     * его «предком через `ancestorIds`» и по ownerId-цепочке тоже).
     * Использовать там, где важно только фактическое визуальное вложение через
     * `parentId` (drag-оверлей, «не двигать дважды» при групповом перетаскивании) —
     * НЕ для фильтрации «только верхних» при массовом переносе/выделении, где
     * ownerId-родство обязано учитываться (там по-прежнему `hasAncestorIn`).
     * @param {string} id
     * @param {string|Array<string>} containerIds
     * @param {Object<string, NodeEntity>} nodes
     * @param {?Object<string, LayerEntity>} [layers]
     * @returns {boolean}
     */
    hasContainerAncestorIn: (id, containerIds, nodes, layers = null) => {
        const set = HierarchyUtils.toFocusList(containerIds);
        if (set.length === 0) return false;
        const safeNodes = nodes || {};
        const safeLayers = layers || {};
        let current = safeNodes[id] || safeLayers[id];
        const visited = new Set();
        while (current && current.parentId && current.parentId !== 'root' && !visited.has(current.parentId)) {
            if (set.includes(current.parentId)) return true;
            visited.add(current.parentId);
            // safeNodes тоже проверяем: легаси-проекты (миграция v9→v10, до появления
            // ownerId) могут иметь parentId, указывающий на узел, а не только на слой.
            current = safeNodes[current.parentId] || safeLayers[current.parentId] || null;
        }
        return false;
    },

    /**
     * Можно ли перенести узел ИЛИ слой в этот слой (для UI и валидации).
     *
     * Перенос невозможен, когда целевой слой находится в ветке САМОЙ переносимой
     * сущности (или её потомка): усыновителем стала бы сама сущность — «стань
     * собственным ребёнком», а уровень слоя, вычисляемый через неё, уехал бы
     * по кругу. Консистентной автоматической интерпретации у такой операции нет —
     * UI должен показывать причину, а не молча отклонять.
     *
     * @param {string} entityId id переносимого узла или слоя
     * @param {string} layerId
     * @param {Object<string, NodeEntity>} nodes
     * @param {?Object<string, LayerEntity>} [layers]
     * @returns {{ ok: boolean, reason: ?string }}
     */
    canTransferToLayer: (entityId, layerId, nodes, layers = null) => {
        const layer = layers && layers[layerId];
        const entity = (nodes && nodes[entityId]) || (layers && layers[entityId]);
        if (!layer || !entity) return { ok: false, reason: 'not-found' };
        // Слой/узел нельзя перенести в самого себя.
        if (entityId === layerId) return { ok: false, reason: 'self' };

        const layerLevel = HierarchyUtils.getEntityLevel(layerId, nodes, layers);
        const entityLevel = HierarchyUtils.getEntityLevel(entityId, nodes, layers);
        if (layerLevel === entityLevel) return { ok: true, reason: null }; // группировка своего уровня

        if (layerLevel > 0) {
            const adoptOwner = HierarchyUtils.getBranchOwner(layerId, nodes, layers);
            if (adoptOwner && (adoptOwner === entityId ||
                HierarchyUtils.hasAncestorIn(adoptOwner, [entityId], nodes, layers))) {
                // Слой в СОБСТВЕННОЙ ветке узла/слоя: обычное усыновление невозможно
                // (сущность стала бы своим же потомком), выполняется «спуск» — она
                // становится сиротой в слое, её прямые подопечные отвязываются
                // и якорятся по месту (homeLevel), их поддеревья не меняются.
                return { ok: true, reason: 'descend' };
            }
        }
        return { ok: true, reason: null };
    },

    /**
     * Контекст создания нового узла/слоя кнопкой «+» панели инструментов.
     *
     * Возвращает { ok, parentId, levelIndex, reason }:
     *   ok:false, reason:'multi-select'      — выделено несколько узлов/слоёв,
     *                                          цель неоднозначна, кнопки недоступны;
     *   ok:false, reason:'ambiguous-branch'  — выделения нет, а фокус-набор уровня
     *                                          содержит несколько владельцев (видно
     *                                          несколько веток) — нужно выделить узел;
     *   ok:true                              — parentId/levelIndex определены:
     *     • выделен один узел  → его БРАТ (владелец — ownerId узла);
     *     • выделен один слой  → внутрь слоя;
     *     • выделено окно / активен уровень → единственный фокус-владелец ветки,
     *       иначе первый родитель уровнем выше, иначе root.
     *
     * @param {Object} state
     * @returns {{ ok: boolean, parentId: ?string, levelIndex: ?number, reason: ?string }}
     */
    getAddContext: (state) => {
        const nodes = (state && state.nodes) || {};
        const layers = (state && state.layers) || {};
        const selectedIds = (state && state.selectedIds) || [];

        // Массовое выделение сущностей — цель неоднозначна
        const selEntities = selectedIds.filter(id => nodes[id] || layers[id]);
        if (selEntities.length > 1) {
            return { ok: false, parentId: null, levelIndex: null, reason: 'multi-select' };
        }

        const focusOwners = (levelIndex) => HierarchyUtils
            .toFocusList(state.levelFocusParentId && state.levelFocusParentId[levelIndex])
            .filter(fid => nodes[fid]);

        const byLevelContext = (levelIndex) => {
            if (levelIndex === 0) return { ok: true, parentId: 'root', levelIndex: 0, reason: null };
            const owners = focusOwners(levelIndex);
            if (owners.length === 1) return { ok: true, parentId: owners[0], levelIndex, reason: null };
            if (owners.length > 1) return { ok: false, parentId: null, levelIndex, reason: 'ambiguous-branch' };
            // Фокусной ветки нет: создаётся ЧЕСТНЫЙ СИРОТА-ЯКОРЬ на этом уровне
            // (homeLevel), а не тайное усыновление случайным узлом уровня выше.
            // Такой узел — глава независимой ветки: его дети лягут на уровень ниже.
            return { ok: true, parentId: 'root', levelIndex, reason: null, anchorLevel: levelIndex };
        };

        const selectedId = selectedIds[0];

        // 1. Выделено окно уровня (level-window-K)
        if (selectedId && typeof selectedId === 'string' && selectedId.startsWith('level-window-')) {
            const levelIndex = parseInt(selectedId.replace('level-window-', ''), 10);
            if (Number.isNaN(levelIndex)) return { ok: true, parentId: 'root', levelIndex: 0, reason: null };
            return byLevelContext(levelIndex);
        }

        // 2. Выделен один слой — новый элемент внутрь слоя
        if (selEntities.length === 1 && layers[selEntities[0]]) {
            const layer = layers[selEntities[0]];
            return {
                ok: true,
                parentId: layer.id,
                levelIndex: HierarchyUtils.getEntityLevel(layer.id, nodes, layers),
                reason: null
            };
        }

        // 3. Выделен один узел — новый элемент становится его БРАТОМ
        //    (v11: parentId узла — координатный контейнер, родство в ownerId).
        //    Если узел связан с владельцем через поколение (ownerGap > 1),
        //    брат наследует ту же дистанцию — иначе он «всплыл» бы на уровень выше.
        if (selEntities.length === 1 && nodes[selEntities[0]]) {
            const node = nodes[selEntities[0]];
            const lvl = HierarchyUtils.getEntityLevel(node.id, nodes, layers);
            const brotherParent = node.ownerId
                || (node.parentId && node.parentId !== 'root' ? node.parentId : 'root');
            const gap = node.ownerId ? HierarchyUtils.getOwnerGap(node) : 1;
            return {
                ok: true,
                parentId: brotherParent,
                levelIndex: lvl,
                reason: null,
                ...(gap > 1 ? { ownerGap: gap } : {})
            };
        }

        // 4. Нет выделения — активный уровень (последний клик в окно)
        return byLevelContext((state && state.activeLevelIndex) || 0);
    },

    /**
     * Видимость сущности с учётом изоляции веток («глаз»).
     *
     * ПРИОРИТЕТ: глаз Главного холста (уровень 0) — глобальный. Пока он включён
     * и есть фокус-корни, он ИГНОРИРУЕТ локальные настройки уровней: на всех
     * уровнях видны только сами фокус-корни и их потомки (вся ветка вглубь).
     * Когда глобальный глаз выключен, каждый уровень применяет свой локальный
     * глаз: видны только сущности, чей владелец ветки входит в фокус-набор
     * уровня. Пустой фокус-набор при включённом глазе показывает всё
     * (глаз «ждёт» первого выделения).
     *
     * @param {string} id
     * @param {Object} state
     * @returns {boolean}
     */
    isEntityVisible: (id, state) => {
        if (!state) return true;
        const nodes = state.nodes || {};
        const layers = state.layers || {};
        if (!nodes[id] && !layers[id]) return false;
        const hide = state.levelHideNeighbors || {};
        const focus = state.levelFocusParentId || {};

        // 1. Глобальный глаз Главного холста
        if (hide[0]) {
            const roots = HierarchyUtils.toFocusList(focus[0]).filter(fid => nodes[fid] || layers[fid]);
            if (roots.length > 0) {
                if (roots.includes(id)) return true;
                return HierarchyUtils.hasAncestorIn(id, roots, nodes, layers);
            }
        }

        // 2. Локальный глаз уровня сущности (на уровне 0 локальной изоляции нет)
        const lvl = HierarchyUtils.getEntityLevel(id, nodes, layers);
        if (lvl === 0) return true;
        if (!hide[lvl]) return true;
        const owners = HierarchyUtils.toFocusList(focus[lvl]).filter(fid => nodes[fid] || layers[fid]);
        if (owners.length === 0) return true;
        if (owners.includes(id)) return true; // сам фокус-владелец (если он на этом уровне)
        const branchOwner = HierarchyUtils.getBranchOwner(id, nodes, layers);
        return branchOwner !== null && owners.includes(branchOwner);
    },

    /**
     * Получить информацию о межуровневых связях для конкретного порта.
     * @param {string} portId
     * @param {Object} ports
     * @param {Object} links
     * @param {Object} nodes
     * @param {Object} [layers]
     * @returns {{ isCrossLevel: boolean, maxConnectedLevel: number, targetLevels: number[], connectionCount: number }}
     */
    getCrossLevelPortInfo: (portId, ports, links, nodes, layers = null) => {
        const port = ports && ports[portId];
        if (!port || !port.nodeId) return { isCrossLevel: false, maxConnectedLevel: 0, targetLevels: [], connectionCount: 0 };
        
        const myLevel = HierarchyUtils.getEntityLevel(port.nodeId, nodes, layers);
        // Перебираем ТОЛЬКО связи этого порта. Прежний полный проход по всем
        // связям проекта вызывался для каждого порта на каждый кадр и давал
        // O(порты × связи): на сцене в 2000 узлов это 2.3 секунды на кадр.
        // Индекс кэшируется по ссылке на словарь links, то есть строится один
        // раз на поколение состояния.
        const linkList = Array.isArray(links)
            ? links.filter(l => l && (l.sourcePortId === portId || l.targetPortId === portId))
            : (HierarchyUtils.getLinksByPortId(links)[portId] || []);

        const targetLevels = [];
        let maxConnectedLevel = 0;
        let isCrossLevel = false;

        linkList.forEach(l => {
            if (!l) return;
            let otherPortId = null;
            if (l.sourcePortId === portId) otherPortId = l.targetPortId;
            else if (l.targetPortId === portId) otherPortId = l.sourcePortId;

            if (otherPortId && ports[otherPortId]) {
                const otherNodeId = ports[otherPortId].nodeId;
                const otherLevel = HierarchyUtils.getEntityLevel(otherNodeId, nodes, layers);
                if (otherLevel !== myLevel) {
                    isCrossLevel = true;
                    targetLevels.push(otherLevel);
                    if (otherLevel > maxConnectedLevel) maxConnectedLevel = otherLevel;
                }
            }
        });

        return {
            isCrossLevel,
            maxConnectedLevel,
            targetLevels,
            connectionCount: targetLevels.length
        };
    },

    /**
     * Расчет бесконфликтных стартовых координат для создания нового узла на уровне.
     * @param {string} parentId
     * @param {Object<string, NodeEntity>} levelNodes
     * @returns {{ x: number, y: number }}
     */
    getSmartLevelPlacement: (parentId, levelNodes = {}) => {
        const nodesList = Object.values(levelNodes || {}).filter(Boolean);
        if (nodesList.length === 0) {
            return { x: 80, y: 100 };
        }

        // Соседи по владельцу: в модели v11 родство выражается ownerId,
        // а parentId у узла на холсте уровня всегда равен root.
        const siblings = nodesList.filter(n => (n.ownerId || n.parentId) === parentId);
        if (siblings.length > 0) {
            const lastSib = siblings[siblings.length - 1];
            return {
                x: (lastSib.position?.x || 80) + (lastSib.size?.w || 220) + 40,
                y: lastSib.position?.y || 100
            };
        }

        // Иначе ищем самый правый узел среди всех узлов уровня и сдвигаем правее
        let maxX = -Infinity;
        let bestY = 100;
        nodesList.forEach(n => {
            const right = (n.position?.x || 0) + (n.size?.w || 220);
            if (right > maxX) {
                maxX = right;
                bestY = n.position?.y || 100;
            }
        });

        return {
            x: Math.max(80, maxX + 80),
            y: bestY
        };
    },

    /**
     * Расчет бесконфликтных координат для НЕЗАВИСИМОГО слоя на холсте уровня
     * (кнопка «независимый слой»: без выделения — parentId:'root'). Новый слой
     * ставится строго ниже уже существующих слоёв СВОЕГО уровня и своего же
     * координатного контейнера root (вложенные слои в расчёт не берутся —
     * PLAN_LAYERS_AND_CONTEXT_CREATION.md, п.1), с отступом коллизии (шаг сетки,
     * см. `LAYER_GRID_STEP`), чтобы `resolveLayerCollision` не сдвинул его
     * повторно сразу после создания.
     * @param {number} levelIndex
     * @param {Object} state
     * @returns {{ x: number, y: number }}
     */
    getSmartLayerPlacement: (levelIndex, state) => {
        const nodes = (state && state.nodes) || {};
        const layers = (state && state.layers) || {};
        const step = HierarchyUtils.LAYER_GRID_STEP || 30;
        const rootLayers = Object.values(layers).filter(l => l
            && (l.parentId || 'root') === 'root'
            && HierarchyUtils.getEntityLevel(l.id, nodes, layers) === levelIndex);

        if (rootLayers.length === 0) {
            return { x: 40, y: 60 };
        }

        let maxY = -Infinity;
        rootLayers.forEach(l => {
            const bottom = (l.position?.y || 0) + (l.size?.h || 400);
            if (bottom > maxY) maxY = bottom;
        });

        const rawY = maxY + 10;
        // Округление ВВЕРХ до ближайшего шага сетки: ADD_LAYER всегда снапает
        // (snapToGrid:true) — без округления снап после вычисления может
        // свести зазор к нулю и тут же спровоцировать resolveLayerCollision.
        const snappedY = Math.ceil(rawY / step) * step;
        return { x: 40, y: Math.max(snappedY, rawY) };
    },

    /**
     * Каскадное обновление размеров цепочки родительских слоёв «снизу вверх»:
     * когда сущность (узел или слой) оказывается внутри слоя-контейнера (после
     * вложения/переноса), родитель должен подрасти, чтобы вместить её по
     * bounding-box содержимого (узлы И вложенные слои), и так же — его
     * собственный родитель, и так далее до корня.
     *
     * Чистая функция: возвращает словарь ОБНОВЛЕНИЙ размеров `{ [layerId]: {w,h} }`
     * — вызывающий код (редьюсер) сам применяет их к `state.layers`, чтобы весь
     * жест остался одной записью истории.
     *
     * @param {string} movedEntityId id сущности, которая только что оказалась
     *   внутри нового родителя (её parentId уже обновлён к моменту вызова)
     * @param {Object} state
     * @returns {Object<string, {w:number,h:number}>}
     */
    bubbleUpLayerResize: (movedEntityId, state) => {
        const nodes = (state && state.nodes) || {};
        const layers = (state && state.layers) || {};
        const updates = {};
        // Локальная проекция слоёв с уже применёнными по ходу апдейтами —
        // цепочка бабблинга должна видеть подросшего непосредственного ребёнка.
        const applied = { ...layers };
        const padding = 20;

        let currentId = movedEntityId;
        const visited = new Set();
        for (let i = 0; i < 64; i++) {
            const child = applied[currentId] || nodes[currentId];
            if (!child || visited.has(currentId)) break;
            visited.add(currentId);

            const parentId = child.parentId;
            if (!parentId || parentId === 'root') break;
            const parentLayer = applied[parentId];
            if (!parentLayer) break;

            let maxR = 0, maxB = 0, any = false;
            Object.values(nodes).forEach(n => {
                if (n && n.parentId === parentId) {
                    any = true;
                    maxR = Math.max(maxR, (n.position?.x || 0) + (n.size?.w || 200));
                    maxB = Math.max(maxB, (n.position?.y || 0) + (n.size?.h || 100));
                }
            });
            Object.values(applied).forEach(l => {
                if (l && l.id !== parentId && l.parentId === parentId) {
                    any = true;
                    maxR = Math.max(maxR, (l.position?.x || 0) + (l.size?.w || 600));
                    maxB = Math.max(maxB, (l.position?.y || 0) + (l.size?.h || 400));
                }
            });
            if (!any) break;

            const headerH = Math.max(90, (parentLayer.fontSize ? Math.round(parentLayer.fontSize * 2.5 + 45) : 90));
            const curW = parentLayer.size?.w || 600;
            const curH = parentLayer.size?.h || 400;
            const fitW = Math.max(300, maxR + padding);
            const fitH = Math.max(headerH + 100, maxB + padding);
            const newW = Math.max(curW, fitW);
            const newH = Math.max(curH, fitH);

            if (newW !== curW || newH !== curH) {
                const size = { w: newW, h: newH };
                updates[parentId] = size;
                applied[parentId] = { ...parentLayer, size };
            }
            currentId = parentId;
        }

        return updates;
    },

    /**
     * Расчет расположения нового окна уровня в мировом пространстве.
     * @param {number} levelIndex
     * @param {Object<number, LevelWindowEntity>} existingLevelWindows
     * @returns {{ position: { x: number, y: number }, size: { w: number, h: number } }}
     */
    getSmartWindowPlacement: (levelIndex, existingLevelWindows = {}) => {
        const prevWin = existingLevelWindows[levelIndex - 1];
        if (prevWin && prevWin.position && prevWin.size) {
            return {
                position: {
                    x: prevWin.position.x,
                    y: prevWin.position.y + prevWin.size.h + 100
                },
                size: {
                    w: prevWin.size.w || 900,
                    h: prevWin.size.h || 600
                }
            };
        }
        return {
            position: { x: -450, y: -300 + levelIndex * 700 },
            size: { w: 900, h: 600 }
        };
    },

    /**
     * Окно, обслуживающее указанный уровень. Ключ словаря — стабильный id окна,
     * номер уровня хранится в поле levelIndex, поэтому перенумерация уровней
     * не переписывает ключи и не рвёт выделение, историю и ссылки на порты.
     * @param {number} levelIndex
     * @param {Object<string, LevelWindowEntity>} levelWindows
     * @returns {?LevelWindowEntity}
     */
    getWindowOfLevel: (levelIndex, levelWindows) => {
        if (!levelWindows) return null;
        const found = Object.values(levelWindows).find(w => w && w.levelIndex === levelIndex);
        if (found) return found;
        // ЛЕГАСИ: словарь ещё ключуется номером уровня
        return levelWindows[levelIndex] || null;
    },

    /**
     * Камера окна (панорама, зум, свёрнутость). Живёт в state.levelViews вне
     * снапшотов истории — как state.canvas, чтобы Undo не дёргал точку обзора.
     * @param {string} windowId
     * @param {Object} state
     * @returns {{ innerOffset: Point, innerZoom: number, isCollapsed: boolean }}
     */
    getLevelView: (windowId, state) => {
        const fallback = { innerOffset: { x: 0, y: 0 }, innerZoom: 1, isCollapsed: false };
        if (!windowId || !state) return fallback;
        const view = state.levelViews && state.levelViews[windowId];
        if (view) {
            return {
                innerOffset: view.innerOffset || { x: 0, y: 0 },
                innerZoom: view.innerZoom || 1,
                isCollapsed: !!view.isCollapsed
            };
        }
        // ЛЕГАСИ: камера ещё лежит внутри записи окна
        const win = state.levelWindows && state.levelWindows[windowId];
        if (win) {
            return {
                innerOffset: win.innerOffset || { x: 0, y: 0 },
                innerZoom: win.innerZoom || 1,
                isCollapsed: !!win.isCollapsed
            };
        }
        return fallback;
    },

    /**
     * ЕДИНСТВЕННОЕ координатное ядро: мировая позиция и масштаб сущности.
     * Порядок слагаемых буквально повторяет DOM окна уровня:
     *   рамка (border-box) -> шапка -> transform: translate(innerOffset) scale(innerZoom)
     * Любое расхождение здесь мгновенно разъезжается в концах связей.
     * @param {string} id
     * @param {Object} state
     * @returns {{ x: number, y: number, scale: number }}
     */
    getWorldTransform: (id, state) => {
        if (!id || !state) return { x: 0, y: 0, scale: 1.0 };
        const nodes = state.nodes || {};
        const layers = state.layers || {};

        const local = HierarchyUtils.getLocalPosition(id, nodes, layers);
        const level = HierarchyUtils.getLevel(id, nodes, layers);
        const win = HierarchyUtils.getWindowOfLevel(level, state.levelWindows);

        if (!win) return { x: local.x, y: local.y, scale: 1.0 };

        const view = HierarchyUtils.getLevelView(win.id != null ? win.id : String(level), state);
        const { headerH, borderW } = HierarchyUtils.LEVEL_WINDOW_METRICS;
        const winX = win.position?.x || 0;
        const winY = win.position?.y || 0;

        return {
            x: winX + borderW + view.innerOffset.x + local.x * view.innerZoom,
            y: winY + borderW + headerH + view.innerOffset.y + local.y * view.innerZoom,
            scale: view.innerZoom
        };
    },

    /**
     * Мировые габариты узла с учётом внутреннего масштаба его окна.
     * @param {string} nodeId
     * @param {Object} state
     * @returns {?{ x: number, y: number, w: number, h: number }}
     */
    getNodeWorldBounds: (nodeId, state) => {
        if (!state || !state.nodes || !state.nodes[nodeId]) return null;
        const node = state.nodes[nodeId];
        const t = HierarchyUtils.getWorldTransform(nodeId, state);
        return {
            x: t.x,
            y: t.y,
            w: (node.size?.w || 200) * t.scale,
            h: (node.size?.h || 100) * t.scale
        };
    },

    /**
     * Мировые габариты слоя (аналог getNodeWorldBounds для слоёв).
     * @param {string} layerId
     * @param {Object} state
     * @returns {?{ x: number, y: number, w: number, h: number }}
     */
    getLayerWorldBounds: (layerId, state) => {
        if (!state || !state.layers || !state.layers[layerId]) return null;
        const layer = state.layers[layerId];
        const t = HierarchyUtils.getWorldTransform(layerId, state);
        return {
            x: t.x,
            y: t.y,
            w: (layer.size?.w || 600) * t.scale,
            h: (layer.size?.h || 400) * t.scale
        };
    },

    /**
     * Мировые габариты узла ИЛИ слоя.
     * @param {string} id
     * @param {Object} state
     * @returns {?{ x: number, y: number, w: number, h: number }}
     */
    getEntityWorldBounds: (id, state) => {
        if (state && state.nodes && state.nodes[id]) return HierarchyUtils.getNodeWorldBounds(id, state);
        if (state && state.layers && state.layers[id]) return HierarchyUtils.getLayerWorldBounds(id, state);
        return null;
    },

    /**
     * РЕЗОЛВЕР ЦЕЛИ Drag&Drop: что под перетаскиваемыми элементами и валидна ли цель.
     *
     * Правила (см. PLAN_DRAG_AND_DROP.md):
     * - узлы и слои-приёмники срабатывают при ПЕРЕСЕЧЕНИИ КОНТУРОВ с перетаскиваемым
     *   элементом; окно уровня — при попадании УКАЗАТЕЛЯ внутрь его рамки;
     * - приоритет: узел → слой → окно; из двух узлов-приёмников берётся тот, что под
     *   указателем, иначе с наибольшей площадью пересечения;
     * - сами перетаскиваемые элементы и все их потомки исключаются (защита от циклов);
     * - свёрнутые окна не принимают дроп;
     * - dragDropMode=false: доступна только группировка в слои СВОЕГО уровня и
     *   перемещение по своему окну; всё межуровневое и вложения — invalid ('dnd-off');
     * - слои в роли переносимых, ОДИНОЧНО (этап 3 плана `PLAN_DRAG_AND_DROP.md`,
     *   реализовано 2026-08-30 вместе с `PLAN_LAYERS_AND_CONTEXT_CREATION.md`):
     *   валидируются ТЕМ ЖЕ путём, что и узлы (`canTransferToLayer`/`hasAncestorIn`,
     *   расширенные на слои) — узел/слой/окно как цель, свой уровень = группировка
     *   (`parentId`), чужой = усыновление (`ownerId`) или сирота-якорь на чужом окне;
     * - массовый/смешанный перенос слоя(ёв) вместе с чем-то ещё (`dragged.length > 1`
     *   и хотя бы один — слой) — всё ещё invalid ('layer-transfer-later'): это
     *   этап 4 плана (пока не реализован).
     *
     * @param {Array<string>} draggedIds выделенные «верхние» переносимые id
     * @param {Point} pointerWorld указатель мыши в мировых координатах
     * @param {Object} state
     * @param {{dragDropMode?: boolean}} [opts]
     * @returns {?{ kind: 'node'|'layer'|'window', id: string, valid: boolean, reason: ?string, isMove?: boolean, descend?: boolean }}
     */
    getDropTarget: (draggedIds, pointerWorld, state, opts = {}) => {
        if (!state || !draggedIds || draggedIds.length === 0 || !pointerWorld) return null;
        const dragDropMode = opts.dragDropMode !== false;
        const nodes = state.nodes || {};
        const layers = state.layers || {};

        const dragged = draggedIds.filter(id => nodes[id] || layers[id]);
        if (dragged.length === 0) return null;
        // Массовый/смешанный перенос слоя(ёв) вместе с чем-то ещё — этап 4
        // PLAN_DRAG_AND_DROP.md, вне объёма (реализован только перенос ОДНОГО
        // «верхнего» слоя — PLAN_LAYERS_AND_CONTEXT_CREATION.md, 2026-08-30).
        const unsupportedMixedLayer = dragged.length > 1 && dragged.some(id => !!layers[id]);
        const draggedLevels = dragged.map(id => HierarchyUtils.getEntityLevel(id, nodes, layers));

        // Исключаются сами переносимые и их потомки: по владению/слоям
        // (hasAncestorIn) и по координатным контейнерам (isDescendantOf)
        const isExcluded = (id) => dragged.includes(id)
            || HierarchyUtils.hasAncestorIn(id, dragged, nodes, layers)
            || dragged.some(d => HierarchyUtils.isDescendantOf(id, d, nodes, layers));

        const dragRects = dragged.map(id => HierarchyUtils.getEntityWorldBounds(id, state)).filter(Boolean);
        if (dragRects.length === 0) return null;

        const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
            * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        const containsPt = (b) => pointerWorld.x >= b.x && pointerWorld.x <= b.x + b.w
            && pointerWorld.y >= b.y && pointerWorld.y <= b.y + b.h;

        // Лучший кандидат словаря: контур пересекается с любым переносимым;
        // предпочтение — под указателем, затем наибольшее суммарное пересечение
        const pickBest = (dict) => {
            let best = null, bestPt = false, bestArea = 0;
            Object.keys(dict).forEach(id => {
                if (!dict[id] || isExcluded(id)) return;
                const b = HierarchyUtils.getEntityWorldBounds(id, state);
                if (!b) return;
                let area = 0;
                dragRects.forEach(r => { if (intersects(r, b)) area += overlap(r, b); });
                if (area <= 0) return;
                const pt = containsPt(b);
                if (!best || (pt && !bestPt) || (pt === bestPt && area > bestArea)) {
                    best = id; bestPt = pt; bestArea = area;
                }
            });
            return best;
        };

        // 1. Узел-приёмник (вложение: переносимые станут его детьми)
        const nodeTarget = pickBest(nodes);
        if (nodeTarget) {
            const make = (valid, reason) => ({ kind: /** @type {'node'} */ ('node'), id: nodeTarget, valid, reason: reason || null });
            if (unsupportedMixedLayer) return make(false, 'layer-transfer-later');
            if (!dragDropMode) return make(false, 'dnd-off');
            // Все переносимые уже прямые дети этой цели — переносить нечего
            const allChildren = dragged.every(id => (nodes[id] || layers[id]).ownerId === nodeTarget
                && HierarchyUtils.getOwnerGap(nodes[id] || layers[id]) === 1);
            if (allChildren) return make(false, 'same-parent');
            return make(true, null);
        }

        // 2. Слой-приёмник
        const layerTarget = pickBest(layers);
        if (layerTarget) {
            const make = (valid, reason, descend) => ({ kind: /** @type {'layer'} */ ('layer'), id: layerTarget, valid, reason: reason || null, descend: !!descend });
            if (unsupportedMixedLayer) return make(false, 'layer-transfer-later');
            const layerLevel = HierarchyUtils.getEntityLevel(layerTarget, nodes, layers);
            const crossLevel = draggedLevels.some(lvl => lvl !== layerLevel);
            if (!dragDropMode && crossLevel) return make(false, 'dnd-off');
            if (dragged.every(id => (nodes[id] || layers[id])?.parentId === layerTarget)) return make(false, 'same-parent');
            let descend = false;
            for (const id of dragged) {
                const verdict = HierarchyUtils.canTransferToLayer(id, layerTarget, nodes, layers);
                if (!verdict.ok) return make(false, verdict.reason);
                if (verdict.reason === 'descend') descend = true;
            }
            return make(true, null, descend);
        }

        // 3. Окно уровня — по указателю; при наложении окон побеждает верхнее
        //    (правило zIndex рендера: выделенное поверх, затем больший уровень)
        let winTarget = null;
        const selWinId = (state.selectedIds || []).find(sid => typeof sid === 'string' && sid.startsWith('level-window-'));
        Object.values(state.levelWindows || {}).forEach(win => {
            if (!win) return;
            const pos = win.position || { x: 0, y: 0 };
            const size = win.size || { w: 1000, h: 700 };
            if (!containsPt({ x: pos.x, y: pos.y, w: size.w, h: size.h })) return;
            if (!winTarget) { winTarget = win; return; }
            const winIsSel = selWinId === `level-window-${win.levelIndex}`;
            const curIsSel = selWinId === `level-window-${winTarget.levelIndex}`;
            if (winIsSel && !curIsSel) { winTarget = win; return; }
            if (!winIsSel && curIsSel) return;
            if ((win.levelIndex || 0) > (winTarget.levelIndex || 0)) winTarget = win;
        });
        if (winTarget) {
            const make = (valid, reason, isMove) => ({ kind: /** @type {'window'} */ ('window'), id: winTarget.id, valid, reason: reason || null, isMove: !!isMove });
            const view = HierarchyUtils.getLevelView(winTarget.id, state);
            if (view.isCollapsed) return make(false, 'collapsed');
            const ownWindow = draggedLevels.every(lvl => lvl === winTarget.levelIndex);
            if (ownWindow) return make(true, null, true); // обычное перемещение
            if (unsupportedMixedLayer) return make(false, 'layer-transfer-later');
            if (!dragDropMode) return make(false, 'dnd-off');
            return make(true, null, false);
        }

        return null; // пустота мира
    },

    /**
     * Целевые локальные позиции для дропа в окно уровня: мировые координаты
     * каждого переносимого элемента переводятся в систему холста целевого окна
     * (с учётом его камеры) — элементы ложатся там, где их отпустили,
     * сохраняя раскладку группы.
     * @param {Array<string>} ids
     * @param {LevelWindowEntity} win целевое окно
     * @param {Object} state
     * @returns {?Object<string, Point>}
     */
    computeDropPositions: (ids, win, state) => {
        if (!ids || !win || !state) return null;
        const view = HierarchyUtils.getLevelView(win.id, state);
        const { headerH, borderW } = HierarchyUtils.LEVEL_WINDOW_METRICS;
        const z = view.innerZoom || 1;
        const offX = view.innerOffset?.x || 0;
        const offY = view.innerOffset?.y || 0;
        const winX = win.position?.x || 0;
        const winY = win.position?.y || 0;
        const result = {};
        ids.forEach(id => {
            const b = HierarchyUtils.getEntityWorldBounds(id, state);
            if (!b) return;
            result[id] = {
                x: Math.round((b.x - winX - borderW - offX) / z),
                y: Math.round((b.y - winY - borderW - headerH - offY) / z)
            };
        });
        return result;
    },

    /**
     * Текст вопроса-подтверждения перед Drag&Drop-переносом: что произойдёт
     * (смена родителя/уровня) и какие родственные связи будут разорваны.
     * @param {Array<string>} ids переносимые «верхние» id
     * @param {{kind: string, id: string, descend?: boolean}} target цель дропа
     * @param {Object} state
     * @returns {string}
     */
    buildTransferConfirmText: (ids, target, state, mode) => {
        const nodes = state.nodes || {};
        const layers = state.layers || {};
        const nameOf = (id) => {
            const e = nodes[id] || layers[id];
            return (e && e.name) ? `«${e.name}»` : `«${id}»`;
        };
        const label = ids.length === 1
            ? `${layers[ids[0]] ? 'Слой' : 'Узел'} ${nameOf(ids[0])}`
            : `${ids.length} элементов`;

        let head = '';
        let ownerWillChange = true;
        if (target.kind === 'node') {
            const lvl = HierarchyUtils.getEntityLevel(target.id, nodes, layers) + 1;
            head = `${label}: станет ребёнком узла ${nameOf(target.id)} (Уровень ${lvl}).`;
        } else if (target.kind === 'layer') {
            const lvl = HierarchyUtils.getEntityLevel(target.id, nodes, layers);
            const cross = ids.some(id => HierarchyUtils.getEntityLevel(id, nodes, layers) !== lvl);
            ownerWillChange = cross;
            head = cross
                ? `${label}: перенос в слой ${nameOf(target.id)} на Уровень ${lvl}.`
                : `${label}: положить в слой ${nameOf(target.id)} (уровень не меняется).`;
            if (target.descend) {
                head += ' Слой в собственной ветке: элемент спустится к потомкам, его прямые дети отвяжутся и останутся на местах.';
            }
        } else {
            const win = state.levelWindows && state.levelWindows[target.id];
            const lvl = win ? win.levelIndex : 0;
            head = `${label}: перенос на Уровень ${lvl} (без родителя — ${ids.length === 1 ? 'сиротой' : 'сиротами'}).`;
        }

        const broken = [];
        if (ownerWillChange) {
            ids.forEach(id => {
                const e = nodes[id] || layers[id];
                if (!e || !e.ownerId) return;
                if (target.kind === 'node' && target.id === e.ownerId) return; // тот же родитель
                const parent = nodes[e.ownerId] || layers[e.ownerId];
                if (parent) broken.push(`связь ${nameOf(id)} с родителем ${nameOf(e.ownerId)} будет разорвана`);
            });
        }

        // «Вырывание из цепочек» (PLAN_SHALLOW_TRANSFER_DND.md): в режиме
        // 'shallow', в отличие от обычного (цепочка едет следом), прямые
        // подопечные переносимого узла остаются на месте и перепривязываются
        // к его прежнему владельцу выше. Предупреждаем об этом отдельно от
        // «связь будет разорвана» — тут связь не рвётся, а перескакивает через
        // поколение. Не дублируем с «спуском в собственную ветку»
        // (target.descend) — там уже есть своё, отдельное предупреждение.
        const reanchored = [];
        if (mode === 'shallow' && ownerWillChange && !target.descend) {
            ids.forEach(id => {
                const e = nodes[id] || layers[id];
                if (!e) return;
                const hasStayingChild = (dict) => Object.values(dict || {})
                    .some(w => w && w.ownerId === id && !ids.includes(w.id));
                if (!hasStayingChild(nodes) && !hasStayingChild(layers)) return;
                const grandparent = e.ownerId ? (nodes[e.ownerId] || layers[e.ownerId]) : null;
                reanchored.push(grandparent
                    ? `подопечные ${nameOf(id)} останутся на месте и перепривяжутся к ${nameOf(e.ownerId)}`
                    : `подопечные ${nameOf(id)} останутся на месте и станут самостоятельными (сиротами-якорями)`);
            });
        }

        let warn = '';
        if (broken.length > 0) {
            const shown = broken.slice(0, 3);
            warn = '\n\n⚠ ' + shown.join(';\n⚠ ')
                + (broken.length > 3 ? `;\n⚠ …и ещё ${broken.length - 3}` : '') + '.';
        }
        if (reanchored.length > 0) {
            const shown = reanchored.slice(0, 3);
            warn += '\n\nℹ ' + shown.join(';\nℹ ')
                + (reanchored.length > 3 ? `;\nℹ …и ещё ${reanchored.length - 3}` : '') + '.';
        }

        return `${head}${warn}\n\nПеренести?`;
    },

    /**
     * Мировая точка порта — единственная точка правды для связей и хит-тестов.
     * Работает и для портов узлов, и для мастер-порта окна уровня.
     * @param {string} portId
     * @param {Object} state
     * @returns {?Point}
     */
    getPortWorldPosition: (portId, state) => {
        if (!state) return null;
        const port = state.ports ? state.ports[portId] : null;
        if (!port) return null;

        if (port.isMaster) {
            return HierarchyUtils.getMasterPortWorldCoordinates(port.windowId != null ? port.windowId : port.windowIndex, state);
        }

        const host = (state.nodes && state.nodes[port.nodeId]) || (state.layers && state.layers[port.nodeId]) || null;
        if (!host) return null;

        const geom = (typeof window !== 'undefined' && window.GeometryUtils) ? window.GeometryUtils :
                     (typeof global !== 'undefined' && global.GeometryUtils) ? global.GeometryUtils :
                     (typeof require === 'function' ? require('./geometry.js') : null);
        if (!geom) return null;

        const rel = geom.getPortRelativePosition(port, host);
        const t = HierarchyUtils.getWorldTransform(host.id, state);
        return { x: t.x + rel.x * t.scale, y: t.y + rel.y * t.scale };
    },

    /** Быстрый индекс портов по ID сущности (узла или слоя): алиас к getPortsByNodeId. */
    getPortsByEntityId: (ports) => HierarchyUtils.getPortsByNodeId(ports),

    /** @deprecated Псевдоним getPortWorldPosition, оставлен на время переезда вызовов. */
    getPortWorldCoordinates: (portId, state) => HierarchyUtils.getPortWorldPosition(portId, state),

    /**
     * Концы связи в мировых координатах плюс её классификация.
     * Одна функция на оба конца: пока обе точки считаются здесь, стык
     * внутреннего и магистрального отрезка не может разъехаться.
     * @param {string} linkId
     * @param {Object} state
     * @returns {?{ p1: Point & { edge: string }, p2: Point & { edge: string }, isCrossLevel: boolean, levelIndex: ?number, sourceLevel: number, targetLevel: number }}
     */
    getLinkEndpoints: (linkId, state) => {
        if (!state || !state.links) return null;
        const link = state.links[linkId];
        if (!link) return null;

        const sPort = state.ports && state.ports[link.sourcePortId];
        const tPort = state.ports && state.ports[link.targetPortId];
        if (!sPort || !tPort) return null;

        const p1 = HierarchyUtils.getPortWorldPosition(link.sourcePortId, state);
        const p2 = HierarchyUtils.getPortWorldPosition(link.targetPortId, state);
        if (!p1 || !p2) return null;

        const levelOfPort = (port) => {
            if (port.isMaster) {
                const win = state.levelWindows && state.levelWindows[port.windowId != null ? port.windowId : port.windowIndex];
                return win ? (win.levelIndex != null ? win.levelIndex : 0) : 0;
            }
            return HierarchyUtils.getLevel(port.nodeId, state.nodes, state.layers);
        };

        const sourceLevel = levelOfPort(sPort);
        const targetLevel = levelOfPort(tPort);
        const isCrossLevel = sourceLevel !== targetLevel;

        return {
            p1: { x: p1.x, y: p1.y, edge: sPort.edge || 'right' },
            p2: { x: p2.x, y: p2.y, edge: tPort.edge || 'left' },
            isCrossLevel,
            levelIndex: isCrossLevel ? null : sourceLevel,
            sourceLevel,
            targetLevel
        };
    },

    /**
     * Преобразование координат курсора экрана в координаты мирового холста.
     * @param {number} clientX
     * @param {number} clientY
     * @param {{ offset: { x: number, y: number }, zoom: number }} canvas
     * @param {DOMRect} [containerRect]
     * @returns {{ x: number, y: number }}
     */
    screenToWorld: (clientX, clientY, canvas, containerRect = null) => {
        const left = containerRect ? containerRect.left : 0;
        const top = containerRect ? containerRect.top : 0;
        const zoom = (canvas && canvas.zoom) || 1;
        const offX = (canvas && canvas.offset && canvas.offset.x) || 0;
        const offY = (canvas && canvas.offset && canvas.offset.y) || 0;
        return {
            x: (clientX - left - offX) / zoom,
            y: (clientY - top - offY) / zoom
        };
    },

    /**
     * Преобразование мировых координат в экранные пиксели.
     * @param {number} x
     * @param {number} y
     * @param {{ offset: { x: number, y: number }, zoom: number }} canvas
     * @param {DOMRect} [containerRect]
     * @returns {{ x: number, y: number }}
     */
    worldToScreen: (x, y, canvas, containerRect = null) => {
        const left = containerRect ? containerRect.left : 0;
        const top = containerRect ? containerRect.top : 0;
        const zoom = (canvas && canvas.zoom) || 1;
        const offX = (canvas && canvas.offset && canvas.offset.x) || 0;
        const offY = (canvas && canvas.offset && canvas.offset.y) || 0;
        return {
            x: left + offX + x * zoom,
            y: top + offY + y * zoom
        };
    },

    /**
     * Фильтрация слоев: обычные слои без окон уровней.
     * @param {Object<string, LayerEntity>} layers
     * @returns {Object<string, LayerEntity>}
     */
    getPlainLayers: (layers) => {
        const result = {};
        Object.entries(layers || {}).forEach(([id, l]) => {
            if (l && !l.isLevelWindow) result[id] = l;
        });
        return result;
    },

    /**
     * Фильтрация слоев: только окна уровней.
     * @param {Object<string, LayerEntity>} layers
     * @returns {Object<string, LayerEntity>}
     */
    getLevelWindows: (layers) => {
        const result = {};
        Object.entries(layers || {}).forEach(([id, l]) => {
            if (l && l.isLevelWindow) result[id] = l;
        });
        return result;
    },

    /**
     * Вычисление координат мастер-порта окна уровня в мировом пространстве.
     * @param {number|string} winKey стабильный id окна либо (легаси) номер уровня
     * @param {Object} state
     * @returns {{ x: number, y: number }}
     */
    getMasterPortWorldCoordinates: (winKey, state) => {
        if (!state || !state.levelWindows) return { x: 0, y: 0 };
        // Ключом может быть стабильный id окна либо (легаси) номер уровня
        const win = state.levelWindows[winKey]
            || HierarchyUtils.getWindowOfLevel(Number(winKey), state.levelWindows);
        if (!win) return { x: 0, y: 0 };

        const { headerH, borderW } = HierarchyUtils.LEVEL_WINDOW_METRICS;
        return {
            x: (win.position?.x || 0) + borderW + 26,
            y: (win.position?.y || 0) + borderW + headerH / 2
        };
    },

    /**
     * Вычисление прокси-портов на границах рамки окна для межуровневых связей.
     * @param {number} winIndex
     * @param {Object} state
     * @returns {Array<Object>}
     */
    /**
     * Прокси-порт конкретной связи на рамке конкретного окна.
     * Через него проходят оба стыка трёхсегментной межуровневой связи:
     * внутренний отрезок внутри окна и магистральный отрезок в мире.
     * @param {string} linkId
     * @param {string} windowId
     * @param {Object} state
     * @returns {?Object}
     */
    /**
     * Прокси-порты окна, разложенные по id связи, с кэшем на поколение состояния.
     *
     * Без кэша getProxyForLink строил ПОЛНЫЙ список прокси окна заново на каждую
     * связь — по два раза на каждую межуровневую связь за кадр. На сцене с
     * сотнями таких связей это был самый дорогой участок кадра (около половины
     * процессорного времени по профилю).
     * @param {string|number} windowId
     * @param {Object} state
     * @returns {Object<string, Object>} linkId → прокси-порт
     */
    getProxyIndexForWindow: (windowId, state) => {
        if (!state) return EMPTY_DICT;
        const key = String(windowId);
        let perState = _proxyIndexCache && _proxyIndexCache.get(state.nodes || EMPTY_DICT);
        const sameDeps = perState
            && perState.linksRef === state.links
            && perState.portsRef === state.ports
            && perState.layersRef === state.layers
            && perState.windowsRef === state.levelWindows
            && perState.viewsRef === state.levelViews;

        if (!sameDeps) {
            perState = {
                linksRef: state.links,
                portsRef: state.ports,
                layersRef: state.layers,
                windowsRef: state.levelWindows,
                viewsRef: state.levelViews,
                byWindow: {}
            };
            if (_proxyIndexCache && state.nodes) _proxyIndexCache.set(state.nodes, perState);
        }

        if (!perState.byWindow[key]) {
            const byLink = {};
            HierarchyUtils.getProxyPortsForWindow(windowId, state).forEach(pr => {
                if (pr && pr.linkId) byLink[pr.linkId] = pr;
            });
            perState.byWindow[key] = byLink;
        }
        return perState.byWindow[key];
    },

    getProxyForLink: (linkId, windowId, state) => {
        return HierarchyUtils.getProxyIndexForWindow(windowId, state)[linkId] || null;
    },

    /**
     * Локальная точка прокси-порта в системе координат ВНУТРЕННЕГО контейнера окна
     * (того, к которому применён translate(innerOffset) scale(innerZoom)).
     * Нужна для внутреннего отрезка связи, который рисуется вместе с узлами.
     * @param {Object} proxy
     * @param {Object} view
     * @returns {Point}
     */
    getProxyViewportLocalPos: (proxy, view) => {
        const z = (view && view.innerZoom) || 1;
        const off = (view && view.innerOffset) || { x: 0, y: 0 };
        return {
            x: (proxy.viewportPos.x - off.x) / z,
            y: (proxy.viewportPos.y - off.y) / z
        };
    },

    /**
     * Межуровневые связи, разложенные по уровням, ОДНИМ проходом по словарю
     * связей и с кэшем на поколение состояния.
     *
     * Прежде этот разбор делался внутри getProxyPortsForWindow, то есть заново
     * для КАЖДОГО окна на КАЖДЫЙ рендер: при четырёх окнах и 700 связях это
     * 2800 обходов с вычислением уровней на кадр. По профилю — самый дорогой
     * участок кадра.
     * @param {Object} state
     * @returns {Object<number, Array>} уровень → список записей о связях
     */
    getCrossLinksByLevel: (state) => {
        if (!state || !state.links) return {};
        const links = state.links;
        const cached = _crossLinksCache && _crossLinksCache.get(links);
        if (cached && cached.portsRef === state.ports && cached.nodesRef === state.nodes && cached.layersRef === state.layers) {
            return cached.byLevel;
        }

        const linksList = Array.isArray(links) ? links : Object.values(links || {});
        const byLevel = {};
        const push = (lvl, entry) => {
            if (!byLevel[lvl]) byLevel[lvl] = [];
            byLevel[lvl].push(entry);
        };

        linksList.forEach(link => {
            if (!link || !link.id) return;
            const sp = state.ports && state.ports[link.sourcePortId];
            const tp = state.ports && state.ports[link.targetPortId];
            if (!sp || !tp) return;
            const sn = (state.nodes && state.nodes[sp.nodeId]) || (state.layers && state.layers[sp.nodeId]);
            const tn = (state.nodes && state.nodes[tp.nodeId]) || (state.layers && state.layers[tp.nodeId]);
            if (!sn || !tn) return;

            const sLvl = HierarchyUtils.getEntityLevel(sn.id, state.nodes, state.layers);
            const tLvl = HierarchyUtils.getEntityLevel(tn.id, state.nodes, state.layers);
            if (sLvl === tLvl) return; // внутриуровневая

            push(sLvl, { link, isSource: true, myPort: sp, myNode: sn, otherPort: tp, otherNode: tn, otherLevel: tLvl });
            push(tLvl, { link, isSource: false, myPort: tp, myNode: tn, otherPort: sp, otherNode: sn, otherLevel: sLvl });
        });

        if (_crossLinksCache && links && typeof links === 'object') {
            _crossLinksCache.set(links, {
                portsRef: state.ports, nodesRef: state.nodes, layersRef: state.layers, byLevel
            });
        }
        return byLevel;
    },

    /**
     * === Изоляция контейнеров ===
     * Вторая ось видимости, независимая от «глаза».
     *
     * «Глаз» (levelHideNeighbors + levelFocusParentId) изолирует СУЩНОСТИ внутри
     * уровня. Здесь изолируются сами контейнеры — проекты и окна уровней: всё
     * прочее содержимое общего холста перестаёт быть видно, и работать можно
     * только с изолированным. Смешивать две оси в одном поле нельзя: они
     * отвечают на разные вопросы и включаются разными кнопками.
     *
     * Инвариант: изоляция не может быть активной без хотя бы одного видимого
     * изолированного контейнера — иначе на экране не останется кнопки, которой
     * её снимают. Поддерживается редьюсером при удалении контейнеров.
     *
     * @param {?{projectIds?: string[], windowIds?: string[]}} ci
     * @returns {boolean}
     */
    isContainerIsolationActive: (ci) => !!(ci && (
        (ci.projectIds && ci.projectIds.length > 0) || (ci.windowIds && ci.windowIds.length > 0)
    )),

    /**
     * Видно ли окно уровня при текущей изоляции контейнеров.
     * Изолирован проект — видны все его окна; изолировано окно — только оно.
     * @param {string} windowId
     * @param {string} projectId
     * @param {?Object} ci
     * @returns {boolean}
     */
    isWindowVisible: (windowId, projectId, ci) => {
        if (!HierarchyUtils.isContainerIsolationActive(ci)) return true;
        const projects = ci.projectIds || [];
        const windows = ci.windowIds || [];
        if (projectId && projects.indexOf(projectId) !== -1) return true;
        return windows.indexOf(windowId) !== -1;
    },

    /**
     * Виден ли проект: сам изолирован либо изолировано хотя бы одно его окно.
     * @param {string} projectId
     * @param {?Object} ci
     * @param {Object} [projectWindows] словарь окон проекта
     * @returns {boolean}
     */
    isProjectVisible: (projectId, ci, projectWindows) => {
        if (!HierarchyUtils.isContainerIsolationActive(ci)) return true;
        if ((ci.projectIds || []).indexOf(projectId) !== -1) return true;
        const windows = ci.windowIds || [];
        return Object.keys(projectWindows || {}).some(wid => windows.indexOf(wid) !== -1);
    },

    /**
     * Сущности, разложенные по уровням, ОДНИМ проходом и с кэшем на поколение.
     *
     * Каждое окно уровня прежде само перебирало ВСЕ узлы и слои проекта, вызывая
     * getEntityLevel на каждую сущность. При пяти окнах и 2000 узлов это 10 000
     * проверок на кадр — при том, что разложение одинаково для всех окон.
     * @param {Object} nodes
     * @param {Object} layers
     * @returns {Object<number, {nodes: Array, layers: Array}>}
     */
    getEntitiesByLevel: (nodes, layers) => {
        const safeNodes = nodes || EMPTY_DICT;
        const safeLayers = layers || EMPTY_DICT;
        const cached = _byLevelCache && _byLevelCache.get(safeNodes);
        if (cached && cached.layersRef === safeLayers) return cached.byLevel;

        const byLevel = {};
        const bucket = (lvl) => {
            if (!byLevel[lvl]) byLevel[lvl] = { nodes: [], layers: [] };
            return byLevel[lvl];
        };
        Object.keys(safeNodes).forEach(id => {
            const n = safeNodes[id];
            if (!n) return;
            bucket(HierarchyUtils.getEntityLevel(id, safeNodes, safeLayers)).nodes.push(n);
        });
        Object.keys(safeLayers).forEach(id => {
            const l = safeLayers[id];
            if (!l) return;
            bucket(HierarchyUtils.getEntityLevel(id, safeNodes, safeLayers)).layers.push(l);
        });

        if (_byLevelCache && nodes && typeof nodes === 'object') {
            _byLevelCache.set(safeNodes, { layersRef: safeLayers, byLevel });
        }
        return byLevel;
    },

    /**
     * Прямоугольник ЛОКАЛЬНЫХ координат окна уровня, который сейчас реально
     * попадает на экран (culling по вьюпорту).
     *
     * Смысл: сущности за пределами экрана можно не создавать вовсе — их всё
     * равно не видно, а браузер обязан размещать и держать каждый элемент.
     * Возвращается прямоугольник с запасом в один экран по каждой стороне,
     * чтобы при быстрой панораме ничего не мигало, либо null — если окно
     * целиком за экраном (тогда его содержимое не нужно вовсе).
     *
     * @param {Object} win окно уровня (position, size)
     * @param {{ innerOffset: {x:number,y:number}, innerZoom: number }} camera камера окна
     * @param {{ offset: {x:number,y:number}, zoom: number }} worldCamera камера мира
     * @param {{ w: number, h: number }} screen размер видимой области в пикселях
     * @returns {?{x0:number,y0:number,x1:number,y1:number}}
     */
    getVisibleLocalRect: (win, camera, worldCamera, screen) => {
        if (!win || !camera || !worldCamera || !screen) return null;
        const zoomW = worldCamera.zoom || 1;
        const offW = worldCamera.offset || { x: 0, y: 0 };
        const innerZoom = camera.innerZoom || 1;
        const innerOffset = camera.innerOffset || { x: 0, y: 0 };
        const { headerH, borderW } = HierarchyUtils.LEVEL_WINDOW_METRICS;
        const winPos = win.position || { x: 0, y: 0 };
        const winSize = win.size || { w: 1000, h: 700 };

        // Видимая часть мира в мировых координатах
        const viewX0 = (0 - offW.x) / zoomW;
        const viewY0 = (0 - offW.y) / zoomW;
        const viewX1 = (screen.w - offW.x) / zoomW;
        const viewY1 = (screen.h - offW.y) / zoomW;

        // Тело окна в мировых координатах (без рамки и шапки)
        const bodyX0 = winPos.x + borderW;
        const bodyY0 = winPos.y + headerH;
        const bodyX1 = winPos.x + winSize.w - borderW;
        const bodyY1 = winPos.y + winSize.h - borderW;

        // Пересечение: что от тела окна видно на экране
        const x0 = Math.max(viewX0, bodyX0);
        const y0 = Math.max(viewY0, bodyY0);
        const x1 = Math.min(viewX1, bodyX1);
        const y1 = Math.min(viewY1, bodyY1);
        if (x1 <= x0 || y1 <= y0) return null; // окно целиком за экраном

        // Мировые координаты → локальные координаты холста уровня
        const toLocalX = (wx) => (wx - bodyX0 - innerOffset.x) / innerZoom;
        const toLocalY = (wy) => (wy - bodyY0 - innerOffset.y) / innerZoom;

        // Запас в один экран по каждой стороне гасит мигание при панораме
        const padX = screen.w / (zoomW * innerZoom);
        const padY = screen.h / (zoomW * innerZoom);

        return {
            x0: toLocalX(x0) - padX,
            y0: toLocalY(y0) - padY,
            x1: toLocalX(x1) + padX,
            y1: toLocalY(y1) + padY
        };
    },

    /**
     * Пересекается ли прямоугольник сущности с видимой областью.
     * @param {{x:number,y:number}} pos локальная позиция
     * @param {{w:number,h:number}} size
     * @param {?{x0:number,y0:number,x1:number,y1:number}} rect null = ограничения нет
     * @returns {boolean}
     */
    isRectVisible: (pos, size, rect) => {
        if (!rect) return true;
        const x = (pos && pos.x) || 0;
        const y = (pos && pos.y) || 0;
        const w = (size && size.w) || 0;
        const h = (size && size.h) || 0;
        return !(x + w < rect.x0 || x > rect.x1 || y + h < rect.y0 || y > rect.y1);
    },

    getProxyPortsForWindow: (winIndex, state) => {
        if (!state || !state.levelWindows) return [];
        const win = state.levelWindows[winIndex] || HierarchyUtils.getWindowOfLevel(Number(winIndex), state.levelWindows);
        if (!win) return [];
        winIndex = win.levelIndex != null ? win.levelIndex : Number(winIndex);
        const winSize = win.size || { w: 1000, h: 700 };
        const winPos = win.position || { x: 0, y: 0 };
        const { headerH, borderW } = HierarchyUtils.LEVEL_WINDOW_METRICS;
        const bodyH = Math.max(200, winSize.h - headerH);

        const crossLinks = HierarchyUtils.getCrossLinksByLevel(state)[winIndex] || [];

        if (crossLinks.length === 0) return [];

        // Сборка прокси-объекта по грани и доле вдоль неё (fraction 0..1).
        const makeProxy = (item, edge, fraction) => {
            let frameX = 0;
            let frameY = 0;
            let viewportLocalX = 0;
            let viewportLocalY = 0;

            if (edge === 'top') {
                // Мировая точка прокси (frameX/frameY) — на ВНЕШНЕМ контуре окна,
                // как у left/right/bottom: магистраль подходит к самому верху рамки,
                // а не к границе шапка/содержимое. Внутренний отрезок связи при этом
                // по-прежнему целится в верх ВЬЮПОРТА содержимого (viewportLocalY=0,
                // под шапкой) — своя система координат, см. getProxyViewportLocalPos.
                // Между двумя точками — высота шапки; на экране этот участок
                // перекрыт самой шапкой, так что разрыва не видно.
                frameX = winSize.w * fraction;
                frameY = 0;
                viewportLocalX = frameX;
                viewportLocalY = 0;
            } else if (edge === 'bottom') {
                frameX = winSize.w * fraction;
                frameY = winSize.h;
                viewportLocalX = frameX;
                viewportLocalY = bodyH;
            } else if (edge === 'left') {
                frameX = 0;
                frameY = headerH + bodyH * fraction;
                viewportLocalX = 0;
                viewportLocalY = bodyH * fraction;
            } else { // right
                frameX = winSize.w;
                frameY = headerH + bodyH * fraction;
                viewportLocalX = winSize.w;
                viewportLocalY = bodyH * fraction;
            }

            const worldPos = {
                x: winPos.x + borderW + frameX,
                y: winPos.y + borderW + frameY
            };

            return {
                id: `proxy-${item.link.id}-${winIndex}`,
                linkId: item.link.id,
                link: item.link,
                isSource: item.isSource,
                myPortId: item.myPort.id,
                otherPortId: item.otherPort.id,
                targetLevel: item.otherLevel,
                edge,
                slotFraction: fraction,
                framePos: { x: frameX, y: frameY },
                viewportPos: { x: viewportLocalX, y: viewportLocalY },
                worldPos,
                color: item.link.color || '#38bdf8'
            };
        };

        // Прокси с ручным положением (Shift+драг по рамке) исключаются из
        // авторасстановки: остальные распределяются по граням как раньше.
        const proxies = [];
        const autoItems = [];
        crossLinks.forEach(item => {
            const ov = win.id && item.link.proxyOverrides ? item.link.proxyOverrides[win.id] : null;
            if (ov && ['top', 'bottom', 'left', 'right'].includes(ov.edge) && typeof ov.fraction === 'number') {
                proxies.push(makeProxy(item, ov.edge, Math.max(0.03, Math.min(0.97, ov.fraction))));
            } else {
                autoItems.push(item);
            }
        });

        const byEdge = { top: [], bottom: [], left: [], right: [] };
        autoItems.forEach(item => {
            let edge = 'bottom';
            if (item.otherLevel < winIndex) edge = 'top';
            else if (item.otherLevel > winIndex) edge = 'bottom';
            else {
                const otherWin = HierarchyUtils.getWindowOfLevel(item.otherLevel, state.levelWindows);
                if (otherWin && otherWin.position && otherWin.position.x < winPos.x) edge = 'left';
                else edge = 'right';
            }
            byEdge[edge].push(item);
        });

        Object.entries(byEdge).forEach(([edge, items]) => {
            if (items.length === 0) return;
            items.sort((a, b) => a.otherLevel - b.otherLevel || a.link.id.localeCompare(b.link.id));

            const total = items.length;
            items.forEach((item, slotIdx) => {
                proxies.push(makeProxy(item, edge, (slotIdx + 1) / (total + 1)));
            });
        });

        return proxies;
    }
};

if (typeof window !== 'undefined') window.HierarchyUtils = HierarchyUtils;
if (typeof module !== 'undefined') module.exports = HierarchyUtils;
