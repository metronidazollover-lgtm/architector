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
 * v13 (docs/IDEAL_INTERACTIONS.md §1): parentId — единственный источник родства.
 * `'root'`, id слоя И id узла (порождение подуровня) — все три одинаково валидны
 * напрямую, без расщепления на ownerId. Нормализация живёт в одном месте: её
 * проходят и тулбар, и ИИ-агент, и импорт, поэтому ни один путь создания
 * сущности не заводит устаревшее поле ownerId у новых сущностей.
 *
 * Безопасно с REMOVE_LEVEL_WINDOW/CLEAR_LEVEL_WINDOW/REMOVE_ROOT_CANVAS —
 * их ре-якорение потомков понимает и ownerId (v11), и parentId-на-узел (v13)
 * одинаково через structuralParentOf (см. коммит, переписавший обе функции).
 */
const normalizeContainer = (entity) => {
    if (!entity) return entity;
    return { ...entity, parentId: entity.parentId || 'root' };
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
    // Незаведённые внешние шлюзы (Фаза 6.2): половины кросс-проектных связей,
    // чей второй конец сейчас не загружен — экспорт/удаление проекта на другой
    // стороне. Ключ — id исходной живой crossProjectLinks-записи (реконсиляция
    // при повторной загрузке обеих половин ищет совпадение по этому же id).
    pendingGateways: {},
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
    // Живые сквозные связи между проектами (Фаза 6.1): глобальное поле — сама
    // связь не принадлежит ни одному из двух проектов, которые соединяет.
    // Вне истории Undo проектов: см. AGENTS.md, «Кросс-проектные операции».
    crossProjectLinks: {},
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

/**
 * Структурный родитель сущности («на уровень выше через УЗЕЛ», семантический
 * шаг v13, см. docs/IDEAL_INTERACTIONS.md §1.1) — единообразно для ещё не
 * мигрированных v11-сущностей (ownerId) и уже v13-сущностей (parentId
 * указывает прямо на узел, что сегодня может произойти только через
 * REPARENT_ENTITY — TRANSFER_NODE/CREATE_NESTED_NODE пока всегда пишут
 * ownerId). parentId, указывающий на СЛОЙ, — координата, не родство,
 * сюда не попадает (слои не меняют уровень, см. правило семантического шага).
 * @param {Object} entity
 * @param {Object<string, Object>} nodes
 * @returns {?string}
 */
const structuralParentOf = (entity, nodes) => {
    if (entity.ownerId) return entity.ownerId;
    if (entity.parentId && entity.parentId !== 'root' && nodes && nodes[entity.parentId]) return entity.parentId;
    return null;
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

    // 2. Выжившие сущности; осиротевшие структурные цепочки пере-якорятся.
    // structuralParentOf унифицирует ownerId (v11) и parentId-на-узел (v13,
    // сегодня возможно только через REPARENT_ENTITY) — «внук — деду» работает
    // одинаково независимо от того, какой цепочкой сущность сюда попала.
    // v11 несёт свою дистанцию до родителя в ownerGap; v13 (нет ownerId) её не
    // хранит вовсе — расстояние всегда ровно 1 по определению модели.
    const gapOf2 = (ent) => (ent && ent.ownerId ? gapOf(ent) : 1);

    const reanchor = (entity) => {
        let e = entity;
        const myParent = structuralParentOf(e, state.nodes);
        if (myParent && removedIds.has(myParent)) {
            const deadParent = (state.nodes && state.nodes[myParent]) || (state.layers && state.layers[myParent]);
            const grandparent = deadParent ? structuralParentOf(deadParent, state.nodes) : null;
            // v13 (нет ownerId у e): прямая ссылка parentId=дед безопасна ТОЛЬКО
            // если реальная дистанция дед→мёртвый родитель ровно 1 — иначе v13
            // не может выразить растянутую дистанцию (gap у неё не существует)
            // и сущность обязана явно заякориться (см. else-ветку), как и
            // migrateToV13 делает для ownerGap > 1.
            const canDirectLink = !!e.ownerId || gapOf2(deadParent) === 1;
            if (grandparent && !removedIds.has(grandparent) && canDirectLink) {
                if (e.ownerId) {
                    // «Внук — деду» (v11): дистанции складываются, минус один снятый уровень
                    e = withGap({ ...e, ownerId: grandparent }, gapOf(e) + gapOf(deadParent) - 1);
                } else {
                    // v13: связь всегда прямая (дистанция ровно 1, gap не существует)
                    e = { ...e, parentId: grandparent };
                }
            } else {
                // Родитель был корневым/сиротой-якорем удаляемого уровня:
                // ребёнок сам становится якорем на ТЕКУЩЕМ уровне (removedLevel +
                // дистанция); общий блок сдвига якорей ниже опустит значение на
                // один вместе с остальными уровнями — двойного сдвига нет.
                // Мёртвую parentId-ссылку (если структурная связь была через
                // parentId, не ownerId) тоже нужно снять — homeLevel становится
                // единственным источником уровня сироты-якоря.
                e = withGap({
                    ...e,
                    ownerId: null,
                    homeLevel: removedLevel + gapOf2(e),
                    ...(e.ownerId ? {} : { parentId: 'root' })
                }, 1);
            }
        } else if (myParent) {
            // Родитель жив. Если связь через поколение (только ownerId, v11)
            // ПЕРЕПРЫГИВАЛА удаляемый уровень, дистанция сокращается на один
            // вместе со сдвигом уровней. v13 (parentId-на-узел): дистанция
            // всегда ровно 1 по определению, «перепрыгивания» не бывает.
            if (e.ownerId) {
                const ownerLvl = levelOf(myParent);
                const myLvl = levelOf(e.id);
                if (ownerLvl < removedLevel && myLvl > removedLevel) {
                    e = withGap({ ...e }, gapOf(e) - 1);
                }
            }
        }
        // Координатный контейнер (СЛОЙ) удалён — сущность встаёт на холст
        // уровня. Узел уже обработан выше (структурная ветка) — здесь остаются
        // только слои (и живой parentId, не заменённый на grandparent/'root' там).
        if (e.parentId && e.parentId !== 'root' && removedIds.has(e.parentId) && !(state.nodes && state.nodes[e.parentId])) {
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

// =============================================================================
// v14 (Фаза 3, «Отчеты, аудиты, планы/Lanes_v14/PLAN_V14_LANES.md» §3/§7.12/§7.13).
// Обработчики экшенов дорожек/окон/рамок. Добавлено АДДИТИВНО в тот же
// switch — старые v13-обработчики (MOVE_LEVEL_WINDOW, UPDATE_LEVEL_PROPERTIES,
// TOGGLE_LEVEL_COLLAPSE, PAN/ZOOM_LEVEL_WINDOW, ALIGN_LEVEL_WINDOWS,
// CLEAR_PROJECT, DELETE_SELECTED и т.д.) НЕ входят в список «Удаляются» этой
// фазы и остаются нетронутыми — их продолжают вызывать normalizeLevelWindows/
// migrateProjectEntitiesToV13 (через getInitialMultiState -> migrateToV13) и
// компоненты Layer.js/LevelWindow.js вплоть до конца Фазы 4. Экшены ниже
// работают ИСКЛЮЧИТЕЛЬНО с v14-полями состояния (nodes/frames/windows) —
// на живом v13-состоянии (без frames/windows) они безопасно no-op'ят на
// пустых словарях, а не падают.
// =============================================================================

const WINDOW_SIZE_V14 = { w: 1000, h: 700 };
const WINDOW_GAP_V14 = 80;
const WINDOW_COLUMN_GAP_V14 = 60;
const FRAME_PAD_V14 = 20;

/** Колонка дорожки по глубине (§0.4.2 плана): root — колонка 0, дорожка узла — depth(узла)+1. */
const laneColumnV14 = (ownerId, nodes) => {
    if (!ownerId || ownerId === 'root') return 0;
    const H = getHierarchy();
    return (H ? H.getDepth(ownerId, nodes) : 0) + 1;
};

/**
 * Место для НОВОГО окна данной колонки: под нижней кромкой самого нижнего
 * окна той же колонки, иначе — правее самой правой существующей колонки.
 * «Переполнение колонки» не подгоняется под экран (решение §7.1.2 плана) —
 * пользователь скроллит и двигает окна сам.
 */
const windowColumnAnchorV14 = (windows, nodes, column) => {
    const list = Object.values(windows || {}).filter(Boolean);
    const columnOf = (w) => {
        const first = (w.lanes || [])[0];
        return first === undefined ? 0 : laneColumnV14(first, nodes);
    };
    const sameColumn = list.filter(w => columnOf(w) === column);
    if (sameColumn.length) {
        let bottomY = -Infinity, x = 0;
        sameColumn.forEach(w => {
            const wy = (w.position && w.position.y) || 0;
            const wh = (w.size && w.size.h) || WINDOW_SIZE_V14.h;
            if (wy + wh > bottomY) { bottomY = wy + wh; x = (w.position && w.position.x) || 0; }
        });
        return { x, y: bottomY + WINDOW_GAP_V14 };
    }
    let maxRight = -Infinity;
    list.forEach(w => {
        const wx = (w.position && w.position.x) || 0;
        const ww = (w.size && w.size.w) || WINDOW_SIZE_V14.w;
        if (wx + ww > maxRight) maxRight = wx + ww;
    });
    if (maxRight === -Infinity) return { x: 0, y: 0 };
    return { x: maxRight + WINDOW_COLUMN_GAP_V14, y: 0 };
};

/** Новый v14-объект окна с одной дорожкой lanes:[ownerId]. */
const makeWindowV14 = (id, ownerId, position) => ({
    id, lanes: [ownerId], hidden: [], frameId: null,
    position, size: { ...WINDOW_SIZE_V14 },
    camera: { offset: { x: 0, y: 0 }, zoom: 1 }, collapsed: false,
    name: '', color: '', fontFamily: 'Inter, sans-serif', fontSize: 14
});

/**
 * OPEN_LANE, разделяемая с CREATE_NESTED_NODE (там дорожка родителя должна
 * открыться автоматически, если её ещё нигде нет — §0.4.3 плана). Если
 * `windowId` задан — дорожка добавляется в ЕГО lanes (составное окно);
 * иначе — открывается в НОВОМ окне, только если дорожка нигде не открыта.
 * @returns {Object<string, WindowEntity>} обновлённый state.windows
 */
const applyOpenLaneV14 = (windows, nodes, ownerId, windowId) => {
    const H = getHierarchy();
    if (windowId && windows[windowId]) {
        const win = windows[windowId];
        if ((win.lanes || []).includes(ownerId)) return windows;
        return { ...windows, [windowId]: { ...win, lanes: [...(win.lanes || []), ownerId] } };
    }
    if (H && H.windowsOfLane(ownerId, windows).length > 0) return windows;
    const column = laneColumnV14(ownerId, nodes);
    const anchor = windowColumnAnchorV14(windows, nodes, column);
    const id = newWindowId();
    return { ...windows, [id]: makeWindowV14(id, ownerId, anchor) };
};

/** Убирает окно, если после операции у него не осталось дорожек и это не окно рамки. */
const dropIfEmptyWindowV14 = (windows, windowId) => {
    const win = windows[windowId];
    if (!win) return windows;
    if ((win.lanes || []).length > 0 || win.frameId) return windows;
    const next = { ...windows };
    delete next[windowId];
    return next;
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
        // v14: ADD_NODE переписан на месте (§7.12 — тот же action.type, новое
        // тело) — parentId только 'root' или id узла (слоя как цели больше нет),
        // авторасстановка внутри слоя и normalizeLevelWindows убраны: дорожка
        // не создаётся неявно при ADD_NODE (§0.4.3 плана — только явным
        // действием или дропом на карточку через REPARENT_ENTITY/CREATE_NESTED_NODE).
        case 'ADD_NODE': {
            const id = action.payload.id || 'node-' + Date.now() + Math.floor(Math.random() * 1000);
            const historyState = saveHistory(state, `Добавлен узел: ${action.payload.name}`);
            const rawParentId = action.payload.parentId;
            const parentId = (rawParentId && rawParentId !== 'root' && state.nodes && state.nodes[rawParentId]) ? rawParentId : 'root';

            const nodeData = normalizeContainer({ ...action.payload, id, parentId, snapToGrid: true });
            if (nodeData.type !== 'ai-agent') {
                nodeData.size = calculateNodeSize(nodeData.name, nodeData.content, nodeData.mediaUrl, nodeData.mediaHeight, nodeData.fontSize, nodeData.fontFamily);
            } else if (!nodeData.size) {
                nodeData.size = { w: 380, h: 480 };
            }

            const nodes = { ...state.nodes, [id]: nodeData };
            return {
                ...state,
                ...historyState,
                nodes,
                selectedIds: [id]
            };
        }

        // --- v14: окна и дорожки (§3/§7.6/§7.8 плана) --------------------------

        case 'OPEN_LANE': {
            const { ownerId, windowId } = action.payload || {};
            if (!ownerId || (ownerId !== 'root' && !(state.nodes && state.nodes[ownerId]))) return state;
            const windows = applyOpenLaneV14(state.windows || {}, state.nodes, ownerId, windowId);
            if (windows === (state.windows || {})) return state;
            const label = ownerId === 'root' ? 'Проект' : ((state.nodes[ownerId] && state.nodes[ownerId].name) || ownerId);
            return { ...state, ...saveHistory(state, `Открыта дорожка «${label}»`), windows };
        }
        case 'CLOSE_LANE': {
            const { windowId, ownerId } = action.payload || {};
            const win = state.windows && state.windows[windowId];
            if (!win || !(win.lanes || []).includes(ownerId)) return state;
            const historyState = saveHistory(state, 'Дорожка закрыта');
            const lanes = win.lanes.filter(l => l !== ownerId);
            const hidden = (win.hidden || []).filter(l => l !== ownerId);
            let windows = { ...state.windows, [windowId]: { ...win, lanes, hidden } };
            windows = dropIfEmptyWindowV14(windows, windowId);
            return { ...state, ...historyState, windows };
        }
        case 'DOCK_LANE': {
            const { ownerId, fromWindowId, toWindowId, index } = action.payload || {};
            const fromWin = state.windows && state.windows[fromWindowId];
            const toWin = state.windows && state.windows[toWindowId];
            if (!ownerId || !fromWin || !toWin || fromWindowId === toWindowId) return state;
            if (!(fromWin.lanes || []).includes(ownerId)) return state;
            const historyState = saveHistory(state, 'Дорожка пристыкована к другому окну');
            let windows = { ...state.windows };
            windows[fromWindowId] = { ...fromWin, lanes: fromWin.lanes.filter(l => l !== ownerId), hidden: (fromWin.hidden || []).filter(l => l !== ownerId) };
            if ((toWin.lanes || []).includes(ownerId)) {
                windows[toWindowId] = toWin;
            } else {
                const arr = [...(toWin.lanes || [])];
                const at = (typeof index === 'number') ? Math.max(0, Math.min(index, arr.length)) : arr.length;
                arr.splice(at, 0, ownerId);
                windows[toWindowId] = { ...toWin, lanes: arr };
            }
            windows = dropIfEmptyWindowV14(windows, fromWindowId);
            return { ...state, ...historyState, windows };
        }
        case 'DETACH_LANE': {
            const { windowId, ownerId } = action.payload || {};
            const win = state.windows && state.windows[windowId];
            if (!win || !(win.lanes || []).includes(ownerId)) return state;
            const historyState = saveHistory(state, 'Дорожка отстыкована в своё окно');
            let windows = { ...state.windows, [windowId]: { ...win, lanes: win.lanes.filter(l => l !== ownerId), hidden: (win.hidden || []).filter(l => l !== ownerId) } };
            windows = dropIfEmptyWindowV14(windows, windowId);
            const column = laneColumnV14(ownerId, state.nodes);
            const anchor = windowColumnAnchorV14(windows, state.nodes, column);
            const newId = newWindowId();
            windows[newId] = makeWindowV14(newId, ownerId, anchor);
            return { ...state, ...historyState, windows };
        }
        case 'REORDER_LANE': {
            const { windowId, ownerId, toIndex } = action.payload || {};
            const win = state.windows && state.windows[windowId];
            if (!win || !(win.lanes || []).includes(ownerId) || typeof toIndex !== 'number') return state;
            const lanes = win.lanes.filter(l => l !== ownerId);
            const at = Math.max(0, Math.min(toIndex, lanes.length));
            lanes.splice(at, 0, ownerId);
            return { ...state, windows: { ...state.windows, [windowId]: { ...win, lanes } } };
        }
        case 'TOGGLE_LANE_HIDDEN': {
            const { windowId, ownerId } = action.payload || {};
            const win = state.windows && state.windows[windowId];
            if (!win || !(win.lanes || []).includes(ownerId)) return state;
            const hidden = (win.hidden || []).includes(ownerId)
                ? win.hidden.filter(l => l !== ownerId)
                : [...(win.hidden || []), ownerId];
            return { ...state, windows: { ...state.windows, [windowId]: { ...win, hidden } } };
        }
        case 'OPEN_FRAME_WINDOW': {
            const { frameId } = action.payload || {};
            const frame = state.frames && state.frames[frameId];
            if (!frame) return state;
            if (Object.values(state.windows || {}).some(w => w && w.frameId === frameId)) return state;
            const historyState = saveHistory(state, `Открыта рамка «${frame.name || frameId}» как окно`);
            const memberLanes = Array.from(new Set((frame.members || [])
                .map(mid => state.nodes[mid] && (state.nodes[mid].parentId || 'root'))
                .filter(Boolean)));
            const primaryLane = memberLanes[0] || 'root';
            const anchor = windowColumnAnchorV14(state.windows, state.nodes, laneColumnV14(primaryLane, state.nodes));
            const id = newWindowId();
            const win = { ...makeWindowV14(id, primaryLane, anchor), lanes: memberLanes.length ? memberLanes : [primaryLane], frameId, name: frame.name || '' };
            return { ...state, ...historyState, windows: { ...(state.windows || {}), [id]: win } };
        }
        case 'CLOSE_WINDOW': {
            const { windowId } = action.payload || {};
            if (!state.windows || !state.windows[windowId]) return state;
            const historyState = saveHistory(state, 'Окно закрыто');
            const windows = { ...state.windows };
            delete windows[windowId];
            return { ...state, ...historyState, windows };
        }
        case 'MOVE_WINDOW': {
            const { windowId, dx = 0, dy = 0, position } = action.payload || {};
            const win = state.windows && state.windows[windowId];
            if (!win) return state;
            const pos = position || { x: (win.position.x || 0) + dx, y: (win.position.y || 0) + dy };
            return { ...state, windows: { ...state.windows, [windowId]: { ...win, position: pos } } };
        }
        case 'RESIZE_WINDOW': {
            const { windowId, size } = action.payload || {};
            const win = state.windows && state.windows[windowId];
            if (!win || !size) return state;
            const MIN_W = 260, MIN_H = 180; // не меньше одной карточки (§7.1.5)
            return { ...state, windows: { ...state.windows, [windowId]: { ...win, size: { w: Math.max(MIN_W, size.w), h: Math.max(MIN_H, size.h) } } } };
        }
        case 'PAN_WINDOW': {
            const { windowId, offset } = action.payload || {};
            const win = state.windows && state.windows[windowId];
            if (!win || !offset) return state;
            return { ...state, windows: { ...state.windows, [windowId]: { ...win, camera: { ...win.camera, offset } } } };
        }
        case 'ZOOM_WINDOW': {
            const { windowId, zoom, offset } = action.payload || {};
            const win = state.windows && state.windows[windowId];
            if (!win) return state;
            const camera = { ...win.camera };
            if (typeof zoom === 'number') camera.zoom = zoom;
            if (offset) camera.offset = offset;
            return { ...state, windows: { ...state.windows, [windowId]: { ...win, camera } } };
        }
        case 'TOGGLE_WINDOW_COLLAPSE': {
            const { windowId } = action.payload || {};
            const win = state.windows && state.windows[windowId];
            if (!win) return state;
            return { ...state, windows: { ...state.windows, [windowId]: { ...win, collapsed: !win.collapsed } } };
        }
        case 'TOGGLE_WINDOW_MAXIMIZE': {
            // viewport — мировой прямоугольник вьюпорта на момент разворота
            // (пересчитывается компонентом из камеры мирового холста, Фаза 4);
            // редьюсер сам пиксельной геометрией не занимается.
            const { windowId, viewport } = action.payload || {};
            const win = state.windows && state.windows[windowId];
            if (!win) return state;
            const historyState = saveHistory(state, win.preMaximize ? 'Окно возвращено из полноэкранного режима' : 'Окно развёрнуто на весь экран');
            let nextWin;
            if (win.preMaximize) {
                nextWin = { ...win, position: win.preMaximize.position, size: win.preMaximize.size, preMaximize: null };
            } else {
                const vp = viewport || { x: win.position.x, y: win.position.y, w: win.size.w, h: win.size.h };
                nextWin = { ...win, preMaximize: { position: win.position, size: win.size }, position: { x: vp.x, y: vp.y }, size: { w: vp.w, h: vp.h } };
            }
            return { ...state, ...historyState, windows: { ...state.windows, [windowId]: nextWin } };
        }
        case 'NEW_EMPTY_WINDOW': {
            // Переделка кнопки «Уровень» (§7.1.4): пустое окно про запас, не
            // привязанное ни к одной дорожке — НЕ закрывается автоматически.
            const historyState = saveHistory(state, 'Создано новое пустое окно');
            const id = newWindowId();
            const anchor = windowColumnAnchorV14(state.windows, state.nodes, 0);
            const win = { id, lanes: [], hidden: [], frameId: null, position: anchor, size: { ...WINDOW_SIZE_V14 }, camera: { offset: { x: 0, y: 0 }, zoom: 1 }, collapsed: false, name: 'Новое окно', color: '', fontFamily: 'Inter, sans-serif', fontSize: 14 };
            return { ...state, ...historyState, windows: { ...(state.windows || {}), [id]: win } };
        }
        case 'ALIGN_WINDOWS': {
            const windows = state.windows || {};
            if (!Object.keys(windows).length) return state;
            const historyState = saveHistory(state, 'Окна разложены по колонкам');
            const columnOf = (w) => { const first = (w.lanes || [])[0]; return first === undefined ? 0 : laneColumnV14(first, state.nodes); };
            const byColumn = {};
            Object.values(windows).forEach(w => { if (!w) return; const c = columnOf(w); (byColumn[c] = byColumn[c] || []).push(w); });
            const columns = Object.keys(byColumn).map(Number).sort((a, b) => a - b);
            const next = { ...windows };
            let x = 0;
            columns.forEach(c => {
                const list = byColumn[c].slice().sort((a, b) => (a.position.y || 0) - (b.position.y || 0));
                let y = 0, maxW = 0;
                list.forEach(w => { maxW = Math.max(maxW, (w.size && w.size.w) || WINDOW_SIZE_V14.w); });
                list.forEach(w => {
                    next[w.id] = { ...w, position: { x, y } };
                    y += ((w.size && w.size.h) || WINDOW_SIZE_V14.h) + WINDOW_GAP_V14;
                });
                x += maxW + WINDOW_COLUMN_GAP_V14;
            });
            return { ...state, ...historyState, windows: next };
        }
        case 'UPDATE_WINDOW_PROPERTIES': {
            const { windowId, updates, skipHistory } = action.payload || {};
            const win = state.windows && state.windows[windowId];
            if (!win || !updates) return state;
            const { offset, zoom, collapsed, ...frameUpdates } = updates;
            let nextWin = win;
            if (offset !== undefined || zoom !== undefined || collapsed !== undefined) {
                nextWin = {
                    ...nextWin,
                    camera: { ...nextWin.camera, ...(offset !== undefined ? { offset } : {}), ...(zoom !== undefined ? { zoom } : {}) },
                    ...(collapsed !== undefined ? { collapsed } : {})
                };
            }
            const hasFrameChange = Object.keys(frameUpdates).length > 0;
            if (hasFrameChange) nextWin = { ...nextWin, ...frameUpdates };
            const windows = { ...state.windows, [windowId]: nextWin };
            // Камера — вне истории всегда; свойства окна (имя/цвет/шрифт) — в
            // истории (аналог старого UPDATE_LEVEL_PROPERTIES).
            const historyState = (hasFrameChange && !skipHistory) ? saveHistory(state, 'Изменены свойства окна') : {};
            return { ...state, ...historyState, windows };
        }
        case 'SET_ACTIVE_LANE': {
            const p = action.payload;
            return { ...state, activeLaneId: (typeof p === 'string' ? p : (p && p.ownerId)) || null };
        }
        case 'SET_ACTIVE_FRAME': {
            const p = action.payload;
            return { ...state, activeFrameId: (typeof p === 'string' ? p : (p && p.frameId)) || null };
        }

        // --- v14: рамки (§3/§7.3/§7.9/§7.10 плана) -----------------------------

        case 'ADD_FRAME': {
            const p = action.payload || {};
            const members = Array.isArray(p.members) ? p.members.filter(mid => state.nodes && state.nodes[mid]) : [];
            const id = p.id || 'frame-' + Date.now() + Math.floor(Math.random() * 1000);
            const homeLaneId = p.homeLaneId || (members.length ? (state.nodes[members[0]].parentId || 'root') : null);
            const name = p.name || 'Новая рамка';
            const historyState = saveHistory(state, `Добавлена рамка «${name}»`);
            const frame = {
                id, name, content: p.content || '', color: p.color || '#0284c7',
                fontFamily: p.fontFamily, fontSize: p.fontSize, snapToGrid: true,
                members, homeLaneId
            };
            return { ...state, ...historyState, frames: { ...(state.frames || {}), [id]: frame }, selectedIds: [id] };
        }
        case 'UPDATE_FRAME': {
            const { id, updates, skipHistory } = action.payload || {};
            const frame = state.frames && state.frames[id];
            if (!frame || !updates) return state;
            const historyState = skipHistory ? {} : saveHistory(state, `Изменена рамка «${frame.name || id}»`);
            return { ...state, ...historyState, frames: { ...state.frames, [id]: { ...frame, ...updates } } };
        }
        case 'REMOVE_FRAME': {
            const id = (typeof action.payload === 'string') ? action.payload : (action.payload && action.payload.id);
            const frame = state.frames && state.frames[id];
            if (!frame) return state;
            const historyState = saveHistory(state, `Удалена рамка «${frame.name || id}»`);
            const frames = { ...state.frames };
            delete frames[id];
            const portsToRemove = Object.values(state.ports || {}).filter(p => p && p.nodeId === id).map(p => p.id);
            const ports = { ...state.ports };
            portsToRemove.forEach(pid => delete ports[pid]);
            const links = { ...state.links };
            Object.keys(links).forEach(lid => {
                const l = links[lid];
                if (l && (portsToRemove.includes(l.sourcePortId) || portsToRemove.includes(l.targetPortId))) delete links[lid];
            });
            const windows = { ...(state.windows || {}) };
            Object.keys(windows).forEach(wid => { if (windows[wid] && windows[wid].frameId === id) delete windows[wid]; });
            return { ...state, ...historyState, frames, ports, links, windows, selectedIds: state.selectedIds.filter(sid => sid !== id) };
        }
        case 'FRAME_ADD_MEMBERS': {
            const { frameId, ids } = action.payload || {};
            const frame = state.frames && state.frames[frameId];
            if (!frame || !Array.isArray(ids)) return state;
            const toAdd = ids.filter(mid => state.nodes[mid] && !frame.members.includes(mid));
            if (!toAdd.length) return state;
            const historyState = saveHistory(state, `Добавлено в рамку «${frame.name || frameId}»: ${toAdd.length}`);
            const members = [...frame.members, ...toAdd];
            const homeLaneId = frame.homeLaneId || (state.nodes[toAdd[0]].parentId || 'root');
            return { ...state, ...historyState, frames: { ...state.frames, [frameId]: { ...frame, members, homeLaneId } } };
        }
        case 'FRAME_REMOVE_MEMBERS': {
            const { frameId, ids } = action.payload || {};
            const frame = state.frames && state.frames[frameId];
            if (!frame || !Array.isArray(ids)) return state;
            const removeSet = new Set(ids);
            if (!frame.members.some(mid => removeSet.has(mid))) return state;
            const historyState = saveHistory(state, `Убрано из рамки «${frame.name || frameId}»`);
            // Опустевшая рамка не удаляется автоматически (§7.3.4) — остаётся заготовкой.
            return { ...state, ...historyState, frames: { ...state.frames, [frameId]: { ...frame, members: frame.members.filter(mid => !removeSet.has(mid)) } } };
        }
        case 'MOVE_FRAGMENT': {
            const { frameId, ownerId, dx = 0, dy = 0, skipHistory } = action.payload || {};
            const frame = state.frames && state.frames[frameId];
            if (!frame) return state;
            const members = frame.members.filter(mid => state.nodes[mid] && (state.nodes[mid].parentId || 'root') === ownerId);
            if (!members.length) return state;
            const historyState = skipHistory ? {} : saveHistory(state, `Перемещён кусок рамки «${frame.name || frameId}»`);
            const nodes = { ...state.nodes };
            members.forEach(mid => {
                const n = nodes[mid];
                nodes[mid] = { ...n, position: { x: Math.max(0, (n.position.x || 0) + dx), y: Math.max(0, (n.position.y || 0) + dy) } };
            });
            return { ...state, ...historyState, nodes };
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
        case 'UPDATE_PENDING_GATEWAY_PROXY': {
            // Ручное положение прокси НЕПРИМИРЁННОГО штекера (Фаза 6.2) — тот же
            // смысл, что UPDATE_PROXY_PORT, но хранится в pendingGateways[linkId]:
            // второй половины связи ещё нет, писать в state.links/crossProjectLinks
            // некуда. Проектное поле — в отличие от crossProjectLinks, полностью
            // локально одному проекту, поэтому спокойно участвует в его Undo.
            const { linkId, edge, fraction, skipHistory } = action.payload || {};
            if (!linkId || !state.pendingGateways || !state.pendingGateways[linkId]) return state;
            if (!['top', 'bottom', 'left', 'right'].includes(edge)) return state;
            const f2 = Math.max(0.03, Math.min(0.97, Number(fraction)));
            if (Number.isNaN(f2)) return state;
            const gw = state.pendingGateways[linkId];
            const historyState2 = skipHistory ? {} : saveHistory(state, 'Перемещён штекер связи');
            return {
                ...state,
                ...historyState2,
                pendingGateways: { ...state.pendingGateways, [linkId]: { ...gw, edge, fraction: f2 } }
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
        // v14: REMOVE_NODE переписан на месте (§7.12) — по умолчанию каскад
        // всей ветки (было: «плоское» удаление без потомков); keepChildren:true —
        // прямые дети усыновляются дедом с findFreePosition, как Shallow у
        // REPARENT_ENTITY (§3 плана, операция Delete/Clear).
        case 'REMOVE_NODE': {
            const p = (typeof action.payload === 'string') ? { id: action.payload } : (action.payload || {});
            const nodeId = p.id;
            const node = state.nodes && state.nodes[nodeId];
            if (!node) return state;
            const historyState = saveHistory(state, `Удалён узел «${node.name || nodeId}»`);
            const G = getGeometry();
            const byParent = getHierarchy().getChildrenByParent(state.nodes);

            const nodes = { ...state.nodes };
            const idsToDelete = new Set([nodeId]);

            if (p.keepChildren) {
                const oldParentId = node.parentId || 'root';
                const directChildren = byParent[nodeId] || [];
                const siblingRects = (byParent[oldParentId] || [])
                    .filter(n => n.id !== nodeId)
                    .map(n => ({ x: n.position.x, y: n.position.y, w: (n.size && n.size.w) || 200, h: (n.size && n.size.h) || 100 }));
                directChildren.forEach(child => {
                    const pos = G.findFreePosition(child.size, child.position, siblingRects);
                    siblingRects.push({ x: pos.x, y: pos.y, w: (child.size && child.size.w) || 200, h: (child.size && child.size.h) || 100 });
                    nodes[child.id] = { ...child, parentId: oldParentId, position: pos };
                });
            } else {
                // Каскад: вся ветка потомков по цепочке parentId.
                let frontier = [nodeId];
                while (frontier.length) {
                    const next = [];
                    frontier.forEach(pid => (byParent[pid] || []).forEach(child => { idsToDelete.add(child.id); next.push(child.id); }));
                    frontier = next;
                }
            }
            idsToDelete.forEach(id => delete nodes[id]);

            const ports = { ...state.ports };
            const portsToRemove = [];
            Object.values(state.ports || {}).forEach(port => { if (port && idsToDelete.has(port.nodeId)) { portsToRemove.push(port.id); delete ports[port.id]; } });

            const links = { ...state.links };
            Object.keys(links).forEach(lid => {
                const l = links[lid];
                if (l && (portsToRemove.includes(l.sourcePortId) || portsToRemove.includes(l.targetPortId))) delete links[lid];
            });

            // Узел (и вся удалённая ветка) выходит из членства во всех рамках.
            const frames = { ...(state.frames || {}) };
            Object.keys(frames).forEach(fid => {
                const f = frames[fid];
                if (f && f.members.some(mid => idsToDelete.has(mid))) {
                    frames[fid] = { ...f, members: f.members.filter(mid => !idsToDelete.has(mid)) };
                }
            });

            return {
                ...state,
                ...historyState,
                nodes,
                ports,
                links,
                frames,
                selectedIds: state.selectedIds.filter(sid => !idsToDelete.has(sid))
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
        // v14: MASS_UPDATE переписан на месте (Фаза 4 — все вызывающие места,
        // ContextActionBar.js/AIAgentNodeContent.js, переписываются в этой же
        // фазе) — слоёв больше нет, вместо них рамки (frames); контракт не
        // меняется (ids/updates/updatesById).
        case 'MASS_UPDATE': {
            const { ids, updates, updatesById } = action.payload;
            const historyState = saveHistory(state, `Массовое изменение элементов`);
            const newNodes = { ...state.nodes };
            const newFrames = { ...(state.frames || {}) };
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
                else if (newFrames[id]) newFrames[id] = { ...newFrames[id], ...specificUpdates };
                else if (newPorts[id]) newPorts[id] = { ...newPorts[id], ...specificUpdates };
                else if (newLinks[id]) newLinks[id] = { ...newLinks[id], ...specificUpdates };
            });

            return { ...state, ...historyState, nodes: newNodes, frames: newFrames, ports: newPorts, links: newLinks };
        }
        // v14: MOVE_SELECTED переписан на месте (Фаза 4 — единственный
        // вызывающий компонент, Node.js, переписывается в этой же фазе).
        // Рамки не двигаются этим экшеном вообще — у них нет своей position,
        // их кусок пересчитывается из bbox членов автоматически (перемещение
        // куска — отдельный экшен MOVE_FRAGMENT, дёргающий сами узлы-члены).
        case 'MOVE_SELECTED': {
            const { dx, dy, skipHistory } = action.payload;
            const historyState = skipHistory ? {} : saveHistory(state, `Перемещение выделенных элементов`);

            const newNodes = { ...state.nodes };
            const H = getHierarchy();

            const movedIds = state.selectedIds.filter(id => state.nodes[id] && !(H && H.isDescendantOfV14
                && state.selectedIds.some(other => other !== id && H.isDescendantOfV14(id, other, state.nodes))));

            // Тумблер Drag&Drop выключен — карточка не пересекает границу своей
            // дорожки: дельта клампится ЕДИНОЙ для всей группы (форма выделения
            // не ломается) по видимой области дорожки-владельца каждого элемента.
            let cdx = dx;
            let cdy = dy;
            if (!(state.ui && state.ui.dragDropMode) && H) {
                let loX = -Infinity, hiX = Infinity, loY = -Infinity, hiY = Infinity;
                movedIds.forEach(id => {
                    const entity = state.nodes[id];
                    const ownerId = entity.parentId || 'root';
                    const win = H.windowsOfLane(ownerId, state.windows || {})[0];
                    if (!win || win.collapsed) return;
                    const lane = H.laneRect(win, ownerId);
                    if (!lane) return;
                    const camera = win.camera || {};
                    const z = camera.zoom || 1;
                    const offX = (camera.offset && camera.offset.x) || 0;
                    const offY = (camera.offset && camera.offset.y) || 0;
                    const w = (entity.size && entity.size.w) || 200;
                    const h = (entity.size && entity.size.h) || 100;
                    // Видимая область в локальных координатах дорожки
                    const minX = -offX / z;
                    const maxX = (lane.w - offX) / z - w;
                    const minY = -offY / z;
                    const maxY = (lane.h - offY) / z - h;
                    const px = entity.position?.x || 0;
                    const py = entity.position?.y || 0;
                    if (maxX >= minX) { loX = Math.max(loX, minX - px); hiX = Math.min(hiX, maxX - px); }
                    if (maxY >= minY) { loY = Math.max(loY, minY - py); hiY = Math.min(hiY, maxY - py); }
                });
                if (loX <= hiX && isFinite(loX) && isFinite(hiX)) cdx = Math.min(Math.max(dx, loX), hiX);
                if (loY <= hiY && isFinite(loY) && isFinite(hiY)) cdy = Math.min(Math.max(dy, loY), hiY);
            }

            movedIds.forEach(id => {
                newNodes[id] = { ...newNodes[id], position: { x: newNodes[id].position.x + cdx, y: newNodes[id].position.y + cdy } };
            });

            return { ...state, ...historyState, nodes: newNodes };
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
        // v14: REPARENT_ENTITY переписан на месте (§7.12) — контракт сохраняется
        // (ids/id, targetParentId/newParentId, mode, position/positionsById,
        // historySnapshot), но targetLevelIndex и id слоя как цель УДАЛЕНЫ:
        // targetParentId — только 'root' или id узла (§3 плана).
        case 'REPARENT_ENTITY': {
            const p = action.payload || {};
            const H = getHierarchy();
            const G = getGeometry();
            if (!H || !G) return state;

            const targetParentId = p.targetParentId !== undefined ? p.targetParentId : p.newParentId;
            if (!targetParentId) return state;

            const getEntity = (eid) => state.nodes && state.nodes[eid];

            const rawIds = Array.isArray(p.ids) ? p.ids : (p.id ? [p.id] : []);
            const requestedIds = rawIds.filter(eid => getEntity(eid));
            if (requestedIds.length === 0) return state;

            // «Только верхние»: потомок в этом же наборе переезжает вместе со своим предком.
            const topIds = requestedIds.filter(eid => !requestedIds.some(other =>
                other !== eid && H.isDescendantOfV14(eid, other, state.nodes)));

            // Валидация каждого id независимо — невалидные молча пропускаются,
            // один плохой id не блокирует остальной батч.
            const validIds = topIds.filter(eid => {
                const entity = getEntity(eid);
                if (!entity || entity.parentId === targetParentId) return false;
                return H.canReparentToV14(eid, targetParentId, state.nodes).ok;
            });
            if (validIds.length === 0) return state;

            const firstEntity = getEntity(validIds[0]);
            // p.historySnapshot — срез на начало Drag&Drop-жеста (mousedown):
            // движение мышью пишется с skipHistory, поэтому без среза «до» в
            // past попало бы промежуточное положение, и один Ctrl+Z не
            // откатывал бы весь жест целиком.
            const historyState = saveHistory(state, validIds.length === 1
                ? `Элемент перевложен: ${firstEntity.name}`
                : `Перевложено элементов: ${validIds.length}`, p.historySnapshot || null);

            const newNodes = { ...state.nodes };
            // Унаследованные ownerId/ownerGap/homeLevel (ещё не мигрированная
            // v11-сущность) сбрасываются — REPARENT_ENTITY — точка полного
            // перехода на чистый v14 parentId.
            const stripLegacy = (e) => { const { ownerId, ownerGap, homeLevel, ...rest } = e; return rest; };

            const rectsIn = (parentId) => (H.getChildrenByParent(state.nodes)[parentId] || [])
                .map(n => ({ x: n.position.x, y: n.position.y, w: (n.size && n.size.w) || 200, h: (n.size && n.size.h) || 100 }));

            validIds.forEach(eid => {
                const entity = getEntity(eid);
                const oldParentId = entity.parentId || 'root';

                if (p.mode === 'shallow') {
                    // Прямые дети усыновляются ПРЕЖНИМ родителем («дедушкой»):
                    // findFreePosition предотвращает наложение на то, что уже
                    // стоит в дорожке деда.
                    const directChildren = H.getChildrenByParent(state.nodes)[eid] || [];
                    if (directChildren.length > 0) {
                        const siblingRects = rectsIn(oldParentId);
                        directChildren.forEach(child => {
                            const pos = G.findFreePosition(child.size, child.position, siblingRects);
                            siblingRects.push({ x: pos.x, y: pos.y, w: (child.size && child.size.w) || 200, h: (child.size && child.size.h) || 100 });
                            newNodes[child.id] = stripLegacy({ ...newNodes[child.id], parentId: oldParentId, position: pos });
                        });
                    }
                }

                // v14: каждая дорожка — своя система координат, нет случая «то
                // же окно, позиция сохраняется точно» (артефакт общего холста
                // уровня из v13). Явная позиция от курсора, иначе
                // findFreePosition рядом с исходным местом в целевой дорожке.
                let position;
                if (p.positionsById && p.positionsById[eid]) {
                    position = p.positionsById[eid];
                } else if (validIds.length === 1 && p.position) {
                    position = p.position;
                } else {
                    position = G.findFreePosition(entity.size, entity.position, rectsIn(targetParentId));
                }

                newNodes[eid] = stripLegacy({ ...newNodes[eid], parentId: targetParentId, position });
            });

            // Дроп на карточку узла, у которого нет открытой дорожки — она
            // открывается автоматически, чтобы результат был виден (§0.4.3).
            let windows = state.windows || {};
            if (targetParentId !== 'root') {
                windows = applyOpenLaneV14(windows, newNodes, targetParentId);
            }

            return {
                ...state,
                ...historyState,
                nodes: newNodes,
                windows
            };
        }
        // v14: DELETE_SELECTED переписан на месте (Фаза 4 — единственные
        // вызывающие места, Canvas.js/ContextActionBar.js, переписываются в
        // этой же фазе). Окно среди выделения — Delete закрывает окно (только
        // обзор, данные не трогает, см. §9 LANES_MODEL.md). Узлы — каскад всей
        // ветки, как REMOVE_NODE. Рамки — как REMOVE_FRAME (узлы остаются,
        // уходят только порты/связи самой рамки). Никакого ре-якорения —
        // сирот-якорей и ownerId в v14 не существует.
        case 'DELETE_SELECTED': {
            if (!state.selectedIds || state.selectedIds.length === 0) return state;

            const winIds = state.selectedIds.filter(sid => typeof sid === 'string' && sid.startsWith('window:'));
            if (winIds.length) {
                const historyState = saveHistory(state, winIds.length === 1 ? 'Окно закрыто' : `Окон закрыто: ${winIds.length}`);
                const windows = { ...(state.windows || {}) };
                winIds.forEach(sid => delete windows[sid.replace('window:', '')]);
                return { ...state, ...historyState, windows, selectedIds: state.selectedIds.filter(id => !winIds.includes(id)) };
            }

            const H = getHierarchy();
            const byParent = H.getChildrenByParent(state.nodes);
            const nodeIds = state.selectedIds.filter(id => state.nodes[id]);
            const frameIds = state.selectedIds.filter(id => state.frames && state.frames[id]);
            const portIds = state.selectedIds.filter(id => state.ports[id]);
            const linkIds = state.selectedIds.filter(id => state.links[id]);
            if (!nodeIds.length && !frameIds.length && !portIds.length && !linkIds.length) return state;

            const historyState = saveHistory(state, `Удалено ${state.selectedIds.length} элементов`);

            const idsToDelete = new Set(nodeIds);
            let frontier = nodeIds;
            while (frontier.length) {
                const next = [];
                frontier.forEach(pid => (byParent[pid] || []).forEach(child => {
                    if (!idsToDelete.has(child.id)) { idsToDelete.add(child.id); next.push(child.id); }
                }));
                frontier = next;
            }

            const nodes = { ...state.nodes };
            idsToDelete.forEach(id => delete nodes[id]);

            const ports = { ...state.ports };
            portIds.forEach(id => delete ports[id]);
            Object.values(state.ports || {}).forEach(p => {
                if (p && (idsToDelete.has(p.nodeId) || frameIds.includes(p.nodeId))) delete ports[p.id];
            });

            const removedPortIds = new Set(Object.keys(state.ports || {}).filter(pid => !ports[pid]));
            const links = { ...state.links };
            linkIds.forEach(id => delete links[id]);
            Object.keys(links).forEach(lid => {
                const l = links[lid];
                if (l && (removedPortIds.has(l.sourcePortId) || removedPortIds.has(l.targetPortId))) delete links[lid];
            });

            const frames = { ...(state.frames || {}) };
            frameIds.forEach(fid => delete frames[fid]);
            Object.keys(frames).forEach(fid => {
                const f = frames[fid];
                if (f && f.members.some(mid => idsToDelete.has(mid))) {
                    frames[fid] = { ...f, members: f.members.filter(mid => !idsToDelete.has(mid)) };
                }
            });

            const windows = { ...(state.windows || {}) };
            frameIds.forEach(fid => {
                Object.keys(windows).forEach(wid => { if (windows[wid] && windows[wid].frameId === fid) delete windows[wid]; });
            });

            return {
                ...state,
                ...historyState,
                nodes,
                ports,
                links,
                frames,
                windows,
                selectedIds: [],
                isolatedIds: (state.isolatedIds || []).filter(id => !state.selectedIds.includes(id))
            };
        }
        // v14: CREATE_NESTED_NODE переписан на месте (§7.12) — parentId
        // указывает прямо на родителя (без изменений от v13), но окно уровня
        // заменено на: дорожка родителя открывается автоматически, если она
        // ещё нигде не открыта (§0.4.3 плана — единственное исключение из
        // «окно открывается только явным действием»).
        case 'CREATE_NESTED_NODE': {
            const { parentId, name = 'Новый узел', color = '#0f172a', shape = 'rectangle', type = 'default' } = action.payload || {};
            if (!parentId || !(state.nodes && state.nodes[parentId])) return state;

            const H = getHierarchy();
            const historyState = saveHistory(state, `Создан вложенный узел «${name}»`);

            const siblings = {};
            (H.getChildrenByParent(state.nodes)[parentId] || []).forEach(n => { siblings[n.id] = n; });
            const pos = H.getSmartLevelPlacement(parentId, siblings);

            const newNodeId = action.payload.id || 'node-' + Date.now() + Math.floor(Math.random() * 1000);
            const newNodeSize = calculateNodeSize(name, '', null, null, 14, 'Inter, sans-serif');
            const newNode = {
                id: newNodeId, name, content: '', color, shape, type,
                parentId, position: pos, size: newNodeSize, snapToGrid: true,
                fontFamily: 'Inter, sans-serif', fontSize: 14
            };
            const nodes = { ...state.nodes, [newNodeId]: newNode };
            const windows = applyOpenLaneV14(state.windows || {}, nodes, parentId);

            return {
                ...state,
                ...historyState,
                nodes,
                windows,
                activeLaneId: parentId,
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
        // v14: FOCUS_CONNECTED_ELEMENTS переписан на месте (Фаза 4 — вызывающие
        // места, Node.js/Port.js/Link.js/Frame.js, переписываются в этой же
        // фазе). Упрощение относительно v13 (applyFocusConnectedElements,
        // оставлен нетронутым как мёртвый код до финального грепа Фазы 4):
        // выделяет узел/рамку + прямых соседей по связям, затем центрирует на
        // исходной сущности через CENTER_ON_ENTITY — без отдельной подстройки
        // камеры каждого затронутого окна.
        case 'FOCUS_CONNECTED_ELEMENTS': {
            const entityId = (action.payload || {}).entityId;
            if (!entityId) return state;
            const H = getHierarchy();
            if (!H) return state;

            const nodes = state.nodes || {};
            const ports = state.ports || {};
            const links = state.links || {};
            const frames = state.frames || {};

            const portsByNode = H.getPortsByNodeId(ports);
            const linksByPort = H.getLinksByPortId(links);

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
                if (!eid || (!nodes[eid] && !frames[eid])) return;
                entityIds.add(eid);
                (portsByNode[eid] || []).forEach(p => addNeighborsOfPort(p.id));
            };

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
            } else if (frames[entityId]) {
                addEntityAndNeighbors(entityId);
                (frames[entityId].members || []).forEach(mid => addEntityAndNeighbors(mid));
            } else {
                return state;
            }

            return reducer({ ...state, selectedIds: Array.from(entityIds) }, { type: 'CENTER_ON_ENTITY', payload: entityId });
        }
        // v14: TOGGLE_LEVEL_NEIGHBORS/SET_LEVEL_FOCUS/FOCUS_CHILDREN_OF_NODE
        // удалены (§3 плана) — «глаз» уровня, активная глубина и фокус ветки
        // как отдельные понятия больше не существуют (см. docs/LANES_MODEL.md).
        // FOCUS_CHILDREN_OF_NODE заменяется связкой OPEN_LANE + CENTER_ON_ENTITY
        // на стороне UI (Фаза 4).
        // v14: REMOVE_LEVEL_WINDOW удалён как обработчик экшена (§3 плана) —
        // «удалить уровень» больше не существует, окна закрываются (CLOSE_WINDOW)
        // без затрагивания данных. applyRemoveLevelWindow (helper) НЕ удаляется —
        // его по-прежнему вызывает DELETE_SELECTED (не переписан в этой фазе,
        // см. §7.12) для своей ветки удаления выделенного окна уровня.
        // v14: CLEAR_PROJECT переписан на месте (Фаза 4 — единственный
        // вызывающий компонент, ContextActionBar.js, переписывается в этой же
        // фазе). Окна — чисто обзорное состояние (§4.3 LANES_MODEL.md), никакое
        // из них не обязано существовать: пустой проект не показывает ни одной
        // дорожки, пока пользователь не откроет корень явно (обозреватель
        // проекта всегда даёт это сделать, см. §7.1.7 плана) — поэтому
        // «сохранить окно уровня 0» здесь больше не нужно.
        case 'CLEAR_PROJECT': {
            const historyState = saveHistory(state, 'Удаление проекта (сброс к начальному состоянию)');
            return {
                ...state,
                ...historyState,
                nodes: {},
                frames: {},
                ports: {},
                links: {},
                windows: {},
                activeLaneId: null,
                activeFrameId: null,
                selectedIds: [],
                isolatedIds: [],
                containerIsolation: { projectIds: (state.containerIsolation && state.containerIsolation.projectIds) || [], windowIds: [] }
            };
        }
        // v14: ADD_LEVEL_WINDOW/REMOVE_ROOT_CANVAS/CLEAR_LEVEL_WINDOW удалены
        // как обработчики экшенов (§3 плана — «вся логика ре-якорения и сдвига
        // уровней» уходит вместе с ними). ADD_LEVEL_WINDOW заменяется NEW_EMPTY_WINDOW
        // (переделка кнопки «Уровень», §7.1.4); закрытие/очистка окна в v14 —
        // это CLOSE_WINDOW (обзор, данные не трогаются) — «очистить дорожку»
        // как отдельная операция не нужна: REMOVE_NODE каскадом на всех прямых
        // детях дорожки даёт тот же результат, если он вообще кому-то нужен.
        // v14: CENTER_ON_ENTITY переписан на месте (Фаза 4 — вызывающие места,
        // OutlinerTree.js/Library.js/Node.js/Port.js/Link.js, переписываются в
        // этой же фазе). Упрощение относительно v13: центрирует только МИРОВУЮ
        // камеру (без отдельной подстройки камеры окна и без авто-зума под
        // размер сущности) — сознательное упрощение, зум остаётся как есть.
        // Если дорожка сущности нигде не открыта — открывает её (новым окном),
        // чтобы клик в обозревателе проекта гарантированно показывал результат
        // (§7.1.7 плана); это отдельный шаг истории, объединённый с открытием.
        case 'CENTER_ON_ENTITY': {
            const id = action.payload;
            if (!id) return state;
            const H = getHierarchy();
            if (!H) return state;

            const { w: screenW, h: screenH } = getScreenSize();
            const libraryWidth = (state.ui && state.ui.libraryOpen) ? 300 : 0;
            const visualCenterX = (screenW + libraryWidth) / 2;

            let windows = state.windows || {};
            let historyState = {};
            let rect = null;

            const ensureLaneOpen = (ownerId) => {
                let win = H.windowsOfLane(ownerId, windows)[0];
                if (!win) {
                    const opened = applyOpenLaneV14(windows, state.nodes, ownerId);
                    if (opened !== windows) {
                        const label = ownerId === 'root' ? 'Проект' : ((state.nodes[ownerId] && state.nodes[ownerId].name) || ownerId);
                        historyState = saveHistory(state, `Открыта дорожка «${label}»`);
                        windows = opened;
                    }
                    win = H.windowsOfLane(ownerId, windows)[0];
                }
                return win;
            };

            if (state.nodes[id]) {
                const win = ensureLaneOpen(state.nodes[id].parentId || 'root');
                if (win) rect = H.nodeRectInWindow(win, id, { ...state, windows });
            } else if (state.frames && state.frames[id]) {
                const frame = state.frames[id];
                const homeLaneId = frame.homeLaneId || 'root';
                const win = ensureLaneOpen(homeLaneId);
                if (win) {
                    const local = H.fragmentRect(win, homeLaneId, id, { ...state, windows });
                    if (local) {
                        const topLeft = H.laneLocalToWorld(win, homeLaneId, { x: local.x, y: local.y });
                        if (topLeft) rect = { x: topLeft.x, y: topLeft.y, w: local.w * topLeft.scale, h: local.h * topLeft.scale };
                    }
                }
            } else if (state.ports[id]) {
                const pos = H.getPortWorldPositionV14(id, { ...state, windows });
                if (pos) rect = { x: pos.x - 4, y: pos.y - 4, w: 8, h: 8 };
            } else if (state.links && state.links[id]) {
                const link = state.links[id];
                const p1 = H.getPortWorldPositionV14(link.sourcePortId, { ...state, windows });
                const p2 = H.getPortWorldPositionV14(link.targetPortId, { ...state, windows });
                if (p1 && p2) rect = { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), w: Math.abs(p2.x - p1.x) || 1, h: Math.abs(p2.y - p1.y) || 1 };
            } else if (windows[id]) {
                const win = windows[id];
                rect = { x: win.position.x, y: win.position.y, w: win.size.w, h: win.size.h };
            }

            if (!rect) return { ...state, ...historyState, windows };

            const zoom = state.canvas.zoom || 1;
            const cx = rect.x + rect.w / 2;
            const cy = rect.y + rect.h / 2;

            return {
                ...state,
                ...historyState,
                windows,
                canvas: { ...state.canvas, offset: { x: visualCenterX - cx * zoom, y: screenH / 2 - cy * zoom } }
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
    'layers', 'nodes', 'ports', 'links', 'pendingGateways',
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

const FORMAT_VERSION_V14 = 14;

/**
 * v14: восстанавливает минимальный инвариант окон дорожек (см.
 * docs/LANES_MODEL.md §10) — в отличие от normalizeLevelWindows, НЕ создаёт
 * окна на каждую глубину: в v14 окно открывается только явным действием
 * пользователя. Здесь только защитная чистка: ссылки на дорожки мёртвых узлов
 * убираются из lanes/hidden, окно, опустевшее после этого, схлопывается
 * (окно рамки, frameId задан, не схлопывается пустым списком лишённых узлов —
 * у него своя видимость через членов рамки).
 * @param {Object<string, Object>} rawWindows
 * @param {Object<string, NodeEntity>} nodes
 * @returns {Object<string, Object>}
 */
const normalizeWindows = (rawWindows, nodes) => {
    const safeNodes = nodes || {};
    const laneExists = (ownerId) => ownerId === 'root' || !!safeNodes[ownerId];
    const windows = {};
    Object.entries(rawWindows || {}).forEach(([key, win]) => {
        if (!win) return;
        const lanes = (win.lanes || []).filter(laneExists);
        if (!lanes.length && !win.frameId) return;
        const hidden = (win.hidden || []).filter(laneExists);
        windows[key] = { ...win, id: win.id || key, lanes, hidden };
    });
    return windows;
};

/**
 * Миграция v13 -> v14: дорожки/окна-наборы/рамки-множества вместо уровней и
 * слоёв (docs/LANES_MODEL.md, план — «Отчеты, аудиты, планы/Lanes_v14/
 * PLAN_V14_LANES.md» §2.6). НАПИСАНА, но НЕ подключена к живой загрузке в
 * этой фазе (см. §7.11 плана) — getInitialMultiState продолжает работать
 * через migrateToV13, пока hierarchy.js/reducer.js/UI не переписаны на v14
 * (Фазы 2–4). Тестируется исключительно прямым вызовом на фикстурах.
 *
 * Предполагает вход УЖЕ в чистой v13-форме (без ownerId/ownerGap/homeLevel —
 * их снимает migrateProjectEntitiesToV13, вызывается ДО этой функции вызывающей
 * стороной, как и в реальной цепочке migrateToV10→…→migrateToV13→migrateToV14).
 *
 * Шаги (§2.6 плана):
 *   1. Сироты-якоря (parentId = id окна уровня) -> parentId: 'root' — и у
 *      узлов, и у слоёв (миграция v12->v13 расставляет такой якорь обоим
 *      словарям одинаково). «Ветка сохраняется, домашняя глубина — нет»
 *      (решение §0.4.7) — сирота НЕ пытается воспроизвести старый уровень.
 *   2. Слои -> рамки: структурный родитель узла/рамки — первый узел или
 *      'root' при подъёме по цепочке parentId ЧЕРЕЗ слои (та же семантика
 *      обхода, что у HierarchyUtils.getLocalPosition). Позиция узла копит
 *      смещения всех пройденных слоёв. Вложенный слой L2 внутри L: узлы L2
 *      становятся членами ОБЕИХ рамок (frame(L2) и frame(L)) — так bbox
 *      внешней рамки естественно охватывает внутреннюю, воспроизводя старую
 *      картинку вложенных слоёв без вложенности самих рамок.
 *   3. Порты слоёв не трогаются (nodeId уже равен id рамки — id слоя не
 *      меняется), связи и порты вообще не участвуют в этой миграции.
 *   4. Окна: старое окно уровня k -> lanes = все узлы НОВОЙ (после шагов 1–2)
 *      глубины k-1, у которых есть дети; k=0 -> lanes: ['root']. Окно без
 *      дорожек после этого не создаётся.
 * @param {Object} proj одно-проектное v13-состояние
 * @returns {Object} проект в форме v14 (nodes/frames/windows вместо nodes/layers/levelWindows/levelViews)
 */
const migrateProjectEntitiesToV14 = (proj) => {
    const oldNodesRaw = proj.nodes || {};
    const oldLayersRaw = proj.layers || {};
    const oldWindows = proj.levelWindows || {};
    const oldViews = proj.levelViews || {};

    // 1. Сироты-якоря -> 'root' (решение §0.4.7): применяется и к узлам, и к слоям.
    const deAnchor = (e) => {
        if (!e) return e;
        const pid = e.parentId;
        if (pid && pid !== 'root' && oldWindows[pid]) return { ...e, parentId: 'root' };
        return e;
    };
    const nodes0 = {};
    Object.entries(oldNodesRaw).forEach(([k, n]) => { nodes0[k] = deAnchor(n); });
    const layers0 = {};
    Object.entries(oldLayersRaw).forEach(([k, l]) => { layers0[k] = deAnchor(l); });

    // Подъём по цепочке parentId слоя ЧЕРЕЗ другие слои до первого узла/'root'.
    // Возвращает пройденные id слоёв (для членства в рамках) и накопленное
    // смещение позиции — тот же обход, что у HierarchyUtils.getLocalPosition,
    // только здесь дополнительно нужен сам путь, а не только сумма координат.
    const climbLayerChain = (startParentId) => {
        const chain = [];
        let pid = startParentId;
        let dx = 0, dy = 0;
        const visited = new Set();
        while (pid && pid !== 'root' && layers0[pid] && !visited.has(pid)) {
            visited.add(pid);
            const L = layers0[pid];
            chain.push(L.id);
            dx += (L.position && L.position.x) || 0;
            dy += (L.position && L.position.y) || 0;
            pid = L.parentId;
        }
        const parentId = (pid && pid !== 'root' && nodes0[pid]) ? pid : 'root';
        return { chain, dx, dy, parentId };
    };

    // 2. Слои -> рамки, узлы получают структурный parentId + пересчитанную позицию.
    const frameMembers = {};
    const addMember = (layerId, nodeId) => {
        (frameMembers[layerId] || (frameMembers[layerId] = [])).push(nodeId);
    };

    const nodes = {};
    Object.entries(nodes0).forEach(([id, n]) => {
        if (!n) { nodes[id] = n; return; }
        const pid = n.parentId;
        if (!pid || pid === 'root') { nodes[id] = (pid === 'root') ? n : { ...n, parentId: 'root' }; return; }
        if (nodes0[pid]) { nodes[id] = n; return; }
        if (layers0[pid]) {
            const { chain, dx, dy, parentId } = climbLayerChain(pid);
            chain.forEach(layerId => addMember(layerId, id));
            nodes[id] = {
                ...n,
                parentId,
                position: { x: ((n.position && n.position.x) || 0) + dx, y: ((n.position && n.position.y) || 0) + dy }
            };
            return;
        }
        // Мёртвая ссылка (не 'root', не узел, не слой, не окно после шага 1) — защитный fallback.
        nodes[id] = { ...n, parentId: 'root' };
    });

    const frames = {};
    Object.entries(layers0).forEach(([id, L]) => {
        if (!L) return;
        const pid = L.parentId;
        let homeLaneId = 'root';
        if (pid && pid !== 'root') {
            if (nodes0[pid]) homeLaneId = pid;
            else if (layers0[pid]) homeLaneId = climbLayerChain(pid).parentId;
        }
        frames[id] = {
            id: L.id,
            name: L.name,
            content: L.content,
            color: L.color,
            fontFamily: L.fontFamily,
            fontSize: L.fontSize,
            snapToGrid: L.snapToGrid,
            members: frameMembers[id] || [],
            homeLaneId
        };
    });

    // 3. Порты слоёв — без изменений (nodeId по-прежнему равен id рамки), ports/links не трогаем.

    // 4. Окна: старое окно уровня k -> lanes = узлы НОВОЙ глубины k-1 с детьми.
    const hasChildren = {};
    Object.values(nodes).forEach(n => {
        if (n && n.parentId && n.parentId !== 'root') hasChildren[n.parentId] = true;
    });
    const depthCache = {};
    const depthOf = (id) => {
        if (!id || id === 'root') return 0;
        if (depthCache[id] !== undefined) return depthCache[id];
        const n = nodes[id];
        if (!n) return 0;
        const d = 1 + depthOf(n.parentId);
        depthCache[id] = d;
        return d;
    };
    const byDepth = {};
    Object.keys(nodes).forEach(id => {
        if (!hasChildren[id]) return;
        const d = depthOf(id);
        (byDepth[d] || (byDepth[d] = [])).push(id);
    });

    const windowsRaw = {};
    Object.values(oldWindows).forEach(w => {
        if (!w) return;
        const k = w.levelIndex || 0;
        const lanes = k === 0 ? ['root'] : (byDepth[k - 1] || []);
        if (!lanes.length) return; // пустые окна не создаются
        const view = oldViews[w.id] || {};
        windowsRaw[w.id] = {
            id: w.id,
            lanes,
            hidden: [],
            frameId: null,
            position: w.position,
            size: w.size,
            camera: {
                offset: view.innerOffset || { x: 0, y: 0 },
                zoom: (view.innerZoom !== undefined && view.innerZoom !== null) ? view.innerZoom : 1
            },
            collapsed: !!view.isCollapsed,
            name: w.name,
            color: w.color,
            fontFamily: w.fontFamily,
            fontSize: w.fontSize
        };
    });
    const windows = normalizeWindows(windowsRaw, nodes);

    const {
        layers: _oldLayers, levelWindows: _oldLevelWindows, levelViews: _oldLevelViews,
        activeLevelIndex: _oldActiveLevelIndex, levelFocusParentId: _oldLevelFocusParentId,
        levelHideNeighbors: _oldLevelHideNeighbors,
        ...restProj
    } = proj;

    return {
        ...restProj,
        nodes,
        frames,
        windows,
        activeLaneId: null,
        activeFrameId: null,
        formatVersion: FORMAT_VERSION_V14
    };
};

const migrateToV14 = (state) => {
    if (!state || (state.formatVersion || 0) >= FORMAT_VERSION_V14) return state;
    const projects = {};
    Object.entries(state.projects || {}).forEach(([pid, proj]) => {
        projects[pid] = proj ? migrateProjectEntitiesToV14(proj) : proj;
    });
    return { ...state, projects, formatVersion: FORMAT_VERSION_V14 };
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
 * Автопримирение «висящих штекеров» (Фаза 6.2): группирует pendingGateways
 * ВСЕХ проектов по linkId — тому же id, что был у исходной живой связи (см.
 * applyRemoveProject и локальный экспорт в ContextActionBar.js). Там, где
 * один и тот же linkId нашёлся РОВНО в двух разных проектах — одна половина
 * demote'нута удалением/экспортом-без-контрагента, другая только что
 * импортирована (или наоборот) — синтезирует живую crossProjectLinks-запись
 * из обеих половин и убирает обе записи pendingGateways. Несовпавшие
 * (единственная сторона) остаются висеть как штекеры.
 *
 * ВАЖНО: сверка идёт ТОЛЬКО по linkId + противоположным direction, БЕЗ
 * проверки remoteProjectId на совпадение с фактическим pid контрагента —
 * при повторном импорте «как новый проект» контрагент получает СВЕЖИЙ id
 * (`ADD_PROJECT_FROM_FILE`), и остаток на пережившей стороне закономерно
 * продолжает указывать на СТАРЫЙ, уже удалённый id. Именно нестабильность
 * projectId и есть причина, по которой опорным идентификатором служит
 * linkId связи, а не id проекта на другом конце.
 * @param {Object} m мультисостояние
 * @returns {Object}
 */
const reconcilePendingGateways = (m) => {
    const byLink = {};
    Object.keys(m.projects || {}).forEach(pid => {
        const proj = m.projects[pid];
        Object.values((proj && proj.pendingGateways) || {}).forEach(gw => {
            if (!gw || !gw.linkId) return;
            if (!byLink[gw.linkId]) byLink[gw.linkId] = [];
            byLink[gw.linkId].push({ pid, gw });
        });
    });

    const ready = Object.keys(byLink).filter(linkId => byLink[linkId].length === 2);
    if (ready.length === 0) return m;

    let projects = m.projects;
    const crossProjectLinks = { ...(m.crossProjectLinks || {}) };
    ready.forEach(linkId => {
        const [a, b] = byLink[linkId];
        const src = a.gw.direction === 'out' ? a : b;
        const tgt = src === a ? b : a;
        // Единственная реальная проверка согласованности, доступная здесь:
        // ровно одна сторона 'out', другая 'in' (см. комментарий функции —
        // remoteProjectId сверять не с чем, он смотрит на уже мёртвый id).
        if (src.gw.direction !== 'out' || tgt.gw.direction !== 'in') return;

        crossProjectLinks[linkId] = {
            id: linkId,
            sourceProjectId: src.pid, sourcePortId: src.gw.portId,
            targetProjectId: tgt.pid, targetPortId: tgt.gw.portId,
            color: src.gw.color, name: src.gw.name, content: src.gw.content,
            linkStyle: src.gw.linkStyle
        };
        [a, b].forEach(({ pid, gw }) => {
            const proj = { ...projects[pid] };
            const pg = { ...(proj.pendingGateways || {}) };
            delete pg[gw.linkId];
            proj.pendingGateways = pg;
            projects = { ...projects, [pid]: proj };
        });
    });

    return { ...m, projects, crossProjectLinks };
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
    const removedProj = m.projects[id];
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

    // Кросс-проектные связи, задевающие удаляемый проект (Фаза 6.1/6.2): если
    // проект на ДРУГОЙ стороне ещё существует — связь не пропадает молча, а
    // демоутится в его pendingGateways (та же структура, что у локального
    // экспорта половины связи) — «одна из сторон пропала» выглядит одинаково,
    // вызвано ли это удалением проекта или экспортом без него. Если обе
    // стороны исчезают разом (или второй уже нет) — запись удаляется совсем.
    const H = getHierarchy();
    const crossProjectLinks = { ...(m.crossProjectLinks || {}) };
    const gatewaysByProject = {};
    Object.keys(m.crossProjectLinks || {}).forEach(linkId => {
        const link = m.crossProjectLinks[linkId];
        if (!link || (link.sourceProjectId !== id && link.targetProjectId !== id)) return;
        delete crossProjectLinks[linkId];
        const survivorPid = link.sourceProjectId === id ? link.targetProjectId : link.sourceProjectId;
        if (!survivorPid || !projects[survivorPid]) return;
        const survivorIsSource = survivorPid === link.sourceProjectId;
        const survivorPortId = survivorIsSource ? link.sourcePortId : link.targetPortId;
        const removedPortId = survivorIsSource ? link.targetPortId : link.sourcePortId;
        const removedPort = removedProj.ports && removedProj.ports[removedPortId];
        const survivorProj = projects[survivorPid];
        const survivorPortObj = survivorProj.ports && survivorProj.ports[survivorPortId];
        const survivorNodeId = survivorPortObj && survivorPortObj.nodeId;
        let edge = null, fraction = null;
        if (survivorNodeId && H) {
            const lvl = H.getEntityLevel(survivorNodeId, survivorProj.nodes, survivorProj.layers, survivorProj.levelWindows);
            const win = H.getWindowOfLevel(lvl, survivorProj.levelWindows);
            const ov = win && link.proxyOverrides && link.proxyOverrides[win.id];
            if (ov) { edge = ov.edge; fraction = ov.fraction; }
        }
        if (!edge) { edge = 'right'; fraction = 0.5; }
        if (!gatewaysByProject[survivorPid]) gatewaysByProject[survivorPid] = {};
        gatewaysByProject[survivorPid][linkId] = {
            linkId, portId: survivorPortId,
            direction: survivorIsSource ? 'out' : 'in',
            remoteProjectId: id, remotePortId: removedPortId,
            remoteProjectName: removedProj.projectName || '',
            remotePortName: (removedPort && removedPort.name) || '',
            linkStyle: link.linkStyle, color: link.color, name: link.name, content: link.content,
            edge, fraction
        };
    });
    Object.keys(gatewaysByProject).forEach(pid => {
        projects[pid] = { ...projects[pid], pendingGateways: { ...(projects[pid].pendingGateways || {}), ...gatewaysByProject[pid] } };
    });

    // Изоляция удалённого проекта и его окон снимается: иначе на холсте не
    // осталось бы ни одного видимого контейнера — и кнопки выхода из изоляции
    const next = pruneContainerIsolation({
        ...m,
        projects, projectOrder, activeProjectId, crossProjectLinks,
        ui: { ...m.ui, outlinerOpen },
        selectedIds: [], isolatedIds: []
    });
    // Новый pendingGateway на уцелевшей стороне мог совпасть с уже висящим
    // штекером ДРУГОГО проекта (импортированным ранее) — примиряем сразу.
    return reconcilePendingGateways(next);
};

/**
 * Кросс-проектный перенос сущности/ветки (Фаза 6.3): REPARENT_ENTITY, чей
 * targetProjectId отличается от sourceProjectId. Перехватывается в
 * multiReducer ДО delegateToActiveProject — обычный (внутрипроектный)
 * REPARENT_ENTITY продолжает идти через неё без изменений.
 *
 * Мирит два разных мира: живой Drag&Drop-жест (Node.js/Layer.js) и
 * однопроектный `case 'REPARENT_ENTITY'` в `reducer` — та же семантика
 * Deep/Shallow, та же findFreePosition-логика для всплытия детей и
 * размещения на новом месте, но словари читаются/пишутся в ДВА разных
 * проекта, а не в один state.
 *
 * @param {Object} m мультисостояние
 * @param {Object} p action.payload — { ids|id, sourceProjectId, targetProjectId,
 *   targetParentId?, targetLevelIndex?, mode?, position?, positionsById? }
 * @returns {Object}
 */
const applyCrossProjectReparent = (m, p) => {
    const sourceProjectId = p.sourceProjectId;
    const targetProjectId = p.targetProjectId;
    if (!sourceProjectId || !targetProjectId || sourceProjectId === targetProjectId) return m;
    if (!m.projects[sourceProjectId] || !m.projects[targetProjectId]) return m;

    const H = getHierarchy();
    const G = getGeometry();
    if (!H || !G) return m;

    const sourceView = projectFlatView(m, sourceProjectId);
    const targetView = projectFlatView(m, targetProjectId);

    const mode = p.mode === 'shallow' ? 'shallow' : 'deep';
    let targetParentId = p.targetParentId !== undefined ? p.targetParentId : p.newParentId;
    if (targetParentId === undefined && typeof p.targetLevelIndex === 'number') {
        const win = resolveWindow(targetView, p.targetLevelIndex);
        targetParentId = win ? win.id : (p.targetLevelIndex === 0 ? 'root' : undefined);
    }
    if (!targetParentId) return m;

    const getEntity = (eid) => (sourceView.nodes && sourceView.nodes[eid]) || (sourceView.layers && sourceView.layers[eid]);

    const rawIds = Array.isArray(p.ids) ? p.ids : (p.id ? [p.id] : []);
    const requestedIds = rawIds.filter(eid => getEntity(eid));
    if (requestedIds.length === 0) return m;

    // «Только верхние» — как в однопроектном REPARENT_ENTITY: у кого в этом
    // же наборе есть предок по цепочке parentId, тот переедет вместе с ним.
    const topIds = requestedIds.filter(eid => !requestedIds.some(other =>
        other !== eid && H.isDescendantOf(eid, other, sourceView.nodes, sourceView.layers)));

    // canReparentTo: существование сущности — в SOURCE (entityDicts), цели и
    // цикл — в TARGET; цикл геометрически невозможен между двумя разными
    // проектами (canReparentTo сама это распознаёт по разным словарям).
    // «Уже там» (entity.parentId === targetParentId) для cross-project не
    // проверяется — совпадение строк id между двумя проектами ничего не значит.
    const validIds = topIds.filter(eid => {
        const entity = getEntity(eid);
        if (!entity) return false;
        return H.canReparentTo(eid, targetParentId, targetView.nodes, targetView.layers, targetView.levelWindows,
            { nodes: sourceView.nodes, layers: sourceView.layers }).ok;
    });
    if (validIds.length === 0) return m;

    const srcNodes = { ...sourceView.nodes };
    const srcLayers = { ...sourceView.layers };
    const srcPorts = { ...sourceView.ports };
    const srcLinks = { ...sourceView.links };
    const tgtNodes = { ...targetView.nodes };
    const tgtLayers = { ...targetView.layers };
    const tgtPorts = { ...targetView.ports };
    const tgtLinks = { ...targetView.links };
    const movedPortIds = new Set();

    const stripLegacy = (e) => { const { ownerId, ownerGap, homeLevel, ...rest } = e; return rest; };
    const rectsIn = (nodesDict, layersDict, containerId) => {
        const rects = [];
        Object.values(nodesDict).forEach(n => { if (n && n.parentId === containerId) rects.push({ x: n.position.x, y: n.position.y, w: (n.size && n.size.w) || 200, h: (n.size && n.size.h) || 100 }); });
        Object.values(layersDict).forEach(l => { if (l && l.parentId === containerId) rects.push({ x: l.position.x, y: l.position.y, w: (l.size && l.size.w) || 600, h: (l.size && l.size.h) || 400 }); });
        return rects;
    };
    // Ветка = сущность + всё, что остаётся привязано к ней по parentId-цепочке
    // ПОСЛЕ возможного Shallow-всплытия прямых детей (см. ниже) — тот же обход,
    // что и рекурсивный поиск потомков в DELETE_SELECTED, но по живым id.
    const collectSubtree = (rootId) => {
        const ids = new Set([rootId]);
        let changed = true;
        while (changed) {
            changed = false;
            Object.values(srcNodes).forEach(n => { if (n && ids.has(n.parentId) && !ids.has(n.id)) { ids.add(n.id); changed = true; } });
            Object.values(srcLayers).forEach(l => { if (l && ids.has(l.parentId) && !ids.has(l.id)) { ids.add(l.id); changed = true; } });
        }
        return ids;
    };

    validIds.forEach(eid => {
        const entity = getEntity(eid);
        const oldParentId = entity.parentId;

        if (mode === 'shallow') {
            // Прямые дети переносимой сущности усыновляются её ПРЕЖНИМ
            // родителем ВНУТРИ исходного проекта — раньше, чем верхняя
            // сущность вообще успевает уехать (findFreePosition предотвращает
            // наложение всплывающих детей на то, что уже стоит у деда).
            const directChildren = [
                ...Object.values(srcNodes).filter(n => n && n.parentId === eid),
                ...Object.values(srcLayers).filter(l => l && l.parentId === eid)
            ];
            if (directChildren.length > 0) {
                const siblingRects = rectsIn(srcNodes, srcLayers, oldParentId);
                directChildren.forEach(child => {
                    const pos = G.findFreePosition(child.size, child.position, siblingRects);
                    siblingRects.push({ x: pos.x, y: pos.y, w: (child.size && child.size.w) || 200, h: (child.size && child.size.h) || 100 });
                    const updated = stripLegacy({ ...child, parentId: oldParentId, position: pos });
                    if (srcNodes[child.id]) srcNodes[child.id] = updated; else srcLayers[child.id] = updated;
                });
            }
        }

        // Позиция ВЕРХНЕЙ сущности ветки в целевом проекте: явная (drop под
        // курсором) либо findFreePosition на корне targetParentId — в другом
        // проекте совпадение мировых координат ничего не значит, экономить
        // на toRelativePosition (как делает внутрипроектный путь) незачем.
        let position;
        if (p.positionsById && p.positionsById[eid]) {
            position = p.positionsById[eid];
        } else if (validIds.length === 1 && p.position) {
            position = p.position;
        } else {
            position = G.findFreePosition(entity.size, entity.position, rectsIn(tgtNodes, tgtLayers, targetParentId));
        }

        const branchIds = collectSubtree(eid);
        branchIds.forEach(id => {
            const isNode = !!srcNodes[id];
            const dict = isNode ? srcNodes : srcLayers;
            const e = dict[id];
            const moved = id === eid ? stripLegacy({ ...e, parentId: targetParentId, position }) : stripLegacy(e);
            if (isNode) { tgtNodes[id] = moved; delete srcNodes[id]; }
            else { tgtLayers[id] = moved; delete srcLayers[id]; }

            Object.keys(srcPorts).forEach(portId => {
                const port = srcPorts[portId];
                if (port && port.nodeId === id) {
                    tgtPorts[portId] = port;
                    delete srcPorts[portId];
                    movedPortIds.add(portId);
                }
            });
        });
    });

    // Связи, у которых ОБА порта теперь в целевом проекте, переезжают целиком;
    // связи, у которых порты после переноса разошлись по разным проектам,
    // стали бы битыми (обычная links-запись не умеет адресовать чужой
    // проект — для этого есть отдельная crossProjectLinks, Фаза 6.1) и
    // удаляются, как раньше в этом случае поступал TRANSFER_NODE.
    Object.keys(srcLinks).forEach(linkId => {
        const link = srcLinks[linkId];
        if (!link) return;
        const sMoved = movedPortIds.has(link.sourcePortId);
        const tMoved = movedPortIds.has(link.targetPortId);
        if (sMoved && tMoved) { tgtLinks[linkId] = link; delete srcLinks[linkId]; }
        else if (sMoved || tMoved) { delete srcLinks[linkId]; }
    });

    const targetNormalized = normalizeLevelWindows(targetView.levelWindows, tgtNodes, tgtLayers, targetView.levelViews);

    let next = writeProjectView(m, sourceProjectId, { ...sourceView, nodes: srcNodes, layers: srcLayers, ports: srcPorts, links: srcLinks });
    next = writeProjectView(next, targetProjectId, {
        ...targetView, nodes: tgtNodes, layers: tgtLayers, ports: tgtPorts, links: tgtLinks,
        levelWindows: targetNormalized.levelWindows, levelViews: targetNormalized.levelViews
    });

    // Кросс-проектные связи/штекеры (Фаза 6.1/6.2), чей порт уехал вместе с
    // веткой, переписываются на новый projectId — перенос не должен рвать ни
    // живую связь, ни висящий штекер. Как и создание/удаление таких связей,
    // этот шаг не входит в Undo ни одного из двух проектов (см. AGENTS.md).
    if (movedPortIds.size > 0) {
        const crossProjectLinks = { ...(next.crossProjectLinks || {}) };
        Object.keys(crossProjectLinks).forEach(id => {
            const link = crossProjectLinks[id];
            if (!link) return;
            let changed = false;
            let updated = link;
            if (link.sourceProjectId === sourceProjectId && movedPortIds.has(link.sourcePortId)) { updated = { ...updated, sourceProjectId: targetProjectId }; changed = true; }
            if (link.targetProjectId === sourceProjectId && movedPortIds.has(link.targetPortId)) { updated = { ...updated, targetProjectId: targetProjectId }; changed = true; }
            if (changed) crossProjectLinks[id] = updated;
        });
        next = { ...next, crossProjectLinks };

        const remainingSourcePending = { ...(next.projects[sourceProjectId].pendingGateways || {}) };
        const movingPending = {};
        Object.keys(remainingSourcePending).forEach(linkId => {
            const gw = remainingSourcePending[linkId];
            if (gw && movedPortIds.has(gw.portId)) {
                movingPending[linkId] = gw;
                delete remainingSourcePending[linkId];
            }
        });
        if (Object.keys(movingPending).length > 0) {
            next = {
                ...next,
                projects: {
                    ...next.projects,
                    [sourceProjectId]: { ...next.projects[sourceProjectId], pendingGateways: remainingSourcePending },
                    [targetProjectId]: { ...next.projects[targetProjectId], pendingGateways: { ...(next.projects[targetProjectId].pendingGateways || {}), ...movingPending } }
                }
            };
        }
    }

    return pruneContainerIsolation(next);
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
        // Кросс-проектные связи (Фаза 6.1): сама связь — глобальное поле, не
        // принадлежит ни одному из двух проектов, обрабатывается здесь
        // напрямую (в отличие от FOR_PROJECT — тут нет одного адресата-проекта,
        // которому можно делегировать плоский вид).
        case 'ADD_CROSS_PROJECT_LINK': {
            const { sourceProjectId, sourcePortId, targetProjectId, targetPortId } = action.payload || {};
            if (!sourceProjectId || !targetProjectId || sourceProjectId === targetProjectId) return m;
            if (!sourcePortId || !targetPortId || sourcePortId === targetPortId) return m;
            const sProj = m.projects[sourceProjectId];
            const tProj = m.projects[targetProjectId];
            if (!sProj || !tProj) return m;
            if (!sProj.ports || !sProj.ports[sourcePortId]) return m;
            if (!tProj.ports || !tProj.ports[targetPortId]) return m;
            const id = action.payload.id || 'xlink-' + Date.now() + Math.floor(Math.random() * 1000);
            const link = {
                id, sourceProjectId, sourcePortId, targetProjectId, targetPortId,
                color: action.payload.color || '#3b82f6',
                name: action.payload.name || '',
                linkStyle: action.payload.linkStyle || 'orthogonal'
            };
            return { ...m, crossProjectLinks: { ...(m.crossProjectLinks || {}), [id]: link } };
        }
        case 'REMOVE_CROSS_PROJECT_LINK': {
            const id = typeof action.payload === 'string' ? action.payload : (action.payload && action.payload.id);
            if (!id || !m.crossProjectLinks || !m.crossProjectLinks[id]) return m;
            const next = { ...m.crossProjectLinks };
            delete next[id];
            return { ...m, crossProjectLinks: next };
        }
        case 'UPDATE_CROSS_PROJECT_PROXY_PORT': {
            // Аналог UPDATE_PROXY_PORT (см. однопроектный reducer) для связи,
            // хранящейся в state.crossProjectLinks вместо state.links.
            const { linkId, windowId, edge, fraction } = action.payload || {};
            const link = m.crossProjectLinks && m.crossProjectLinks[linkId];
            if (!link || !windowId) return m;
            if (!['top', 'bottom', 'left', 'right'].includes(edge)) return m;
            const f = Math.max(0.03, Math.min(0.97, Number(fraction)));
            if (Number.isNaN(f)) return m;
            return {
                ...m,
                crossProjectLinks: {
                    ...m.crossProjectLinks,
                    [linkId]: { ...link, proxyOverrides: { ...(link.proxyOverrides || {}), [windowId]: { edge, fraction: f } } }
                }
            };
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
            // migrateToV11/migrateToV10 (внутри LOAD_STATE) не умеют отличить
            // «сирота v13 с parentId прямо на узел» от старого дуализма
            // parentId/ownerId и достраивают ownerId, где его в файле не было —
            // migrateProjectEntitiesToV13 сводит это обратно к чистому parentId
            // независимо от того, из какой версии реально пришёл файл.
            const loaded = migrateProjectEntitiesToV13(reducer(base, { type: 'LOAD_STATE', payload: data }));
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
            // externalGateways (Фаза 6.2): «разрывы» кросс-проектных связей,
            // записанные при локальном экспорте одной из половин (см.
            // ContextActionBar.js/handleExportProject) — оседают как штекеры,
            // пока не найдётся вторая половина с тем же linkId (см. ниже).
            if (Array.isArray(data.externalGateways) && data.externalGateways.length) {
                const pendingGateways = {};
                data.externalGateways.forEach(gw => { if (gw && gw.linkId) pendingGateways[gw.linkId] = gw; });
                proj.pendingGateways = pendingGateways;
            }
            const right = globalRightEdge(m.projects);
            if (right !== null) proj = shiftProjectWindows(proj, right + PROJECT_SLOT_GAP, -400);
            const next = {
                ...m,
                projects: { ...m.projects, [id]: proj },
                projectOrder: [...m.projectOrder, id],
                activeProjectId: id,
                projectCounter: n,
                selectedIds: [],
                isolatedIds: []
            };
            return reconcilePendingGateways(next);
        }
        case 'MERGE_PROJECT_FROM_FILE': {
            // Слияние импортируемого файла В АКТИВНЫЙ проект (Фаза 6.5) — в
            // отличие от ADD_PROJECT_FROM_FILE («добавить как НОВЫЙ проект»,
            // раздельные словари, коллизий id по конструкции нет), здесь
            // словари ОБЩИЕ: каждая сущность файла получает свежий id, все
            // внутренние ссылки (parentId, nodeId порта, sourcePortId/
            // targetPortId, ключи proxyOverrides, portId штекеров) переписываются
            // через карту oldId -> newId.
            const data = action.payload;
            if (!data || !data.nodes || !data.ports || !data.links) return m;
            if (!m.activeProjectId || !m.projects[m.activeProjectId]) return m;
            const activeProj = m.projects[m.activeProjectId];

            const base = {
                ...defaultState,
                nodes: {}, layers: {}, ports: {}, links: {},
                levelWindows: {}, levelViews: {},
                past: [], future: [], historyLogs: []
            };
            // migrateToV11/migrateToV10 (внутри LOAD_STATE) не умеют отличить
            // «сирота v13 с parentId прямо на узел» от старого дуализма
            // parentId/ownerId и достраивают ownerId, где его в файле не было —
            // migrateProjectEntitiesToV13 сводит это обратно к чистому parentId
            // независимо от того, из какой версии реально пришёл файл.
            const loaded = migrateProjectEntitiesToV13(reducer(base, { type: 'LOAD_STATE', payload: data }));

            let seq = 0;
            const genId = (prefix) => `${prefix}-${Date.now()}-${seq++}`;
            const idMap = {};
            Object.keys(loaded.nodes).forEach(id => { idMap[id] = genId('node'); });
            Object.keys(loaded.layers).forEach(id => { idMap[id] = genId('layer'); });
            Object.keys(loaded.ports).forEach(id => { idMap[id] = genId('port'); });
            Object.keys(loaded.links).forEach(id => { idMap[id] = genId('link'); });

            // Окна уровней: то же levelIndex в активном проекте — сливаем в
            // НЕГО; иначе заводим новое (появится под нижним существующим —
            // тот же рост глубины, что у REPARENT_ENTITY/normalizeLevelWindows).
            const activeWindowsByLevel = {};
            Object.values(activeProj.levelWindows || {}).forEach(w => { if (w) activeWindowsByLevel[w.levelIndex] = w; });
            const windowIdMap = {};
            const newWindows = {};
            Object.values(loaded.levelWindows || {}).forEach(w => {
                if (!w) return;
                const existing = activeWindowsByLevel[w.levelIndex];
                if (existing) {
                    windowIdMap[w.id] = existing.id;
                } else {
                    const newId = newWindowId();
                    windowIdMap[w.id] = newId;
                    newWindows[newId] = { ...w, id: newId };
                }
            });

            // Главный холст активного проекта — его СОБСТВЕННОЕ содержимое
            // адресует его литералом 'root', а не явным id окна (v13, «сироты
            // на уровне 0 компактно остаются 'root'», см. IDEAL_INTERACTIONS
            // §1). GeometryUtils.resolveContextCollisions группирует контекст
            // СТРОКОЙ parentId — если слитое содержимое окажется на явном id
            // окна ('lvlwin-root'), а исходное — на литерале 'root', коллизии
            // между ними просто не заметят друг друга, хотя это ОДИН контекст.
            const activeRootWinId = activeWindowsByLevel[0] ? activeWindowsByLevel[0].id : null;
            const collapseRoot = (wid) => (wid && wid === activeRootWinId) ? 'root' : wid;

            const remapParentId = (pid) => {
                // «root» файла — его собственный Главный холст (levelIndex 0);
                // сливается с Главным холстом активного проекта — тот есть всегда.
                if (pid === 'root') return 'root';
                if (windowIdMap[pid]) return collapseRoot(windowIdMap[pid]);
                if (idMap[pid]) return idMap[pid];
                return 'root'; // защитный фолбэк — не должен наступать при корректном файле
            };

            const remappedNodes = {};
            Object.entries(loaded.nodes).forEach(([oldId, n]) => {
                if (!n) return;
                const newId = idMap[oldId];
                remappedNodes[newId] = { ...n, id: newId, parentId: remapParentId(n.parentId) };
            });
            const remappedLayers = {};
            Object.entries(loaded.layers).forEach(([oldId, l]) => {
                if (!l) return;
                const newId = idMap[oldId];
                remappedLayers[newId] = { ...l, id: newId, parentId: remapParentId(l.parentId) };
            });
            const remappedPorts = {};
            Object.entries(loaded.ports).forEach(([oldId, p]) => {
                if (!p) return;
                const newId = idMap[oldId];
                remappedPorts[newId] = { ...p, id: newId, nodeId: idMap[p.nodeId] || p.nodeId };
            });
            const remappedLinks = {};
            Object.entries(loaded.links).forEach(([oldId, l]) => {
                if (!l) return;
                const newId = idMap[oldId];
                const proxyOverrides = l.proxyOverrides
                    ? Object.fromEntries(Object.entries(l.proxyOverrides).map(([wid, ov]) => [windowIdMap[wid] || wid, ov]))
                    : undefined;
                remappedLinks[newId] = {
                    ...l, id: newId,
                    sourcePortId: idMap[l.sourcePortId] || l.sourcePortId,
                    targetPortId: idMap[l.targetPortId] || l.targetPortId,
                    ...(proxyOverrides ? { proxyOverrides } : {})
                };
            });

            // Слияние словарей + авто-раздвижка коллизий на корне каждого
            // уровня — как в LOAD_STATE, теперь на ОБЪЕДИНЁННОМ наборе
            // (существующее содержимое активного проекта + новоприбывшее).
            const mergedNodesRaw = { ...activeProj.nodes, ...remappedNodes };
            const mergedLayers = { ...activeProj.layers, ...remappedLayers };
            const G = getGeometry();
            const mergedNodes = (G && G.resolveContextCollisions) ? G.resolveContextCollisions(mergedNodesRaw, mergedLayers) : mergedNodesRaw;
            const mergedPorts = { ...activeProj.ports, ...remappedPorts };
            const mergedLinks = { ...activeProj.links, ...remappedLinks };
            const mergedLevelWindows = { ...activeProj.levelWindows, ...newWindows };
            const mergedLevelViews = { ...activeProj.levelViews };
            Object.keys(newWindows).forEach(wid => { if (!mergedLevelViews[wid]) mergedLevelViews[wid] = makeLevelView(); });

            // externalGateways файла (Фаза 6.2) — portId уже смотрит на СТАРЫЙ
            // id, переписывается той же картой; оседают в pendingGateways
            // активного проекта, reconcilePendingGateways сразу пробует примирить.
            const mergedPendingGateways = { ...(activeProj.pendingGateways || {}) };
            if (Array.isArray(data.externalGateways)) {
                data.externalGateways.forEach(gw => {
                    if (!gw || !gw.linkId || !gw.portId) return;
                    const newPortId = idMap[gw.portId];
                    if (!newPortId) return;
                    mergedPendingGateways[gw.linkId] = { ...gw, portId: newPortId };
                });
            }

            const historyState = saveHistory(mergeActiveView(m), 'Слияние проекта из файла');
            const mergedActiveProj = {
                ...activeProj,
                ...historyState,
                nodes: mergedNodes, layers: mergedLayers, ports: mergedPorts, links: mergedLinks,
                levelWindows: mergedLevelWindows, levelViews: mergedLevelViews,
                pendingGateways: mergedPendingGateways
            };

            const next = { ...m, projects: { ...m.projects, [m.activeProjectId]: mergedActiveProj }, selectedIds: [] };
            return reconcilePendingGateways(next);
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
        case 'LOAD_GLOBAL_STATE': {
            // Глобальный импорт рабочего пространства (Фаза 6.4): файл от
            // handleExportWorkspace — все проекты разом, а не один. Полностью
            // ЗАМЕНЯЕТ текущее рабочее пространство (деструктивно — UI
            // спрашивает подтверждение ДО диспатча, здесь его уже нет).
            const data = action.payload;
            if (!data || !data.projects || !Array.isArray(data.projectOrder)) return m;
            const { projects, projectOrder } = sanitizeLoadedProjects(data.projects, data.projectOrder);
            if (projectOrder.length === 0) return m;
            const activeProjectId = projects[data.activeProjectId] ? data.activeProjectId : projectOrder[0];
            const next = pruneContainerIsolation({
                ...m,
                projects, projectOrder, activeProjectId,
                projectCounter: data.projectCounter || projectOrder.length,
                crossProjectLinks: data.crossProjectLinks || {},
                canvas: data.canvas || m.canvas,
                selectedIds: [], isolatedIds: [],
                interactionMode: 'default',
                pendingConnection: null,
                dragGesture: null
            });
            // Файл мог сохранить неразрешённые штекеры с прошлого раза —
            // если обе половины нашлись внутри ЭТОГО ЖЕ импорта, примиряем сразу.
            return reconcilePendingGateways(next);
        }
        case 'REPARENT_ENTITY': {
            // Кросс-проектный перенос (Фаза 6.3): targetProjectId задан и
            // отличается от sourceProjectId — перехватывается ЗДЕСЬ, до
            // delegateToActiveProject, поскольку трогает ДВА проекта разом.
            // Обычный (внутрипроектный) REPARENT_ENTITY, для которого этих
            // полей нет, падает в default — поведение не меняется.
            const p = action.payload || {};
            if (p.sourceProjectId && p.targetProjectId && p.sourceProjectId !== p.targetProjectId) {
                return applyCrossProjectReparent(m, p);
            }
            return delegateToActiveProject(m, action);
        }
        default:
            return delegateToActiveProject(m, action);
    }
};

// Начальное мультипроектное состояние: сохранённое v12 -> санитизация;
// иначе легаси (v9/v10/v11 через getInitialState) -> обёртка в один проект.
/**
 * Санитизация словаря проектов из сырых сохранённых/импортированных данных:
 * нормализация окон уровней и связей, транзиентные поля (past/future) с
 * чистого листа. Общая для загрузки из localStorage (getInitialMultiState) и
 * глобального импорта рабочего пространства (LOAD_GLOBAL_STATE, Фаза 6.4) —
 * оба читают тот же формат v12-мультипроектного JSON.
 * @param {Object<string, Object>} rawProjects
 * @param {Array<string>} rawProjectOrder
 * @returns {{ projects: Object<string, Object>, projectOrder: Array<string> }}
 */
const sanitizeLoadedProjects = (rawProjects, rawProjectOrder) => {
    const projects = {};
    Object.entries(rawProjects || {}).forEach(([pid, p]) => {
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
    const projectOrder = (rawProjectOrder || []).filter(pid => projects[pid]);
    return { projects, projectOrder };
};

const getInitialMultiState = () => {
    if (typeof localStorage !== 'undefined') {
        try {
            const savedMulti = localStorage.getItem(STORAGE_KEY_V12);
            if (savedMulti) {
                const parsed = JSON.parse(savedMulti);
                if (parsed && parsed.projects && Array.isArray(parsed.projectOrder)) {
                    const { projects, projectOrder } = sanitizeLoadedProjects(parsed.projects, parsed.projectOrder);
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
                    // migrateToV13 активирована: TRANSFER_NODE физически удалён из
                    // редьюсера и ни один живой путь создания сущности (ADD_NODE,
                    // ADD_LAYER, CREATE_NESTED_NODE, REPARENT_ENTITY) больше не пишет
                    // ownerId/ownerGap/homeLevel — HierarchyUtils понимает чистый parentId
                    // (включая id окна для сирот-якорей), а REMOVE_LEVEL_WINDOW/
                    // CLEAR_LEVEL_WINDOW/REMOVE_ROOT_CANVAS ре-якорят обе формы одинаково
                    // (structuralParentOf). Санитизация здесь однократна: миграция читает
                    // формат ДО того, как он попадёт в mergeActiveView/компоненты.
                    return migrateToV13({
                        ...globalDefaults(),
                        canvas: parsed.canvas || defaultState.canvas,
                        aiChatHistory: parsed.aiChatHistory || defaultState.aiChatHistory,
                        aiChatHistoryByNode: parsed.aiChatHistoryByNode || {},
                        aiChatSessionsByNode: parsed.aiChatSessionsByNode || {},
                        crossProjectLinks: parsed.crossProjectLinks || {},
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
                    });
                }
            }
        } catch (e) {
            console.error('Ошибка загрузки мультипроектного состояния:', e);
            try { localStorage.removeItem(STORAGE_KEY_V12); } catch (_) {}
        }
    }
    // Легаси-путь: getInitialState читает v11/v10/v9 и возвращает плоское состояние
    return migrateToV13(wrapFlatToMulti(getInitialState()));
};

const ArchitectorStore = { isContainerSelectionId, containerSelectionKind, getSelectionClass, toggleSelectionWithClass, windowSelectionId, projectSelectionId, STORAGE_KEY, STORAGE_KEY_V12, LEGACY_STORAGE_KEY_V10, LEGACY_STORAGE_KEY_V9, FORMAT_VERSION, FORMAT_VERSION_V13, FORMAT_VERSION_V14, LEVEL0_WINDOW_ID, PROJECT_FIELDS, defaultState, getInitialState, getInitialMultiState, reducer, multiReducer, mergeActiveView, projectFlatView, writeProjectView, wrapFlatToMulti, makeProject, saveHistory, migrateToV10, migrateToV11, migrateToV13, migrateToV14, migrateProjectEntitiesToV14, normalizeLevelWindows, normalizeWindows, reconcilePendingGateways, applyRemoveProject };
if (typeof window !== 'undefined') window.ArchitectorStore = ArchitectorStore;
if (typeof module !== 'undefined') module.exports = ArchitectorStore;
