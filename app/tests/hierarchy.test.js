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
const links = {
    inner: { id: 'inner', sourcePortId: 'pa', targetPortId: 'pb' },
    crossing: { id: 'crossing', sourcePortId: 'pa', targetPortId: 'po' }
};

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

test('getEntityDepth: точный глобальный уровень вложенности для всех сущностей', () => {
    const dNodes = {
        nodeA: { id: 'nodeA', parentId: 'root' },
        nodeB: { id: 'nodeB', parentId: 'root' },
        nodeB1: { id: 'nodeB1', parentId: 'nodeB' },
        nodeB2: { id: 'nodeB2', parentId: 'nodeB1' }
    };
    const dLayers = {
        layer1: { id: 'layer1', parentId: 'nodeB' }
    };
    const dPorts = {
        portPB: { id: 'portPB', nodeId: 'nodeB1' },
        portPB1: { id: 'portPB1', nodeId: 'nodeB1' }
    };
    const dLinks = {
        linkPBPB1: { id: 'linkPBPB1', context: 'nodeB' }
    };

    assert.equal(HierarchyUtils.getEntityDepth('nodeA', dNodes, dLayers, dPorts, dLinks), 0);
    assert.equal(HierarchyUtils.getEntityDepth('nodeB', dNodes, dLayers, dPorts, dLinks), 0);
    assert.equal(HierarchyUtils.getEntityDepth('nodeB1', dNodes, dLayers, dPorts, dLinks), 1);
    assert.equal(HierarchyUtils.getEntityDepth('portPB', dNodes, dLayers, dPorts, dLinks), 1);
    assert.equal(HierarchyUtils.getEntityDepth('portPB1', dNodes, dLayers, dPorts, dLinks), 1);
    assert.equal(HierarchyUtils.getEntityDepth('linkPBPB1', dNodes, dLayers, dPorts, dLinks), 1); // Link inside nodeB (level 1)
    assert.equal(HierarchyUtils.getEntityDepth('nodeB2', dNodes, dLayers, dPorts, dLinks), 2); // Child inside nodeB1 (level 2)
});

test('Cross-level connection detection: глубокий узел B2 отслеживает связь с родителем B', () => {
    const projNodes = {
        nodeB: { id: 'nodeB', parentId: 'root' },
        nodeB1: { id: 'nodeB1', parentId: 'nodeB' },
        nodeB2: { id: 'nodeB2', parentId: 'nodeB1' }
    };
    const projPorts = {
        portB1: { id: 'portB1', nodeId: 'nodeB1' },
        portB_for_B1: { id: 'portB_for_B1', nodeId: 'nodeB' },
        portB2: { id: 'portB2', nodeId: 'nodeB2' },
        portB_for_B2: { id: 'portB_for_B2', nodeId: 'nodeB' }
    };
    const projLinks = {
        linkB2ToB: { id: 'linkB2ToB', sourcePortId: 'portB2', targetPortId: 'portB_for_B2' }
    };

    const selectedIds = ['nodeB'];
    const isConnectedToSelectedNode = (nodeId) => {
        return Object.values(projLinks).some(l => {
            if (!l) return false;
            const sPort = projPorts[l.sourcePortId];
            const tPort = projPorts[l.targetPortId];
            if (!sPort || !tPort) return false;
            if (selectedIds.includes(sPort.nodeId) && tPort.nodeId === nodeId) return true;
            if (selectedIds.includes(tPort.nodeId) && sPort.nodeId === nodeId) return true;
            return false;
        });
    };

    assert.equal(isConnectedToSelectedNode('nodeB2'), true);
});

test('getRelativeDepth: точно считает относительное расснояние до контекста', () => {
    const rNodes = {
        parent: { id: 'parent', parentId: 'root' },
        child: { id: 'child', parentId: 'parent' },
        grandchild: { id: 'grandchild', parentId: 'child' },
        other: { id: 'other', parentId: 'root' }
    };
    assert.equal(HierarchyUtils.getRelativeDepth('child', 'parent', rNodes), 1);
    assert.equal(HierarchyUtils.getRelativeDepth('grandchild', 'parent', rNodes), 2);
    assert.equal(HierarchyUtils.getRelativeDepth('parent', 'child', rNodes), -1);
    assert.equal(HierarchyUtils.getRelativeDepth('parent', 'parent', rNodes), 0);
    assert.equal(HierarchyUtils.getRelativeDepth('other', 'parent', rNodes), null);
});

test('getVisibilityState: корректно определяет роли и видимость для контекста и X-Ray', () => {
    const vNodes = {
        parent: { id: 'parent', parentId: 'root' },
        child: { id: 'child', parentId: 'parent' },
        grandchild: { id: 'grandchild', parentId: 'child' }
    };
    // Без X-Ray
    const vNormal = HierarchyUtils.getVisibilityState('grandchild', 'parent', 0, 0, vNodes, {}, {}, {});
    assert.equal(vNormal.visible, false);

    // С xRayDown = 1 (видно внуков)
    const vXRay = HierarchyUtils.getVisibilityState('grandchild', 'parent', 1, 0, vNodes, {}, {}, {});
    assert.equal(vXRay.visible, true);
    assert.equal(vXRay.role, 'xray-down');
});

test('Inter-level link visibility: отрисовка связи происходит ТОЛЬКО когда видны оба узла', () => {
    const nodes = {
        nLevel1: { id: 'nLevel1', parentId: 'root' },
        nLevel2: { id: 'nLevel2', parentId: 'nLevel1' },
        nLevel3: { id: 'nLevel3', parentId: 'nLevel2' }
    };
    const ports = {
        pLevel1: { id: 'pLevel1', nodeId: 'nLevel1' },
        pLevel3: { id: 'pLevel3', nodeId: 'nLevel3' }
    };
    const links = {
        crossLink: { id: 'crossLink', sourcePortId: 'pLevel1', targetPortId: 'pLevel3' }
    };

    // 1. В контексте nLevel1 без X-Ray: nLevel1 виден, nLevel3 скрыт -> обоим концам нельзя отрисовывать связь
    const vis1_normal = HierarchyUtils.getVisibilityState('nLevel1', 'nLevel1', 0, 0, nodes, {}, ports, links);
    const vis3_normal = HierarchyUtils.getVisibilityState('nLevel3', 'nLevel1', 0, 0, nodes, {}, ports, links);
    assert.equal(vis1_normal.visible, true);
    assert.equal(vis3_normal.visible, false);
    const bothVisible_normal = vis1_normal.visible && vis3_normal.visible;
    assert.equal(bothVisible_normal, false, 'Связь не должна отображаться, когда один из узлов скрыт');

    // 2. В контексте nLevel1 с xRayDown = 1 (видимость узлов до глубины 2 от контекста): nLevel1 и nLevel3 оба видны -> связь отображается
    const vis1_xray = HierarchyUtils.getVisibilityState('nLevel1', 'nLevel1', 1, 0, nodes, {}, ports, links);
    const vis3_xray = HierarchyUtils.getVisibilityState('nLevel3', 'nLevel1', 1, 0, nodes, {}, ports, links);
    assert.equal(vis1_xray.visible, true);
    assert.equal(vis3_xray.visible, true);
    const bothVisible_xray = vis1_xray.visible && vis3_xray.visible;
    assert.equal(bothVisible_xray, true, 'Связь отображается, когда оба уровня (и оба узла) видны на холсте');
});

test('Selective per-node X-Ray: просвечивание работает избирательно для конкретного узла', () => {
    const selNodes = {
        nodeA: { id: 'nodeA', parentId: 'root' },
        nodeA_child: { id: 'nodeA_child', parentId: 'nodeA' },
        nodeB: { id: 'nodeB', parentId: 'root' },
        nodeB_child: { id: 'nodeB_child', parentId: 'nodeB' }
    };

    // 1. Без X-Ray: потомки обоих узлов скрыты
    const vA_child_init = HierarchyUtils.getVisibilityState('nodeA_child', 'root', 0, 0, selNodes, {}, {}, {});
    const vB_child_init = HierarchyUtils.getVisibilityState('nodeB_child', 'root', 0, 0, selNodes, {}, {}, {});
    assert.equal(vA_child_init.visible, false);
    assert.equal(vB_child_init.visible, false);

    // 2. Включаем X-Ray ТОЛЬКО на nodeA
    const extras = { xRayNodes: { nodeA: { down: 1, up: 0 } } };
    const vA_child_sel = HierarchyUtils.getVisibilityState('nodeA_child', 'root', 0, 0, selNodes, {}, {}, {}, extras);
    const vB_child_sel = HierarchyUtils.getVisibilityState('nodeB_child', 'root', 0, 0, selNodes, {}, {}, {}, extras);

    assert.equal(vA_child_sel.visible, true, 'Потомок nodeA должен быть виден');
    assert.equal(vA_child_sel.role, 'xray-down');
    assert.equal(vB_child_sel.visible, false, 'Потомок nodeB должен оставаться скрытым');
});

test('Layer X-Ray visibility: вложенные слои становятся видимыми при включении X-Ray на родителе', () => {
    const nodes = {
        nodeParent: { id: 'nodeParent', parentId: 'root' }
    };
    const layers = {
        layerInner: { id: 'layerInner', parentId: 'nodeParent' }
    };

    // 1. Без X-Ray узел-родитель не просвечивается, слой скрыт
    const visInit = HierarchyUtils.getVisibilityState('layerInner', 'root', 0, 0, nodes, layers, {}, {});
    assert.equal(visInit.visible, false, 'Слой вложенного уровня скрыт без X-Ray');

    // 2. Включаем X-Ray на ноде (down: 1)
    const extras = { xRayNodes: { nodeParent: { down: 1, up: 0 } } };
    const visXRay = HierarchyUtils.getVisibilityState('layerInner', 'root', 0, 0, nodes, layers, {}, {}, extras);
    assert.equal(visXRay.visible, true, 'Вложенный слой отображается в режиме X-Ray');
    assert.equal(visXRay.role, 'xray-down');
});



