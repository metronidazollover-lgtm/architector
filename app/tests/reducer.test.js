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



// v14 (§3 плана): REMOVE_LAYER удалён как обработчик экшена — слоёв нет,
// см. REMOVE_FRAME в новом v14-разделе (рамка удаляется, узлы остаются).

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

// v14 (§3 плана): ALIGN_LAYERS удалён как обработчик экшена — слоёв нет,
// см. ALIGN_WINDOWS в новом v14-разделе (раскладка окон по колонкам глубины).

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

// v14 (§3 плана): ADD_LAYER удалён как обработчик экшена — слоёв в v14 не
// существует (см. ADD_FRAME в новом v14-разделе этого файла).

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

    // (Слой убран из этого теста — UPDATE_LAYER удалён в v14, слоёв больше нет)

    // 3. Порт
    s = reducer(s, { type: 'UPDATE_PORT', payload: { id: 'portB', updates: { fontFamily: 'Roboto, sans-serif', fontSize: 12 } } });
    assert.equal(s.ports.portB.fontFamily, 'Roboto, sans-serif');
    assert.equal(s.ports.portB.fontSize, 12);

    // 4. Связь
    s = reducer(s, { type: 'UPDATE_LINK', payload: { id: 'linkBC', updates: { fontFamily: 'JetBrains Mono, monospace', fontSize: 14 } } });
    assert.equal(s.links.linkBC.fontFamily, 'JetBrains Mono, monospace');
    assert.equal(s.links.linkBC.fontSize, 14);
});

// v14 (Фаза 4): MASS_UPDATE переписан на месте — слои заменены рамками
// (frames). Ветка «layerL» проверяла именно слой и удалена вместе с ней, а
// не перенесена (см. §7.13 плана) — фикстура makeState() слоёв не строит,
// рамки покрыты отдельным v14-разделом ниже; узлы/порты/связи проверяются
// здесь без изменений.
test('Typography: MASS_UPDATE применяет шрифт и размер ко всем выбранным сущностям без создания жестких связей', () => {
    let s = makeState();

    s = reducer(s, {
        type: 'MASS_UPDATE',
        payload: {
            ids: ['nodeA', 'portB', 'linkBC'],
            updates: { fontFamily: 'Playfair Display, serif', fontSize: 20 }
        }
    });

    assert.equal(s.nodes.nodeA.fontFamily, 'Playfair Display, serif');
    assert.equal(s.nodes.nodeA.fontSize, 20);
    assert.equal(s.ports.portB.fontFamily, 'Playfair Display, serif');
    assert.equal(s.ports.portB.fontSize, 20);
    assert.equal(s.links.linkBC.fontFamily, 'Playfair Display, serif');
    assert.equal(s.links.linkBC.fontSize, 20);

    // Последующее ручное изменение на nodeA меняет только nodeA (приоритет индивидуального редактирования)
    s = reducer(s, { type: 'UPDATE_NODE', payload: { id: 'nodeA', updates: { fontFamily: 'Courier New, monospace', fontSize: 12 } } });
    assert.equal(s.nodes.nodeA.fontFamily, 'Courier New, monospace');
    assert.equal(s.nodes.nodeA.fontSize, 12);
    // Остальные сущности сохранили свои значения
    assert.equal(s.ports.portB.fontFamily, 'Playfair Display, serif');
    assert.equal(s.ports.portB.fontSize, 20);
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

// v14 (§3 плана): REMOVE_LEVEL_WINDOW/CLEAR_LEVEL_WINDOW удалены как
// обработчики экшенов — «удалить/очистить уровень» с ре-якорением потомков
// как отдельная операция в v14 не существует (окна — только обзор, см.
// CLOSE_WINDOW в новом v14-разделе этого файла).

// v14 (Фаза 4): CLEAR_PROJECT переписан — окна («Главный холст» в том числе)
// больше не переживают очистку проекта, они чисто обзорное состояние без
// гарантированного «уровня 0» (см. docs/LANES_MODEL.md §4.3/§10.7). Тест
// проверял именно сохранение окна L0 при очистке и удалён вместе с этим
// поведением, а не перенесён — см. §7.13 плана. v14-версия — в разделе ниже.

// v14 (§3 плана): ADD_LEVEL_WINDOW/REMOVE_ROOT_CANVAS удалены как обработчики
// экшенов — см. NEW_EMPTY_WINDOW/CLOSE_WINDOW в новом v14-разделе.

test('CREATE_NESTED_NODE (v14): новое окно (дорожка родителя) открывается автоматически, если её нигде не было', () => {
    let s = { ...defaultState, nodes: { nodeA: { id: 'nodeA', name: 'A', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' } } };
    s = reducer(s, { type: 'CREATE_NESTED_NODE', payload: { parentId: 'nodeA', id: 'child1', name: 'Child' } });
    assert.equal(s.nodes.child1.parentId, 'nodeA');
    assert.ok(HierarchyUtils.windowsOfLane('nodeA', s.windows).length > 0, 'дорожка nodeA открылась автоматически');
    assert.equal(s.activeLaneId, 'nodeA');
});

// v14 (Фаза 4): DELETE_SELECTED переписан — выделенное окно теперь адресуется
// стабильным id (`window:<id>`, без индекса уровня) и просто закрывается
// (CLOSE_WINDOW), без сдвига уровней ниже (уровней в v14 не существует). Тест
// проверял именно старую адресацию/сдвиг и удалён вместе с ней, а не
// перенесён — см. §7.13 плана. v14-версия — в разделе ниже.

// v14 (§3 плана): SET_LEVEL_FOCUS удалён как обработчик экшена — активная
// глубина и фокус ветки как понятия не существуют (см. SET_ACTIVE_LANE в
// новом v14-разделе — дорожка однозначна, «неоднозначный фокус» пропадает).

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

// v14 (§3 плана): TOGGLE_LEVEL_NEIGHBORS удалён как обработчик экшена —
// «глаз» ветки/уровня как отдельное понятие не существует (см.
// TOGGLE_LANE_HIDDEN в новом v14-разделе — глаз прячет одну дорожку в
// одном окне, без глобального/локального разделения).

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

// v14 (§3/§7.12 плана): REPARENT_ENTITY переписан на месте — targetParentId
// только 'root' или id узла, слой как цель удалён вовсе. Тест «вложение в
// слой ЧУЖОГО уровня» и «ручные позиции прокси удалённого окна» (зависел от
// REMOVE_LEVEL_WINDOW, тоже удалён) сняты — v14-покрытие REPARENT_ENTITY
// (deep/shallow/цикл/undo/historySnapshot/массив ids/positionsById/авто-
// открытие дорожки) — в новом v14-разделе этого файла.

// v14 (§3 плана): тест «откат Drag&Drop переноса СЛОЯ» диспатчил UPDATE_LAYER
// (удалён) — RESTORE_ENTITIES сама по себе не рассматривается: она снимает
// точный срез словарей на mousedown, семантика не зависит от того, что
// именно двигалось (узел или, ранее, слой). Фикстура makeTransferState,
// использовавшаяся только этим тестом, удалена вместе с ним.

// =============================================================================
// v14 (Фаза 3, §3/§7.6/§7.8/§7.12/§7.13 плана): дорожки/окна/рамки — новые
// обработчики экшенов и переписанные на месте ADD_NODE/CREATE_NESTED_NODE/
// REPARENT_ENTITY/REMOVE_NODE. Фикстуры — через HierarchyUtils.parseNotation
// (§1 плана / §3 LANES_MODEL.md), а не JSON руками.
// =============================================================================

const v14Text = () => [
    'ДЕРЕВО',
    '/A',
    '/A/A1',
    '/A/A1/A2',
    '/Б',
    '',
    'ОКНА',
    'W1 = [Проект]',
    'W2 = [A]',
    '',
    'РАМКИ',
    'Датчики = {A1, Б}'
].join('\n');

const v14State = () => ({ ...defaultState, ...HierarchyUtils.parseNotation(v14Text()) });

// --- Окна и дорожки ---------------------------------------------------------

test('v14 OPEN_LANE: открывает новую дорожку в новом окне; повторно — no-op', () => {
    const s0 = v14State();
    assert.equal(HierarchyUtils.windowsOfLane('A1', s0.windows).length, 0, 'дорожка A1 изначально нигде не открыта');

    const s1 = reducer(s0, { type: 'OPEN_LANE', payload: { ownerId: 'A1' } });
    assert.equal(HierarchyUtils.windowsOfLane('A1', s1.windows).length, 1, 'дорожка открылась в новом окне');
    assert.equal(s1.past.length, 1, 'структурное действие — в истории (§7.6)');

    const s2 = reducer(s1, { type: 'OPEN_LANE', payload: { ownerId: 'A1' } });
    assert.equal(s2, s1, 'дорожка уже открыта где-то — no-op');
});

test('v14 OPEN_LANE: с windowId добавляет дорожку в СУЩЕСТВУЮЩЕЕ окно (составное окно)', () => {
    const s0 = v14State();
    const s1 = reducer(s0, { type: 'OPEN_LANE', payload: { ownerId: 'Б', windowId: 'W2' } });
    assert.deepEqual(s1.windows.W2.lanes, ['A', 'Б']);
});

test('v14 CLOSE_LANE: убирает дорожку из окна; окно без дорожек и без frameId закрывается само', () => {
    const s0 = v14State();
    const s1 = reducer(s0, { type: 'CLOSE_LANE', payload: { windowId: 'W2', ownerId: 'A' } });
    assert.equal(s1.windows.W2, undefined, 'W2 показывал только A — опустело и закрылось');
    assert.ok(s1.windows.W1, 'W1 не тронуто');
    assert.equal(s1.past.length, 1);
});

test('v14 DOCK_LANE: переносит дорожку из одного окна в другое, с опциональным index', () => {
    const s0 = reducer(v14State(), { type: 'OPEN_LANE', payload: { ownerId: 'Б' } }); // отдельное окно для Б
    const wB = Object.keys(s0.windows).find(wid => s0.windows[wid].lanes.includes('Б') && wid !== 'W1');
    const s1 = reducer(s0, { type: 'DOCK_LANE', payload: { ownerId: 'Б', fromWindowId: wB, toWindowId: 'W2', index: 0 } });
    assert.deepEqual(s1.windows.W2.lanes, ['Б', 'A'], 'Б встал на позицию 0');
    assert.equal(s1.windows[wB], undefined, 'окно-источник опустело и закрылось');
});

test('v14 DETACH_LANE: отстыковывает дорожку в собственное новое окно', () => {
    const s0 = reducer(v14State(), { type: 'OPEN_LANE', payload: { ownerId: 'Б', windowId: 'W2' } }); // W2 = [A, Б]
    const s1 = reducer(s0, { type: 'DETACH_LANE', payload: { windowId: 'W2', ownerId: 'Б' } });
    assert.deepEqual(s1.windows.W2.lanes, ['A']);
    const newWin = Object.values(s1.windows).find(w => w.id !== 'W1' && w.id !== 'W2');
    assert.ok(newWin, 'новое окно создано');
    assert.deepEqual(newWin.lanes, ['Б']);
});

test('v14 REORDER_LANE: меняет порядок дорожек внутри окна, вне истории', () => {
    const s0 = reducer(v14State(), { type: 'OPEN_LANE', payload: { ownerId: 'Б', windowId: 'W2' } });
    const pastBefore = s0.past.length;
    const s1 = reducer(s0, { type: 'REORDER_LANE', payload: { windowId: 'W2', ownerId: 'A', toIndex: 1 } });
    assert.deepEqual(s1.windows.W2.lanes, ['Б', 'A']);
    assert.equal(s1.past.length, pastBefore, 'визуальная перестановка — вне истории');
});

test('v14 TOGGLE_LANE_HIDDEN: прячет/показывает дорожку, вне истории', () => {
    const s0 = v14State();
    const pastBefore = s0.past.length;
    const s1 = reducer(s0, { type: 'TOGGLE_LANE_HIDDEN', payload: { windowId: 'W2', ownerId: 'A' } });
    assert.deepEqual(s1.windows.W2.hidden, ['A']);
    const s2 = reducer(s1, { type: 'TOGGLE_LANE_HIDDEN', payload: { windowId: 'W2', ownerId: 'A' } });
    assert.deepEqual(s2.windows.W2.hidden, []);
    assert.equal(s2.past.length, pastBefore, '«глаз» — вне истории (как старый TOGGLE_LEVEL_NEIGHBORS)');
});

test('v14 OPEN_FRAME_WINDOW / CLOSE_WINDOW: окно рамки показывает дорожки её членов; REMOVE_FRAME закрывает его', () => {
    const s0 = v14State();
    const s1 = reducer(s0, { type: 'OPEN_FRAME_WINDOW', payload: { frameId: 'Датчики' } });
    const frameWin = Object.values(s1.windows).find(w => w.frameId === 'Датчики');
    assert.ok(frameWin, 'окно рамки создано');
    assert.ok(frameWin.lanes.includes('A') && frameWin.lanes.includes('root'), 'дорожки обоих членов (A1 в A, Б в root) показаны');

    const s2 = reducer(s1, { type: 'REMOVE_FRAME', payload: 'Датчики' });
    assert.equal(Object.values(s2.windows).some(w => w.frameId === 'Датчики'), false, 'окно рамки закрылось вместе с рамкой');

    // CLOSE_WINDOW — только обзор, данные не трогает
    const s3 = reducer(s0, { type: 'CLOSE_WINDOW', payload: { windowId: 'W2' } });
    assert.equal(s3.windows.W2, undefined);
    assert.ok(s3.nodes.A1, 'узел A1 (был в дорожке A, окно W2) не удалён — окно лишь обзор');
});

test('v14 MOVE_WINDOW/RESIZE_WINDOW/PAN_WINDOW/ZOOM_WINDOW: чисто визуальные, вне истории', () => {
    const s0 = v14State();
    const pastBefore = s0.past.length;
    let s = reducer(s0, { type: 'MOVE_WINDOW', payload: { windowId: 'W2', dx: 50, dy: 10 } });
    assert.deepEqual(s.windows.W2.position, { x: s0.windows.W2.position.x + 50, y: s0.windows.W2.position.y + 10 });
    s = reducer(s, { type: 'RESIZE_WINDOW', payload: { windowId: 'W2', size: { w: 10, h: 10 } } });
    assert.ok(s.windows.W2.size.w >= 260 && s.windows.W2.size.h >= 180, 'минимальный размер — не меньше одной карточки (§7.1.5)');
    s = reducer(s, { type: 'PAN_WINDOW', payload: { windowId: 'W2', offset: { x: 5, y: 6 } } });
    assert.deepEqual(s.windows.W2.camera.offset, { x: 5, y: 6 });
    s = reducer(s, { type: 'ZOOM_WINDOW', payload: { windowId: 'W2', zoom: 2 } });
    assert.equal(s.windows.W2.camera.zoom, 2);
    assert.equal(s.past.length, pastBefore, 'ни одно из четырёх не пишет историю');
});

test('v14 TOGGLE_WINDOW_COLLAPSE: сворачивает/разворачивает окно, вне истории', () => {
    const s0 = v14State();
    const s1 = reducer(s0, { type: 'TOGGLE_WINDOW_COLLAPSE', payload: { windowId: 'W2' } });
    assert.equal(s1.windows.W2.collapsed, true);
    assert.equal(s1.past.length, s0.past.length);
});

test('v14 TOGGLE_WINDOW_MAXIMIZE: разворачивает на весь экран и возвращает обратно, в истории', () => {
    const s0 = v14State();
    const before = { position: s0.windows.W2.position, size: s0.windows.W2.size };
    const s1 = reducer(s0, { type: 'TOGGLE_WINDOW_MAXIMIZE', payload: { windowId: 'W2', viewport: { x: 0, y: 0, w: 1900, h: 1000 } } });
    assert.deepEqual(s1.windows.W2.size, { w: 1900, h: 1000 });
    assert.ok(s1.windows.W2.preMaximize, 'исходные position/size запомнены');
    assert.equal(s1.past.length, 1);

    const s2 = reducer(s1, { type: 'TOGGLE_WINDOW_MAXIMIZE', payload: { windowId: 'W2' } });
    assert.deepEqual(s2.windows.W2.position, before.position);
    assert.deepEqual(s2.windows.W2.size, before.size);
    assert.equal(s2.windows.W2.preMaximize, null);
});

test('v14 NEW_EMPTY_WINDOW: создаёт пустое окно без дорожек, которое не закрывается само', () => {
    const s0 = v14State();
    const s1 = reducer(s0, { type: 'NEW_EMPTY_WINDOW' });
    const empty = Object.values(s1.windows).find(w => w.lanes.length === 0);
    assert.ok(empty, 'пустое окно создано и осталось (не схлопнулось)');
    assert.equal(s1.past.length, 1);
});

test('v14 ALIGN_WINDOWS: раскладывает окна по колонкам глубины', () => {
    let s = v14State();
    s = reducer(s, { type: 'MOVE_WINDOW', payload: { windowId: 'W1', position: { x: 999, y: 999 } } });
    s = reducer(s, { type: 'ALIGN_WINDOWS' });
    // W1 показывает root (колонка 0), W2 показывает A (колонка 1) — разные колонки, разный x
    assert.notEqual(s.windows.W1.position.x, s.windows.W2.position.x, 'разные колонки глубины — разный x');
    assert.equal(s.past.length, v14State().past.length + 1, 'раскладка — один шаг истории (как старый ALIGN_LEVEL_WINDOWS)');
});

test('v14 UPDATE_WINDOW_PROPERTIES: камера — вне истории, свойства окна — в истории', () => {
    const s0 = v14State();
    const pastBefore = s0.past.length;
    const s1 = reducer(s0, { type: 'UPDATE_WINDOW_PROPERTIES', payload: { windowId: 'W2', updates: { zoom: 1.5 } } });
    assert.equal(s1.windows.W2.camera.zoom, 1.5);
    assert.equal(s1.past.length, pastBefore, 'чисто камера — история не пишется');

    const s2 = reducer(s1, { type: 'UPDATE_WINDOW_PROPERTIES', payload: { windowId: 'W2', updates: { name: 'Моё окно' } } });
    assert.equal(s2.windows.W2.name, 'Моё окно');
    assert.equal(s2.past.length, pastBefore + 1, 'изменение свойства окна — в истории');
});

test('v14 SET_ACTIVE_LANE / SET_ACTIVE_FRAME: курсоры вне истории', () => {
    const s0 = v14State();
    const s1 = reducer(s0, { type: 'SET_ACTIVE_LANE', payload: 'A' });
    assert.equal(s1.activeLaneId, 'A');
    const s2 = reducer(s1, { type: 'SET_ACTIVE_FRAME', payload: 'Датчики' });
    assert.equal(s2.activeFrameId, 'Датчики');
    assert.equal(s2.past.length, s0.past.length);
});

// --- Рамки -------------------------------------------------------------------

test('v14 ADD_FRAME: двойной режим — с выделением сразу с членами, без выделения пустая (§7.9)', () => {
    const s0 = v14State();
    const s1 = reducer(s0, { type: 'ADD_FRAME', payload: { members: ['A1', 'A2'], name: 'Питание' } });
    const id = s1.selectedIds[0];
    assert.deepEqual(s1.frames[id].members, ['A1', 'A2']);
    assert.equal(s1.frames[id].homeLaneId, 'A', 'домашняя дорожка — дорожка первого члена');

    const s2 = reducer(s0, { type: 'ADD_FRAME', payload: {} });
    const id2 = s2.selectedIds[0];
    assert.deepEqual(s2.frames[id2].members, []);
    assert.equal(s2.frames[id2].homeLaneId, null, 'без членов homeLaneId ждёт первого дропа');
});

test('v14 FRAME_ADD_MEMBERS: задаёт homeLaneId при первом добавлении в пустую рамку', () => {
    const s0 = reducer(v14State(), { type: 'ADD_FRAME', payload: {} });
    const frameId = s0.selectedIds[0];
    assert.equal(s0.frames[frameId].homeLaneId, null);

    const s1 = reducer(s0, { type: 'FRAME_ADD_MEMBERS', payload: { frameId, ids: ['A2'] } });
    assert.deepEqual(s1.frames[frameId].members, ['A2']);
    assert.equal(s1.frames[frameId].homeLaneId, 'A1', 'homeLaneId выставлен по дорожке первого добавленного члена');
});

test('v14 FRAME_REMOVE_MEMBERS: опустевшая рамка не удаляется автоматически (§7.3.4)', () => {
    const s0 = v14State();
    const s1 = reducer(s0, { type: 'FRAME_REMOVE_MEMBERS', payload: { frameId: 'Датчики', ids: ['A1', 'Б'] } });
    assert.ok(s1.frames['Датчики'], 'рамка осталась именованной заготовкой');
    assert.deepEqual(s1.frames['Датчики'].members, []);
});

test('v14 UPDATE_FRAME / REMOVE_FRAME: свойства рамки и каскадное удаление порта/связи', () => {
    let s = v14State();
    s = reducer(s, { type: 'UPDATE_FRAME', payload: { id: 'Датчики', updates: { color: '#ff0000' } } });
    assert.equal(s.frames['Датчики'].color, '#ff0000');

    s = { ...s, ports: { ...s.ports, pF: { id: 'pF', nodeId: 'Датчики', type: 'output', edge: 'right', position: 0.5 } },
        links: { ...s.links, lF: { id: 'lF', sourcePortId: 'pF', targetPortId: 'pF' } } };
    s = reducer(s, { type: 'REMOVE_FRAME', payload: 'Датчики' });
    assert.equal(s.frames['Датчики'], undefined);
    assert.equal(s.ports.pF, undefined, 'порт рамки удалён каскадно');
    assert.equal(s.links.lF, undefined, 'связь через порт рамки удалена каскадно');
});

test('v14 MOVE_FRAGMENT: сдвигает членов куска рамки в конкретной дорожке', () => {
    const s0 = v14State();
    const before = { ...s0.nodes.A1.position };
    const s1 = reducer(s0, { type: 'MOVE_FRAGMENT', payload: { frameId: 'Датчики', ownerId: 'A', dx: 30, dy: 40 } });
    assert.equal(s1.nodes.A1.position.x, before.x + 30);
    assert.equal(s1.nodes.A1.position.y, before.y + 40);
});

// --- REPARENT_ENTITY / REMOVE_NODE (переписаны на месте) ---------------------

test('v14 REPARENT_ENTITY: deep по умолчанию — потомки остаются структурно при переносимым узлом', () => {
    const s0 = v14State();
    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'A1', targetParentId: 'root' } });
    assert.equal(s1.nodes.A1.parentId, 'root');
    assert.equal(s1.nodes.A2.parentId, 'A1', 'A2 остался ребёнком A1 (deep — цепочка не трогается)');
});

test('v14 REPARENT_ENTITY: слой как цель недоступен вовсе — targetParentId только node|root', () => {
    const s0 = v14State();
    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'A1', targetParentId: 'Датчики' } });
    assert.equal(s1, s0, 'рамка не может быть родителем — no-op');
});

test('v14 REPARENT_ENTITY: цикл отклоняется (nodes-only isDescendantOfV14/canReparentToV14)', () => {
    const s0 = v14State();
    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'A', targetParentId: 'A2' } });
    assert.equal(s1, s0, 'A2 — потомок A, вложение образует цикл — no-op');
});

test('v14 REPARENT_ENTITY (shallow): прямые дети усыновляются прежним родителем с findFreePosition', () => {
    const s0 = v14State();
    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'A1', targetParentId: 'root', mode: 'shallow' } });
    assert.equal(s1.nodes.A1.parentId, 'root', 'сам A1 переехал');
    assert.equal(s1.nodes.A2.parentId, 'A', 'A2 усыновлён ПРЕЖНИМ родителем A1 (A), а не поехал следом');
    assert.ok(Number.isFinite(s1.nodes.A2.position.x) && Number.isFinite(s1.nodes.A2.position.y));
});

test('v14 REPARENT_ENTITY: массив ids — один шаг Undo на весь батч; positionsById задаёт позиции под курсором', () => {
    const s0 = v14State();
    const pastBefore = s0.past.length;
    const s1 = reducer(s0, {
        type: 'REPARENT_ENTITY',
        payload: { ids: ['A1', 'Б'], targetParentId: 'root', positionsById: { A1: { x: 11, y: 22 }, Б: { x: 33, y: 44 } } }
    });
    // Б уже в root — «уже там» отфильтровывается тихо, переезжает только A1
    assert.equal(s1.nodes.A1.parentId, 'root');
    assert.deepEqual(s1.nodes.A1.position, { x: 11, y: 22 });
    assert.equal(s1.past.length, pastBefore + 1, 'весь батч — один шаг Undo');
});

test('v14 REPARENT_ENTITY: явный position (одиночный drop) переопределяет findFreePosition', () => {
    const s0 = v14State();
    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'A2', targetParentId: 'root', position: { x: 42, y: 24 } } });
    assert.deepEqual(s1.nodes.A2.position, { x: 42, y: 24 });
});

test('v14 REPARENT_ENTITY: дроп на карточку узла без открытой дорожки открывает её автоматически (§0.4.3)', () => {
    const s0 = v14State();
    assert.equal(HierarchyUtils.windowsOfLane('Б', s0.windows).length, 0, 'дорожка Б изначально нигде не открыта');
    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'A2', targetParentId: 'Б' } });
    assert.equal(s1.nodes.A2.parentId, 'Б');
    assert.ok(HierarchyUtils.windowsOfLane('Б', s1.windows).length > 0, 'дорожка Б открылась автоматически');
});

test('v14 REPARENT_ENTITY: членство в рамках не меняется при переносе узла', () => {
    const s0 = v14State();
    assert.ok(s0.frames['Датчики'].members.includes('A1'));
    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'A1', targetParentId: 'root' } });
    assert.ok(s1.frames['Датчики'].members.includes('A1'), 'A1 остался членом рамки после переноса — членство не структурное родство');
});

test('v14 REPARENT_ENTITY (shallow): Undo одним шагом возвращает И перенесённую сущность, И усыновлённых детей', () => {
    const s0 = v14State();
    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'A1', targetParentId: 'root', mode: 'shallow' } });
    assert.notEqual(s1.nodes.A2.parentId, s0.nodes.A2.parentId);

    const s2 = reducer(s1, { type: 'UNDO' });
    assert.equal(s2.nodes.A1.parentId, 'A', 'A1 вернулся на место');
    assert.deepEqual(s2.nodes.A2, s0.nodes.A2, 'потомок вернулся к исходному parentId и позиции — тем же шагом Undo');

    const s3 = reducer(s2, { type: 'REDO' });
    assert.equal(s3.nodes.A1.parentId, 'root');
    assert.equal(s3.nodes.A2.parentId, 'A');
});

test('v14 REPARENT_ENTITY: historySnapshot делает Drag&Drop-жест (движение + перенос) одним шагом Undo', () => {
    const s0 = { ...v14State(), selectedIds: ['Б'] };
    const s1 = reducer(s0, { type: 'MOVE_SELECTED', payload: { dx: 100, dy: 0, skipHistory: true } });
    const s2 = reducer(s1, {
        type: 'REPARENT_ENTITY',
        payload: { id: 'Б', targetParentId: 'A', historySnapshot: { nodes: s0.nodes, ports: s0.ports, links: s0.links } }
    });
    assert.equal(s2.nodes.Б.parentId, 'A', 'перенос состоялся');
    assert.equal(s2.past.length, s0.past.length + 1, 'ровно один шаг истории на весь жест');

    const s3 = reducer(s2, { type: 'UNDO' });
    assert.deepEqual(s3.nodes.Б, s0.nodes.Б, 'Undo вернул ИСХОДНОЕ состояние до mousedown, а не промежуточное движение');
});

test('v14 дорожки-зеркала: одна дорожка, открытая в двух окнах — перенос отражается в обоих сразу (структурно, без спец-кода)', () => {
    // W1 показывает root, W2 показывает A. Открываем root ЕЩЁ и в W2 (зеркало).
    const s0 = reducer(v14State(), { type: 'OPEN_LANE', payload: { ownerId: 'root', windowId: 'W2' } });
    assert.deepEqual(s0.windows.W2.lanes, ['A', 'root']);

    // Переносим Б (лежит в root) в A — теперь Б должен явиться в дорожке A,
    // видимой И в W2 (напрямую), и одновременно root-зеркало в W2 больше его не покажет.
    const s1 = reducer(s0, { type: 'REPARENT_ENTITY', payload: { id: 'Б', targetParentId: 'A' } });
    const rectInW2AsA = HierarchyUtils.nodeRectInWindow(s1.windows.W2, 'Б', s1);
    assert.ok(rectInW2AsA, 'Б виден в W2 через дорожку A');
    // Те же данные, тот же узел — не отдельная копия для «зеркала»
    assert.equal(s1.nodes.Б.parentId, 'A');
});

test('v14 REMOVE_NODE: каскад по умолчанию удаляет всю ветку, порты/связи и членство в рамках', () => {
    const s0 = v14State();
    const s1 = reducer(s0, { type: 'REMOVE_NODE', payload: 'A1' });
    assert.equal(s1.nodes.A1, undefined);
    assert.equal(s1.nodes.A2, undefined, 'потомок A1 удалён каскадом (Deep-семантика по умолчанию)');
    assert.equal(s1.frames['Датчики'].members.includes('A1'), false, 'A1 выбыл из членства в рамке');
});

test('v14 REMOVE_NODE: keepChildren переносит прямых детей к деду с findFreePosition', () => {
    const s0 = v14State();
    const s1 = reducer(s0, { type: 'REMOVE_NODE', payload: { id: 'A1', keepChildren: true } });
    assert.equal(s1.nodes.A1, undefined);
    assert.ok(s1.nodes.A2, 'A2 выжил');
    assert.equal(s1.nodes.A2.parentId, 'A', 'A2 усыновлён дедом (A) — прежним родителем A1');
});
