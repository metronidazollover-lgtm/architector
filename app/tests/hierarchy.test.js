const { test } = require('node:test');
const assert = require('node:assert/strict');

const HierarchyUtils = require('../utils/hierarchy.js');

// v14 (Фаза 6): getChildrenStats/getChildrenBBox/getEntityDepth и их фикстуры
// (nodes/layers/ports/links вверху файла) удалены вместе с проверяемыми
// функциями — v13-only, не имеют живого вызывающего места (см. census Фазы 6:
// hierarchy.js оставляет только getDepth/getChildrenByParent как v14-аналоги,
// уже покрытые тестами в v14-разделе этого файла).

test('Cross-level connection detection: глубокий узел B2 отслеживает связь с родителем B', () => {
    const projNodes = {
        nodeB: { id: 'nodeB', parentId: 'root' },
        nodeB1: { id: 'nodeB1', parentId: 'nodeB' },
        nodeB2: { id: 'nodeB2', parentId: 'nodeB1' }
    };
    const projPorts = {
        portB1: { id: 'portB1', nodeId: 'nodeB1' },
        portB_for_B1: { id: 'portB_for_B1', nodeId: 'nodeB' },
        portB2: { id: 'portB2', nodeId: 'nodeB2' },
        portB_for_B2: { id: 'portB_for_B2', nodeId: 'nodeB' }
    };
    const projLinks = {
        linkB2ToB: { id: 'linkB2ToB', sourcePortId: 'portB2', targetPortId: 'portB_for_B2' }
    };

    const selectedIds = ['nodeB'];
    const isConnectedToSelectedNode = (nodeId) => {
        return Object.values(projLinks).some(l => {
            if (!l) return false;
            const sPort = projPorts[l.sourcePortId];
            const tPort = projPorts[l.targetPortId];
            if (!sPort || !tPort) return false;
            if (selectedIds.includes(sPort.nodeId) && tPort.nodeId === nodeId) return true;
            if (selectedIds.includes(tPort.nodeId) && sPort.nodeId === nodeId) return true;
            return false;
        });
    };

    assert.equal(isConnectedToSelectedNode('nodeB2'), true);
});

// ============================================================
// Связь через поколение (ownerGap)
// ============================================================

test('getLevel: ownerGap задаёт связь через поколение — владелец на 2+ уровня выше', () => {
    const nodes = {
        grandpa: { id: 'grandpa', parentId: 'root' },
        // Внук привязан к деду напрямую, но живёт двумя уровнями ниже
        grandson: { id: 'grandson', parentId: 'root', ownerId: 'grandpa', ownerGap: 2 },
        // Правнук — обычный ребёнок внука
        greatGrandson: { id: 'greatGrandson', parentId: 'root', ownerId: 'grandson' }
    };
    assert.equal(HierarchyUtils.getLevel('grandpa', nodes), 0);
    assert.equal(HierarchyUtils.getLevel('grandson', nodes), 2, 'дистанция 2 перепрыгивает пустое поколение');
    assert.equal(HierarchyUtils.getLevel('greatGrandson', nodes), 3, 'дистанции по цепочке складываются');
});

test('getOwnerGap: отсутствие поля и мусорные значения схлопываются в 1', () => {
    assert.equal(HierarchyUtils.getOwnerGap({}), 1);
    assert.equal(HierarchyUtils.getOwnerGap(null), 1);
    assert.equal(HierarchyUtils.getOwnerGap({ ownerGap: 1 }), 1);
    assert.equal(HierarchyUtils.getOwnerGap({ ownerGap: 0 }), 1);
    assert.equal(HierarchyUtils.getOwnerGap({ ownerGap: -3 }), 1);
    assert.equal(HierarchyUtils.getOwnerGap({ ownerGap: NaN }), 1);
    assert.equal(HierarchyUtils.getOwnerGap({ ownerGap: 2.9 }), 2, 'дробные значения усекаются вниз');
    assert.equal(HierarchyUtils.getOwnerGap({ ownerGap: 3 }), 3);
});

// v14 (Фаза 6): getAddContext (ownerGap-наследование), весь блок
// «Drag & Drop» (getDropTarget/computeDropPositions/buildTransferConfirmText),
// getSmartLayerPlacement/bubbleUpLayerResize, hasContainerAncestorIn и
// canReparentTo удалены вместе с проверяемыми функциями — v13-only, живого
// пути вызова не осталось (см. census Фазы 6). v14-аналог резолвера —
// HierarchyUtils.resolveDropTarget, v14-аналог canReparentTo —
// canReparentToV14 — оба уже покрыты тестами в v14-разделе этого файла.

// getLevel (в отличие от canReparentTo/getAddContext выше) остаётся
// ПОСТОЯННЫМ звеном цепочки миграций (migrateProjectEntitiesToV13 вызывает
// его напрямую) — эти тесты проверяют именно тот путь, которым мигратор
// вычисляет уровень v13-сироты-якоря по номеру уровня её окна.
test('getLevel: parentId = id окна уровня — сирота-якорь на v13, уровень читается из окна напрямую', () => {
    const levelWindows = {
        w0: { id: 'w0', levelIndex: 0 },
        w2: { id: 'w2', levelIndex: 2 }
    };
    const v13Nodes = {
        anchor2: { id: 'anchor2', name: 'Anchor2', parentId: 'w2' },
        childOfAnchor: { id: 'childOfAnchor', name: 'ChildOfAnchor', parentId: 'anchor2' }
    };
    assert.equal(HierarchyUtils.getLevel('anchor2', v13Nodes, {}, levelWindows), 2);
    // Дочерний узел якоря — на уровень ниже, как обычный узел-родитель
    assert.equal(HierarchyUtils.getLevel('childOfAnchor', v13Nodes, {}, levelWindows), 3);
});

test('getLevel: без levelWindows (старые вызовы) поведение не меняется — parentId, указывающий на неизвестный id, трактуется как раньше', () => {
    const v13Nodes = { anchor2: { id: 'anchor2', name: 'Anchor2', parentId: 'w2' } };
    // Нет ни ownerId, ни homeLevel, ни windows — падает в ветку «истинный сирота» = 0
    assert.equal(HierarchyUtils.getLevel('anchor2', v13Nodes, {}), 0);
});

test('getLevel: v13-цепочка узел-в-узле (parentId напрямую на node, ownerId отсутствует) считает уровень так же, как обычное родство', () => {
    const v13Nodes = {
        root1: { id: 'root1', name: 'Root1', parentId: 'root' },
        child1: { id: 'child1', name: 'Child1', parentId: 'root1' },
        grandchild1: { id: 'grandchild1', name: 'Grandchild1', parentId: 'child1' }
    };
    assert.equal(HierarchyUtils.getLevel('root1', v13Nodes, {}), 0);
    assert.equal(HierarchyUtils.getLevel('child1', v13Nodes, {}), 1);
    assert.equal(HierarchyUtils.getLevel('grandchild1', v13Nodes, {}), 2);
});

// =============================================================================
// v14 («Отчеты, аудиты, планы/Lanes_v14/PLAN_V14_LANES.md»): дорожки/окна/
// рамки. Фикстуры строятся через HierarchyUtils.parseNotation — состояние в
// нотации, а не JSON руками (§1 плана / §3 docs/LANES_MODEL.md).
// =============================================================================

const TEXT_BASIC = [
    'ДЕРЕВО',
    '/A',
    '/A/A1',
    '/A/A1/A2',
    '/Б',
    '/Б/Б1',
    '',
    'ОКНА',
    'W1 = [Проект]',
    'W2 = [A | ~Б]',
    '',
    'РАМКИ',
    'Датчики = {A1, Б1}',
    '',
    'СВЯЗИ',
    'A1.out -> Б1.in'
].join('\n');

test('v14 parseNotation/dumpNotation: раунд-трип воспроизводит идентичный текст', () => {
    const state = HierarchyUtils.parseNotation(TEXT_BASIC);
    assert.deepEqual(Object.keys(state.nodes).sort(), ['A', 'A1', 'A2', 'Б', 'Б1']);
    assert.equal(state.nodes.A1.parentId, 'A');
    assert.equal(state.nodes.A2.parentId, 'A1');
    assert.equal(state.windows.W2.lanes.length, 2);
    assert.deepEqual(state.windows.W2.hidden, ['Б']);
    assert.deepEqual(state.frames['Датчики'].members, ['A1', 'Б1']);
    assert.equal(state.frames['Датчики'].homeLaneId, 'A', 'домашняя дорожка = дорожка первого члена');
    assert.equal(Object.keys(state.links).length, 1);

    const dumped = HierarchyUtils.dumpNotation(state);
    assert.equal(dumped, TEXT_BASIC);
    // Повторный парсинг дампа даёт структурно то же самое состояние (раунд-трип).
    const reparsed = HierarchyUtils.parseNotation(dumped);
    assert.deepEqual(Object.keys(reparsed.nodes).sort(), Object.keys(state.nodes).sort());
    assert.equal(reparsed.nodes.A2.parentId, state.nodes.A2.parentId);
});

test('v14 parseNotation: коллизия имён узлов в разных ветках разводится суффиксом #2', () => {
    const text = ['ДЕРЕВО', '/X/A1', '/Y/A1'].join('\n');
    const state = HierarchyUtils.parseNotation(text);
    assert.ok(state.nodes.A1, 'первый A1 — под голым именем');
    assert.ok(state.nodes['A1#2'], 'второй A1 — с суффиксом');
    assert.equal(state.nodes.A1.parentId, 'X');
    assert.equal(state.nodes['A1#2'].parentId, 'Y');
    assert.equal(state.nodes.A1.name, 'A1', 'name без суффикса — суффикс только для разрешения ссылок');
    assert.equal(state.nodes['A1#2'].name, 'A1');

    const dumped = HierarchyUtils.dumpNotation(state);
    assert.match(dumped, /\/X\/A1(?!#)/);
    assert.match(dumped, /\/Y\/A1#2/);
});

test('v14 getDepth: прямые дети корня — глубина 1, дальше растёт на единицу; слоёв в цепочке больше нет', () => {
    const state = HierarchyUtils.parseNotation(TEXT_BASIC);
    assert.equal(HierarchyUtils.getDepth('A', state.nodes), 1);
    assert.equal(HierarchyUtils.getDepth('A1', state.nodes), 2);
    assert.equal(HierarchyUtils.getDepth('A2', state.nodes), 3);
    assert.equal(HierarchyUtils.getDepth('root', state.nodes), 0);
    assert.equal(HierarchyUtils.getDepth('ghost', state.nodes), 0, 'неизвестный id — защитный fallback 0');
});

test('v14 getPath: цепочка id от корневого предка до узла', () => {
    const state = HierarchyUtils.parseNotation(TEXT_BASIC);
    assert.deepEqual(HierarchyUtils.getPath('A2', state.nodes), ['A', 'A1', 'A2']);
    assert.deepEqual(HierarchyUtils.getPath('A', state.nodes), ['A']);
});

test('v14 getChildrenByParent / framesOf: индексы по parentId и по членству в рамках', () => {
    const state = HierarchyUtils.parseNotation(TEXT_BASIC);
    const byParent = HierarchyUtils.getChildrenByParent(state.nodes);
    assert.deepEqual(byParent.root.map(n => n.id).sort(), ['A', 'Б']);
    assert.deepEqual(byParent.A.map(n => n.id), ['A1']);
    // Кэш по ссылке на словарь (WeakMap) — тот же объект второй раз не пересчитывается.
    assert.equal(HierarchyUtils.getChildrenByParent(state.nodes), byParent);

    const framesOfA1 = HierarchyUtils.framesOf('A1', state.frames);
    assert.equal(framesOfA1.length, 1);
    assert.equal(framesOfA1[0].id, 'Датчики');
    assert.deepEqual(HierarchyUtils.framesOf('A2', state.frames), [], 'A2 не член ни одной рамки');
});

test('v14 isDescendantOfV14: только узлы, без слоёв в цепочке; защита от циклов', () => {
    const state = HierarchyUtils.parseNotation(TEXT_BASIC);
    assert.equal(HierarchyUtils.isDescendantOfV14('A2', 'A', state.nodes), true);
    assert.equal(HierarchyUtils.isDescendantOfV14('A2', 'A2', state.nodes), true, 'сам себе — тоже true (кандидат === предок)');
    assert.equal(HierarchyUtils.isDescendantOfV14('A', 'A2', state.nodes), false);
    assert.equal(HierarchyUtils.isDescendantOfV14('Б1', 'A', state.nodes), false);

    const cyclic = { x: { id: 'x', parentId: 'y' }, y: { id: 'y', parentId: 'x' } };
    assert.equal(HierarchyUtils.isDescendantOfV14('x', 'z', cyclic), false, 'цикл не должен зациклить поиск');
});

test('v14 canReparentToV14: self/cycle/not-found/valid — только узел или root целью', () => {
    const state = HierarchyUtils.parseNotation(TEXT_BASIC);
    assert.deepEqual(HierarchyUtils.canReparentToV14('A1', 'A1', state.nodes), { ok: false, reason: 'self' });
    assert.deepEqual(HierarchyUtils.canReparentToV14('A', 'A2', state.nodes), { ok: false, reason: 'cycle' }, 'A2 — потомок A, вложение образует цикл');
    assert.deepEqual(HierarchyUtils.canReparentToV14('A1', 'ghost', state.nodes), { ok: false, reason: 'not-found' });
    assert.deepEqual(HierarchyUtils.canReparentToV14('ghost', 'root', state.nodes), { ok: false, reason: 'not-found' });
    assert.deepEqual(HierarchyUtils.canReparentToV14('A2', 'Б', state.nodes), { ok: true, reason: null });
    assert.deepEqual(HierarchyUtils.canReparentToV14('A2', 'root', state.nodes), { ok: true, reason: null });
});

test('v14 windowsOfLane / laneOffset / laneRect: корень шире, скрытая дорожка — полоска 26px', () => {
    const state = HierarchyUtils.parseNotation(TEXT_BASIC);
    assert.deepEqual(HierarchyUtils.windowsOfLane('A', state.windows).map(w => w.id), ['W2']);
    assert.deepEqual(HierarchyUtils.windowsOfLane('root', state.windows).map(w => w.id), ['W1']);
    assert.deepEqual(HierarchyUtils.windowsOfLane('ghost', state.windows), []);

    const win = state.windows.W2; // lanes: ['A', 'Б'], hidden: ['Б']
    assert.equal(HierarchyUtils.laneOffset(win, 'A'), 0);
    assert.equal(HierarchyUtils.laneOffset(win, 'Б'), HierarchyUtils.LANE_W, 'дорожка A не корневая — обычная ширина LANE_W');

    const rectA = HierarchyUtils.laneRect(win, 'A');
    assert.equal(rectA.w, HierarchyUtils.LANE_W);
    const rectB = HierarchyUtils.laneRect(win, 'Б');
    assert.equal(rectB.w, HierarchyUtils.HIDDEN_LANE_W, 'скрытая «глазом» дорожка сжата до полоски');
    assert.equal(rectB.x, rectA.x + HierarchyUtils.LANE_W);

    const rootWin = state.windows.W1;
    const rootRect = HierarchyUtils.laneRect(rootWin, 'root');
    assert.equal(rootRect.w, HierarchyUtils.ROOT_LANE_W, 'корневая дорожка шире обычной');
});

test('v14 nodeRectInWindow / nodeWorldRect: узел без открытой дорожки нигде не отображается', () => {
    const state = HierarchyUtils.parseNotation(TEXT_BASIC);
    // A1 — прямой член дорожки A, открытой в W2
    const rect = HierarchyUtils.nodeRectInWindow(state.windows.W2, 'A1', state);
    assert.ok(rect && rect.w > 0 && rect.h > 0);

    // A2 — дорожка его родителя A1 нигде не открыта (W2 показывает только 'A')
    assert.equal(HierarchyUtils.nodeRectInWindow(state.windows.W2, 'A2', state), null);
    assert.equal(HierarchyUtils.nodeWorldRect('A2', state), null, 'узел без открытой дорожки родителя не отображается нигде — инвариант §2.3');

    // nodeWorldRect выбирает окно, где дорожка реально открыта
    assert.deepEqual(HierarchyUtils.nodeWorldRect('A1', state), HierarchyUtils.nodeRectInWindow(state.windows.W2, 'A1', state));
});

test('v14 fragmentRect: bbox членов рамки в конкретной дорожке, с отступом FRAME_PAD; exceptId исключает узел', () => {
    const state = HierarchyUtils.parseNotation(TEXT_BASIC);
    // Оба члена рамки «Датчики» (A1, Б1) НЕ в одной дорожке (A1 в дорожке A, Б1 в дорожке root)
    const fragInA = HierarchyUtils.fragmentRect(state.windows.W2, 'A', 'Датчики', state);
    assert.ok(fragInA, 'A1 лежит в дорожке A — кусок есть');
    const a1 = state.nodes.A1;
    assert.equal(fragInA.x, a1.position.x - HierarchyUtils.FRAME_PAD);
    assert.equal(fragInA.y, a1.position.y - HierarchyUtils.FRAME_PAD);
    assert.equal(fragInA.w, a1.size.w + HierarchyUtils.FRAME_PAD * 2);

    const fragExcluded = HierarchyUtils.fragmentRect(state.windows.W2, 'A', 'Датчики', state, 'A1');
    assert.equal(fragExcluded, null, 'единственный член куска исключён exceptId — куска нет');

    const fragInRoot = HierarchyUtils.fragmentRect(state.windows.W1, 'root', 'Датчики', state);
    assert.equal(fragInRoot, null, 'ни один член рамки не лежит НЕПОСРЕДСТВЕННО в дорожке root (Б1 лежит в дорожке Б) — куска там нет');
});

test('v14 getWorldTransformV14: мировые координаты и масштаб узла через окно+дорожку', () => {
    const state = HierarchyUtils.parseNotation(TEXT_BASIC);
    const t = HierarchyUtils.getWorldTransformV14('A1', state);
    const rect = HierarchyUtils.nodeRectInWindow(state.windows.W2, 'A1', state);
    assert.equal(t.x, rect.x);
    assert.equal(t.y, rect.y);
    assert.equal(t.scale, 1);
    assert.deepEqual(HierarchyUtils.getWorldTransformV14('root', state), { x: 0, y: 0, scale: 1.0 });
    assert.deepEqual(HierarchyUtils.getWorldTransformV14('A2', state), { x: 0, y: 0, scale: 1.0 }, 'дорожка не открыта — безопасный дефолт, не null');
});

test('v14 getPortWorldPositionV14: порт узла и порт рамки (на куске домашней дорожки)', () => {
    const state = HierarchyUtils.parseNotation(TEXT_BASIC);
    const portOnNode = HierarchyUtils.getPortWorldPositionV14('A1-out', state);
    assert.ok(portOnNode && Number.isFinite(portOnNode.x) && Number.isFinite(portOnNode.y));

    // Порт на рамке: homeLaneId рамки «Датчики» — 'A' (дорожка первого члена A1)
    const framePorts = { 'frame-port': { id: 'frame-port', nodeId: 'Датчики', type: 'output', edge: 'right', position: 0.5 } };
    const withFramePort = { ...state, ports: { ...state.ports, ...framePorts } };
    const framePortPos = HierarchyUtils.getPortWorldPositionV14('frame-port', withFramePort);
    assert.ok(framePortPos, 'порт рамки резолвится через кусок в homeLaneId');

    assert.equal(HierarchyUtils.getPortWorldPositionV14('ghost-port', state), null);
});

test('v14 getPortWorldPositionV14: домашняя дорожка рамки без видимых членов — порт на первом непустом куске', () => {
    // Рамка с homeLaneId='Б' (никакой член не лежит в дорожке 'Б', дорожка 'Б' даже не открыта нигде),
    // но реальный член A1 лежит в открытой дорожке 'A' — порт должен найтись там.
    const state = HierarchyUtils.parseNotation(TEXT_BASIC);
    state.frames['Пустой дом'] = { id: 'Пустой дом', name: 'Пустой дом', members: ['A1'], homeLaneId: 'Б' };
    const port = { id: 'p-empty-home', nodeId: 'Пустой дом', type: 'output', edge: 'right', position: 0.5 };
    const withPort = { ...state, ports: { ...state.ports, [port.id]: port } };
    const pos = HierarchyUtils.getPortWorldPositionV14('p-empty-home', withPort);
    assert.ok(pos, 'найден на первом непустом куске (дорожка A), а не null');
});

test('v14 getAddContextV14: multi-select недоступен, один выделенный узел — его собственная дорожка, иначе activeLaneId/root', () => {
    const state = HierarchyUtils.parseNotation(TEXT_BASIC);
    assert.deepEqual(
        HierarchyUtils.getAddContextV14({ ...state, selectedIds: ['A1', 'Б1'] }),
        { ok: false, parentId: null, reason: 'multi-select' }
    );
    assert.deepEqual(
        HierarchyUtils.getAddContextV14({ ...state, selectedIds: ['A1'] }),
        { ok: true, parentId: 'A', reason: null }
    );
    assert.deepEqual(
        HierarchyUtils.getAddContextV14({ ...state, selectedIds: [], activeLaneId: 'Б' }),
        { ok: true, parentId: 'Б', reason: null }
    );
    assert.deepEqual(
        HierarchyUtils.getAddContextV14({ ...state, selectedIds: [] }),
        { ok: true, parentId: 'root', reason: null }
    );
});

test('v14 resolveDropTarget: карточка узла в своей дорожке — валидное вложение (Nest)', () => {
    const state = HierarchyUtils.parseNotation(TEXT_BASIC);
    const rect = HierarchyUtils.nodeRectInWindow(state.windows.W2, 'A1', state);
    const pointer = { x: rect.x + 5, y: rect.y + 5 };
    const result = HierarchyUtils.resolveDropTarget(pointer, ['Б1'], state, { dragDropMode: true });
    assert.deepEqual(result, { ok: true, windowId: 'W2', nodeId: 'A1' });
});

test('v14 resolveDropTarget: карточка, где переносимый уже прямой ребёнок — same-parent', () => {
    const state = HierarchyUtils.parseNotation(TEXT_BASIC);
    const rect = HierarchyUtils.nodeRectInWindow(state.windows.W2, 'A1', state);
    const pointer = { x: rect.x + 5, y: rect.y + 5 };
    const result = HierarchyUtils.resolveDropTarget(pointer, ['A2'], state, { dragDropMode: true });
    assert.deepEqual(result, { ok: false, reason: 'same-parent', windowId: 'W2', nodeId: 'A1' });
});

test('v14 resolveDropTarget: карточка при выключенном тумблере — dnd-off', () => {
    const state = HierarchyUtils.parseNotation(TEXT_BASIC);
    const rect = HierarchyUtils.nodeRectInWindow(state.windows.W2, 'A1', state);
    const pointer = { x: rect.x + 5, y: rect.y + 5 };
    const result = HierarchyUtils.resolveDropTarget(pointer, ['Б1'], state, { dragDropMode: false });
    assert.deepEqual(result, { ok: false, reason: 'dnd-off', windowId: 'W2', nodeId: 'A1' });
});

test('v14 resolveDropTarget: перетаскиваемый и его потомки исключены из целей (цикл)', () => {
    const state = HierarchyUtils.parseNotation(TEXT_BASIC);
    const a1rect = HierarchyUtils.nodeRectInWindow(state.windows.W2, 'A1', state);
    const pointer = { x: a1rect.x + 5, y: a1rect.y + 5 };
    // Перетаскиваем A (родитель A1) на карточку A1 (потомок) — A1 исключён,
    // резолвер проваливается до фона дорожки A, где A === сама дорожка -> self.
    const result = HierarchyUtils.resolveDropTarget(pointer, ['A'], state, { dragDropMode: true });
    assert.deepEqual(result, { ok: false, reason: 'self', windowId: 'W2', ownerId: 'A' });
});

test('v14 resolveDropTarget: фон своей дорожки — обычное перемещение (isMove), без проверки цикла', () => {
    const state = HierarchyUtils.parseNotation(TEXT_BASIC);
    const laneRect = HierarchyUtils.laneRect(state.windows.W2, 'A');
    // A1 сам лежит в дорожке A (его parentId === 'A') — пустая точка вдали от
    // его собственной карточки (которая сидит в (0,0) этой дорожки).
    assert.equal(state.nodes.A1.parentId, 'A');
    const pointer = { x: laneRect.x + 380, y: laneRect.y + 380 };
    const result = HierarchyUtils.resolveDropTarget(pointer, ['A1'], state, { dragDropMode: true });
    assert.deepEqual(result, { ok: true, windowId: 'W2', ownerId: 'A', isMove: true });
});

test('v14 resolveDropTarget: фон ЧУЖОЙ дорожки — Extract/Nest на владельца дорожки, требует тумблер', () => {
    const state = HierarchyUtils.parseNotation(TEXT_BASIC);
    const win1Root = HierarchyUtils.laneRect(state.windows.W1, 'root');
    // Вдали от карточки A (которая сама лежит в дорожке root окна W1, в (0,0))
    const pointer = { x: win1Root.x + 380, y: win1Root.y + 380 };
    // A2 сейчас в дорожке A1 (нигде не открыта) — переносим в открытую дорожку root окна W1
    assert.deepEqual(
        HierarchyUtils.resolveDropTarget(pointer, ['A2'], state, { dragDropMode: false }),
        { ok: false, reason: 'dnd-off', windowId: 'W1', ownerId: 'root' }
    );
    const result = HierarchyUtils.resolveDropTarget(pointer, ['A2'], state, { dragDropMode: true });
    assert.deepEqual(result, { ok: true, windowId: 'W1', ownerId: 'root' });
});

test('v14 resolveDropTarget: дроп в кусок рамки добавляет frameId к результату', () => {
    const state = HierarchyUtils.parseNotation(TEXT_BASIC);
    // Кусок рамки «Датчики» в дорожке A — вокруг карточки A1 (единственного члена там,
    // A1 в (0,0) 200x100). Точка у нижне-правого края отступа куска (215,115):
    // внутри куска (край до 220,120), но уже ЗА пределами самой карточки A1 (до 200,100),
    // и в положительной части дорожки (не выходит за левую/верхнюю границу самой дорожки).
    const point = { x: 215, y: 115 };
    const world = HierarchyUtils.laneLocalToWorld(state.windows.W2, 'A', point);
    const result = HierarchyUtils.resolveDropTarget(world, ['Б1'], state, { dragDropMode: true });
    assert.equal(result.ok, true);
    assert.equal(result.frameId, 'Датчики');
    assert.equal(result.ownerId, 'A');
});

test('v14 resolveDropTarget: свёрнутое окно не принимает дроп; пустота мира — null-цель', () => {
    const state = HierarchyUtils.parseNotation(TEXT_BASIC);
    const collapsedState = { ...state, windows: { ...state.windows, W2: { ...state.windows.W2, collapsed: true } } };
    const rect = HierarchyUtils.laneRect(state.windows.W2, 'A');
    assert.deepEqual(
        HierarchyUtils.resolveDropTarget({ x: rect.x + 5, y: rect.y + 5 }, ['Б1'], collapsedState, { dragDropMode: true }),
        { ok: false, reason: 'collapsed', windowId: 'W2' }
    );
    assert.deepEqual(
        HierarchyUtils.resolveDropTarget({ x: -99999, y: -99999 }, ['Б1'], state, { dragDropMode: true }),
        { ok: false, reason: 'empty' }
    );
});

test('v14 getLinksCrossingWindows / getProxyIndexForWindowV14: связь межоконная, если дорожки концов показаны в разных окнах', () => {
    // A живёт в дорожке root (открыта в W1); A1 (ребёнок A) живёт в дорожке A
    // (открыта в W2) — разные окна для двух концов связи.
    const text = ['ДЕРЕВО', '/A', '/A/A1', 'ОКНА', 'W1 = [Проект]', 'W2 = [A]', 'СВЯЗИ', 'A.out -> A1.in'].join('\n');
    const state = HierarchyUtils.parseNotation(text);
    const byWindow = HierarchyUtils.getLinksCrossingWindows(state);
    assert.ok(byWindow.W1 && byWindow.W1.some(e => e.link.id === 'link-1'), 'связь межоконная в W1 (там видна только A, в её собственной дорожке root)');
    assert.ok(byWindow.W2 && byWindow.W2.some(e => e.link.id === 'link-1'), 'связь межоконная и в W2 (там видна только A1, в дорожке A)');

    const idx = HierarchyUtils.getProxyIndexForWindowV14('W1', state);
    assert.ok(idx['link-1']);
    assert.equal(idx['link-1'].isSource, true, 'A — источник, значит W1 (где показан A) видит "я источник"');
    const idx2 = HierarchyUtils.getProxyIndexForWindowV14('W2', state);
    assert.equal(idx2['link-1'].isSource, false, 'A1 — приёмник, W2 видит "я приёмник"');
});

test('v14 getLinksCrossingWindows: связь ВНУТРИ одного окна не считается межоконной нигде', () => {
    const text = ['ДЕРЕВО', '/A', '/Б', 'ОКНА', 'W1 = [A | Б]', 'СВЯЗИ', 'A.out -> Б.in'].join('\n');
    const state = HierarchyUtils.parseNotation(text);
    const byWindow = HierarchyUtils.getLinksCrossingWindows(state);
    assert.deepEqual(byWindow, {}, 'обе дорожки в ОДНОМ окне W1 — связь внутренняя, не пересекает окна');
});
