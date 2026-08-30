const { test } = require('node:test');
const assert = require('node:assert/strict');

const GeometryUtils = require('../utils/geometry.js');
global.GeometryUtils = GeometryUtils;

const HierarchyUtils = require('../utils/hierarchy.js');
global.HierarchyUtils = HierarchyUtils;

const { reducer, defaultState } = require('../store/reducer.js');

// Мини-проект: root -> nodeA (внутри nodeB, nodeC со связью), слой layerL с nodeD
const makeState = () => ({
    ...defaultState,
    canvas: { offset: { x: 100, y: 200 }, zoom: 0.8 },
    nodes: {
        nodeA: { id: 'nodeA', name: 'A', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' },
        nodeB: { id: 'nodeB', name: 'B', position: { x: 50, y: 300 }, size: { w: 200, h: 100 }, parentId: 'nodeA' },
        nodeC: { id: 'nodeC', name: 'C', position: { x: 400, y: 300 }, size: { w: 200, h: 100 }, parentId: 'nodeA' },
        nodeD: { id: 'nodeD', name: 'D', position: { x: 900, y: 50 }, size: { w: 200, h: 100 }, parentId: 'layerL' }
    },
    layers: {
        layerL: { id: 'layerL', name: 'L', position: { x: 800, y: 0 }, size: { w: 600, h: 400 }, parentId: 'root' }
    },
    ports: {
        portB: { id: 'portB', nodeId: 'nodeB', type: 'output', edge: 'right', position: 0.5 },
        portC: { id: 'portC', nodeId: 'nodeC', type: 'input', edge: 'left', position: 0.5 }
    },
    links: {
        linkBC: { id: 'linkBC', sourcePortId: 'portB', targetPortId: 'portC' }
    }
});



test('REMOVE_LAYER: дети переезжают в родительский контекст слоя', () => {
    const s0 = makeState();
    const s1 = reducer(s0, { type: 'REMOVE_LAYER', payload: 'layerL' });
    assert.equal(s1.layers.layerL, undefined);
    assert.equal(s1.nodes.nodeD.parentId, 'root');
});

test('DELETE_SELECTED: удаление узла удаляет его порты и связи', () => {
    const s0 = makeState();
    s0.selectedIds = ['nodeB'];
    const s1 = reducer(s0, { type: 'DELETE_SELECTED' });
    assert.equal(s1.nodes.nodeB, undefined);
    assert.equal(s1.ports.portB, undefined);
    assert.ok(s1.ports.portC);
    assert.equal(Object.keys(s1.links).length, 0);
});

test('UNDO/REDO: круговой откат структуры', () => {
    const s0 = makeState();
    const s1 = reducer(s0, { type: 'ADD_NODE', payload: { name: 'New', position: { x: 0, y: 0 }, size: { w: 200, h: 100 } } });
    assert.equal(Object.keys(s1.nodes).length, 5);
    const s2 = reducer(s1, { type: 'UNDO' });
    assert.equal(Object.keys(s2.nodes).length, 4);
    const s3 = reducer(s2, { type: 'REDO' });
    assert.equal(Object.keys(s3.nodes).length, 5);
});



test('Auto-sizing: empty/short text nodes and long text nodes aspect ratio', () => {
    let s = makeState();
    // 1. Empty/short text node size
    s = reducer(s, { type: 'ADD_NODE', payload: { id: 'test1', name: 'Short' } });
    const sizeShort = s.nodes.test1.size;
    assert.ok(sizeShort.w >= 200);
    assert.ok(sizeShort.h >= 53); // header 33px + padding 20px = 53px minimum

    // 2. Long text node size - should have larger dimensions
    s = reducer(s, { type: 'ADD_NODE', payload: { id: 'test2', name: 'Very Long Title', content: 'This is a very long paragraph that goes on and on. It contains lots of characters to make sure that the area calculations increase the dimensions of the node, sticking to a beautiful rectangular shape rather than becoming a thin vertical column.' } });
    const sizeLong = s.nodes.test2.size;
    assert.ok(sizeLong.w > sizeShort.w);
    assert.ok(sizeLong.h > sizeShort.h);
});

test('Auto-sizing: node with image and 10x boundaries', () => {
    let s = makeState();
    // 1. Adding node with image should expand it to fit image height and width >= 300
    s = reducer(s, { type: 'ADD_NODE', payload: { id: 'imgNode', name: 'Image Node', mediaUrl: 'http://example.com/pic.png', mediaHeight: 250 } });
    const sizeImg = s.nodes.imgNode.size;
    assert.ok(sizeImg.w >= 300);
    assert.ok(sizeImg.h >= 250 + 33 + 20); // image + header(33) + padding(20)

    // 2. Changing image height should automatically recalculate node size
    s = reducer(s, { type: 'UPDATE_NODE', payload: { id: 'imgNode', updates: { mediaHeight: 400 } } });
    const sizeImgUpdated = s.nodes.imgNode.size;
    assert.ok(sizeImgUpdated.h > sizeImg.h);

    // 3. A4 width boundaries (max width 794) and infinite height
    s = reducer(s, { type: 'ADD_NODE', payload: { 
        id: 'hugeNode', 
        name: 'Huge Node', 
        mediaUrl: 'http://example.com/huge.png', 
        mediaHeight: 2000,
        content: 'x'.repeat(5000)
    } });
    const sizeHuge = s.nodes.hugeNode.size;
    assert.equal(sizeHuge.w, 794);
    assert.ok(sizeHuge.h > 2000);
});

test('userResized: ручной ресайз не сбрасывается при изменении имени', () => {
    let s = makeState();
    // Создаём ноду
    s = reducer(s, { type: 'ADD_NODE', payload: { id: 'resNode', name: 'Test', content: 'Hello world' } });
    const autoSize = s.nodes.resNode.size;

    // Имитируем ручной ресайз (увеличение)
    s = reducer(s, { type: 'UPDATE_NODE', payload: { id: 'resNode', updates: { size: { w: 500, h: 400 }, userResized: true } } });
    assert.equal(s.nodes.resNode.size.w, 500);
    assert.equal(s.nodes.resNode.size.h, 400);
    assert.equal(s.nodes.resNode.userResized, true);

    // Изменяем имя — ручной размер НЕ должен сброситься (используется Math.max)
    s = reducer(s, { type: 'UPDATE_NODE', payload: { id: 'resNode', updates: { name: 'New Name' } } });
    assert.ok(s.nodes.resNode.size.w >= 500, `width should be >= 500, got ${s.nodes.resNode.size.w}`);
    assert.ok(s.nodes.resNode.size.h >= 400, `height should be >= 400, got ${s.nodes.resNode.size.h}`);
    assert.equal(s.nodes.resNode.userResized, true);
});

test('userResized: ручной ресайз сбрасывается при изменении content', () => {
    let s = makeState();
    // Создаём ноду и ресайзим
    s = reducer(s, { type: 'ADD_NODE', payload: { id: 'resNode2', name: 'Test', content: 'Short' } });
    s = reducer(s, { type: 'UPDATE_NODE', payload: { id: 'resNode2', updates: { size: { w: 500, h: 400 }, userResized: true } } });
    assert.equal(s.nodes.resNode2.userResized, true);

    // Изменяем content — userResized сбрасывается, размер пересчитывается
    s = reducer(s, { type: 'UPDATE_NODE', payload: { id: 'resNode2', updates: { content: 'New content' } } });
    assert.equal(s.nodes.resNode2.userResized, false);
    // Размер теперь авто, а не 500x400
    const autoSize = s.nodes.resNode2.size;
    assert.ok(autoSize.w < 500, `auto width should be < 500, got ${autoSize.w}`);
});

// === getSmartPlacement: fit-to-content и авторасстановка ===

test('getSmartPlacement: одна нода на пустом слое — позиция и fit-to-content', () => {
    const layer = { id: 'L1', size: { w: 600, h: 400 }, parentId: 'root' };
    const nodes = [{ id: 'n1', size: { w: 200, h: 100 } }];
    const allNodes = {};

    const { updatesById, newLayerSize } = GeometryUtils.getSmartPlacement(nodes, layer, allNodes);

    // Нода должна быть размещена с отступами
    assert.ok(updatesById.n1, 'n1 должна быть размещена');
    assert.equal(updatesById.n1.parentId, 'L1');
    assert.ok(updatesById.n1.position.x >= 20, 'x >= padding');
    assert.ok(updatesById.n1.position.y >= 90, 'y >= header offset (90)');

    // Слой fit-to-content: не больше нужного (нода 200+padding+x)
    assert.ok(newLayerSize.w >= 300, 'слой не уже минимума 300');
    assert.ok(newLayerSize.h >= 200, 'слой не ниже минимума 200');
    // Слой должен обтянуть ноду, а не оставаться 600x400
    assert.ok(newLayerSize.w <= 600, `слой не раздулся: ${newLayerSize.w}`);
});

test('getSmartPlacement: две ноды не перекрываются', () => {
    const layer = { id: 'L2', size: { w: 600, h: 400 }, parentId: 'root' };
    const nodes = [
        { id: 'n1', size: { w: 200, h: 100 } },
        { id: 'n2', size: { w: 200, h: 100 } }
    ];
    const allNodes = {};

    const { updatesById } = GeometryUtils.getSmartPlacement(nodes, layer, allNodes);

    const p1 = updatesById.n1.position;
    const p2 = updatesById.n2.position;
    const padding = 20;

    // Проверяем, что ноды не перекрываются (с учётом padding)
    const overlapX = p1.x < p2.x + 200 + padding && p1.x + 200 + padding > p2.x;
    const overlapY = p1.y < p2.y + 100 + padding && p1.y + 100 + padding > p2.y;
    assert.ok(!(overlapX && overlapY), 'ноды не должны перекрываться');
});

test('getSmartPlacement: нода добавляется к существующим без перекрытий', () => {
    const layer = { id: 'L3', size: { w: 600, h: 400 }, parentId: 'root' };
    const existingNode = { id: 'existing', size: { w: 200, h: 100 }, parentId: 'L3', position: { x: 20, y: 90 } };
    const newNodes = [{ id: 'new1', size: { w: 200, h: 100 } }];
    const allNodes = { existing: existingNode };

    const { updatesById } = GeometryUtils.getSmartPlacement(newNodes, layer, allNodes);

    const newPos = updatesById.new1.position;
    const padding = 20;

    // Новая нода не должна перекрываться с существующей
    const overlapX = newPos.x < 20 + 200 + padding && newPos.x + 200 + padding > 20;
    const overlapY = newPos.y < 90 + 100 + padding && newPos.y + 100 + padding > 90;
    assert.ok(!(overlapX && overlapY), 'новая нода не должна перекрывать существующую');
});

// === resolveLayerCollision: коллизия слоёв ===

test('resolveLayerCollision: слои не перекрываются после коррекции', () => {
    const layers = {
        L1: { id: 'L1', position: { x: 0, y: 0 }, size: { w: 300, h: 200 }, parentId: 'root' },
        L2: { id: 'L2', position: { x: 500, y: 0 }, size: { w: 300, h: 200 }, parentId: 'root' }
    };

    // Пытаемся задвинуть L1 на позицию, где он перекроет L2
    const resolved = GeometryUtils.resolveLayerCollision('L1', 400, 0, 300, 200, layers, 10);

    // L1 должен быть вытолкнут: не должен перекрывать L2
    const gap = 10;
    const overlapX = resolved.x < 500 + 300 + gap && resolved.x + 300 + gap > 500;
    const overlapY = resolved.y < 0 + 200 + gap && resolved.y + 200 + gap > 0;
    assert.ok(!(overlapX && overlapY), `L1 не должен перекрывать L2: resolved=${JSON.stringify(resolved)}`);
});

test('resolveLayerCollision: без коллизии позиция не меняется', () => {
    const layers = {
        L1: { id: 'L1', position: { x: 0, y: 0 }, size: { w: 300, h: 200 }, parentId: 'root' },
        L2: { id: 'L2', position: { x: 500, y: 0 }, size: { w: 300, h: 200 }, parentId: 'root' }
    };

    // L1 далеко от L2 — коллизии нет
    const resolved = GeometryUtils.resolveLayerCollision('L1', 0, 0, 300, 200, layers, 10);
    assert.equal(resolved.x, 0);
    assert.equal(resolved.y, 0);
});

test('resolveLayerCollision: разные контексты не конфликтуют', () => {
    const layers = {
        L1: { id: 'L1', position: { x: 0, y: 0 }, size: { w: 300, h: 200 }, parentId: 'root' },
        L2: { id: 'L2', position: { x: 0, y: 0 }, size: { w: 300, h: 200 }, parentId: 'someNode' }
    };

    // L1 и L2 в разных контекстах — перекрытие допустимо
    const resolved = GeometryUtils.resolveLayerCollision('L1', 0, 0, 300, 200, layers, 10);
    assert.equal(resolved.x, 0);
    assert.equal(resolved.y, 0);
});

// === LOAD_STATE: автовыравнивание на слоях ===

test('LOAD_STATE: ноды на слоях автоматически выравниваются с правильными отступами', () => {
    const loadedPayload = {
        nodes: {
            node1: { id: 'node1', name: 'N1', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'L1' },
            node2: { id: 'node2', name: 'N2', position: { x: 10, y: 20 }, size: { w: 200, h: 100 }, parentId: 'L1' }
        },
        layers: {
            L1: { id: 'L1', name: 'L1', position: { x: 100, y: 100 }, size: { w: 600, h: 400 }, parentId: 'root' }
        },
        ports: {},
        links: []
    };

    const s0 = makeState();
    const s1 = reducer(s0, { type: 'LOAD_STATE', payload: loadedPayload });

    const n1 = s1.nodes.node1;
    const n2 = s1.nodes.node2;

    // Проверяем, что ноды смещены как минимум на y >= 90 (отступ под шапкой)
    assert.ok(n1.position.y >= 90, `n1.y = ${n1.position.y} should be >= 90`);
    assert.ok(n2.position.y >= 90, `n2.y = ${n2.position.y} should be >= 90`);

    // Проверяем, что они не перекрываются
    const overlapX = n1.position.x < n2.position.x + 200 + 20 && n1.position.x + 200 + 20 > n2.position.x;
    const overlapY = n1.position.y < n2.position.y + 100 + 20 && n1.position.y + 100 + 20 > n2.position.y;
    assert.ok(!(overlapX && overlapY), 'ноды на слое не перекрываются после LOAD_STATE');

    // Проверяем, что размер слоя оптимизировался
    assert.ok(s1.layers.L1.size.w < 600, `размер слоя должен был уменьшиться, текущий: ${s1.layers.L1.size.w}`);
});

// === resolveContextCollisions: выталкивание нод (зазор 30px) ===

test('resolveContextCollisions: нода наезжает на слой и выталкивается на 30px', () => {
    const nodes = {
        nOutside: { id: 'nOutside', position: { x: 100, y: 100 }, size: { w: 200, h: 100 }, parentId: 'root' }
    };
    const layers = {
        L1: { id: 'L1', position: { x: 0, y: 0 }, size: { w: 200, h: 200 }, parentId: 'root' }
    };

    const resolvedNodes = GeometryUtils.resolveContextCollisions(nodes, layers);
    const n = resolvedNodes.nOutside;

    // Слой: [0..200] x [0..200]. С учетом gap=30, расширенная область: [-30..230] x [-30..230].
    // Нода стояла в {100, 100} и должна быть вытолкнута за пределы этой области.
    const overlapX = n.position.x < 200 + 30 && n.position.x + 200 > -30;
    const overlapY = n.position.y < 200 + 30 && n.position.y + 100 > -30;

    assert.ok(!(overlapX && overlapY), `Нода не должна перекрывать слой + 30px: ${JSON.stringify(n.position)}`);
});

test('resolveContextCollisions: две отдельные ноды наезжают друг на друга и выталкиваются на 30px', () => {
    const nodes = {
        n1: { id: 'n1', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' },
        n2: { id: 'n2', position: { x: 50, y: 50 }, size: { w: 200, h: 100 }, parentId: 'root' }
    };
    const layers = {};

    const resolvedNodes = GeometryUtils.resolveContextCollisions(nodes, layers);
    const p1 = resolvedNodes.n1.position;
    const p2 = resolvedNodes.n2.position;

    const overlapX = p1.x < p2.x + 200 + 30 && p1.x + 200 + 30 > p2.x;
    const overlapY = p1.y < p2.y + 100 + 30 && p1.y + 100 + 30 > p2.y;

    assert.ok(!(overlapX && overlapY), 'ноды должны разъехаться на расстояние не менее 30px');
});

test('LOAD_STATE: отдельные ноды автоматически отодвигаются от слоев на 30px', () => {
    const loadedPayload = {
        nodes: {
            nodeInside: { id: 'nodeInside', name: 'Inside', position: { x: 20, y: 90 }, size: { w: 200, h: 100 }, parentId: 'L1' },
            nodeOutside: { id: 'nodeOutside', name: 'Outside', position: { x: 150, y: 150 }, size: { w: 200, h: 100 }, parentId: 'root' }
        },
        layers: {
            L1: { id: 'L1', name: 'L1', position: { x: 100, y: 100 }, size: { w: 300, h: 300 }, parentId: 'root' }
        },
        ports: {},
        links: []
    };

    const s0 = makeState();
    const s1 = reducer(s0, { type: 'LOAD_STATE', payload: loadedPayload });

    const nOutside = s1.nodeOutside || s1.nodes.nodeOutside;
    const layer = s1.layers.L1;

    const gap = 30;
    const nW = (nOutside.size && nOutside.size.w) || 200;
    const nH = (nOutside.size && nOutside.size.h) || 80;
    const overlapX = nOutside.position.x < layer.position.x + layer.size.w + gap && nOutside.position.x + nW + gap > layer.position.x;
    const overlapY = nOutside.position.y < layer.position.y + layer.size.h + gap && nOutside.position.y + nH + gap > layer.position.y;

    assert.ok(!(overlapX && overlapY), `Свободная нода должна быть вне зоны слоя + 30px: ${JSON.stringify(nOutside.position)}`);
});

// === Автовыравнивание и сортировка слоев ===

test('GeometryUtils.alignLayers: сортирует слои по имени (natural sort) и выстраивает вертикально с зазором 90px', () => {
    const layers = {
        L3: { id: 'L3', name: 'Слой 3', position: { x: 50, y: 300 }, size: { w: 300, h: 200 }, parentId: 'root' },
        L1: { id: 'L1', name: 'Слой 1', position: { x: 100, y: 100 }, size: { w: 300, h: 200 }, parentId: 'root' },
        L2: { id: 'L2', name: 'Слой 2', position: { x: 20, y: 500 }, size: { w: 300, h: 200 }, parentId: 'root' },
        L10: { id: 'L10', name: 'Слой 10', position: { x: 0, y: 0 }, size: { w: 300, h: 200 }, parentId: 'root' }
    };

    const aligned = GeometryUtils.alignLayers(layers, {}, 'root', 90);

    // Natural sort: Слой 1 -> Слой 2 -> Слой 3 -> Слой 10
    // Выравнивание по X минимальному (которое равно 0 из L10)
    assert.equal(aligned.L1.position.x, 0);
    assert.equal(aligned.L2.position.x, 0);
    assert.equal(aligned.L3.position.x, 0);
    assert.equal(aligned.L10.position.x, 0);

    // Слой 1 Y остается исходным = 100
    assert.equal(aligned.L1.position.y, 100);
    // Слой 2 Y = L1 Y (100) + H (200) + gap (90) = 390
    assert.equal(aligned.L2.position.y, 390);
    // Слой 3 Y = L2 Y (390) + H (200) + gap (90) = 680
    assert.equal(aligned.L3.position.y, 680);
    // Слой 10 Y = L3 Y (680) + H (200) + gap (90) = 970
    assert.equal(aligned.L10.position.y, 970);
});

test('GeometryUtils.alignLayers: во вложенных контекстах выравнивает слои с отступом 100px от самого широкого слоя предыдущего уровня', () => {
    const layers = {
        L_root: { id: 'L_root', name: 'Слой Родитель', position: { x: 0, y: 0 }, size: { w: 500, h: 400 }, parentId: 'root' },
        L_child: { id: 'L_child', name: 'Слой Ребенок', position: { x: 10, y: 10 }, size: { w: 200, h: 200 }, parentId: 'node_sub' }
    };
    const nodes = {
        node_sub: { id: 'node_sub', name: 'Вложенный узел', position: { x: 100, y: 50 }, size: { w: 600, h: 400 }, parentId: 'root' }
    };

    const aligned = GeometryUtils.alignLayers(layers, nodes, 'node_sub', 90);

    // Правый край L_root (абсолютный) = 0 + 500 = 500.
    // Ожидаемый абсолютный X для L_child = 500 + 100 = 600.
    // Абсолютный X узла node_sub = 100.
    // Относительный X слоя L_child внутри node_sub должен быть = 600 - 100 = 500.
    assert.equal(aligned.L_child.position.x, 500);
});

test('ALIGN_LAYERS: экшен правильно изменяет состояние слоев', () => {
    const s0 = {
        ...defaultState,
        layers: {
            L2: { id: 'L2', name: 'Слой 2', position: { x: 10, y: 300 }, size: { w: 200, h: 100 }, parentId: 'root' },
            L1: { id: 'L1', name: 'Слой 1', position: { x: 50, y: 100 }, size: { w: 200, h: 100 }, parentId: 'root' }
        }
    };

    const s1 = reducer(s0, { type: 'ALIGN_LAYERS', payload: { contextId: 'root' } });

    assert.equal(s1.layers.L1.position.x, 10);
    assert.equal(s1.layers.L1.position.y, 100);
    assert.equal(s1.layers.L2.position.x, 10);
    assert.equal(s1.layers.L2.position.y, 290); // 100 + 100 + 90 = 290
});

test('LOAD_STATE: перекрывающиеся слои автоматически расталкиваются на 30px', () => {
    const loadedPayload = {
        nodes: {},
        layers: {
            L1: { id: 'L1', name: 'L1', position: { x: 0, y: 0 }, size: { w: 200, h: 200 }, parentId: 'root' },
            L2: { id: 'L2', name: 'L2', position: { x: 50, y: 50 }, size: { w: 200, h: 200 }, parentId: 'root' }
        },
        ports: {},
        links: []
    };

    const s0 = makeState();
    const s1 = reducer(s0, { type: 'LOAD_STATE', payload: loadedPayload });

    const l1 = s1.layers.L1;
    const l2 = s1.layers.L2;

    const overlapX = l1.position.x < l2.position.x + 200 + 30 && l1.position.x + 200 + 30 > l2.position.x;
    const overlapY = l1.position.y < l2.position.y + 200 + 30 && l1.position.y + 200 + 30 > l2.position.y;

    assert.ok(!(overlapX && overlapY), 'слои должны расталкиваться на 30px при LOAD_STATE');
});

// === snapToGrid: принудительное включение при создании и импорте ===

test('ADD_NODE: принудительно устанавливает snapToGrid в true', () => {
    const s0 = makeState();
    const s1 = reducer(s0, {
        type: 'ADD_NODE',
        payload: { name: 'Node 1', position: { x: 10, y: 10 }, type: 'rectangle' }
    });

    const nodeId = s1.selectedIds[0];
    assert.ok(s1.nodes[nodeId].snapToGrid, 'при создании ноды snapToGrid должен быть true');
});

test('ADD_LAYER: принудительно устанавливает snapToGrid в true', () => {
    const s0 = makeState();
    const s1 = reducer(s0, {
        type: 'ADD_LAYER',
        payload: { name: 'Layer 1', position: { x: 10, y: 10 }, size: { w: 100, h: 100 } }
    });

    const layerId = s1.selectedIds[0];
    assert.ok(s1.layers[layerId].snapToGrid, 'при создании слоя snapToGrid должен быть true');
});

test('LOAD_STATE: принудительно включает snapToGrid во всех импортируемых нодах и слоях', () => {
    const loadedPayload = {
        nodes: {
            n1: { id: 'n1', name: 'Node 1', position: { x: 0, y: 0 }, snapToGrid: false },
            n2: { id: 'n2', name: 'Node 2', position: { x: 50, y: 50 } } // отсутствует в исходном объекте
        },
        layers: {
            L1: { id: 'L1', name: 'L1', position: { x: 100, y: 100 }, size: { w: 200, h: 200 }, snapToGrid: false },
            L2: { id: 'L2', name: 'L2', position: { x: 300, y: 300 }, size: { w: 200, h: 200 } } // отсутствует в исходном объекте
        },
        ports: {},
        links: []
    };

    const s0 = makeState();
    const s1 = reducer(s0, { type: 'LOAD_STATE', payload: loadedPayload });

    assert.ok(s1.nodes.n1.snapToGrid, 'n1.snapToGrid должен быть переопределен в true');
    assert.ok(s1.nodes.n2.snapToGrid, 'n2.snapToGrid должен быть инициализирован в true');
    assert.ok(s1.layers.L1.snapToGrid, 'L1.snapToGrid должен быть переопределен в true');
    assert.ok(s1.layers.L2.snapToGrid, 'L2.snapToGrid должен быть инициализирован в true');
});

// === Тесты выделения и перемещения вложенных групп ===

test('SET_MULTI_SELECTED: правильно сохраняет список выделенных элементов', () => {
    const s0 = makeState();
    const s1 = reducer(s0, { type: 'SET_MULTI_SELECTED', payload: ['nodeB', 'nodeC'] });
    assert.deepEqual(s1.selectedIds, ['nodeB', 'nodeC']);
});

test('MOVE_SELECTED: предохраняет детей от двойного сдвига при перемещении родителя', () => {
    const s0 = makeState();
    // Выделим родителя nodeA и ребенка nodeB одновременно
    const s1 = { ...s0, selectedIds: ['nodeA', 'nodeB'] };
    
    // Сдвинем выделенную группу на dx = 10, dy = 20
    const s2 = reducer(s1, { type: 'MOVE_SELECTED', payload: { dx: 10, dy: 20, skipHistory: true } });
    
    // Родитель nodeA должен сдвинуться на 10, 20
    assert.equal(s2.nodes.nodeA.position.x, 10);
    assert.equal(s2.nodes.nodeA.position.y, 20);
    
    // Ребенок nodeB (parentId = 'nodeA') хранит относительную позицию. 
    // Поскольку он двигается за счет родителя, его собственная относительная позиция 
    // должна остаться без изменений (x: 50, y: 300) во избежание двойного сдвига.
    assert.equal(s2.nodes.nodeB.position.x, 50);
    assert.equal(s2.nodes.nodeB.position.y, 300);
});

test('ADD_AI_MESSAGE / CLEAR_AI_HISTORY: изоляция историй чата по nodeId и лимит 200 сообщений', () => {
    let s = makeState();
    
    // Добавление сообщения в конкретный узел node1
    s = reducer(s, { 
        type: 'ADD_AI_MESSAGE', 
        payload: { nodeId: 'node1', message: { role: 'user', content: 'Привет node1' } } 
    });
    
    // Добавление сообщения в узел node2
    s = reducer(s, { 
        type: 'ADD_AI_MESSAGE', 
        payload: { nodeId: 'node2', message: { role: 'user', content: 'Привет node2' } } 
    });

    assert.ok(s.aiChatHistoryByNode['node1']);
    assert.ok(s.aiChatHistoryByNode['node2']);
    assert.equal(s.aiChatHistoryByNode['node1'][0].content, 'Привет node1');
    assert.equal(s.aiChatHistoryByNode['node2'][0].content, 'Привет node2');

    // Очистка истории node1 не затрагивает node2
    s = reducer(s, { type: 'CLEAR_AI_HISTORY', payload: { nodeId: 'node1' } });
    assert.ok(s.aiChatHistoryByNode['node2']);
});

test('CREATE_AI_SESSION / SWITCH_AI_SESSION / DELETE_AI_SESSION: множественные диалоги узла', () => {
    let s = makeState();
    
    // Создаем первое сообщение в Диалог 1 узла nodeA
    s = reducer(s, {
        type: 'ADD_AI_MESSAGE',
        payload: { nodeId: 'nodeA', message: { role: 'user', content: 'Вопрос 1' } }
    });

    const nodeData1 = s.aiChatSessionsByNode['nodeA'];
    assert.ok(nodeData1, 'Сессия создана');
    assert.equal(nodeData1.sessions.length, 1);
    assert.equal(nodeData1.sessions[0].messages[0].content, 'Вопрос 1');

    // Создаем новую сессию по кнопке '+'
    s = reducer(s, { type: 'CREATE_AI_SESSION', payload: { nodeId: 'nodeA' } });
    const nodeData2 = s.aiChatSessionsByNode['nodeA'];
    assert.equal(nodeData2.sessions.length, 2, 'В узле 2 диалога');
    assert.notEqual(nodeData2.activeSessionId, nodeData1.activeSessionId, 'Активная сессия изменилась');

    // Отправляем новое сообщение во 2-й диалог
    s = reducer(s, {
        type: 'ADD_AI_MESSAGE',
        payload: { nodeId: 'nodeA', message: { role: 'user', content: 'Вопрос в новый диалог' } }
    });

    // Переключаемся обратно на 1-й диалог
    const firstSessionId = nodeData1.activeSessionId;
    s = reducer(s, { type: 'SWITCH_AI_SESSION', payload: { nodeId: 'nodeA', sessionId: firstSessionId } });
    const nodeData3 = s.aiChatSessionsByNode['nodeA'];
    assert.equal(nodeData3.activeSessionId, firstSessionId);

    // Удаляем 2-й диалог — 1-й диалог остаётся живым
    const secondSessionId = nodeData2.activeSessionId;
    s = reducer(s, { type: 'DELETE_AI_SESSION', payload: { nodeId: 'nodeA', sessionId: secondSessionId } });
    const nodeData4 = s.aiChatSessionsByNode['nodeA'];
    assert.equal(nodeData4.sessions.length, 1);
    assert.equal(nodeData4.sessions[0].id, firstSessionId);
    assert.equal(nodeData4.sessions[0].messages[0].content, 'Вопрос 1');
});

test('LOAD_STATE: demo_project.json проходит валидацию и корректно загружает граф', () => {
    const fs = require('fs');
    const path = require('path');
    const demoPath = path.join(__dirname, '../demo_project.json');
    const demoRaw = fs.readFileSync(demoPath, 'utf8');
    const demoJson = JSON.parse(demoRaw);

    const s = reducer(defaultState, { type: 'LOAD_STATE', payload: demoJson });

    assert.ok(s.nodes['node-1786432299374721'], 'Узел А загрузился');
    assert.ok(s.nodes['node-1786432310240234'], 'Узел Б загрузился');
    assert.ok(s.nodes['node-1786432367907419'], 'Узел А2 3-го уровня загрузился');
    assert.ok(s.ports['port-1786432401071358'], 'Порт загрузился');
    assert.ok(s.links['link-1786432407244422'], 'Связь загрузилась');
    assert.equal(s.formatVersion, 11);
});



// === ТИПОГРАФИКА: Индивидуальное и массовое назначение шрифтов и размеров ===

test('Typography: индивидуальная установка fontFamily и fontSize для всех типов сущностей', () => {
    let s = makeState();
    
    // 1. Узел
    s = reducer(s, { type: 'UPDATE_NODE', payload: { id: 'nodeA', updates: { fontFamily: 'Montserrat, sans-serif', fontSize: 18 } } });
    assert.equal(s.nodes.nodeA.fontFamily, 'Montserrat, sans-serif');
    assert.equal(s.nodes.nodeA.fontSize, 18);

    // 2. Слой
    s = reducer(s, { type: 'UPDATE_LAYER', payload: { id: 'layerL', updates: { fontFamily: 'Fira Code, monospace', fontSize: 16 } } });
    assert.equal(s.layers.layerL.fontFamily, 'Fira Code, monospace');
    assert.equal(s.layers.layerL.fontSize, 16);

    // 3. Порт
    s = reducer(s, { type: 'UPDATE_PORT', payload: { id: 'portB', updates: { fontFamily: 'Roboto, sans-serif', fontSize: 12 } } });
    assert.equal(s.ports.portB.fontFamily, 'Roboto, sans-serif');
    assert.equal(s.ports.portB.fontSize, 12);

    // 4. Связь
    s = reducer(s, { type: 'UPDATE_LINK', payload: { id: 'linkBC', updates: { fontFamily: 'JetBrains Mono, monospace', fontSize: 14 } } });
    assert.equal(s.links.linkBC.fontFamily, 'JetBrains Mono, monospace');
    assert.equal(s.links.linkBC.fontSize, 14);
});

test('Typography: MASS_UPDATE применяет шрифт и размер ко всем выбранным сущностям без создания жестких связей', () => {
    let s = makeState();
    
    // Массово применяем шрифт и размер к nodeA, layerL, portB, linkBC
    s = reducer(s, { 
        type: 'MASS_UPDATE', 
        payload: { 
            ids: ['nodeA', 'layerL', 'portB', 'linkBC'], 
            updates: { fontFamily: 'Playfair Display, serif', fontSize: 20 } 
        } 
    });

    assert.equal(s.nodes.nodeA.fontFamily, 'Playfair Display, serif');
    assert.equal(s.nodes.nodeA.fontSize, 20);
    assert.equal(s.layers.layerL.fontFamily, 'Playfair Display, serif');
    assert.equal(s.layers.layerL.fontSize, 20);
    assert.equal(s.ports.portB.fontFamily, 'Playfair Display, serif');
    assert.equal(s.ports.portB.fontSize, 20);
    assert.equal(s.links.linkBC.fontFamily, 'Playfair Display, serif');
    assert.equal(s.links.linkBC.fontSize, 20);

    // Последующее ручное изменение на nodeA меняет только nodeA (приоритет индивидуального редактирования)
    s = reducer(s, { type: 'UPDATE_NODE', payload: { id: 'nodeA', updates: { fontFamily: 'Courier New, monospace', fontSize: 12 } } });
    assert.equal(s.nodes.nodeA.fontFamily, 'Courier New, monospace');
    assert.equal(s.nodes.nodeA.fontSize, 12);
    // Остальные сущности сохранили свои значения
    assert.equal(s.layers.layerL.fontFamily, 'Playfair Display, serif');
    assert.equal(s.layers.layerL.fontSize, 20);
});

test('UNDO/REDO: изоляция камеры окон уровней от отката действий', () => {
    let s = makeState();
    const winId = 'lvlwin-test-1';
    s.levelWindows = {
        ...s.levelWindows,
        [winId]: { id: winId, levelIndex: 1, name: 'Уровень 1', position: { x: 0, y: 800 }, size: { w: 1000, h: 700 } }
    };
    s.levelViews = { ...s.levelViews, [winId]: { innerOffset: { x: 0, y: 0 }, innerZoom: 1.0, isCollapsed: false } };

    // 1. Структурное действие (добавляем узел)
    s = reducer(s, { type: 'ADD_NODE', payload: { id: 'testNode', name: 'Test Node', parentId: 'root' } });
    assert.ok(s.nodes.testNode, 'Нода добавлена');

    // 2. Пользователь зумирует и панорамирует окно уровня 1 (действие камеры)
    s = reducer(s, { type: 'ZOOM_LEVEL_WINDOW', payload: { id: winId, innerZoom: 2.5, innerOffset: { x: 150, y: 80 } } });
    assert.equal(s.levelViews[winId].innerZoom, 2.5);
    assert.equal(s.levelViews[winId].innerOffset.x, 150);

    // 3. UNDO откатывает граф, но не камеру
    s = reducer(s, { type: 'UNDO' });
    assert.ok(!s.nodes.testNode, 'Нода удалена после UNDO');
    assert.equal(s.levelViews[winId].innerZoom, 2.5, 'innerZoom сохранился после UNDO');
    assert.equal(s.levelViews[winId].innerOffset.x, 150, 'innerOffset сохранился после UNDO');

    // 4. REDO возвращает граф, камера по-прежнему не трогается
    s = reducer(s, { type: 'REDO' });
    assert.ok(s.nodes.testNode, 'Нода снова появилась после REDO');
    assert.equal(s.levelViews[winId].innerZoom, 2.5, 'innerZoom сохранился после REDO');
    assert.equal(s.levelViews[winId].innerOffset.x, 150, 'innerOffset сохранился после REDO');

    // 5. Само окно живёт в снапшоте истории и восстанавливается как сущность
    assert.ok(s.levelWindows[winId], 'окно уровня пережило UNDO/REDO');
});

test('PAN_LEVEL_WINDOW / ZOOM_LEVEL_WINDOW: обновление координат и зума вьюпорта окна без загрязнения истории', () => {
    let s = makeState();
    const initialPastLen = s.past.length;

    const rootWinId = Object.values(s.levelWindows).find(w => w.levelIndex === 0).id;

    s = reducer(s, { type: 'PAN_LEVEL_WINDOW', payload: { index: 0, offset: { x: 75, y: -40 } } });
    assert.deepEqual(s.levelViews[rootWinId].innerOffset, { x: 75, y: -40 });
    assert.equal(s.past.length, initialPastLen, 'PAN не создает запись в past');

    s = reducer(s, { type: 'ZOOM_LEVEL_WINDOW', payload: { id: rootWinId, innerZoom: 1.8 } });
    assert.equal(s.levelViews[rootWinId].innerZoom, 1.8);
    assert.equal(s.past.length, initialPastLen, 'ZOOM не создает запись в past');

    // Камера не должна попадать в запись окна — иначе она вернётся в снапшот истории
    assert.equal(s.levelWindows[rootWinId].innerZoom, undefined, 'камера не хранится в записи окна');
});







// ============================================================
// Удаление и очистка уровней (REMOVE_LEVEL_WINDOW / CLEAR_LEVEL_WINDOW)
// ============================================================

// Трёхуровневый проект: A (ур.0) -> B (ур.1) -> C (ур.2), слой L1 на ур.1,
// окна с кастомными рамками и камерами, мастер-порт уровня 2
const makeLeveledState = () => ({
    ...defaultState,
    nodes: {
        nodeA: { id: 'nodeA', name: 'A', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' },
        nodeB: { id: 'nodeB', name: 'B', position: { x: 50, y: 50 }, size: { w: 200, h: 100 }, parentId: 'root', ownerId: 'nodeA' },
        nodeC: { id: 'nodeC', name: 'C', position: { x: 90, y: 90 }, size: { w: 200, h: 100 }, parentId: 'root', ownerId: 'nodeB' }
    },
    layers: {
        layerL1: { id: 'layerL1', name: 'L1', position: { x: 500, y: 0 }, size: { w: 600, h: 400 }, parentId: 'root', ownerId: 'nodeA' }
    },
    ports: {
        portA: { id: 'portA', nodeId: 'nodeA', type: 'output', edge: 'right', position: 0.5 },
        portB: { id: 'portB', nodeId: 'nodeB', type: 'input', edge: 'left', position: 0.5 },
        portC: { id: 'portC', nodeId: 'nodeC', type: 'input', edge: 'left', position: 0.5 },
        'port-master-level-2': { id: 'port-master-level-2', windowIndex: 2, isMaster: true, name: 'Уровень 2', color: '#38bdf8' }
    },
    links: {
        linkAB: { id: 'linkAB', sourcePortId: 'portA', targetPortId: 'portB' },
        linkBC: { id: 'linkBC', sourcePortId: 'portB', targetPortId: 'portC' },
        linkMaster: { id: 'linkMaster', sourcePortId: 'port-master-level-2', targetPortId: 'portA' }
    },
    levelWindows: {
        'lvlwin-root': { id: 'lvlwin-root', levelIndex: 0, name: 'Главный холст', color: '#111111', position: { x: -500, y: -400 }, size: { w: 1000, h: 700 } },
        'win1': { id: 'win1', levelIndex: 1, name: 'Мой уровень 1', color: '#222222', position: { x: -500, y: 380 }, size: { w: 900, h: 600 } },
        'win2': { id: 'win2', levelIndex: 2, name: 'Мой уровень 2', color: '#333333', position: { x: -500, y: 1060 }, size: { w: 800, h: 500 } }
    },
    levelViews: {
        'lvlwin-root': { innerOffset: { x: 1, y: 2 }, innerZoom: 0.9, isCollapsed: false },
        'win1': { innerOffset: { x: 10, y: 20 }, innerZoom: 1.5, isCollapsed: false },
        'win2': { innerOffset: { x: 30, y: 40 }, innerZoom: 2.0, isCollapsed: true }
    },
    levelHideNeighbors: { 1: true, 2: true },
    levelFocusParentId: { 1: 'nodeA', 2: 'nodeB' }
});

test('REMOVE_LEVEL_WINDOW: словарь окон ключуется id — резолв по index работает (регрессия no-op)', () => {
    const s0 = makeLeveledState();
    const s1 = reducer(s0, { type: 'REMOVE_LEVEL_WINDOW', payload: { index: 1 } });
    assert.notEqual(s1, s0, 'экшен не должен быть no-op');
    assert.equal(s1.levelWindows['win1'], undefined, 'окно уровня 1 удалено');
});

test('REMOVE_LEVEL_WINDOW: уровень 0 (Главный холст) удалить нельзя', () => {
    const s0 = makeLeveledState();
    const s1 = reducer(s0, { type: 'REMOVE_LEVEL_WINDOW', payload: { index: 0 } });
    assert.equal(s1, s0, 'удаление Главного холста — no-op');
});

test('REMOVE_LEVEL_WINDOW: следующий уровень становится предыдущим с сохранением рамки и камеры', () => {
    const s0 = makeLeveledState();
    const s1 = reducer(s0, { type: 'REMOVE_LEVEL_WINDOW', payload: { index: 1 } });

    // Сущности уровня 1 удалены (узел и слой)
    assert.equal(s1.nodes.nodeB, undefined);
    assert.equal(s1.layers.layerL1, undefined);

    // Потомок пере-якорен «внук — деду»: C теперь принадлежит A и живёт на уровне 1
    assert.ok(s1.nodes.nodeC, 'nodeC выжил');
    assert.equal(s1.nodes.nodeC.ownerId, 'nodeA');
    assert.equal(HierarchyUtils.getEntityLevel('nodeC', s1.nodes, s1.layers), 1);

    // Окно бывшего уровня 2 стало уровнем 1, сохранив id, рамку и камеру
    assert.ok(s1.levelWindows['win2'], 'окно win2 сохранило id');
    assert.equal(s1.levelWindows['win2'].levelIndex, 1);
    assert.equal(s1.levelWindows['win2'].name, 'Мой уровень 2');
    assert.equal(s1.levelWindows['win2'].color, '#333333');
    assert.deepEqual(s1.levelViews['win2'].innerOffset, { x: 30, y: 40 }, 'камера окна пережила сдвиг');
    assert.equal(s1.levelViews['win2'].innerZoom, 2.0);

    // Камера удалённого окна вычищена
    assert.equal(s1.levelViews['win1'], undefined);

    // Порты/связи: порт B и его связи умерли, мастер-порт уровня 2 переехал на уровень 1
    assert.equal(s1.ports.portB, undefined);
    assert.equal(s1.links.linkAB, undefined);
    assert.equal(s1.links.linkBC, undefined);
    assert.equal(s1.ports['port-master-level-2'], undefined);
    assert.ok(s1.ports['port-master-level-1'], 'мастер-порт сдвинулся вместе с уровнем');
    assert.equal(s1.ports['port-master-level-1'].windowIndex, 1);
    assert.equal(s1.links.linkMaster.sourcePortId, 'port-master-level-1', 'связь переписана на новый id мастер-порта');

    // Пер-уровневые словари UI сдвинулись
    assert.equal(s1.levelHideNeighbors[1], true, 'флаг бывшего уровня 2 переехал на уровень 1');
    assert.equal(s1.levelHideNeighbors[2], undefined);
    // Фокус-владелец nodeB удалён вместе с уровнем — ветку наследует его
    // владелец nodeA («внук — деду»), формат — набор (массив)
    assert.deepEqual(s1.levelFocusParentId[1], ['nodeA'], 'фокус бывшего уровня 2 переехал и пере-якорился');
});

test('REMOVE_LEVEL_WINDOW: резолв окна по id тоже работает', () => {
    const s0 = makeLeveledState();
    const s1 = reducer(s0, { type: 'REMOVE_LEVEL_WINDOW', payload: { id: 'win1' } });
    assert.equal(s1.levelWindows['win1'], undefined);
    assert.equal(s1.levelWindows['win2'].levelIndex, 1);
});

test('CLEAR_LEVEL_WINDOW: очистка уровня щадит потомков — «внук — деду» через поколение (ownerGap)', () => {
    const s0 = makeLeveledState();
    const s1 = reducer(s0, { type: 'CLEAR_LEVEL_WINDOW', payload: { index: 1 } });

    assert.ok(s1.nodes.nodeA, 'уровень 0 не тронут');
    assert.equal(s1.nodes.nodeB, undefined, 'узел уровня 1 удалён');
    assert.equal(s1.layers.layerL1, undefined, 'слой уровня 1 удалён');

    // Потомок ВЫЖИЛ: пере-якорен на деда со связью через поколение
    assert.ok(s1.nodes.nodeC, 'потомок на уровне 2 выжил');
    assert.equal(s1.nodes.nodeC.ownerId, 'nodeA', 'внук привязан к деду');
    assert.equal(s1.nodes.nodeC.ownerGap, 2, 'дистанция поколений запомнена');
    assert.equal(HierarchyUtils.getEntityLevel('nodeC', s1.nodes, s1.layers), 2, 'внук остался на СВОЁМ уровне');

    // Все окна и камеры на месте
    assert.ok(s1.levelWindows['win1'], 'окно очищенного уровня осталось');
    assert.equal(s1.levelWindows['win1'].levelIndex, 1);
    assert.ok(s1.levelWindows['win2']);
    assert.equal(s1.levelWindows['win2'].levelIndex, 2, 'уровни НЕ сдвигаются при очистке');
    assert.deepEqual(s1.levelViews['win1'].innerOffset, { x: 10, y: 20 });

    // Связи с умершими узлами вычищены, порты выживших живы
    assert.ok(s1.ports.portA);
    assert.ok(s1.ports.portC, 'порт выжившего внука жив');
    assert.equal(s1.ports.portB, undefined);
    assert.equal(s1.links.linkAB, undefined);
    assert.equal(s1.links.linkBC, undefined);

    // Фокус-владелец nodeB заменён его живым предком
    assert.deepEqual(s1.levelFocusParentId[2], ['nodeA'], 'фокус пере-якорен «внук — деду»');
});

test('CLEAR_LEVEL_WINDOW: очистка Главного холста делает детей сиротами, их ветки сохраняются', () => {
    const s0 = makeLeveledState();
    s0.projectName = 'Мой проект';
    const s1 = reducer(s0, { type: 'CLEAR_LEVEL_WINDOW', payload: { index: 0 } });

    assert.equal(s1.nodes.nodeA, undefined, 'узел Главного холста удалён');

    // Дети уровня 1 — сироты со своими ветками
    assert.ok(s1.nodes.nodeB, 'ребёнок на уровне 1 выжил');
    assert.equal(s1.nodes.nodeB.ownerId, null, 'ребёнок стал сиротой');
    assert.equal(s1.nodes.nodeB.homeLevel, 1, 'сирота якорится на своём уровне');
    assert.ok(s1.nodes.nodeC, 'внук выжил');
    assert.equal(s1.nodes.nodeC.ownerId, 'nodeB', 'ветка сироты не тронута');
    assert.equal(HierarchyUtils.getEntityLevel('nodeB', s1.nodes, s1.layers), 1);
    assert.equal(HierarchyUtils.getEntityLevel('nodeC', s1.nodes, s1.layers), 2);

    // Слой уровня 1 тоже выжил сиротой на своём уровне
    assert.ok(s1.layers.layerL1, 'слой уровня 1 выжил');
    assert.equal(s1.layers.layerL1.ownerId, null);
    assert.equal(s1.layers.layerL1.homeLevel, 1);

    assert.ok(s1.levelWindows['lvlwin-root'], 'Главный холст как окно остался');
    assert.ok(s1.levelWindows['win1'], 'окна нижних уровней остались');
    assert.ok(s1.levelWindows['win2']);
    assert.equal(s1.projectName, 'Мой проект', 'настройки проекта не тронуты');
});

test('CLEAR_LEVEL_WINDOW: очистка уровня 1, затем Главного холста — «внуки» без предков становятся сиротами', () => {
    const s0 = makeLeveledState();
    const s1 = reducer(s0, { type: 'CLEAR_LEVEL_WINDOW', payload: { index: 1 } });
    const s2 = reducer(s1, { type: 'CLEAR_LEVEL_WINDOW', payload: { index: 0 } });

    assert.equal(s2.nodes.nodeA, undefined);
    assert.ok(s2.nodes.nodeC, 'внук выжил после обеих очисток');
    assert.equal(s2.nodes.nodeC.ownerId, null, 'живых предков не осталось — сирота');
    assert.equal(s2.nodes.nodeC.homeLevel, 2, 'сирота остался на своём уровне');
    assert.equal(s2.nodes.nodeC.ownerGap, undefined, 'дистанция сироте не нужна');
    assert.equal(HierarchyUtils.getEntityLevel('nodeC', s2.nodes, s2.layers), 2);
});

test('CLEAR_PROJECT: сброс к начальному состоянию — остаётся только пустой Главный холст', () => {
    const s0 = makeLeveledState();
    s0.projectName = 'Мой проект';
    const s1 = reducer(s0, { type: 'CLEAR_PROJECT' });

    assert.equal(Object.keys(s1.nodes).length, 0, 'все узлы удалены');
    assert.equal(Object.keys(s1.layers).length, 0, 'все слои удалены');
    assert.equal(Object.keys(s1.links).length, 0, 'все связи удалены');
    assert.equal(Object.keys(s1.ports).length, 0, 'все порты удалены, включая мастер-порты окон');

    assert.ok(s1.levelWindows['lvlwin-root'], 'Главный холст как окно остался');
    assert.equal(s1.levelWindows['lvlwin-root'].name, 'Главный холст', 'имя окна L0 сохранено');
    assert.equal(s1.levelWindows['lvlwin-root'].color, '#111111', 'цвет окна L0 сохранён');
    assert.equal(s1.levelWindows['win1'], undefined, 'окно уровня 1 удалено');
    assert.equal(s1.levelWindows['win2'], undefined, 'окно уровня 2 удалено');
    assert.equal(Object.keys(s1.levelWindows).length, 1, 'остался ровно один уровень');
    assert.ok(s1.levelViews['lvlwin-root'], 'камера Главного холста сохранена');
    assert.equal(s1.levelViews['lvlwin-root'].innerZoom, 0.9, 'зум камеры L0 не сброшен');
    assert.equal(s1.levelViews['win1'], undefined, 'камеры удалённых окон вычищены');
    assert.equal(Object.keys(s1.levelHideNeighbors).length, 0, 'пер-уровневые глаза сброшены');
    assert.equal(Object.keys(s1.levelFocusParentId).length, 0, 'фокус-наборы сброшены');
    assert.equal(s1.activeLevelIndex, 0);
    assert.equal(s1.projectName, 'Мой проект', 'настройки проекта не тронуты');

    const s2 = reducer(s1, { type: 'UNDO' });
    assert.ok(s2.nodes.nodeA, 'полная очистка откатывается Undo');
    assert.ok(s2.levelWindows['win1'], 'Undo возвращает и удалённые окна уровней');
    assert.ok(s2.levelWindows['win2']);
});

test('ADD_LEVEL_WINDOW: создаёт пустое окно следующего уровня без узлов', () => {
    const s0 = makeLeveledState(); // уровни 0, 1, 2
    const nodesBefore = Object.keys(s0.nodes).length;
    const s1 = reducer(s0, { type: 'ADD_LEVEL_WINDOW' });

    const levels = Object.values(s1.levelWindows).map(w => w.levelIndex).sort();
    assert.deepEqual(levels, [0, 1, 2, 3], 'появился уровень 3 — следующий за самым глубоким');
    assert.equal(Object.keys(s1.nodes).length, nodesBefore, 'узлы не создавались');

    const newWin = Object.values(s1.levelWindows).find(w => w.levelIndex === 3);
    assert.ok(newWin.id, 'у нового окна есть стабильный id');
    assert.ok(s1.levelViews[newWin.id], 'у нового окна есть камера');
    assert.equal(s1.levelViews[newWin.id].innerZoom, 1, 'камера дефолтная');

    // Повторный вызов — уровень 4, id не конфликтуют
    const s2 = reducer(s1, { type: 'ADD_LEVEL_WINDOW' });
    const levels2 = Object.values(s2.levelWindows).map(w => w.levelIndex).sort();
    assert.deepEqual(levels2, [0, 1, 2, 3, 4]);

    // Откатывается Undo
    const s3 = reducer(s1, { type: 'UNDO' });
    assert.equal(Object.values(s3.levelWindows).find(w => w.levelIndex === 3), undefined, 'Undo убирает пустой уровень');
});

test('REMOVE_ROOT_CANVAS: Уровень 1 становится Главным холстом, не меняя имя и цвет', () => {
    const s0 = makeLeveledState();
    const s1 = reducer(s0, { type: 'REMOVE_ROOT_CANVAS' });

    // Сущности бывшего Главного холста удалены
    assert.equal(s1.nodes.nodeA, undefined, 'узел Главного холста удалён');

    // Дети уровня 1 поднялись на Главный холст сиротами, ветки при них
    assert.ok(s1.nodes.nodeB, 'ребёнок выжил');
    assert.equal(s1.nodes.nodeB.ownerId, null, 'владельца больше нет');
    assert.equal(HierarchyUtils.getEntityLevel('nodeB', s1.nodes, s1.layers), 0, 'ребёнок теперь на Главном холсте');
    assert.ok(s1.nodes.nodeC, 'внук выжил');
    assert.equal(s1.nodes.nodeC.ownerId, 'nodeB', 'ветка сохранена');
    assert.equal(HierarchyUtils.getEntityLevel('nodeC', s1.nodes, s1.layers), 1, 'внук поднялся на уровень 1');
    assert.ok(s1.layers.layerL1, 'слой уровня 1 выжил');
    assert.equal(HierarchyUtils.getEntityLevel('layerL1', s1.nodes, s1.layers), 0);

    // Окно уровня 1 заняло место Главного холста, сохранив id, имя, цвет и камеру
    assert.equal(s1.levelWindows['lvlwin-root'], undefined, 'старое окно Главного холста удалено');
    assert.ok(s1.levelWindows['win1'], 'окно уровня 1 сохранило id');
    assert.equal(s1.levelWindows['win1'].levelIndex, 0, 'окно уровня 1 стало Главным холстом');
    assert.equal(s1.levelWindows['win1'].name, 'Мой уровень 1', 'имя не изменилось');
    assert.equal(s1.levelWindows['win1'].color, '#222222', 'цвет не изменился');
    assert.deepEqual(s1.levelViews['win1'].innerOffset, { x: 10, y: 20 }, 'камера пережила повышение');
    assert.equal(s1.levelWindows['win2'].levelIndex, 1, 'нижние окна поднялись на один');

    // Мастер-порт уровня 2 переехал на уровень 1
    assert.equal(s1.ports['port-master-level-2'], undefined);
    assert.ok(s1.ports['port-master-level-1']);

    const s2 = reducer(s1, { type: 'UNDO' });
    assert.ok(s2.nodes.nodeA, 'удаление холста откатывается Undo');
    assert.equal(s2.levelWindows['lvlwin-root'].levelIndex, 0, 'окно Главного холста восстановлено');
});

test('REMOVE_ROOT_CANVAS: без других уровней — no-op (кнопка в UI неактивна)', () => {
    const s0 = {
        ...defaultState,
        nodes: { nodeA: { id: 'nodeA', name: 'A', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' } },
        levelWindows: {
            'lvlwin-root': { id: 'lvlwin-root', levelIndex: 0, name: 'Главный холст', position: { x: 0, y: 0 }, size: { w: 1000, h: 700 } }
        }
    };
    const s1 = reducer(s0, { type: 'REMOVE_ROOT_CANVAS' });
    assert.equal(s1, s0, 'удаление единственного холста — no-op');
});

test('REMOVE_ROOT_CANVAS: сирота с дистанцией не получает двойной сдвиг homeLevel (регрессия)', () => {
    // A (ур.0) --gap:2--> C (ур.2, после очистки ур.1). Удаление холста:
    // C становится сиротой на уровне 1 (2 минус один снятый уровень), не на 0
    const s0 = makeLeveledState();
    const s1 = reducer(s0, { type: 'CLEAR_LEVEL_WINDOW', payload: { index: 1 } });
    const s2 = reducer(s1, { type: 'REMOVE_ROOT_CANVAS' });

    assert.ok(s2.nodes.nodeC, 'внук выжил');
    assert.equal(s2.nodes.nodeC.ownerId, null, 'живых предков не осталось — сирота');
    assert.equal(s2.nodes.nodeC.homeLevel, 1, 'уровень сместился ровно на один, а не на два');
    assert.equal(HierarchyUtils.getEntityLevel('nodeC', s2.nodes, s2.layers), 1);
});

test('REMOVE_LEVEL_WINDOW: связь через поколение, перепрыгивающая удаляемый уровень, сокращает дистанцию', () => {
    // A (ур.0) --ownerGap:2--> C (ур.2); уровень 1 пуст после очистки
    const s0 = makeLeveledState();
    const s1 = reducer(s0, { type: 'CLEAR_LEVEL_WINDOW', payload: { index: 1 } });
    assert.equal(s1.nodes.nodeC.ownerGap, 2);

    // Удаляем опустевший уровень 1 — внук подтягивается к деду вплотную
    const s2 = reducer(s1, { type: 'REMOVE_LEVEL_WINDOW', payload: { index: 1 } });
    assert.ok(s2.nodes.nodeC, 'внук выжил');
    assert.equal(s2.nodes.nodeC.ownerId, 'nodeA');
    assert.equal(s2.nodes.nodeC.ownerGap, undefined, 'дистанция сократилась до обычной (поле снято)');
    assert.equal(HierarchyUtils.getEntityLevel('nodeC', s2.nodes, s2.layers), 1, 'внук стал обычным ребёнком');
});

test('REMOVE_LEVEL_WINDOW: UNDO возвращает удалённый уровень', () => {
    const s0 = makeLeveledState();
    const s1 = reducer(s0, { type: 'REMOVE_LEVEL_WINDOW', payload: { index: 1 } });
    const s2 = reducer(s1, { type: 'UNDO' });
    assert.ok(s2.nodes.nodeB, 'узел уровня 1 восстановлен');
    assert.ok(s2.levelWindows['win1'], 'окно уровня 1 восстановлено');
    assert.equal(s2.levelWindows['win2'].levelIndex, 2, 'сдвиг уровней откатился');
});

test('CREATE_NESTED_NODE: новое окно уровня получает запись камеры (регрессия spread-порядка)', () => {
    let s = { ...defaultState, nodes: { nodeA: { id: 'nodeA', name: 'A', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' } } };
    s = reducer(s, { type: 'CREATE_NESTED_NODE', payload: { parentId: 'nodeA', id: 'child1', name: 'Child' } });
    const win1 = Object.values(s.levelWindows).find(w => w.levelIndex === 1);
    assert.ok(win1, 'окно уровня 1 создано');
    assert.ok(s.levelViews[win1.id], 'камера нового окна сохранена в levelViews');
});

test('DELETE_SELECTED: клавиша Delete удаляет выделенное окно уровня (кроме Главного холста)', () => {
    const s0 = makeLeveledState();
    s0.selectedIds = ['level-window-1'];
    const s1 = reducer(s0, { type: 'DELETE_SELECTED' });
    assert.equal(s1.levelWindows['win1'], undefined, 'окно уровня 1 удалено по Delete');
    assert.equal(s1.levelWindows['win2'].levelIndex, 1, 'уровни ниже поднялись');
    assert.equal(s1.nodes.nodeB, undefined, 'содержимое уровня удалено');

    const s2 = makeLeveledState();
    s2.selectedIds = ['level-window-0'];
    const s3 = reducer(s2, { type: 'DELETE_SELECTED' });
    assert.equal(s3, s2, 'Главный холст по Delete не удаляется (no-op)');
});

test('SET_LEVEL_FOCUS: клик в окно уровня делает его активным для создания элементов', () => {
    const s0 = makeLeveledState();
    assert.equal(s0.activeLevelIndex, 0);

    // Простой клик по пустому месту окна уровня 2 (как в LevelWindow.handleMouseDownViewport)
    const s1 = reducer(s0, { type: 'SET_LEVEL_FOCUS', payload: { levelIndex: 2 } });
    assert.equal(s1.activeLevelIndex, 2, 'уровень стал активным');
    assert.deepEqual(HierarchyUtils.toFocusList(s1.levelFocusParentId[2]), ['nodeB'], 'фокус ветки НЕ сброшен простым кликом');

    // Явная передача фокуса работает как раньше
    const s2 = reducer(s1, { type: 'SET_LEVEL_FOCUS', payload: { levelIndex: 2, focusParentId: null } });
    assert.deepEqual(s2.levelFocusParentId[2], [], 'явный сброс фокуса ветки (пустой набор)');
    const s3 = reducer(s2, { type: 'SET_LEVEL_FOCUS', payload: { levelIndex: 2, focusParentId: 'nodeA' } });
    assert.deepEqual(s3.levelFocusParentId[2], ['nodeA'], 'явная установка фокуса ветки (набор из одного)');

    // Клик в Главный холст возвращает активность уровню 0
    const s4 = reducer(s3, { type: 'SET_LEVEL_FOCUS', payload: { levelIndex: 0 } });
    assert.equal(s4.activeLevelIndex, 0);
});

// ============================================================
// Изоляция веток («глаз»): глобальный на уровне 0, локальные на уровнях >= 1
// ============================================================

// Два корневых дерева: R1 -> c1a,c1b -> g1 (внук от c1a); R2 -> c2a -> g2
const makeTwoTreesState = () => ({
    ...defaultState,
    nodes: {
        R1: { id: 'R1', name: 'R1', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' },
        R2: { id: 'R2', name: 'R2', position: { x: 300, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' },
        c1a: { id: 'c1a', name: 'c1a', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root', ownerId: 'R1' },
        c1b: { id: 'c1b', name: 'c1b', position: { x: 250, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root', ownerId: 'R1' },
        c2a: { id: 'c2a', name: 'c2a', position: { x: 500, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root', ownerId: 'R2' },
        g1: { id: 'g1', name: 'g1', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root', ownerId: 'c1a' },
        g2: { id: 'g2', name: 'g2', position: { x: 300, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root', ownerId: 'c2a' }
    },
    levelWindows: {
        'lvlwin-root': { id: 'lvlwin-root', levelIndex: 0, name: 'Главный холст', position: { x: 0, y: 0 }, size: { w: 1000, h: 700 } },
        'w1': { id: 'w1', levelIndex: 1, name: 'Уровень 1', position: { x: 0, y: 780 }, size: { w: 1000, h: 700 } },
        'w2': { id: 'w2', levelIndex: 2, name: 'Уровень 2', position: { x: 0, y: 1560 }, size: { w: 1000, h: 700 } }
    },
    levelViews: {
        'lvlwin-root': { innerOffset: { x: 0, y: 0 }, innerZoom: 1, isCollapsed: false },
        'w1': { innerOffset: { x: 0, y: 0 }, innerZoom: 1, isCollapsed: false },
        'w2': { innerOffset: { x: 0, y: 0 }, innerZoom: 1, isCollapsed: false }
    }
});

test('Выделение обновляет фокус-наборы: уровень 0 — сами корни, уровень N — владельцы детей', () => {
    let s = makeTwoTreesState();
    s = reducer(s, { type: 'SET_SELECTED', payload: 'R1' });
    assert.deepEqual(s.levelFocusParentId[0], ['R1']);

    s = reducer(s, { type: 'SET_MULTI_SELECTED', payload: ['R1', 'R2'] });
    assert.deepEqual([...s.levelFocusParentId[0]].sort(), ['R1', 'R2'], 'мульти-выделение корней');

    s = reducer(s, { type: 'SET_SELECTED', payload: 'c1a' });
    assert.deepEqual(s.levelFocusParentId[1], ['R1'], 'фокус уровня 1 — владелец выделенного ребёнка');
    assert.deepEqual([...s.levelFocusParentId[0]].sort(), ['R1', 'R2'], 'набор уровня 0 не тронут выделением на уровне 1');

    s = reducer(s, { type: 'SET_MULTI_SELECTED', payload: ['c1a', 'c2a'] });
    assert.deepEqual([...s.levelFocusParentId[1]].sort(), ['R1', 'R2'], 'два ребёнка с разными родителями — две ветки');

    // Снятие выделения фокус не сбрасывает — ветка «прилипает»
    s = reducer(s, { type: 'SET_SELECTED', payload: null });
    assert.deepEqual([...s.levelFocusParentId[1]].sort(), ['R1', 'R2']);
});

test('isEntityVisible: локальный глаз уровня режет по владельцу, уровень 0 не трогает', () => {
    let s = makeTwoTreesState();
    s = reducer(s, { type: 'SET_SELECTED', payload: 'c1a' });          // фокус L1 = [R1]
    s = reducer(s, { type: 'TOGGLE_LEVEL_NEIGHBORS', payload: { levelIndex: 1 } });

    assert.equal(HierarchyUtils.isEntityVisible('c1a', s), true, 'выделенный виден');
    assert.equal(HierarchyUtils.isEntityVisible('c1b', s), true, 'брат той же ветки виден');
    assert.equal(HierarchyUtils.isEntityVisible('c2a', s), false, 'ребёнок чужого родителя скрыт');
    assert.equal(HierarchyUtils.isEntityVisible('R2', s), true, 'уровень 0 локальным глазом не фильтруется');
    assert.equal(HierarchyUtils.isEntityVisible('g2', s), true, 'глаз уровня 1 не влияет на уровень 2');
});

test('isEntityVisible: глобальный глаз уровня 0 просвечивает ветки на всех уровнях и игнорирует локальные', () => {
    let s = makeTwoTreesState();
    // Локальный глаз уровня 1 настроен на ветку R2
    s = reducer(s, { type: 'SET_SELECTED', payload: 'c2a' });          // фокус L1 = [R2]
    s = reducer(s, { type: 'TOGGLE_LEVEL_NEIGHBORS', payload: { levelIndex: 1 } });
    // Глобальный глаз: выделен корень R1
    s = reducer(s, { type: 'SET_SELECTED', payload: 'R1' });           // фокус L0 = [R1]
    s = reducer(s, { type: 'TOGGLE_LEVEL_NEIGHBORS', payload: { levelIndex: 0 } });

    // Глобальный приоритет: видна ВСЯ ветка R1 на всех уровнях, чужое скрыто,
    // локальный глаз уровня 1 (настроенный на R2!) игнорируется
    assert.equal(HierarchyUtils.isEntityVisible('R1', s), true);
    assert.equal(HierarchyUtils.isEntityVisible('c1a', s), true, 'ребёнок R1 виден вопреки локальному глазу L1=R2');
    assert.equal(HierarchyUtils.isEntityVisible('c1b', s), true);
    assert.equal(HierarchyUtils.isEntityVisible('g1', s), true, 'внук R1 виден на уровне 2');
    assert.equal(HierarchyUtils.isEntityVisible('R2', s), false, 'чужой корень скрыт');
    assert.equal(HierarchyUtils.isEntityVisible('c2a', s), false);
    assert.equal(HierarchyUtils.isEntityVisible('g2', s), false);

    // Выключили глобальный глаз — уровни вернулись к локальным настройкам
    s = reducer(s, { type: 'TOGGLE_LEVEL_NEIGHBORS', payload: { levelIndex: 0 } });
    assert.equal(HierarchyUtils.isEntityVisible('R2', s), true, 'уровень 0 снова показывает всех');
    assert.equal(HierarchyUtils.isEntityVisible('c2a', s), true, 'локальный глаз L1 (ветка R2) снова действует');
    assert.equal(HierarchyUtils.isEntityVisible('c1a', s), false, 'чужая для локального фокуса ветка снова скрыта');
});

test('isEntityVisible: глобальный глаз с двумя выделенными корнями показывает оба поддерева', () => {
    let s = makeTwoTreesState();
    s = reducer(s, { type: 'SET_MULTI_SELECTED', payload: ['R1', 'R2'] });
    s = reducer(s, { type: 'TOGGLE_LEVEL_NEIGHBORS', payload: { levelIndex: 0 } });
    ['R1', 'R2', 'c1a', 'c1b', 'c2a', 'g1', 'g2'].forEach(id => {
        assert.equal(HierarchyUtils.isEntityVisible(id, s), true, id + ' виден');
    });
});

test('Легаси-формат: строковый levelFocusParentId читается как набор из одного', () => {
    let s = makeTwoTreesState();
    s.levelFocusParentId = { 1: 'R1' }; // старый формат — строка
    s.levelHideNeighbors = { 1: true };
    assert.equal(HierarchyUtils.isEntityVisible('c1a', s), true);
    assert.equal(HierarchyUtils.isEntityVisible('c2a', s), false);
});

// ============================================================
// Subset-правило фокуса и контекст создания (getAddContext)
// ============================================================

test('Subset-правило: при включённом глазе выделение видимой ветки не сужает набор', () => {
    let s = makeTwoTreesState();
    s = reducer(s, { type: 'SET_MULTI_SELECTED', payload: ['c1a', 'c2a'] }); // фокус L1 = [R1, R2]
    s = reducer(s, { type: 'TOGGLE_LEVEL_NEIGHBORS', payload: { levelIndex: 1 } });

    // Клик по конкретному узлу видимой ветки — обзор стабилен
    s = reducer(s, { type: 'SET_SELECTED', payload: 'c1a' });
    assert.deepEqual([...HierarchyUtils.toFocusList(s.levelFocusParentId[1])].sort(), ['R1', 'R2'],
        'обе ветки остались видимыми');

    // Глаз выключен — выделение снова переписывает набор
    s = reducer(s, { type: 'TOGGLE_LEVEL_NEIGHBORS', payload: { levelIndex: 1 } });
    s = reducer(s, { type: 'SET_SELECTED', payload: 'c1a' });
    assert.deepEqual(HierarchyUtils.toFocusList(s.levelFocusParentId[1]), ['R1'],
        'без глаза набор следует за выделением');
});

test('Subset-правило: выделение вне видимых веток переписывает набор', () => {
    let s = makeTwoTreesState();
    s = reducer(s, { type: 'SET_SELECTED', payload: 'c1a' });            // фокус L1 = [R1]
    s = reducer(s, { type: 'TOGGLE_LEVEL_NEIGHBORS', payload: { levelIndex: 1 } });
    // Выделяем ребёнка скрытой ветки (например, через аутлайнер)
    s = reducer(s, { type: 'SET_SELECTED', payload: 'c2a' });
    assert.deepEqual(HierarchyUtils.toFocusList(s.levelFocusParentId[1]), ['R2'],
        'набор переключился на новую ветку');
});

test('getAddContext: массовое выделение — кнопки добавления недоступны', () => {
    let s = makeTwoTreesState();
    s = reducer(s, { type: 'SET_MULTI_SELECTED', payload: ['c1a', 'c2a'] });
    const ctx = HierarchyUtils.getAddContext(s);
    assert.equal(ctx.ok, false);
    assert.equal(ctx.reason, 'multi-select');
});

test('getAddContext: один выделенный узел — брат (владелец узла)', () => {
    let s = makeTwoTreesState();
    s = reducer(s, { type: 'SET_SELECTED', payload: 'c2a' });
    const ctx = HierarchyUtils.getAddContext(s);
    assert.deepEqual({ ok: ctx.ok, parentId: ctx.parentId, levelIndex: ctx.levelIndex },
        { ok: true, parentId: 'R2', levelIndex: 1 });
});

test('getAddContext: без выделения при многовладельческом фокусе уровня — недоступно', () => {
    let s = makeTwoTreesState();
    s = reducer(s, { type: 'SET_MULTI_SELECTED', payload: ['c1a', 'c2a'] }); // фокус L1 = [R1, R2]
    s = reducer(s, { type: 'SET_SELECTED', payload: null });                 // выделение снято, фокус остался
    s = { ...s, activeLevelIndex: 1 };
    const ctx = HierarchyUtils.getAddContext(s);
    assert.equal(ctx.ok, false);
    assert.equal(ctx.reason, 'ambiguous-branch');
});

test('getAddContext: единственный фокус-владелец уровня — цель определена', () => {
    let s = makeTwoTreesState();
    s = reducer(s, { type: 'SET_SELECTED', payload: 'c1b' });  // фокус L1 = [R1]
    s = reducer(s, { type: 'SET_SELECTED', payload: null });
    s = { ...s, activeLevelIndex: 1 };
    const ctx = HierarchyUtils.getAddContext(s);
    assert.deepEqual({ ok: ctx.ok, parentId: ctx.parentId, levelIndex: ctx.levelIndex },
        { ok: true, parentId: 'R1', levelIndex: 1 });
});

test('getAddContext: уровень 0 всегда однозначен (root)', () => {
    let s = makeTwoTreesState();
    s = reducer(s, { type: 'SET_SELECTED', payload: 'R1' });
    const one = HierarchyUtils.getAddContext(s);
    assert.deepEqual({ ok: one.ok, parentId: one.parentId, levelIndex: one.levelIndex },
        { ok: true, parentId: 'root', levelIndex: 0 });
    s = reducer(s, { type: 'SET_SELECTED', payload: null });
    s = { ...s, activeLevelIndex: 0 };
    const none = HierarchyUtils.getAddContext(s);
    assert.deepEqual({ ok: none.ok, parentId: none.parentId }, { ok: true, parentId: 'root' });
});

test('UPDATE_PROXY_PORT + getProxyPortsForWindow: прокси скользит по рамке окна (Shift+драг)', () => {
    let s = makeTwoTreesState();
    s.ports = {
        pR1: { id: 'pR1', nodeId: 'R1', type: 'output', edge: 'right', position: 0.5 },
        pc1a: { id: 'pc1a', nodeId: 'c1a', type: 'input', edge: 'left', position: 0.5 }
    };
    s.links = { lx: { id: 'lx', sourcePortId: 'pR1', targetPortId: 'pc1a' } };

    // Авторасстановка: связь с уровнем 0 — прокси на верхней грани окна L1
    let proxies = HierarchyUtils.getProxyPortsForWindow(1, s);
    assert.equal(proxies.length, 1);
    assert.equal(proxies[0].edge, 'top');

    // Ручное перемещение на правую грань
    const winId = Object.values(s.levelWindows).find(w => w.levelIndex === 1).id;
    const before = s.past.length;
    s = reducer(s, { type: 'UPDATE_PROXY_PORT', payload: { linkId: 'lx', windowId: winId, edge: 'right', fraction: 0.5, skipHistory: true } });
    assert.equal(s.past.length, before, 'skipHistory не пишет историю');
    assert.deepEqual(s.links.lx.proxyOverrides[winId], { edge: 'right', fraction: 0.5 });

    proxies = HierarchyUtils.getProxyPortsForWindow(1, s);
    assert.equal(proxies.length, 1);
    assert.equal(proxies[0].edge, 'right', 'оверрайд применён');
    const win = s.levelWindows[winId];
    assert.ok(Math.abs(proxies[0].framePos.x - win.size.w) < 1e-6, 'прокси на правой грани окна');

    // Доля клампится в [0.03, 0.97]
    s = reducer(s, { type: 'UPDATE_PROXY_PORT', payload: { linkId: 'lx', windowId: winId, edge: 'bottom', fraction: 1.7 } });
    assert.equal(s.links.lx.proxyOverrides[winId].fraction, 0.97);

    // Некорректная грань — no-op
    const sSame = reducer(s, { type: 'UPDATE_PROXY_PORT', payload: { linkId: 'lx', windowId: winId, edge: 'diagonal', fraction: 0.5 } });
    assert.equal(sSame, s);
});

test('REMOVE_LEVEL_WINDOW: ручные позиции прокси удалённого окна вычищаются из связей', () => {
    let s = makeTwoTreesState();
    s.ports = {
        pR1: { id: 'pR1', nodeId: 'R1', type: 'output', edge: 'right', position: 0.5 },
        pg1: { id: 'pg1', nodeId: 'g1', type: 'input', edge: 'left', position: 0.5 }
    };
    // Связь уровня 0 с уровнем 2: переживает удаление уровня 1
    s.links = { lx: { id: 'lx', sourcePortId: 'pR1', targetPortId: 'pg1' } };
    s = reducer(s, { type: 'UPDATE_PROXY_PORT', payload: { linkId: 'lx', windowId: 'w1', edge: 'left', fraction: 0.4 } });
    s = reducer(s, { type: 'UPDATE_PROXY_PORT', payload: { linkId: 'lx', windowId: 'w2', edge: 'right', fraction: 0.6 } });

    s = reducer(s, { type: 'REMOVE_LEVEL_WINDOW', payload: { index: 1 } });
    assert.ok(s.links.lx, 'связь 0<->2 пережила удаление уровня 1');
    assert.equal(s.links.lx.proxyOverrides['w1'], undefined, 'оверрайд удалённого окна вычищен');
    assert.deepEqual(s.links.lx.proxyOverrides['w2'], { edge: 'right', fraction: 0.6 }, 'оверрайд выжившего окна сохранён');
});

test('REPARENT_ENTITY: слой принадлежит уровню — вложение узла в слой чужого уровня отклоняется', () => {
    const s0 = makeTwoTreesState();
    s0.layers = { LayL0: { id: 'LayL0', name: 'Слой L0', position: { x: 500, y: 300 }, size: { w: 400, h: 300 }, parentId: 'root' } };

    // Узел уровня 1 в слой уровня 0 — отклонено (состояние не изменилось)
    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'c1a', newParentId: 'LayL0' } });
    assert.equal(s1, s0, 'кросс-уровневое вложение в слой — no-op');

    // Узел уровня 0 в слой уровня 0 — работает
    const s2 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'R1', newParentId: 'LayL0' } });
    assert.equal(s2.nodes.R1.parentId, 'LayL0', 'вложение в слой своего уровня работает');
    assert.equal(HierarchyUtils.getEntityLevel('R1', s2.nodes, s2.layers), 0, 'уровень узла не изменился');
    assert.equal(HierarchyUtils.getEntityLevel('c1a', s2.nodes, s2.layers), 1, 'дети не затронуты');
});

// ============================================================
// TRANSFER_NODE: перенос узлов между уровнями и группировка в слои
// ============================================================

// Сетап из обсуждения: А, Б, слой Х0 (уровень 0); А1, Б1 (уровень 1);
// А2, Б2, слой Х2 в ветке Б1 (уровень 2)
const makeTransferState = () => ({
    ...defaultState,
    nodes: {
        A:  { id: 'A',  name: 'А',  position: { x: 0, y: 0 },     size: { w: 200, h: 100 }, parentId: 'root' },
        B:  { id: 'B',  name: 'Б',  position: { x: 300, y: 0 },   size: { w: 200, h: 100 }, parentId: 'root' },
        A1: { id: 'A1', name: 'А1', position: { x: 0, y: 0 },     size: { w: 200, h: 100 }, parentId: 'root', ownerId: 'A' },
        B1: { id: 'B1', name: 'Б1', position: { x: 300, y: 0 },   size: { w: 200, h: 100 }, parentId: 'root', ownerId: 'B' },
        A2: { id: 'A2', name: 'А2', position: { x: 0, y: 0 },     size: { w: 200, h: 100 }, parentId: 'root', ownerId: 'A1' },
        B2: { id: 'B2', name: 'Б2', position: { x: 300, y: 0 },   size: { w: 200, h: 100 }, parentId: 'root', ownerId: 'B1' }
    },
    layers: {
        X0: { id: 'X0', name: 'Х0', position: { x: 600, y: 200 }, size: { w: 500, h: 400 }, parentId: 'root' },
        X2: { id: 'X2', name: 'Х2', position: { x: 600, y: 200 }, size: { w: 500, h: 400 }, parentId: 'root', ownerId: 'B1' }
    },
    levelWindows: {
        'lvlwin-root': { id: 'lvlwin-root', levelIndex: 0, name: 'Главный холст', position: { x: 0, y: 0 }, size: { w: 1000, h: 700 } },
        'tw1': { id: 'tw1', levelIndex: 1, name: 'Уровень 1', position: { x: 0, y: 780 }, size: { w: 1000, h: 700 } },
        'tw2': { id: 'tw2', levelIndex: 2, name: 'Уровень 2', position: { x: 0, y: 1560 }, size: { w: 1000, h: 700 } }
    },
    levelViews: {
        'lvlwin-root': { innerOffset: { x: 0, y: 0 }, innerZoom: 1, isCollapsed: false },
        'tw1': { innerOffset: { x: 0, y: 0 }, innerZoom: 1, isCollapsed: false },
        'tw2': { innerOffset: { x: 0, y: 0 }, innerZoom: 1, isCollapsed: false }
    }
});

const lvl = (s, id) => HierarchyUtils.getEntityLevel(id, s.nodes, s.layers);

test('TRANSFER_NODE, сценарий «А2+Б2 → Х2»: группировка в пределах уровня, родство неприкосновенно', () => {
    let s = makeTransferState();
    s = reducer(s, { type: 'TRANSFER_NODE', payload: { ids: ['A2', 'B2'], targetLayerId: 'X2' } });

    assert.equal(s.nodes.A2.parentId, 'X2');
    assert.equal(s.nodes.B2.parentId, 'X2');
    assert.equal(s.nodes.A2.ownerId, 'A1', 'родство А2 не изменилось');
    assert.equal(s.nodes.B2.ownerId, 'B1', 'родство Б2 не изменилось');
    assert.equal(lvl(s, 'A2'), 2, 'уровень не изменился');
    assert.equal(lvl(s, 'B2'), 2);
});

test('TRANSFER_NODE, сценарий «А1 → Х2»: перенос вниз, усыновляет ветка слоя, поддерево едет само', () => {
    let s = makeTransferState();
    s = reducer(s, { type: 'TRANSFER_NODE', payload: { id: 'A1', targetLayerId: 'X2' } });

    assert.equal(s.nodes.A1.parentId, 'X2');
    assert.equal(s.nodes.A1.ownerId, 'B1', 'усыновлён владельцем ветки слоя Х2');
    assert.equal(lvl(s, 'A1'), 2, 'А1 теперь на уровне 2');
    assert.equal(s.nodes.A2.ownerId, 'A1', 'А2 остался ребёнком А1');
    assert.equal(lvl(s, 'A2'), 3, 'поддерево сдвинулось: А2 на уровне 3');
    const hasL3 = Object.values(s.levelWindows).some(w => w.levelIndex === 3);
    assert.ok(hasL3, 'окно уровня 3 создано автоматически');

    // «Родители не удаляются»: удаление бывшего родителя А не трогает А1
    const s2 = reducer(s, { type: 'REMOVE_NODE', payload: 'A' });
    assert.equal(s2.nodes.A, undefined);
    assert.ok(s2.nodes.A1, 'А1 пережил удаление бывшего родителя');
});

test('TRANSFER_NODE, сценарий «А1 → Х0»: перенос в корень, родителя больше нет', () => {
    let s = makeTransferState();
    // Кладём Б1 туда, где окажется А2 (проверка расталкивания)
    s.nodes.B1.position = { x: 0, y: 0 };
    s = reducer(s, { type: 'TRANSFER_NODE', payload: { id: 'A1', targetLayerId: 'X0' } });

    assert.equal(s.nodes.A1.parentId, 'X0');
    assert.equal(s.nodes.A1.ownerId, null, 'А1 стал корневым');
    assert.equal(lvl(s, 'A1'), 0);
    assert.equal(s.nodes.A2.ownerId, 'A1', 'А2 остался ребёнком');
    assert.equal(lvl(s, 'A2'), 1, 'А2 поднялся на уровень 1');

    // Расталкивание: А2 наложился бы на Б1 — сдвинут вправо от занятых
    assert.ok(s.nodes.A2.position.x > s.nodes.B1.position.x + 200,
        'потомок расталкнут от местных узлов нового холста');

    // Прежний родитель А цел и невредим, связь родства разорвана
    assert.ok(s.nodes.A);
    const s2 = reducer(s, { type: 'REMOVE_NODE', payload: 'A' });
    assert.ok(s2.nodes.A1, 'удаление А больше не каскадится на А1');
});

test('TRANSFER_NODE: узел, вложенный в переносимый слой через parentId (не ownerId), не раздвигается при переносе слоя на уровень с занятыми местами', () => {
    let s = makeTransferState();
    // Слой L0 на уровне 0, с узлом NL0 внутри — назначен на слой через
    // parentId (координатная группировка, как через поповер «Назначить на
    // слой»), БЕЗ ownerId — не настоящий потомок-по-владению
    s.layers.L0 = { id: 'L0', name: 'Слой L0', position: { x: 0, y: 0 }, size: { w: 400, h: 300 }, parentId: 'root' };
    s.nodes.NL0 = { id: 'NL0', name: 'Узел в L0', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'L0' };

    // Переносим сам слой L0 на уровень 2 (в слой Х2), где на холсте уровня 2
    // уже стоят А2/Б2 ровно там, где лежит «сырая» позиция NL0 — при старом
    // баге (hasAncestorIn вместо ownerId-проверки) это ловилось бы как
    // наложение и NL0 сдвигали бы вправо, хотя его позиция локальна для L0
    s = reducer(s, { type: 'TRANSFER_NODE', payload: { id: 'L0', targetLayerId: 'X2' } });

    assert.equal(s.nodes.NL0.parentId, 'L0', 'узел остался назначен на тот же слой');
    assert.ok(!s.nodes.NL0.ownerId, 'узел по-прежнему без владельца (чистая координатная группировка)');
    assert.deepEqual(s.nodes.NL0.position, { x: 0, y: 0 },
        'локальная позиция узла внутри слоя не тронута переносом слоя (не должна расталкиваться как будто это холст)');
});

test('TRANSFER_NODE: слой собственной ветки — «спуск к детям» (узел и дети — братья-сироты)', () => {
    let s = makeTransferState();
    // Слой в ветке самого А1 (слой его детей, уровень 2)
    s.layers.XA1 = { id: 'XA1', name: 'Слой ветки А1', position: { x: 0, y: 0 }, size: { w: 400, h: 300 }, parentId: 'root', ownerId: 'A1' };
    s = reducer(s, { type: 'TRANSFER_NODE', payload: { id: 'A1', targetLayerId: 'XA1' } });

    // А1 спустился сиротой в слой своих детей
    assert.equal(s.nodes.A1.parentId, 'XA1');
    assert.equal(s.nodes.A1.ownerId, null, 'А1 — сирота');
    assert.equal(lvl(s, 'A1'), 2, 'А1 на уровне слоя');
    // Слой сам заякорился (владел им А1, который спустился)
    assert.equal(s.layers.XA1.ownerId, null);
    assert.equal(s.layers.XA1.homeLevel, 2, 'слой заякорен на своём уровне');
    // Прямой ребёнок А2 (ровесник слоя) стал братом в этом же слое
    assert.equal(s.nodes.A2.ownerId, null, 'А2 отвязан');
    assert.equal(s.nodes.A2.parentId, 'XA1', 'А2 лёг в тот же слой');
    assert.equal(lvl(s, 'A2'), 2, 'А2 остался на уровне 2');
});

test('TRANSFER_NODE: массовое выделение переносит «только верхних»', () => {
    let s = makeTransferState();
    // Выделены родитель и его потомок: явно переносится только А1, А2 едет внутри
    s = reducer(s, { type: 'TRANSFER_NODE', payload: { ids: ['A1', 'A2'], targetLayerId: 'X0' } });

    assert.equal(s.nodes.A1.parentId, 'X0', 'верхний перенесён');
    assert.equal(s.nodes.A1.ownerId, null);
    assert.equal(s.nodes.A2.ownerId, 'A1', 'потомок остался ребёнком, а не стал братом');
    assert.notEqual(s.nodes.A2.parentId, 'X0', 'потомок не положен в слой сам');
    assert.equal(lvl(s, 'A2'), 1, 'потомок уехал вместе с предком');
});

test('TRANSFER_NODE: массовый перенос в слой ветки одного из узлов — спуск + сироты-братья', () => {
    let s = makeTransferState();
    // Слой уровня 1 в ветке А (слой его детей)
    s.layers.XA = { id: 'XA', name: 'Слой ветки А', position: { x: 0, y: 300 }, size: { w: 400, h: 300 }, parentId: 'root', ownerId: 'A' };

    // [А, Б] → слой ветки А: А спускается к детям; Б, чей усыновитель (А)
    // сам спустился, ложится рядом сиротой-братом
    s = reducer(s, { type: 'TRANSFER_NODE', payload: { ids: ['A', 'B'], targetLayerId: 'XA' } });

    assert.equal(s.nodes.A.parentId, 'XA', 'А спустился в слой');
    assert.equal(s.nodes.A.ownerId, null);
    assert.equal(lvl(s, 'A'), 1);
    assert.equal(s.nodes.A1.ownerId, null, 'ребёнок А отвязан');
    assert.equal(s.nodes.A1.parentId, 'XA', 'и лёг братом в тот же слой');
    assert.equal(lvl(s, 'A1'), 1);
    assert.equal(s.nodes.A2.ownerId, 'A1', 'внук остался ребёнком А1');
    assert.equal(lvl(s, 'A2'), 2, 'поддерево внука не изменилось');
    assert.equal(s.nodes.B.parentId, 'XA', 'Б в слое');
    assert.equal(s.nodes.B.ownerId, null, 'Б — сирота-брат (его усыновитель сам спустился)');
    assert.equal(lvl(s, 'B'), 1);
    assert.equal(s.nodes.B1.ownerId, 'B', 'дети Б поехали за ним');
    assert.equal(lvl(s, 'B1'), 2);
});

test('canTransferToLayer: слой собственной ветки — ok:true с режимом descend', () => {
    const s = makeTransferState();
    s.layers.XA = { id: 'XA', name: 'Слой ветки А', position: { x: 0, y: 300 }, size: { w: 400, h: 300 }, parentId: 'root', ownerId: 'A' };
    assert.deepEqual(HierarchyUtils.canTransferToLayer('A', 'XA', s.nodes, s.layers), { ok: true, reason: 'descend' });
    assert.equal(HierarchyUtils.canTransferToLayer('B', 'XA', s.nodes, s.layers).reason, null, 'чужому узлу — обычное усыновление');
    assert.equal(HierarchyUtils.canTransferToLayer('A2', 'X2', s.nodes, s.layers).ok, true, 'свой уровень — просто группировка');
});

// ============================================================
// homeLevel: якоря независимых веток
// ============================================================

test('homeLevel: сирота-якорь живёт на своём уровне, его дети — ниже', () => {
    const s = makeTransferState();
    s.nodes.F = { id: 'F', name: 'Свободный', position: { x: 700, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root', homeLevel: 1 };
    s.nodes.F1 = { id: 'F1', name: 'Ребёнок свободного', position: { x: 700, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root', ownerId: 'F' };
    assert.equal(lvl(s, 'F'), 1, 'якорь на уровне 1');
    assert.equal(lvl(s, 'F1'), 2, 'ребёнок якоря на уровне 2');
});

test('getAddContext: без фокусной ветки «+» создаёт сироту-якоря, а не усыновляет случайно', () => {
    let s = makeTransferState();
    s = { ...s, selectedIds: [], activeLevelIndex: 1, levelFocusParentId: {} };
    const ctx = HierarchyUtils.getAddContext(s);
    assert.deepEqual({ ok: ctx.ok, parentId: ctx.parentId, levelIndex: ctx.levelIndex, anchorLevel: ctx.anchorLevel },
        { ok: true, parentId: 'root', levelIndex: 1, anchorLevel: 1 });

    // ADD_NODE с homeLevel рождает узел на уровне 1 без родителя
    const s2 = reducer(s, { type: 'ADD_NODE', payload: { id: 'free1', name: 'Free', position: { x: 50, y: 50 }, parentId: 'root', homeLevel: 1 } });
    assert.equal(s2.nodes.free1.ownerId || null, null);
    assert.equal(lvl(s2, 'free1'), 1, 'создан на кликнутом уровне');
});

test('TRANSFER_NODE: спуск в ГЛУБОКИЙ слой собственной ветки (слой внуков)', () => {
    let s = makeTransferState();
    // Слой уровня 2 в ветке А1 (внуки А)
    s.layers.XA1 = { id: 'XA1', name: 'Слой ветки А1', position: { x: 0, y: 0 }, size: { w: 400, h: 300 }, parentId: 'root', ownerId: 'A1' };
    s = reducer(s, { type: 'TRANSFER_NODE', payload: { id: 'A', targetLayerId: 'XA1' } });

    // А спустился на два уровня — сиротой в слой внуков
    assert.equal(s.nodes.A.parentId, 'XA1');
    assert.equal(s.nodes.A.ownerId, null);
    assert.equal(lvl(s, 'A'), 2, 'А на уровне слоя внуков');
    // Прямой ребёнок А1 (не ровесник слоя) заякорился по месту
    assert.equal(s.nodes.A1.ownerId, null, 'А1 отвязан');
    assert.equal(s.nodes.A1.homeLevel, 1, 'А1 заякорен на своём уровне 1');
    assert.equal(lvl(s, 'A1'), 1, 'А1 остался на уровне 1');
    // Его поддерево нетронуто: А2 ребёнок А1, слой XA1 в ветке А1
    assert.equal(s.nodes.A2.ownerId, 'A1');
    assert.equal(lvl(s, 'A2'), 2);
    assert.equal(s.layers.XA1.ownerId, 'A1', 'слой остался в ветке А1');
    assert.equal(lvl(s, 'XA1'), 2, 'уровень слоя не изменился');
});

test('REMOVE_LEVEL_WINDOW: якоря homeLevel сдвигаются вместе с уровнями', () => {
    let s = makeTransferState();
    s.nodes.F = { id: 'F', name: 'Якорь L2', position: { x: 700, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root', homeLevel: 2 };
    s = reducer(s, { type: 'REMOVE_LEVEL_WINDOW', payload: { index: 1 } });
    assert.ok(s.nodes.F, 'якорь пережил удаление уровня 1');
    assert.equal(s.nodes.F.homeLevel, 1, 'якорь сдвинулся на уровень выше');
    assert.equal(lvl(s, 'F'), 1);
});

// ============================================================
// Drag & Drop: тумблер, клампинг, жест, перенос одним шагом Undo
// ============================================================

test('dragDropMode: выключен по умолчанию, переключается TOGGLE_UI', () => {
    assert.equal(defaultState.ui.dragDropMode, false, 'безопасный дефолт — выключен');
    const s1 = reducer(defaultState, { type: 'TOGGLE_UI', payload: 'dragDropMode' });
    assert.equal(s1.ui.dragDropMode, true);
    const s2 = reducer(s1, { type: 'TOGGLE_UI', payload: 'dragDropMode' });
    assert.equal(s2.ui.dragDropMode, false);
});

test('MOVE_SELECTED: при выключенном Drag&Drop элемент не выходит за рамку своего окна', () => {
    const s0 = {
        ...defaultState,
        nodes: { n1: { id: 'n1', name: 'N', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' } },
        levelWindows: {
            'lvlwin-root': { id: 'lvlwin-root', levelIndex: 0, name: 'Главный холст', position: { x: 0, y: 0 }, size: { w: 1000, h: 700 } }
        },
        levelViews: { 'lvlwin-root': { innerOffset: { x: 0, y: 0 }, innerZoom: 1, isCollapsed: false } },
        selectedIds: ['n1']
    };
    // Вьюпорт: 1000-4=996 на 700-40-4=656; узел 200x100 → максимум x=796, y=556
    const s1 = reducer(s0, { type: 'MOVE_SELECTED', payload: { dx: 5000, dy: 5000, skipHistory: true } });
    assert.equal(s1.nodes.n1.position.x, 796, 'x уперся в правую границу окна');
    assert.equal(s1.nodes.n1.position.y, 556, 'y уперся в нижнюю границу окна');

    // С включённым тумблером границы не мешают
    const sOn = { ...s0, ui: { ...s0.ui, dragDropMode: true } };
    const s2 = reducer(sOn, { type: 'MOVE_SELECTED', payload: { dx: 5000, dy: 5000, skipHistory: true } });
    assert.equal(s2.nodes.n1.position.x, 5000);
});

test('SET_DRAG_GESTURE / RESTORE_ENTITIES: жест хранится вне истории и откатывается без неё', () => {
    const s0 = {
        ...defaultState,
        nodes: { n1: { id: 'n1', name: 'N', position: { x: 10, y: 10 }, size: { w: 200, h: 100 }, parentId: 'root' } },
        selectedIds: ['n1'],
        ui: { ...defaultState.ui, dragDropMode: true }
    };
    const snapshotNodes = s0.nodes;
    const s1 = reducer(s0, { type: 'SET_DRAG_GESTURE', payload: { ids: ['n1'], target: { kind: 'window', id: 'lvlwin-root', valid: true } } });
    assert.ok(s1.dragGesture, 'жест записан');
    assert.equal(s1.past.length, s0.past.length, 'история не тронута');

    const s2 = reducer(s1, { type: 'MOVE_SELECTED', payload: { dx: 100, dy: 0, skipHistory: true } });
    const s3 = reducer(s2, { type: 'RESTORE_ENTITIES', payload: { nodes: snapshotNodes } });
    assert.equal(s3.nodes.n1.position.x, 10, 'позиция вернулась к срезу mousedown');
    assert.equal(s3.dragGesture, null, 'жест очищен');
    assert.equal(s3.past.length, s0.past.length, 'отмена жеста не пишет историю');
});

test('TRANSFER_NODE: historySnapshot делает весь жест одним шагом Undo', () => {
    const s0 = {
        ...defaultState,
        nodes: {
            A: { id: 'A', name: 'A', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' },
            B: { id: 'B', name: 'B', position: { x: 50, y: 50 }, size: { w: 200, h: 100 }, parentId: 'root', ownerId: 'A' }
        },
        selectedIds: ['B']
    };
    // Жест: движение мышью (без истории) + перенос на Главный холст (сиротой)
    const s1 = reducer(s0, { type: 'MOVE_SELECTED', payload: { dx: 100, dy: 0, skipHistory: true } });
    const s2 = reducer(s1, {
        type: 'TRANSFER_NODE',
        payload: {
            ids: ['B'],
            targetLevelIndex: 0,
            positionsById: { B: { x: 700, y: 300 } },
            historySnapshot: { nodes: s0.nodes, layers: s0.layers, ports: s0.ports, links: s0.links }
        }
    });
    assert.equal(s2.nodes.B.ownerId, null, 'перенос состоялся: B — сирота на Главном холсте');
    assert.deepEqual(s2.nodes.B.position, { x: 700, y: 300 }, 'позиция дропа применена');
    assert.equal(s2.past.length, s0.past.length + 1, 'ровно один шаг истории на весь жест');

    const s3 = reducer(s2, { type: 'UNDO' });
    assert.equal(s3.nodes.B.ownerId, 'A', 'Undo вернул родство');
    assert.deepEqual(s3.nodes.B.position, { x: 50, y: 50 }, 'Undo вернул позицию ДО движения мышью');
});

test('TRANSFER_NODE: newOwnerId усыновляет узел того же уровня без смены позиции', () => {
    const s0 = {
        ...defaultState,
        nodes: {
            X: { id: 'X', name: 'X', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' },
            A: { id: 'A', name: 'A', position: { x: 300, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' },
            B: { id: 'B', name: 'B', position: { x: 60, y: 60 }, size: { w: 200, h: 100 }, parentId: 'root', ownerId: 'X' }
        }
    };
    // B (уровень 1, ребёнок X) дропнут на узел A (уровень 0): целевой уровень 1 —
    // тот же, где B уже живёт → смена владельца без переезда
    const s1 = reducer(s0, { type: 'TRANSFER_NODE', payload: { ids: ['B'], targetLevelIndex: 1, newOwnerId: 'A' } });
    assert.equal(s1.nodes.B.ownerId, 'A', 'владелец сменился');
    assert.deepEqual(s1.nodes.B.position, { x: 60, y: 60 }, 'позиция не тронута');
    assert.equal(HierarchyUtils.getEntityLevel('B', s1.nodes, s1.layers), 1, 'уровень прежний');
});

test('Слои: ADD_PORT, ADD_LINK, каскадное удаление и FOCUS_CONNECTED_ELEMENTS', () => {
    let s = {
        ...defaultState,
        levelWindows: {
            'lvlwin-root': { id: 'lvlwin-root', levelIndex: 0, position: { x: 0, y: 0 }, size: { w: 1000, h: 700 } }
        },
        levelViews: {
            'lvlwin-root': { innerOffset: { x: 0, y: 0 }, innerZoom: 1, isCollapsed: false }
        },
        layers: {
            layer1: { id: 'layer1', name: 'Слой 1', parentId: 'root', position: { x: 50, y: 50 }, size: { w: 400, h: 300 } },
            layer2: { id: 'layer2', name: 'Слой 2', parentId: 'root', position: { x: 600, y: 50 }, size: { w: 400, h: 300 } }
        },
        nodes: {
            node1: { id: 'node1', name: 'Узел 1', parentId: 'layer1', position: { x: 20, y: 60 }, size: { w: 150, h: 80 } }
        },
        ports: {},
        links: {}
    };

    // 1. ADD_PORT на слои и узел
    s = reducer(s, { type: 'ADD_PORT', payload: { id: 'pLayer1', nodeId: 'layer1', edge: 'right', type: 'output', name: 'Layer1 Out' } });
    s = reducer(s, { type: 'ADD_PORT', payload: { id: 'pLayer2', nodeId: 'layer2', edge: 'left', type: 'input', name: 'Layer2 In' } });
    s = reducer(s, { type: 'ADD_PORT', payload: { id: 'pNode1', nodeId: 'node1', edge: 'right', type: 'output', name: 'Node1 Out' } });

    assert.ok(s.ports.pLayer1, 'порт на layer1 создан');
    assert.equal(s.ports.pLayer1.nodeId, 'layer1');
    assert.ok(s.ports.pLayer2, 'порт на layer2 создан');

    // 2. ADD_LINK: соединение Слой 1 ↔ Слой 2, и Узел 1 ↔ Слой 2
    s = reducer(s, { type: 'ADD_LINK', payload: { id: 'linkL1L2', sourcePortId: 'pLayer1', targetPortId: 'pLayer2' } });
    assert.ok(s.links.linkL1L2, 'связь между слоями создана');

    // 3. FOCUS_CONNECTED_ELEMENTS на layer1: должен найти соединенный layer2
    const sFocused = reducer(s, { type: 'FOCUS_CONNECTED_ELEMENTS', payload: { entityId: 'layer1' } });
    assert.ok(sFocused.focusSnapshot, 'фокус зафиксирован');

    // 4. Каскадное удаление: удаляем layer1
    s = { ...s, selectedIds: ['layer1'] };
    const sDeleted = reducer(s, { type: 'DELETE_SELECTED' });

    assert.equal(sDeleted.layers.layer1, undefined, 'layer1 удален');
    assert.equal(sDeleted.ports.pLayer1, undefined, 'порт pLayer1 каскадно удален');
    assert.equal(sDeleted.links.linkL1L2, undefined, 'связь linkL1L2 каскадно удалена');
    assert.ok(sDeleted.layers.layer2, 'layer2 остался');
    assert.ok(sDeleted.ports.pLayer2, 'порт pLayer2 остался');

    // 5. UNDO восстанавливает слой, порт и связь
    const sUndone = reducer(sDeleted, { type: 'UNDO' });
    assert.ok(sUndone.layers.layer1, 'UNDO вернул layer1');
    assert.ok(sUndone.ports.pLayer1, 'UNDO вернул pLayer1');
    assert.ok(sUndone.links.linkL1L2, 'UNDO вернул linkL1L2');
});

// ============================================================
// TRANSFER_NODE: СЛОЙ как переносимая сущность (PLAN_LAYERS_AND_CONTEXT_CREATION.md,
// 2026-08-30 — этап 3 PLAN_DRAG_AND_DROP.md). Тот же механизм, что и для узлов.
// ============================================================

test('TRANSFER_NODE: слой в слой ТОГО ЖЕ уровня — группировка parentId, родство (ownerId) не меняется', () => {
    let s = makeTransferState();
    // Y2 — ещё один слой в ветке Б1 (уровень 2, как и X2)
    s.layers.Y2 = { id: 'Y2', name: 'Y2', position: { x: 0, y: 200 }, size: { w: 200, h: 150 }, parentId: 'root', ownerId: 'B1' };
    s = reducer(s, { type: 'TRANSFER_NODE', payload: { id: 'Y2', targetLayerId: 'X2' } });

    assert.equal(s.layers.Y2.parentId, 'X2');
    assert.equal(s.layers.Y2.ownerId, 'B1', 'родство не изменилось — своего уровня группировка, не усыновление');
    assert.equal(lvl(s, 'Y2'), 2, 'уровень не изменился');
});

test('TRANSFER_NODE: слой в слой ЧУЖОГО уровня — усыновление ownerId веткой целевого слоя, каскадный ресайз предков', () => {
    let s = makeTransferState();
    // Z2 — родительский слой для X2 (та же ветка Б1), изначально впритык
    s.layers.Z2 = { id: 'Z2', name: 'Z2', position: { x: 550, y: 150 }, size: { w: 550, h: 450 }, parentId: 'root', ownerId: 'B1' };
    s.layers.X2.parentId = 'Z2';
    s = reducer(s, { type: 'TRANSFER_NODE', payload: { id: 'X0', targetLayerId: 'X2' } });

    assert.equal(s.layers.X0.parentId, 'X2');
    assert.equal(s.layers.X0.ownerId, 'B1', 'усыновлён владельцем ветки слоя X2 (кросс-перенос уровня 0 → 2)');
    assert.equal(lvl(s, 'X0'), 2);

    assert.ok(s.layers.X2.size.w >= 500 && s.layers.X2.size.h >= 400, 'X2 подрос под X0 (авторазмещение)');
    const grew = s.layers.Z2.size.w > 550 || s.layers.Z2.size.h > 450;
    assert.ok(grew, 'Z2 (родитель X2) тоже подрос — bubbleUpLayerResize сработал каскадно до корня');
});

test('TRANSFER_NODE: слой меняет ВЛАДЕЛЬЦА в пределах своего уровня (newOwnerId), позиция и холст не меняются', () => {
    let s = makeTransferState();
    // Y1 — слой уровня 1 (ребёнок А, как А1/Б1), дропнут на узел B (уровень 0):
    // целевой уровень 1 — тот же, где Y1 уже живёт → смена владельца без переезда
    s.layers.Y1 = { id: 'Y1', name: 'Y1', position: { x: 60, y: 60 }, size: { w: 200, h: 150 }, parentId: 'root', ownerId: 'A' };
    const beforePos = { ...s.layers.Y1.position };
    const beforeParent = s.layers.Y1.parentId;
    s = reducer(s, { type: 'TRANSFER_NODE', payload: { ids: ['Y1'], targetLevelIndex: 1, newOwnerId: 'B' } });

    assert.equal(s.layers.Y1.ownerId, 'B', 'владелец сменился с A на B (оба уровня 0)');
    assert.deepEqual(s.layers.Y1.position, beforePos, 'позиция не изменилась — уровень тот же, холст не меняется');
    assert.equal(s.layers.Y1.parentId, beforeParent, 'координатный контейнер не тронут');
    assert.equal(lvl(s, 'Y1'), 1, 'уровень не изменился (только родство)');
});

test('TRANSFER_NODE: попытка вложить слой в слой, лежащий ВНУТРИ него самого (parentId-цикл) — no-op', () => {
    let s = makeTransferState();
    // Вложенный слой Inner внутри X0
    s.layers.Inner = { id: 'Inner', name: 'Inner', position: { x: 10, y: 10 }, size: { w: 100, h: 80 }, parentId: 'X0' };
    const before = s;
    const after = reducer(s, { type: 'TRANSFER_NODE', payload: { id: 'X0', targetLayerId: 'Inner' } });
    assert.equal(after, before, 'реальный parentId-цикл (X0 → Inner, но Inner уже внутри X0) отклонён как no-op');
});

test('RESTORE_ENTITIES: откат Drag&Drop переноса СЛОЯ — позиция и родство возвращаются к срезу mousedown', () => {
    let s = makeTransferState();
    s = { ...s, selectedIds: ['X0'], ui: { ...s.ui, dragDropMode: true } };
    const snapshotLayers = s.layers;
    const beforePast = s.past ? s.past.length : 0;

    const gestured = reducer(s, { type: 'SET_DRAG_GESTURE', payload: { ids: ['X0'], target: { kind: 'layer', id: 'X2', valid: true } } });
    const moved = reducer(gestured, { type: 'UPDATE_LAYER', payload: { id: 'X0', updates: { position: { x: 999, y: 999 } }, skipHistory: true } });
    const restored = reducer(moved, { type: 'RESTORE_ENTITIES', payload: { nodes: s.nodes, layers: snapshotLayers } });

    assert.equal(restored.layers.X0.position.x, 600, 'X0 вернулся на исходную позицию');
    assert.equal(restored.layers.X0.parentId, 'root', 'родство/контейнер не изменились');
    assert.equal(restored.dragGesture, null, 'жест очищен');
    assert.equal((restored.past || []).length, beforePast, 'отмена жеста не создаёт запись в истории');
});
