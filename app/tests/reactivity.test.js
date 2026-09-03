// Тесты «ряби»: одно действие законно влияет на далёкие сущности.
//
// Точечные подписки компонентов построены на сравнении ВЫЧИСЛЕННОГО результата,
// а не «своей записи» в состоянии. Эти тесты фиксируют инвариант на уровне тех
// самых функций, которые вызывают селекторы: если производное значение
// затронутой сущности не изменилось, компонент не перерисуется — и пользователь
// увидит устаревшую картинку. Тест обязан упасть раньше, чем это случится.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const GeometryUtils = require('../utils/geometry.js');
global.GeometryUtils = GeometryUtils;
const HierarchyUtils = require('../utils/hierarchy.js');
global.HierarchyUtils = HierarchyUtils;
const H = HierarchyUtils;

const { defaultState, reducer } = require('../store/reducer.js');

/** Иммутабельная правка узла — как это делает редьюсер. */
const patchNode = (state, id, updates) => ({
    ...state,
    nodes: { ...state.nodes, [id]: { ...state.nodes[id], ...updates } }
});

const baseState = () => ({
    ...defaultState,
    nodes: {
        // L0: предок
        'anc': { id: 'anc', name: 'Предок', parentId: 'root', position: { x: 0, y: 0 }, size: { w: 200, h: 100 } },
        // L1: ребёнок предка
        'mid': { id: 'mid', name: 'Середина', parentId: 'root', ownerId: 'anc', position: { x: 10, y: 10 }, size: { w: 200, h: 100 } },
        // L2: внук
        'leaf': { id: 'leaf', name: 'Внук', parentId: 'root', ownerId: 'mid', position: { x: 20, y: 20 }, size: { w: 200, h: 100 } },
        // Посторонний узел на L0
        'stranger': { id: 'stranger', name: 'Чужой', parentId: 'root', position: { x: 900, y: 900 }, size: { w: 200, h: 100 } }
    },
    layers: {},
    ports: {
        'p-leaf': { id: 'p-leaf', nodeId: 'leaf', type: 'output', edge: 'right', position: 0.5 },
        'p-anc': { id: 'p-anc', nodeId: 'anc', type: 'input', edge: 'left', position: 0.5 }
    },
    links: {
        'l1': { id: 'l1', sourcePortId: 'p-leaf', targetPortId: 'p-anc' }
    }
});

test('рябь: перенос ПРЕДКА внутри слоя меняет локальную позицию потомка', () => {
    // Узел лежит в слое, слой переезжает — запись самого узла не менялась,
    // но его позиция внутри уровня обязана измениться.
    const s0 = {
        ...baseState(),
        layers: { 'lay': { id: 'lay', name: 'Слой', parentId: 'root', position: { x: 100, y: 100 }, size: { w: 500, h: 400 } } }
    };
    s0.nodes['inLayer'] = { id: 'inLayer', name: 'В слое', parentId: 'lay', position: { x: 5, y: 5 }, size: { w: 200, h: 100 } };

    const before = H.getLocalPosition('inLayer', s0.nodes, s0.layers);
    assert.deepEqual(before, { x: 105, y: 105 });

    const s1 = { ...s0, layers: { ...s0.layers, lay: { ...s0.layers.lay, position: { x: 300, y: 100 } } } };
    const after = H.getLocalPosition('inLayer', s1.nodes, s1.layers);

    assert.notDeepEqual(after, before, 'потомок обязан увидеть переезд слоя');
    assert.deepEqual(after, { x: 305, y: 105 });
});

test('рябь: смена владельца у середины меняет УРОВЕНЬ внука', () => {
    const s0 = baseState();
    assert.equal(H.getEntityLevel('leaf', s0.nodes, s0.layers), 2);

    // mid переезжает к другому владельцу на L0 — запись leaf не тронута
    const s1 = patchNode(s0, 'mid', { ownerId: 'stranger' });
    assert.equal(H.getEntityLevel('leaf', s1.nodes, s1.layers), 2, 'уровень тот же, владелец другой');

    // mid становится сиротой на L0 — внук поднимается на L1
    const s2 = patchNode(s0, 'mid', { ownerId: null, homeLevel: 0 });
    assert.equal(H.getEntityLevel('leaf', s2.nodes, s2.layers), 1, 'внук обязан подняться следом за серединой');
});

// v14 (Фаза 4): DELETE_SELECTED переписан — ре-якорения «внук — деду» через
// ownerId/ownerGap/homeLevel в v14 не существует (см. docs/LANES_MODEL.md).
// Тест «рябь: удаление владельца ре-якорит ветку» проверял именно это
// поведение и удалён вместе с ним, а не перенесён — см. §7.13 плана.

test('рябь: связь через поколение (ownerGap) учитывается в уровне', () => {
    const s0 = baseState();
    const s1 = patchNode(s0, 'leaf', { ownerId: 'anc', ownerGap: 2 });
    assert.equal(H.getEntityLevel('leaf', s1.nodes, s1.layers), 2, 'дистанция в два уровня сохраняет положение внука');

    const s2 = patchNode(s1, 'leaf', { ownerGap: 3 });
    assert.equal(H.getEntityLevel('leaf', s2.nodes, s2.layers), 3, 'изменение дистанции меняет уровень');
});

test('рябь: «глаз» Главного холста меняет видимость сущностей на ВСЕХ уровнях', () => {
    const s0 = baseState();
    assert.equal(H.isEntityVisible('leaf', s0), true);

    // Изолируем ветку постороннего узла: вся ветка anc → mid → leaf гаснет
    const s1 = { ...s0, levelHideNeighbors: { 0: true }, levelFocusParentId: { 0: ['stranger'] } };
    assert.equal(H.isEntityVisible('stranger', s1), true, 'сам фокус виден');
    assert.equal(H.isEntityVisible('leaf', s1), false, 'внук чужой ветки скрыт с уровня 2');
    assert.equal(H.isEntityVisible('anc', s1), false, 'предок чужой ветки тоже скрыт');

    // Переключаем фокус на нашу ветку — внук снова виден
    const s2 = { ...s1, levelFocusParentId: { 0: ['anc'] } };
    assert.equal(H.isEntityVisible('leaf', s2), true, 'внук виден через предка в фокусе');
});

test('рябь: выделение узла подсвечивает связанный порт на ДРУГОМ конце сети', () => {
    // Порт p-anc связан с портом узла leaf. Выделение leaf обязано дойти до
    // p-anc, хотя ни его запись, ни запись его узла не менялись.
    const s0 = baseState();
    const linksByPort = H.getLinksByPortId(s0.links);
    const ancPortLinks = linksByPort['p-anc'] || [];
    assert.equal(ancPortLinks.length, 1, 'индекс нашёл связь порта');

    const selected = ['leaf'];
    const connected = ancPortLinks.some(l => {
        const oppId = l.sourcePortId === 'p-anc' ? l.targetPortId : l.sourcePortId;
        const opp = s0.ports[oppId];
        return opp && selected.includes(opp.nodeId);
    });
    assert.equal(connected, true, 'подсветка сети доходит до дальнего порта');
});

test('рябь: перенос узла на другой уровень меняет состав межуровневых связей окон', () => {
    const s0 = baseState();
    const byLevel0 = H.getCrossLinksByLevel(s0);
    // Связь leaf(L2) → anc(L0) межуровневая: попадает и в 0, и в 2
    assert.equal((byLevel0[0] || []).length, 1);
    assert.equal((byLevel0[2] || []).length, 1);

    // Поднимаем leaf на уровень предка — связь становится внутриуровневой
    const s1 = patchNode(s0, 'leaf', { ownerId: null, homeLevel: 0 });
    const byLevel1 = H.getCrossLinksByLevel(s1);
    assert.equal((byLevel1[0] || []).length, 0, 'межуровневых связей у уровня 0 не осталось');
    assert.equal((byLevel1[2] || []).length, 0, 'и у уровня 2 тоже');
});

test('кэш индексов не переживает изменение состояния (иначе рябь потеряется)', () => {
    const s0 = baseState();
    const idx0 = H.getCrossLinksByLevel(s0);
    assert.equal(H.getCrossLinksByLevel(s0), idx0, 'в пределах поколения — тот же объект');

    // Сменилось поколение узлов — индекс обязан пересчитаться
    const s1 = patchNode(s0, 'leaf', { position: { x: 999, y: 999 } });
    assert.notEqual(H.getCrossLinksByLevel(s1), idx0, 'после изменения — новый расчёт');
});
