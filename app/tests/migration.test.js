const { test } = require('node:test');
const assert = require('node:assert/strict');

global.HierarchyUtils = require('../utils/hierarchy.js');
global.GeometryUtils = require('../utils/geometry.js');
const { migrateToV10, migrateToV13, reducer, defaultState, FORMAT_VERSION } = require('../store/reducer.js');
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

test('REPARENT_ENTITY: локальная позиция на уровне сохраняется при выносе из слоя', () => {
    // Модель v11: контейнером может быть только слой или root, поэтому перевложение
    // проверяется в пределах одного уровня — позиция в системе координат уровня не меняется.
    const s0 = {
        ...defaultState,
        layers: { L: { id: 'L', name: 'L', parentId: 'root', ownerId: null, position: { x: 1000, y: 500 }, size: { w: 600, h: 400 } } },
        nodes: { inLayer: { id: 'inLayer', name: 'IL', parentId: 'L', ownerId: null, position: { x: 40, y: 90 }, size: { w: 200, h: 100 } } }
    };
    const before = H.getLocalPosition('inLayer', s0.nodes, s0.layers);
    assert.deepEqual(before, { x: 1040, y: 590 });

    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'inLayer', newParentId: 'root' } });
    assert.equal(s1.nodes.inLayer.parentId, 'root');
    assert.deepEqual(H.getLocalPosition('inLayer', s1.nodes, s1.layers), before);
});

test('REPARENT_ENTITY: цикл отклоняется', () => {
    const m = migrateToV10(v9project());
    const s0 = { ...defaultState, nodes: m.nodes, layers: m.layers };
    // Попытка вложить inLayer в его собственного потомка child
    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'inLayer', newParentId: 'child' } });
    assert.equal(s1, s0);
});

// ---------------------------------------------------------------------------
// REPARENT_ENTITY (Фаза 4, расширенный контракт): { ids, targetParentId,
// targetLevelIndex?, mode?: 'deep'|'shallow', position? }. Фикстуры ниже —
// чистые v13-сущности (parentId напрямую, без ownerId), в отличие от тестов
// выше, которые проверяют обратную совместимость со старым { id, newParentId }.
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

test('REPARENT_ENTITY (shallow): прямой ребёнок усыновляется прежним родителем, поддерево ребёнка не трогается', () => {
    const s0 = v13TreeState();
    assert.equal(HierarchyUtils.getEntityLevel('child1', s0.nodes, s0.layers, s0.levelWindows), 1);
    assert.equal(HierarchyUtils.getEntityLevel('grandchild1', s0.nodes, s0.layers, s0.levelWindows), 2);

    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'child1', targetParentId: 'L', mode: 'shallow' } });

    assert.equal(s1.nodes.child1.parentId, 'L', 'сам child1 переехал в целевой слой');
    assert.equal(s1.nodes.grandchild1.parentId, 'root1', 'внук усыновлён ПРЕЖНИМ родителем child1 (root1), а не поехал следом');
    assert.equal(HierarchyUtils.getEntityLevel('grandchild1', s1.nodes, s1.layers, s1.levelWindows), 1, 'внук поднялся на уровень бывшего родителя child1');
    assert.ok(Number.isFinite(s1.nodes.grandchild1.position.x) && Number.isFinite(s1.nodes.grandchild1.position.y));
});

test('REPARENT_ENTITY (shallow): findFreePosition разводит всплывшего ребёнка с уже занятым местом в новом контейнере', () => {
    const s0 = v13TreeState();
    // «Засеваем» root1-контейнер сущностью ровно там, куда попытается встать grandchild1
    // после всплытия (grandchild1.position совпадает с root1's own position — оба {0,0}/{5,5}
    // не пересекаются напрямую, поэтому явно кладём конкурента на позицию грядущего всплытия)
    s0.nodes.blocker = { id: 'blocker', name: 'Blocker', parentId: 'root1', position: { x: 5, y: 5 }, size: { w: 200, h: 100 } };

    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'child1', targetParentId: 'L', mode: 'shallow' } });
    const g = s1.nodes.grandchild1;
    const b = s1.nodes.blocker;
    const overlap = g.position.x < b.position.x + b.size.w + 20 && g.position.x + g.size.w + 20 > b.position.x
        && g.position.y < b.position.y + b.size.h + 20 && g.position.y + g.size.h + 20 > b.position.y;
    assert.equal(overlap, false, 'findFreePosition не даёт grandchild1 наложиться на blocker');
});

test('REPARENT_ENTITY: массив ids переносит несколько сущностей одним шагом истории', () => {
    const s0 = v13TreeState();
    const pastBefore = s0.past.length;

    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { ids: ['root1', 'lonely'], targetParentId: 'L' } });

    assert.equal(s1.nodes.root1.parentId, 'L');
    assert.equal(s1.nodes.lonely.parentId, 'L');
    assert.equal(s1.past.length, pastBefore + 1, 'весь батч — один шаг Undo');
});

test('REPARENT_ENTITY: targetLevelIndex резолвится в id окна уровня — сирота-якорь на своём уровне', () => {
    const s0 = v13TreeState();
    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'lonely', targetLevelIndex: 2 } });

    assert.equal(s1.nodes.lonely.parentId, 'w2');
    assert.equal(HierarchyUtils.getEntityLevel('lonely', s1.nodes, s1.layers, s1.levelWindows), 2);
});

test('REPARENT_ENTITY: явный position (одиночный drop) переопределяет авторасстановку', () => {
    const s0 = v13TreeState();
    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'lonely', targetParentId: 'L', position: { x: 42, y: 24 } } });
    assert.deepEqual(s1.nodes.lonely.position, { x: 42, y: 24 });
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

test('REPARENT_ENTITY: вложение в любой слой валидно (нет проверки «слой чужого уровня») — цикл всё ещё отклоняется', () => {
    const s0 = v13TreeState();
    // lonely (уровень 0) в L (уровень 0, но проверка на РАВЕНСТВО уровней в v13 не нужна вовсе)
    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'lonely', targetParentId: 'L' } });
    assert.equal(s1.nodes.lonely.parentId, 'L');

    // Цикл: L не может стать родителем root1, если бы root1 уже был предком L
    const s2 = { ...s0, layers: { L: { ...s0.layers.L, parentId: 'root1' } } };
    const s3 = reducer(s2, { type: 'REPARENT_ENTITY', payload: { id: 'root1', targetParentId: 'L' } });
    assert.equal(s3, s2, 'root1 -> L образовало бы цикл (L уже внутри root1) — no-op');
});

test('REPARENT_ENTITY (shallow): Undo одним шагом возвращает И перенесённую сущность, И усыновлённых детей', () => {
    const s0 = v13TreeState();
    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'child1', targetParentId: 'L', mode: 'shallow' } });
    assert.notEqual(s1.nodes.grandchild1.parentId, s0.nodes.grandchild1.parentId);

    const s2 = reducer(s1, { type: 'UNDO' });
    assert.equal(s2.nodes.child1.parentId, 'root1', 'child1 вернулся на место');
    assert.deepEqual(s2.nodes.grandchild1, s0.nodes.grandchild1, 'внук вернулся к исходному parentId и позиции — тем же шагом Undo');

    const s3 = reducer(s2, { type: 'REDO' });
    assert.equal(s3.nodes.child1.parentId, 'L');
    assert.equal(s3.nodes.grandchild1.parentId, 'root1');
});

test('REPARENT_ENTITY: historySnapshot делает Drag&Drop-жест (движение + перенос) одним шагом Undo', () => {
    const s0 = { ...v13TreeState(), selectedIds: ['lonely'] };
    // Жест: движение мышью (skipHistory) + сам перенос — как в живом драге
    // (Node.js/Layer.js dispatch REPARENT_ENTITY с p.historySnapshot = срез mousedown)
    const s1 = reducer(s0, { type: 'MOVE_SELECTED', payload: { dx: 100, dy: 0, skipHistory: true } });
    const s2 = reducer(s1, {
        type: 'REPARENT_ENTITY',
        payload: {
            id: 'lonely',
            targetParentId: 'L',
            historySnapshot: { nodes: s0.nodes, layers: s0.layers, ports: s0.ports, links: s0.links }
        }
    });
    assert.equal(s2.nodes.lonely.parentId, 'L', 'перенос состоялся');
    assert.equal(s2.past.length, s0.past.length + 1, 'ровно один шаг истории на весь жест');

    const s3 = reducer(s2, { type: 'UNDO' });
    assert.deepEqual(s3.nodes.lonely, s0.nodes.lonely, 'Undo вернул ИСХОДНОЕ состояние до mousedown, а не промежуточное движение');
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

test('REMOVE_LAYER: дети слоя сохраняют абсолютные позиции', () => {
    const m = migrateToV10(v9project());
    const s0 = { ...defaultState, nodes: m.nodes, layers: m.layers };
    const absBefore = H.getRawChainSum('inLayer', s0.nodes, s0.layers);

    const s1 = reducer(s0, { type: 'REMOVE_LAYER', payload: 'L' });
    assert.equal(s1.nodes.inLayer.parentId, 'root');
    assert.deepEqual(H.getRawChainSum('inLayer', s1.nodes, s1.layers), absBefore);
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
