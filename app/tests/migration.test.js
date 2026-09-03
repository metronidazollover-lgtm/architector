const { test } = require('node:test');
const assert = require('node:assert/strict');

global.HierarchyUtils = require('../utils/hierarchy.js');
global.GeometryUtils = require('../utils/geometry.js');
const { migrateToV10, migrateToV13, migrateToV14, normalizeWindows, reducer, defaultState, FORMAT_VERSION } = require('../store/reducer.js');
const H = global.HierarchyUtils;

// Эталонная реализация уровня v13 (docs/IDEAL_INTERACTIONS.md §1.1), НЕЗАВИСИМАЯ
// от hierarchy.js: до Фазы 3 getLevel всё ещё читает ownerId/homeLevel и не умеет
// разрешать parentId, указывающий на id окна уровня. Тесты ниже проверяют, что
// migrateToV13 сохраняет уровень КАЖДОЙ сущности, сверяясь с этой независимой
// реализацией целевого алгоритма, а не с текущим (устаревающим) getLevel.
const getV13Level = (id, nodes, layers, levelWindows, seen = new Set()) => {
    if (seen.has(id)) return 0; // защита от цикла в тестовых фикстурах
    seen.add(id);
    const e = nodes[id] || layers[id];
    if (!e) return 0;
    const pid = e.parentId;
    if (pid === 'root') return 0;
    const win = Object.values(levelWindows || {}).find(w => w && w.id === pid);
    if (win) return win.levelIndex;
    if (layers[pid]) return getV13Level(pid, nodes, layers, levelWindows, seen);
    if (nodes[pid]) return getV13Level(pid, nodes, layers, levelWindows, seen) + 1;
    return 0;
};

// Проект в формате v9: все позиции мировые
const v9project = () => ({
    layers: {
        L: { id: 'L', name: 'L', position: { x: 1000, y: 500 }, size: { w: 600, h: 400 }, parentId: 'root' }
    },
    nodes: {
        root1: { id: 'root1', name: 'R1', position: { x: -50, y: -20 }, size: { w: 200, h: 100 }, parentId: 'root' },
        inLayer: { id: 'inLayer', name: 'IL', position: { x: 1040, y: 590 }, size: { w: 200, h: 100 }, parentId: 'L' },
        child: { id: 'child', name: 'C', position: { x: 1100, y: 700 }, size: { w: 200, h: 100 }, parentId: 'inLayer' }
    },
    ports: {},
    links: []
});

test('migrateToV10: дети получают координаты относительно родителя, корень не тронут', () => {
    const m = migrateToV10(v9project());
    assert.deepEqual(m.nodes.root1.position, { x: -50, y: -20 });
    assert.deepEqual(m.nodes.inLayer.position, { x: 40, y: 90 });   // 1040-1000, 590-500
    assert.deepEqual(m.nodes.child.position, { x: 60, y: 110 });    // 1100-1040, 700-590
    // migrateToV10 доводит проект именно до v10; до v11 его поднимает migrateToV11
    assert.equal(m.formatVersion, 10);
});

test('migrateToV10: абсолютные позиции после миграции совпадают с исходными мировыми', () => {
    const m = migrateToV10(v9project());
    assert.deepEqual(H.getRawChainSum('child', m.nodes, m.layers), { x: 1100, y: 700 });
    assert.deepEqual(H.getRawChainSum('inLayer', m.nodes, m.layers), { x: 1040, y: 590 });
});

test('migrateToV10: идемпотентность по formatVersion', () => {
    const once = migrateToV10(v9project());
    const twice = migrateToV10(once);
    assert.equal(twice, once);
});

test('migrateToV10: сирота с несуществующим родителем остаётся на месте', () => {
    const data = v9project();
    data.nodes.orphan = { id: 'orphan', name: 'O', position: { x: 5, y: 6 }, parentId: 'ghost' };
    const m = migrateToV10(data);
    assert.deepEqual(m.nodes.orphan.position, { x: 5, y: 6 });
});

test('LOAD_STATE: v9-файл мигрирует на лету, v10 проходит как есть', () => {
    const s0 = { ...defaultState };
    const s1 = reducer(s0, { type: 'LOAD_STATE', payload: v9project() });
    assert.deepEqual(s1.nodes.inLayer.position, { x: 20, y: 90 });

    const v10payload = { ...v9project(), formatVersion: 10 };
    const s2 = reducer(s0, { type: 'LOAD_STATE', payload: v10payload });
    assert.deepEqual(s2.nodes.inLayer.position, { x: 20, y: 90 }); // auto-aligned on load
});

test('LOAD_STATE: конвертирует массив связей links в словарь { [id]: link }', () => {
    const s0 = { ...defaultState };
    const payloadWithArrayLinks = {
        nodes: {},
        ports: {},
        layers: {},
        links: [
            { id: 'link-1', sourcePortId: 'p1', targetPortId: 'p2', name: 'Link 1' },
            { id: 'link-2', sourcePortId: 'p3', targetPortId: 'p4', name: 'Link 2' }
        ]
    };
    const s1 = reducer(s0, { type: 'LOAD_STATE', payload: payloadWithArrayLinks });
    assert.ok(!Array.isArray(s1.links), 'links должен быть объектом-словарем');
    assert.equal(Object.keys(s1.links).length, 2);
    assert.deepEqual(s1.links['link-1'].name, 'Link 1');
    assert.deepEqual(s1.links['link-2'].name, 'Link 2');
});

// v14 (§7.12/§3 плана): REPARENT_ENTITY переписан на месте — targetParentId
// только 'root' или id узла, слой как цель и toRelativePosition-совмещение
// «то же окно уровня» удалены. Тест «локальная позиция сохраняется при
// выносе из слоя» проверял именно эту убранную семантику — удалён;
// v14-покрытие REPARENT_ENTITY (deep/shallow/цикл/undo/historySnapshot,
// с узлом целью вместо слоя) — в app/tests/reducer.test.js.

test('REPARENT_ENTITY: цикл отклоняется', () => {
    const m = migrateToV10(v9project());
    const s0 = { ...defaultState, nodes: m.nodes, layers: m.layers };
    // Попытка вложить inLayer в его собственного потомка child
    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'inLayer', newParentId: 'child' } });
    assert.equal(s1, s0);
});

// ---------------------------------------------------------------------------
// REPARENT_ENTITY (Фаза 4 v13, расширенный контракт): { ids, targetParentId,
// targetLevelIndex?, mode?: 'deep'|'shallow', position? }. Фикстура v13TreeState
// (со слоем L) — используется только тестом ниже, который не целится в слой
// вовсе (только узлы). Остальные тесты этого блока целились в слой L или в
// targetLevelIndex — обе цели УДАЛЕНЫ в v14 (§3/§7.12 плана: targetParentId
// только 'root' или id узла) и удалены отсюда; v14-покрытие REPARENT_ENTITY
// (deep/shallow/цикл/undo/historySnapshot/массив ids/positionsById/авто-
// открытие дорожки на узле-цели, все — с узлом, а не слоем, в качестве цели)
// — в app/tests/reducer.test.js.
// ---------------------------------------------------------------------------

const win13 = (id, levelIndex) => ({ id, levelIndex, name: id, position: { x: 0, y: id === 'lvlwin-root' ? 0 : 800 * levelIndex }, size: { w: 1000, h: 700 } });

const v13TreeState = () => ({
    ...defaultState,
    levelWindows: { 'lvlwin-root': win13('lvlwin-root', 0), w1: win13('w1', 1), w2: win13('w2', 2) },
    layers: {
        L: { id: 'L', name: 'L', parentId: 'root', position: { x: 500, y: 0 }, size: { w: 400, h: 300 } }
    },
    nodes: {
        root1: { id: 'root1', name: 'Root1', parentId: 'root', position: { x: 0, y: 0 }, size: { w: 200, h: 100 } },
        child1: { id: 'child1', name: 'Child1', parentId: 'root1', position: { x: 10, y: 10 }, size: { w: 200, h: 100 } },
        grandchild1: { id: 'grandchild1', name: 'Grandchild1', parentId: 'child1', position: { x: 5, y: 5 }, size: { w: 200, h: 100 } },
        lonely: { id: 'lonely', name: 'Lonely', parentId: 'root', position: { x: 700, y: 0 }, size: { w: 200, h: 100 } }
    }
});

test('REPARENT_ENTITY: перенос НА УЗЕЛ (порождение подуровня) никогда не использует toRelativePosition — только findFreePosition', () => {
    // Ловушка: узел-цель может лежать на levelIndex, числено совпадающем с уровнем
    // переносимой сущности минус один (targetLevel = target.level+1 === entityLevel).
    // Раньше это ошибочно трактовалось как «то же окно» — но position узла-цели
    // выражена в координатах ЕГО РОДИТЕЛЬСКОГО окна, а не имеет отношения к
    // происхождению координат его СОБСТВЕННОГО подуровня. toRelativePosition тут
    // всегда даёт мусор — только findFreePosition.
    const s0 = v13TreeState();
    // child1 (уровень 1) переносим на root1 (уровень 0): root1.level+1 === 1 === entityLevel(child1)
    // — то самое численное совпадение, которое раньше подделывалось под «то же окно».
    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'child1', targetParentId: 'root1' } });
    assert.equal(s1.nodes.child1.parentId, 'root1');
    assert.equal(HierarchyUtils.getEntityLevel('child1', s1.nodes, s1.layers, s1.levelWindows), 1);
    // НЕ toRelativePosition(child1.position={10,10}, root1.position={0,0}) = {10,10} по
    // совпадению — а findFreePosition рядом с исходной позицией {10,10}, что для
    // пустого целевого контейнера совпадает {10,10}. Различие проявится там, где
    // toRelativePosition дал бы явно иное число — проверяем формулой напрямую:
    // root1.position={0,0}, так что оба пути численно совпали бы здесь. Берём
    // сценарий, где они расходятся: root1 смещён.
    const s0b = v13TreeState();
    s0b.nodes.root1 = { ...s0b.nodes.root1, position: { x: 900, y: 900 } };
    const s2 = reducer(s0b, { type: 'REPARENT_ENTITY', payload: { id: 'child1', targetParentId: 'root1' } });
    // toRelativePosition дал бы {10-900, 10-900} = {-890,-890} — грубо неверно.
    // findFreePosition игнорирует root1.position и остаётся рядом с {10,10}.
    assert.ok(s2.nodes.child1.position.x > -100 && s2.nodes.child1.position.y > -100,
        `findFreePosition не должен вычитать смещённую позицию узла-цели: получено ${JSON.stringify(s2.nodes.child1.position)}`);
});

test('MOVE_SELECTED: потомок выделенного предка не двигается дважды', () => {
    const m = migrateToV10(v9project());
    const s0 = { ...defaultState, nodes: m.nodes, layers: m.layers, selectedIds: ['inLayer', 'child'] };
    const s1 = reducer(s0, { type: 'MOVE_SELECTED', payload: { dx: 10, dy: 20, skipHistory: true } });
    assert.deepEqual(s1.nodes.inLayer.position, { x: 50, y: 110 });
    // child остался на месте относительно родителя, мир сдвинулся на 10/20 один раз
    assert.deepEqual(s1.nodes.child.position, { x: 60, y: 110 });
    assert.deepEqual(H.getRawChainSum('child', s1.nodes, s1.layers), { x: 1110, y: 720 });
});

test('DELETE_SELECTED: удаление слоя не смещает его детей в мире', () => {
    const m = migrateToV10(v9project());
    const s0 = { ...defaultState, nodes: m.nodes, layers: m.layers, selectedIds: ['L'] };
    const absBefore = H.getRawChainSum('inLayer', s0.nodes, s0.layers);

    const s1 = reducer(s0, { type: 'DELETE_SELECTED' });
    assert.equal(s1.layers.L, undefined);
    assert.deepEqual(H.getRawChainSum('inLayer', s1.nodes, s1.layers), absBefore);
});

test('getRawChainSum: цикл parentId не зацикливает', () => {
    const nodes = {
        a: { id: 'a', position: { x: 1, y: 1 }, parentId: 'b' },
        b: { id: 'b', position: { x: 2, y: 2 }, parentId: 'a' }
    };
    const p = H.getRawChainSum('a', nodes, {});
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
});

// ---------------------------------------------------------------------------
// migrateToV13 (v12 -> v13): ownerId/ownerGap/homeLevel -> единый parentId.
// См. docs/IDEAL_INTERACTIONS.md §1 и комментарий над migrateProjectEntitiesToV13
// в app/store/reducer.js.
// ---------------------------------------------------------------------------

const win = (id, levelIndex) => ({ id, levelIndex, position: { x: 0, y: 0 }, size: { w: 800, h: 600 } });

// Проект в формате v11/v12: 4-уровневое дерево со слоями (Тест 1 из Фазы 2 §2.3)
// L0: root1 (обычный узел, владелец слоя L)                        уровень 0
//     L (слой на root1, ownerId: root1)                            уровень 1 (владелец — узел)
//         inLayerChild (parentId: L, ownerId: 'ghost' — «лапша»:   уровень 1 (координата решает,
//                        координатно в слое, но структурно чужой)              ownerId отбрасывается)
//     child1 (ownerId: root1, gap=1)                                уровень 1
//         grandchild1 (ownerId: child1, gap=1)                      уровень 2
const complexTreeProject = () => ({
    levelWindows: { w0: win('w0', 0), w1: win('w1', 1), w2: win('w2', 2) },
    layers: {
        L: { id: 'L', name: 'L', parentId: 'root', ownerId: 'root1', position: { x: 0, y: 0 }, size: { w: 400, h: 300 } }
    },
    nodes: {
        root1: { id: 'root1', name: 'Root1', parentId: 'root', ownerId: null, position: { x: 0, y: 0 }, size: { w: 200, h: 100 } },
        inLayerChild: { id: 'inLayerChild', name: 'InLayerChild', parentId: 'L', ownerId: 'ghost-does-not-exist', position: { x: 30, y: 80 }, size: { w: 200, h: 100 } },
        child1: { id: 'child1', name: 'Child1', parentId: 'root', ownerId: 'root1', position: { x: 10, y: 10 }, size: { w: 200, h: 100 } },
        grandchild1: { id: 'grandchild1', name: 'Grandchild1', parentId: 'root', ownerId: 'child1', position: { x: 5, y: 5 }, size: { w: 200, h: 100 } }
    },
    ports: {}, links: {}, past: [], future: [], historyLogs: []
});

const multiState = (proj) => ({
    projects: { p1: proj },
    projectOrder: ['p1'],
    activeProjectId: 'p1',
    projectCounter: 1,
    formatVersion: 12
});

test('migrateToV13: узел в слое со «спагетти»-ownerId — координата побеждает, ownerId отброшен', () => {
    const before = complexTreeProject();
    const m = migrateToV13(multiState(before));
    const after = m.projects.p1;

    assert.equal(after.nodes.inLayerChild.parentId, 'L');
    assert.equal(after.nodes.inLayerChild.ownerId, undefined);
    assert.equal(after.nodes.inLayerChild.ownerGap, undefined);
    assert.equal(after.nodes.inLayerChild.homeLevel, undefined);
    assert.deepEqual(after.nodes.inLayerChild.position, before.nodes.inLayerChild.position);
});

test('migrateToV13: обычная цепочка ownerId (gap=1) переходит в прямой parentId', () => {
    const before = complexTreeProject();
    const m = migrateToV13(multiState(before));
    const after = m.projects.p1;

    assert.equal(after.layers.L.parentId, 'root1');
    assert.equal(after.nodes.child1.parentId, 'root1');
    assert.equal(after.nodes.grandchild1.parentId, 'child1');
    ['ownerId', 'ownerGap', 'homeLevel'].forEach(f => {
        assert.equal(after.layers.L[f], undefined);
        assert.equal(after.nodes.child1[f], undefined);
        assert.equal(after.nodes.grandchild1[f], undefined);
    });
});

test('migrateToV13: уровень каждой сущности сохранён (сверка со старым getLevel и с эталонным v13-алгоритмом)', () => {
    const before = complexTreeProject();
    const oldLevels = {};
    ['root1', 'child1', 'grandchild1'].forEach(id => { oldLevels[id] = H.getLevel(id, before.nodes, before.layers); });
    oldLevels.L = H.getLevel('L', before.nodes, before.layers);
    oldLevels.inLayerChild = H.getLevel('inLayerChild', before.nodes, before.layers);

    const m = migrateToV13(multiState(before));
    const after = m.projects.p1;

    Object.keys(oldLevels).forEach(id => {
        const newLevel = getV13Level(id, after.nodes, after.layers, after.levelWindows);
        assert.equal(newLevel, oldLevels[id], `уровень ${id} должен остаться ${oldLevels[id]}, получено ${newLevel}`);
    });
});

test('migrateToV13: позиции и связи не меняются — только структура родства', () => {
    const before = complexTreeProject();
    const m = migrateToV13(multiState(before));
    const after = m.projects.p1;

    Object.keys(before.nodes).forEach(id => {
        assert.deepEqual(after.nodes[id].position, before.nodes[id].position);
        assert.deepEqual(after.nodes[id].size, before.nodes[id].size);
    });
    assert.deepEqual(after.layers.L.position, before.layers.L.position);
    assert.equal(m.formatVersion, 13);
});

// Тест 2 из Фазы 2 §2.3: сирота с ownerGap > 1 (после очистки промежуточного уровня)
test('migrateToV13: ownerGap > 1 конвертируется в явный якорь на своём уровне окна, а не в прямую ссылку на владельца', () => {
    const before = {
        levelWindows: { w0: win('w0', 0), w1: win('w1', 1), w2: win('w2', 2) },
        layers: {},
        nodes: {
            root1: { id: 'root1', name: 'Root1', parentId: 'root', ownerId: null, position: { x: 0, y: 0 }, size: { w: 200, h: 100 } },
            // «внук» после удаления уровня 1: владелец root1 (уровень 0), но сам живёт на уровне 2
            grandchildGap: { id: 'grandchildGap', name: 'GrandchildGap', parentId: 'root', ownerId: 'root1', ownerGap: 2, position: { x: 15, y: 15 }, size: { w: 200, h: 100 } }
        },
        ports: {}, links: {}, past: [], future: [], historyLogs: []
    };
    const oldLevel = H.getLevel('grandchildGap', before.nodes, before.layers);
    assert.equal(oldLevel, 2);

    const m = migrateToV13(multiState(before));
    const after = m.projects.p1;

    // НЕ прямая ссылка на root1 (это дало бы уровень 1, а не 2) — явный якорь на окно уровня 2
    assert.equal(after.nodes.grandchildGap.parentId, 'w2');
    assert.equal(getV13Level('grandchildGap', after.nodes, after.layers, after.levelWindows), 2);
    assert.deepEqual(after.nodes.grandchildGap.position, before.nodes.grandchildGap.position);
});

// Классический сирота-якорь (homeLevel), без ownerId вовсе
test('migrateToV13: сирота-якорь (homeLevel) конвертируется в parentId = id окна своего уровня', () => {
    const before = {
        levelWindows: { w0: win('w0', 0), w1: win('w1', 1), w2: win('w2', 2) },
        layers: {},
        nodes: {
            anchor2: { id: 'anchor2', name: 'Anchor2', parentId: 'root', ownerId: null, homeLevel: 2, position: { x: 1, y: 1 }, size: { w: 200, h: 100 } }
        },
        ports: {}, links: {}, past: [], future: [], historyLogs: []
    };
    const m = migrateToV13(multiState(before));
    const after = m.projects.p1;

    assert.equal(after.nodes.anchor2.parentId, 'w2');
    assert.equal(after.nodes.anchor2.homeLevel, undefined);
    assert.equal(getV13Level('anchor2', after.nodes, after.layers, after.levelWindows), 2);
});

// Мёртвая ссылка на владельца — тот же путь, что истинный сирота
test('migrateToV13: узел с мёртвой ownerId-ссылкой мигрирует как обычный сирота на своём (нулевом) уровне', () => {
    const before = {
        levelWindows: { w0: win('w0', 0) },
        layers: {},
        nodes: {
            deadOwner: { id: 'deadOwner', name: 'DeadOwner', parentId: 'root', ownerId: 'ghost-missing', position: { x: 2, y: 2 }, size: { w: 200, h: 100 } }
        },
        ports: {}, links: {}, past: [], future: [], historyLogs: []
    };
    const m = migrateToV13(multiState(before));
    assert.equal(m.projects.p1.nodes.deadOwner.parentId, 'root');
    assert.equal(m.projects.p1.nodes.deadOwner.ownerId, undefined);
});

test('migrateToV13: идемпотентность по formatVersion — состояние уже v13 возвращается той же ссылкой', () => {
    const already = { projects: {}, projectOrder: [], activeProjectId: null, formatVersion: 13 };
    assert.equal(migrateToV13(already), already);
});

test('migrateToV13: несколько проектов мигрируют независимо', () => {
    const projA = complexTreeProject();
    const projB = {
        levelWindows: { w0: win('w0', 0) },
        layers: {},
        nodes: { solo: { id: 'solo', name: 'Solo', parentId: 'root', ownerId: null, position: { x: 9, y: 9 }, size: { w: 100, h: 50 } } },
        ports: {}, links: {}, past: [], future: [], historyLogs: []
    };
    const m = migrateToV13({
        projects: { a: projA, b: projB },
        projectOrder: ['a', 'b'],
        activeProjectId: 'a',
        projectCounter: 2,
        formatVersion: 12
    });
    assert.equal(m.projects.a.nodes.child1.parentId, 'root1');
    assert.equal(m.projects.b.nodes.solo.parentId, 'root');
    assert.equal(m.formatVersion, 13);
});

// v14 (§7.13 плана): тесты, диспатчащие REMOVE_LEVEL_WINDOW/CLEAR_LEVEL_WINDOW
// (ре-якорение при удалении/очистке уровня) удалены — Фаза 3 удаляет сами
// обработчики этих типов экшенов вместе со всей логикой ре-якорения/сдвига
// уровней; понятия, которые эти тесты проверяли, в v14 не существуют.

test('CREATE_NESTED_NODE (v13): новый узел получает parentId напрямую на родителя, без ownerId', () => {
    let s = { ...defaultState };
    s = reducer(s, { type: 'ADD_NODE', payload: { id: 'root1', name: 'Root1', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' } });
    s = reducer(s, { type: 'CREATE_NESTED_NODE', payload: { parentId: 'root1', id: 'child1', name: 'Child1' } });

    assert.equal(s.nodes.child1.parentId, 'root1');
    assert.equal(s.nodes.child1.ownerId, undefined);
    assert.equal(H.getEntityLevel('child1', s.nodes, s.layers, s.levelWindows), 1);
});

test('CREATE_NESTED_NODE (v14): создание глубокой цепочки автоматически открывает дорожку каждого нового родителя', () => {
    let s = { ...defaultState };
    s = reducer(s, { type: 'ADD_NODE', payload: { id: 'root1', name: 'Root1', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' } });
    s = reducer(s, { type: 'CREATE_NESTED_NODE', payload: { parentId: 'root1', id: 'l1', name: 'L1' } });
    s = reducer(s, { type: 'CREATE_NESTED_NODE', payload: { parentId: 'l1', id: 'l2', name: 'L2' } });

    assert.equal(s.nodes.l2.parentId, 'l1');
    assert.ok(HierarchyUtils.windowsOfLane('root1', s.windows).length > 0, 'дорожка root1 открылась под первый CREATE_NESTED_NODE');
    assert.ok(HierarchyUtils.windowsOfLane('l1', s.windows).length > 0, 'дорожка l1 открылась под второй CREATE_NESTED_NODE');
});

test('DELETE_SELECTED (v13): удаление узла каскадно удаляет всю v13-ветку потомков', () => {
    let s = { ...defaultState };
    s = reducer(s, { type: 'ADD_NODE', payload: { id: 'root1', name: 'Root1', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' } });
    s = reducer(s, { type: 'CREATE_NESTED_NODE', payload: { parentId: 'root1', id: 'child1', name: 'Child1' } });
    s = reducer(s, { type: 'CREATE_NESTED_NODE', payload: { parentId: 'child1', id: 'grandchild1', name: 'Grandchild1' } });
    s = { ...s, selectedIds: ['root1'] };

    s = reducer(s, { type: 'DELETE_SELECTED' });

    assert.equal(s.nodes.root1, undefined);
    assert.equal(s.nodes.child1, undefined);
    assert.equal(s.nodes.grandchild1, undefined, 'v13-внук каскадно удалён вместе с веткой (Deep-семантика удаления по умолчанию)');
});

// ---------------------------------------------------------------------------
// migrateToV14 (v13 -> v14): дорожки/окна-наборы/рамки-множества вместо
// уровней и слоёв. См. docs/LANES_MODEL.md и «Отчеты, аудиты, планы/Lanes_v14/
// PLAN_V14_LANES.md» §2.6, §7.11 (ВАЖНО: migrateToV14 в этой фазе написана,
// но НЕ подключена к getInitialMultiState — живая загрузка остаётся на
// migrateToV13, см. комментарий над migrateProjectEntitiesToV14 в reducer.js).
// Тесты вызывают migrateToV14 напрямую на собранных фикстурах.
// ---------------------------------------------------------------------------

// Эталонная реализация структурного родителя v14 (§2.6 плана), НЕЗАВИСИМАЯ от
// migrateProjectEntitiesToV14: до Фазы 2 нет живого HierarchyUtils.dumpNotation,
// поэтому раздел ДЕРЕВО нотации (§1 плана) сверяется этой отдельной реализацией
// целевого алгоритма (сирота-якорь -> 'root', слой — проходной), а не повторным
// вызовом самой миграции.
const refStructuralParentV14 = (id, nodes, layers, levelWindows, seen = new Set()) => {
    if (seen.has(id)) return 'root';
    seen.add(id);
    const e = nodes[id] || layers[id];
    if (!e) return 'root';
    const pid = e.parentId;
    if (!pid || pid === 'root') return 'root';
    if (levelWindows && levelWindows[pid]) return 'root'; // сирота-якорь -> root (решение §0.4.7)
    if (layers[pid]) return refStructuralParentV14(pid, nodes, layers, levelWindows, seen);
    if (nodes[pid]) return pid;
    return 'root';
};

test('migrateToV14: v11-файл с ownerGap (через полную цепочку migrateToV13) — сирота-якорь становится root, ветка не теряется, узлы/порты/связи не теряются', () => {
    const before = {
        levelWindows: { w0: win('w0', 0), w1: win('w1', 1), w2: win('w2', 2) },
        layers: {},
        nodes: {
            root1: { id: 'root1', name: 'Root1', parentId: 'root', ownerId: null, position: { x: 0, y: 0 }, size: { w: 200, h: 100 } },
            grandchildGap: { id: 'grandchildGap', name: 'GrandchildGap', parentId: 'root', ownerId: 'root1', ownerGap: 2, position: { x: 15, y: 15 }, size: { w: 200, h: 100 } }
        },
        ports: { p1: { id: 'p1', nodeId: 'root1', type: 'output', edge: 'right', position: 0.5, name: 'Out' } },
        links: {}, past: [], future: [], historyLogs: []
    };

    const v13 = migrateToV13(multiState(before));
    const v13proj = v13.projects.p1;
    assert.equal(v13proj.nodes.grandchildGap.parentId, 'w2', 'предусловие: v13 якорит через окно уровня 2');

    const v14 = migrateToV14(v13);
    const after = v14.projects.p1;

    assert.equal(v14.formatVersion, 14);
    assert.equal(after.nodes.root1.parentId, 'root');
    assert.equal(after.nodes.grandchildGap.parentId, 'root', 'сирота-якорь упрощается до root (решение §0.4.7) — ветка сохраняется, домашняя глубина нет');
    assert.equal(Object.keys(after.nodes).length, Object.keys(before.nodes).length, 'ни один узел не потерян');
    assert.deepEqual(after.ports, before.ports, 'порты не тронуты миграцией');
    assert.deepEqual(after.links, before.links, 'связи не тронуты миграцией');

    // Ни root1, ни grandchildGap не имеют детей — окна уровня 1 и 2 остаются без дорожек и не создаются.
    assert.ok(Object.values(after.windows).some(w => w.lanes.includes('root')), 'окно с корневой дорожкой есть');
    assert.equal(Object.values(after.windows).some(w => w.lanes.length && !w.lanes.includes('root')), false, 'окна без дорожек (уровни 1 и 2) не созданы');
});

test('migrateToV14: v13-сирота-якорь напрямую на окно (без прохода через v11) тоже упрощается до root', () => {
    const before = {
        levelWindows: { w0: win('w0', 0), w2: win('w2', 2) },
        layers: {},
        nodes: {
            anchor2: { id: 'anchor2', name: 'Anchor2', parentId: 'w2', position: { x: 1, y: 1 }, size: { w: 200, h: 100 } }
        },
        ports: {}, links: {}, past: [], future: [], historyLogs: [],
        formatVersion: 13
    };
    const after = migrateToV14(multiState(before)).projects.p1;
    assert.equal(after.nodes.anchor2.parentId, 'root');
});

test('migrateToV14: слой-в-слое — узел вложенного слоя становится членом ОБЕИХ рамок, позиция копит оба смещения', () => {
    const before = {
        levelWindows: { w0: win('w0', 0) },
        layers: {
            L: { id: 'L', name: 'L', parentId: 'root', position: { x: 100, y: 50 }, size: { w: 600, h: 400 } },
            L2: { id: 'L2', name: 'L2', parentId: 'L', position: { x: 20, y: 30 }, size: { w: 300, h: 200 } }
        },
        nodes: {
            deepNode: { id: 'deepNode', name: 'Deep', parentId: 'L2', position: { x: 5, y: 5 }, size: { w: 100, h: 50 } }
        },
        ports: {}, links: {}, past: [], future: [], historyLogs: [],
        formatVersion: 13
    };
    const after = migrateToV14(multiState(before)).projects.p1;

    assert.equal(after.nodes.deepNode.parentId, 'root', 'структурный родитель — первый узел или root, слои — проходные');
    assert.deepEqual(after.nodes.deepNode.position, { x: 125, y: 85 }, 'позиция копит смещения L и L2 (100+20+5, 50+30+5)');
    assert.ok(after.frames.L2.members.includes('deepNode'), 'прямой член L2');
    assert.ok(after.frames.L.members.includes('deepNode'), 'вложенный слой: узел L2 становится членом и внешней рамки L тоже');
    assert.equal(after.frames.L.homeLaneId, 'root');
    assert.equal(after.frames.L2.homeLaneId, 'root', 'L2 структурно тоже на root (L сам лежит на root)');
});

test('migrateToV14: порты слоя остаются на id рамки (не теряются, не переезжают)', () => {
    const before = {
        levelWindows: { w0: win('w0', 0) },
        layers: { L: { id: 'L', name: 'L', parentId: 'root', position: { x: 0, y: 0 }, size: { w: 400, h: 300 } } },
        nodes: {},
        ports: { pL: { id: 'pL', nodeId: 'L', type: 'output', edge: 'right', position: 0.5, name: 'Out' } },
        links: {}, past: [], future: [], historyLogs: [],
        formatVersion: 13
    };
    const after = migrateToV14(multiState(before)).projects.p1;

    assert.ok(after.frames.L, 'слой L стал рамкой');
    assert.equal(after.ports.pL.nodeId, 'L', 'порт остался на id рамки (id слоя не меняется)');
    assert.deepEqual(after.frames.L.members, [], 'рамка без узлов-членов, только порт');
});

test('migrateToV14: полное дерево (сложная v11-фикстура) — раздел ДЕРЕВО нотации совпадает с независимой эталонной реализацией, узлы/порты/связи не теряются', () => {
    const before11 = complexTreeProject();
    const v13 = migrateToV13(multiState(before11));
    const before13 = v13.projects.p1;

    const v14 = migrateToV14(v13);
    const after = v14.projects.p1;

    // ДЕРЕВО: для каждого узла и слоя v13-состояния структурный родитель после
    // миграции должен совпасть с независимо посчитанным эталоном.
    Object.keys(before13.nodes).forEach(id => {
        const expected = refStructuralParentV14(id, before13.nodes, before13.layers, before13.levelWindows);
        assert.equal(after.nodes[id].parentId, expected, `узел ${id}: ожидался структурный родитель ${expected}`);
    });
    Object.keys(before13.layers).forEach(id => {
        const expected = refStructuralParentV14(id, before13.nodes, before13.layers, before13.levelWindows);
        assert.equal(after.frames[id].homeLaneId, expected, `рамка ${id}: ожидался homeLaneId ${expected}`);
    });

    // СВЯЗИ: порты и связи миграция не трогает.
    assert.deepEqual(after.ports, before13.ports);
    assert.deepEqual(after.links, before13.links);

    // Ничего не потеряно.
    assert.equal(Object.keys(after.nodes).length, Object.keys(before13.nodes).length);
    assert.equal(Object.keys(after.frames).length, Object.keys(before13.layers).length);
});

test('migrateToV14: несколько проектов мигрируют независимо, formatVersion становится 14', () => {
    const projA = complexTreeProject();
    const projB = {
        levelWindows: { w0: win('w0', 0) },
        layers: {},
        nodes: { solo: { id: 'solo', name: 'Solo', parentId: 'root', position: { x: 9, y: 9 }, size: { w: 100, h: 50 } } },
        ports: {}, links: {}, past: [], future: [], historyLogs: []
    };
    const v13 = migrateToV13({
        projects: { a: projA, b: projB },
        projectOrder: ['a', 'b'],
        activeProjectId: 'a',
        projectCounter: 2,
        formatVersion: 12
    });
    const v14 = migrateToV14(v13);

    assert.equal(v14.formatVersion, 14);
    assert.equal(v14.projects.b.nodes.solo.parentId, 'root');
    assert.ok(v14.projects.a.nodes && v14.projects.a.frames, 'проект a тоже сконвертирован');
});

test('migrateToV14: идемпотентность по formatVersion — состояние уже v14 возвращается той же ссылкой', () => {
    const already = { projects: {}, projectOrder: [], activeProjectId: null, formatVersion: 14 };
    assert.equal(migrateToV14(already), already);
});

test('normalizeWindows: ссылки на дорожки удалённых узлов вычищаются, опустевшее окно схлопывается', () => {
    const nodes = { A: { id: 'A', name: 'A', parentId: 'root' } };
    const raw = {
        w1: { id: 'w1', lanes: ['root', 'A', 'ghost'], hidden: ['ghost'] },
        w2: { id: 'w2', lanes: ['ghost'], hidden: [] }
    };
    const result = normalizeWindows(raw, nodes);
    assert.deepEqual(result.w1.lanes, ['root', 'A'], 'мёртвая ссылка ghost вычищена из lanes');
    assert.deepEqual(result.w1.hidden, [], 'мёртвая ссылка ghost вычищена из hidden');
    assert.equal(result.w2, undefined, 'окно, опустевшее после чистки, схлопывается');
});
