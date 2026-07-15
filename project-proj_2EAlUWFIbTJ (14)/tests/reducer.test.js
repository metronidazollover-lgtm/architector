const { test } = require('node:test');
const assert = require('node:assert/strict');

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
