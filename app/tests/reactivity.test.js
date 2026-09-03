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

// v14 (Фаза 6): «перенос ПРЕДКА внутри слоя», «смена владельца у середины»,
// «связь через поколение (ownerGap)» и «глаз Главного холста» удалены вместе
// с проверяемыми функциями (getLocalPosition/getEntityLevel/isEntityVisible) —
// слои-координатные-контейнеры, ownerId/ownerGap и «глаз» веток не существуют
// в v14 (см. census Фазы 6). Реактивность v14-геометрии (кэш дорожки/окна
// инвалидируется по смене поколения nodes/windows) покрыта в других файлах —
// coords.test.js («v14 Кэш координат инвалидируется...»).

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

// v14 (Фаза 6): «перенос узла на другой уровень...» и «кэш индексов не
// переживает изменение состояния» удалены вместе с getCrossLinksByLevel
// (межуровневые связи по глубине — v13-only). Тот же принцип кэша «по
// ссылке на словарь» для v14-геометрии — coords.test.js, «v14 Кэш координат
// инвалидируется...».
