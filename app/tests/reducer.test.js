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
    links: [
        { id: 'linkBC', sourcePortId: 'portB', targetPortId: 'portC' }
    ]
});

test('DIVE_INTO: сохраняет камеру покидаемого контекста и пишет историю', () => {
    const s0 = makeState();
    const s1 = reducer(s0, { type: 'DIVE_INTO', payload: { id: 'nodeA', name: 'A' } });

    assert.equal(s1.currentContext, 'nodeA');
    assert.deepEqual(s1.breadcrumbs.map(b => b.id), ['root', 'nodeA']);
    assert.deepEqual(s1.cameraByContext.root, { offset: { x: 100, y: 200 }, zoom: 0.8 });
    assert.equal(s1.navHistory.past.length, 1);
    assert.equal(s1.navHistory.past[0].id, 'root');
    assert.deepEqual(s1.selectedIds, []);
});

test('DIVE_INTO: повторный вход восстанавливает сохранённую камеру уровня', () => {
    const s0 = makeState();
    s0.cameraByContext = { nodeA: { offset: { x: -5, y: -7 }, zoom: 2.5 } };
    const s1 = reducer(s0, { type: 'DIVE_INTO', payload: { id: 'nodeA', name: 'A' } });
    assert.deepEqual(s1.canvas, { offset: { x: -5, y: -7 }, zoom: 2.5 });
});

test('NAVIGATE_TO: выход восстанавливает камеру уровня, без неё — сброс', () => {
    const s0 = makeState();
    const s1 = reducer(s0, { type: 'DIVE_INTO', payload: { id: 'nodeA', name: 'A' } });
    const s2 = reducer(s1, { type: 'NAVIGATE_TO', payload: 0 });
    assert.equal(s2.currentContext, 'root');
    assert.deepEqual(s2.canvas, { offset: { x: 100, y: 200 }, zoom: 0.8 });

    const noCam = { ...s1, cameraByContext: {} };
    const s3 = reducer(noCam, { type: 'NAVIGATE_TO', payload: 0 });
    assert.deepEqual(s3.canvas, { offset: { x: 0, y: 0 }, zoom: 1 });
});

test('NAV_BACK / NAV_FORWARD: полный круг с камерами', () => {
    const s0 = makeState();
    const s1 = reducer(s0, { type: 'DIVE_INTO', payload: { id: 'nodeA', name: 'A' } });
    const diveCam = s1.canvas;

    const s2 = reducer(s1, { type: 'NAV_BACK' });
    assert.equal(s2.currentContext, 'root');
    assert.deepEqual(s2.canvas, { offset: { x: 100, y: 200 }, zoom: 0.8 });
    assert.equal(s2.navHistory.future.length, 1);

    const s3 = reducer(s2, { type: 'NAV_FORWARD' });
    assert.equal(s3.currentContext, 'nodeA');
    assert.deepEqual(s3.canvas, diveCam);
    assert.equal(s3.navHistory.future.length, 0);
});

test('NAV_BACK: пропускает записи об удалённых контекстах', () => {
    const s0 = makeState();
    const s1 = reducer(s0, { type: 'DIVE_INTO', payload: { id: 'nodeA', name: 'A' } });
    const s2 = reducer(s1, { type: 'DIVE_INTO', payload: { id: 'nodeB', name: 'B' } });
    // Возвращаемся в root и убиваем nodeA: история содержит root -> nodeA
    const s3 = { ...s2 };
    delete s3.nodes.nodeA;
    s3.nodes = { ...s2.nodes };
    delete s3.nodes.nodeA;

    const s4 = reducer(s3, { type: 'NAV_BACK' });
    // nodeA больше не существует, откат должен уйти в root
    assert.equal(s4.currentContext, 'root');
});

test('NAV_BACK: на пустой истории состояние не меняется', () => {
    const s0 = makeState();
    assert.equal(reducer(s0, { type: 'NAV_BACK' }), s0);
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
    assert.equal(s1.links.length, 0);
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

test('LOAD_STATE: сбрасывает историю навигации и принимает cameraByContext', () => {
    const s0 = makeState();
    s0.navHistory = { past: [{ id: 'x', breadcrumbs: [] }], future: [] };
    const s1 = reducer(s0, { type: 'LOAD_STATE', payload: { nodes: {}, ports: {}, links: [], cameraByContext: { root: { offset: { x: 1, y: 2 }, zoom: 3 } } } });
    assert.deepEqual(s1.navHistory, { past: [], future: [] });
    assert.deepEqual(s1.cameraByContext.root, { offset: { x: 1, y: 2 }, zoom: 3 });
});

test('UNDO прыгает в контекст правки; NAVIGATE_TO принимает объект с keepCamera', () => {
    let s = makeState();
    // узел A с ребёнком B; ныряем в A и правим B
    s = reducer(s, { type: 'ADD_NODE', payload: { id: 'a', name: 'A', position: { x: 0, y: 0 }, size: { w: 200, h: 100 } } });
    s = reducer(s, { type: 'DIVE_INTO', payload: { id: 'a', name: 'A' } });
    s = reducer(s, { type: 'ADD_NODE', payload: { id: 'b', name: 'B', position: { x: 10, y: 10 } } });
    // выходим на root, затем undo: добавление B было в контексте 'a' — должны прыгнуть туда
    s = reducer(s, { type: 'NAVIGATE_TO', payload: 0 });
    assert.equal(s.currentContext, 'root');
    s = reducer(s, { type: 'UNDO' });
    assert.equal(s.currentContext, 'a');
    assert.equal(s.nodes.b, undefined);
    assert.equal(s.breadcrumbs[s.breadcrumbs.length - 1].id, 'a');
    // REDO возвращает B
    s = reducer(s, { type: 'REDO' });
    assert.ok(s.nodes.b);
    // NAVIGATE_TO объектом с keepCamera: камера не меняется
    const camBefore = s.canvas;
    s = reducer(s, { type: 'NAVIGATE_TO', payload: { index: 0, keepCamera: true } });
    assert.equal(s.currentContext, 'root');
    assert.deepEqual(s.canvas, camBefore);
    // transitionFromContext выставлен прошлым контекстом
    assert.equal(s.ui.transitionFromContext, 'a');
});

test('DIVE_INTO с keepCamera не трогает камеру', () => {
    let s = makeState();
    s = reducer(s, { type: 'ADD_NODE', payload: { id: 'x', name: 'X', position: { x: 5, y: 5 } } });
    s = reducer(s, { type: 'SET_CANVAS', payload: { offset: { x: 123, y: 456 }, zoom: 1.5 } });
    const cam = s.canvas;
    s = reducer(s, { type: 'DIVE_INTO', payload: { id: 'x', name: 'X', keepCamera: true } });
    assert.equal(s.currentContext, 'x');
    assert.deepEqual(s.canvas, cam);
});



// === GO_TO_CONTEXT: поддержка layers/ports/links ===

test('GO_TO_CONTEXT строит путь через layers (не только nodes)', () => {
    let s = makeState();
    // nodeD.parentId = 'layerL', layerL.parentId = 'root'
    // GO_TO_CONTEXT на nodeD должен найти путь
    s = reducer(s, { type: 'GO_TO_CONTEXT', payload: 'nodeD' });
    assert.equal(s.currentContext, 'nodeD');
    // Breadcrumbs: root → nodeD (layerL пропускается, т.к. он layer, не node-контекст)
    const ids = s.breadcrumbs.map(b => b.id);
    assert.ok(ids.includes('root'), 'root должен быть в breadcrumbs');
    assert.ok(ids.includes('nodeD'), 'nodeD должен быть в breadcrumbs');
});

test('GO_TO_CONTEXT на порт строит путь через node-владелец', () => {
    let s = makeState();
    // portB.nodeId = 'nodeB', nodeB.parentId = 'nodeA'
    s = reducer(s, { type: 'GO_TO_CONTEXT', payload: 'portB' });
    assert.equal(s.currentContext, 'portB');
    const ids = s.breadcrumbs.map(b => b.id);
    assert.ok(ids.includes('root'), 'root должен быть');
    assert.ok(ids.includes('nodeA'), 'nodeA должен быть (предок nodeB)');
    assert.ok(ids.includes('nodeB'), 'nodeB должен быть (владелец порта)');
    assert.ok(ids.includes('portB'), 'portB должен быть');
});

test('GO_TO_CONTEXT на связь строит путь через source-узел', () => {
    let s = makeState();
    // linkBC.sourcePortId = 'portB' → nodeB.parentId = 'nodeA'
    s = reducer(s, { type: 'GO_TO_CONTEXT', payload: 'linkBC' });
    assert.equal(s.currentContext, 'linkBC');
    const ids = s.breadcrumbs.map(b => b.id);
    assert.ok(ids.includes('root'), 'root должен быть');
    assert.ok(ids.includes('nodeB'), 'nodeB должен быть');
    assert.ok(ids.includes('linkBC'), 'linkBC должен быть');
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
    const overlapX = nOutside.position.x < layer.position.x + layer.size.w + gap && nOutside.position.x + 200 + gap > layer.position.x;
    const overlapY = nOutside.position.y < layer.position.y + layer.size.h + gap && nOutside.position.y + 100 + gap > layer.position.y;

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
        },
        currentContext: 'root'
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


