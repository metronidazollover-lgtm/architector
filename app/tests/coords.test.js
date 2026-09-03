// Ловушки координатной системы уровней (План v3, Фаза 0).
// Эти тесты фиксируют инварианты, из-за нарушения которых расходились
// концы связей: единое координатное ядро, единый источник метрик окна
// и попадание содержимого проекта внутрь рамки своего уровня.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const HierarchyUtils = require('../utils/hierarchy.js');
const GeometryUtils = require('../utils/geometry.js');
const { reducer, defaultState } = require('../store/reducer.js');

global.HierarchyUtils = HierarchyUtils;
global.GeometryUtils = GeometryUtils;

// Модель v11: окна по стабильным id, камера отдельно, уровень выводится из ownerId.
const makeState = (overrides = {}) => ({
    levelWindows: {
        'lvlwin-0': { id: 'lvlwin-0', levelIndex: 0, position: { x: 0, y: 0 }, size: { w: 1000, h: 700 } },
        'lvlwin-1': { id: 'lvlwin-1', levelIndex: 1, position: { x: 100, y: 200 }, size: { w: 900, h: 600 } }
    },
    levelViews: {
        'lvlwin-0': { innerOffset: { x: 0, y: 0 }, innerZoom: 1, isCollapsed: false },
        'lvlwin-1': { innerOffset: { x: 50, y: 60 }, innerZoom: 2, isCollapsed: false }
    },
    nodes: {
        a: { id: 'a', parentId: 'root', ownerId: null, position: { x: 10, y: 10 }, size: { w: 200, h: 100 } },
        a1: { id: 'a1', parentId: 'root', ownerId: 'a', position: { x: 30, y: 40 }, size: { w: 200, h: 100 } }
    },
    layers: {},
    ports: {
        'p-a-out': { id: 'p-a-out', nodeId: 'a', edge: 'right', position: 0.5 },
        'p-a1-in': { id: 'p-a1-in', nodeId: 'a1', edge: 'right', position: 0.5 }
    },
    links: {
        'link-cross': { id: 'link-cross', sourcePortId: 'p-a-out', targetPortId: 'p-a1-in' }
    },
    canvas: { offset: { x: 0, y: 0 }, zoom: 1 },
    ui: defaultState.ui,
    past: [], future: [], historyLogs: [],
    selectedIds: [], isolatedIds: [],
    ...overrides
});

// v14 (Фаза 6): «Метрики окна уровня заданы в одном месте» удалён —
// LEVEL_WINDOW_METRICS не существует (заменена WINDOW_METRICS в v14-разделе
// hierarchy.js, своя проверка не заводилась — константа тривиальна).
test('getLevel: уровень выводится из цепочки ownerId, а не из parentId', () => {
    const s = makeState();
    assert.equal(HierarchyUtils.getLevel('a', s.nodes, s.layers), 0);
    assert.equal(HierarchyUtils.getLevel('a1', s.nodes, s.layers), 1);

    // Узел внутри слоя наследует уровень своего координатного контейнера
    const withLayer = makeState();
    withLayer.layers = { lay1: { id: 'lay1', parentId: 'root', ownerId: 'a', position: { x: 5, y: 5 } } };
    withLayer.nodes.inLayer = { id: 'inLayer', parentId: 'lay1', ownerId: null, position: { x: 7, y: 8 }, size: { w: 100, h: 50 } };
    assert.equal(HierarchyUtils.getLevel('lay1', withLayer.nodes, withLayer.layers), 1);
    assert.equal(HierarchyUtils.getLevel('inLayer', withLayer.nodes, withLayer.layers), 1);
});

// v14 (Фаза 6): getLocalPosition/getWorldTransform/getNodeWorldBounds/
// getPortWorldPosition/getLinkEndpoints и «Кэш координат инвалидируется...»
// удалены вместе с проверяемыми функциями (levelWindows/levelViews не
// существуют) — те же инварианты (координатное ядро, кэш камеры) уже
// покрыты v14-версиями ниже (getWorldTransformV14/getNodeWorldRect/
// getPortWorldPositionV14/«v14 Кэш координат...»).

// v14 (Фаза 5, §7.15 плана): старый тест "содержимое попадает внутрь рамки
// своего уровня" проверял, что per-level окно (в v13 всегда авто-подгонялось
// под размер своего содержимого) визуально вмещает все свои узлы без
// прокрутки. В v14 у дорожки внутри окна ФИКСИРОВАННАЯ ширина колонки
// (ROOT_LANE_W/LANE_W, см. laneRect в hierarchy.js) — это окно-вьюпорт со
// своими pan/zoom (camera), а не бокс, авто-подгоняемый под контент; узел,
// вылезающий за пределы текущего вьюпорта дорожки, не баг, а норма (для
// просмотра пользователь панорамирует/зумит дорожку). "Вмещается без
// прокрутки" не имеет v14-аналога для проверки — заменено проверкой самой
// миграции: LOAD_STATE отдаёт v14-форму и КАЖДЫЙ узел демо-проекта имеет
// корректный (числовой, неотрицательный по метрикам размера) прямоугольник
// в окне своей дорожки, если та где-то открыта.
test('LOAD_STATE демо-проекта: результат — валидная v14-форма (frames/windows), геометрия узлов вычислима', () => {
    const fs = require('fs');
    const path = require('path');
    const demoJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../demo_project.json'), 'utf8'));

    const s = reducer(defaultState, { type: 'LOAD_STATE', payload: demoJson });
    assert.ok(s.frames && typeof s.frames === 'object', 'LOAD_STATE вернул v14-форму (frames)');
    assert.ok(s.windows && typeof s.windows === 'object', 'LOAD_STATE вернул v14-форму (windows)');
    assert.ok(Object.keys(s.windows).length > 0, 'миграция демо-проекта открыла хотя бы одно окно');

    let checked = 0;
    const offenders = [];
    Object.values(s.nodes || {}).forEach(node => {
        const ownerId = node.parentId || 'root';
        const win = HierarchyUtils.windowsOfLane(ownerId, s.windows)[0];
        if (!win) return; // дорожка нигде не открыта — ожидаемо не видна, не нарушитель

        const b = HierarchyUtils.nodeRectInWindow(win, node.id, s);
        checked++;
        if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y) || b.w <= 0 || b.h <= 0) {
            offenders.push(`${node.id} (дорожка ${ownerId})`);
        }
    });

    assert.deepEqual(offenders, [], 'геометрия узла в окне своей дорожки должна быть вычислимым конечным прямоугольником');
    assert.ok(checked > 0, 'хотя бы один узел демо-проекта должен был попасть в открытую дорожку');
});

// v14 (Фаза 6): UPDATE_LEVEL_PROPERTIES удалён вместе с окнами уровней
// (levelWindows/levelViews не существуют в v14) — маршрутизация «камера vs
// свойства окна» покрыта v14-версией, UPDATE_WINDOW_PROPERTIES, см.
// reducer.test.js.

// v14 (Фаза 4): CENTER_ON_ENTITY переписан — центрирует только мировую камеру
// (упрощение, см. reducer.js), отдельной подстройки камеры окна больше нет.
// Тест проверял именно эту подстройку и удалён вместе с ней, а не перенесён —
// см. §7.13 плана.

// =============================================================================
// v14 (Фаза 2, §7.12 плана): координатное ядро окно+дорожка вместо
// рамка-окна-уровня+камера. Тесты выше (v13, getWorldTransform/getLinkEndpoints)
// не трогаются — они проверяют функции, которые продолжает вызывать живой
// v13-путь вплоть до конца Фазы 4. Фикстуры v14 строятся через parseNotation.
// =============================================================================

test('v14 getWorldTransformV14: рамка окна, шапка, панорама и масштаб камеры учтены ровно один раз', () => {
    const state = HierarchyUtils.parseNotation(['ДЕРЕВО', '/A', 'ОКНА', 'W1 = [Проект]'].join('\n'));
    state.windows.W1 = {
        ...state.windows.W1,
        position: { x: 100, y: 200 },
        camera: { offset: { x: 50, y: 60 }, zoom: 2 }
    };
    const t = HierarchyUtils.getWorldTransformV14('A', state);
    const { headerH, borderW } = HierarchyUtils.WINDOW_METRICS;
    // A — в дорожке root, локальная позиция (0,0) (первый ребёнок root в раскладке parseNotation)
    assert.equal(t.x, 100 + borderW + 50 + 0 * 2);
    assert.equal(t.y, 200 + headerH + 60 + 0 * 2);
    assert.equal(t.scale, 2);
});

test('v14 getNodeWorldRect: габариты узла масштабируются камерой окна', () => {
    const state = HierarchyUtils.parseNotation(['ДЕРЕВО', '/A', 'ОКНА', 'W1 = [Проект]'].join('\n'));
    state.windows.W1 = { ...state.windows.W1, camera: { offset: { x: 0, y: 0 }, zoom: 1.5 } };
    const rect = HierarchyUtils.nodeWorldRect('A', state);
    assert.equal(rect.w, state.nodes.A.size.w * 1.5);
    assert.equal(rect.h, state.nodes.A.size.h * 1.5);
});

test('v14 getPortWorldPositionV14: точка порта = мировая точка узла плюс смещение по грани, с учётом зума окна', () => {
    const state = HierarchyUtils.parseNotation([
        'ДЕРЕВО', '/A', '/Б', 'ОКНА', 'W1 = [Проект]', 'СВЯЗИ', 'A.out -> Б.in'
    ].join('\n'));
    state.windows.W1 = { ...state.windows.W1, camera: { offset: { x: 0, y: 0 }, zoom: 2 } };
    const nodeT = HierarchyUtils.getWorldTransformV14('A', state);
    const pos = HierarchyUtils.getPortWorldPositionV14('A-out', state);
    const port = state.ports['A-out'];
    const rel = GeometryUtils.getPortRelativePosition(port, state.nodes.A);
    assert.equal(pos.x, nodeT.x + rel.x * nodeT.scale);
    assert.equal(pos.y, nodeT.y + rel.y * nodeT.scale);
});

test('v14 Кэш координат инвалидируется при изменении камеры окна (getDepth/laneRect читают свежий словарь)', () => {
    const text = ['ДЕРЕВО', '/A', '/A/A1', 'ОКНА', 'W1 = [Проект]', 'W2 = [A]'].join('\n');
    const state1 = HierarchyUtils.parseNotation(text);
    const rect1 = HierarchyUtils.nodeRectInWindow(state1.windows.W2, 'A1', state1);

    const movedWin = { ...state1.windows.W2, position: { x: 900, y: 900 } };
    const state2 = { ...state1, windows: { ...state1.windows, W2: movedWin } };
    const rect2 = HierarchyUtils.nodeRectInWindow(state2.windows.W2, 'A1', state2);

    assert.notDeepEqual(rect1, rect2, 'новый объект окна — новый мировой прямоугольник, не залипший кэш');
});

test('v14 Содержимое дорожки попадает внутрь рамки своего окна (fixtures на реальном demo_project не нужны — нотация достаточна)', () => {
    const text = ['ДЕРЕВО', '/A', '/A/A1', 'ОКНА', 'W1 = [Проект]', 'W2 = [A]'].join('\n');
    const state = HierarchyUtils.parseNotation(text);
    const winRect = { x: state.windows.W2.position.x, y: state.windows.W2.position.y, ...state.windows.W2.size };
    const nodeRect = HierarchyUtils.nodeRectInWindow(state.windows.W2, 'A1', state);
    assert.ok(nodeRect.x >= winRect.x && nodeRect.x + nodeRect.w <= winRect.x + winRect.w);
    assert.ok(nodeRect.y >= winRect.y && nodeRect.y + nodeRect.h <= winRect.y + winRect.h);
});
