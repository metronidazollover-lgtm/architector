// Чистая логика состояния: defaultState, редьюсер, загрузка из localStorage.
// Без JSX и React: файл исполняется и в браузере (text/babel), и в Node для тестов.
// Двойной экспорт в конце файла.

const STORAGE_KEY = 'architector_state_v11';
const LEGACY_STORAGE_KEY_V10 = 'architector_state_v10';
const LEGACY_STORAGE_KEY_V9 = 'architector_state_v9';
const FORMAT_VERSION = 11;
const FORMAT_VERSION_V10 = 10;

// Стабильный id окна главного холста. Номер уровня — поле levelIndex,
// а не ключ словаря, поэтому перенумерация не переписывает ссылки.
const LEVEL0_WINDOW_ID = 'lvlwin-root';
const newWindowId = () => 'lvlwin-' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);

// Доступ к окружению с оглядкой на Node (node:test): в браузере — window,
// в тестах — global-заглушки или дефолты.
const getGeometry = () =>
    (typeof window !== 'undefined' && window.GeometryUtils) ? window.GeometryUtils :
    (typeof global !== 'undefined' && global.GeometryUtils) ? global.GeometryUtils : null;

const getHierarchy = () =>
    (typeof window !== 'undefined' && window.HierarchyUtils) ? window.HierarchyUtils :
    (typeof global !== 'undefined' && global.HierarchyUtils) ? global.HierarchyUtils :
    (typeof module !== 'undefined' && typeof require !== 'undefined') ? require('../utils/hierarchy.js') : null;

// Мировая точка порта — через единое координатное ядро (учитывает окно уровня).
const getPortAbs = (port, node, state) => {
    const H = getHierarchy();
    const world = H.getPortWorldPosition(port.id, state);
    if (world) return { x: world.x, y: world.y, edge: port.edge };
    const local = H.getLocalPosition(node.id, state.nodes, state.layers);
    return getGeometry().getPortAbsolutePosition(port, node, local);
};

// Миграция формата сохранений: v9 хранил все позиции в мировых координатах,
// v10 хранит позиции детей относительно родителя.
const migrateToV10 = (data) => {
    if (!data || (data.formatVersion || 9) >= FORMAT_VERSION_V10) return data;
    const oldNodes = data.nodes || {};
    const oldLayers = data.layers || {};

    const parentPos = (parentId) => {
        if (!parentId || parentId === 'root') return null;
        const parent = oldNodes[parentId] || oldLayers[parentId];
        return (parent && parent.position) ? parent.position : null;
    };
    const convert = (entity) => {
        if (!entity || !entity.position) return entity;
        const pp = parentPos(entity.parentId);
        if (!pp) return entity;
        return { ...entity, position: { x: entity.position.x - pp.x, y: entity.position.y - pp.y } };
    };

    const nodes = {};
    Object.entries(oldNodes).forEach(([key, n]) => { nodes[key] = convert(n); });
    const layers = {};
    Object.entries(oldLayers).forEach(([key, l]) => { layers[key] = convert(l); });

    return {
        ...data,
        nodes,
        layers,
        past: [],
        future: [],
        historyLogs: ['Проект сконвертирован в формат v10 (относительные координаты)'],
        formatVersion: FORMAT_VERSION_V10
    };
};

const getScreenSize = () =>
    (typeof window !== 'undefined') ? { w: window.innerWidth, h: window.innerHeight } : { w: 1280, h: 720 };

const estimateWrappedLines = (text, charsPerLine) => {
    if (!text) return 0;
    const paragraphs = text.split('\n');
    let totalLines = 0;
    paragraphs.forEach(p => {
        const words = p.split(/\s+/).filter(Boolean);
        if (words.length === 0) {
            totalLines += 1;
            return;
        }
        let currentLineLen = 0;
        let pLines = 1;
        words.forEach(word => {
            const wordLen = word.length;
            if (wordLen > charsPerLine) {
                pLines += Math.ceil(wordLen / charsPerLine) - 1;
                currentLineLen = wordLen % charsPerLine;
            } else {
                if (currentLineLen + (currentLineLen > 0 ? 1 : 0) + wordLen > charsPerLine) {
                    pLines += 1;
                    currentLineLen = wordLen;
                } else {
                    currentLineLen += (currentLineLen > 0 ? 1 : 0) + wordLen;
                }
            }
        });
        totalLines += pLines;
    });
    return totalLines;
};

const calculateNodeSize = (name, content, mediaUrl, mediaHeight, fontSize, fontFamily) => {
    const safeName = name || '';
    const safeContent = content || '';
    const textLength = safeName.length + safeContent.length;
    const fSize = fontSize || 14;

    // Base dimensions for empty node
    const baseW = 200;
    const baseH = Math.max(70, Math.round(fSize * 2.5 + 40));

    // Width scales with text length from 200 up to A4 width (794px)
    const maxA4Width = 794;
    const nameCharW = (fSize / 14) * 9.5;
    const nameEstimatedW = safeName.length > 0 ? Math.round(safeName.length * nameCharW + 75) : 0;
    let w = Math.max(baseW + textLength * 0.5 * (fSize / 14), nameEstimatedW);
    if (w > maxA4Width) w = maxA4Width;

    // If there is an image, make sure width is at least 300px
    if (mediaUrl && w < 300) {
        w = 300;
    }

    // Calculate height needed for header if name wraps to multiple lines at this width `w`
    const nameCharsPerLine = Math.max(8, Math.floor((w - 75) / nameCharW));
    const nameLines = estimateWrappedLines(safeName, nameCharsPerLine);
    const nameLineHeight = Math.round(fSize * 1.35);
    const headerHeight = Math.max(Math.round(fSize * 1.4 + 14), 12 + nameLines * nameLineHeight);

    // Calculate height needed to fit text vertically at this width `w`
    const bodyCharW = (fSize / 14) * 7.8;
    const charsPerLine = Math.max(8, Math.floor((w - 20) / bodyCharW));
    const estimatedLines = estimateWrappedLines(safeContent, charsPerLine);
    const textMinH = estimatedLines * nameLineHeight;

    let h = headerHeight + 20;
    if (mediaUrl) {
        h += (mediaHeight || 150);
    }
    if (safeContent) {
        h += textMinH;
    }
    if (mediaUrl && safeContent) {
        h += 10;
    }

    if (!safeContent && !mediaUrl && h < baseH) {
        h = baseH;
    }
    if (h < 53) {
        h = 53;
    }

    return {
        w: Math.round(w),
        h: Math.round(h)
    };
};

const LEVEL_WINDOW_DEFAULT_SIZE = { w: 1000, h: 700 };
const LEVEL_WINDOW_GAP = 80;

const makeLevelWindow = (id, levelIndex, overrides = {}) => ({
    id,
    levelIndex,
    name: 'New level',
    content: '',
    color: levelIndex === 0 ? '#1e293b' : (levelIndex === 1 ? '#0f172a' : '#1e1b4b'),
    position: { x: -500, y: -400 + levelIndex * (LEVEL_WINDOW_DEFAULT_SIZE.h + LEVEL_WINDOW_GAP) },
    size: { w: LEVEL_WINDOW_DEFAULT_SIZE.w, h: LEVEL_WINDOW_DEFAULT_SIZE.h },
    fontFamily: 'Inter, sans-serif',
    fontSize: 14,
    ...overrides
});

const makeLevelView = (overrides = {}) => ({
    innerOffset: (overrides.innerOffset) || { x: 0, y: 0 },
    innerZoom: (overrides.innerZoom !== undefined && overrides.innerZoom !== null) ? overrides.innerZoom : 1,
    isCollapsed: !!overrides.isCollapsed
});

// Якорь «колонки» окон проекта: x и верх верхнего окна (минимальный levelIndex)
// плюс нижняя кромка самого нижнего окна. При мультипроекте (v12) окна разных
// проектов стоят в разных местах общего холста, поэтому новые окна и
// выравнивание НЕЛЬЗЯ прибивать к жёсткому x = -500 — только к собственной
// колонке проекта. Без окон возвращаются прежние дефолты.
const projectWindowAnchor = (windows) => {
    const list = Object.values(windows || {}).filter(Boolean);
    if (!list.length) return { x: -500, topY: -400, bottomY: -400 - LEVEL_WINDOW_GAP };
    let x = -500, topY = -400, bottomY = -Infinity, topLevel = Infinity;
    list.forEach(w => {
        const px = (w.position && w.position.x !== undefined) ? w.position.x : -500;
        const py = (w.position && w.position.y !== undefined) ? w.position.y : -400;
        const h = (w.size && w.size.h) || LEVEL_WINDOW_DEFAULT_SIZE.h;
        const lvl = w.levelIndex || 0;
        if (lvl < topLevel) { topLevel = lvl; x = px; topY = py; }
        if (py + h > bottomY) bottomY = py + h;
    });
    return { x, topY, bottomY };
};

const defaultLevelWindows = { [LEVEL0_WINDOW_ID]: makeLevelWindow(LEVEL0_WINDOW_ID, 0) };
const defaultLevelViews = { [LEVEL0_WINDOW_ID]: makeLevelView() };

/**
 * Инвариант: для каждого уровня 0..maxLevel существует ровно одно окно,
 * и у каждого окна есть запись камеры. Инвариант ВОССТАНАВЛИВАЕТСЯ, а не
 * предполагается: окно может создать любой экшен, а старый файл может не
 * содержать окон вовсе.
 */
const normalizeLevelWindows = (rawWindows, nodes, layers, rawViews) => {
    const H = getHierarchy();
    const windows = {};
    const views = { ...(rawViews || {}) };

    Object.entries(rawWindows || {}).forEach(([key, win]) => {
        if (!win) return;
        const isNumericKey = /^\d+$/.test(String(key));
        const levelIndex = win.levelIndex != null ? win.levelIndex : (win.index != null ? win.index : Number(key));
        const finalId = win.id || (isNumericKey ? (levelIndex === 0 ? LEVEL0_WINDOW_ID : 'lvlwin-lvl' + levelIndex) : key);

        const frame = { ...win };
        const camera = {
            innerOffset: frame.innerOffset,
            innerZoom: frame.innerZoom,
            isCollapsed: frame.isCollapsed
        };
        delete frame.innerOffset;
        delete frame.innerZoom;
        delete frame.isCollapsed;
        delete frame.index;

        windows[finalId] = { ...frame, id: finalId, levelIndex };
        if (!views[finalId]) views[finalId] = makeLevelView(camera);
    });

    const byLevel = {};
    Object.values(windows).forEach(w => { byLevel[w.levelIndex] = w; });

    const maxLevel = (H && H.getMaxProjectLevel) ? H.getMaxProjectLevel(nodes, layers) : 0;
    const existingLevels = Object.keys(byLevel).map(Number);
    const topLevel = Math.max(maxLevel, existingLevels.length ? Math.max(...existingLevels) : 0, 0);

    // Авто-созданные окна встают в колонку СУЩЕСТВУЮЩИХ окон проекта (если
    // они есть) — при мультипроекте жёсткий x=-500 увёл бы их в чужую колонку
    const hadWindows = Object.keys(windows).length > 0;
    const anchor = projectWindowAnchor(windows);
    let autoCursorY = anchor.bottomY + LEVEL_WINDOW_GAP;
    for (let lvl = 0; lvl <= topLevel; lvl++) {
        if (!byLevel[lvl]) {
            const id = lvl === 0 ? LEVEL0_WINDOW_ID : newWindowId();
            windows[id] = hadWindows
                ? makeLevelWindow(id, lvl, { position: { x: anchor.x, y: autoCursorY } })
                : makeLevelWindow(id, lvl);
            if (hadWindows) autoCursorY += (windows[id].size.h || LEVEL_WINDOW_DEFAULT_SIZE.h) + LEVEL_WINDOW_GAP;
            byLevel[lvl] = windows[id];
        }
        const id = byLevel[lvl].id;
        if (!views[id]) views[id] = makeLevelView();
    }

    // Камеры окон, которых больше нет, не должны копиться
    Object.keys(views).forEach(id => { if (!windows[id]) delete views[id]; });

    return { levelWindows: windows, levelViews: views };
};

/**
 * Миграция v10 -> v11.
 *
 * Различаются ДВА исходных формата, оба помеченные formatVersion: 10:
 *   - «гибрид» (сборка с окнами): есть ключ levelWindows, позиции сущностей уже
 *     локальны для своего уровня — координаты не трогаются вовсе;
 *   - «legacy v10»: окон нет, позиция ребёнка задана относительно родительского
 *     УЗЛА, поэтому координаты пересчитываются в локальные для уровня.
 * Перепутать ветви — значит сдвинуть весь граф, поэтому различитель явный.
 */
const migrateToV11 = (data) => {
    if (!data || (data.formatVersion || 0) >= FORMAT_VERSION) return data;

    const H = getHierarchy();
    const srcNodes = data.nodes || {};
    const srcLayers = data.layers || {};
    const isHybrid = !!data.levelWindows;

    const nodes = {};
    const layers = {};
    let working = data;

    if (isHybrid) {
        // Координаты уже локальные: расщепляем parentId на контейнер и владельца.
        const split = (e) => {
            if (!e) return e;
            const pid = e.parentId;
            if (pid && pid !== 'root' && srcNodes[pid]) {
                return { ...e, parentId: 'root', ownerId: pid };
            }
            return { ...e, ownerId: e.ownerId || null };
        };
        Object.entries(srcNodes).forEach(([k, n]) => { nodes[k] = split(n); });
        Object.entries(srcLayers).forEach(([k, l]) => { layers[k] = split(l); });
    } else {
        // Legacy v10: раскладываем по уровням и переводим координаты в локальные.
        const levelOf = (id) => {
            let level = 0;
            let cur = srcNodes[id] || srcLayers[id];
            const seen = new Set();
            while (cur && !seen.has(cur.id)) {
                seen.add(cur.id);
                const pid = cur.parentId;
                if (!pid || pid === 'root') break;
                if (srcNodes[pid]) { level++; cur = srcNodes[pid]; }
                else if (srcLayers[pid]) { cur = srcLayers[pid]; }
                else break;
            }
            return level;
        };

        const rawSum = (id) => (H && H.getRawChainSum)
            ? H.getRawChainSum(id, srcNodes, srcLayers)
            : ((srcNodes[id] || srcLayers[id] || {}).position || { x: 0, y: 0 });

        // Габарит содержимого каждого уровня в старых мировых координатах
        const bounds = {};
        const consider = (e, defW, defH) => {
            if (!e) return;
            const lvl = levelOf(e.id);
            const abs = rawSum(e.id);
            const w = (e.size && e.size.w) || defW;
            const h = (e.size && e.size.h) || defH;
            const b = bounds[lvl] || (bounds[lvl] = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
            b.minX = Math.min(b.minX, abs.x);
            b.minY = Math.min(b.minY, abs.y);
            b.maxX = Math.max(b.maxX, abs.x + w);
            b.maxY = Math.max(b.maxY, abs.y + h);
        };
        Object.values(srcNodes).forEach(n => consider(n, 200, 100));
        Object.values(srcLayers).forEach(l => consider(l, 600, 400));

        const PAD = 80;
        const localOf = (e) => {
            const lvl = levelOf(e.id);
            const b = bounds[lvl];
            const abs = rawSum(e.id);
            if (!b) return { x: abs.x, y: abs.y };
            return { x: abs.x - b.minX + PAD, y: abs.y - b.minY + PAD };
        };

        const convert = (e) => {
            if (!e) return e;
            const pid = e.parentId;
            const insideLayer = pid && pid !== 'root' && srcLayers[pid];
            const ownerId = (pid && pid !== 'root' && srcNodes[pid]) ? pid : null;
            // Внутри слоя позиция и дальше остаётся относительной к слою
            if (insideLayer) return { ...e, ownerId: null };
            return { ...e, parentId: 'root', ownerId, position: localOf(e) };
        };

        Object.entries(srcNodes).forEach(([k, n]) => { nodes[k] = convert(n); });
        Object.entries(srcLayers).forEach(([k, l]) => { layers[k] = convert(l); });

        // Рамка окна подгоняется под содержимое уровня, чтобы ничего не обрезалось
        const wins = {};
        Object.keys(bounds).map(Number).sort((a, b) => a - b).forEach(lvl => {
            const b = bounds[lvl];
            const id = lvl === 0 ? LEVEL0_WINDOW_ID : newWindowId();
            const w = Math.max(LEVEL_WINDOW_DEFAULT_SIZE.w, Math.round(b.maxX - b.minX) + PAD * 2);
            const h = Math.max(LEVEL_WINDOW_DEFAULT_SIZE.h, Math.round(b.maxY - b.minY) + PAD * 2 + 40);
            wins[id] = makeLevelWindow(id, lvl, { size: { w: w, h: h } });
        });
        let cursorY = -400;
        Object.values(wins).sort((a, b) => a.levelIndex - b.levelIndex).forEach(w => {
            w.position = { x: -500, y: cursorY };
            cursorY += w.size.h + LEVEL_WINDOW_GAP;
        });
        working = { ...data, levelWindows: wins, levelViews: null };
    }

    const normalized = normalizeLevelWindows(working.levelWindows, nodes, layers, working.levelViews);

    return {
        ...working,
        nodes,
        layers,
        levelWindows: normalized.levelWindows,
        levelViews: normalized.levelViews,
        past: [],
        future: [],
        historyLogs: [isHybrid
            ? 'Проект сконвертирован в формат v11 (расщепление parentId/ownerId)'
            : 'Проект сконвертирован в формат v11 (раскладка по окнам уровней)'],
        formatVersion: FORMAT_VERSION
    };
};

/**
 * Инвариант модели v11: parentId — это КОНТЕЙНЕР ('root' или слой) и никогда не узел.
 * Указатель на узел означает семантическое владение и переезжает в ownerId.
 * Нормализация живёт в одном месте: её проходят и тулбар, и ИИ-агент, и импорт,
 * поэтому ни один путь создания сущности не может завести «узел внутри узла».
 */
const normalizeContainer = (entity, nodes) => {
    if (!entity) return entity;
    const pid = entity.parentId;
    if (pid && pid !== 'root' && nodes && nodes[pid]) {
        return { ...entity, parentId: 'root', ownerId: pid };
    }
    return { ...entity, parentId: pid || 'root', ownerId: entity.ownerId || null };
};

/**
 * Наведение на сущность внутри окна уровня.
 *
 * У каждого окна своя камера, поэтому одного мирового центрирования мало: если
 * сущность выехала за видимую область вьюпорта, она обрезана рамкой, и мировая
 * камера прилетит на математически верную, но визуально пустую точку.
 * Сначала двигаем ВНУТРЕННЮЮ камеру окна, потом мировую.
 *
 * @param {Object} state
 * @param {string} id
 * @returns {?{ levelViews: Object, center: {x:number,y:number}, size: {w:number,h:number} }}
 */
const focusEntityInsideWindow = (state, id) => {
    const H = getHierarchy();
    if (!H) return null;
    const entity = state.nodes[id] || (state.layers && state.layers[id]);
    if (!entity) return null;

    const level = H.getLevel(id, state.nodes, state.layers);
    const win = H.getWindowOfLevel(level, state.levelWindows);
    if (!win) return null;

    const view = H.getLevelView(win.id, state);
    const { headerH, borderW } = H.LEVEL_WINDOW_METRICS;

    const local = H.getLocalPosition(id, state.nodes, state.layers);
    const isLayer = !!(state.layers && state.layers[id]);
    const w = (entity.size && entity.size.w) || (isLayer ? 600 : 200);
    const h = (entity.size && entity.size.h) || (isLayer ? 400 : 100);

    // Видимая область вьюпорта окна (в экранных единицах мирового холста)
    const viewportW = Math.max(1, (win.size?.w || 1000) - borderW * 2);
    const viewportH = Math.max(1, Math.max(200, (win.size?.h || 700) - headerH) );

    const zoomIn = view.innerZoom || 1;
    const centerLocal = { x: local.x + w / 2, y: local.y + h / 2 };

    // Такой сдвиг вьюпорта, при котором центр сущности попадает в центр окна
    const innerOffset = {
        x: viewportW / 2 - centerLocal.x * zoomIn,
        y: viewportH / 2 - centerLocal.y * zoomIn
    };

    const levelViews = {
        ...state.levelViews,
        [win.id]: { ...makeLevelView(state.levelViews && state.levelViews[win.id]), innerOffset }
    };

    // После сдвига центр сущности гарантированно в центре видимой области окна
    return {
        levelViews,
        center: {
            x: (win.position?.x || 0) + borderW + viewportW / 2,
            y: (win.position?.y || 0) + borderW + headerH + viewportH / 2
        },
        size: { w: w * zoomIn, h: h * zoomIn }
    };
};

// Окно по стабильному id либо по номеру уровня (легаси-вызовы из компонентов).
const resolveWindow = (state, key) => {
    if (key === undefined || key === null) return null;
    const wins = state.levelWindows || {};
    if (wins[key]) return wins[key];
    const num = Number(key);
    if (Number.isNaN(num)) return null;
    return Object.values(wins).find(w => w && w.levelIndex === num) || null;
};

// Пересчёт фокус-наборов веток из текущего выделения.
// Уровень 0: фокус-корни = выделенные корневые сущности (их ветки просвечивает
// глобальный глаз на всех уровнях). Уровень N>=1: фокус = владельцы выделенных
// детей (мульти-выделение с разными родителями даёт несколько веток).
// Уровни, не затронутые выделением, сохраняют прежние наборы — ветка «прилипает»
// и остаётся рабочей после снятия выделения.
const withSelectionFocus = (state, selectedIds) => {
    const H = getHierarchy();
    if (!H || !selectedIds || selectedIds.length === 0) return {};
    const byLevel = {};
    selectedIds.forEach(id => {
        const entity = (state.nodes && state.nodes[id]) || (state.layers && state.layers[id]);
        if (!entity) return; // окна, связи, порты фокус не задают
        const lvl = H.getEntityLevel(id, state.nodes, state.layers);
        if (lvl === 0) {
            (byLevel[0] = byLevel[0] || new Set()).add(id);
        } else {
            const owner = H.getBranchOwner ? H.getBranchOwner(id, state.nodes, state.layers) : null;
            if (owner) (byLevel[lvl] = byLevel[lvl] || new Set()).add(owner);
        }
    });
    if (Object.keys(byLevel).length === 0) return {};
    const next = { ...state.levelFocusParentId };
    Object.entries(byLevel).forEach(([lvl, set]) => {
        const owners = Array.from(set);
        // Стабильный обзор: пока глаз этого уровня включён, выделение УЖЕ
        // видимой ветки (владельцы — подмножество текущего набора) набор не
        // сужает — иначе вторая ветка исчезала бы с экрана прямо под руками.
        // Сузить набор можно, переключив глаз при новом выделении, или выделив
        // сущность вне видимых веток (тогда набор переписывается).
        const eyeOn = state.levelHideNeighbors && state.levelHideNeighbors[lvl];
        const current = H.toFocusList ? H.toFocusList(next[lvl]) : [];
        if (eyeOn && current.length > 0 && owners.every(o => current.includes(o))) {
            return;
        }
        next[lvl] = owners;
    });
    return { levelFocusParentId: next };
};

// Обновление камеры окна. Камера живёт вне снапшотов истории (как state.canvas),
// поэтому Undo структурных правок не сбрасывает панораму и зум.
const withLevelView = (state, winId, patch) => ({
    ...state,
    levelViews: {
        ...state.levelViews,
        [winId]: { ...makeLevelView(state.levelViews && state.levelViews[winId]), ...patch }
    }
});

// Внутреннее содержимое окна доступно не по всей рамке: сверху шапка,
// по периметру рамка-бордер. Тот же расчёт, что и getWorldTransform.
const getWindowContentArea = (win) => {
    const H = getHierarchy();
    const { headerH, borderW } = (H && H.LEVEL_WINDOW_METRICS) || { headerH: 40, borderW: 2 };
    const size = (win && win.size) || LEVEL_WINDOW_DEFAULT_SIZE;
    return {
        w: Math.max(1, size.w - borderW * 2),
        h: Math.max(1, size.h - borderW * 2 - headerH),
        headerH,
        borderW
    };
};

// Двойной клик «показать связанные элементы» (FOCUS_CONNECTED_ELEMENTS):
// узел/порт/связь/слой + всё, что с ним напрямую соединено связями, должны
// поместиться на экране одновременно. Свёрнутые окна разворачиваются, у
// каждого затронутого окна подбирается свой innerOffset/innerZoom под ЕГО
// часть набора, а общая камера (state.canvas) — под мировые рамки всех
// затронутых окон сразу. Позиции и размеры окон не трогаются (см. план):
// это отдельная, более инвазивная мера на случай, если окна физически
// перекрываются — пока не реализована.
//
// Сессия фокуса: первый вызов подряд снимает снимок текущей камеры/окон в
// state.focusSnapshot, если он ещё не взят — повторные двойные клики, пока
// пользователь не кликнул в пустое место, лишь расширяют/подстраивают вид,
// но откат (SET_SELECTED payload=null) всегда возвращает к состоянию ДО
// самого первого клика этой серии.
const applyFocusConnectedElements = (state, payload) => {
    const H = getHierarchy();
    if (!H) return state;
    const entityId = payload.entityId;
    if (!entityId) return state;

    const nodes = state.nodes || {};
    const ports = state.ports || {};
    const links = state.links || {};
    const layers = state.layers || {};

    const portsByNode = H.getPortsByNodeId(ports);
    const linksByPort = H.getLinksByPortId(links);
    const nodesByParent = H.getNodesByParentId(nodes);
    const layersByParent = H.getLayersByParentId(layers);

    const entityIds = new Set();
    const addNeighborsOfPort = (portId) => {
        (linksByPort[portId] || []).forEach(l => {
            if (!l) return;
            const otherPortId = l.sourcePortId === portId ? l.targetPortId : l.sourcePortId;
            const otherPort = ports[otherPortId];
            if (otherPort && otherPort.nodeId) entityIds.add(otherPort.nodeId);
        });
    };
    const addEntityAndNeighbors = (eid) => {
        if (!eid || (!nodes[eid] && !layers[eid])) return;
        entityIds.add(eid);
        (portsByNode[eid] || []).forEach(p => addNeighborsOfPort(p.id));
    };

    let anchorLayerId = null;

    if (nodes[entityId]) {
        addEntityAndNeighbors(entityId);
    } else if (ports[entityId]) {
        const port = ports[entityId];
        if (port.nodeId) addEntityAndNeighbors(port.nodeId);
        addNeighborsOfPort(entityId);
    } else if (links[entityId]) {
        const link = links[entityId];
        const sp = ports[link.sourcePortId];
        const tp = ports[link.targetPortId];
        if (sp && sp.nodeId) addEntityAndNeighbors(sp.nodeId);
        if (tp && tp.nodeId) addEntityAndNeighbors(tp.nodeId);
    } else if (layers[entityId]) {
        anchorLayerId = entityId;
        addEntityAndNeighbors(entityId);
        const stack = [entityId];
        const seenLayers = new Set();
        while (stack.length) {
            const lid = stack.pop();
            if (seenLayers.has(lid)) continue;
            seenLayers.add(lid);
            addEntityAndNeighbors(lid);
            (nodesByParent[lid] || []).forEach(n => addEntityAndNeighbors(n.id));
            (layersByParent[lid] || []).forEach(l => stack.push(l.id));
        }
    } else {
        return state; // окно уровня, неизвестный id — фокусировать нечего
    }

    // Скрытые изоляцией («глаз») узлы и слои не разворачиваем и не показываем —
    // они и так невидимы, как и их магистральные связи (см. Canvas.js).
    const isVisible = (id) => (H.isEntityVisible ? H.isEntityVisible(id, state) : true);
    const focusIds = Array.from(entityIds).filter(isVisible);
    if (anchorLayerId && isVisible(anchorLayerId) && !focusIds.includes(anchorLayerId)) focusIds.push(anchorLayerId);
    if (focusIds.length === 0) return state;

    // Группировка по окну уровня: у каждого окна — свой набор id, свой bbox.
    const idsByWindow = new Map();
    const winById = new Map();
    focusIds.forEach(id => {
        const lvl = H.getEntityLevel(id, nodes, layers);
        const win = H.getWindowOfLevel(lvl, state.levelWindows);
        if (!win) return;
        if (!idsByWindow.has(win.id)) idsByWindow.set(win.id, []);
        idsByWindow.get(win.id).push(id);
        winById.set(win.id, win);
    });
    if (idsByWindow.size === 0) return state;

    // Снимок «до фокуса» берём один раз за сессию (пока не откатили кликом
    // по пустому месту) — повторные двойные клики его не перезаписывают.
    const isFirstFocusInSession = !state.focusSnapshot;
    const snapshotWindows = isFirstFocusInSession ? {} : { ...state.focusSnapshot.windows };

    const nextViews = { ...state.levelViews };
    const MIN_ZOOM = 0.2, MAX_FIT_ZOOM = 1.2, PADDING = 60;

    idsByWindow.forEach((ids, winId) => {
        const win = winById.get(winId);
        const prevView = H.getLevelView(winId, state);

        if (isFirstFocusInSession && !snapshotWindows[winId]) {
            snapshotWindows[winId] = {
                isCollapsed: prevView.isCollapsed,
                innerOffset: prevView.innerOffset,
                innerZoom: prevView.innerZoom
            };
        }

        // Bbox в ЛОКАЛЬНЫХ координатах окна (без учёта текущих innerZoom/
        // innerOffset — их как раз предстоит подобрать заново).
        let bbox = null;
        ids.forEach(id => {
            const local = H.getLocalPosition(id, nodes, layers);
            const entity = nodes[id] || layers[id];
            const w = (entity && entity.size && entity.size.w) || (nodes[id] ? 200 : 600);
            const h = (entity && entity.size && entity.size.h) || (nodes[id] ? 100 : 400);
            if (!bbox) bbox = { minX: local.x, minY: local.y, maxX: local.x + w, maxY: local.y + h };
            else {
                bbox.minX = Math.min(bbox.minX, local.x);
                bbox.minY = Math.min(bbox.minY, local.y);
                bbox.maxX = Math.max(bbox.maxX, local.x + w);
                bbox.maxY = Math.max(bbox.maxY, local.y + h);
            }
        });
        if (!bbox) return;

        const area = getWindowContentArea(win);
        const bboxW = Math.max(1, bbox.maxX - bbox.minX);
        const bboxH = Math.max(1, bbox.maxY - bbox.minY);
        const availW = Math.max(1, area.w - PADDING * 2);
        const availH = Math.max(1, area.h - PADDING * 2);

        const fitZoom = Math.min(availW / bboxW, availH / bboxH);
        const innerZoom = Math.min(Math.max(fitZoom, MIN_ZOOM), MAX_FIT_ZOOM);

        const bboxCX = (bbox.minX + bbox.maxX) / 2;
        const bboxCY = (bbox.minY + bbox.maxY) / 2;
        const innerOffset = {
            x: area.w / 2 - bboxCX * innerZoom,
            y: area.h / 2 - bboxCY * innerZoom
        };

        nextViews[winId] = { ...makeLevelView(nextViews[winId]), isCollapsed: false, innerZoom, innerOffset };
    });

    // Общая камера: мировые рамки ВСЕХ затронутых окон (после разворачивания)
    // должны поместиться на экране одновременно.
    let worldBox = null;
    idsByWindow.forEach((_ids, winId) => {
        const win = winById.get(winId);
        if (!win || !win.position || !win.size) return;
        const x0 = win.position.x, y0 = win.position.y;
        const x1 = x0 + win.size.w, y1 = y0 + win.size.h;
        if (!worldBox) worldBox = { minX: x0, minY: y0, maxX: x1, maxY: y1 };
        else {
            worldBox.minX = Math.min(worldBox.minX, x0);
            worldBox.minY = Math.min(worldBox.minY, y0);
            worldBox.maxX = Math.max(worldBox.maxX, x1);
            worldBox.maxY = Math.max(worldBox.maxY, y1);
        }
    });

    let nextCanvas = state.canvas;
    if (worldBox) {
        const { w: screenW, h: screenH } = getScreenSize();
        const CAM_MIN_ZOOM = 0.1, CAM_MAX_FIT_ZOOM = 1.5, CAM_PADDING = 80;
        const boxW = Math.max(1, worldBox.maxX - worldBox.minX);
        const boxH = Math.max(1, worldBox.maxY - worldBox.minY);
        const availW = Math.max(1, screenW - CAM_PADDING * 2);
        const availH = Math.max(1, screenH - CAM_PADDING * 2);
        const fitZoom = Math.min(availW / boxW, availH / boxH);
        const zoom = Math.min(Math.max(fitZoom, CAM_MIN_ZOOM), CAM_MAX_FIT_ZOOM);
        const cx = (worldBox.minX + worldBox.maxX) / 2;
        const cy = (worldBox.minY + worldBox.maxY) / 2;
        nextCanvas = {
            ...state.canvas,
            offset: { x: screenW / 2 - cx * zoom, y: screenH / 2 - cy * zoom },
            zoom
        };
    }

    const focusSnapshot = isFirstFocusInSession
        ? { camera: { offset: state.canvas.offset, zoom: state.canvas.zoom }, windows: snapshotWindows }
        : state.focusSnapshot;

    // Камера — состояние обзора, не данных: как и её обычное перемещение,
    // это не пишет историю Undo.
    return {
        ...state,
        levelViews: nextViews,
        canvas: nextCanvas,
        focusSnapshot
    };
};

// Откат к виду ДО серии двойных кликов «показать связанные элементы».
// Вызывается из SET_SELECTED при явном сбросе выделения (клик по пустому
// месту, Esc) — см. её case ниже.
const revertFocusSnapshot = (state) => {
    const snap = state.focusSnapshot;
    if (!snap) return {};
    const nextViews = { ...state.levelViews };
    Object.entries(snap.windows || {}).forEach(([winId, saved]) => {
        if (!nextViews[winId]) return; // окно могло быть удалено за это время
        nextViews[winId] = { ...makeLevelView(nextViews[winId]), ...saved };
    });
    return {
        levelViews: nextViews,
        canvas: snap.camera ? { ...state.canvas, ...snap.camera } : state.canvas,
        focusSnapshot: null
    };
};

const defaultState = {
    projectName: 'Проект Архитектуры',
    projectColor: '#0f172a',
    projectFontFamily: 'Inter, sans-serif',
    projectContent: '',
    levelWindows: defaultLevelWindows,
    levelViews: defaultLevelViews,
    activeLevelIndex: 0,
    levelFocusParentId: {},
    levelHideNeighbors: {},
    layers: {},
    nodes: {},
    ports: {},
    links: {},
    selectedIds: [],
    isolatedIds: [],
    interactionMode: 'default',
    pendingConnection: null,
    // Текущий жест перетаскивания (Drag&Drop): { ids, target } либо null.
    // Живёт вне истории и вне сохранений — сбрасывается при любой загрузке.
    dragGesture: null,
    // Снимок камеры и окон ДО первого двойного клика «показать связанные
    // элементы» (FOCUS_CONNECTED_ELEMENTS) в текущей сессии фокуса. Клик по
    // пустому месту (SET_SELECTED с payload=null) откатывает к этому снимку
    // и обнуляет поле. Живёт вне истории Undo — это состояние обзора, а не
    // данных (как и camera/dragGesture).
    focusSnapshot: null,
    canvas: {
        offset: { x: -30, y: -50 },
        zoom: 0.65
    },
    ui: {
        libraryOpen: false,
        libraryTab: 'objects',
        // v12: открытые обозреватели по проектам { [projectId]: true }
        outlinerOpen: {},
        // Режим Drag&Drop: межуровневые переносы и вложения жестом доступны
        // только при включённом тумблере. При загрузке ВСЕГДА выключен.
        dragDropMode: false,
        aiAgentOpen: false,
        aiAgentSettings: {
            apiKey: '',
            baseUrl: '',
            provider: 'openai',
            model: 'gpt-4o',
            mode: 'agent',
            contextMode: 'global',
            confirmMode: 'ask'
        }
    },
    aiChatHistoryByNode: {},
    aiChatSessionsByNode: {},
    // Транзиентный маркер пакета истории (BEGIN/COMMIT_HISTORY_BATCH). Не персистится.
    historyBatch: null,
    // Изоляция контейнеров: вторая ось видимости, независимая от «глаза».
    // Пусто = изоляции нет. В историю Undo не входит — это состояние обзора,
    // а не данных (как и камера).
    containerIsolation: { projectIds: [], windowIds: [] },
    aiChatHistory: [
        { role: 'ai', content: 'Привет! Я ваш AI-ассистент. Помогу спроектировать архитектуру, ответить на вопросы и организовать ваши идеи на холсте.' }
    ],
    clipboard: null,
    past: [],
    future: [],
    historyLogs: ['Инициализация проекта'],
    formatVersion: FORMAT_VERSION
};

const normalizeLinks = (raw) => {
    if (!raw) return {};
    if (Array.isArray(raw)) {
        const dict = {};
        raw.forEach((link, idx) => {
            if (!link) return;
            const id = link.id || `link-${idx}`;
            dict[id] = { ...link, id };
        });
        return dict;
    }
    if (typeof raw === 'object') {
        const dict = {};
        Object.entries(raw).forEach(([key, link]) => {
            if (!link) return;
            const id = link.id || key;
            dict[id] = { ...link, id };
        });
        return dict;
    }
    return {};
};

const getInitialState = () => {
    if (typeof localStorage === 'undefined') return defaultState;
    try {
        const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY_V10) || localStorage.getItem(LEGACY_STORAGE_KEY_V9);
        if (saved) {
            const parsed = migrateToV11(migrateToV10(JSON.parse(saved)));
            
            const cleanNodes = {};
            if (parsed.nodes) {
                Object.entries(parsed.nodes).forEach(([key, node]) => {
                    if (!node || (!node.name && !node.type)) return;
                    cleanNodes[key] = { ...node, id: key };
                });
            }

            const mergedPorts = { ...(parsed.ports || {}) };
            if (defaultState.ports) {
                Object.keys(defaultState.ports).forEach(portId => {
                    if (mergedPorts[portId] && !mergedPorts[portId].name) {
                        mergedPorts[portId].name = defaultState.ports[portId].name;
                    }
                });
            }

            const normalizedWins = normalizeLevelWindows(parsed.levelWindows, cleanNodes, parsed.layers, parsed.levelViews);

            return { 
                ...defaultState, 
                ...parsed, 
                nodes: cleanNodes,
                ports: mergedPorts,
                links: normalizeLinks(parsed.links),
                levelWindows: normalizedWins.levelWindows,
                levelViews: normalizedWins.levelViews,
                projectName: parsed.projectName || defaultState.projectName,
                projectColor: parsed.projectColor || defaultState.projectColor,
                projectFontFamily: parsed.projectFontFamily || defaultState.projectFontFamily,
                projectContent: parsed.projectContent || defaultState.projectContent,
                selectedIds: [],
                interactionMode: 'default',
                pendingConnection: null,
                dragGesture: null,
                ui: {
                    ...defaultState.ui,
                    ...(parsed.ui || {}),
                    // Безопасный дефолт: режим Drag&Drop не переживает перезагрузку
                    dragDropMode: false,
                    libraryTab: (parsed.ui?.libraryTab === 'levels') ? 'objects' : (parsed.ui?.libraryTab || 'objects'),
                    aiAgentSettings: (() => {
                        const base = { ...defaultState.ui.aiAgentSettings, ...((parsed.ui && parsed.ui.aiAgentSettings) || {}) };
                        const sep = localStorage.getItem('architector_api_key');
                        if (!sep && base.apiKey) { try { localStorage.setItem('architector_api_key', base.apiKey); } catch(e) {} }
                        base.apiKey = sep || base.apiKey || '';
                        return base;
                    })()
                },
                aiChatHistoryByNode: parsed.aiChatHistoryByNode || defaultState.aiChatHistoryByNode,
                aiChatHistory: parsed.aiChatHistory || defaultState.aiChatHistory
            };
        }
    } catch (e) {
        console.error('Ошибка загрузки сохраненного состояния:', e);
        try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(LEGACY_STORAGE_KEY_V10);
            localStorage.removeItem(LEGACY_STORAGE_KEY_V9);
        } catch (_) {}
    }

    try {
        const sep = localStorage.getItem('architector_api_key');
        if (sep) return { ...defaultState, ui: { ...defaultState.ui, aiAgentSettings: { ...defaultState.ui.aiAgentSettings, apiKey: sep } } };
    } catch(e) {}
    return defaultState;
};

// Хелпер для сохранения истории

// === Выделение контейнеров: проекты и окна уровней ===
//
// Контейнеры адресуются префиксами, чтобы отличать их от сущностей графа и друг
// от друга. Прежде проект выделялся литералом 'project' (всегда «активный» —
// конкретный указать было нельзя), а окно строкой level-window-<номер уровня>,
// который не уникален между проектами: уровень 1 есть у каждого. Обе старые
// формы продолжают распознаваться — selectedIds персистится, и после обновления
// в хранилище могут лежать прежние значения.
const SEL_PROJECT = 'project:';
const SEL_WINDOW = 'window:';
const SEL_LEGACY_PROJECT = 'project';
const SEL_LEGACY_WINDOW = 'level-window-';

/** @param {*} sid @returns {boolean} это идентификатор контейнера, а не сущности графа */
const isContainerSelectionId = (sid) => typeof sid === 'string' && (
    sid === SEL_LEGACY_PROJECT ||
    sid.startsWith(SEL_PROJECT) ||
    sid.startsWith(SEL_WINDOW) ||
    sid.startsWith(SEL_LEGACY_WINDOW)
);

/** @param {*} sid @returns {?('project'|'window')} */
const containerSelectionKind = (sid) => {
    if (typeof sid !== 'string') return null;
    if (sid === SEL_LEGACY_PROJECT || sid.startsWith(SEL_PROJECT)) return 'project';
    if (sid.startsWith(SEL_WINDOW) || sid.startsWith(SEL_LEGACY_WINDOW)) return 'window';
    return null;
};

/**
 * Класс выделения. Контейнеры и содержимое взаимоисключающи: иначе клавиша
 * Delete была бы неоднозначна («удалить окно или узел?»), а панель свойств не
 * могла бы показать один согласованный набор действий.
 * @param {Array} selectedIds
 * @returns {'containers'|'entities'|'empty'}
 */
const getSelectionClass = (selectedIds) => {
    const list = selectedIds || [];
    if (list.length === 0) return 'empty';
    return list.some(isContainerSelectionId) ? 'containers' : 'entities';
};

/**
 * Добавление к выделению с соблюдением взаимоисключения классов: если класс
 * нового идентификатора не совпадает с текущим, выделение ЗАМЕНЯЕТСЯ.
 * @param {Array} selectedIds
 * @param {string} id
 * @returns {Array}
 */
const toggleSelectionWithClass = (selectedIds, id) => {
    const list = selectedIds || [];
    if (list.includes(id)) return list.filter(sid => sid !== id);
    const sameClass = getSelectionClass(list) === 'empty'
        || isContainerSelectionId(id) === list.some(isContainerSelectionId);
    return sameClass ? [...list, id] : [id];
};

/**
 * Идентификатор окна уровня для выделения. Каноническая форма — по стабильному
 * id окна, уникальному между проектами.
 * @param {Object} win
 * @returns {string}
 */
const windowSelectionId = (win) => SEL_WINDOW + ((win && win.id) || '');

/** @param {string} projectId @returns {string} */
const projectSelectionId = (projectId) => SEL_PROJECT + projectId;

const MAX_HISTORY_STEPS = 20;

// Срез сущностей и настроек проекта — единственная форма снимка истории.
// Один источник правды: и пошаговая запись, и пакетный режим кладут в past
// объект одной и той же формы, иначе UNDO восстановит часть полей как undefined.
const makeHistorySnapshot = (state, snapshotOverride = null) => ({
    layers: state.layers,
    nodes: state.nodes,
    ports: state.ports,
    links: state.links,
    levelWindows: state.levelWindows,
    projectName: state.projectName,
    projectColor: state.projectColor,
    projectFontFamily: state.projectFontFamily,
    projectContent: state.projectContent,
    ...(snapshotOverride || {})
});

const saveHistory = (state, logMessage, snapshotOverride = null) => {
    // Открыт пакет (BEGIN_HISTORY_BATCH) — отдельные шаги в историю НЕ пишутся.
    // Пакет закрывается одним COMMIT_HISTORY и откатывается одним Ctrl+Z. Так
    // серия экшенов от ИИ или массовая операция не вымывает лимит в 20 шагов.
    if (state.historyBatch) return {};

    // snapshotOverride: срез сущностей НА НАЧАЛО жеста (mousedown). Позволяет
    // Drag&Drop-переносу записать в историю состояние ДО перемещения мышью,
    // чтобы весь жест (движение + перенос) откатывался ОДНИМ шагом Undo.
    const snapshot = makeHistorySnapshot(state, snapshotOverride);
    const newPast = [...state.past, snapshot];
    const newLogs = [...state.historyLogs, logMessage];
    
    if (newPast.length > MAX_HISTORY_STEPS) {
        newPast.shift();
        newLogs.shift();
    }
    
    return {
        past: newPast,
        future: [],
        historyLogs: newLogs
    };
};

// Общая реализация удаления уровня: используется экшеном REMOVE_LEVEL_WINDOW
// и клавишей Delete (DELETE_SELECTED при выделенном окне уровня). Вынесена из
// switch, чтобы редьюсер не ссылался сам на себя (самовызов ломал загрузку
// через babel-standalone: top-level const переставал быть виден другим скриптам).
//
// allowRoot: удаление Главного холста (уровень 0) разрешено, если есть уровень 1,
// готовый занять его место — окно уровня 1 занимает его место со своим именем и цветом.
const applyRemoveLevelWindow = (state, win, allowRoot = true) => {
    if (!win) return state;
    const removedLevel = win.levelIndex;
    if (removedLevel === 0 && !allowRoot) return state;
    // Удалять Главный холст можно, лишь когда есть уровень 1, готовый занять его место
    if (removedLevel === 0 && !Object.values(state.levelWindows || {}).some(w => w && w.levelIndex === 1)) {
        return state;
    }

    const historyState = saveHistory(state, removedLevel === 0 ? 'Удаление Главного холста' : `Удаление Уровня ${removedLevel}`);
    const H = getHierarchy();
    const levelOf = (eid) => (H ? H.getEntityLevel(eid, state.nodes, state.layers) : 0);
    const gapOf = (e) => (H && H.getOwnerGap) ? H.getOwnerGap(e) : 1;
    // Дистанция до владельца пишется в ownerGap только когда она больше 1 —
    // дефолт (1) не засоряет сохранения и старые проекты
    const withGap = (e, gap) => {
        if (gap > 1) return { ...e, ownerGap: gap };
        if (e.ownerGap !== undefined) { const { ownerGap, ...rest } = e; return rest; }
        return e;
    };

    // 1. Сущности удаляемого уровня (узлы И слои)
    const removedIds = new Set();
    Object.keys(state.nodes || {}).forEach(eid => { if (levelOf(eid) === removedLevel) removedIds.add(eid); });
    Object.keys(state.layers || {}).forEach(eid => { if (levelOf(eid) === removedLevel) removedIds.add(eid); });

    // 2. Выжившие сущности; осиротевшие цепочки владения пере-якорятся
    const reanchor = (entity) => {
        let e = entity;
        if (e.ownerId && removedIds.has(e.ownerId)) {
            const deadOwner = (state.nodes && state.nodes[e.ownerId]) || (state.layers && state.layers[e.ownerId]);
            if (deadOwner && deadOwner.ownerId) {
                // «Внук — деду»: дистанции складываются, минус один снятый уровень
                e = withGap({ ...e, ownerId: deadOwner.ownerId }, gapOf(e) + gapOf(deadOwner) - 1);
            } else {
                // Владелец был корневым/сиротой-якорем удаляемого уровня:
                // ребёнок сам становится якорем на ТЕКУЩЕМ уровне (removedLevel +
                // дистанция); общий блок сдвига якорей ниже опустит значение на
                // один вместе с остальными уровнями — двойного сдвига нет
                e = withGap({ ...e, ownerId: null, homeLevel: removedLevel + gapOf(e) }, 1);
            }
        } else if (e.ownerId) {
            // Владелец жив. Если связь через поколение ПЕРЕПРЫГИВАЛА удаляемый
            // уровень (владелец выше, сущность ниже), дистанция сокращается на
            // один вместе со сдвигом уровней.
            const owner = (state.nodes && state.nodes[e.ownerId]) || (state.layers && state.layers[e.ownerId]);
            if (owner) {
                const ownerLvl = levelOf(e.ownerId);
                const myLvl = levelOf(e.id);
                if (ownerLvl < removedLevel && myLvl > removedLevel) {
                    e = withGap({ ...e }, gapOf(e) - 1);
                }
            }
        }
        // Координатный контейнер удалён — сущность встаёт на холст уровня
        if (e.parentId && e.parentId !== 'root' && removedIds.has(e.parentId)) {
            e = { ...e, parentId: 'root' };
        }
        // Якоря независимых веток сдвигаются вместе с уровнями
        if (typeof e.homeLevel === 'number' && e.homeLevel > removedLevel) {
            e = { ...e, homeLevel: e.homeLevel - 1 };
        }
        return e;
    };
    const newNodes = {};
    Object.entries(state.nodes || {}).forEach(([eid, n]) => { if (n && !removedIds.has(eid)) newNodes[eid] = reanchor(n); });
    const newLayers = {};
    Object.entries(state.layers || {}).forEach(([eid, l]) => { if (l && !removedIds.has(eid)) newLayers[eid] = reanchor(l); });

    // 3. Порты: обычные живут при живом узле; мастер-порты уровней
    //    сдвигаются вместе с уровнем (id кодирует номер уровня)
    const newPorts = {};
    const portRename = {};
    Object.entries(state.ports || {}).forEach(([pid, p]) => {
        if (!p) return;
        if (p.isMaster || p.windowIndex != null) {
            const lvl = p.windowIndex;
            if (lvl === removedLevel) return; // мастер-порт удалённого уровня
            if (lvl != null && lvl > removedLevel) {
                const nid = 'port-master-level-' + (lvl - 1);
                newPorts[nid] = { ...p, id: nid, windowIndex: lvl - 1 };
                portRename[pid] = nid;
            } else {
                newPorts[pid] = p;
            }
            return;
        }
        if (newNodes[p.nodeId]) newPorts[pid] = p;
    });

    // 4. Связи: живут, только если живы оба порта (с учётом переименования)
    const mapPid = (pid) => portRename[pid] || pid;
    const newLinks = {};
    Object.entries(state.links || {}).forEach(([lid, l]) => {
        if (!l) return;
        const sp = mapPid(l.sourcePortId);
        const tp = mapPid(l.targetPortId);
        if (newPorts[sp] && newPorts[tp]) {
            let nl = (sp !== l.sourcePortId || tp !== l.targetPortId)
                ? { ...l, sourcePortId: sp, targetPortId: tp }
                : l;
            // Ручные позиции прокси удалённого окна больше не нужны
            if (nl.proxyOverrides && nl.proxyOverrides[win.id]) {
                const rest = { ...nl.proxyOverrides };
                delete rest[win.id];
                nl = { ...nl, proxyOverrides: rest };
            }
            newLinks[lid] = nl;
        }
    });

    // 5. Окна: своё удаляем, нижние сдвигаем вверх с сохранением рамки.
    //    Нормализация чинит инвариант и вычищает камеры исчезнувших окон;
    //    камеры выживших ключуются по id и переезжают без изменений.
    const shiftedWindows = {};
    Object.values(state.levelWindows || {}).forEach(w => {
        if (!w || w.id === win.id) return;
        shiftedWindows[w.id] = w.levelIndex > removedLevel ? { ...w, levelIndex: w.levelIndex - 1 } : w;
    });
    const normalized = normalizeLevelWindows(shiftedWindows, newNodes, newLayers, state.levelViews);

    // 6. Пер-уровневые словари UI сдвигаются вместе с уровнями
    const shiftLevelKeyed = (dict) => {
        const res = {};
        Object.entries(dict || {}).forEach(([k, v]) => {
            const lvl = Number(k);
            if (Number.isNaN(lvl) || lvl === removedLevel) return;
            res[lvl > removedLevel ? lvl - 1 : lvl] = v;
        });
        return res;
    };
    // Фокус-наборы: сдвиг + пере-якорение. Если фокус-владелец удалён вместе с
    // уровнем, ветку наследует его владелец («внук — деду») — как и сами узлы.
    const shiftedFocus = {};
    Object.entries(shiftLevelKeyed(state.levelFocusParentId)).forEach(([k, v]) => {
        const list = (Array.isArray(v) ? v : (v ? [v] : []))
            .map(fid => {
                if (!removedIds.has(fid)) return fid;
                const dead = (state.nodes && state.nodes[fid]) || (state.layers && state.layers[fid]);
                return (dead && dead.ownerId) || null;
            })
            .filter(fid => fid && (newNodes[fid] || newLayers[fid]));
        if (list.length > 0) shiftedFocus[k] = Array.from(new Set(list));
    });

    return {
        ...state,
        ...historyState,
        nodes: newNodes,
        layers: newLayers,
        ports: newPorts,
        links: newLinks,
        levelWindows: normalized.levelWindows,
        levelViews: normalized.levelViews,
        levelHideNeighbors: shiftLevelKeyed(state.levelHideNeighbors),
        levelFocusParentId: shiftedFocus,
        activeLevelIndex: state.activeLevelIndex === removedLevel
            ? Math.max(0, removedLevel - 1)
            : (state.activeLevelIndex > removedLevel ? state.activeLevelIndex - 1 : state.activeLevelIndex),
        selectedIds: [],
        isolatedIds: (state.isolatedIds || []).filter(eid => !removedIds.has(eid))
    };
};

const reducer = (state, action) => {
    switch (action.type) {
        case 'LOAD_STATE': {
            const payload = migrateToV11(migrateToV10(action.payload)) || {};
            const historyState = saveHistory(state, `Загружен проект из файла`);
            
            const nodes = { ...payload.nodes };
            Object.keys(nodes).forEach(id => {
                const node = nodes[id];
                if (node) {
                    const size = node.type !== 'ai-agent'
                        ? calculateNodeSize(node.name, node.content, node.mediaUrl, node.mediaHeight, node.fontSize, node.fontFamily)
                        : node.size;
                    nodes[id] = {
                        ...node,
                        snapToGrid: true,
                        size
                    };
                }
            });

            let layers = { ...(payload.layers || {}) };
            Object.keys(layers).forEach(id => {
                if (layers[id]) {
                    layers[id] = {
                        ...layers[id],
                        snapToGrid: true
                    };
                }
            });

            const geom = getGeometry();
            if (geom && geom.resolveLayerCollisionsOnLoad) {
                layers = geom.resolveLayerCollisionsOnLoad(layers);
            }

            // Auto arrange nodes inside layers if any
            Object.keys(layers).forEach(layerId => {
                const layer = layers[layerId];
                const layerNodes = Object.values(nodes).filter(n => n && n.parentId === layerId);
                if (layerNodes.length > 0 && geom && geom.getSmartPlacement) {
                    const { updatesById, newLayerSize } = geom.getSmartPlacement(layerNodes, layer, {});
                    layers[layerId] = { ...layer, size: newLayerSize };
                    Object.keys(updatesById).forEach(nId => {
                        if (nodes[nId]) {
                            nodes[nId] = { ...nodes[nId], position: updatesById[nId].position };
                        }
                    });
                }
            });

            let finalNodes = nodes;
            if (geom && geom.resolveContextCollisions) {
                finalNodes = geom.resolveContextCollisions(nodes, layers);
            }

            const normalizedWins = normalizeLevelWindows(payload.levelWindows, finalNodes, layers, payload.levelViews);

            return {
                ...state,
                ...historyState,
                layers: layers,
                nodes: finalNodes,
                ports: payload.ports || {},
                links: normalizeLinks(payload.links),
                levelWindows: normalizedWins.levelWindows,
                levelViews: normalizedWins.levelViews,
                projectName: payload.projectName || defaultState.projectName,
                projectColor: payload.projectColor || defaultState.projectColor,
                projectFontFamily: payload.projectFontFamily || defaultState.projectFontFamily,
                projectContent: payload.projectContent || defaultState.projectContent,
                canvas: payload.canvas || { offset: { x: 0, y: 0 }, zoom: 1 },
                selectedIds: [],
                isolatedIds: payload.isolatedIds || [],
                interactionMode: 'default',
                pendingConnection: null,
                dragGesture: null
            };
        }
        case 'ADD_LAYER': {
            const id = action.payload.id || 'layer-' + Date.now() + Math.floor(Math.random() * 1000);
            const historyState = saveHistory(state, `Добавлен слой: ${action.payload.name}`);
            const parentId = action.payload.parentId !== undefined ? action.payload.parentId : 'root';
            const newLayers = { ...state.layers, [id]: normalizeContainer({ ...action.payload, id, parentId, snapToGrid: true }, state.nodes) };
            // Вложение подслоя (parentId — другой слой, из FAB «Добавить слой
            // внутрь этого слоя»): цепочка родителей подрастает под содержимое.
            const H = getHierarchy();
            if (parentId !== 'root' && newLayers[parentId] && H && H.bubbleUpLayerResize) {
                const sizeUpdates = H.bubbleUpLayerResize(id, { nodes: state.nodes, layers: newLayers });
                Object.entries(sizeUpdates).forEach(([lid, size]) => {
                    if (newLayers[lid]) newLayers[lid] = { ...newLayers[lid], size };
                });
            }
            return {
                ...state,
                ...historyState,
                layers: newLayers,
                selectedIds: [id]
            };
        }
        case 'UPDATE_LAYER': {
            const { id, updates, skipHistory } = action.payload || {};
            if (!id || !state.layers || !state.layers[id]) return state;
            const historyState = skipHistory ? {} : saveHistory(state, `Изменен слой: ${state.layers[id].name || id}`);
            return {
                ...state,
                ...historyState,
                layers: {
                    ...state.layers,
                    [id]: { ...state.layers[id], ...updates }
                }
            };
        }
        case 'REMOVE_LAYER': {
            const idToRemove = action.payload;
            const historyState = saveHistory(state, `Удален слой`);
            const newLayers = { ...state.layers };
            const parentContext = state.layers[idToRemove]?.parentId || 'root';
            delete newLayers[idToRemove];
            
            const removedLayerPos = state.layers[idToRemove]?.position || { x: 0, y: 0 };
            const newNodes = { ...state.nodes };
            Object.keys(newNodes).forEach(nodeId => {
                if (newNodes[nodeId].parentId === idToRemove) {
                    const n = newNodes[nodeId];
                    newNodes[nodeId] = {
                        ...n,
                        parentId: parentContext,
                        position: { x: (n.position?.x || 0) + removedLayerPos.x, y: (n.position?.y || 0) + removedLayerPos.y }
                    };
                }
            });

            return {
                ...state,
                ...historyState,
                layers: newLayers,
                nodes: newNodes,
                selectedIds: state.selectedIds.filter(id => id !== idToRemove)
            };
        }
        case 'ALIGN_LAYERS': {
            const { contextId = 'root' } = action.payload || {};
            const geom = getGeometry();
            if (!geom || !geom.alignLayers) return state;

            const historyState = saveHistory(state, 'Выравнивание слоев');
            const alignedLayers = geom.alignLayers(state.layers, state.nodes, contextId, 90);

            return {
                ...state,
                ...historyState,
                layers: {
                    ...state.layers,
                    ...alignedLayers
                }
            };
        }
        case 'ADD_NODE': {
            const id = action.payload.id || 'node-' + Date.now() + Math.floor(Math.random() * 1000);
            const historyState = saveHistory(state, `Добавлен узел: ${action.payload.name}`);
            const parentId = action.payload.parentId !== undefined ? action.payload.parentId : 'root';
            
            const nodeData = normalizeContainer({ ...action.payload, id, parentId, snapToGrid: true }, state.nodes);
            if (nodeData.type !== 'ai-agent') {
                nodeData.size = calculateNodeSize(nodeData.name, nodeData.content, nodeData.mediaUrl, nodeData.mediaHeight, nodeData.fontSize, nodeData.fontFamily);
            } else if (!nodeData.size) {
                nodeData.size = { w: 380, h: 480 };
            }
            
            let updatedNodes = { ...state.nodes, [id]: nodeData };
            let updatedLayers = { ...state.layers };

            if (parentId && parentId !== 'root' && state.layers && state.layers[parentId]) {
                const geom = getGeometry();
                const layer = state.layers[parentId];
                const layerNodes = Object.values(updatedNodes).filter(n => n && n.parentId === parentId);
                if (layerNodes.length > 0 && geom && geom.getSmartPlacement) {
                    const { updatesById, newLayerSize } = geom.getSmartPlacement(layerNodes, layer, updatedNodes, updatedLayers);
                    updatedLayers[parentId] = { ...layer, size: newLayerSize };
                    Object.keys(updatesById).forEach(nId => {
                        if (updatedNodes[nId]) {
                            updatedNodes[nId] = { ...updatedNodes[nId], position: updatesById[nId] };
                        }
                    });
                }
            }

            return {
                ...state,
                ...historyState,
                nodes: updatedNodes,
                layers: updatedLayers,
                selectedIds: [id]
            };
        }
        case 'TOGGLE_CONTAINER_ISOLATION': {
            // Кнопка изоляции живёт на самом контейнере (шапка окна, плашка
            // проекта): изолированное остаётся видимым, значит кнопка выхода
            // всегда на экране. Повторный клик снимает изоляцию.
            const { kind, id } = action.payload || {};
            if (!id || (kind !== 'project' && kind !== 'window')) return state;
            const ci = state.containerIsolation || { projectIds: [], windowIds: [] };
            const key = kind === 'project' ? 'projectIds' : 'windowIds';
            const list = ci[key] || [];
            const next = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
            return { ...state, containerIsolation: { ...ci, [key]: next } };
        }
        case 'SET_CONTAINER_ISOLATION': {
            const { projectIds, windowIds } = action.payload || {};
            return {
                ...state,
                containerIsolation: {
                    projectIds: Array.isArray(projectIds) ? projectIds : [],
                    windowIds: Array.isArray(windowIds) ? windowIds : []
                }
            };
        }
        case 'CLEAR_CONTAINER_ISOLATION':
            return { ...state, containerIsolation: { projectIds: [], windowIds: [] } };
        case 'BEGIN_HISTORY_BATCH': {
            // Открыть пакет: снимок «до» берётся здесь, дальнейшие экшены историю
            // не пишут. Вложенные пакеты не открываются — первый победил.
            if (state.historyBatch) return state;
            return {
                ...state,
                historyBatch: {
                    snapshot: makeHistorySnapshot(state),
                    logMessage: (action.payload && action.payload.logMessage) || 'Пакетное изменение'
                }
            };
        }
        case 'CANCEL_HISTORY_BATCH': {
            // Аварийный выход: пакет закрывается без записи в историю. Нужен,
            // чтобы прерванная операция не оставила историю выключенной навсегда.
            if (!state.historyBatch) return state;
            return { ...state, historyBatch: null };
        }
        case 'COMMIT_HISTORY': {
            const payload = action.payload || {};
            const batch = state.historyBatch || null;
            // Снимок берётся из payload (жесты мышью) либо из открытого пакета
            const snapshot = payload.snapshot || (batch && batch.snapshot);
            if (!snapshot) return batch ? { ...state, historyBatch: null } : state;
            const logMessage = payload.logMessage || (batch && batch.logMessage) || 'Изменение графа';
            const newPast = [...state.past, snapshot];
            const newLogs = [...state.historyLogs, logMessage];
            if (newPast.length > MAX_HISTORY_STEPS) {
                newPast.shift();
                newLogs.shift();
            }
            return {
                ...state,
                past: newPast,
                future: [],
                historyLogs: newLogs,
                historyBatch: null
            };
        }
        case 'UPDATE_NODE': {
            const { id, updates, skipHistory } = action.payload || {};
            if (!id || !state.nodes || !state.nodes[id]) return state;
            const historyState = skipHistory ? {} : saveHistory(state, `Изменен узел: ${state.nodes[id]?.name || id}`);
            
            const prevNode = state.nodes[id] || {};
            const isContentChanging = updates.content !== undefined && updates.content !== prevNode.content;
            
            let userResized = updates.userResized !== undefined ? updates.userResized : (prevNode.userResized || false);
            let shouldRecalculateSize = false;
            
            if (isContentChanging && updates.userResized === undefined) {
                userResized = false;
                shouldRecalculateSize = true;
            } else if (!userResized) {
                if (updates.name !== undefined || updates.fontSize !== undefined || updates.fontFamily !== undefined || updates.mediaUrl !== undefined || updates.mediaHeight !== undefined) {
                    shouldRecalculateSize = true;
                }
            }

            let newSize = updates.size !== undefined ? updates.size : prevNode.size;
            if (shouldRecalculateSize && prevNode.type !== 'ai-agent') {
                const name = updates.name !== undefined ? updates.name : prevNode.name;
                const content = updates.content !== undefined ? updates.content : prevNode.content;
                const mediaUrl = updates.mediaUrl !== undefined ? updates.mediaUrl : prevNode.mediaUrl;
                const mediaHeight = updates.mediaHeight !== undefined ? updates.mediaHeight : prevNode.mediaHeight;
                const fontSize = updates.fontSize !== undefined ? updates.fontSize : prevNode.fontSize;
                const fontFamily = updates.fontFamily !== undefined ? updates.fontFamily : prevNode.fontFamily;
                newSize = calculateNodeSize(name, content, mediaUrl, mediaHeight, fontSize, fontFamily);
            }

            return {
                ...state,
                ...historyState,
                nodes: {
                    ...state.nodes,
                    [id]: {
                        ...prevNode,
                        ...updates,
                        size: newSize,
                        userResized
                    }
                }
            };
        }
        case 'ADD_PORT': {
            const id = action.payload.id || 'port-' + Date.now() + Math.floor(Math.random() * 1000);
            const historyState = saveHistory(state, `Добавлен порт: ${action.payload.name || id}`);
            return {
                ...state,
                ...historyState,
                ports: {
                    ...state.ports,
                    [id]: {
                        ...action.payload,
                        id,
                        edge: action.payload.edge || 'right',
                        position: action.payload.position !== undefined ? action.payload.position : 0.5,
                        type: action.payload.type || 'output'
                    }
                },
                selectedIds: [id]
            };
        }
        case 'UPDATE_PORT': {
            const { id, updates, skipHistory } = action.payload || {};
            if (!id || !state.ports || !state.ports[id]) return state;
            const historyState = skipHistory ? {} : saveHistory(state, `Изменен порт: ${state.ports[id]?.name || id}`);
            return {
                ...state,
                ...historyState,
                ports: {
                    ...state.ports,
                    [id]: {
                        ...state.ports[id],
                        ...updates
                    }
                }
            };
        }
        case 'UPDATE_PROXY_PORT': {
            // Ручное положение прокси-порта межуровневой связи на рамке окна:
            // { linkId, windowId, edge, fraction }. Хранится в самой связи
            // (link.proxyOverrides[windowId]), поэтому попадает в историю и в
            // сохранение проекта. Прокси без оверрайда авторасставляются как раньше.
            const { linkId, windowId, edge, fraction, skipHistory } = action.payload || {};
            if (!linkId || !windowId || !state.links || !state.links[linkId]) return state;
            if (!['top', 'bottom', 'left', 'right'].includes(edge)) return state;
            const f = Math.max(0.03, Math.min(0.97, Number(fraction)));
            if (Number.isNaN(f)) return state;
            const link = state.links[linkId];
            const historyState = skipHistory ? {} : saveHistory(state, 'Перемещён прокси-порт связи');
            return {
                ...state,
                ...historyState,
                links: {
                    ...state.links,
                    [linkId]: {
                        ...link,
                        proxyOverrides: { ...(link.proxyOverrides || {}), [windowId]: { edge, fraction: f } }
                    }
                }
            };
        }
        case 'ADD_LINK': {
            const { sourcePortId, targetPortId } = action.payload || {};
            if (!sourcePortId || !targetPortId || sourcePortId === targetPortId) return state;
            const isMaster = (pid) => String(pid).startsWith('port-master-level-');
            if (!isMaster(sourcePortId) && (!state.ports || !state.ports[sourcePortId])) return state;
            if (!isMaster(targetPortId) && (!state.ports || !state.ports[targetPortId])) return state;

            const id = action.payload.id || 'link-' + Date.now() + Math.floor(Math.random() * 1000);
            const historyState = saveHistory(state, `Добавлена связь`);
            const updatedPorts = { ...state.ports };
            [sourcePortId, targetPortId].forEach(pid => {
                if (pid && !updatedPorts[pid]) {
                    const m = String(pid).match(/port-master-level-(\d+)/);
                    if (m) {
                        const lvl = parseInt(m[1], 10);
                        updatedPorts[pid] = {
                            id: pid,
                            windowIndex: lvl,
                            isMaster: true,
                            name: `Уровень ${lvl}`,
                            color: '#38bdf8'
                        };
                    }
                }
            });
            const linkObj = {
                id,
                sourcePortId,
                targetPortId,
                color: action.payload.color || '#3b82f6',
                name: action.payload.name || '',
                linkStyle: action.payload.linkStyle || 'orthogonal',
                context: action.payload.context || 'root'
            };
            return {
                ...state,
                ...historyState,
                ports: updatedPorts,
                links: {
                    ...state.links,
                    [id]: linkObj
                },
                pendingConnection: null,
                interactionMode: 'default'
            };
        }
        case 'UPDATE_LINK': {
            const { id, updates, skipHistory } = action.payload || {};
            if (!id || !state.links || !state.links[id]) return state;
            const historyState = skipHistory ? {} : saveHistory(state, `Изменена связь: ${state.links[id].name || id}`);
            return {
                ...state,
                ...historyState,
                links: {
                    ...state.links,
                    [id]: { ...state.links[id], ...updates }
                }
            };
        }
        case 'REMOVE_LINK': {
            const historyState = saveHistory(state, `Удалена связь`);
            const newLinks = { ...state.links };
            delete newLinks[action.payload];
            return {
                ...state,
                ...historyState,
                links: newLinks
            };
        }
        case 'REMOVE_NODE': {
            const nodeId = action.payload;
            const historyState = saveHistory(state, `Удален узел`);
            
            const newNodes = { ...state.nodes };
            delete newNodes[nodeId];
            
            const portsToRemove = Object.values(state.ports).filter(p => p.nodeId === nodeId).map(p => p.id);
            const newPorts = { ...state.ports };
            portsToRemove.forEach(pid => delete newPorts[pid]);
            
            const newLinks = { ...state.links };
            Object.keys(newLinks).forEach(lid => {
                const l = newLinks[lid];
                if (l && (portsToRemove.includes(l.sourcePortId) || portsToRemove.includes(l.targetPortId))) {
                    delete newLinks[lid];
                }
            });

            return {
                ...state,
                ...historyState,
                nodes: newNodes,
                ports: newPorts,
                links: newLinks,
                selectedIds: state.selectedIds.filter(sid => sid !== nodeId)
            };
        }
        case 'REMOVE_PORT': {
            const historyState = saveHistory(state, `Удален порт`);
            const newPorts = { ...state.ports };
            delete newPorts[action.payload];
            const newLinks = { ...state.links };
            Object.keys(newLinks).forEach(lid => {
                const l = newLinks[lid];
                if (l && (l.sourcePortId === action.payload || l.targetPortId === action.payload)) {
                    delete newLinks[lid];
                }
            });
            return {
                ...state,
                ...historyState,
                ports: newPorts,
                links: newLinks,
                selectedEntityId: null
            };
        }
        case 'UNDO': {
            if (state.past.length === 0) return state;
            const previous = state.past[state.past.length - 1];
            const newPast = state.past.slice(0, state.past.length - 1);
            const currentSnapshot = {
                layers: state.layers,
                nodes: state.nodes,
                ports: state.ports,
                links: state.links,
                levelWindows: state.levelWindows,
                projectName: state.projectName,
                projectColor: state.projectColor,
                projectFontFamily: state.projectFontFamily,
                projectContent: state.projectContent
            };
            const newLogs = state.historyLogs.slice(0, state.historyLogs.length - 1);

            // Камера окон живёт в state.levelViews вне истории, поэтому окна
            // восстанавливаются как есть — ручная починка innerOffset/innerZoom не нужна.
            const restoredWindows = previous.levelWindows || state.levelWindows || {};

            return {
                ...state,
                layers: previous.layers || {},
                nodes: previous.nodes || {},
                ports: previous.ports || {},
                links: previous.links || {},
                levelWindows: restoredWindows,
                projectName: previous.projectName || state.projectName,
                projectColor: previous.projectColor || state.projectColor,
                projectFontFamily: previous.projectFontFamily || state.projectFontFamily,
                projectContent: previous.projectContent !== undefined ? previous.projectContent : state.projectContent,
                past: newPast,
                future: [currentSnapshot, ...state.future],
                historyLogs: newLogs,
                selectedIds: []
            };
        }
        case 'REDO': {
            if (state.future.length === 0) return state;
            const next = state.future[0];
            const newFuture = state.future.slice(1);
            const currentSnapshot = {
                layers: state.layers,
                nodes: state.nodes,
                ports: state.ports,
                links: state.links,
                levelWindows: state.levelWindows,
                projectName: state.projectName,
                projectColor: state.projectColor,
                projectFontFamily: state.projectFontFamily,
                projectContent: state.projectContent
            };

            // См. UNDO: камера вне снапшота, окна восстанавливаются напрямую.
            const restoredWindows = next.levelWindows || state.levelWindows || {};

            return {
                ...state,
                layers: next.layers || {},
                nodes: next.nodes || {},
                ports: next.ports || {},
                links: next.links || {},
                levelWindows: restoredWindows,
                projectName: next.projectName || state.projectName,
                projectColor: next.projectColor || state.projectColor,
                projectFontFamily: next.projectFontFamily || state.projectFontFamily,
                projectContent: next.projectContent !== undefined ? next.projectContent : state.projectContent,
                past: [...state.past, currentSnapshot],
                future: newFuture,
                historyLogs: [...state.historyLogs, 'Повтор действия'],
                selectedIds: []
            };
        }
        case 'TOGGLE_UI': {
            return {
                ...state,
                ui: { ...state.ui, [action.payload]: !state.ui[action.payload] }
            };
        }
        case 'SET_UI': {
            return {
                ...state,
                ui: { ...state.ui, ...action.payload }
            };
        }
        case 'SET_LIBRARY_TAB': {
            return {
                ...state,
                ui: { ...state.ui, libraryOpen: true, libraryTab: action.payload }
            };
        }
        case 'TOGGLE_AI_AGENT': {
            return {
                ...state,
                ui: { ...state.ui, aiAgentOpen: !state.ui.aiAgentOpen }
            };
        }
        case 'UPDATE_AI_SETTINGS': {
            return {
                ...state,
                ui: { ...state.ui, aiAgentSettings: { ...state.ui.aiAgentSettings, ...action.payload } }
            };
        }
        case 'ADD_AI_MESSAGE': {
            const payload = action.payload || {};
            const nodeId = payload.nodeId;
            const message = payload.message || (payload.role ? payload : { role: 'ai', content: '' });

            const currentGlobalHistory = state.aiChatHistory || [];
            const newGlobalHistory = [...currentGlobalHistory, message].slice(-200);

            if (nodeId) {
                let nodeSessionData = (state.aiChatSessionsByNode && state.aiChatSessionsByNode[nodeId]);
                if (!nodeSessionData || !Array.isArray(nodeSessionData.sessions)) {
                    const legacyHistory = (state.aiChatHistoryByNode && state.aiChatHistoryByNode[nodeId]) || [];
                    const defaultId = 'session-1';
                    nodeSessionData = {
                        activeSessionId: defaultId,
                        sessions: [{ id: defaultId, title: 'Диалог 1', messages: legacyHistory }]
                    };
                }

                let activeId = nodeSessionData.activeSessionId;
                let sessions = [...nodeSessionData.sessions];
                let targetIdx = sessions.findIndex(s => s.id === activeId);

                if (targetIdx === -1) {
                    if (sessions.length > 0) {
                        targetIdx = 0;
                        activeId = sessions[0].id;
                    } else {
                        const newS = { id: 'session-' + Date.now(), title: 'Диалог 1', messages: [] };
                        sessions = [newS];
                        targetIdx = 0;
                        activeId = newS.id;
                    }
                }

                const currentSession = sessions[targetIdx];
                const updatedMessages = [...(currentSession.messages || []), message].slice(-200);
                sessions[targetIdx] = { ...currentSession, messages: updatedMessages };

                return {
                    ...state,
                    aiChatHistory: newGlobalHistory,
                    aiChatHistoryByNode: {
                        ...(state.aiChatHistoryByNode || {}),
                        [nodeId]: updatedMessages
                    },
                    aiChatSessionsByNode: {
                        ...(state.aiChatSessionsByNode || {}),
                        [nodeId]: {
                            activeSessionId: activeId,
                            sessions
                        }
                    }
                };
            }

            return {
                ...state,
                aiChatHistory: newGlobalHistory
            };
        }
        case 'CREATE_AI_SESSION': {
            const { nodeId } = action.payload || {};
            if (!nodeId) return state;

            let nodeSessionData = (state.aiChatSessionsByNode && state.aiChatSessionsByNode[nodeId]);
            if (!nodeSessionData || !Array.isArray(nodeSessionData.sessions)) {
                const legacyHistory = (state.aiChatHistoryByNode && state.aiChatHistoryByNode[nodeId]) || [];
                const defaultId = 'session-1';
                nodeSessionData = {
                    activeSessionId: defaultId,
                    sessions: [{ id: defaultId, title: 'Диалог 1', messages: legacyHistory }]
                };
            }

            const newSessionId = 'session-' + Date.now() + Math.floor(Math.random() * 100);
            const sessionNum = (nodeSessionData.sessions || []).length + 1;
            const newSession = {
                id: newSessionId,
                title: `Диалог ${sessionNum}`,
                messages: []
            };

            return {
                ...state,
                aiChatSessionsByNode: {
                    ...(state.aiChatSessionsByNode || {}),
                    [nodeId]: {
                        activeSessionId: newSessionId,
                        sessions: [...(nodeSessionData.sessions || []), newSession]
                    }
                }
            };
        }
        case 'SWITCH_AI_SESSION': {
            const { nodeId, sessionId } = action.payload || {};
            if (!nodeId || !sessionId) return state;

            let nodeSessionData = (state.aiChatSessionsByNode && state.aiChatSessionsByNode[nodeId]);
            if (!nodeSessionData) return state;

            return {
                ...state,
                aiChatSessionsByNode: {
                    ...(state.aiChatSessionsByNode || {}),
                    [nodeId]: {
                        ...nodeSessionData,
                        activeSessionId: sessionId
                    }
                }
            };
        }
        case 'DELETE_AI_SESSION':
        case 'CLEAR_AI_HISTORY': {
            const { nodeId, sessionId } = action.payload || {};
            if (!nodeId) {
                return {
                    ...state,
                    aiChatHistory: [],
                    aiChatHistoryByNode: {},
                    aiChatSessionsByNode: {}
                };
            }

            let nodeSessionData = (state.aiChatSessionsByNode && state.aiChatSessionsByNode[nodeId]);
            if (!nodeSessionData || !Array.isArray(nodeSessionData.sessions)) {
                const newByNode = { ...(state.aiChatHistoryByNode || {}) };
                delete newByNode[nodeId];
                return { ...state, aiChatHistoryByNode: newByNode };
            }

            const targetSessionId = sessionId || nodeSessionData.activeSessionId;
            let remainingSessions = (nodeSessionData.sessions || []).filter(s => s.id !== targetSessionId);

            if (remainingSessions.length === 0) {
                const freshSessionId = 'session-' + Date.now();
                remainingSessions = [{ id: freshSessionId, title: 'Диалог 1', messages: [] }];
            }

            const newActiveId = remainingSessions.some(s => s.id === nodeSessionData.activeSessionId)
                ? nodeSessionData.activeSessionId
                : remainingSessions[remainingSessions.length - 1].id;

            return {
                ...state,
                aiChatSessionsByNode: {
                    ...(state.aiChatSessionsByNode || {}),
                    [nodeId]: {
                        activeSessionId: newActiveId,
                        sessions: remainingSessions
                    }
                }
            };
        }
        case 'EMERGENCY_CLEAR_MEMORY': {
            const cleanNodes = { ...state.nodes };
            Object.keys(cleanNodes).forEach(key => {
                if (cleanNodes[key].mediaUrl && cleanNodes[key].mediaUrl.startsWith('data:image')) {
                    cleanNodes[key] = { ...cleanNodes[key], mediaUrl: null };
                }
            });
            const cleanByNode = {};
            Object.entries(state.aiChatHistoryByNode || {}).forEach(([nId, msgs]) => {
                cleanByNode[nId] = (msgs || []).map(m => ({ ...m, media: null }));
            });

            return {
                ...state,
                past: [],
                future: [],
                historyLogs: ['История была автоматически очищена для освобождения памяти'],
                aiChatHistory: (state.aiChatHistory || []).map(msg => ({...msg, media: null})),
                aiChatHistoryByNode: cleanByNode,
                nodes: cleanNodes
            };
        }
        case 'SET_SELECTED': {
            const sel = action.payload ? [action.payload] : [];
            // Явный сброс выделения (клик по пустому месту, Esc) откатывает
            // и вид, подобранный FOCUS_CONNECTED_ELEMENTS, если такой активен.
            const revert = action.payload ? {} : revertFocusSnapshot(state);
            return { ...state, selectedIds: sel, ...withSelectionFocus(state, sel), ...revert };
        }
        case 'SET_MULTI_SELECTED': {
            const sel = Array.isArray(action.payload) ? action.payload : [];
            return { ...state, selectedIds: sel, ...withSelectionFocus(state, sel) };
        }
        case 'TOGGLE_SELECTED': {
            const id = action.payload;
            // Классы взаимоисключающи: Shift+клик по узлу после выбора окна
            // заменяет выделение, а не смешивает контейнеры с содержимым
            const sel = toggleSelectionWithClass(state.selectedIds, id);
            return { ...state, selectedIds: sel, ...withSelectionFocus(state, sel) };
        }
        case 'SET_ISOLATED':
            return { ...state, isolatedIds: action.payload };
        case 'MASS_UPDATE': {
            const { ids, updates, updatesById } = action.payload;
            const historyState = saveHistory(state, `Массовое изменение элементов`);
            const newNodes = { ...state.nodes };
            const newLayers = { ...state.layers };
            const newPorts = { ...state.ports };
            const newLinks = { ...state.links };

            ids.forEach(id => {
                const specificUpdates = updatesById && updatesById[id] ? updatesById[id] : updates;
                if (newNodes[id]) {
                    const updatedNode = { ...newNodes[id], ...specificUpdates };
                    if (updatedNode.type !== 'ai-agent' && (specificUpdates.fontSize || specificUpdates.content || specificUpdates.name)) {
                        updatedNode.size = calculateNodeSize(updatedNode.name, updatedNode.content, updatedNode.mediaUrl, updatedNode.mediaHeight, updatedNode.fontSize, updatedNode.fontFamily);
                    }
                    newNodes[id] = updatedNode;
                }
                else if (newLayers[id]) newLayers[id] = { ...newLayers[id], ...specificUpdates };
                else if (newPorts[id]) newPorts[id] = { ...newPorts[id], ...specificUpdates };
                else if (newLinks[id]) newLinks[id] = { ...newLinks[id], ...specificUpdates };
            });

            return { ...state, ...historyState, nodes: newNodes, layers: newLayers, ports: newPorts, links: newLinks };
        }
        case 'MOVE_SELECTED': {
            const { dx, dy, skipHistory } = action.payload;
            const historyState = skipHistory ? {} : saveHistory(state, `Перемещение выделенных элементов`);

            const newNodes = { ...state.nodes };
            const newLayers = { ...state.layers };

            const H = getHierarchy();
            // Только координатное вложение (parentId) — не ownerId: уже двигавшийся
            // вместе с выделенным контейнером не должен получить позицию дважды.
            // Общий HierarchyUtils.hasContainerAncestorIn (Plan_fix.md). ⚠️ Передаём
            // state.selectedIds МАССИВОМ, не Set — toFocusList не разворачивает Set
            // (Array.isArray(Set) === false), с ним проверка молча всегда была бы false.
            const hasSelectedAncestor = (id) => H && H.hasContainerAncestorIn
                ? H.hasContainerAncestorIn(id, state.selectedIds, state.nodes, state.layers)
                : false;

            const movedIds = state.selectedIds.filter(id =>
                (state.nodes[id] || (state.layers && state.layers[id])) && !hasSelectedAncestor(id));

            // Режим Drag&Drop выключен — элементы не пересекают границы своих
            // окон: дельта клампится ЕДИНОЙ для всей группы (форма выделения не
            // ломается) по видимой области окна каждого элемента с parentId=root.
            // Элементы внутри слоёв двигаются в координатах слоя — их не клампим.
            let cdx = dx;
            let cdy = dy;
            if (!(state.ui && state.ui.dragDropMode) && H) {
                const { headerH, borderW } = H.LEVEL_WINDOW_METRICS;
                let loX = -Infinity, hiX = Infinity, loY = -Infinity, hiY = Infinity;
                movedIds.forEach(id => {
                    const entity = state.nodes[id] || state.layers[id];
                    if (!entity || (entity.parentId && entity.parentId !== 'root')) return;
                    const lvl = H.getEntityLevel(id, state.nodes, state.layers);
                    const win = H.getWindowOfLevel(lvl, state.levelWindows);
                    if (!win) return;
                    const view = H.getLevelView(win.id, state);
                    if (view.isCollapsed) return;
                    const z = view.innerZoom || 1;
                    const offX = view.innerOffset?.x || 0;
                    const offY = view.innerOffset?.y || 0;
                    const viewW = Math.max(100, (win.size?.w || 1000) - borderW * 2);
                    const viewH = Math.max(100, (win.size?.h || 700) - headerH - borderW * 2);
                    const isLayer = !!state.layers[id];
                    const w = entity.size?.w || (isLayer ? 600 : 200);
                    const h = entity.size?.h || (isLayer ? 400 : 100);
                    // Видимая область в локальных координатах холста окна
                    const minX = -offX / z;
                    const maxX = (viewW - offX) / z - w;
                    const minY = -offY / z;
                    const maxY = (viewH - offY) / z - h;
                    const px = entity.position?.x || 0;
                    const py = entity.position?.y || 0;
                    if (maxX >= minX) { loX = Math.max(loX, minX - px); hiX = Math.min(hiX, maxX - px); }
                    if (maxY >= minY) { loY = Math.max(loY, minY - py); hiY = Math.min(hiY, maxY - py); }
                });
                if (loX <= hiX && isFinite(loX) && isFinite(hiX)) cdx = Math.min(Math.max(dx, loX), hiX);
                if (loY <= hiY && isFinite(loY) && isFinite(hiY)) cdy = Math.min(Math.max(dy, loY), hiY);
            }

            movedIds.forEach(id => {
                if (newNodes[id]) {
                    newNodes[id] = { ...newNodes[id], position: { x: newNodes[id].position.x + cdx, y: newNodes[id].position.y + cdy } };
                } else if (newLayers[id]) {
                    newLayers[id] = { ...newLayers[id], position: { x: newLayers[id].position.x + cdx, y: newLayers[id].position.y + cdy } };
                }
            });

            return { ...state, ...historyState, nodes: newNodes, layers: newLayers };
        }
        case 'SET_DRAG_GESTURE': {
            // Транзиентное состояние жеста Drag&Drop: { ids, target } | null.
            // Вне истории; нужно оверлею (рендер поверх окон) и подсветке целей.
            return { ...state, dragGesture: action.payload || null };
        }
        case 'RESTORE_ENTITIES': {
            // Откат жеста без записи в историю: возврат сущностей к срезу на
            // mousedown (отмена переноса, Esc, бросок в пустоту). Заменяются
            // только переданные словари.
            const p = action.payload || {};
            return {
                ...state,
                ...(p.nodes ? { nodes: p.nodes } : {}),
                ...(p.layers ? { layers: p.layers } : {}),
                ...(p.ports ? { ports: p.ports } : {}),
                ...(p.links ? { links: p.links } : {}),
                dragGesture: null
            };
        }
        case 'TRANSFER_NODE': {
            // Перенос узлов в слой / на другой уровень с корректным родством.
            //
            // ЕДИНОЕ ПРАВИЛО: ownerId переписывается ТОЛЬКО при смене уровня —
            // усыновляет владелец ветки целевого слоя; перенос на уровень 0 или
            // на холст без владельца делает узел СИРОТОЙ-ЯКОРЕМ (homeLevel).
            // В пределах своего уровня назначение на слой — чистая группировка.
            //
            // «СПУСК В СОБСТВЕННУЮ ВЕТКУ»: если целевой слой лежит в ветке
            // переносимого узла (усыновителем стал бы он сам или его потомок),
            // узел спускается сиротой в слой, а его ПРЯМЫЕ подопечные
            // отвязываются: узлы уровня слоя ложатся в этот же слой братьями,
            // остальные якорятся по месту (homeLevel). Поддеревья подопечных
            // не меняются.
            //
            // Дети переносимых узлов не трогаются (уровень вычисляется цепочкой),
            // связи не трогаются (вид пересчитывается при рендере).
            // Массовое выделение: переносятся «только верхние».
            const p = action.payload || {};
            const H = getHierarchy();
            const G = getGeometry();
            if (!H) return state;

            // Сущность — узел ИЛИ слой (PLAN_LAYERS_AND_CONTEXT_CREATION.md,
            // 2026-08-30 — этап 3 PLAN_DRAG_AND_DROP.md: перенос слоя тем же
            // механизмом, что и узла). Массовый/смешанный перенос слоя(ёв)
            // вместе с чем-то ещё — этап 4, вне объёма: отклоняем как no-op.
            const isNodeId = (eid) => !!(state.nodes && state.nodes[eid]);
            const isLayerId = (eid) => !!(state.layers && state.layers[eid]);
            const getEntity = (eid) => (state.nodes && state.nodes[eid]) || (state.layers && state.layers[eid]);
            // newNodes/newLayers объявляются ниже (const, тот же блок) — замыкания
            // читают/пишут их по ссылке, вызываются только ПОСЛЕ объявления.
            const getNew = (eid) => (isNodeId(eid) ? newNodes[eid] : newLayers[eid]);
            const setNew = (eid, val) => { if (isNodeId(eid)) newNodes[eid] = val; else newLayers[eid] = val; };

            // Потомок ИМЕННО по владению (ownerId-цепочка) — настоящий переезд
            // на новый уровень вслед за владельцем. НЕ то же самое, что общая
            // HierarchyUtils.hasAncestorIn: та считает потомком и того, кто
            // просто вложен в переехавший слой через parentId (координатная
            // группировка) — такой уже корректно следует за слоем композицией
            // позиций, у него другая система координат (локальная для слоя, а
            // не холста), и раздвигать/трогать его здесь нельзя (баг: узел,
            // назначенный на переносимый слой, «вылетал» из него после дропа).
            const isOwnerDescendant = (eid, ancestorId) => {
                let current = getEntity(eid);
                const visited = new Set();
                while (current && current.ownerId && !visited.has(current.id)) {
                    visited.add(current.id);
                    if (current.ownerId === ancestorId) return true;
                    current = getEntity(current.ownerId);
                }
                return false;
            };

            const rawIds = Array.isArray(p.ids) ? p.ids : (p.id ? [p.id] : []);
            const ids = rawIds.filter(nid => getEntity(nid));
            if (ids.length === 0) return state;
            const draggedLayerIds = ids.filter(isLayerId);
            if (draggedLayerIds.length > 0 && ids.length > 1) return state;

            const targetLayer = (p.targetLayerId && state.layers) ? state.layers[p.targetLayerId] : null;
            const targetLevel = targetLayer
                ? H.getEntityLevel(targetLayer.id, state.nodes, state.layers)
                : (typeof p.targetLevelIndex === 'number' ? p.targetLevelIndex : null);
            if (targetLevel === null || targetLevel < 0) return state;

            // Защита от циклов parentId: слой нельзя бросить в слой, который
            // сам лежит внутри него (координатный контейнер, не ownerId-ветка —
            // для той у cross-level уже есть «спуск» ниже). У узлов такого риска
            // нет: parentId никогда не указывает на узел (normalizeContainer).
            if (targetLayer && draggedLayerIds.some(lid =>
                H.isDescendantOf(targetLayer.id, lid, state.nodes, state.layers))) {
                return state;
            }

            // «Только верхние»: у кого в этом же наборе есть предок по владению — пропускаем
            const topIds = ids.filter(nid => !ids.some(other =>
                other !== nid && H.hasAncestorIn && H.hasAncestorIn(nid, [other], state.nodes, state.layers)));

            // Владелец-усыновитель для узлов, меняющих уровень
            let adoptOwner = null;
            if (targetLevel > 0) {
                if (p.newOwnerId && state.nodes[p.newOwnerId] &&
                    H.getEntityLevel(p.newOwnerId, state.nodes, state.layers) === targetLevel - 1) {
                    adoptOwner = p.newOwnerId;
                } else if (targetLayer && H.getBranchOwner) {
                    adoptOwner = H.getBranchOwner(targetLayer.id, state.nodes, state.layers);
                }
            }

            const sameLevelIds = [];
            const crossLevelIds = [];
            topIds.forEach(nid => {
                const lvl = H.getEntityLevel(nid, state.nodes, state.layers);
                if (lvl === targetLevel) sameLevelIds.push(nid); else crossLevelIds.push(nid);
            });

            // Спуск: усыновитель — сам узел или его потомок (слой в его ветке)
            const isOwnBranch = (nid) => !!(adoptOwner && (adoptOwner === nid ||
                (H.hasAncestorIn && H.hasAncestorIn(adoptOwner, [nid], state.nodes, state.layers))));
            const descendIds = targetLayer ? crossLevelIds.filter(isOwnBranch) : [];
            // Узлы, чей усыновитель сам спускается этим же переносом, тоже
            // ложатся в слой сиротами-братьями (усыновить их больше некому)
            const followerIds = crossLevelIds.filter(nid =>
                !descendIds.includes(nid) && adoptOwner && descendIds.includes(adoptOwner));
            const normalIds = crossLevelIds.filter(nid =>
                !descendIds.includes(nid) && !followerIds.includes(nid));

            // Обычный перенос на уровень >0 требует усыновителя, ЕСЛИ есть слой
            // или явный владелец; перенос на холст без владельца — сирота-якорь
            if (normalIds.length > 0 && targetLevel > 0 && !adoptOwner && targetLayer) {
                // слой-якорь без владельца: узлы лягут в него сиротами
            }

            if (sameLevelIds.length === 0 && crossLevelIds.length === 0) return state;

            // p.historySnapshot — срез на начало Drag&Drop-жеста: весь жест
            // (движение мышью + перенос) откатывается одним шагом Undo
            const historyState = saveHistory(state, targetLayer
                ? `Назначение на слой: ${targetLayer.name || targetLayer.id}`
                : `Перенос узлов на уровень ${targetLevel}`, p.historySnapshot || null);

            const newNodes = { ...state.nodes };
            const newLayers = { ...state.layers };
            const intoLayerIds = []; // всех, кого класть в целевой слой (для авторазмещения)
            // «Вырывание из цепочек» (PLAN_SHALLOW_TRANSFER_DND.md, режим
            // p.mode === 'shallow'): id тех, кого перепривязали к предку выше
            // или сделали сиротой-якорем ВМЕСТО переезда за владельцем. Нужен
            // ниже, чтобы расталкивание местами не считало их «переехавшими».
            const shallowDetachedIds = new Set();

            // Перенос назначает владельца НАПРЯМУЮ (или делает сиротой), поэтому
            // накопленная связь через поколение (ownerGap) сбрасывается
            const dropGap = (e) => {
                if (!e || e.ownerGap === undefined) return e;
                const { ownerGap, ...rest } = e;
                return rest;
            };

            // 1. Спуск в собственную ветку
            descendIds.forEach(nid => {
                const nodeLevelBefore = H.getEntityLevel(nid, state.nodes, state.layers);
                void nodeLevelBefore;
                // Прямые подопечные (по ИСХОДНОМУ стейту): отвязка с якорем по месту
                Object.values(state.nodes).forEach(w => {
                    if (!w || w.ownerId !== nid) return;
                    const wLvl = H.getEntityLevel(w.id, state.nodes, state.layers);
                    if (wLvl === targetLevel) {
                        // ровесник слоя: становится братом в этом же слое
                        // (если уже лежал в каком-то слое своего уровня — остаётся в нём)
                        const keepContainer = w.parentId && w.parentId !== 'root';
                        newNodes[w.id] = dropGap({
                            ...newNodes[w.id],
                            ownerId: null,
                            homeLevel: wLvl,
                            parentId: keepContainer ? w.parentId : targetLayer.id
                        });
                        if (!keepContainer) intoLayerIds.push(w.id);
                    } else {
                        newNodes[w.id] = dropGap({ ...newNodes[w.id], ownerId: null, homeLevel: wLvl });
                    }
                });
                Object.values(state.layers).forEach(w => {
                    if (!w || w.ownerId !== nid) return;
                    const wLvl = H.getEntityLevel(w.id, state.nodes, state.layers);
                    newLayers[w.id] = dropGap({ ...newLayers[w.id], ownerId: null, homeLevel: wLvl });
                });
                // Сама сущность (узел или слой): сирота в целевом слое
                setNew(nid, dropGap({ ...getNew(nid), ownerId: null, homeLevel: targetLevel, parentId: targetLayer.id }));
                intoLayerIds.push(nid);
            });

            // 2. Последователи спустившегося усыновителя: сироты-братья в слое
            followerIds.forEach(nid => {
                setNew(nid, dropGap({ ...getNew(nid), ownerId: null, homeLevel: targetLevel, parentId: targetLayer.id }));
                intoLayerIds.push(nid);
            });

            // 3. Обычный перенос со сменой уровня. p.positionsById — целевые
            //    локальные позиции из Drag&Drop (элементы ложатся под курсором,
            //    сохраняя раскладку группы); p.position — общая позиция (легаси)
            normalIds.forEach(nid => {
                const orphan = targetLevel === 0 || !adoptOwner;
                const dropPos = (p.positionsById && p.positionsById[nid]) || p.position;
                setNew(nid, dropGap({
                    ...getNew(nid),
                    ownerId: orphan ? null : adoptOwner,
                    ...(orphan ? { homeLevel: targetLevel } : {}),
                    parentId: targetLayer ? targetLayer.id : 'root',
                    ...(dropPos ? { position: dropPos } : {})
                }));
                if (targetLayer) intoLayerIds.push(nid);
            });

            // 3б. «Вырывание из цепочек» (PLAN_SHALLOW_TRANSFER_DND.md): в
            // режиме p.mode === 'shallow' прямые подопечные обычных (не
            // «спускающихся» — см. п.1 выше, там своя, отдельная логика)
            // переносимых узлов НЕ едут за ними цепочкой автоматически.
            // Вместо этого они перепривязываются к ближайшему живому предку
            // выше (дистанции ownerGap складываются — премортем, риск 1:
            // «дед становится владельцем внука напрямую, минуя уехавшего
            // отца»), либо становятся сиротами-якорями на своём текущем
            // месте, если предка не было. Подопечный, явно выделенный ВМЕСТЕ
            // с переносимым узлом в этом же жесте (уже есть в общем списке
            // ids), не отвязывается — он и так едет сам, как обычно
            // (премортем, риск 2: «родитель и ребёнок выделены вместе»).
            // Ищем подопечных в ОБОИХ словарях — и nodes, и layers: слой
            // тоже может быть подопечным по ownerId (премортем, риск 4), а
            // содержимое слоя по parentId (риск 3) здесь не участвует вовсе —
            // цикл ниже проверяет только ownerId, координатные вложения он
            // не видит и не трогает.
            if (p.mode === 'shallow' && normalIds.length > 0) {
                const gapOf = (e) => (H && H.getOwnerGap) ? H.getOwnerGap(e) : 1;
                const withGap = (e, gap) => {
                    if (gap > 1) return { ...e, ownerGap: gap };
                    if (e.ownerGap !== undefined) { const { ownerGap, ...rest } = e; return rest; }
                    return e;
                };
                normalIds.forEach(nid => {
                    // Родство смотрим по ИСХОДНОМУ состоянию — до этого переноса,
                    // это дед переносимого узла, а не то, кем узел станет после
                    const original = getEntity(nid);
                    const oldOwnerId = original ? original.ownerId : null;
                    const detach = (w) => {
                        if (ids.includes(w.id)) return; // выделен вместе — едет сам
                        shallowDetachedIds.add(w.id);
                        const grandparent = oldOwnerId ? getEntity(oldOwnerId) : null;
                        if (grandparent) {
                            const newGap = gapOf(original) + gapOf(w);
                            setNew(w.id, withGap({ ...getNew(w.id), ownerId: oldOwnerId }, newGap));
                        } else {
                            const wLvl = H.getEntityLevel(w.id, state.nodes, state.layers);
                            setNew(w.id, withGap({ ...getNew(w.id), ownerId: null, homeLevel: wLvl }, 1));
                        }
                    };
                    Object.values(state.nodes).forEach(w => { if (w && w.ownerId === nid) detach(w); });
                    Object.values(state.layers).forEach(w => { if (w && w.ownerId === nid) detach(w); });
                });
            }

            // 4. В пределах уровня: явный усыновитель (дроп на узел) меняет
            //    владельца без смены контейнера и позиции; иначе — чистая
            //    группировка (только контейнер)
            sameLevelIds.forEach(nid => {
                if (p.newOwnerId && adoptOwner) {
                    setNew(nid, dropGap({ ...getNew(nid), ownerId: adoptOwner }));
                    return;
                }
                setNew(nid, { ...getNew(nid), parentId: targetLayer ? targetLayer.id : 'root' });
                if (targetLayer) intoLayerIds.push(nid);
            });

            // Авторазмещение положенных в слой + подгонка размера слоя
            if (targetLayer && intoLayerIds.length > 0 && G && G.getSmartPlacement) {
                const placed = intoLayerIds.map(nid => getNew(nid)).filter(Boolean);
                const { updatesById, newLayerSize } = G.getSmartPlacement(placed, newLayers[targetLayer.id], newNodes, newLayers);
                newLayers[targetLayer.id] = { ...newLayers[targetLayer.id], size: newLayerSize };
                Object.entries(updatesById || {}).forEach(([nid, upd]) => {
                    const cur = getNew(nid);
                    if (cur) setNew(nid, { ...cur, ...upd });
                });
                // Положенная сущность может быть слоем — её собственный родитель
                // (и вся цепочка выше) должен подрасти под новое содержимое.
                if (H.bubbleUpLayerResize) {
                    intoLayerIds.forEach(nid => {
                        const sizeUpdates = H.bubbleUpLayerResize(nid, { nodes: newNodes, layers: newLayers });
                        Object.entries(sizeUpdates).forEach(([lid, size]) => {
                            if (newLayers[lid]) newLayers[lid] = { ...newLayers[lid], size };
                        });
                    });
                }
            }

            // Расталкивание потомков переехавших узлов: они сохранили координаты,
            // но оказались на других холстах — сдвигаем группу каждого уровня
            // единым блоком вправо от занятых мест, если наложились на местных.
            // ⚠️ Только настоящие ownerId-потомки (переехали вслед за владельцем
            // на новый уровень, координаты — холста, сравнимы с локальными).
            // Тот, кто просто вложен в переехавший СЛОЙ через parentId, сюда не
            // входит — его координаты локальные для слоя, а не холста, и он и
            // так корректно едет за слоем композицией позиций (isOwnerDescendant,
            // не общая hasAncestorIn — та считает потомком и parentId-вложенных).
            const movedIds = [...normalIds, ...followerIds];
            if (movedIds.length > 0) {
                const byLevel = {};
                Object.keys(newNodes).forEach(nid => {
                    if (movedIds.includes(nid)) return;
                    // Отвязанные в режиме 'shallow' (см. п.3б выше) остались на
                    // месте — isOwnerDescendant смотрит на ИСХОДНОЕ родство и по
                    // старой памяти сочтёт их «переехавшими», хотя они больше не
                    // подопечные movedIds в новом состоянии
                    if (shallowDetachedIds.has(nid)) return;
                    if (movedIds.some(tid => isOwnerDescendant(nid, tid))) {
                        const lvl = H.getEntityLevel(nid, newNodes, newLayers);
                        (byLevel[lvl] = byLevel[lvl] || []).push(nid);
                    }
                });
                const bboxOf = (list) => list.reduce((b, n) => {
                    const pos = n.position || { x: 0, y: 0 };
                    const w = (n.size && n.size.w) || 200;
                    const h = (n.size && n.size.h) || 100;
                    return {
                        minX: Math.min(b.minX, pos.x), minY: Math.min(b.minY, pos.y),
                        maxX: Math.max(b.maxX, pos.x + w), maxY: Math.max(b.maxY, pos.y + h)
                    };
                }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

                Object.entries(byLevel).forEach(([lvlStr, group]) => {
                    const lvl = Number(lvlStr);
                    const locals = Object.values(newNodes).filter(n => n && !group.includes(n.id) &&
                        H.getEntityLevel(n.id, newNodes, newLayers) === lvl);
                    if (locals.length === 0) return;
                    const gBox = bboxOf(group.map(nid => getNew(nid)).filter(Boolean));
                    const lBox = bboxOf(locals);
                    const overlaps = gBox.minX < lBox.maxX && gBox.maxX > lBox.minX &&
                        gBox.minY < lBox.maxY && gBox.maxY > lBox.minY;
                    if (overlaps) {
                        const dx = (lBox.maxX + 60) - gBox.minX;
                        group.forEach(nid => {
                            const n = getNew(nid);
                            if (!n) return;
                            setNew(nid, { ...n, position: { x: (n.position ? n.position.x : 0) + dx, y: n.position ? n.position.y : 0 } });
                        });
                    }
                });
            }

            // Перенос мог создать новую глубину — окна достраиваются
            const normalized = normalizeLevelWindows(state.levelWindows, newNodes, newLayers, state.levelViews);

            return {
                ...state,
                ...historyState,
                nodes: newNodes,
                layers: newLayers,
                levelWindows: normalized.levelWindows,
                levelViews: normalized.levelViews
            };
        }
        case 'REPARENT_ENTITY': {
            const { id, newParentId } = action.payload;
            const H = getHierarchy();
            const entity = state.nodes[id] || (state.layers && state.layers[id]);
            if (!entity || entity.parentId === newParentId) return state;
            if (newParentId !== 'root' && H.isDescendantOf(newParentId, id, state.nodes, state.layers)) return state;

            // Слой принадлежит уровню: класть узел в слой ЧУЖОГО уровня нельзя —
            // уровень узла наследуется от слоя-контейнера, и узел молча «переехал»
            // бы на другой холст, оставив ownerId в противоречии (родитель и
            // ребёнок на одном уровне, каскадное удаление через окна и т.п.).
            // Отклоняем так же, как циклы.
            if (newParentId !== 'root' && state.layers && state.layers[newParentId] && H.getEntityLevel) {
                const layerLevel = H.getEntityLevel(newParentId, state.nodes, state.layers);
                const entityLevel = H.getEntityLevel(id, state.nodes, state.layers);
                if (layerLevel !== entityLevel) return state;
            }

            const abs = H.getLocalPosition(id, state.nodes, state.layers);
            const rel = H.toRelativePosition(abs, newParentId, state.nodes, state.layers);
            const historyState = saveHistory(state, `Элемент перевложен: ${entity.name}`);

            if (state.nodes[id]) {
                return { ...state, ...historyState, nodes: { ...state.nodes, [id]: { ...entity, parentId: newParentId, position: rel } } };
            }
            return { ...state, ...historyState, layers: { ...state.layers, [id]: { ...entity, parentId: newParentId, position: rel } } };
        }
        case 'DELETE_SELECTED': {
            if (state.selectedIds.length === 0) return state;

            // Выделено окно уровня — клавиша Delete удаляет сам уровень
            // (той же логикой, что и кнопка в шапке/панели).
            const selectedWinId = state.selectedIds.find(sid => typeof sid === 'string' && (sid.startsWith('level-window-') || sid.startsWith('window:')));
            if (selectedWinId !== undefined) {
                const winKey = selectedWinId.startsWith('window:')
                    ? selectedWinId.replace('window:', '')
                    : parseInt(selectedWinId.replace('level-window-', ''), 10);
                const win = resolveWindow(state, winKey);
                if (win) {
                    return applyRemoveLevelWindow(state, win, true);
                }
            }

            const historyState = saveHistory(state, `Удалено ${state.selectedIds.length} элементов`);
            const H = getHierarchy();
            
            let newNodes = { ...state.nodes };
            let newLayers = { ...state.layers };
            let newPorts = { ...state.ports };
            let newLinks = { ...state.links };
            
            // Каскадный сбор всех потомков удаляемых узлов
            const nodesToDelete = new Set();
            state.selectedIds.forEach(id => {
                if (newNodes[id]) {
                    nodesToDelete.add(id);
                }
            });

            // Рекурсивный поиск потомков
            let addedMore = true;
            while (addedMore) {
                addedMore = false;
                Object.values(newNodes).forEach(n => {
                    if (n && n.parentId && nodesToDelete.has(n.parentId) && !nodesToDelete.has(n.id)) {
                        nodesToDelete.add(n.id);
                        addedMore = true;
                    }
                });
            }

            let portsToRemove = [];
            let removedLayerIds = [];

            nodesToDelete.forEach(id => {
                delete newNodes[id];
                Object.values(newPorts).forEach(p => { if (p.nodeId === id) portsToRemove.push(p.id); });
            });

            // Владельцем ветки может быть не только узел, но и СЛОЙ. Слои удаляются
            // ниже по коду, поэтому набор владельцев собирается заранее: иначе
            // подопечные удаляемого слоя остались бы с висячим ownerId и провалились
            // бы на уровень 0 — тот самый дефект, что чинился для узлов.
            const ownersToDelete = new Set(nodesToDelete);
            state.selectedIds.forEach(id => { if (newLayers[id]) ownersToDelete.add(id); });

            // Ре-якорение выживших сущностей, чьи владельцы были удалены:
            // связываются с ближайшим живым предком («внук — деду» через ownerGap)
            // либо становятся независимыми сиротами-якорями (homeLevel) на своём уровне
            const levelOf = (eid) => (H ? H.getEntityLevel(eid, state.nodes, state.layers) : 0);
            const gapOf = (e) => (H && H.getOwnerGap) ? H.getOwnerGap(e) : 1;
            const withGap = (e, gap) => {
                if (gap > 1) return { ...e, ownerGap: gap };
                if (e.ownerGap !== undefined) { const { ownerGap, ...rest } = e; return rest; }
                return e;
            };

            const reanchor = (entity) => {
                let e = entity;
                if (e.ownerId && ownersToDelete.has(e.ownerId)) {
                    let gap = gapOf(e);
                    let cursor = (state.nodes && state.nodes[e.ownerId]) || (state.layers && state.layers[e.ownerId]);
                    while (cursor && cursor.ownerId && ownersToDelete.has(cursor.ownerId)) {
                        gap += gapOf(cursor);
                        cursor = (state.nodes && state.nodes[cursor.ownerId]) || (state.layers && state.layers[cursor.ownerId]);
                    }
                    const ancestorId = cursor && cursor.ownerId ? cursor.ownerId : null;
                    const ancestor = ancestorId
                        ? ((state.nodes && state.nodes[ancestorId]) || (state.layers && state.layers[ancestorId]))
                        : null;
                    if (ancestor && !ownersToDelete.has(ancestorId)) {
                        e = withGap({ ...e, ownerId: ancestorId }, gap + gapOf(cursor));
                    } else {
                        e = withGap({ ...e, ownerId: null, homeLevel: levelOf(e.id) }, 1);
                    }
                }
                return e;
            };

            Object.entries(newNodes).forEach(([eid, n]) => { if (n) newNodes[eid] = reanchor(n); });
            Object.entries(newLayers).forEach(([eid, l]) => { if (l) newLayers[eid] = reanchor(l); });

            state.selectedIds.forEach(id => {
                if (newLayers[id]) {
                    removedLayerIds.push({ id, parentId: newLayers[id].parentId || 'root', position: newLayers[id].position || { x: 0, y: 0 } });
                    Object.values(newPorts).forEach(p => { if (p && p.nodeId === id) portsToRemove.push(p.id); });
                    delete newLayers[id];
                }
                else if (newPorts[id]) portsToRemove.push(id);
                else if (newLinks[id]) {
                    delete newLinks[id];
                }
            });

            removedLayerIds.forEach(removedLayer => {
                Object.keys(newNodes).forEach(nodeId => {
                    if (newNodes[nodeId].parentId === removedLayer.id) {
                        const n = newNodes[nodeId];
                        newNodes[nodeId] = {
                            ...n,
                            parentId: removedLayer.parentId,
                            position: { x: (n.position?.x || 0) + removedLayer.position.x, y: (n.position?.y || 0) + removedLayer.position.y }
                        };
                    }
                });
            });

            portsToRemove.forEach(pid => delete newPorts[pid]);
            Object.keys(newLinks).forEach(lid => {
                const l = newLinks[lid];
                if (l && (portsToRemove.includes(l.sourcePortId) || portsToRemove.includes(l.targetPortId))) {
                    delete newLinks[lid];
                }
            });

            const updatedWindows = normalizeLevelWindows(state.levelWindows, newNodes, newLayers, state.levelViews).levelWindows;

            return {
                ...state,
                ...historyState,
                nodes: newNodes,
                layers: newLayers,
                ports: newPorts,
                links: newLinks,
                levelWindows: updatedWindows,
                selectedIds: [],
                isolatedIds: state.isolatedIds.filter(id => !state.selectedIds.includes(id))
            };
        }
        case 'CREATE_NESTED_NODE': {
            const { parentId, name = 'Новый узел', color = '#0f172a', shape = 'rectangle', type = 'default' } = action.payload || {};
            if (!parentId) return state;

            const H = getHierarchy();
            const parentLevel = H ? H.getEntityLevel(parentId, state.nodes, state.layers) : 0;
            const targetLevel = parentLevel + 1;

            const historyState = saveHistory(state, `Создан вложенный узел на уровне ${targetLevel}`);

            // 1. Проверяем / создаем окно целевого уровня
            const updatedWindows = { ...state.levelWindows };
            const existingTargetWin = H ? H.getWindowOfLevel(targetLevel, updatedWindows) : null;
            let updatedViews = state.levelViews;
            if (!existingTargetWin) {
                const newWinId = newWindowId();
                // Новое окно — в колонке СВОЕГО проекта, под самым нижним окном
                const anchor = projectWindowAnchor(state.levelWindows);
                updatedWindows[newWinId] = makeLevelWindow(newWinId, targetLevel, {
                    position: { x: anchor.x, y: anchor.bottomY + LEVEL_WINDOW_GAP }
                });
                updatedViews = { ...state.levelViews, [newWinId]: makeLevelView() };
            }

            // 2. Рассчитываем координаты на целевом уровне
            const targetLevelNodes = {};
            Object.values(state.nodes || {}).forEach(n => {
                if (n && H && H.getEntityLevel(n.id, state.nodes, state.layers) === targetLevel) {
                    targetLevelNodes[n.id] = n;
                }
            });

            const pos = H ? H.getSmartLevelPlacement(parentId, targetLevelNodes) : { x: 80, y: 100 };
            // getSmartLevelPlacement ищет соседей по владельцу (ownerId), см. hierarchy.js
            const newNodeId = action.payload.id || 'node-' + Date.now() + Math.floor(Math.random() * 1000);
            const newNodeSize = calculateNodeSize(name, '', null, null, 14, 'Inter, sans-serif');

            const newNode = {
                id: newNodeId,
                name,
                content: '',
                color,
                shape,
                type,
                // v11: координатный контейнер — холст уровня, а владение выражается ownerId
                parentId: 'root',
                ownerId: parentId,
                position: pos,
                size: newNodeSize,
                snapToGrid: true,
                fontFamily: 'Inter, sans-serif',
                fontSize: 14
            };

            const updatedNodes = {
                ...state.nodes,
                [newNodeId]: newNode
            };

            return {
                ...state,
                ...historyState,
                // ВАЖНО: после ...state, иначе spread затирает камеру нового окна
                levelViews: updatedViews,
                nodes: updatedNodes,
                levelWindows: updatedWindows,
                activeLevelIndex: targetLevel,
                selectedIds: [newNodeId]
            };
        }
        case 'MOVE_LEVEL_WINDOW': {
            const { id, windowId, index, dx = 0, dy = 0, position, skipHistory } = action.payload || {};
            const targetKey = windowId !== undefined ? windowId : (id !== undefined ? id : index);
            const win = resolveWindow(state, targetKey);
            if (!win) return state;

            const historyState = skipHistory ? {} : saveHistory(state, 'Перемещение окна уровня ' + win.levelIndex);
            const newPos = position || { x: win.position.x + dx, y: win.position.y + dy };

            return {
                ...state,
                ...historyState,
                levelWindows: { ...state.levelWindows, [win.id]: { ...win, position: newPos } }
            };
        }
        case 'RESIZE_LEVEL_WINDOW': {
            const { id, windowId, index, size, skipHistory } = action.payload || {};
            const targetKey = windowId !== undefined ? windowId : (id !== undefined ? id : index);
            const win = resolveWindow(state, targetKey);
            if (!win) return state;

            const historyState = skipHistory ? {} : saveHistory(state, 'Изменение размера окна уровня ' + win.levelIndex);
            const newSize = {
                w: Math.max(400, (size && size.w) || win.size.w),
                h: Math.max(300, (size && size.h) || win.size.h)
            };

            return {
                ...state,
                ...historyState,
                levelWindows: { ...state.levelWindows, [win.id]: { ...win, size: newSize } }
            };
        }
        case 'ALIGN_LEVEL_WINDOWS': {
            const historyState = saveHistory(state, 'Выравнивание окон уровней');
            const updatedWindows = { ...state.levelWindows };
            const ordered = Object.values(updatedWindows).sort((a, b) => a.levelIndex - b.levelIndex);

            // Выравнивание — в СОБСТВЕННОЙ колонке проекта (по верхнему окну),
            // а не по жёсткому x=-500: при мультипроекте проект не должен
            // «переезжать» в чужую колонку
            const anchor = projectWindowAnchor(updatedWindows);
            let cursorY = anchor.topY;
            ordered.forEach((w) => {
                updatedWindows[w.id] = { ...w, position: { x: anchor.x, y: cursorY } };
                cursorY += (w.size && w.size.h ? w.size.h : LEVEL_WINDOW_DEFAULT_SIZE.h) + LEVEL_WINDOW_GAP;
            });

            return {
                ...state,
                ...historyState,
                levelWindows: updatedWindows
            };
        }
        case 'UPDATE_PROJECT_PROPERTIES': {
            const { updates = {}, skipHistory } = action.payload || {};
            const historyState = skipHistory ? {} : saveHistory(state, 'Изменение свойств проекта');

            return {
                ...state,
                ...historyState,
                projectName: updates.projectName !== undefined ? updates.projectName : state.projectName,
                projectColor: updates.projectColor !== undefined ? updates.projectColor : state.projectColor,
                projectFontFamily: updates.projectFontFamily !== undefined ? updates.projectFontFamily : state.projectFontFamily,
                projectContent: updates.projectContent !== undefined ? updates.projectContent : state.projectContent
            };
        }
        case 'PAN_LEVEL_WINDOW': {
            const { id, windowId, index, offset } = action.payload || {};
            const targetKey = windowId !== undefined ? windowId : (id !== undefined ? id : index);
            const win = resolveWindow(state, targetKey);
            if (!win || !offset) return state;
            return withLevelView(state, win.id, { innerOffset: offset });
        }
        case 'ZOOM_LEVEL_WINDOW': {
            const { id, windowId, index, innerZoom, innerOffset } = action.payload || {};
            const targetKey = windowId !== undefined ? windowId : (id !== undefined ? id : index);
            const win = resolveWindow(state, targetKey);
            if (!win) return state;
            const patch = {};
            if (innerZoom !== undefined) patch.innerZoom = innerZoom;
            if (innerOffset !== undefined) patch.innerOffset = innerOffset;
            return withLevelView(state, win.id, patch);
        }
        case 'UPDATE_LEVEL_PROPERTIES': {
            const { id, windowId, index, updates = {}, skipHistory } = action.payload || {};
            const targetKey = windowId !== undefined ? windowId : (id !== undefined ? id : index);
            const win = resolveWindow(state, targetKey);
            if (!win) return state;

            // Свойства рамки и камера хранятся раздельно, но экшен принимает и то и другое:
            // поля камеры МАРШРУТИЗИРУЮТСЯ в levelViews, а не отбрасываются. Молчаливая
            // потеря поля здесь означала бы неработающие панораму и зум внутри окна.
            const frameUpdates = { ...updates };
            const cameraUpdates = {};
            ['innerOffset', 'innerZoom', 'isCollapsed'].forEach(k => {
                if (frameUpdates[k] !== undefined) {
                    cameraUpdates[k] = frameUpdates[k];
                    delete frameUpdates[k];
                }
            });
            delete frameUpdates.id;
            delete frameUpdates.levelIndex;

            const hasFrameChange = Object.keys(frameUpdates).length > 0;
            // Движение камеры не пишет историю, даже если вызвано без skipHistory
            const historyState = (skipHistory || !hasFrameChange) ? {} : saveHistory(state, 'Изменение свойств уровня ' + win.levelIndex);

            const nextState = Object.keys(cameraUpdates).length > 0
                ? withLevelView(state, win.id, cameraUpdates)
                : state;

            return {
                ...nextState,
                ...historyState,
                levelWindows: hasFrameChange
                    ? { ...state.levelWindows, [win.id]: { ...win, ...frameUpdates } }
                    : state.levelWindows
            };
        }
        case 'TOGGLE_LEVEL_COLLAPSE': {
            const { id, windowId, index } = action.payload || {};
            const targetKey = windowId !== undefined ? windowId : (id !== undefined ? id : index);
            const win = resolveWindow(state, targetKey);
            if (!win) return state;
            const view = (state.levelViews && state.levelViews[win.id]) || {};
            return withLevelView(state, win.id, { isCollapsed: !view.isCollapsed });
        }
        case 'TOGGLE_LEVEL_NEIGHBORS': {
            const { levelIndex } = action.payload || {};
            if (levelIndex === undefined) return state;

            return {
                ...state,
                levelHideNeighbors: {
                    ...state.levelHideNeighbors,
                    [levelIndex]: !state.levelHideNeighbors[levelIndex]
                }
            };
        }
        case 'SET_LEVEL_FOCUS': {
            const { levelIndex, focusParentId } = action.payload || {};
            if (levelIndex === undefined) return state;

            const next = {
                ...state,
                // Клик внутрь окна уровня делает его активным: новые узлы и слои
                // из панели инструментов создаются на этом уровне (см.
                // getActiveContext в Toolbar.js, ветка activeLevelIndex).
                activeLevelIndex: levelIndex
            };
            // Фокус ветки меняем только когда он передан явно (null — явный
            // сброс). Простой клик по пустому месту окна не должен молча
            // сбрасывать изоляцию ветки («глаз»).
            if (focusParentId !== undefined) {
                next.levelFocusParentId = {
                    ...state.levelFocusParentId,
                    [levelIndex]: focusParentId ? [focusParentId] : []
                };
            }
            return next;
        }
        case 'FOCUS_CONNECTED_ELEMENTS': {
            return applyFocusConnectedElements(state, action.payload || {});
        }
        // Отдельная от двойного клика по узлу навигация: кнопка-бейдж
        // «N детей» в шапке узла (Node.js) — переходит на уровень детей и
        // центрирует его. Раньше этим же экшеном был занят и двойной клик
        // по узлу, но тот теперь отдан под FOCUS_CONNECTED_ELEMENTS.
        case 'FOCUS_CHILDREN_OF_NODE': {
            const { parentId } = action.payload || {};
            if (!parentId || !state.nodes[parentId]) return state;

            const H = getHierarchy();
            const parentLevel = H ? H.getEntityLevel(parentId, state.nodes, state.layers) : 0;
            const targetLevel = parentLevel + 1;

            const targetWin = (H && H.getWindowOfLevel(targetLevel, state.levelWindows)) || {
                position: { x: -500, y: -400 + targetLevel * (LEVEL_WINDOW_DEFAULT_SIZE.h + LEVEL_WINDOW_GAP) },
                size: { w: LEVEL_WINDOW_DEFAULT_SIZE.w, h: LEVEL_WINDOW_DEFAULT_SIZE.h }
            };

            // Дети живут в другом окне и в другом масштабе, поэтому габарит
            // считается в МИРОВЫХ координатах, а не в системе координат родителя.
            let bbox = null;
            Object.values(state.nodes || {}).forEach(n => {
                if (!n || n.ownerId !== parentId) return;
                const b = H ? H.getNodeWorldBounds(n.id, state) : null;
                if (!b) return;
                if (!bbox) bbox = { minX: b.x, minY: b.y, maxX: b.x + b.w, maxY: b.y + b.h };
                else {
                    bbox.minX = Math.min(bbox.minX, b.x);
                    bbox.minY = Math.min(bbox.minY, b.y);
                    bbox.maxX = Math.max(bbox.maxX, b.x + b.w);
                    bbox.maxY = Math.max(bbox.maxY, b.y + b.h);
                }
            });

            const { w: screenW, h: screenH } = getScreenSize();

            let targetX = targetWin.position.x + targetWin.size.w / 2;
            let targetY = targetWin.position.y + targetWin.size.h / 2;

            if (bbox) {
                targetX = (bbox.minX + bbox.maxX) / 2;
                targetY = (bbox.minY + bbox.maxY) / 2;
            }

            const zoom = 0.8;
            const offsetX = screenW / 2 - targetX * zoom;
            const offsetY = screenH / 2 - targetY * zoom;

            return {
                ...state,
                activeLevelIndex: targetLevel,
                levelFocusParentId: {
                    ...state.levelFocusParentId,
                    [targetLevel]: [parentId]
                },
                canvas: {
                    ...state.canvas,
                    offset: { x: offsetX, y: offsetY },
                    zoom
                }
            };
        }
        case 'REMOVE_LEVEL_WINDOW': {
            // Удаление уровня N: сущности уровня удаляются, их потомки
            // пере-якорятся на владельца удалённого владельца («внук — деду»),
            // поэтому весь хвост уровней поднимается ровно на один
            // («следующий уровень становится предыдущим»). Окна нижних уровней
            // сохраняют id, рамку (имя/цвет/позицию/размер) и камеру — меняется
            // только их levelIndex. Главный холст этим экшеном удалить нельзя
            // (только REMOVE_ROOT_CANVAS). Реализация — в applyRemoveLevelWindow.
            const { id, index } = action.payload || {};
            const win = resolveWindow(state, id !== undefined ? id : index);
            return applyRemoveLevelWindow(state, win);
        }
        case 'CLEAR_PROJECT': {
            // Удаление проекта: сброс к начальному состоянию. Стираются ВСЕ
            // сущности (узлы, слои, порты — включая мастер-порты окон, связи)
            // И все окна уровней, кроме Главного холста (уровень 0): его окно
            // сохраняет имя, цвет, шрифт, рамку и камеру — как при первом
            // запуске. Раньше окна уровней и мастер-порты переживали очистку
            // (оставались пустые рамки) — это противоречило подписи кнопки
            // «...сбросить к начальному состоянию».
            const historyState = saveHistory(state, 'Удаление проекта (сброс к начальному состоянию)');
            const rootWin = Object.values(state.levelWindows || {}).find(w => w && w.levelIndex === 0);
            const keptWindows = rootWin
                ? { [rootWin.id]: rootWin }
                : { [LEVEL0_WINDOW_ID]: makeLevelWindow(LEVEL0_WINDOW_ID, 0) };
            const keptRootId = Object.keys(keptWindows)[0];
            const keptViews = {
                [keptRootId]: (state.levelViews && state.levelViews[keptRootId]) || makeLevelView()
            };
            return {
                ...state,
                ...historyState,
                nodes: {},
                layers: {},
                ports: {},
                links: {},
                levelWindows: keptWindows,
                levelViews: keptViews,
                levelFocusParentId: {},
                levelHideNeighbors: {},
                activeLevelIndex: 0,
                selectedIds: [],
                isolatedIds: []
            };
        }
        case 'ADD_LEVEL_WINDOW': {
            // Явное создание нового ПУСТОГО уровня (кнопка «Добавить уровень»
            // в радиальном меню «+»). Раньше окно нового уровня появлялось
            // только как побочный эффект CREATE_NESTED_NODE — вместе с узлом.
            // Новый уровень встаёт следующим за самым глубоким существующим.
            const existing = Object.values(state.levelWindows || {}).filter(Boolean);
            const maxLevel = existing.length ? Math.max(...existing.map(w => w.levelIndex || 0)) : -1;
            const targetLevel = maxLevel + 1;
            const historyState = saveHistory(state, `Добавлен Уровень ${targetLevel}`);
            const newWinId = targetLevel === 0 ? LEVEL0_WINDOW_ID : newWindowId();
            // Новый уровень — в колонке своего проекта, под нижним окном
            const anchor = projectWindowAnchor(state.levelWindows);
            return {
                ...state,
                ...historyState,
                levelWindows: {
                    ...state.levelWindows,
                    [newWinId]: makeLevelWindow(newWinId, targetLevel, {
                        position: { x: anchor.x, y: anchor.bottomY + LEVEL_WINDOW_GAP }
                    })
                },
                levelViews: {
                    ...state.levelViews,
                    [newWinId]: makeLevelView()
                }
            };
        }
        case 'REMOVE_ROOT_CANVAS': {
            // Удаление Главного холста кнопкой «Удалить холст»: его сущности
            // удаляются, окно уровня 1 становится Главным холстом, НЕ меняя
            // имя и цвет, а потомки «ползут» на уровень вверх (та же механика,
            // что и удаление промежуточного уровня). Без других уровней — no-op:
            // кнопка в UI в этом случае неактивна.
            return applyRemoveLevelWindow(state, resolveWindow(state, 0), true);
        }
        case 'CLEAR_LEVEL_WINDOW': {
            // Очистка уровня N: удаляются ТОЛЬКО сущности этого уровня —
            // потомки на нижних уровнях выживают и сохраняют свои ветки.
            // Осиротевшие дети пере-якорятся на ближайшего живого предка
            // («внук — деду») со связью через поколение (ownerGap растёт),
            // а без живых предков становятся сиротами-якорями на СВОЁМ уровне
            // (homeLevel). Уровни не сдвигаются, окна, рамки и камеры не
            // трогаются — очищенный уровень можно наполнять заново.
            // Очистка Главного холста — тот же механизм: живых предков выше
            // нет, все дети уровня 1 становятся сиротами со своими ветками.
            const { id, index } = action.payload || {};
            const win = resolveWindow(state, id !== undefined ? id : index);
            if (!win) return state;

            const clearedLevel = win.levelIndex;
            const historyState = saveHistory(state, clearedLevel === 0 ? 'Очистка Главного холста' : `Очистка Уровня ${clearedLevel}`);
            const H = getHierarchy();
            const levelOf = (eid) => (H ? H.getEntityLevel(eid, state.nodes, state.layers) : 0);
            const gapOf = (e) => (H && H.getOwnerGap) ? H.getOwnerGap(e) : 1;
            const withGap = (e, gap) => {
                if (gap > 1) return { ...e, ownerGap: gap };
                if (e.ownerGap !== undefined) { const { ownerGap, ...rest } = e; return rest; }
                return e;
            };

            // 1. Под удаление — только сущности очищаемого уровня
            const removedIds = new Set();
            Object.keys(state.nodes || {}).forEach(eid => { if (levelOf(eid) === clearedLevel) removedIds.add(eid); });
            Object.keys(state.layers || {}).forEach(eid => { if (levelOf(eid) === clearedLevel) removedIds.add(eid); });

            // 2. Пере-якорение выживших: ближайший живой предок вверх по цепочке
            //    владения (дистанции складываются) либо сирота на своём уровне
            const reanchor = (entity) => {
                let e = entity;
                if (e.ownerId && removedIds.has(e.ownerId)) {
                    let gap = gapOf(e);
                    let cursor = (state.nodes && state.nodes[e.ownerId]) || (state.layers && state.layers[e.ownerId]);
                    while (cursor && cursor.ownerId && removedIds.has(cursor.ownerId)) {
                        gap += gapOf(cursor);
                        cursor = (state.nodes && state.nodes[cursor.ownerId]) || (state.layers && state.layers[cursor.ownerId]);
                    }
                    const ancestorId = cursor && cursor.ownerId ? cursor.ownerId : null;
                    const ancestor = ancestorId
                        ? ((state.nodes && state.nodes[ancestorId]) || (state.layers && state.layers[ancestorId]))
                        : null;
                    if (ancestor && !removedIds.has(ancestorId)) {
                        // «Внук — деду»: уровень сущности не меняется, дистанция
                        // впитывает дистанцию удалённого владельца
                        e = withGap({ ...e, ownerId: ancestorId }, gap + gapOf(cursor));
                    } else {
                        // Живых предков не осталось — сирота-якорь на своём уровне,
                        // ветка потомков остаётся при нём
                        e = withGap({ ...e, ownerId: null, homeLevel: levelOf(e.id) }, 1);
                    }
                }
                // Координатный контейнер удалён — сущность встаёт на холст уровня
                if (e.parentId && e.parentId !== 'root' && removedIds.has(e.parentId)) {
                    e = { ...e, parentId: 'root' };
                }
                return e;
            };

            const newNodes = {};
            Object.entries(state.nodes || {}).forEach(([eid, n]) => { if (n && !removedIds.has(eid)) newNodes[eid] = reanchor(n); });
            const newLayers = {};
            Object.entries(state.layers || {}).forEach(([eid, l]) => { if (l && !removedIds.has(eid)) newLayers[eid] = reanchor(l); });

            // Мастер-порты окон живут при живых окнах; обычные — при живых узлах
            const newPorts = {};
            Object.entries(state.ports || {}).forEach(([pid, p]) => {
                if (!p) return;
                if (p.isMaster || p.windowIndex != null) { newPorts[pid] = p; return; }
                if (newNodes[p.nodeId]) newPorts[pid] = p;
            });
            const newLinks = {};
            Object.entries(state.links || {}).forEach(([lid, l]) => {
                if (l && newPorts[l.sourcePortId] && newPorts[l.targetPortId]) newLinks[lid] = l;
            });

            // Фокус-родители: удалённый владелец ветки заменяется его живым
            // предком (как и сами сущности), иначе вычищается
            const newFocus = {};
            Object.entries(state.levelFocusParentId || {}).forEach(([k, v]) => {
                const list = (Array.isArray(v) ? v : (v ? [v] : []))
                    .map(fid => {
                        if (newNodes[fid] || newLayers[fid]) return fid;
                        const dead = (state.nodes && state.nodes[fid]) || (state.layers && state.layers[fid]);
                        return (dead && dead.ownerId) || null;
                    })
                    .filter(fid => fid && (newNodes[fid] || newLayers[fid]));
                if (list.length > 0) newFocus[k] = Array.from(new Set(list));
            });

            return {
                ...state,
                ...historyState,
                nodes: newNodes,
                layers: newLayers,
                ports: newPorts,
                links: newLinks,
                levelFocusParentId: newFocus,
                selectedIds: [],
                isolatedIds: (state.isolatedIds || []).filter(eid => newNodes[eid] || newLayers[eid])
            };
        }
        case 'CENTER_ON_ENTITY': {
            const id = action.payload;
            if (!id) return state;
            
            let targetZoom = state.canvas.zoom;
            let targetOffsetX = state.canvas.offset.x;
            let targetOffsetY = state.canvas.offset.y;
            const { w: screenW, h: screenH } = getScreenSize();

            let newZoom = targetZoom;
            
            const libraryWidth = state.ui.libraryOpen ? 300 : 0;
            const visualCenterX = (screenW + libraryWidth) / 2;

            let focusedViews = null;

            if (state.nodes[id]) {
                const node = state.nodes[id];
                const focus = focusEntityInsideWindow(state, id);
                const padding = 200;

                if (focus) {
                    // Узел подведён под центр своего окна — теперь он точно не за обрезкой
                    focusedViews = focus.levelViews;
                    const scaleX = (screenW - libraryWidth - padding) / focus.size.w;
                    const scaleY = (screenH - padding) / focus.size.h;
                    newZoom = Math.min(Math.max(scaleX, scaleY, 0.5), 1.2);
                    targetOffsetX = visualCenterX - focus.center.x * newZoom;
                    targetOffsetY = (screenH / 2) - focus.center.y * newZoom;
                } else {
                    const nodeAbs = getHierarchy().getWorldTransform(id, state);
                    const nw = (node.size?.w || 200) * nodeAbs.scale;
                    const nh = (node.size?.h || 100) * nodeAbs.scale;
                    const scaleX = (screenW - libraryWidth - padding) / nw;
                    const scaleY = (screenH - padding) / nh;
                    newZoom = Math.min(Math.max(scaleX, scaleY, 0.5), 1.2);
                    targetOffsetX = visualCenterX - (nodeAbs.x + nw / 2) * newZoom;
                    targetOffsetY = (screenH / 2) - (nodeAbs.y + nh / 2) * newZoom;
                }
            } else if (state.layers && state.layers[id]) {
                const layer = state.layers[id];
                const focus = focusEntityInsideWindow(state, id);
                const padding = 200;

                if (focus) {
                    focusedViews = focus.levelViews;
                    const scaleX = (screenW - libraryWidth - padding) / focus.size.w;
                    const scaleY = (screenH - padding) / focus.size.h;
                    newZoom = Math.min(Math.max(scaleX, scaleY, 0.1), 1.0);
                    targetOffsetX = visualCenterX - focus.center.x * newZoom;
                    targetOffsetY = (screenH / 2) - focus.center.y * newZoom;
                } else {
                    const layerAbs = getHierarchy().getWorldTransform(id, state);
                    const lw = (layer.size?.w || 600) * layerAbs.scale;
                    const lh = (layer.size?.h || 400) * layerAbs.scale;
                    const scaleX = (screenW - libraryWidth - padding) / lw;
                    const scaleY = (screenH - padding) / lh;
                    newZoom = Math.min(Math.max(scaleX, scaleY, 0.1), 1.0);
                    targetOffsetX = visualCenterX - (layerAbs.x + lw / 2) * newZoom;
                    targetOffsetY = (screenH / 2) - (layerAbs.y + lh / 2) * newZoom;
                }
            } else if (state.ports[id]) {
                const port = state.ports[id];
                const node = state.nodes[port.nodeId];
                if (node) {
                    // Порт живёт внутри окна вместе со своим узлом
                    const pf = focusEntityInsideWindow(state, node.id);
                    if (pf) focusedViews = pf.levelViews;
                    const absPos = getPortAbs(port, node, state);
                    targetOffsetX = visualCenterX - absPos.x * newZoom;
                    targetOffsetY = (screenH / 2) - absPos.y * newZoom;
                }
            } else {
                const link = state.links ? state.links[id] : null;
                if (link) {
                    const sourcePort = state.ports[link.sourcePortId];
                    const targetPort = state.ports[link.targetPortId];
                    if (sourcePort && targetPort) {
                        const sNode = state.nodes[sourcePort.nodeId];
                        const tNode = state.nodes[targetPort.nodeId];
                        if (sNode && tNode) {
                            const p1 = getPortAbs(sourcePort, sNode, state);
                            const p2 = getPortAbs(targetPort, tNode, state);
                            const midX = (p1.x + p2.x) / 2;
                            const midY = (p1.y + p2.y) / 2;

                            const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                            const scale = (screenW - libraryWidth - 200) / (dist || 1);
                            newZoom = Math.min(Math.max(scale, 0.5), 1.5);
                            
                            targetOffsetX = visualCenterX - midX * newZoom;
                            targetOffsetY = (screenH / 2) - midY * newZoom;
                        }
                    }
                }
            }

            return {
                ...state,
                levelViews: focusedViews || state.levelViews,
                canvas: { ...state.canvas, offset: { x: targetOffsetX, y: targetOffsetY }, zoom: newZoom }
            };
        }
        case 'SET_MODE':
            return { ...state, interactionMode: action.payload, pendingConnection: null };
        case 'SET_PENDING_CONNECTION':
            return { ...state, pendingConnection: action.payload };
        case 'UPDATE_PENDING_CONNECTION':
            if (!state.pendingConnection) return state;
            return { ...state, pendingConnection: { ...state.pendingConnection, endPos: action.payload } };
        case 'SET_CLIPBOARD':
            return { ...state, clipboard: action.payload };
        case 'SET_CANVAS':
            return { ...state, canvas: { ...state.canvas, ...action.payload } };
        default:
            return state;
    }
};

// ============================================================================
// МУЛЬТИПРОЕКТНАЯ ОБЁРТКА (v12, Этап 1 плана мультипроектности, Часть 1)
// ============================================================================
// Внешнее состояние: { projects, projectOrder, activeProjectId, projectCounter,
// ...глобальные поля }. Каждый проект — прежнее «плоское» подсостояние
// (nodes/layers/ports/links/levelWindows/levelViews/настройки/история Undo).
// Внутренний reducer НЕ ТРОНУТ: multiReducer собирает плоский вид активного
// проекта, прогоняет через него экшен и раскладывает результат обратно.
// История Undo/Redo (past/future/historyLogs) лежит ВНУТРИ проекта —
// раздельный Undo по проектам получается автоматически.
// Камера общего холста (canvas), ui, выделение, буфер обмена и чат ИИ —
// глобальные: холст один на все проекты.

const STORAGE_KEY_V12 = 'architector_state_v12';

// Поля, принадлежащие проекту (всё остальное в плоском состоянии — глобальное)
const PROJECT_FIELDS = [
    'projectName', 'projectColor', 'projectFontFamily', 'projectContent',
    'levelWindows', 'levelViews', 'activeLevelIndex',
    'levelFocusParentId', 'levelHideNeighbors',
    'layers', 'nodes', 'ports', 'links',
    'past', 'future', 'historyLogs'
];

const newProjectId = () => 'proj-' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);

// Глобальная часть defaultState (без полей проекта)
const globalDefaults = () => {
    const g = { ...defaultState };
    PROJECT_FIELDS.forEach(f => { delete g[f]; });
    return g;
};

// Новый пустой проект: один Главный холст с УНИКАЛЬНЫМ id окна —
// 'lvlwin-root' зарезервирован за первым (мигрированным) проектом,
// пересечения id окон между проектами недопустимы (React-ключи, Этап 2).
const makeProject = (id, name) => {
    const winId = newWindowId();
    const p = { id, origin: { x: 0, y: 0 } };
    PROJECT_FIELDS.forEach(f => { p[f] = defaultState[f]; });
    p.projectName = name || defaultState.projectName;
    p.levelWindows = { [winId]: makeLevelWindow(winId, 0) };
    p.levelViews = { [winId]: makeLevelView() };
    p.past = [];
    p.future = [];
    p.historyLogs = ['Проект создан'];
    return p;
};

// Плоское (v11) состояние -> мультипроектное: один проект со всем содержимым
const wrapFlatToMulti = (flat) => {
    const id = newProjectId();
    const proj = { id, origin: { x: 0, y: 0 } };
    PROJECT_FIELDS.forEach(f => { proj[f] = flat[f] !== undefined ? flat[f] : defaultState[f]; });
    const globals = {};
    Object.keys(flat).forEach(k => { if (!PROJECT_FIELDS.includes(k)) globals[k] = flat[k]; });
    return {
        ...globalDefaults(),
        ...globals,
        projects: { [id]: proj },
        projectOrder: [id],
        activeProjectId: id,
        projectCounter: 1,
        formatVersion: 12
    };
};

const FORMAT_VERSION_V13 = 13;

/**
 * Миграция v12 -> v13: единый источник родства `parentId`, отказ от
 * ownerId/ownerGap/homeLevel (см. docs/IDEAL_INTERACTIONS.md §1).
 * Правило переноса на одну сущность (узел или слой):
 *   1. Координатно вложена в РЕАЛЬНЫЙ слой (parentId указывает на layers[pid]) —
 *      контейнер остаётся как есть, ownerId/ownerGap отбрасываются (в v13 нельзя
 *      одновременно числиться в слое и структурно принадлежать другому узлу —
 *      это и есть устраняемая «лапша», побеждает координатный контейнер).
 *   2. Иначе, есть живой ownerId И getOwnerGap === 1 (обычное родство без
 *      «прыжка через поколение») — parentId становится = ownerId напрямую.
 *   3. Иначе (истинный сирота, мёртвая ссылка на владельца, ИЛИ ownerGap > 1
 *      после очистки промежуточных уровней) — сущность «якорится» на СВОЙ
 *      текущий уровень явно: parentId = id окна уровня с этим levelIndex.
 *      Уровень считается ДО миграции (HierarchyUtils.getLevel по старым
 *      данным), поэтому мировые координаты не смещаются ни на пиксель —
 *      меняется только то, ЧЕМ выражено родство, а не где сущность рисуется.
 * Позиции, размеры, связи и любые другие поля не трогаются.
 */
const migrateProjectEntitiesToV13 = (proj) => {
    const H = getHierarchy();
    const oldNodes = proj.nodes || {};
    const oldLayers = proj.layers || {};
    const levelWindows = proj.levelWindows || {};
    const windowByLevel = {};
    Object.values(levelWindows).forEach(w => {
        if (w && windowByLevel[w.levelIndex] === undefined) windowByLevel[w.levelIndex] = w.id;
    });

    const migrateEntity = (e) => {
        if (!e) return e;
        const { ownerId, ownerGap, homeLevel, ...rest } = e;
        const pid = e.parentId;

        // 1. Координатная вложенность в слой побеждает — уже разрешённый пост-v11 инвариант.
        if (pid && pid !== 'root' && oldLayers[pid]) {
            return { ...rest, parentId: pid };
        }

        // 2. Прямое родство без прыжка через поколение.
        const gap = H.getOwnerGap(e);
        const owner = ownerId ? (oldNodes[ownerId] || oldLayers[ownerId]) : null;
        if (owner && gap === 1) {
            return { ...rest, parentId: ownerId };
        }

        // 3. Сирота-якорь (в т.ч. бывший ownerGap > 1) — привязка к своему уровню явно.
        // Уровень 0 — самый частый случай (обычный узел без владельца на Главном
        // холсте) — компактно остаётся литералом 'root' (это тот же самый
        // levelWindows[LEVEL0_WINDOW_ID], просто без явного упоминания id).
        const lvl = H.getLevel(e.id, oldNodes, oldLayers);
        if (lvl === 0) return { ...rest, parentId: 'root' };
        const winId = windowByLevel[lvl];
        return { ...rest, parentId: winId !== undefined ? winId : 'root' };
    };

    const nodes = {};
    Object.entries(oldNodes).forEach(([k, n]) => { nodes[k] = migrateEntity(n); });
    const layers = {};
    Object.entries(oldLayers).forEach(([k, l]) => { layers[k] = migrateEntity(l); });

    return { ...proj, nodes, layers };
};

const migrateToV13 = (state) => {
    if (!state || (state.formatVersion || 0) >= FORMAT_VERSION_V13) return state;
    const projects = {};
    Object.entries(state.projects || {}).forEach(([pid, proj]) => {
        projects[pid] = proj ? migrateProjectEntitiesToV13(proj) : proj;
    });
    return { ...state, projects, formatVersion: FORMAT_VERSION_V13 };
};

// Плоский вид: глобальные поля + поля активного проекта (для компонентов и
// внутреннего редьюсера). Без активного проекта — безопасные пустые значения.
const mergeActiveView = (m) => {
    const view = { ...m };
    const p = m.activeProjectId ? m.projects[m.activeProjectId] : null;
    if (p) {
        PROJECT_FIELDS.forEach(f => { view[f] = p[f]; });
    } else {
        PROJECT_FIELDS.forEach(f => {
            const d = defaultState[f];
            view[f] = Array.isArray(d) ? [] : (d && typeof d === 'object' ? {} : d);
        });
        view.projectName = '';
    }
    return view;
};

const MULTI_META_FIELDS = ['projects', 'projectOrder', 'activeProjectId', 'projectCounter'];

// Правая кромка всех окон всех проектов на общем холсте (null — окон нет).
// Новый/импортированный проект встаёт правее неё, чтобы не лечь на чужие окна.
const PROJECT_SLOT_GAP = 300;
const globalRightEdge = (projects) => {
    let right = -Infinity;
    Object.values(projects || {}).forEach(p => {
        Object.values((p && p.levelWindows) || {}).forEach(w => {
            if (!w) return;
            const edge = ((w.position && w.position.x) || 0) + ((w.size && w.size.w) || LEVEL_WINDOW_DEFAULT_SIZE.w);
            if (edge > right) right = edge;
        });
    });
    return right === -Infinity ? null : right;
};

// Сдвиг всех окон проекта так, чтобы его колонка встала в (targetX, targetY)
const shiftProjectWindows = (proj, targetX, targetY) => {
    const anchor = projectWindowAnchor(proj.levelWindows);
    const dx = targetX - anchor.x;
    const dy = targetY - anchor.topY;
    if (dx === 0 && dy === 0) return proj;
    const shifted = {};
    Object.entries(proj.levelWindows || {}).forEach(([wid, w]) => {
        shifted[wid] = { ...w, position: { x: ((w.position && w.position.x) || 0) + dx, y: ((w.position && w.position.y) || 0) + dy } };
    });
    return { ...proj, levelWindows: shifted };
};


/**
 * Изоляция контейнеров не должна пережить удаление того, что изолировано:
 * иначе на экране не останется ни одного видимого контейнера, а вместе с ним и
 * кнопки, которой изоляция снимается. Чистится на уровне мультисостояния —
 * только там известны окна ВСЕХ проектов.
 * @param {Object} m мультисостояние
 * @returns {Object}
 */
const pruneContainerIsolation = (m) => {
    const ci = m && m.containerIsolation;
    const projList = (ci && ci.projectIds) || [];
    const winList = (ci && ci.windowIds) || [];
    if (projList.length === 0 && winList.length === 0) return m;

    const projects = m.projects || {};
    const allWindowIds = new Set();
    Object.keys(projects).forEach(pid => {
        const proj = projects[pid];
        Object.keys((proj && proj.levelWindows) || {}).forEach(wid => allWindowIds.add(wid));
    });

    const projectIds = projList.filter(id => projects[id]);
    const windowIds = winList.filter(id => allWindowIds.has(id));
    if (projectIds.length === projList.length && windowIds.length === winList.length) return m;
    return { ...m, containerIsolation: { projectIds, windowIds } };
};


/**
 * Плоский вид ПРОИЗВОЛЬНОГО проекта (не обязательно активного): нужен массовым
 * операциям, которые правят несколько проектов за один экшен.
 * @param {Object} m мультисостояние
 * @param {string} pid
 * @returns {?Object}
 */
const projectFlatView = (m, pid) => {
    const proj = m.projects && m.projects[pid];
    if (!proj) return null;
    const view = { ...m };
    PROJECT_FIELDS.forEach(f => { view[f] = proj[f]; });
    return view;
};

/**
 * Записать плоский вид обратно в проект.
 * @param {Object} m @param {string} pid @param {Object} flat
 * @returns {Object} новое мультисостояние
 */
const writeProjectView = (m, pid, flat) => {
    const proj = { ...m.projects[pid] };
    PROJECT_FIELDS.forEach(f => { proj[f] = flat[f]; });
    return { ...m, projects: { ...m.projects, [pid]: proj } };
};

/**
 * Делегирование внутреннему редьюсеру на плоском виде активного проекта.
 * Без активного проекта экшены сущностей игнорируются.
 * @param {Object} m @param {Object} action
 * @returns {Object}
 */
const delegateToActiveProject = (m, action) => {
    if (!m.activeProjectId || !m.projects[m.activeProjectId]) return m;
    const flatIn = mergeActiveView(m);
    const flatOut = reducer(flatIn, action);
    if (flatOut === flatIn) return m;
    // Подсостояние проекта пересобирается только если экшен реально менял поля
    // проекта — глобальные экшены (камера, ui) его не трогают
    const projectChanged = PROJECT_FIELDS.some(f => flatOut[f] !== flatIn[f]);
    const next = { ...m };
    if (projectChanged) {
        const proj = { ...m.projects[m.activeProjectId] };
        PROJECT_FIELDS.forEach(f => { proj[f] = flatOut[f]; });
        next.projects = { ...m.projects, [m.activeProjectId]: proj };
    }
    Object.keys(flatOut).forEach(k => {
        if (!PROJECT_FIELDS.includes(k) && !MULTI_META_FIELDS.includes(k)) next[k] = flatOut[k];
    });
    // Удаление окна уровня могло оставить изоляцию без видимых контейнеров
    return pruneContainerIsolation(next);
};

/**
 * Разбор выделения контейнеров: какие проекты и какие окна (с их проектами)
 * в нём участвуют. Понимает и канонические, и легаси-формы идентификаторов.
 * @param {Object} m @param {Array} selectedIds
 * @returns {{projectIds: string[], windows: Array<{projectId: string, windowId: string, levelIndex: number}>}}
 */
const resolveContainerSelection = (m, selectedIds) => {
    const projectIds = [];
    const windows = [];
    const seenProjects = new Set();
    const seenWindows = new Set();

    (selectedIds || []).forEach(sid => {
        if (typeof sid !== 'string') return;

        if (sid === SEL_LEGACY_PROJECT || sid.startsWith(SEL_PROJECT)) {
            const pid = sid === SEL_LEGACY_PROJECT ? m.activeProjectId : sid.slice(SEL_PROJECT.length);
            if (pid && m.projects[pid] && !seenProjects.has(pid)) {
                seenProjects.add(pid);
                projectIds.push(pid);
            }
            return;
        }

        let windowId = null;
        if (sid.startsWith(SEL_WINDOW)) {
            windowId = sid.slice(SEL_WINDOW.length);
        } else if (sid.startsWith(SEL_LEGACY_WINDOW)) {
            // Легаси-форма адресует окно НОМЕРОМ УРОВНЯ в активном проекте:
            // номер не уникален между проектами, поэтому только активный
            const idx = parseInt(sid.slice(SEL_LEGACY_WINDOW.length), 10);
            const proj = m.activeProjectId && m.projects[m.activeProjectId];
            if (proj && !Number.isNaN(idx)) {
                const win = Object.values(proj.levelWindows || {}).find(w => w && w.levelIndex === idx);
                if (win) windowId = win.id;
            }
        }
        if (!windowId || seenWindows.has(windowId)) return;

        // Окно ищется во всех проектах: id окон уникальны между проектами
        Object.keys(m.projects || {}).forEach(pid => {
            const win = m.projects[pid].levelWindows && m.projects[pid].levelWindows[windowId];
            if (win) {
                seenWindows.add(windowId);
                windows.push({ projectId: pid, windowId, levelIndex: win.levelIndex });
            }
        });
    });

    return { projectIds, windows };
};


/**
 * Полное удаление проекта. Вынесена из switch, чтобы массовое удаление могло
 * переиспользовать её напрямую: самовызов multiReducer ломает публикацию
 * top-level const в babel-standalone (см. AGENTS.md, правило Zero-Build).
 * @param {Object} m мультисостояние
 * @param {string} id
 * @returns {Object}
 */
const applyRemoveProject = (m, id) => {
    if (!id || !m.projects[id]) return m;
    const projects = { ...m.projects };
    delete projects[id];
    const projectOrder = m.projectOrder.filter(pid => pid !== id);
    let activeProjectId = m.activeProjectId;
    if (activeProjectId === id) {
        const idx = m.projectOrder.indexOf(id);
        activeProjectId = projectOrder[Math.min(idx, projectOrder.length - 1)] || null;
    }
    // Обозреватель удалённого проекта не должен остаться открытым
    const outlinerOpen = { ...((m.ui && m.ui.outlinerOpen) || {}) };
    delete outlinerOpen[id];
    // Изоляция удалённого проекта и его окон снимается: иначе на холсте не
    // осталось бы ни одного видимого контейнера — и кнопки выхода из изоляции
    return pruneContainerIsolation({
        ...m,
        projects, projectOrder, activeProjectId,
        ui: { ...m.ui, outlinerOpen },
        selectedIds: [], isolatedIds: []
    });
};

const multiReducer = (m, action) => {
    switch (action.type) {
        case 'FOR_PROJECT': {
            // Адресная доставка любого внутреннего экшена в КОНКРЕТНЫЙ проект,
            // не обязательно активный. Нужна массовым операциям над несколькими
            // проектами: без неё пришлось бы поочерёдно делать их активными,
            // дёргая камеру и выделение пользователя.
            const { projectId, action: inner } = action.payload || {};
            if (!projectId || !inner || !m.projects[projectId]) return m;
            const flatIn = projectFlatView(m, projectId);
            const flatOut = reducer(flatIn, inner);
            if (flatOut === flatIn) return m;
            const projectChanged = PROJECT_FIELDS.some(f => flatOut[f] !== flatIn[f]);
            const next = { ...m };
            if (projectChanged) {
                const proj = { ...m.projects[projectId] };
                PROJECT_FIELDS.forEach(f => { proj[f] = flatOut[f]; });
                next.projects = { ...m.projects, [projectId]: proj };
            }
            Object.keys(flatOut).forEach(k => {
                if (!PROJECT_FIELDS.includes(k) && !MULTI_META_FIELDS.includes(k)) next[k] = flatOut[k];
            });
            return pruneContainerIsolation(next);
        }
        case 'MOVE_LEVEL_WINDOW':
        case 'RESIZE_LEVEL_WINDOW':
        case 'UPDATE_LEVEL_PROPERTIES':
        case 'PAN_LEVEL_WINDOW':
        case 'ZOOM_LEVEL_WINDOW':
        case 'TOGGLE_LEVEL_COLLAPSE':
        case 'TOGGLE_LEVEL_NEIGHBORS':
        case 'CLEAR_LEVEL_WINDOW':
        case 'REMOVE_LEVEL_WINDOW': {
            const payload = action.payload || {};
            const winId = payload.windowId || (typeof payload.id === 'string' && !/^\d+$/.test(payload.id) ? payload.id : null);
            let targetPid = m.activeProjectId;
            if (winId && m.projects) {
                const found = Object.keys(m.projects).find(pid => {
                    const p = m.projects[pid];
                    return p && p.levelWindows && p.levelWindows[winId];
                });
                if (found) targetPid = found;
            }
            if (!targetPid || !m.projects[targetPid]) return delegateToActiveProject(m, action);
            const flatIn = projectFlatView(m, targetPid);
            const flatOut = reducer(flatIn, action);
            if (flatOut === flatIn) return m;
            return writeProjectView(m, targetPid, flatOut);
        }
        case 'DELETE_SELECTED': {
            // Массовое удаление КОНТЕЙНЕРОВ. Выделение сущностей графа сюда не
            // попадает: классы взаимоисключающи, поэтому Delete всегда однозначен.
            if (getSelectionClass(m.selectedIds) !== 'containers') {
                return delegateToActiveProject(m, action);
            }
            const { projectIds, windows } = resolveContainerSelection(m, m.selectedIds);
            if (projectIds.length === 0 && windows.length === 0) return m;

            let next = m;

            // 1. Окна уровней — только тех проектов, что не удаляются целиком.
            //    Внутри проекта идём СВЕРХУ ВНИЗ по номеру уровня: удаление окна
            //    поднимает нижние уровни на один, и при другом порядке номера
            //    разъехались бы. Весь набор по проекту — один шаг Undo.
            const doomedProjects = new Set(projectIds);
            const byProject = {};
            windows.forEach(w => {
                if (doomedProjects.has(w.projectId)) return;
                if (!byProject[w.projectId]) byProject[w.projectId] = [];
                byProject[w.projectId].push(w);
            });

            Object.keys(byProject).forEach(pid => {
                const list = byProject[pid].slice().sort((a, b) => b.levelIndex - a.levelIndex);
                let flat = projectFlatView(next, pid);
                if (!flat) return;
                flat = reducer(flat, {
                    type: 'BEGIN_HISTORY_BATCH',
                    payload: { logMessage: `Удалено уровней: ${list.length}` }
                });
                list.forEach(w => {
                    const win = flat.levelWindows && flat.levelWindows[w.windowId];
                    if (!win) return;
                    flat = applyRemoveLevelWindow(flat, win, true);
                });
                flat = reducer(flat, { type: 'COMMIT_HISTORY' });
                const remainingWins = Object.values(flat.levelWindows || {}).filter(Boolean);
                if (remainingWins.length === 0) {
                    next = applyRemoveProject(next, pid);
                } else {
                    next = writeProjectView(next, pid, flat);
                }
            });

            // 2. Проекты целиком
            projectIds.forEach(pid => { next = applyRemoveProject(next, pid); });

            return pruneContainerIsolation({ ...next, selectedIds: [] });
        }
        case 'ADD_PROJECT': {
            const n = (m.projectCounter || m.projectOrder.length) + 1;
            const id = newProjectId();
            let proj = makeProject(id, (action.payload && action.payload.name) || `Проект ${n}`);
            const right = globalRightEdge(m.projects);
            if (right !== null) proj = shiftProjectWindows(proj, right + PROJECT_SLOT_GAP, -400);
            return {
                ...m,
                projects: { ...m.projects, [id]: proj },
                projectOrder: [...m.projectOrder, id],
                activeProjectId: id,
                projectCounter: n,
                selectedIds: [],
                isolatedIds: []
            };
        }
        case 'ADD_PROJECT_FROM_FILE': {
            // Импорт = ДОБАВИТЬ проект, а не заменить: файл прогоняется через
            // внутренний LOAD_STATE на чистом плоском состоянии (все миграции
            // и нормализации старых форматов работают как раньше), результат
            // становится новым проектом правее существующих. Ремап id не
            // нужен: словари сущностей у каждого проекта свои, пересечений
            // не бывает (React-ключи окон неймспейсятся по id проекта).
            const data = action.payload;
            if (!data || !data.nodes || !data.ports || !data.links) return m;
            const base = {
                ...defaultState,
                nodes: {}, layers: {}, ports: {}, links: {},
                levelWindows: {}, levelViews: {},
                past: [], future: [], historyLogs: []
            };
            const loaded = reducer(base, { type: 'LOAD_STATE', payload: data });
            const n = (m.projectCounter || m.projectOrder.length) + 1;
            const id = newProjectId();
            let proj = { id, origin: { x: 0, y: 0 } };
            PROJECT_FIELDS.forEach(f => { proj[f] = loaded[f] !== undefined ? loaded[f] : defaultState[f]; });
            proj.projectName = loaded.projectName && loaded.projectName !== defaultState.projectName
                ? loaded.projectName
                : `Проект ${n} (импорт)`;
            proj.past = [];
            proj.future = [];
            proj.historyLogs = ['Проект импортирован из файла'];
            const right = globalRightEdge(m.projects);
            if (right !== null) proj = shiftProjectWindows(proj, right + PROJECT_SLOT_GAP, -400);
            return {
                ...m,
                projects: { ...m.projects, [id]: proj },
                projectOrder: [...m.projectOrder, id],
                activeProjectId: id,
                projectCounter: n,
                selectedIds: [],
                isolatedIds: []
            };
        }
        case 'REMOVE_PROJECT': {
            const id = (action.payload && action.payload.id) || m.activeProjectId;
            return applyRemoveProject(m, id);
        }
        case 'TOGGLE_PROJECT_OUTLINER': {
            const pid = typeof action.payload === 'string' ? action.payload : (action.payload && action.payload.id);
            if (!pid || !m.projects[pid]) return m;
            const cur = (m.ui && m.ui.outlinerOpen) || {};
            return { ...m, ui: { ...m.ui, outlinerOpen: { ...cur, [pid]: !cur[pid] } } };
        }
        case 'SET_ACTIVE_PROJECT': {
            const id = typeof action.payload === 'string' ? action.payload : (action.payload && action.payload.id);
            if (!id || !m.projects[id] || id === m.activeProjectId) return m;
            return { ...m, activeProjectId: id, selectedIds: [], isolatedIds: [] };
        }
        default:
            return delegateToActiveProject(m, action);
    }
};

// Начальное мультипроектное состояние: сохранённое v12 -> санитизация;
// иначе легаси (v9/v10/v11 через getInitialState) -> обёртка в один проект.
const getInitialMultiState = () => {
    if (typeof localStorage !== 'undefined') {
        try {
            const savedMulti = localStorage.getItem(STORAGE_KEY_V12);
            if (savedMulti) {
                const parsed = JSON.parse(savedMulti);
                if (parsed && parsed.projects && Array.isArray(parsed.projectOrder)) {
                    const projects = {};
                    Object.entries(parsed.projects).forEach(([pid, p]) => {
                        if (!p) return;
                        const norm = normalizeLevelWindows(p.levelWindows, p.nodes, p.layers, p.levelViews);
                        projects[pid] = {
                            ...p,
                            id: pid,
                            origin: p.origin || { x: 0, y: 0 },
                            links: normalizeLinks(p.links),
                            levelWindows: norm.levelWindows,
                            levelViews: norm.levelViews,
                            past: [], future: [],
                            historyLogs: p.historyLogs || ['Проект загружен']
                        };
                    });
                    const projectOrder = parsed.projectOrder.filter(pid => projects[pid]);
                    const activeProjectId = projects[parsed.activeProjectId]
                        ? parsed.activeProjectId
                        : (projectOrder[0] || null);
                    const ui = {
                        ...defaultState.ui,
                        ...(parsed.ui || {}),
                        dragDropMode: false,
                        aiAgentSettings: (() => {
                            const base = { ...defaultState.ui.aiAgentSettings, ...((parsed.ui && parsed.ui.aiAgentSettings) || {}) };
                            try {
                                const sep = localStorage.getItem('architector_api_key');
                                base.apiKey = sep || base.apiKey || '';
                            } catch (e) {}
                            return base;
                        })()
                    };
                    // migrateToV13 НЕ вызывается здесь намеренно: HierarchyUtils (getLevel,
                    // getEntityLevel, getDropTarget и др.) до Фазы 3 ещё читает
                    // ownerId/ownerGap/homeLevel — включить миграцию на живом старте
                    // раньше, чем ядро иерархии научится понимать чистый parentId, значит
                    // молча ломать уровень сирот-якорей (parentId станет id окна, а старый
                    // getLevel такое значение не распознает и посчитает уровень нулевым).
                    // Функция готова и покрыта тестами (migration.test.js) — подключение
                    // сюда и в LOAD_STATE/ADD_PROJECT_FROM_FILE переносится в конец Фазы 3.
                    return {
                        ...globalDefaults(),
                        canvas: parsed.canvas || defaultState.canvas,
                        aiChatHistory: parsed.aiChatHistory || defaultState.aiChatHistory,
                        aiChatHistoryByNode: parsed.aiChatHistoryByNode || {},
                        aiChatSessionsByNode: parsed.aiChatSessionsByNode || {},
                        ui,
                        projects,
                        projectOrder,
                        activeProjectId,
                        projectCounter: parsed.projectCounter || projectOrder.length,
                        selectedIds: [],
                        isolatedIds: [],
                        interactionMode: 'default',
                        pendingConnection: null,
                        dragGesture: null,
                        formatVersion: 12
                    };
                }
            }
        } catch (e) {
            console.error('Ошибка загрузки мультипроектного состояния:', e);
            try { localStorage.removeItem(STORAGE_KEY_V12); } catch (_) {}
        }
    }
    // Легаси-путь: getInitialState читает v11/v10/v9 и возвращает плоское состояние.
    // migrateToV13 намеренно не вызывается здесь — см. комментарий выше.
    return wrapFlatToMulti(getInitialState());
};

const ArchitectorStore = { isContainerSelectionId, containerSelectionKind, getSelectionClass, toggleSelectionWithClass, windowSelectionId, projectSelectionId, STORAGE_KEY, STORAGE_KEY_V12, LEGACY_STORAGE_KEY_V10, LEGACY_STORAGE_KEY_V9, FORMAT_VERSION, FORMAT_VERSION_V13, LEVEL0_WINDOW_ID, PROJECT_FIELDS, defaultState, getInitialState, getInitialMultiState, reducer, multiReducer, mergeActiveView, projectFlatView, writeProjectView, wrapFlatToMulti, makeProject, saveHistory, migrateToV10, migrateToV11, migrateToV13, normalizeLevelWindows };
if (typeof window !== 'undefined') window.ArchitectorStore = ArchitectorStore;
if (typeof module !== 'undefined') module.exports = ArchitectorStore;
