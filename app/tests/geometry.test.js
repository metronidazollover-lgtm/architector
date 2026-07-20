const { test } = require('node:test');
const assert = require('node:assert/strict');

const GeometryUtils = require('../utils/geometry.js');

test('getEdgePos: середины граней прямоугольника', () => {
    assert.deepEqual(GeometryUtils.getEdgePos('right', 0.5, 200, 100), { x: 200, y: 50 });
    assert.deepEqual(GeometryUtils.getEdgePos('bottom', 0.25, 200, 100), { x: 50, y: 100 });
});

test('getPortAbsolutePosition: позиция узла плюс точка на грани', () => {
    const node = { position: { x: 1000, y: 500 }, size: { w: 200, h: 100 }, shape: 'rectangle' };
    const port = { edge: 'right', position: 0.5 };
    const p = GeometryUtils.getPortAbsolutePosition(port, node);
    assert.deepEqual({ x: p.x, y: p.y }, { x: 1200, y: 550 });
    assert.equal(p.edge, 'right');
});

test('fitBBoxToCanvas: вписывание и обратное преобразование', () => {
    const fit = GeometryUtils.fitBBoxToCanvas({ minX: 0, minY: 0, maxX: 1000, maxY: 500 }, 256, 150, 8);
    // масштаб ограничен меньшей стороной: (256-16)/1000 = 0.24 vs (150-16)/500 = 0.268
    assert.equal(Math.round(fit.scale * 1000) / 1000, 0.24);
    // центр мира попадает в центр холста
    assert.deepEqual(fit.toMini(500, 250), { x: 128, y: 75 });
    // toWorld обратен toMini
    const m = fit.toMini(120, 340);
    const w = fit.toWorld(m.x, m.y);
    assert.equal(Math.round(w.x), 120);
    assert.equal(Math.round(w.y), 340);
});
