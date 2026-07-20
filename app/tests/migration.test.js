const { test } = require('node:test');
const assert = require('node:assert/strict');

global.HierarchyUtils = require('../utils/hierarchy.js');
global.GeometryUtils = require('../utils/geometry.js');
const { migrateToV10, reducer, defaultState, FORMAT_VERSION } = require('../store/reducer.js');
const H = global.HierarchyUtils;

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
    assert.equal(m.formatVersion, FORMAT_VERSION);
});

test('migrateToV10: абсолютные позиции после миграции совпадают с исходными мировыми', () => {
    const m = migrateToV10(v9project());
    assert.deepEqual(H.getAbsolutePosition('child', m.nodes, m.layers), { x: 1100, y: 700 });
    assert.deepEqual(H.getAbsolutePosition('inLayer', m.nodes, m.layers), { x: 1040, y: 590 });
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

test('REPARENT_ENTITY: абсолютная позиция сохраняется', () => {
    const m = migrateToV10(v9project());
    const s0 = { ...defaultState, nodes: m.nodes, layers: m.layers };
    const absBefore = H.getAbsolutePosition('child', s0.nodes, s0.layers);

    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'child', newParentId: 'root' } });
    assert.equal(s1.nodes.child.parentId, 'root');
    assert.deepEqual(H.getAbsolutePosition('child', s1.nodes, s1.layers), absBefore);
});

test('REPARENT_ENTITY: цикл отклоняется', () => {
    const m = migrateToV10(v9project());
    const s0 = { ...defaultState, nodes: m.nodes, layers: m.layers };
    // Попытка вложить inLayer в его собственного потомка child
    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'inLayer', newParentId: 'child' } });
    assert.equal(s1, s0);
});

test('MOVE_SELECTED: потомок выделенного предка не двигается дважды', () => {
    const m = migrateToV10(v9project());
    const s0 = { ...defaultState, nodes: m.nodes, layers: m.layers, selectedIds: ['inLayer', 'child'] };
    const s1 = reducer(s0, { type: 'MOVE_SELECTED', payload: { dx: 10, dy: 20, skipHistory: true } });
    assert.deepEqual(s1.nodes.inLayer.position, { x: 50, y: 110 });
    // child остался на месте относительно родителя, мир сдвинулся на 10/20 один раз
    assert.deepEqual(s1.nodes.child.position, { x: 60, y: 110 });
    assert.deepEqual(H.getAbsolutePosition('child', s1.nodes, s1.layers), { x: 1110, y: 720 });
});

test('REMOVE_LAYER: дети слоя сохраняют абсолютные позиции', () => {
    const m = migrateToV10(v9project());
    const s0 = { ...defaultState, nodes: m.nodes, layers: m.layers };
    const absBefore = H.getAbsolutePosition('inLayer', s0.nodes, s0.layers);

    const s1 = reducer(s0, { type: 'REMOVE_LAYER', payload: 'L' });
    assert.equal(s1.nodes.inLayer.parentId, 'root');
    assert.deepEqual(H.getAbsolutePosition('inLayer', s1.nodes, s1.layers), absBefore);
});

test('DELETE_SELECTED: удаление слоя не смещает его детей в мире', () => {
    const m = migrateToV10(v9project());
    const s0 = { ...defaultState, nodes: m.nodes, layers: m.layers, selectedIds: ['L'] };
    const absBefore = H.getAbsolutePosition('inLayer', s0.nodes, s0.layers);

    const s1 = reducer(s0, { type: 'DELETE_SELECTED' });
    assert.equal(s1.layers.L, undefined);
    assert.deepEqual(H.getAbsolutePosition('inLayer', s1.nodes, s1.layers), absBefore);
});

test('getAbsolutePosition: цикл parentId не зацикливает', () => {
    const nodes = {
        a: { id: 'a', position: { x: 1, y: 1 }, parentId: 'b' },
        b: { id: 'b', position: { x: 2, y: 2 }, parentId: 'a' }
    };
    const p = H.getAbsolutePosition('a', nodes, {});
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
});
