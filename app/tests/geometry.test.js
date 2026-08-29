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

test('buildLinkPath: единый построитель пути отдаёт оба стиля линии', () => {
    // Регрессия: пока построителей было два (в Link.js и в Canvas.js), переключение
    // стиля работало для внутриуровневых связей и молча игнорировалось для межуровневых.
    const p1 = { x: 0, y: 0, edge: 'right' };
    const p2 = { x: 100, y: 100, edge: 'left' };

    const bezier = GeometryUtils.buildLinkPath(p1, p2, 'bezier', 0);
    assert.ok(bezier.includes('C'), 'безье-путь содержит кубическую кривую');

    const ortho = GeometryUtils.buildLinkPath(p1, p2, 'orthogonal', 0);
    assert.ok(!ortho.includes('C'), 'ортогональный путь состоит только из отрезков');
    assert.ok(ortho.split('L').length > 2, 'ортогональный путь имеет промежуточные точки');

    assert.notEqual(bezier, ortho, 'стили обязаны давать разные пути');
});

test('buildLinkPath: внутренний отрезок подходит к прокси ПЕРПЕНДИКУЛЯРНО рамке', () => {
    // Регрессия: если конечной точке задать грань прокси (она смотрит НАРУЖУ),
    // ортогональный маршрут кладёт последнее звено ВДОЛЬ линии обрезки окна.
    // Звено оказывается ровно на границе overflow:hidden и становится невидимым —
    // связь выглядит оборванной в воздухе, не доходя до прокси-порта.
    const port = { x: 300, y: 100, edge: 'bottom' };   // порт на нижней грани узла
    const proxy = { x: 500, y: 400 };                   // прокси на нижней рамке окна

    const parse = (d) => d.trim().split(/(?=[ML])/).map(c => {
        const m = c.trim().match(/[ML]\s*([-\d.]+)\s+([-\d.]+)/);
        return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
    }).filter(Boolean);

    const inward = parse(GeometryUtils.buildLinkPath(port, { ...proxy, edge: 'top' }, 'orthogonal', 0));
    const last = inward[inward.length - 1];
    const prev = inward[inward.length - 2];

    assert.deepEqual({ x: last.x, y: last.y }, proxy, 'путь обязан заканчиваться точно в прокси');
    assert.equal(Math.round(prev.x), Math.round(last.x), 'последнее звено вертикально, то есть перпендикулярно нижней рамке');
});
