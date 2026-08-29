// Юнит-тесты движка стора: подписки, отсечение мёртвых dispatch, кэш селектора.
// Движок не знает про React, поэтому проверяется целиком в node.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createStore, createSelectorCache, shallowEqual } = require('../store/engine.js');

const counterReducer = (state, action) => {
    switch (action.type) {
        case 'INC': return { ...state, n: state.n + 1 };
        case 'SET_NAME': return state.name === action.payload ? state : { ...state, name: action.payload };
        case 'NOOP': return state;
        default: return state;
    }
};

test('createStore: dispatch меняет состояние и уведомляет подписчиков', () => {
    const store = createStore(counterReducer, { n: 0, name: 'a' });
    let calls = 0;
    store.subscribe(() => { calls++; });

    store.dispatch({ type: 'INC' });
    assert.equal(store.getState().n, 1);
    assert.equal(calls, 1, 'подписчик уведомлён ровно один раз');
});

test('createStore: экшен-пустышка не будит подписчиков', () => {
    // Ключевая экономия: редьюсер, вернувший то же состояние по ссылке
    // (правка несуществующего id, жест без смещения), не должен стоить кадр.
    const store = createStore(counterReducer, { n: 0, name: 'a' });
    let calls = 0;
    store.subscribe(() => { calls++; });

    store.dispatch({ type: 'NOOP' });
    store.dispatch({ type: 'SET_NAME', payload: 'a' });
    assert.equal(calls, 0, 'ни одного уведомления');

    store.dispatch({ type: 'SET_NAME', payload: 'b' });
    assert.equal(calls, 1, 'реальное изменение уведомляет');
});

test('createStore: getView отдаёт стабильную ссылку между dispatch и пересчитывается один раз на изменение', () => {
    // Нестабильная ссылка из getSnapshot зациклила бы useSyncExternalStore,
    // а пересчёт проекции на каждый рендер вернул бы прежнюю стоимость.
    let projections = 0;
    const store = createStore(counterReducer, { n: 0, name: 'a' }, {
        project: (s) => { projections++; return { n: s.n }; }
    });

    assert.equal(projections, 1, 'проекция посчитана при создании');
    const v1 = store.getView();
    assert.equal(store.getView(), v1, 'повторное чтение — та же ссылка');
    assert.equal(projections, 1, 'чтение не пересчитывает проекцию');

    store.dispatch({ type: 'INC' });
    assert.equal(projections, 2, 'ровно один пересчёт на одно изменение');
    assert.notEqual(store.getView(), v1, 'после изменения ссылка новая');

    store.dispatch({ type: 'NOOP' });
    assert.equal(projections, 2, 'пустышка проекцию не пересчитывает');
});

test('createStore: отписка работает, в том числе изнутри уведомления', () => {
    const store = createStore(counterReducer, { n: 0, name: 'a' });
    let aCalls = 0;
    let bCalls = 0;

    const unsubA = store.subscribe(() => {
        aCalls++;
        unsubA(); // React снимает подписку при размонтировании — прямо в обработчике
    });
    store.subscribe(() => { bCalls++; });

    store.dispatch({ type: 'INC' });
    assert.equal(aCalls, 1);
    assert.equal(bCalls, 1, 'отписка первого не сорвала уведомление второго');

    store.dispatch({ type: 'INC' });
    assert.equal(aCalls, 1, 'отписавшийся больше не вызывается');
    assert.equal(bCalls, 2);
    assert.equal(store.getListenerCount(), 1);
});

test('shallowEqual: массивы, объекты и примитивы', () => {
    assert.equal(shallowEqual(1, 1), true);
    assert.equal(shallowEqual(null, null), true);
    assert.equal(shallowEqual(null, {}), false);
    assert.equal(shallowEqual([1, 2], [1, 2]), true);
    assert.equal(shallowEqual([1, 2], [2, 1]), false);
    assert.equal(shallowEqual([1], [1, 2]), false);
    assert.equal(shallowEqual({ a: 1, b: 'x' }, { a: 1, b: 'x' }), true);
    assert.equal(shallowEqual({ a: 1 }, { a: 1, b: 2 }), false);
    assert.equal(shallowEqual({ a: 1 }, { b: 1 }), false);
    // Вложенные объекты сравниваются по ссылке — этого достаточно, потому что
    // редьюсер иммутабелен: изменившаяся сущность всегда получает новую ссылку
    const shared = { x: 1 };
    assert.equal(shallowEqual({ p: shared }, { p: shared }), true);
    assert.equal(shallowEqual({ p: { x: 1 } }, { p: { x: 1 } }), false);
});

test('createSelectorCache: не пересчитывает срез в пределах поколения вида', () => {
    let runs = 0;
    const select = createSelectorCache((view) => { runs++; return { n: view.n }; });

    const v1 = { n: 1 };
    select(v1);
    select(v1);
    select(v1);
    assert.equal(runs, 1, 'в пределах одного вида селектор считается один раз');
});

test('createSelectorCache: равный результат отдаётся ПРЕЖНЕЙ ссылкой — компонент не перерисуется', () => {
    // Вид сменился (изменилось что-то чужое), но выбранный срез тот же —
    // React должен пропустить рендер, а для этого нужна та же ссылка.
    const select = createSelectorCache((view) => ({ n: view.n }));

    const a = select({ n: 5, other: 'x' });
    const b = select({ n: 5, other: 'ДРУГОЕ' });
    assert.equal(a, b, 'ссылка сохранена — рендера не будет');

    const c = select({ n: 6, other: 'ДРУГОЕ' });
    assert.notEqual(c, b, 'изменение среза даёт новую ссылку');
    assert.deepEqual(c, { n: 6 });
});

test('createSelectorCache: производное значение ловит изменение ДАЛЁКОГО предка («рябь»)', () => {
    // Смысл всей схемы: потомок подписан не на свою запись, а на вычисленный
    // результат. Меняется предок — меняется производная позиция потомка — и
    // компонент обязан перерисоваться.
    const worldPosOf = (view, id) => {
        let x = 0;
        let cur = view.nodes[id];
        const seen = new Set();
        while (cur && !seen.has(cur.id)) {
            seen.add(cur.id);
            x += cur.dx;
            cur = cur.ownerId ? view.nodes[cur.ownerId] : null;
        }
        return { x };
    };
    const selectChild = createSelectorCache((view) => worldPosOf(view, 'child'));

    const v1 = { nodes: {
        root: { id: 'root', dx: 10, ownerId: null },
        child: { id: 'child', dx: 5, ownerId: 'root' }
    } };
    assert.deepEqual(selectChild(v1), { x: 15 });

    // Двигаем ПРЕДКА — запись потомка не менялась вовсе
    const v2 = { nodes: { ...v1.nodes, root: { id: 'root', dx: 100, ownerId: null } } };
    assert.deepEqual(selectChild(v2), { x: 105 }, 'потомок увидел перенос предка');

    // Меняется посторонняя сущность — срез потомка обязан остаться той же ссылкой
    const before = selectChild(v2);
    const v3 = { nodes: { ...v2.nodes, stranger: { id: 'stranger', dx: 7, ownerId: null } } };
    assert.equal(selectChild(v3), before, 'чужое изменение не перерисовывает потомка');
});
