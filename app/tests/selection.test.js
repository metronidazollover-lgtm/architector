// Выделение контейнеров: адресация, класс выделения, изоляция, массовое удаление.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const GeometryUtils = require('../utils/geometry.js');
global.GeometryUtils = GeometryUtils;
const HierarchyUtils = require('../utils/hierarchy.js');
global.HierarchyUtils = HierarchyUtils;
const H = HierarchyUtils;

const {
    defaultState, reducer, multiReducer, wrapFlatToMulti,
    getSelectionClass, toggleSelectionWithClass, isContainerSelectionId,
    windowSelectionId, projectSelectionId
} = require('../store/reducer.js');

const { generateFlatProject } = require('./fixtures/generate.js');

/** Мультисостояние с одним проектом и заданным числом уровней. */
const makeMulti = (levels = 3) => wrapFlatToMulti(
    generateFlatProject({ nodes: levels * 3, levels, portsPerNode: 1, linkRatio: 1, seed: 42 })
);

test('адресация: класс выделения различает контейнеры и сущности', () => {
    assert.equal(getSelectionClass([]), 'empty');
    assert.equal(getSelectionClass(['node-1', 'layer-2']), 'entities');
    assert.equal(getSelectionClass([windowSelectionId({ id: 'w1' })]), 'containers');
    assert.equal(getSelectionClass([projectSelectionId('p1')]), 'containers');
    // Легаси-формы: selectedIds персистится, старые значения обязаны распознаваться
    assert.equal(getSelectionClass(['level-window-2']), 'containers');
    assert.equal(getSelectionClass(['project']), 'containers');
    assert.equal(isContainerSelectionId('node-1'), false);
});

test('взаимоисключение классов: смешать контейнеры и сущности нельзя', () => {
    // Внутри класса выделение дополняется
    assert.deepEqual(toggleSelectionWithClass(['window:a'], 'window:b'), ['window:a', 'window:b']);
    assert.deepEqual(toggleSelectionWithClass(['window:a'], 'project:p1'), ['window:a', 'project:p1']);
    // Другой класс — выделение ЗАМЕНЯЕТСЯ, иначе Delete был бы неоднозначен
    assert.deepEqual(toggleSelectionWithClass(['window:a', 'window:b'], 'node-1'), ['node-1']);
    assert.deepEqual(toggleSelectionWithClass(['node-1'], 'window:a'), ['window:a']);
    // Повторный клик снимает
    assert.deepEqual(toggleSelectionWithClass(['window:a', 'window:b'], 'window:a'), ['window:b']);
});

test('TOGGLE_SELECTED в редьюсере соблюдает взаимоисключение классов', () => {
    const s0 = { ...defaultState, selectedIds: ['window:w1'] };
    const s1 = reducer(s0, { type: 'TOGGLE_SELECTED', payload: 'node-1' });
    assert.deepEqual(s1.selectedIds, ['node-1'], 'выделение заменено, а не смешано');

    const s2 = reducer(s1, { type: 'TOGGLE_SELECTED', payload: 'node-2' });
    assert.deepEqual(s2.selectedIds, ['node-1', 'node-2'], 'свой класс дополняется');
});

test('изоляция контейнеров: включение, выключение, независимость от «глаза»', () => {
    let s = { ...defaultState };
    assert.equal(H.isContainerIsolationActive(s.containerIsolation), false);
    assert.equal(H.isWindowVisible('w1', 'p1', s.containerIsolation), true, 'без изоляции видно всё');

    s = reducer(s, { type: 'TOGGLE_CONTAINER_ISOLATION', payload: { kind: 'window', id: 'w1' } });
    assert.equal(H.isContainerIsolationActive(s.containerIsolation), true);
    assert.equal(H.isWindowVisible('w1', 'p1', s.containerIsolation), true, 'изолированное окно видно');
    assert.equal(H.isWindowVisible('w2', 'p1', s.containerIsolation), false, 'остальное скрыто');

    // Повторный клик по той же кнопке снимает изоляцию — кнопка видна, потому
    // что изолированный контейнер остался на экране
    s = reducer(s, { type: 'TOGGLE_CONTAINER_ISOLATION', payload: { kind: 'window', id: 'w1' } });
    assert.equal(H.isContainerIsolationActive(s.containerIsolation), false);
});

test('изоляция проекта показывает все его окна и скрывает чужие', () => {
    let s = { ...defaultState };
    s = reducer(s, { type: 'TOGGLE_CONTAINER_ISOLATION', payload: { kind: 'project', id: 'p1' } });
    assert.equal(H.isWindowVisible('any-window', 'p1', s.containerIsolation), true);
    assert.equal(H.isWindowVisible('any-window', 'p2', s.containerIsolation), false);
    assert.equal(H.isProjectVisible('p1', s.containerIsolation, {}), true);
    assert.equal(H.isProjectVisible('p2', s.containerIsolation, { w9: {} }), false);
});

test('инвариант: изоляция не переживает удаление изолированного проекта', () => {
    // Иначе на холсте не осталось бы ни одного видимого контейнера — а вместе
    // с ним и кнопки, которой изоляция снимается
    let m = makeMulti(2);
    const pid = m.activeProjectId;
    m = multiReducer(m, { type: 'ADD_PROJECT', payload: { name: 'Второй' } });
    m = multiReducer(m, { type: 'TOGGLE_CONTAINER_ISOLATION', payload: { kind: 'project', id: pid } });
    assert.equal(H.isContainerIsolationActive(m.containerIsolation), true);

    m = multiReducer(m, { type: 'REMOVE_PROJECT', payload: { id: pid } });
    assert.equal(H.isContainerIsolationActive(m.containerIsolation), false, 'изоляция снята автоматически');
});

test('массовое удаление окон: сверху вниз, один шаг Undo на проект', () => {
    let m = makeMulti(4); // уровни 0..3
    const pid = m.activeProjectId;
    const wins = Object.values(m.projects[pid].levelWindows);
    assert.equal(wins.length, 4);

    const w1 = wins.find(w => w.levelIndex === 1);
    const w2 = wins.find(w => w.levelIndex === 2);
    const pastBefore = m.projects[pid].past.length;

    m = { ...m, selectedIds: [windowSelectionId(w1), windowSelectionId(w2)] };
    m = multiReducer(m, { type: 'DELETE_SELECTED' });

    const after = m.projects[pid];
    assert.equal(Object.keys(after.levelWindows).length, 2, 'удалены оба выбранных уровня');
    assert.equal(after.past.length, pastBefore + 1, 'вся пачка — РОВНО один шаг истории');
    assert.deepEqual(m.selectedIds, [], 'выделение сброшено');
});

test('массовое удаление: Главный холст и уровень удаляются клавишей Delete', () => {
    let m = makeMulti(3);
    const pid = m.activeProjectId;
    const wins = Object.values(m.projects[pid].levelWindows);
    const root = wins.find(w => w.levelIndex === 0);
    const w2 = wins.find(w => w.levelIndex === 2);

    m = { ...m, selectedIds: [windowSelectionId(root), windowSelectionId(w2)] };
    m = multiReducer(m, { type: 'DELETE_SELECTED' });

    const levels = Object.values(m.projects[pid].levelWindows).map(w => w.levelIndex).sort();
    assert.ok(levels.includes(0), 'Уровень 1 стал Главным холстом (индекс 0)');
    assert.equal(levels.length, 1, 'удалены уровень 0 и уровень 2, остался бывший уровень 1');
});

test('массовое удаление проектов: удаляются целиком, изоляция чистится', () => {
    let m = makeMulti(2);
    const first = m.activeProjectId;
    m = multiReducer(m, { type: 'ADD_PROJECT', payload: { name: 'Второй' } });
    const second = m.activeProjectId;
    m = multiReducer(m, { type: 'ADD_PROJECT', payload: { name: 'Третий' } });

    m = multiReducer(m, { type: 'TOGGLE_CONTAINER_ISOLATION', payload: { kind: 'project', id: second } });
    m = { ...m, selectedIds: [projectSelectionId(first), projectSelectionId(second)] };
    m = multiReducer(m, { type: 'DELETE_SELECTED' });

    assert.equal(m.projectOrder.length, 1, 'остался один проект');
    assert.equal(m.projects[first], undefined);
    assert.equal(m.projects[second], undefined);
    assert.equal(H.isContainerIsolationActive(m.containerIsolation), false, 'изоляция удалённого проекта снята');
});

test('выделение сущностей по-прежнему удаляется обычным путём', () => {
    let m = makeMulti(2);
    const pid = m.activeProjectId;
    const nodeId = Object.keys(m.projects[pid].nodes)[0];

    m = { ...m, selectedIds: [nodeId] };
    m = multiReducer(m, { type: 'DELETE_SELECTED' });
    assert.equal(m.projects[pid].nodes[nodeId], undefined, 'узел удалён делегированием во внутренний редьюсер');
});
