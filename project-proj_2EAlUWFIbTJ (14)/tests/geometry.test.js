const { test } = require('node:test');
const assert = require('node:assert/strict');

const GeometryUtils = require('../utils/geometry.js');

test('getEdgePos: середины граней прямоугольника', () => {
    assert.deepEqual(GeometryUtils.getEdgePos('right', 0.5, 200, 100), { x: 200, y: 50 });
    assert.deepEqual(GeometryUtils.getEdgePos('bottom', 0.25, 200, 100), { x: 50, y: 100 });
});

test('getPolygonPoints: прямоугольник по умолчанию, треугольник особый', () => {
    assert.equal(GeometryUtils.getPolygonPoints('rectangle', 100, 100).length, 4);
    assert.equal(GeometryUtils.getPolygonPoints('triangle', 100, 100).length, 3);
    assert.equal(GeometryUtils.getPolygonPoints('hexagon', 100, 100).length, 6);
});

test('getClosestPointOnPolygon: для прямоугольника точка не двигается', () => {
    assert.deepEqual(GeometryUtils.getClosestPointOnPolygon('rectangle', 200, 100, 200, 50), { x: 200, y: 50 });
});

test('getClosestPointOnPolygon: точка проецируется на границу треугольника', () => {
    const p = GeometryUtils.getClosestPointOnPolygon('triangle', 100, 100, 50, 0);
    // Вершина треугольника (w/2, 0) — ближайшая точка к (50,0)
    assert.ok(Math.abs(p.x - 50) < 1e-9);
    assert.ok(Math.abs(p.y - 0) < 1e-9);
});

test('getPortAbsolutePosition: позиция узла плюс точка на грани', () => {
    const node = { position: { x: 1000, y: 500 }, size: { w: 200, h: 100 }, shape: 'rectangle' };
    const port = { edge: 'right', position: 0.5 };
    const p = GeometryUtils.getPortAbsolutePosition(port, node);
    assert.deepEqual({ x: p.x, y: p.y }, { x: 1200, y: 550 });
    assert.equal(p.edge, 'right');
});
