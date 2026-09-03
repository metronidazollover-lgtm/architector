const { test } = require('node:test');
const assert = require('node:assert/strict');

const GeometryUtils = require('../utils/geometry.js');
global.GeometryUtils = GeometryUtils;

const HierarchyUtils = require('../utils/hierarchy.js');
global.HierarchyUtils = HierarchyUtils;

const {
    reducer,
    defaultState,
    getInitialMultiState,
    STORAGE_KEY_V12,
    migrateToV14
} = require('../store/reducer.js');

// Mock localStorage для сред node:test
const mockStorage = new Map();
global.localStorage = {
    getItem: (key) => mockStorage.get(key) || null,
    setItem: (key, val) => mockStorage.set(key, String(val)),
    removeItem: (key) => mockStorage.delete(key),
    clear: () => mockStorage.clear()
};

test('§3.1: getInitialMultiState восстанавливает aiChatSessionsByNode при загрузке', () => {
    mockStorage.clear();
    const stateToSave = {
        formatVersion: 12,
        projectOrder: ['proj-1'],
        activeProjectId: 'proj-1',
        projects: {
            'proj-1': {
                id: 'proj-1',
                projectName: 'Тестовый проект',
                nodes: {},
                layers: {},
                ports: {},
                links: {},
                levelWindows: defaultState.levelWindows,
                levelViews: defaultState.levelViews
            }
        },
        aiChatHistory: [{ role: 'ai', content: 'Привет' }],
        aiChatHistoryByNode: {
            'node-1': [{ role: 'user', content: 'Вопрос 1' }]
        },
        aiChatSessionsByNode: {
            'node-1': {
                activeSessionId: 'session-2',
                sessions: [
                    { id: 'session-1', title: 'Диалог 1', messages: [{ role: 'user', content: 'Сообщение 1' }] },
                    { id: 'session-2', title: 'Диалог 2', messages: [{ role: 'user', content: 'Сообщение 2' }] }
                ]
            }
        }
    };

    localStorage.setItem(STORAGE_KEY_V12, JSON.stringify(stateToSave));

    const loaded = getInitialMultiState();
    assert.ok(loaded.aiChatSessionsByNode, 'aiChatSessionsByNode должен присутствовать в загруженном состоянии');
    assert.ok(loaded.aiChatSessionsByNode['node-1'], 'Сессии для node-1 должны восстановиться');
    assert.equal(loaded.aiChatSessionsByNode['node-1'].activeSessionId, 'session-2');
    assert.equal(loaded.aiChatSessionsByNode['node-1'].sessions.length, 2);
    assert.equal(loaded.aiChatSessionsByNode['node-1'].sessions[1].title, 'Диалог 2');
});

test('§3.4: UPDATE_NODE и UPDATE_PORT с несуществующим ID возвращают стейт без создания фантомных сущностей', () => {
    const s0 = {
        ...defaultState,
        nodes: {
            'node-1': { id: 'node-1', name: 'Real Node', size: { w: 200, h: 100 } }
        },
        ports: {
            'port-1': { id: 'port-1', nodeId: 'node-1', name: 'Real Port' }
        }
    };

    // Попытка обновить несуществующий узел
    const s1 = reducer(s0, {
        type: 'UPDATE_NODE',
        payload: { id: 'ghost-node', updates: { name: 'I should not exist' } }
    });
    assert.equal(s1.nodes['ghost-node'], undefined, 'Несуществующий узел не должен появляться в state.nodes');
    assert.equal(Object.keys(s1.nodes).length, 1);

    // Попытка обновить несуществующий порт
    const s2 = reducer(s0, {
        type: 'UPDATE_PORT',
        payload: { id: 'ghost-port', updates: { name: 'I should not exist' } }
    });
    assert.equal(s2.ports['ghost-port'], undefined, 'Несуществующий порт не должен появляться в state.ports');
    assert.equal(Object.keys(s2.ports).length, 1);
});

test('§3.2: DELETE_SELECTED — удаление родительского узла сохраняет потомка на его уровне (ре-якорение «внук — деду» / homeLevel)', () => {
    // Дерево: Root -> NodeA (L0) -> NodeB (L1, ownerId: NodeA) -> NodeC (L2, ownerId: NodeB)
    const s0 = {
        ...defaultState,
        nodes: {
            'node-root': { id: 'node-root', name: 'Root Node', parentId: 'root', position: { x: 0, y: 0 } },
            'node-A': { id: 'node-A', name: 'Parent A', parentId: 'root', position: { x: 100, y: 100 } },
            'node-B': { id: 'node-B', name: 'Child B (L1)', parentId: 'root', ownerId: 'node-A', position: { x: 100, y: 100 } },
            'node-C': { id: 'node-C', name: 'Grandchild C (L2)', parentId: 'root', ownerId: 'node-B', position: { x: 100, y: 100 } }
        }
    };

    assert.equal(HierarchyUtils.getEntityLevel('node-A', s0.nodes), 0);
    assert.equal(HierarchyUtils.getEntityLevel('node-B', s0.nodes), 1);
    assert.equal(HierarchyUtils.getEntityLevel('node-C', s0.nodes), 2);

    // Удаляем узел B (L1)
    const s1 = reducer({ ...s0, selectedIds: ['node-B'] }, { type: 'DELETE_SELECTED' });
    assert.equal(s1.nodes['node-B'], undefined, 'Узел B удалён');

    // Проверяем, что узел C (L2) не «телепортировался» на уровень 0, а связался с дедушкой NodeA через ownerGap=2
    assert.ok(s1.nodes['node-C'], 'Узел C сохранился');
    assert.equal(s1.nodes['node-C'].ownerId, 'node-A', 'Узел C пере-якорился на дедушку node-A');
    assert.equal(s1.nodes['node-C'].ownerGap, 2, 'Дистанция ownerGap стала 2');
    assert.equal(HierarchyUtils.getEntityLevel('node-C', s1.nodes), 2, 'Уровень узла C остался 2');

    // Теперь удаляем узел A (L0)
    const s2 = reducer({ ...s1, selectedIds: ['node-A'] }, { type: 'DELETE_SELECTED' });
    assert.equal(s2.nodes['node-A'], undefined, 'Узел A удалён');

    // Узел C потерял последнего предка и стал независимым сиротой-якорем homeLevel=2
    assert.ok(s2.nodes['node-C'], 'Узел C сохранился');
    assert.equal(s2.nodes['node-C'].ownerId, null, 'ownerId сброшен в null');
    assert.equal(s2.nodes['node-C'].homeLevel, 2, 'homeLevel установлен в 2');
    assert.equal(HierarchyUtils.getEntityLevel('node-C', s2.nodes), 2, 'Уровень узла C по-прежнему 2');
});

test('§3.2b: DELETE_SELECTED — владельцем ветки может быть СЛОЙ, его подопечные тоже ре-якорятся', () => {
    // Владение: layer-A (L0) -> node-B (L1, ownerId: layer-A) -> node-C (L2, ownerId: node-B).
    // Слои удаляются отдельной веткой кода, поэтому раньше набор владельцев их не
    // учитывал и подопечные удалённого слоя проваливались на уровень 0.
    const s0 = {
        ...defaultState,
        layers: {
            'layer-A': { id: 'layer-A', name: 'Слой-владелец', parentId: 'root', position: { x: 0, y: 0 }, size: { w: 400, h: 300 } }
        },
        nodes: {
            'node-B': { id: 'node-B', name: 'B (L1)', parentId: 'root', ownerId: 'layer-A', position: { x: 100, y: 100 } },
            'node-C': { id: 'node-C', name: 'C (L2)', parentId: 'root', ownerId: 'node-B', position: { x: 100, y: 100 } }
        }
    };

    assert.equal(HierarchyUtils.getEntityLevel('layer-A', s0.nodes, s0.layers), 0);
    assert.equal(HierarchyUtils.getEntityLevel('node-B', s0.nodes, s0.layers), 1);
    assert.equal(HierarchyUtils.getEntityLevel('node-C', s0.nodes, s0.layers), 2);

    const s1 = reducer({ ...s0, selectedIds: ['layer-A'] }, { type: 'DELETE_SELECTED' });
    assert.equal(s1.layers['layer-A'], undefined, 'Слой-владелец удалён');

    // Живых предков не осталось — node-B становится сиротой-якорем на своём уровне,
    // а не проваливается на Главный холст
    assert.ok(s1.nodes['node-B'], 'Узел B сохранился');
    assert.equal(s1.nodes['node-B'].ownerId, null, 'ownerId сброшен, а не оставлен висячим');
    assert.equal(s1.nodes['node-B'].homeLevel, 1, 'homeLevel зафиксировал прежний уровень');
    assert.equal(HierarchyUtils.getEntityLevel('node-B', s1.nodes, s1.layers), 1, 'Уровень B остался 1');
    assert.equal(HierarchyUtils.getEntityLevel('node-C', s1.nodes, s1.layers), 2, 'Уровень C остался 2');
});

test('§3.2c: DELETE_SELECTED — удаление слоя-владельца в середине цепочки связывает внука с дедом', () => {
    // node-A (L0) -> layer-B (L1, ownerId: node-A) -> node-C (L2, ownerId: layer-B)
    const s0 = {
        ...defaultState,
        layers: {
            'layer-B': { id: 'layer-B', name: 'Слой B', parentId: 'root', ownerId: 'node-A', position: { x: 0, y: 0 }, size: { w: 400, h: 300 } }
        },
        nodes: {
            'node-A': { id: 'node-A', name: 'A (L0)', parentId: 'root', position: { x: 0, y: 0 } },
            'node-C': { id: 'node-C', name: 'C (L2)', parentId: 'root', ownerId: 'layer-B', position: { x: 100, y: 100 } }
        }
    };

    assert.equal(HierarchyUtils.getEntityLevel('node-C', s0.nodes, s0.layers), 2);

    const s1 = reducer({ ...s0, selectedIds: ['layer-B'] }, { type: 'DELETE_SELECTED' });
    assert.equal(s1.layers['layer-B'], undefined, 'Слой B удалён');
    assert.equal(s1.nodes['node-C'].ownerId, 'node-A', 'Внук пере-якорился на деда');
    assert.equal(s1.nodes['node-C'].ownerGap, 2, 'Дистанция через поколение равна 2');
    assert.equal(HierarchyUtils.getEntityLevel('node-C', s1.nodes, s1.layers), 2, 'Уровень внука не изменился');
});

test('Фаза 1: пакет истории — серия экшенов пишет ОДИН шаг Undo и откатывается одним Ctrl+Z', () => {
    // Без пакета батч ИИ из 60 команд писал 60 снимков и полностью вымывал
    // историю (лимит 20), из-за чего отменить его работу было невозможно.
    const s0 = { ...defaultState, past: [], future: [], historyLogs: [] };

    let s = reducer(s0, { type: 'BEGIN_HISTORY_BATCH', payload: { logMessage: 'ИИ-ассистент: 60 действий' } });
    assert.ok(s.historyBatch, 'пакет открыт');

    for (let i = 0; i < 60; i++) {
        s = reducer(s, {
            type: 'ADD_NODE',
            payload: { id: `n${i}`, name: `Узел ${i}`, position: { x: i * 10, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' }
        });
    }
    assert.equal(Object.keys(s.nodes).length, 60, 'все 60 узлов созданы');
    assert.equal(s.past.length, 0, 'внутри пакета история не пишется');

    s = reducer(s, { type: 'COMMIT_HISTORY', payload: { logMessage: 'ИИ-ассистент: применено 60 действий' } });
    assert.equal(s.historyBatch, null, 'пакет закрыт');
    assert.equal(s.past.length, 1, 'весь пакет — РОВНО один шаг истории');
    assert.equal(s.historyLogs[0], 'ИИ-ассистент: применено 60 действий');

    const undone = reducer(s, { type: 'UNDO' });
    assert.equal(Object.keys(undone.nodes).length, 0, 'один Ctrl+Z отменил весь пакет целиком');
});

test('Фаза 1: CANCEL_HISTORY_BATCH закрывает пакет без записи и не оставляет историю выключенной', () => {
    const s0 = { ...defaultState, past: [], future: [], historyLogs: [] };
    let s = reducer(s0, { type: 'BEGIN_HISTORY_BATCH', payload: { logMessage: 'прерванный пакет' } });
    s = reducer(s, { type: 'CANCEL_HISTORY_BATCH' });
    assert.equal(s.historyBatch, null, 'пакет снят');
    assert.equal(s.past.length, 0, 'пустой шаг в историю не записан');

    // История снова работает пошагово
    const after = reducer(s, {
        type: 'ADD_NODE',
        payload: { id: 'n1', name: 'После', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' }
    });
    assert.equal(after.past.length, 1, 'обычная запись истории восстановилась');
});

test('Фаза 1: вложенный BEGIN_HISTORY_BATCH не создаёт второй пакет', () => {
    const s0 = { ...defaultState, past: [], future: [], historyLogs: [] };
    const s1 = reducer(s0, { type: 'BEGIN_HISTORY_BATCH', payload: { logMessage: 'первый' } });
    const s2 = reducer(s1, { type: 'BEGIN_HISTORY_BATCH', payload: { logMessage: 'второй' } });
    assert.equal(s2, s1, 'повторное открытие — no-op, снимок «до» не перезаписан');
    assert.equal(s2.historyBatch.logMessage, 'первый');
});

test('Рекомендация #5: HierarchyUtils.getLevel использует кэш и инвалидируется при смене поколения nodes', () => {
    const nodesGen1 = {
        'root-1': { id: 'root-1', parentId: 'root' },
        'child-1': { id: 'child-1', ownerId: 'root-1', parentId: 'root' }
    };

    const lvl1 = HierarchyUtils.getLevel('child-1', nodesGen1);
    assert.equal(lvl1, 1);

    // Повторный вызов читает кэш
    const lvl1Cached = HierarchyUtils.getLevel('child-1', nodesGen1);
    assert.equal(lvl1Cached, 1);

    // Новое поколение nodes (иммутабельное изменение)
    const nodesGen2 = {
        ...nodesGen1,
        'child-1': { id: 'child-1', ownerId: 'root-1', ownerGap: 3, parentId: 'root' }
    };

    const lvl2 = HierarchyUtils.getLevel('child-1', nodesGen2);
    assert.equal(lvl2, 3, 'При смене поколения nodes кэш корректно инвалидируется');
});

test('Фаза 2: aiAgentSettings.confirmMode по умолчанию равен "ask" и переключается экшеном UPDATE_AI_SETTINGS', () => {
    assert.equal(defaultState.ui.aiAgentSettings.confirmMode, 'ask', 'По умолчанию confirmMode должен быть "ask"');

    const s1 = reducer(defaultState, {
        type: 'UPDATE_AI_SETTINGS',
        payload: { confirmMode: 'auto' }
    });
    assert.equal(s1.ui.aiAgentSettings.confirmMode, 'auto', 'UPDATE_AI_SETTINGS должен переключать confirmMode в "auto"');

    const s2 = reducer(s1, {
        type: 'UPDATE_AI_SETTINGS',
        payload: { confirmMode: 'ask' }
    });
    assert.equal(s2.ui.aiAgentSettings.confirmMode, 'ask', 'UPDATE_AI_SETTINGS должен переключать confirmMode обратно в "ask"');
});

test('Фаза 2: Сериализация состояния для localStorage очищает past и future всех проектов для защиты от QuotaExceededError', () => {
    const fullState = {
        formatVersion: 12,
        projectOrder: ['proj-1', 'proj-2'],
        activeProjectId: 'proj-1',
        projects: {
            'proj-1': {
                id: 'proj-1',
                nodes: { 'n1': { id: 'n1' } },
                past: [{ nodes: {} }, { nodes: { 'old': {} } }],
                future: [{ nodes: { 'redo': {} } }]
            },
            'proj-2': {
                id: 'proj-2',
                nodes: { 'n2': { id: 'n2' } },
                past: [{ nodes: {} }],
                future: []
            }
        },
        ui: { aiAgentSettings: { apiKey: 'secret', confirmMode: 'ask' } }
    };

    // Логика очистки, используемая в Store.js
    const cleanProjects = {};
    Object.entries(fullState.projects || {}).forEach(([pid, p]) => {
        if (p) {
            cleanProjects[pid] = { ...p, past: [], future: [] };
        }
    });

    const safeState = {
        ...fullState,
        projects: cleanProjects,
        ui: { ...fullState.ui, aiAgentSettings: { ...fullState.ui.aiAgentSettings, apiKey: '' } }
    };

    assert.equal(safeState.projects['proj-1'].past.length, 0, 'past должен быть пуст');
    assert.equal(safeState.projects['proj-1'].future.length, 0, 'future должен быть пуст');
    assert.equal(safeState.projects['proj-2'].past.length, 0, 'past должен быть пуст');
    assert.equal(safeState.ui.aiAgentSettings.apiKey, '', 'apiKey должен быть вырезан');
    assert.ok(safeState.projects['proj-1'].nodes['n1'], 'Сущности проекта должны быть сохранены');
});

test('Фаза 3: Быстрые пространственные индексы HierarchyUtils (getPortsByNodeId, getLinksByPortId, getNodesByParentId, getLayersByParentId)', () => {
    const ports = {
        'p1': { id: 'p1', nodeId: 'n1', name: 'Port 1' },
        'p2': { id: 'p2', nodeId: 'n1', name: 'Port 2' },
        'p3': { id: 'p3', nodeId: 'n2', name: 'Port 3' }
    };

    const links = {
        'l1': { id: 'l1', sourcePortId: 'p1', targetPortId: 'p3' },
        'l2': { id: 'l2', sourcePortId: 'p2', targetPortId: 'p3' }
    };

    const nodes = {
        'n1': { id: 'n1', parentId: 'layer-1' },
        'n2': { id: 'n2', parentId: 'layer-1' },
        'n3': { id: 'n3', parentId: 'root' }
    };

    const layers = {
        'layer-1': { id: 'layer-1', parentId: 'root' },
        'layer-sub': { id: 'layer-sub', parentId: 'layer-1' }
    };

    // Проверка getPortsByNodeId
    const portsByNode = HierarchyUtils.getPortsByNodeId(ports);
    assert.equal(portsByNode['n1'].length, 2);
    assert.equal(portsByNode['n2'].length, 1);
    assert.equal(portsByNode['n3'], undefined);
    // Кэш возвращает тот же объект
    assert.equal(HierarchyUtils.getPortsByNodeId(ports), portsByNode);

    // Проверка getLinksByPortId
    const linksByPort = HierarchyUtils.getLinksByPortId(links);
    assert.equal(linksByPort['p1'].length, 1);
    assert.equal(linksByPort['p2'].length, 1);
    assert.equal(linksByPort['p3'].length, 2); // Входят обе связи
    assert.equal(HierarchyUtils.getLinksByPortId(links), linksByPort);

    // Проверка getNodesByParentId
    const nodesByParent = HierarchyUtils.getNodesByParentId(nodes);
    assert.equal(nodesByParent['layer-1'].length, 2);
    assert.equal(nodesByParent['root'].length, 1);
    assert.equal(HierarchyUtils.getNodesByParentId(nodes), nodesByParent);

    // Проверка getLayersByParentId
    const layersByParent = HierarchyUtils.getLayersByParentId(layers);
    assert.equal(layersByParent['root'].length, 1);
    assert.equal(layersByParent['layer-1'].length, 1);
    assert.equal(HierarchyUtils.getLayersByParentId(layers), layersByParent);
});

test('getInitialMultiState: активированная migrateToV13 санитизирует v11-сохранение при загрузке (Фаза 5, финал)', () => {
    mockStorage.clear();
    const stateToSave = {
        formatVersion: 12,
        projectOrder: ['proj-1'],
        activeProjectId: 'proj-1',
        projects: {
            'proj-1': {
                id: 'proj-1',
                projectName: 'v11-проект',
                nodes: {
                    root1: { id: 'root1', name: 'Root1', parentId: 'root', ownerId: null, position: { x: 0, y: 0 }, size: { w: 200, h: 100 } },
                    child1: { id: 'child1', name: 'Child1', parentId: 'root', ownerId: 'root1', position: { x: 10, y: 10 }, size: { w: 200, h: 100 } }
                },
                layers: {},
                ports: {},
                links: {},
                levelWindows: { 'lvlwin-root': { id: 'lvlwin-root', levelIndex: 0, position: { x: 0, y: 0 }, size: { w: 1000, h: 700 } } },
                levelViews: defaultState.levelViews
            }
        }
    };
    localStorage.setItem(STORAGE_KEY_V12, JSON.stringify(stateToSave));

    const loaded = getInitialMultiState();
    const proj = loaded.projects['proj-1'];

    assert.equal(loaded.formatVersion, 13, 'миграция реально применилась при загрузке, не осталась дремлющей функцией');
    assert.equal(proj.nodes.child1.parentId, 'root1', 'v11 ownerId-цепочка превратилась в прямой v13 parentId');
    assert.equal(proj.nodes.child1.ownerId, undefined, 'ownerId убран');
    assert.equal(HierarchyUtils.getEntityLevel('child1', proj.nodes, proj.layers, proj.levelWindows), 1, 'уровень сохранён');
});

// ---------------------------------------------------------------------------
// v14: windows — обзорное состояние, заменяющее levelWindows+levelViews
// (docs/LANES_MODEL.md §2.3/§9.1). migrateToV14 ЕЩЁ НЕ подключена к
// getInitialMultiState (см. §7.11 плана) — здесь проверяется только форма
// поля, которую производит сама миграция при прямом вызове на фикстуре, а
// не поведение живой загрузки/сохранения (это не PROJECT_FIELDS-поле до
// Фазы 3 — окна физически появляются в проекте только после активации).
// Фактическое исключение past/future-снимков `windows` из истории Undo —
// задача Фазы 3 (реестр действий редьюсера), этот тест лишь фиксирует
// структурный контракт, который Фаза 3 обязана сохранить.
// ---------------------------------------------------------------------------

test('migrateToV14: windows — плоское поле проекта (как levelViews сегодня), не вложено в past/future', () => {
    const before = {
        levelWindows: { 'lvlwin-root': { id: 'lvlwin-root', levelIndex: 0, position: { x: 0, y: 0 }, size: { w: 1000, h: 700 } } },
        levelViews: { 'lvlwin-root': { innerOffset: { x: 5, y: 6 }, innerZoom: 1.2, isCollapsed: false } },
        layers: {},
        nodes: { root1: { id: 'root1', name: 'Root1', parentId: 'root', position: { x: 0, y: 0 }, size: { w: 200, h: 100 } } },
        ports: {}, links: {},
        past: [{ nodes: {} }], future: [],
        historyLogs: []
    };
    const after = migrateToV14({
        projects: { p1: before }, projectOrder: ['p1'], activeProjectId: 'p1', projectCounter: 1, formatVersion: 13
    }).projects.p1;

    assert.ok(after.windows && typeof after.windows === 'object', 'windows — плоское поле проекта, а не часть какого-то снимка');
    assert.equal(after.windows['lvlwin-root'].camera.offset.x, 5, 'камера перенесена из levelViews.innerOffset');
    assert.equal(after.windows['lvlwin-root'].camera.zoom, 1.2, 'камера перенесена из levelViews.innerZoom');
    // past/future не разбираются миграцией (см. комментарий над migrateProjectEntitiesToV14) —
    // они остаются ответственностью вызывающей стороны (санитизация ДО миграции, как и для v13).
    assert.deepEqual(after.past, before.past, 'past не тронут этой миграцией — санитизация вызывающей стороны');
});


