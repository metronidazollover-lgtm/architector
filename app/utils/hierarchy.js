// Иерархия сущностей: абсолютные координаты, статистика вложенности.
// Двойной экспорт: window для браузера, module.exports для node:test.

// Кэш абсолютных позиций, уровней и пространственных индексов на поколение стейта:
// объекты пересоздаются редьюсером при каждом изменении, поэтому WeakMap инвалидируется сам.
const _levelCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
const _portsByNodeCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
const _linksByPortCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
const _linkOrderCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

// Стабильная пустышка. Литерал `layers || {}` создавал НОВЫЙ объект на каждый
// вызов, и кэш уровней, ключом которого служит ссылка на словарь, промахивался
// всегда: поколение пересоздавалось на каждом обращении. По профилю это был
// самый дорогой участок кадра.
const EMPTY_DICT = Object.freeze({});

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
    getLevel: (id, nodes, layers = null, levelWindows = null) => {
        if (!id || id === 'root') return 0;
        const safeNodes = nodes || EMPTY_DICT;
        const safeLayers = layers || EMPTY_DICT;
        const safeWindows = levelWindows || EMPTY_DICT;

        let generation = _levelCache && _levelCache.get(safeNodes);
        if (generation && generation.layersRef === safeLayers && generation.windowsRef === safeWindows) {
            const hit = generation.map.get(id);
            if (hit !== undefined) return hit;
        } else if (_levelCache && nodes && typeof nodes === 'object') {
            generation = { layersRef: safeLayers, windowsRef: safeWindows, map: new Map() };
            _levelCache.set(safeNodes, generation);
        }

        let level = 0;
        let current = safeNodes[id] || safeLayers[id];
        const visited = new Set();

        while (current && !visited.has(current.id)) {
            visited.add(current.id);
            const parentId = current.parentId;

            // v13: parentId указывает прямо на id окна уровня — сирота-якорь,
            // явно привязанный к этому уровню (замена удалённого homeLevel,
            // см. docs/IDEAL_INTERACTIONS.md §1). Терминальный случай: уровень
            // окна известен напрямую, дальше подниматься некуда.
            if (parentId && parentId !== 'root' && safeWindows[parentId]) {
                const res = level + safeWindows[parentId].levelIndex;
                if (generation) generation.map.set(id, res);
                return res;
            }

            // Внутри слоя уровень наследуется от координатного контейнера
            if (parentId && parentId !== 'root' && safeLayers[parentId]) {
                current = safeLayers[parentId];
                continue;
            }

            // v13 (родство напрямую через parentId, ownerId уже нет) ИЛИ легаси
            // до миграции v11: parentId указывает на узел другого уровня.
            if (parentId && parentId !== 'root' && safeNodes[parentId] && !current.ownerId) {
                level++;
                current = safeNodes[parentId];
                continue;
            }

            const ownerId = current.ownerId;
            if (!ownerId) {
                // ЯКОРЬ НЕЗАВИСИМОЙ ВЕТКИ (v11): сирота (без владельца) может нести
                // homeLevel — «домашний уровень». Вся его ветка живёт от этого
                // якоря: сам сирота на homeLevel, дети на homeLevel+1 и глубже.
                // Поля нет (старые проекты, и все v13-сущности) — 0, прежнее поведение.
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
     * Максимальный уровень глубины сущностей в текущем проекте.
     * @param {Object<string, NodeEntity>} nodes
     * @param {?Object<string, LayerEntity>} [layers]
     * @returns {number}
     */
    getMaxProjectLevel: (nodes, layers = null) => {
        let maxLvl = 0;
        Object.keys(nodes || {}).forEach(id => {
            const lvl = HierarchyUtils.getLevel(id, nodes, layers);
            if (lvl > maxLvl) maxLvl = lvl;
        });
        return maxLvl;
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
     * === Изоляция контейнеров ===
     * Единственная ось видимости в v14 (Фаза 6: «глаз» веток —
     * levelHideNeighbors/levelFocusParentId, изолировавший СУЩНОСТИ внутри
     * уровня — удалён вместе с уровнями; понятия «видимая ветка» в v14 не
     * существует, только открытая/закрытая дорожка).
     *
     * Изолируются контейнеры — проекты и окна: всё прочее содержимое общего
     * холста перестаёт быть видно, и работать можно только с изолированным.
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

};

// =============================================================================
// v14 («Отчеты, аудиты, планы/Lanes_v14/PLAN_V14_LANES.md») — Дорожки/Окна/
// Рамки вместо уровней и слоёв, см. docs/LANES_MODEL.md. Единственный живой
// реестр геометрии/иерархии с конца Фазы 4; всё, что было выше (v13-only —
// уровни, слои, ownerId/ownerGap/homeLevel, окна-по-глубине), физически
// удалено в Фазе 6. Часть функций здесь по-прежнему носит суффикс V14
// (isDescendantOfV14, canReparentToV14, getWorldTransformV14,
// getPortWorldPositionV14, getAddContextV14, getProxyIndexForWindowV14) —
// исторически «временное» имя на время сосуществования со старой одноимённой
// версией; переименование в финальные имена так и не потребовалось (старые
// версии просто удалены), суффикс остался как есть.
// =============================================================================

const _depthCacheV14 = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
const _childrenByParentCacheV14 = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
const _framesByMemberCacheV14 = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

// Ширина дорожки — константа (§2.3 LANES_MODEL.md); корень шире, скрытая
// («глаз») дорожка — полоска. Метрики шапки/рамки окна — то же значение,
// что было у удалённой v13-константы LEVEL_WINDOW_METRICS.
const LANE_W = 420;
const ROOT_LANE_W = 520;
const HIDDEN_LANE_W = 26;
const FRAME_PAD = 20;
const FRAME_NEST_STEP = 12;
const WINDOW_METRICS = { headerH: 40, borderW: 2 };

Object.assign(HierarchyUtils, {
    LANE_W, ROOT_LANE_W, HIDDEN_LANE_W, FRAME_PAD, FRAME_NEST_STEP, WINDOW_METRICS,

    /**
     * v14: глубина узла — длина цепочки `parentId` до `'root'` (прямые дети
     * корня — глубина 1). Заменяет getEntityLevel: слоёв в цепочке больше
     * нет, поэтому нет прохода «слой не считается» — только узлы.
     * @param {string} id
     * @param {Object<string, NodeEntityV14>} nodes
     * @returns {number}
     */
    getDepth: (id, nodes) => {
        if (!id || id === 'root') return 0;
        const safeNodes = nodes || EMPTY_DICT;
        let generation = _depthCacheV14 && _depthCacheV14.get(safeNodes);
        if (!generation) {
            generation = new Map();
            if (_depthCacheV14 && nodes) _depthCacheV14.set(safeNodes, generation);
        }
        if (generation.has(id)) return generation.get(id);

        let depth = 0;
        let current = safeNodes[id];
        const visited = new Set();
        while (current && !visited.has(current.id)) {
            visited.add(current.id);
            depth++;
            const pid = current.parentId;
            if (!pid || pid === 'root' || !safeNodes[pid]) break;
            current = safeNodes[pid];
        }
        generation.set(id, depth);
        return depth;
    },

    /**
     * v14: путь узла — цепочка id от корневого предка до самого узла
     * (§3 LANES_MODEL.md, секция ДЕРЕВО нотации использует имена вдоль
     * этого же пути).
     * @param {string} id
     * @param {Object<string, NodeEntityV14>} nodes
     * @returns {Array<string>}
     */
    getPath: (id, nodes) => {
        const safeNodes = nodes || EMPTY_DICT;
        const path = [];
        let current = safeNodes[id];
        const visited = new Set();
        while (current && !visited.has(current.id)) {
            visited.add(current.id);
            path.unshift(current.id);
            const pid = current.parentId;
            if (!pid || pid === 'root' || !safeNodes[pid]) break;
            current = safeNodes[pid];
        }
        return path;
    },

    /**
     * v14: быстрый индекс детей по parentId ('root' или id узла).
     * Аналог getNodesByParentId, но без слоёв — единственная структура parentId.
     * @param {Object<string, NodeEntityV14>} nodes
     * @returns {Object<string, Array<NodeEntityV14>>}
     */
    getChildrenByParent: (nodes) => {
        if (!nodes || typeof nodes !== 'object') return {};
        if (_childrenByParentCacheV14 && _childrenByParentCacheV14.has(nodes)) return _childrenByParentCacheV14.get(nodes);
        const index = {};
        Object.values(nodes).forEach(n => {
            if (!n) return;
            const pid = n.parentId || 'root';
            if (!index[pid]) index[pid] = [];
            index[pid].push(n);
        });
        if (_childrenByParentCacheV14) _childrenByParentCacheV14.set(nodes, index);
        return index;
    },

    /**
     * v14: быстрый индекс рамок по id узла-члена (§4.2 LANES_MODEL.md).
     * @param {Object<string, FrameEntity>} frames
     * @returns {Object<string, Array<FrameEntity>>}
     */
    getFramesByMember: (frames) => {
        if (!frames || typeof frames !== 'object') return {};
        if (_framesByMemberCacheV14 && _framesByMemberCacheV14.has(frames)) return _framesByMemberCacheV14.get(frames);
        const index = {};
        Object.values(frames).forEach(f => {
            if (!f) return;
            (f.members || []).forEach(mid => {
                if (!index[mid]) index[mid] = [];
                index[mid].push(f);
            });
        });
        if (_framesByMemberCacheV14) _framesByMemberCacheV14.set(frames, index);
        return index;
    },

    /** v14: рамки, членом которых является узел. @returns {Array<FrameEntity>} */
    framesOf: (nodeId, frames) => HierarchyUtils.getFramesByMember(frames)[nodeId] || [],

    /**
     * v14: узел (только узлы — isDescendantOf теперь не поднимается через
     * слои, их больше нет в цепочке parentId). Меняется относительно старой
     * версии выше (там же nodes ИЛИ layers) — временное имя до конца Фазы 4.
     */
    isDescendantOfV14: (candidateId, ancestorId, nodes) => {
        if (candidateId === ancestorId) return true;
        const safeNodes = nodes || EMPTY_DICT;
        let current = safeNodes[candidateId];
        const visited = new Set();
        while (current && !visited.has(current.id)) {
            visited.add(current.id);
            if (current.parentId === ancestorId) return true;
            current = safeNodes[current.parentId] || null;
        }
        return false;
    },

    /**
     * v14: может ли entityId получить `parentId = targetParentId` — цель
     * только 'root' или id узла (рамка/окно не могут быть родителем).
     * Временное имя до конца Фазы 4 (заменит canReparentTo).
     * @param {string} entityId
     * @param {string} targetParentId
     * @param {Object<string, NodeEntityV14>} nodes
     * @param {?{nodes: Object}} [entityDicts] словари САМОЙ сущности при
     *   кросс-проектном переносе (Фаза 5), если отличаются от целевых.
     * @returns {{ok: boolean, reason: ?string}}
     */
    canReparentToV14: (entityId, targetParentId, nodes, entityDicts = null) => {
        const safeNodes = nodes || EMPTY_DICT;
        const eNodes = (entityDicts && entityDicts.nodes) || safeNodes;
        const entity = eNodes[entityId];
        if (!entity) return { ok: false, reason: 'not-found' };
        if (entityId === targetParentId) return { ok: false, reason: 'self' };
        if (targetParentId !== 'root' && !safeNodes[targetParentId]) return { ok: false, reason: 'not-found' };
        if (eNodes === safeNodes && HierarchyUtils.isDescendantOfV14(targetParentId, entityId, safeNodes)) {
            return { ok: false, reason: 'cycle' };
        }
        return { ok: true, reason: null };
    },

    /**
     * v14: окна, в которых открыта дорожка ownerId ('root' или id узла).
     * Пустой массив — дорожка нигде не открыта (узел не отображается).
     * @param {string} ownerId
     * @param {Object<string, WindowEntity>} windows
     * @returns {Array<WindowEntity>}
     */
    windowsOfLane: (ownerId, windows) => {
        return Object.values(windows || {}).filter(w => w && Array.isArray(w.lanes) && w.lanes.includes(ownerId));
    },

    /**
     * v14: горизонтальное смещение дорожки внутри окна — сумма ширин
     * предшествующих дорожек (корень шире; скрытая «глазом» — полоска).
     * @param {WindowEntity} win
     * @param {string} ownerId
     * @returns {number}
     */
    laneOffset: (win, ownerId) => {
        if (!win || !Array.isArray(win.lanes)) return 0;
        const hidden = win.hidden || [];
        let x = 0;
        for (const lid of win.lanes) {
            if (lid === ownerId) return x;
            x += hidden.includes(lid) ? HIDDEN_LANE_W : (lid === 'root' ? ROOT_LANE_W : LANE_W);
        }
        return x;
    },

    /**
     * v14: мировой прямоугольник вьюпорта дорожки (без шапки/рамки окна).
     * @param {WindowEntity} win
     * @param {string} ownerId
     * @returns {?{x:number,y:number,w:number,h:number}}
     */
    laneRect: (win, ownerId) => {
        if (!win || !Array.isArray(win.lanes) || !win.lanes.includes(ownerId)) return null;
        const winPos = win.position || { x: 0, y: 0 };
        const winSize = win.size || { w: 1000, h: 700 };
        const hidden = (win.hidden || []).includes(ownerId);
        const w = hidden ? HIDDEN_LANE_W : (ownerId === 'root' ? ROOT_LANE_W : LANE_W);
        const offset = HierarchyUtils.laneOffset(win, ownerId);
        return {
            x: winPos.x + WINDOW_METRICS.borderW + offset,
            y: winPos.y + WINDOW_METRICS.headerH,
            w,
            h: Math.max(0, winSize.h - WINDOW_METRICS.headerH - WINDOW_METRICS.borderW)
        };
    },

    /**
     * v14: точка в локальных координатах дорожки (как node.position) ->
     * мировая точка, с учётом камеры окна (offset/zoom).
     * @param {WindowEntity} win
     * @param {string} ownerId
     * @param {Point} point
     * @returns {?{x:number,y:number,scale:number}}
     */
    laneLocalToWorld: (win, ownerId, point) => {
        const lane = HierarchyUtils.laneRect(win, ownerId);
        if (!lane) return null;
        const camera = (win && win.camera) || { offset: { x: 0, y: 0 }, zoom: 1 };
        const zoom = camera.zoom || 1;
        const offX = (camera.offset && camera.offset.x) || 0;
        const offY = (camera.offset && camera.offset.y) || 0;
        return { x: lane.x + offX + (point.x || 0) * zoom, y: lane.y + offY + (point.y || 0) * zoom, scale: zoom };
    },

    /**
     * v14: мировой прямоугольник узла В КОНКРЕТНОМ окне (его дорожка должна
     * быть открыта в этом окне).
     * @param {WindowEntity} win
     * @param {string} nodeId
     * @param {Object} state
     * @returns {?{x:number,y:number,w:number,h:number}}
     */
    nodeRectInWindow: (win, nodeId, state) => {
        const node = state && state.nodes && state.nodes[nodeId];
        if (!node || !win) return null;
        const ownerId = node.parentId || 'root';
        const topLeft = HierarchyUtils.laneLocalToWorld(win, ownerId, node.position || { x: 0, y: 0 });
        if (!topLeft) return null;
        const size = node.size || { w: 200, h: 100 };
        return { x: topLeft.x, y: topLeft.y, w: size.w * topLeft.scale, h: size.h * topLeft.scale };
    },

    /**
     * v14: мировой прямоугольник узла в ЛЮБОМ окне, где открыта его дорожка
     * (предпочитая `preferWindowId`, если он валиден). null — дорожка нигде
     * не открыта, узел не отображается (инвариант §2.3 LANES_MODEL.md).
     * @param {string} nodeId
     * @param {Object} state
     * @param {?string} [preferWindowId]
     * @returns {?{x:number,y:number,w:number,h:number}}
     */
    nodeWorldRect: (nodeId, state, preferWindowId) => {
        const node = state && state.nodes && state.nodes[nodeId];
        if (!node) return null;
        const ownerId = node.parentId || 'root';
        const windows = (state && state.windows) || {};
        let win = null;
        if (preferWindowId && windows[preferWindowId] && (windows[preferWindowId].lanes || []).includes(ownerId)) {
            win = windows[preferWindowId];
        } else {
            win = HierarchyUtils.windowsOfLane(ownerId, windows)[0] || null;
        }
        if (!win) return null;
        return HierarchyUtils.nodeRectInWindow(win, nodeId, state);
    },

    /**
     * v14: мировая позиция и масштаб узла (аналог старого getWorldTransform,
     * но окно+дорожка вместо уровня). Временное имя до конца Фазы 4.
     * @param {string} id
     * @param {Object} state
     * @returns {{x:number,y:number,scale:number}}
     */
    getWorldTransformV14: (id, state) => {
        if (!id || !state || id === 'root') return { x: 0, y: 0, scale: 1.0 };
        const node = state.nodes && state.nodes[id];
        if (!node) return { x: 0, y: 0, scale: 1.0 };
        const rect = HierarchyUtils.nodeWorldRect(id, state);
        if (!rect) return { x: 0, y: 0, scale: 1.0 };
        const w = (node.size && node.size.w) || 1;
        return { x: rect.x, y: rect.y, scale: w ? rect.w / w : 1 };
    },

    /**
     * v14: bbox членов рамки, лежащих в конкретной дорожке (кусок рамки),
     * в ЛОКАЛЬНЫХ координатах дорожки (как node.position), с отступом
     * FRAME_PAD. exceptId исключает одного члена (например, во время его
     * перетаскивания). null — в этой дорожке нет видимых членов рамки.
     * @param {WindowEntity} win
     * @param {string} ownerId
     * @param {string} frameId
     * @param {Object} state
     * @param {?string} [exceptId]
     * @returns {?{x:number,y:number,w:number,h:number}}
     */
    fragmentRect: (win, ownerId, frameId, state, exceptId) => {
        const frame = state && state.frames && state.frames[frameId];
        if (!frame || !win) return null;
        const nodes = state.nodes || {};
        const members = (frame.members || []).filter(id => id !== exceptId
            && nodes[id] && (nodes[id].parentId || 'root') === ownerId);
        if (!members.length) return null;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        members.forEach(id => {
            const n = nodes[id];
            const pos = n.position || { x: 0, y: 0 };
            const size = n.size || { w: 200, h: 100 };
            minX = Math.min(minX, pos.x);
            minY = Math.min(minY, pos.y);
            maxX = Math.max(maxX, pos.x + size.w);
            maxY = Math.max(maxY, pos.y + size.h);
        });
        return { x: minX - FRAME_PAD, y: minY - FRAME_PAD, w: (maxX - minX) + FRAME_PAD * 2, h: (maxY - minY) + FRAME_PAD * 2 };
    },

    /**
     * v14: мировая точка порта — узел ИЛИ рамка (порт рамки — на куске
     * homeLaneId; без членов там — на первом непустом куске, homeLaneId не
     * переписывается, см. §4.2 LANES_MODEL.md). Временное имя до Фазы 4.
     * @param {string} portId
     * @param {Object} state
     * @returns {?Point}
     */
    getPortWorldPositionV14: (portId, state) => {
        if (!state) return null;
        const port = state.ports ? state.ports[portId] : null;
        if (!port) return null;

        const geom = (typeof window !== 'undefined' && window.GeometryUtils) ? window.GeometryUtils :
                     (typeof global !== 'undefined' && global.GeometryUtils) ? global.GeometryUtils :
                     (typeof require === 'function' ? require('./geometry.js') : null);
        if (!geom) return null;

        const node = state.nodes && state.nodes[port.nodeId];
        if (node) {
            const t = HierarchyUtils.getWorldTransformV14(port.nodeId, state);
            const rel = geom.getPortRelativePosition(port, node);
            return { x: t.x + rel.x * t.scale, y: t.y + rel.y * t.scale };
        }

        const frame = state.frames && state.frames[port.nodeId];
        if (!frame) return null;

        const windows = state.windows || {};
        const tryFragment = (ownerId) => {
            const win = HierarchyUtils.windowsOfLane(ownerId, windows)[0];
            if (!win) return null;
            const rect = HierarchyUtils.fragmentRect(win, ownerId, frame.id, state);
            if (!rect) return null;
            const topLeft = HierarchyUtils.laneLocalToWorld(win, ownerId, { x: rect.x, y: rect.y });
            if (!topLeft) return null;
            const rel = geom.getPortRelativePosition(port, { size: { w: rect.w, h: rect.h } });
            return { x: topLeft.x + rel.x * topLeft.scale, y: topLeft.y + rel.y * topLeft.scale };
        };

        const homeLaneId = frame.homeLaneId || 'root';
        const onHome = tryFragment(homeLaneId);
        if (onHome) return onHome;

        // Домашняя дорожка без видимых членов — порты временно на первом
        // непустом куске (homeLaneId НЕ переписывается).
        const nodes = state.nodes || {};
        const altOwnerId = (frame.members || [])
            .map(mid => nodes[mid] && (nodes[mid].parentId || 'root'))
            .find(Boolean);
        return altOwnerId ? tryFragment(altOwnerId) : null;
    },

    /**
     * v14: контекст создания нового узла кнопкой «+» (§10 LANES_MODEL.md,
     * Toolbar). Единственная ветка вместо старой ambiguous-branch/multi-owner
     * логики — дорожка однозначна: activeLaneId, либо дорожка единственного
     * выделенного узла, либо root. Временное имя до конца Фазы 4.
     * @param {Object} state
     * @returns {{ok: boolean, parentId: ?string, reason: ?string}}
     */
    getAddContextV14: (state) => {
        const nodes = (state && state.nodes) || {};
        const selectedIds = (state && state.selectedIds) || [];
        const selNodes = selectedIds.filter(id => nodes[id]);
        if (selNodes.length > 1) return { ok: false, parentId: null, reason: 'multi-select' };
        if (selNodes.length === 1) {
            return { ok: true, parentId: nodes[selNodes[0]].parentId || 'root', reason: null };
        }
        return { ok: true, parentId: (state && state.activeLaneId) || 'root', reason: null };
    },

    /**
     * v14: единственный резолвер цели Drag&Drop — окно → дорожка → карточка →
     * кусок рамки (§14 LANES_MODEL.md). Однопроектный (кросс-проектный вариант
     * — Фаза 5, по аналогии со старым getDropTargetAcrossProjects).
     * @param {Point} pointerWorld
     * @param {Array<string>} draggedIds
     * @param {Object} state
     * @param {{dragDropMode?: boolean}} [opts]
     * @returns {{ok: boolean, reason?: ?string, windowId?: string, ownerId?: string, nodeId?: string, frameId?: string, isMove?: boolean}}
     */
    resolveDropTarget: (pointerWorld, draggedIds, state, opts = {}) => {
        if (!state || !draggedIds || !draggedIds.length || !pointerWorld) return { ok: false, reason: 'invalid' };
        const dragDropMode = opts.dragDropMode !== false;
        const nodes = state.nodes || {};
        const windows = state.windows || {};
        const frames = state.frames || {};
        const dragged = draggedIds.filter(id => nodes[id]);
        if (!dragged.length) return { ok: false, reason: 'invalid' };

        const isExcluded = (id) => dragged.includes(id)
            || dragged.some(d => HierarchyUtils.isDescendantOfV14(id, d, nodes));

        const containsPt = (rect) => !!rect && pointerWorld.x >= rect.x && pointerWorld.x <= rect.x + rect.w
            && pointerWorld.y >= rect.y && pointerWorld.y <= rect.y + rect.h;

        // 1. Окно под курсором. При перекрытии здесь побеждает последнее по
        // порядку словаря — временная эвристика; явный z-order активного окна
        // (§10.3 LANES_MODEL.md) появится вместе с самим состоянием окон в UI (Фаза 4).
        let win = null, windowId = null;
        Object.entries(windows).forEach(([wid, w]) => {
            if (!w) return;
            const pos = w.position || { x: 0, y: 0 };
            const size = w.size || { w: 900, h: 600 };
            if (containsPt({ x: pos.x, y: pos.y, w: size.w, h: size.h })) { win = w; windowId = wid; }
        });
        if (!win) return { ok: false, reason: 'empty' };
        if (win.collapsed) return { ok: false, reason: 'collapsed', windowId };

        // 2. Дорожка под курсором
        let ownerId = null;
        (win.lanes || []).forEach(lid => {
            if (containsPt(HierarchyUtils.laneRect(win, lid))) ownerId = lid;
        });
        if (!ownerId) return { ok: false, reason: 'empty', windowId };

        const sameOwner = dragged.every(id => (nodes[id].parentId || 'root') === ownerId);

        // 3. Карточка узла в этой дорожке — вложение (Nest)
        let cardTarget = null;
        Object.keys(nodes).forEach(id => {
            if (isExcluded(id) || (nodes[id].parentId || 'root') !== ownerId) return;
            if (containsPt(HierarchyUtils.nodeRectInWindow(win, id, state))) cardTarget = id;
        });
        if (cardTarget) {
            if (!dragDropMode) return { ok: false, reason: 'dnd-off', windowId, nodeId: cardTarget };
            const allChildren = dragged.every(id => nodes[id].parentId === cardTarget);
            if (allChildren) return { ok: false, reason: 'same-parent', windowId, nodeId: cardTarget };
            for (const id of dragged) {
                const verdict = HierarchyUtils.canReparentToV14(id, cardTarget, nodes);
                if (!verdict.ok) return { ok: false, reason: verdict.reason, windowId, nodeId: cardTarget };
            }
            return { ok: true, windowId, nodeId: cardTarget };
        }

        // 4. Кусок рамки в этой дорожке, без попадания на конкретную карточку — членство
        let frameId = null;
        Object.keys(frames).forEach(fid => {
            const local = HierarchyUtils.fragmentRect(win, ownerId, fid, state);
            if (!local) return;
            const topLeft = HierarchyUtils.laneLocalToWorld(win, ownerId, { x: local.x, y: local.y });
            if (!topLeft) return;
            const rect = { x: topLeft.x, y: topLeft.y, w: local.w * topLeft.scale, h: local.h * topLeft.scale };
            if (containsPt(rect)) frameId = fid;
        });

        // 5. Фон дорожки: Move в своей же дорожке либо Nest/Extract на её владельца
        if (sameOwner) return { ok: true, windowId, ownerId, isMove: true, ...(frameId ? { frameId } : {}) };
        if (!dragDropMode) return { ok: false, reason: 'dnd-off', windowId, ownerId };
        for (const id of dragged) {
            const verdict = HierarchyUtils.canReparentToV14(id, ownerId, nodes);
            if (!verdict.ok) return { ok: false, reason: verdict.reason, windowId, ownerId };
        }
        return { ok: true, windowId, ownerId, ...(frameId ? { frameId } : {}) };
    },

    /**
     * v14: связи, разложенные по ОКНАМ (не по глубине): связь межоконная в
     * окне W, если W показывает дорожку одного порта, а дорожка другого в W
     * НЕ показана — одна и та же связь может быть внутренней в одном окне и
     * межоконной в другом (дорожка-зеркало в нескольких окнах, §5 плана).
     * Заменяет getCrossLinksByLevel — новое имя, без временного суффикса.
     * @param {Object} state
     * @returns {Object<string, Array<{link:Object, isSource:boolean, myPort:Object, otherPort:Object, otherOwnerId:string}>>}
     */
    getLinksCrossingWindows: (state) => {
        if (!state || !state.links) return {};
        const nodes = state.nodes || {};
        const frames = state.frames || {};
        const windows = state.windows || {};
        const linksList = Array.isArray(state.links) ? state.links : Object.values(state.links || {});
        const byWindow = {};
        const push = (wid, entry) => { (byWindow[wid] || (byWindow[wid] = [])).push(entry); };

        const ownerOf = (hostId) => (nodes[hostId] && (nodes[hostId].parentId || 'root'))
            || (frames[hostId] && (frames[hostId].homeLaneId || 'root'))
            || null;

        linksList.forEach(link => {
            if (!link || !link.id) return;
            const sp = state.ports && state.ports[link.sourcePortId];
            const tp = state.ports && state.ports[link.targetPortId];
            if (!sp || !tp) return;
            const sOwner = ownerOf(sp.nodeId);
            const tOwner = ownerOf(tp.nodeId);
            if (!sOwner || !tOwner) return;
            const sWindows = HierarchyUtils.windowsOfLane(sOwner, windows).map(w => w.id);
            const tWindows = HierarchyUtils.windowsOfLane(tOwner, windows).map(w => w.id);
            sWindows.forEach(wid => {
                if (!tWindows.includes(wid)) push(wid, { link, isSource: true, myPort: sp, otherPort: tp, otherOwnerId: tOwner });
            });
            tWindows.forEach(wid => {
                if (!sWindows.includes(wid)) push(wid, { link, isSource: false, myPort: tp, otherPort: sp, otherOwnerId: sOwner });
            });
        });
        return byWindow;
    },

    /**
     * v14: межоконные связи конкретного окна, по id связи. Временное имя до
     * конца Фазы 4 (заменит getProxyIndexForWindow). Пиксельная геометрия
     * прокси-порта (framePos/viewportPos/worldPos) — задача Фазы 5, здесь
     * только индекс «какая связь пересекает какое окно и через какие порты».
     * @param {string} windowId
     * @param {Object} state
     * @returns {Object<string, Object>}
     */
    getProxyIndexForWindowV14: (windowId, state) => {
        const list = HierarchyUtils.getLinksCrossingWindows(state)[windowId] || [];
        const byLink = {};
        list.forEach(entry => { byLink[entry.link.id] = entry; });
        return byLink;
    },

    /**
     * v14 (Фаза 4, доп.): дорожка, в которой хост порта СЕЙЧАС фактически
     * отрисован — узел -> его собственный parentId; рамка -> кусок в её
     * homeLaneId, либо первый непустой (см. §4.2 LANES_MODEL.md, та же
     * эвристика, что и в getPortWorldPositionV14). Используется Lane.js/Link.js
     * для решения «этот порт — в моей дорожке?» без дублирования эвристики.
     * @param {string} portId
     * @param {Object} state
     * @returns {?string}
     */
    getPortHostOwnerId: (portId, state) => {
        const port = state.ports && state.ports[portId];
        if (!port) return null;
        const node = state.nodes && state.nodes[port.nodeId];
        if (node) return node.parentId || 'root';
        const frame = state.frames && state.frames[port.nodeId];
        if (!frame) return null;
        const nodes = state.nodes || {};
        const windows = state.windows || {};
        const homeLaneId = frame.homeLaneId || 'root';
        if (HierarchyUtils.fragmentRect(HierarchyUtils.windowsOfLane(homeLaneId, windows)[0], homeLaneId, frame.id, state)) return homeLaneId;
        return (frame.members || []).map(mid => nodes[mid] && (nodes[mid].parentId || 'root')).find(Boolean) || null;
    },

    /**
     * v14: печать состояния проекта в нотации §1 плана / §3 LANES_MODEL.md —
     * ДЕРЕВО/ОКНА/РАМКИ/СВЯЗИ. Формат реализован как ЧЕТЫРЕ ПОСЛЕДОВАТЕЛЬНЫХ
     * секции с заголовками (не визуальная 4-колоночная таблица из иллюстрации
     * плана — та рассчитана на чтение человеком в чате, а не на устойчивый
     * машинный парсинг; секции с заголовками несут ту же самую информацию и
     * надёжно парсятся обратно `parseNotation`). Имена узлов/рамок,
     * совпадающие у разных сущностей, разводятся суффиксом `#2`, `#3`...
     * @param {Object} state { nodes, frames, windows, ports, links }
     * @returns {string}
     */
    dumpNotation: (state) => {
        const nodes = (state && state.nodes) || {};
        const frames = (state && state.frames) || {};
        const windows = (state && state.windows) || {};
        const links = (state && state.links) || {};

        const displayOf = {};
        const used = {};
        Object.keys(nodes).forEach(id => {
            const n = nodes[id];
            if (!n) return;
            const base = n.name || id;
            used[base] = (used[base] || 0) + 1;
            displayOf[id] = used[base] === 1 ? base : `${base}#${used[base]}`;
        });
        const laneLabel = (ownerId) => {
            if (ownerId === 'root') return 'Проект';
            const hidden = false; // проставляется вызывающим контекстом окна ниже
            return displayOf[ownerId] || ownerId;
        };

        // ДЕРЕВО: обход в порядке следования в словаре nodes, «мама раньше детей».
        const byParent = HierarchyUtils.getChildrenByParent(nodes);
        const treeLines = [];
        const visit = (parentId) => {
            (byParent[parentId] || []).forEach(n => {
                const path = HierarchyUtils.getPath(n.id, nodes).map(id => displayOf[id] || id);
                treeLines.push('/' + path.join('/'));
                visit(n.id);
            });
        };
        visit('root');

        // ОКНА
        const windowLines = Object.entries(windows).map(([wid, w]) => {
            const lanes = (w.lanes || []).map(lid => ((w.hidden || []).includes(lid) ? '~' : '') + laneLabel(lid));
            const frameLabel = w.frameId ? `${displayOf[w.frameId] || w.frameId} ⊂ ` : '';
            return `${wid} = ${frameLabel}[${lanes.join(' | ')}]`;
        });

        // РАМКИ
        const frameLines = Object.entries(frames).map(([fid, f]) => {
            const members = (f.members || []).map(mid => displayOf[mid] || mid);
            return `${f.name || fid} = {${members.join(', ')}}`;
        });

        // СВЯЗИ
        const linksList = Array.isArray(links) ? links : Object.values(links || {});
        const linkLines = linksList.filter(Boolean).map(l => {
            const sp = state.ports && state.ports[l.sourcePortId];
            const tp = state.ports && state.ports[l.targetPortId];
            const srcHost = sp && (displayOf[sp.nodeId] || (frames[sp.nodeId] && frames[sp.nodeId].name) || sp.nodeId);
            const tgtHost = tp && (displayOf[tp.nodeId] || (frames[tp.nodeId] && frames[tp.nodeId].name) || tp.nodeId);
            return `${srcHost}.${(sp && sp.name) || (sp && sp.id)} -> ${tgtHost}.${(tp && tp.name) || (tp && tp.id)}`;
        });

        return [
            'ДЕРЕВО', ...treeLines, '',
            'ОКНА', ...windowLines, '',
            'РАМКИ', ...frameLines, '',
            'СВЯЗИ', ...linkLines
        ].join('\n');
    },

    /**
     * v14: разбор текста в нотации (см. dumpNotation) в v14-фикстуру
     * `{ nodes, frames, windows, ports, links }` — основной инструмент
     * построения тестовых состояний с Фазы 2 (вместо разметки JSON руками).
     * Требование к фикстурам: имена узлов уникальны В ПРЕДЕЛАХ короткой
     * ссылки — коллизии разводятся явным суффиксом `#2` в ОКНА/РАМКИ/СВЯЗИ,
     * симметрично тому, что генерирует dumpNotation.
     * @param {string} text
     * @returns {{nodes: Object, frames: Object, windows: Object, ports: Object, links: Object}}
     */
    parseNotation: (text) => {
        const nodes = {};
        const frames = {};
        const windows = {};
        const ports = {};
        const links = {};
        const idByDisplay = {};
        const frameIdByDisplay = {};
        const childCounters = {};
        const GRID_X = 260, GRID_Y = 160, PER_ROW = 5;

        const resolveNodeRef = (ref) => {
            const trimmed = ref.trim();
            if (idByDisplay[trimmed] !== undefined) return idByDisplay[trimmed];
            throw new Error(`parseNotation: неизвестный узел «${trimmed}»`);
        };
        const resolveFrameRef = (ref) => {
            const trimmed = ref.trim();
            if (frameIdByDisplay[trimmed] !== undefined) return frameIdByDisplay[trimmed];
            throw new Error(`parseNotation: неизвестная рамка «${trimmed}»`);
        };

        let section = null;
        let linkCounter = 0;
        let windowCounter = 0;
        const WINDOW_GAP_Y = 800;

        String(text || '').split('\n').forEach(rawLine => {
            const line = rawLine.trim();
            if (!line) return;
            if (line === 'ДЕРЕВО' || line === 'ОКНА' || line === 'РАМКИ' || line === 'СВЯЗИ') { section = line; return; }

            if (section === 'ДЕРЕВО') {
                if (!line.startsWith('/')) return;
                const segments = line.split('/').filter(Boolean);
                let parentId = 'root';
                let pathSoFar = '';
                segments.forEach(seg => {
                    pathSoFar += '/' + seg;
                    if (idByDisplay[pathSoFar] === undefined) {
                        let finalId = seg;
                        let suffix = 2;
                        while (nodes[finalId] && nodes[finalId].parentId !== parentId) {
                            finalId = `${seg}#${suffix}`; suffix++;
                        }
                        if (!nodes[finalId]) {
                            const idx = (childCounters[parentId] = (childCounters[parentId] || 0) + 1) - 1;
                            nodes[finalId] = {
                                id: finalId, name: seg, parentId,
                                position: { x: (idx % PER_ROW) * GRID_X, y: Math.floor(idx / PER_ROW) * GRID_Y },
                                size: { w: 200, h: 100 }
                            };
                        }
                        idByDisplay[pathSoFar] = finalId;
                        if (idByDisplay[seg] === undefined) idByDisplay[seg] = finalId;
                        else if (idByDisplay[seg] !== finalId && idByDisplay[finalId] === undefined) idByDisplay[finalId] = finalId;
                    }
                    parentId = idByDisplay[pathSoFar];
                });
                return;
            }

            if (section === 'РАМКИ') {
                const m = line.match(/^(.+?)\s*=\s*\{(.*)\}$/);
                if (!m) return;
                const [, frameName, membersRaw] = m;
                const trimmedName = frameName.trim();
                const members = membersRaw.split(',').map(s => s.trim()).filter(Boolean).map(resolveNodeRef);
                frames[trimmedName] = {
                    id: trimmedName, name: trimmedName, members,
                    homeLaneId: members.length ? (nodes[members[0]].parentId || 'root') : 'root'
                };
                frameIdByDisplay[trimmedName] = trimmedName;
                return;
            }

            if (section === 'ОКНА') {
                const m = line.match(/^(\S+)\s*=\s*(?:([^\[⊂]+?)\s*⊂\s*)?\[(.*)\]$/u);
                if (!m) return;
                const [, windowId, frameRef, laneListRaw] = m;
                const lanes = [];
                const hidden = [];
                laneListRaw.split('|').map(s => s.trim()).filter(Boolean).forEach(tok => {
                    const isHidden = tok.startsWith('~');
                    const label = isHidden ? tok.slice(1).trim() : tok;
                    const ownerId = (label === 'Проект' || label === 'root') ? 'root' : resolveNodeRef(label);
                    lanes.push(ownerId);
                    if (isHidden) hidden.push(ownerId);
                });
                windows[windowId] = {
                    id: windowId, lanes, hidden,
                    frameId: frameRef ? resolveFrameRef(frameRef) : null,
                    // Окна размещаются друг под другом (не накладываются) — сама
                    // нотация геометрию не несёт, это только для тестов, которым
                    // нужны различимые мировые прямоугольники окон.
                    position: { x: 0, y: windowCounter++ * WINDOW_GAP_Y }, size: { w: 1000, h: 700 },
                    camera: { offset: { x: 0, y: 0 }, zoom: 1 }, collapsed: false
                };
                return;
            }

            if (section === 'СВЯЗИ') {
                const m = line.match(/^(.+?)\.(\S+)\s*(?:->|→)\s*(.+?)\.(\S+)$/);
                if (!m) return;
                const [, srcRef, srcPortName, tgtRef, tgtPortName] = m;
                const srcNodeId = resolveNodeRef(srcRef);
                const tgtNodeId = resolveNodeRef(tgtRef);
                const srcPortId = `${srcNodeId}-${srcPortName}`;
                const tgtPortId = `${tgtNodeId}-${tgtPortName}`;
                if (!ports[srcPortId]) ports[srcPortId] = { id: srcPortId, nodeId: srcNodeId, type: 'output', edge: 'right', position: 0.5, name: srcPortName };
                if (!ports[tgtPortId]) ports[tgtPortId] = { id: tgtPortId, nodeId: tgtNodeId, type: 'input', edge: 'left', position: 0.5, name: tgtPortName };
                const linkId = `link-${++linkCounter}`;
                links[linkId] = { id: linkId, sourcePortId: srcPortId, targetPortId: tgtPortId };
                return;
            }
        });

        return { nodes, frames, windows, ports, links };
    }
});

if (typeof window !== 'undefined') window.HierarchyUtils = HierarchyUtils;
if (typeof module !== 'undefined') module.exports = HierarchyUtils;
