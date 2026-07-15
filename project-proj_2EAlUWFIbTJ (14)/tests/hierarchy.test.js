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

test('getChildrenBBox: охватывает узлы и слои, null без детей', () => {
    const bboxNodes = {
        p: { id: 'p', parentId: 'root', position: { x: 0, y: 0 } },
        a: { id: 'a', parentId: 'p', position: { x: 10, y: 20 }, size: { w: 100, h: 50 } },
        b: { id: 'b', parentId: 'p', position: { x: 200, y: 100 }, size: { w: 50, h: 50 } }
    };
    const bboxLayers = {
        l: { id: 'l', parentId: 'p', position: { x: -40, y: 30 }, size: { w: 80, h: 80 } }
    };
    const bb = HierarchyUtils.getChildrenBBox('p', bboxNodes, bboxLayers);
    assert.deepEqual(bb, { minX: -40, minY: 20, maxX: 250, maxY: 150 });
    assert.equal(HierarchyUtils.getChildrenBBox('a', bboxNodes, bboxLayers), null);
});

test('getBoundaryLinks: связи через границу контекста, сам контекст-узел не внутри', () => {
    const bNodes = {
        box: { id: 'box', parentId: 'root', position: { x: 0, y: 0 } },
        inner: { id: 'inner', parentId: 'box', position: { x: 10, y: 10 } },
        deep: { id: 'deep', parentId: 'inner', position: { x: 5, y: 5 } },
        outer: { id: 'outer', parentId: 'root', position: { x: 500, y: 0 } }
    };
    const bPorts = {
        pInner: { id: 'pInner', nodeId: 'inner' },
        pDeep: { id: 'pDeep', nodeId: 'deep' },
        pOuter: { id: 'pOuter', nodeId: 'outer' },
        pBox: { id: 'pBox', nodeId: 'box' }
    };
    const bLinks = [
        { id: 'l1', sourcePortId: 'pInner', targetPortId: 'pOuter' },   // изнутри наружу
        { id: 'l2', sourcePortId: 'pOuter', targetPortId: 'pDeep' },    // снаружи вглубь (через уровень)
        { id: 'l3', sourcePortId: 'pInner', targetPortId: 'pDeep' },    // целиком внутри
        { id: 'l4', sourcePortId: 'pBox', targetPortId: 'pOuter' }      // порт самого контекста: граница, не внутренность
    ];
    const b = HierarchyUtils.getBoundaryLinks('box', bNodes, {}, bPorts, bLinks);
    assert.deepEqual(b.outgoing.map(i => i.link.id), ['l1']);
    assert.deepEqual(b.incoming.map(i => i.link.id), ['l2']);
    assert.equal(b.incoming[0].outerNodeId, 'outer');
    assert.equal(b.incoming[0].innerNodeId, 'deep');
});
