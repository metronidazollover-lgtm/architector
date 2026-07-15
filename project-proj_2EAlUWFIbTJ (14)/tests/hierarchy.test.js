const { test } = require('node:test');
const assert = require('node:assert/strict');

const HierarchyUtils = require('../utils/hierarchy.js');

const nodes = {
    parent: { id: 'parent', name: 'P', parentId: 'root' },
    a: { id: 'a', name: 'A', parentId: 'parent' },
    b: { id: 'b', name: 'B', parentId: 'parent' },
    outside: { id: 'outside', name: 'O', parentId: 'root' }
};
const layers = {
    l1: { id: 'l1', name: 'L1', parentId: 'parent' }
};
const ports = {
    pa: { id: 'pa', nodeId: 'a' },
    pb: { id: 'pb', nodeId: 'b' },
    po: { id: 'po', nodeId: 'outside' }
};
const links = [
    { id: 'inner', sourcePortId: 'pa', targetPortId: 'pb' },
    { id: 'crossing', sourcePortId: 'pa', targetPortId: 'po' }
];

test('getChildrenStats: считает узлы, слои и только внутренние связи', () => {
    const stats = HierarchyUtils.getChildrenStats(nodes, layers, ports, links, 'parent');
    assert.equal(stats.nodeCount, 2);
    assert.equal(stats.layerCount, 1);
    assert.equal(stats.linkCount, 1); // crossing не считается
    assert.equal(stats.total, 3);
});

test('getChildrenStats: пустой родитель', () => {
    const stats = HierarchyUtils.getChildrenStats(nodes, layers, ports, links, 'outside');
    assert.equal(stats.total, 0);
    assert.equal(stats.linkCount, 0);
});

test('getChildrenStats: устойчив к отсутствию слоёв и связей', () => {
    const stats = HierarchyUtils.getChildrenStats(nodes, null, {}, null, 'parent');
    assert.equal(stats.nodeCount, 2);
    assert.equal(stats.layerCount, 0);
});
