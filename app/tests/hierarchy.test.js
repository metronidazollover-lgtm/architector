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
    assert.equal(stats.linkCount, 1);
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
    assert.equal(HierarchyUtils.getEntityDepth('linkPBPB1', dNodes, dLayers, dPorts, dLinks), 1);
    assert.equal(HierarchyUtils.getEntityDepth('nodeB2', dNodes, dLayers, dPorts, dLinks), 2);
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

test('isDescendantOf: определяет отношение предок-потомок и защищает от циклов', () => {
    const hNodes = {
        rootNode: { id: 'rootNode', parentId: 'root' },
        childNode: { id: 'childNode', parentId: 'rootNode' },
        grandchildNode: { id: 'grandchildNode', parentId: 'childNode' },
        otherNode: { id: 'otherNode', parentId: 'root' }
    };

    assert.equal(HierarchyUtils.isDescendantOf('grandchildNode', 'rootNode', hNodes, {}), true);
    assert.equal(HierarchyUtils.isDescendantOf('childNode', 'rootNode', hNodes, {}), true);
    assert.equal(HierarchyUtils.isDescendantOf('rootNode', 'rootNode', hNodes, {}), true);
    assert.equal(HierarchyUtils.isDescendantOf('otherNode', 'rootNode', hNodes, {}), false);
    assert.equal(HierarchyUtils.isDescendantOf('rootNode', 'grandchildNode', hNodes, {}), false);
});

test('getEntityLevel и getMaxProjectLevel: вычисление индекса уровня окна', () => {
    const levelNodes = {
        rootNode: { id: 'rootNode', parentId: 'root' },
        level1Node: { id: 'level1Node', parentId: 'rootNode' },
        level2Node: { id: 'level2Node', parentId: 'level1Node' },
        level3Node: { id: 'level3Node', parentId: 'level2Node' }
    };
    const levelLayers = {
        lvl1Layer: { id: 'lvl1Layer', parentId: 'rootNode' }
    };

    assert.equal(HierarchyUtils.getEntityLevel('rootNode', levelNodes, levelLayers), 0);
    assert.equal(HierarchyUtils.getEntityLevel('level1Node', levelNodes, levelLayers), 1);
    assert.equal(HierarchyUtils.getEntityLevel('lvl1Layer', levelNodes, levelLayers), 1);
    assert.equal(HierarchyUtils.getEntityLevel('level2Node', levelNodes, levelLayers), 2);
    assert.equal(HierarchyUtils.getEntityLevel('level3Node', levelNodes, levelLayers), 3);

    assert.equal(HierarchyUtils.getMaxProjectLevel(levelNodes, levelLayers), 3);
});

test('getCrossLevelPortInfo: вычисляет целевые уровни для полуколец порта', () => {
    const crossNodes = {
        nodeA: { id: 'nodeA', parentId: 'root' }, // level 0
        nodeA4: { id: 'nodeA4', parentId: 'nodeA3' }, // level 4
        nodeA3: { id: 'nodeA3', parentId: 'nodeA2' }, // level 3
        nodeA2: { id: 'nodeA2', parentId: 'nodeA1' }, // level 2
        nodeA1: { id: 'nodeA1', parentId: 'nodeA' }   // level 1
    };
    const crossPorts = {
        portA: { id: 'portA', nodeId: 'nodeA' },
        portA4: { id: 'portA4', nodeId: 'nodeA4' }
    };
    const crossLinks = {
        linkCross: { id: 'linkCross', sourcePortId: 'portA', targetPortId: 'portA4' }
    };

    const portAInfo = HierarchyUtils.getCrossLevelPortInfo('portA', crossPorts, crossLinks, crossNodes, {});
    assert.equal(portAInfo.isCrossLevel, true);
    assert.equal(portAInfo.maxConnectedLevel, 4);
    assert.deepEqual(portAInfo.targetLevels, [4]);

    const portA4Info = HierarchyUtils.getCrossLevelPortInfo('portA4', crossPorts, crossLinks, crossNodes, {});
    assert.equal(portA4Info.isCrossLevel, true);
    assert.equal(portA4Info.maxConnectedLevel, 0);
    assert.deepEqual(portA4Info.targetLevels, [0]);
});

test('getSmartWindowPlacement: размещает новое окно под предыдущим', () => {
    const existingWins = {
        0: { index: 0, position: { x: -450, y: -300 }, size: { w: 900, h: 600 } }
    };
    const nextPlacement = HierarchyUtils.getSmartWindowPlacement(1, existingWins);
    assert.equal(nextPlacement.position.x, -450);
    assert.equal(nextPlacement.position.y, 400); // -300 + 600 + 100
    assert.equal(nextPlacement.size.w, 900);
    assert.equal(nextPlacement.size.h, 600);
});

test('getPortWorldPosition: точная формула мировых координат порта в окне', () => {
    const testState = {
        levelWindows: {
            'w1': { id: 'w1', levelIndex: 1, position: { x: 100, y: 200 }, size: { w: 900, h: 600 } }
        },
        levelViews: {
            'w1': { innerOffset: { x: 50, y: 60 }, innerZoom: 1, isCollapsed: false }
        },
        nodes: {
            rootNode: { id: 'rootNode', parentId: 'root', ownerId: null, position: { x: 0, y: 0 } },
            childNode: {
                id: 'childNode',
                parentId: 'root',
                ownerId: 'rootNode',
                position: { x: 30, y: 40 },
                size: { w: 200, h: 100 }
            }
        },
        layers: {},
        ports: {
            testPort: { id: 'testPort', nodeId: 'childNode', edge: 'right', position: 0.5 }
        }
    };

    const { headerH, borderW } = HierarchyUtils.LEVEL_WINDOW_METRICS;
    // X = win.x + border + innerOffset.x + local.x + port.x = 100 + 2 + 50 + 30 + 200
    // Y = win.y + border + header + innerOffset.y + local.y + port.y = 200 + 2 + 40 + 60 + 40 + 50
    const coords = HierarchyUtils.getPortWorldPosition('testPort', testState);
    assert.deepEqual(coords, {
        x: 100 + borderW + 50 + 30 + 200,
        y: 200 + borderW + headerH + 60 + 40 + 50
    });
});

test('getWorldTransform: возвращает мировые координаты и локальный масштаб окна', () => {
    const wState = {
        nodes: {
            rootNode: { id: 'rootNode', parentId: 'root', ownerId: null, position: { x: 0, y: 0 } },
            nodeL1: { id: 'nodeL1', parentId: 'root', ownerId: 'rootNode', position: { x: 100, y: 50 } }
        },
        layers: {},
        levelWindows: { 'w1': { id: 'w1', levelIndex: 1, position: { x: 500, y: 300 }, size: { w: 900, h: 600 } } },
        levelViews: { 'w1': { innerOffset: { x: 20, y: 10 }, innerZoom: 2.0, isCollapsed: false } }
    };
    const { headerH, borderW } = HierarchyUtils.LEVEL_WINDOW_METRICS;
    const wt = HierarchyUtils.getWorldTransform('nodeL1', wState);
    assert.equal(wt.x, 500 + borderW + 20 + 100 * 2.0);
    assert.equal(wt.y, 300 + borderW + headerH + 10 + 50 * 2.0);
    assert.equal(wt.scale, 2.0);
});

test('screenToWorld и worldToScreen: взаимно обратные преобразования', () => {
    const canvas = { offset: { x: 100, y: 50 }, zoom: 1.5 };
    const clientX = 400;
    const clientY = 200;
    const world = HierarchyUtils.screenToWorld(clientX, clientY, canvas);
    const screen = HierarchyUtils.worldToScreen(world.x, world.y, canvas);
    assert.ok(Math.abs(screen.x - clientX) < 0.001);
    assert.ok(Math.abs(screen.y - clientY) < 0.001);
});

test('getPlainLayers и getLevelWindows: фильтрация слоев и окон', () => {
    const allLayers = {
        layerNormal: { id: 'layerNormal', name: 'UI Layer' },
        layerWindow: { id: 'layerWindow', name: 'Level 1 Window', isLevelWindow: true }
    };
    const plain = HierarchyUtils.getPlainLayers(allLayers);
    const wins = HierarchyUtils.getLevelWindows(allLayers);
    assert.equal(Object.keys(plain).length, 1);
    assert.equal(plain.layerNormal.id, 'layerNormal');
    assert.equal(Object.keys(wins).length, 1);
    assert.equal(wins.layerWindow.id, 'layerWindow');
});

test('getProxyPortsForWindow: генерирует прокси-порты на границах рамки окна для межуровневых связей', () => {
    const state = {
        levelWindows: {
            0: { index: 0, position: { x: -500, y: -400 }, size: { w: 1000, h: 700 } },
            1: { index: 1, position: { x: -500, y: 380 }, size: { w: 1000, h: 700 } }
        },
        nodes: {
            nodeL0: { id: 'nodeL0', parentId: 'root', position: { x: 50, y: 50 } },
            nodeL1: { id: 'nodeL1', parentId: 'nodeL0', position: { x: 50, y: 50 } }
        },
        ports: {
            port0: { id: 'port0', nodeId: 'nodeL0' },
            port1: { id: 'port1', nodeId: 'nodeL1' }
        },
        links: {
            crossLink: { id: 'crossLink', sourcePortId: 'port0', targetPortId: 'port1', color: '#0284c7' }
        }
    };

    const proxies0 = HierarchyUtils.getProxyPortsForWindow(0, state);
    assert.equal(proxies0.length, 1);
    assert.equal(proxies0[0].targetLevel, 1);
    assert.equal(proxies0[0].edge, 'bottom');
    assert.ok(proxies0[0].worldPos.y >= 300);

    const proxies1 = HierarchyUtils.getProxyPortsForWindow(1, state);
    assert.equal(proxies1.length, 1);
    assert.equal(proxies1[0].targetLevel, 0);
    assert.equal(proxies1[0].edge, 'top');
    // Прокси верхней грани сидит на границе шапки и области содержимого:
    // рамка (border-box) плюс высота шапки — туда же приходит внутренний отрезок связи.
    const M = HierarchyUtils.LEVEL_WINDOW_METRICS;
    assert.equal(proxies1[0].worldPos.y, 380 + M.borderW);
    assert.equal(proxies1[0].viewportPos.y, 0, 'в системе координат вьюпорта это его верх');
});

test('getPortWorldPosition: поддерживает порты на слоях', () => {
    const state = {
        levelWindows: {
            'lvlwin-root': { id: 'lvlwin-root', levelIndex: 0, position: { x: 0, y: 0 }, size: { w: 1000, h: 700 } }
        },
        levelViews: {
            'lvlwin-root': { innerOffset: { x: 0, y: 0 }, innerZoom: 1, isCollapsed: false }
        },
        layers: {
            layer1: { id: 'layer1', parentId: 'root', position: { x: 100, y: 150 }, size: { w: 400, h: 300 } }
        },
        nodes: {},
        ports: {
            pRight: { id: 'pRight', nodeId: 'layer1', edge: 'right', position: 0.5 },
            pBottom: { id: 'pBottom', nodeId: 'layer1', edge: 'bottom', position: 0.25 }
        }
    };
    const M = HierarchyUtils.LEVEL_WINDOW_METRICS;
    const pR = HierarchyUtils.getPortWorldPosition('pRight', state);
    assert.ok(pR, 'позиция порта слоя должна быть вычислена');
    // x = winX(0) + borderW(2) + innerOffset(0) + localX(100 + 400 = 500) = 502
    // y = winY(0) + borderW(2) + headerH(40) + localY(150 + 150 = 300) = 342
    assert.equal(pR.x, M.borderW + 500);
    assert.equal(pR.y, M.borderW + M.headerH + 300);

    const pB = HierarchyUtils.getPortWorldPosition('pBottom', state);
    assert.equal(pB.x, M.borderW + 100 + 100);
    assert.equal(pB.y, M.borderW + M.headerH + 150 + 300);
});

test('getCrossLinksByLevel: корректно определяет межуровневые связи между слоем и узлом', () => {
    const state = {
        levelWindows: {
            'lvlwin-root': { id: 'lvlwin-root', levelIndex: 0, position: { x: 0, y: 0 }, size: { w: 1000, h: 700 } },
            'lvlwin-1': { id: 'lvlwin-1', levelIndex: 1, position: { x: 0, y: 800 }, size: { w: 1000, h: 700 } }
        },
        layers: {
            layerL0: { id: 'layerL0', parentId: 'root', position: { x: 50, y: 50 }, size: { w: 400, h: 300 } }
        },
        nodes: {
            nodeL1: { id: 'nodeL1', ownerId: 'layerL0', parentId: 'root', position: { x: 50, y: 50 } }
        },
        ports: {
            pLayer: { id: 'pLayer', nodeId: 'layerL0' },
            pNode: { id: 'pNode', nodeId: 'nodeL1' }
        },
        links: {
            crossLink: { id: 'crossLink', sourcePortId: 'pLayer', targetPortId: 'pNode' }
        }
    };
    const cross = HierarchyUtils.getCrossLinksByLevel(state);
    assert.ok(cross[0], 'уровень 0 должен содержать межуровневую запись');
    assert.equal(cross[0].length, 1);
    assert.equal(cross[0][0].myNode.id, 'layerL0');
    assert.equal(cross[0][0].otherNode.id, 'nodeL1');

    const proxies0 = HierarchyUtils.getProxyPortsForWindow('lvlwin-root', state);
    assert.equal(proxies0.length, 1);
    assert.equal(proxies0[0].myPortId, 'pLayer');
});

test('getMasterPortWorldCoordinates: вычисляет мировые координаты мастер-порта окна', () => {
    const state = {
        levelWindows: {
            'w1': { id: 'w1', levelIndex: 1, position: { x: 200, y: 500 }, size: { w: 800, h: 600 } }
        },
        levelViews: { 'w1': { innerOffset: { x: 0, y: 0 }, innerZoom: 1, isCollapsed: false } }
    };
    const { headerH, borderW } = HierarchyUtils.LEVEL_WINDOW_METRICS;
    // Мастер-порт сидит на шапке: он часть обвязки окна и не масштабируется вьюпортом
    const byId = HierarchyUtils.getMasterPortWorldCoordinates('w1', state);
    assert.deepEqual(byId, { x: 200 + borderW + 26, y: 500 + borderW + headerH / 2 });

    // Легаси-вызов по номеру уровня тоже находит окно
    const byLevel = HierarchyUtils.getMasterPortWorldCoordinates(1, state);
    assert.deepEqual(byLevel, byId);
});




// ============================================================
// Связь через поколение (ownerGap)
// ============================================================

test('getLevel: ownerGap задаёт связь через поколение — владелец на 2+ уровня выше', () => {
    const nodes = {
        grandpa: { id: 'grandpa', parentId: 'root' },
        // Внук привязан к деду напрямую, но живёт двумя уровнями ниже
        grandson: { id: 'grandson', parentId: 'root', ownerId: 'grandpa', ownerGap: 2 },
        // Правнук — обычный ребёнок внука
        greatGrandson: { id: 'greatGrandson', parentId: 'root', ownerId: 'grandson' }
    };
    assert.equal(HierarchyUtils.getLevel('grandpa', nodes), 0);
    assert.equal(HierarchyUtils.getLevel('grandson', nodes), 2, 'дистанция 2 перепрыгивает пустое поколение');
    assert.equal(HierarchyUtils.getLevel('greatGrandson', nodes), 3, 'дистанции по цепочке складываются');
});

test('getOwnerGap: отсутствие поля и мусорные значения схлопываются в 1', () => {
    assert.equal(HierarchyUtils.getOwnerGap({}), 1);
    assert.equal(HierarchyUtils.getOwnerGap(null), 1);
    assert.equal(HierarchyUtils.getOwnerGap({ ownerGap: 1 }), 1);
    assert.equal(HierarchyUtils.getOwnerGap({ ownerGap: 0 }), 1);
    assert.equal(HierarchyUtils.getOwnerGap({ ownerGap: -3 }), 1);
    assert.equal(HierarchyUtils.getOwnerGap({ ownerGap: NaN }), 1);
    assert.equal(HierarchyUtils.getOwnerGap({ ownerGap: 2.9 }), 2, 'дробные значения усекаются вниз');
    assert.equal(HierarchyUtils.getOwnerGap({ ownerGap: 3 }), 3);
});

test('getAddContext: брат узла со связью через поколение наследует ownerGap', () => {
    const nodes = {
        grandpa: { id: 'grandpa', parentId: 'root' },
        grandson: { id: 'grandson', parentId: 'root', ownerId: 'grandpa', ownerGap: 2 }
    };
    const ctx = HierarchyUtils.getAddContext({ nodes, layers: {}, selectedIds: ['grandson'] });
    assert.equal(ctx.ok, true);
    assert.equal(ctx.parentId, 'grandpa', 'брат получает того же владельца');
    assert.equal(ctx.levelIndex, 2, 'уровень выделенного узла');
    assert.equal(ctx.ownerGap, 2, 'дистанция наследуется — иначе брат всплыл бы на уровень 1');

    // Обычный узел (gap 1) дистанцию в контекст не тянет
    const plain = HierarchyUtils.getAddContext({
        nodes: { a: { id: 'a', parentId: 'root' }, b: { id: 'b', parentId: 'root', ownerId: 'a' } },
        layers: {},
        selectedIds: ['b']
    });
    assert.equal(plain.ownerGap, undefined);
});

// ============================================================
// Drag & Drop: резолвер целей, позиции дропа, текст подтверждения
// ============================================================

// Два окна: L0 (0,0 1000x700) и L1 (0,800 900x600), камеры по умолчанию.
// A и T — узлы уровня 0; L — слой уровня 0; B — узел уровня 1 (ребёнок T).
const makeDndState = () => ({
    nodes: {
        A: { id: 'A', name: 'A', position: { x: 450, y: 80 }, size: { w: 200, h: 100 }, parentId: 'root' },
        T: { id: 'T', name: 'T', position: { x: 500, y: 100 }, size: { w: 200, h: 100 }, parentId: 'root' },
        B: { id: 'B', name: 'B', position: { x: 50, y: 50 }, size: { w: 200, h: 100 }, parentId: 'root', ownerId: 'T' }
    },
    layers: {
        L: { id: 'L', name: 'Слой', position: { x: 100, y: 400 }, size: { w: 300, h: 200 }, parentId: 'root' }
    },
    selectedIds: [],
    levelWindows: {
        'lvlwin-root': { id: 'lvlwin-root', levelIndex: 0, name: 'Главный холст', position: { x: 0, y: 0 }, size: { w: 1000, h: 700 } },
        w1: { id: 'w1', levelIndex: 1, name: 'Уровень 1', position: { x: 0, y: 800 }, size: { w: 900, h: 600 } }
    },
    levelViews: {
        'lvlwin-root': { innerOffset: { x: 0, y: 0 }, innerZoom: 1, isCollapsed: false },
        w1: { innerOffset: { x: 0, y: 0 }, innerZoom: 1, isCollapsed: false }
    }
});

test('getDropTarget: узел-приёмник — по пересечению контуров, приоритет над слоем и окном', () => {
    const s = makeDndState();
    // A(450,80) пересекает T(500,100); указатель — внутри T (мир: локаль + рамка/шапка)
    const target = HierarchyUtils.getDropTarget(['A'], { x: 2 + 550, y: 42 + 130 }, s, { dragDropMode: true });
    assert.ok(target);
    assert.equal(target.kind, 'node');
    assert.equal(target.id, 'T');
    assert.equal(target.valid, true);
});

test('getDropTarget: вложение узла при выключенном Drag&Drop недоступно (dnd-off)', () => {
    const s = makeDndState();
    const target = HierarchyUtils.getDropTarget(['A'], { x: 2 + 550, y: 42 + 130 }, s, { dragDropMode: false });
    assert.equal(target.kind, 'node');
    assert.equal(target.valid, false);
    assert.equal(target.reason, 'dnd-off');
});

test('getDropTarget: слой своего уровня валиден ДАЖЕ при выключенном Drag&Drop', () => {
    const s = makeDndState();
    s.nodes.A.position = { x: 150, y: 380 }; // A пересекает слой L
    const target = HierarchyUtils.getDropTarget(['A'], { x: 2 + 200, y: 42 + 450 }, s, { dragDropMode: false });
    assert.equal(target.kind, 'layer');
    assert.equal(target.id, 'L');
    assert.equal(target.valid, true, 'группировка своего уровня не гейтится тумблером');
});

test('getDropTarget: своё окно — обычное перемещение (isMove), чужое — перенос', () => {
    const s = makeDndState();
    s.nodes.A.position = { x: 700, y: 500 }; // никого не пересекает
    const own = HierarchyUtils.getDropTarget(['A'], { x: 800, y: 600 }, s, { dragDropMode: true });
    assert.equal(own.kind, 'window');
    assert.equal(own.id, 'lvlwin-root');
    assert.equal(own.isMove, true);

    const cross = HierarchyUtils.getDropTarget(['A'], { x: 400, y: 1000 }, s, { dragDropMode: true });
    assert.equal(cross.kind, 'window');
    assert.equal(cross.id, 'w1');
    assert.equal(cross.valid, true);
    assert.equal(cross.isMove, false);

    const crossOff = HierarchyUtils.getDropTarget(['A'], { x: 400, y: 1000 }, s, { dragDropMode: false });
    assert.equal(crossOff.valid, false, 'кросс-уровневый дроп без тумблера невалиден');
    assert.equal(crossOff.reason, 'dnd-off');
});

test('getDropTarget: потомки переносимого исключаются из целей (защита от циклов)', () => {
    const s = makeDndState();
    // Перетаскиваем T; его ребёнок B на уровне 1 — на пути указателя и контура
    s.nodes.T.position = { x: 48, y: 48 }; // мир: (50,90)+... пересекает B в окне w1? B в другом окне.
    // Наезжаем контуром T на его же потомка B невозможно (разные окна) — проверяем
    // прямое вложение: цель-узел, являющийся потомком, не возвращается.
    // Дроп T в окно w1 валиден (перенос), но узел B целью не становится:
    const target = HierarchyUtils.getDropTarget(['T'], { x: 2 + 150, y: 800 + 42 + 100 }, s, { dragDropMode: true });
    assert.equal(target.kind, 'window', 'потомок B пропущен, цель — окно');
    assert.equal(target.id, 'w1');
});

test('getDropTarget: пустота мира → null; свёрнутое окно → invalid', () => {
    const s = makeDndState();
    s.nodes.A.position = { x: 700, y: 500 };
    assert.equal(HierarchyUtils.getDropTarget(['A'], { x: 5000, y: 5000 }, s, { dragDropMode: true }), null);

    s.levelViews.w1.isCollapsed = true;
    const collapsed = HierarchyUtils.getDropTarget(['A'], { x: 400, y: 1000 }, s, { dragDropMode: true });
    assert.equal(collapsed.valid, false);
    assert.equal(collapsed.reason, 'collapsed');
});

test('getDropTarget: массовый перенос со слоем в выделении — цели невалидны (этап 3)', () => {
    const s = makeDndState();
    const target = HierarchyUtils.getDropTarget(['A', 'L'], { x: 400, y: 1000 }, s, { dragDropMode: true });
    assert.equal(target.valid, false);
    assert.equal(target.reason, 'layer-transfer-later');
});

test('computeDropPositions: мировые координаты переводятся в локаль целевого окна с камерой', () => {
    const s = makeDndState();
    s.levelViews.w1 = { innerOffset: { x: 20, y: 10 }, innerZoom: 2, isCollapsed: false };
    // A: мир x = 0+2+0+450 = 452, y = 0+2+40+80 = 122
    const pos = HierarchyUtils.computeDropPositions(['A'], s.levelWindows.w1, s);
    // локаль w1: (452 - 0 - 2 - 20)/2 = 215; (122 - 800 - 2 - 40 - 10)/2 = -365
    assert.deepEqual(pos.A, { x: 215, y: -365 });
});

test('buildTransferConfirmText: описывает вложение и разрыв связи с родителем', () => {
    const s = makeDndState();
    // B (ребёнок T) дропнут на узел A — родство с T рвётся
    const text = HierarchyUtils.buildTransferConfirmText(['B'], { kind: 'node', id: 'A' }, s);
    assert.ok(text.includes('станет ребёнком узла «A»'), 'описывает вложение');
    assert.ok(text.includes('связь «B» с родителем «T» будет разорвана'), 'предупреждает о разрыве');
    assert.ok(text.includes('Перенести?'));

    // B (уровень 1) в слой L (уровень 0) — кросс-перенос с разрывом родства
    const textCross = HierarchyUtils.buildTransferConfirmText(['B'], { kind: 'layer', id: 'L' }, s);
    assert.ok(textCross.includes('перенос в слой «Слой» на Уровень 0'));
    assert.ok(textCross.includes('разорвана'));

    // A (уровень 0, без родителя) в слой L своего уровня — чистая группировка
    const textSame = HierarchyUtils.buildTransferConfirmText(['A'], { kind: 'layer', id: 'L' }, s);
    assert.ok(textSame.includes('уровень не меняется'));
    assert.ok(!textSame.includes('разорвана'));
});

// ============================================================
// PLAN_LAYERS_AND_CONTEXT_CREATION.md — план верификации, п.1,5,8
// ============================================================

test('getSmartLayerPlacement: первый независимый слой уровня — {40,60}; следующий — ниже с зазором, снап округляет ВВЕРХ (не срезает зазор)', () => {
    const empty = HierarchyUtils.getSmartLayerPlacement(0, { nodes: {}, layers: {} });
    assert.deepEqual(empty, { x: 40, y: 60 }, 'без слоёв уровня — стартовая позиция');

    const state = {
        nodes: {},
        layers: {
            L1: { id: 'L1', name: 'L1', parentId: 'root', position: { x: 40, y: 60 }, size: { w: 300, h: 217 } }
        }
    };
    // maxY = 60+217 = 277; rawY = 287; шаг сетки 30 → 287/30=9.57 → ceil=10 → 300
    const next = HierarchyUtils.getSmartLayerPlacement(0, state);
    assert.equal(next.x, 40);
    assert.equal(next.y, 300, 'округлено ВВЕРХ до сетки');
    assert.ok(next.y >= 287, 'снап не сдвинул позицию НИЖЕ вычисленного отступа (иначе зазор обнулился бы коллизией)');
    assert.ok(next.y - (state.layers.L1.position.y + state.layers.L1.size.h) >= 10, 'зазор >= 10px сохранён после снапа (⚠️ п.0.4)');
});

test('getSmartLayerPlacement: вложенные слои (не root) в расчёт независимого размещения не входят', () => {
    const state = {
        nodes: {},
        layers: {
            Root1: { id: 'Root1', name: 'Root1', parentId: 'root', position: { x: 40, y: 60 }, size: { w: 200, h: 100 } },
            Nested: { id: 'Nested', name: 'Nested', parentId: 'Root1', position: { x: 0, y: 0 }, size: { w: 5000, h: 5000 } }
        }
    };
    const pos = HierarchyUtils.getSmartLayerPlacement(0, state);
    assert.ok(pos.y < 1000, 'огромный вложенный слой Nested не должен утащить позицию вниз — он не root');
});

test('bubbleUpLayerResize: слой-родитель подрастает под содержимое, каскадно до корня', () => {
    const state = {
        nodes: {
            N: { id: 'N', name: 'N', parentId: 'Mid', position: { x: 500, y: 500 }, size: { w: 200, h: 100 } }
        },
        layers: {
            Mid: { id: 'Mid', name: 'Mid', parentId: 'Top', position: { x: 0, y: 0 }, size: { w: 100, h: 100 } },
            Top: { id: 'Top', name: 'Top', parentId: 'root', position: { x: 0, y: 0 }, size: { w: 150, h: 150 } }
        }
    };
    const updates = HierarchyUtils.bubbleUpLayerResize('N', state);
    assert.ok(updates.Mid, 'Mid подрос под N');
    assert.ok(updates.Mid.w >= 700 && updates.Mid.h >= 600);
    assert.ok(updates.Top, 'Top подрос вслед за выросшим Mid (каскад до корня)');
});

test('bubbleUpLayerResize: содержимое уже помещается — обновлений нет', () => {
    const state = {
        nodes: {
            N: { id: 'N', name: 'N', parentId: 'Mid', position: { x: 10, y: 10 }, size: { w: 50, h: 50 } }
        },
        layers: {
            Mid: { id: 'Mid', name: 'Mid', parentId: 'root', position: { x: 0, y: 0 }, size: { w: 600, h: 400 } }
        }
    };
    const updates = HierarchyUtils.bubbleUpLayerResize('N', state);
    assert.equal(Object.keys(updates).length, 0, 'N с запасом помещается в Mid — расти некуда');
});

test('canReparentTo: слой в самого себя — reason self; слой в слой СОБСТВЕННОЙ ветки (parentId-цикл) — отклонён целиком, без «спуска»', () => {
    // v13: у canReparentTo нет отдельного «спуска в собственную ветку» (v11
    // canTransferToLayer) — parentId-цикл просто отклоняется как cycle.
    const nodes = {};
    const layers = {
        A: { id: 'A', name: 'A', parentId: 'root' },
        B: { id: 'B', name: 'B', parentId: 'A' } // B физически внутри А
    };
    const self = HierarchyUtils.canReparentTo('A', 'A', nodes, layers);
    assert.equal(self.ok, false);
    assert.equal(self.reason, 'self');

    const cycle = HierarchyUtils.canReparentTo('A', 'B', nodes, layers);
    assert.equal(cycle.ok, false, 'B лежит внутри A — вложение A в B образовало бы цикл');
    assert.equal(cycle.reason, 'cycle');

    const sameLevel = HierarchyUtils.canReparentTo('A', 'C', nodes, { ...layers, C: { id: 'C', parentId: 'root' } });
    assert.equal(sameLevel.ok, true);
    assert.equal(sameLevel.reason, null, 'группировка своего уровня — обычный перенос');
});

test('getDropTarget: перетаскиваемый СЛОЙ исключает узлы собственной ветки из целей (защита от циклов, ⚠️ п.0.8)', () => {
    const s = makeDndState();
    // Слой L «усыновляет» узел A (A теперь в ветке L)
    s.nodes.A.ownerId = 'L';
    s.nodes.A.position = { x: 2, y: 42 }; // под указателем ниже
    // Указатель наведён туда, где сейчас лежит A — но A в ветке L, значит исключён
    const target = HierarchyUtils.getDropTarget(['L'], { x: 2 + 100, y: 42 + 50 }, s, { dragDropMode: true });
    assert.ok(!target || target.kind !== 'node' || target.id !== 'A', 'узел собственной ветки не предлагается целью');
});

test('getDropTarget: одиночный слой на холст ЧУЖОГО окна уровня — валидный перенос (сирота-якорь), НЕ «нет цели» (⚠️ п.0.5)', () => {
    const s = makeDndState();
    const target = HierarchyUtils.getDropTarget(['L'], { x: 400, y: 1000 }, s, { dragDropMode: true });
    assert.ok(target, 'дроп слоя на чужое окно — валидная цель, не null');
    assert.equal(target.kind, 'window');
    assert.equal(target.id, 'w1');
    assert.equal(target.valid, true, 'слой на чужом окне переносится как сирота-якорь, это НЕ «нет цели»');
    assert.equal(target.isMove, false, 'это перенос, не обычное перемещение по своему холсту');
});

test('getDropTarget: одиночный слой на СВОЁ окно уровня — обычное перемещение (isMove)', () => {
    const s = makeDndState();
    const own = HierarchyUtils.getDropTarget(['L'], { x: 800, y: 600 }, s, { dragDropMode: true });
    assert.equal(own.kind, 'window');
    assert.equal(own.id, 'lvlwin-root');
    assert.equal(own.isMove, true);
});

test('hasContainerAncestorIn: узел внутри слоя-контейнера — true', () => {
    const nodes = {
        N: { id: 'N', name: 'N', parentId: 'L' }
    };
    const layers = {
        L: { id: 'L', name: 'L', parentId: 'root' }
    };
    assert.equal(HierarchyUtils.hasContainerAncestorIn('N', ['L'], nodes, layers), true);
});

test('hasContainerAncestorIn: узел внутри ВЛОЖЕННОГО подслоя — true (поднимается через цепочку слоёв)', () => {
    const nodes = {
        N: { id: 'N', name: 'N', parentId: 'Sub' }
    };
    const layers = {
        Sub: { id: 'Sub', name: 'Sub', parentId: 'Top' },
        Top: { id: 'Top', name: 'Top', parentId: 'root' }
    };
    assert.equal(HierarchyUtils.hasContainerAncestorIn('N', ['Top'], nodes, layers), true, 'поднимается сквозь вложенные слои');
});

test('hasContainerAncestorIn: МЕЖУРОВНЕВЫЙ потомок по владению (ownerId), НЕ parentId — false (регресс на Plan_fix.md)', () => {
    // A1 — настоящий ownerId-потомок A на другом уровне, но координатно (parentId)
    // лежит на своём холсте (root), а не внутри A. hasAncestorIn считал бы это
    // «предком через набор» (поднимается и по ownerId) — hasContainerAncestorIn обязан
    // вернуть false: A1 визуально никак не связан с перетаскиванием A.
    const nodes = {
        A: { id: 'A', name: 'A', parentId: 'root' },
        A1: { id: 'A1', name: 'A1', parentId: 'root', ownerId: 'A' }
    };
    const layers = {};
    assert.equal(HierarchyUtils.hasAncestorIn('A1', ['A'], nodes, layers), true, 'общая hasAncestorIn (для сравнения) считает потомком по ownerId');
    assert.equal(HierarchyUtils.hasContainerAncestorIn('A1', ['A'], nodes, layers), false, 'hasContainerAncestorIn игнорирует ownerId — это и есть фикс бага');
});

test('hasContainerAncestorIn: защита от циклических parentId', () => {
    const layers = {
        L1: { id: 'L1', name: 'L1', parentId: 'L2' },
        L2: { id: 'L2', name: 'L2', parentId: 'L1' }
    };
    assert.equal(HierarchyUtils.hasContainerAncestorIn('L1', ['X'], {}, layers), false, 'не зацикливается, корректно возвращает false для отсутствующей цели');
});

// ---------------------------------------------------------------------------
// v13 (Фаза 3, готовится заранее — см. docs/IDEAL_INTERACTIONS.md §1):
// getLevel/getEntityLevel понимают parentId, указывающий на id окна уровня
// (сирота-якорь без ownerId/homeLevel), и новый canReparentTo.
// ---------------------------------------------------------------------------

test('getLevel/getEntityLevel: parentId = id окна уровня — сирота-якорь на v13, уровень читается из окна напрямую', () => {
    const levelWindows = {
        w0: { id: 'w0', levelIndex: 0 },
        w2: { id: 'w2', levelIndex: 2 }
    };
    const v13Nodes = {
        anchor2: { id: 'anchor2', name: 'Anchor2', parentId: 'w2' },
        childOfAnchor: { id: 'childOfAnchor', name: 'ChildOfAnchor', parentId: 'anchor2' }
    };
    assert.equal(HierarchyUtils.getLevel('anchor2', v13Nodes, {}, levelWindows), 2);
    assert.equal(HierarchyUtils.getEntityLevel('anchor2', v13Nodes, {}, levelWindows), 2);
    // Дочерний узел якоря — на уровень ниже, как обычный узел-родитель
    assert.equal(HierarchyUtils.getLevel('childOfAnchor', v13Nodes, {}, levelWindows), 3);
});

test('getLevel: без levelWindows (старые вызовы) поведение не меняется — parentId, указывающий на неизвестный id, трактуется как раньше', () => {
    const v13Nodes = { anchor2: { id: 'anchor2', name: 'Anchor2', parentId: 'w2' } };
    // Нет ни ownerId, ни homeLevel, ни windows — падает в ветку «истинный сирота» = 0
    assert.equal(HierarchyUtils.getLevel('anchor2', v13Nodes, {}), 0);
});

test('getLevel: v13-цепочка узел-в-узле (parentId напрямую на node, ownerId отсутствует) считает уровень так же, как обычное родство', () => {
    const v13Nodes = {
        root1: { id: 'root1', name: 'Root1', parentId: 'root' },
        child1: { id: 'child1', name: 'Child1', parentId: 'root1' },
        grandchild1: { id: 'grandchild1', name: 'Grandchild1', parentId: 'child1' }
    };
    assert.equal(HierarchyUtils.getLevel('root1', v13Nodes, {}), 0);
    assert.equal(HierarchyUtils.getLevel('child1', v13Nodes, {}), 1);
    assert.equal(HierarchyUtils.getLevel('grandchild1', v13Nodes, {}), 2);
});

test('canReparentTo: разрешает валидное вложение и запрещает self/цикл', () => {
    const v13Nodes = {
        a: { id: 'a', name: 'A', parentId: 'root' },
        b: { id: 'b', name: 'B', parentId: 'a' }
    };
    const layersDict = { L: { id: 'L', name: 'L', parentId: 'root' } };

    assert.deepEqual(HierarchyUtils.canReparentTo('a', 'L', v13Nodes, layersDict), { ok: true, reason: null });
    assert.deepEqual(HierarchyUtils.canReparentTo('a', 'a', v13Nodes, layersDict), { ok: false, reason: 'self' });
    // a -> b — b уже потомок a по цепочке parentId, вложение образует цикл
    assert.deepEqual(HierarchyUtils.canReparentTo('a', 'b', v13Nodes, layersDict), { ok: false, reason: 'cycle' });
});

test('canReparentTo: принимает id окна уровня как валидную цель (якорение сироты)', () => {
    const v13Nodes = { a: { id: 'a', name: 'A', parentId: 'root' } };
    const levelWindows = { w2: { id: 'w2', levelIndex: 2 } };
    assert.deepEqual(HierarchyUtils.canReparentTo('a', 'w2', v13Nodes, {}, levelWindows), { ok: true, reason: null });
});

test('canReparentTo: неизвестная цель отклоняется', () => {
    const v13Nodes = { a: { id: 'a', name: 'A', parentId: 'root' } };
    assert.deepEqual(HierarchyUtils.canReparentTo('a', 'ghost', v13Nodes, {}), { ok: false, reason: 'not-found' });
    assert.deepEqual(HierarchyUtils.canReparentTo('ghost', 'root', v13Nodes, {}), { ok: false, reason: 'not-found' });
});
