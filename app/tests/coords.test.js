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

test('Метрики окна уровня заданы в одном месте', () => {
    const M = HierarchyUtils.LEVEL_WINDOW_METRICS;
    assert.ok(M, 'HierarchyUtils.LEVEL_WINDOW_METRICS должен существовать');
    assert.equal(typeof M.headerH, 'number');
    assert.equal(typeof M.borderW, 'number');
    assert.equal(M.headerH, 40);
    assert.equal(M.borderW, 2);
});

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

test('getLocalPosition: цепочка parentId никогда не пересекает границу уровня', () => {
    const s = makeState();
    s.layers = { lay1: { id: 'lay1', parentId: 'root', ownerId: 'a', position: { x: 5, y: 5 } } };
    s.nodes.inLayer = { id: 'inLayer', parentId: 'lay1', ownerId: null, position: { x: 7, y: 8 }, size: { w: 100, h: 50 } };

    // Узел уровня 1 не должен тащить за собой позицию узла-владельца с уровня 0
    assert.deepEqual(HierarchyUtils.getLocalPosition('a1', s.nodes, s.layers), { x: 30, y: 40 });
    // Внутри слоя позиции складываются как обычно
    assert.deepEqual(HierarchyUtils.getLocalPosition('inLayer', s.nodes, s.layers), { x: 12, y: 13 });
});

test('getWorldTransform: рамка, шапка, панорама и масштаб окна учтены ровно один раз', () => {
    const s = makeState();
    const { headerH, borderW } = HierarchyUtils.LEVEL_WINDOW_METRICS;

    const t0 = HierarchyUtils.getWorldTransform('a', s);
    assert.deepEqual(t0, { x: 0 + borderW + 0 + 10, y: 0 + borderW + headerH + 0 + 10, scale: 1 });

    const t1 = HierarchyUtils.getWorldTransform('a1', s);
    // x = win.x + border + innerOffset.x + local.x * innerZoom = 100 + 2 + 50 + 60
    // y = win.y + border + header + innerOffset.y + local.y * innerZoom = 200 + 2 + 40 + 60 + 80
    assert.deepEqual(t1, { x: 212, y: 382, scale: 2 });
});

test('getNodeWorldBounds: габариты узла масштабируются внутренним зумом окна', () => {
    const s = makeState();
    const b = HierarchyUtils.getNodeWorldBounds('a1', s);
    assert.deepEqual(b, { x: 212, y: 382, w: 400, h: 200 });
});

test('getPortWorldPosition: точка порта = мировая точка узла плюс смещение по грани', () => {
    const s = makeState();
    const t = HierarchyUtils.getWorldTransform('a1', s);
    const rel = GeometryUtils.getPortRelativePosition(s.ports['p-a1-in'], s.nodes.a1);

    const p = HierarchyUtils.getPortWorldPosition('p-a1-in', s);
    assert.deepEqual(p, { x: t.x + rel.x * t.scale, y: t.y + rel.y * t.scale });
});

test('getLinkEndpoints: концы связи совпадают с мировыми точками её портов', () => {
    const s = makeState();
    const ends = HierarchyUtils.getLinkEndpoints('link-cross', s);
    assert.ok(ends, 'getLinkEndpoints должен возвращать концы связи');

    const p1 = HierarchyUtils.getPortWorldPosition('p-a-out', s);
    const p2 = HierarchyUtils.getPortWorldPosition('p-a1-in', s);

    assert.equal(ends.p1.x, p1.x);
    assert.equal(ends.p1.y, p1.y);
    assert.equal(ends.p2.x, p2.x);
    assert.equal(ends.p2.y, p2.y);
    assert.equal(ends.isCrossLevel, true, 'связь между уровнями 0 и 1 — межуровневая');
});

test('getLinkEndpoints: внутриуровневая связь помечается как таковая', () => {
    const s = makeState();
    s.nodes.a2 = { id: 'a2', parentId: 'root', ownerId: 'a', position: { x: 300, y: 40 }, size: { w: 200, h: 100 } };
    s.ports['p-a2-in'] = { id: 'p-a2-in', nodeId: 'a2', edge: 'left', position: 0.5 };
    s.links['link-intra'] = { id: 'link-intra', sourcePortId: 'p-a1-in', targetPortId: 'p-a2-in' };

    const ends = HierarchyUtils.getLinkEndpoints('link-intra', s);
    assert.equal(ends.isCrossLevel, false);
    assert.equal(ends.levelIndex, 1, 'внутриуровневая связь знает свой уровень');
});

test('Кэш координат инвалидируется при изменении камеры окна', () => {
    const s = makeState();
    const before = HierarchyUtils.getWorldTransform('a1', s);

    const s2 = {
        ...s,
        levelViews: {
            ...s.levelViews,
            'lvlwin-1': { innerOffset: { x: 50, y: 60 }, innerZoom: 3, isCollapsed: false }
        }
    };
    const after = HierarchyUtils.getWorldTransform('a1', s2);

    assert.notDeepEqual(before, after, 'смена innerZoom обязана менять мировую трансформацию');
    assert.equal(after.scale, 3);
});

test('Содержимое загруженного проекта попадает внутрь рамки своего уровня', () => {
    const fs = require('fs');
    const path = require('path');
    const demoJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../demo_project.json'), 'utf8'));

    const s = reducer(defaultState, { type: 'LOAD_STATE', payload: demoJson });
    const { headerH, borderW } = HierarchyUtils.LEVEL_WINDOW_METRICS;

    const offenders = [];
    Object.values(s.nodes || {}).forEach(node => {
        const lvl = HierarchyUtils.getLevel(node.id, s.nodes, s.layers);
        const win = HierarchyUtils.getWindowOfLevel(lvl, s.levelWindows);
        assert.ok(win, `для уровня ${lvl} должно существовать окно`);

        const b = HierarchyUtils.getNodeWorldBounds(node.id, s);
        const frame = {
            left: win.position.x + borderW,
            top: win.position.y + borderW + headerH,
            right: win.position.x + win.size.w - borderW,
            bottom: win.position.y + win.size.h - borderW
        };

        if (b.x < frame.left || b.y < frame.top || b.x + b.w > frame.right || b.y + b.h > frame.bottom) {
            offenders.push(`${node.id} (уровень ${lvl})`);
        }
    });

    assert.deepEqual(offenders, [], 'узлы демо-проекта не должны выходить за рамку своего окна');
});

test('UPDATE_LEVEL_PROPERTIES: поля камеры маршрутизируются в levelViews, а не теряются', () => {
    // Регрессия: обработчики панорамы и зума внутри окна шлют именно этот экшен.
    // Если он отбросит innerOffset/innerZoom, панорамирование внутри уровня просто перестанет работать.
    const winId = Object.values(defaultState.levelWindows)[0].id;

    let s = reducer(defaultState, {
        type: 'UPDATE_LEVEL_PROPERTIES',
        payload: { index: 0, updates: { innerOffset: { x: 33, y: 44 }, innerZoom: 1.7 }, skipHistory: true }
    });
    assert.deepEqual(s.levelViews[winId].innerOffset, { x: 33, y: 44 });
    assert.equal(s.levelViews[winId].innerZoom, 1.7);
    assert.equal(s.past.length, 0, 'движение камеры не пишет историю');
    assert.equal(s.levelWindows[winId].innerZoom, undefined, 'камера не протекает в запись окна');

    // Свойства рамки по-прежнему меняются и попадают в историю, камера при этом цела
    s = reducer(s, { type: 'UPDATE_LEVEL_PROPERTIES', payload: { index: 0, updates: { name: 'Переименован' } } });
    assert.equal(s.levelWindows[winId].name, 'Переименован');
    assert.equal(s.levelViews[winId].innerZoom, 1.7);
    assert.equal(s.past.length, 1);
});

test('CENTER_ON_ENTITY: подводит камеру ОКНА, а не только мировую', () => {
    // Регрессия: если узел уехал за видимую область вьюпорта, он обрезан рамкой.
    // Одно мировое центрирование прилетало на верную, но визуально ПУСТУЮ точку.
    let s = makeState();
    // Уводим содержимое окна далеко в сторону — узел a1 гарантированно за обрезкой
    s.levelViews['lvlwin-1'] = { innerOffset: { x: -5000, y: -4000 }, innerZoom: 1, isCollapsed: false };

    const after = reducer(s, { type: 'CENTER_ON_ENTITY', payload: 'a1' });
    const view = after.levelViews['lvlwin-1'];

    assert.notDeepEqual(view.innerOffset, { x: -5000, y: -4000 }, 'внутренняя камера окна обязана сдвинуться');

    // Центр узла после сдвига попадает в центр видимой области окна
    const { headerH, borderW } = HierarchyUtils.LEVEL_WINDOW_METRICS;
    const win = after.levelWindows['lvlwin-1'];
    const viewportW = win.size.w - borderW * 2;
    const viewportH = Math.max(200, win.size.h - headerH);

    const t = HierarchyUtils.getWorldTransform('a1', after);
    const cx = t.x + (after.nodes.a1.size.w / 2) * t.scale;
    const cy = t.y + (after.nodes.a1.size.h / 2) * t.scale;

    assert.equal(Math.round(cx), Math.round(win.position.x + borderW + viewportW / 2));
    assert.equal(Math.round(cy), Math.round(win.position.y + borderW + headerH + viewportH / 2));
});

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
