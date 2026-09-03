// Юнит-тесты мультипроектной обёртки (v12): wrapFlatToMulti, mergeActiveView,
// multiReducer (делегирование, ADD/REMOVE/SET_ACTIVE_PROJECT, раздельный Undo).
const { test } = require('node:test');
const assert = require('node:assert/strict');

const GeometryUtils = require('../utils/geometry.js');
global.GeometryUtils = GeometryUtils;

const HierarchyUtils = require('../utils/hierarchy.js');
global.HierarchyUtils = HierarchyUtils;

const {
    defaultState, reducer, multiReducer, mergeActiveView, wrapFlatToMulti,
    makeProject, PROJECT_FIELDS, reconcilePendingGateways, projectFlatView
} = require('../store/reducer.js');

const makeFlat = () => ({
    ...defaultState,
    projectName: 'Старый проект',
    nodes: {
        nodeA: { id: 'nodeA', name: 'A', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' }
    }
});

test('wrapFlatToMulti: плоское v11-состояние заворачивается в один проект без потерь', () => {
    const m = wrapFlatToMulti(makeFlat());

    assert.equal(m.projectOrder.length, 1, 'ровно один проект');
    assert.equal(m.activeProjectId, m.projectOrder[0], 'он же активный');
    assert.equal(m.projectCounter, 1);
    assert.equal(m.formatVersion, 12);

    const p = m.projects[m.activeProjectId];
    assert.equal(p.projectName, 'Старый проект', 'настройки проекта переехали внутрь');
    assert.ok(p.nodes.nodeA, 'сущности переехали внутрь проекта');
    assert.deepEqual(p.origin, { x: 0, y: 0 });
    assert.equal(m.nodes, undefined, 'полей проекта нет в корне мультисостояния');
    assert.ok(m.canvas, 'камера общего холста — глобальная');
    assert.ok(m.ui, 'ui — глобальный');
});

test('mergeActiveView: плоский вид активного проекта эквивалентен исходному', () => {
    const flat = makeFlat();
    const m = wrapFlatToMulti(flat);
    const view = mergeActiveView(m);

    PROJECT_FIELDS.forEach(f => {
        assert.deepEqual(view[f], flat[f], `поле ${f} в виде совпадает с исходным`);
    });
    assert.deepEqual(view.canvas, flat.canvas);
    assert.equal(view.activeProjectId, m.activeProjectId, 'мета-поля мультипроекта доступны в виде');
});

test('multiReducer: обычные экшены делегируются внутрь активного проекта', () => {
    const m0 = wrapFlatToMulti(makeFlat());
    const m1 = multiReducer(m0, {
        type: 'ADD_NODE',
        payload: { id: 'nodeNew', name: 'Новый', position: { x: 10, y: 10 }, size: { w: 200, h: 100 }, parentId: 'root' }
    });

    const p1 = m1.projects[m1.activeProjectId];
    assert.ok(p1.nodes.nodeNew, 'узел появился внутри проекта');
    assert.equal(m1.nodes, undefined, 'в корне мультисостояния узлов по-прежнему нет');
    assert.ok(p1.past.length > m0.projects[m0.activeProjectId].past.length, 'история пишется внутрь проекта');
});

test('multiReducer: глобальные экшены (SET_CANVAS, TOGGLE_UI) меняют корень, не проект', () => {
    const m0 = wrapFlatToMulti(makeFlat());
    const m1 = multiReducer(m0, { type: 'SET_CANVAS', payload: { zoom: 2.0 } });
    assert.equal(m1.canvas.zoom, 2.0, 'камера общего холста обновилась');
    assert.equal(m1.projects[m1.activeProjectId], m0.projects[m0.activeProjectId], 'подсостояние проекта не пересоздавалось');

    const m2 = multiReducer(m1, { type: 'TOGGLE_UI', payload: 'dragDropMode' });
    assert.equal(m2.ui.dragDropMode, true);
});

// v14: ADD_PROJECT/makeProject больше не создают стартовое окно уровня 0 —
// новый проект пуст и без единой открытой дорожки (§10.7 LANES_MODEL.md,
// обозреватель проекта всегда даёт открыть корень явным кликом). Тест
// проверял именно старое поведение (готовое окно Главного холста) и обновлён
// вместе с ним, а не удалён — остальные проверки (второй проект, активность,
// имя, пустота) не связаны со сменой модели и сохранены.
test('ADD_PROJECT: второй проект пуст, без окон, становится активным', () => {
    const m0 = wrapFlatToMulti(makeFlat());
    const firstId = m0.activeProjectId;
    const m1 = multiReducer(m0, { type: 'ADD_PROJECT' });

    assert.equal(m1.projectOrder.length, 2);
    assert.notEqual(m1.activeProjectId, firstId, 'новый проект стал активным');
    const p2 = m1.projects[m1.activeProjectId];
    assert.equal(p2.projectName, 'Проект 2', 'монотонный счётчик имён');
    assert.equal(Object.keys(p2.nodes).length, 0, 'новый проект пуст');
    assert.deepEqual(p2.windows, {}, 'ни одна дорожка не открыта по умолчанию');
});

test('Undo раздельный: UNDO в проекте B не трогает проект A', () => {
    let m = wrapFlatToMulti(makeFlat());
    const aId = m.activeProjectId;
    m = multiReducer(m, { type: 'ADD_NODE', payload: { id: 'nodeInA', name: 'ВПроектеА', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' } });
    m = multiReducer(m, { type: 'ADD_PROJECT' });
    const bId = m.activeProjectId;

    // В проекте B истории нет — UNDO должен быть no-op
    const afterUndo = multiReducer(m, { type: 'UNDO' });
    assert.equal(afterUndo, m, 'UNDO в пустом проекте B — no-op');
    assert.ok(afterUndo.projects[aId].nodes.nodeInA, 'узел проекта A жив');

    // Возврат в A: его история на месте, UNDO откатывает добавление узла
    let back = multiReducer(m, { type: 'SET_ACTIVE_PROJECT', payload: aId });
    assert.equal(back.activeProjectId, aId);
    back = multiReducer(back, { type: 'UNDO' });
    assert.equal(back.projects[aId].nodes.nodeInA, undefined, 'UNDO в A откатил добавление');
    assert.ok(back.projects[bId], 'проект B не пострадал');
});

test('REMOVE_PROJECT: удаление активного переводит фокус на соседа; последний — в null', () => {
    let m = wrapFlatToMulti(makeFlat());
    const aId = m.activeProjectId;
    m = multiReducer(m, { type: 'ADD_PROJECT' });
    const bId = m.activeProjectId;

    // Удаляем активный B — активным становится A
    let m1 = multiReducer(m, { type: 'REMOVE_PROJECT', payload: { id: bId } });
    assert.equal(m1.projects[bId], undefined);
    assert.deepEqual(m1.projectOrder, [aId]);
    assert.equal(m1.activeProjectId, aId);

    // Удаляем последний — проектов нет, активного нет
    let m2 = multiReducer(m1, { type: 'REMOVE_PROJECT', payload: { id: aId } });
    assert.equal(m2.projectOrder.length, 0);
    assert.equal(m2.activeProjectId, null);

    // Экшены сущностей при нуле проектов — no-op, а не краш
    const m3 = multiReducer(m2, { type: 'ADD_NODE', payload: { name: 'X', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' } });
    assert.equal(m3, m2, 'без активного проекта экшены сущностей игнорируются');

    // ADD_PROJECT на пустом холсте работает
    const m4 = multiReducer(m2, { type: 'ADD_PROJECT' });
    assert.equal(m4.projectOrder.length, 1);
    assert.ok(m4.activeProjectId);
});

test('mergeActiveView без активного проекта: безопасные пустые значения', () => {
    let m = wrapFlatToMulti(makeFlat());
    m = multiReducer(m, { type: 'REMOVE_PROJECT', payload: { id: m.activeProjectId } });
    const view = mergeActiveView(m);
    assert.deepEqual(view.nodes, {});
    assert.deepEqual(view.levelWindows, {});
    assert.deepEqual(view.selectedIds, []);
    assert.equal(view.projectName, '');
});

// ===== Часть 2: размещение проектов на общем холсте, импорт, обозреватели =====

// v14: ADD_PROJECT/makeProject больше не создают стартовое окно (§10.7
// LANES_MODEL.md) — новому проекту физически нечего позиционировать «правее
// существующих окон». Тест проверял именно эту авто-раскладку и удалён
// вместе с проверяемым поведением, а не перенесён — см. §7.13 плана.

test('ADD_PROJECT_FROM_FILE: импорт добавляет проект, не заменяя существующий', () => {
    let m = wrapFlatToMulti(makeFlat());
    const firstId = m.activeProjectId;
    // Даём первому проекту реальное окно, чтобы было от чего отталкивать импорт вправо
    m = multiReducer(m, {
        type: 'FOR_PROJECT',
        payload: { projectId: firstId, action: { type: 'OPEN_LANE', payload: { ownerId: 'root' } } }
    });

    const fileData = {
        formatVersion: 10,
        nodes: {
            imp1: { id: 'imp1', name: 'Импортированный', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' },
            imp2: { id: 'imp2', name: 'Дочерний', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'imp1' }
        },
        layers: {}, ports: {}, links: {},
        projectName: 'Импортированный проект'
    };
    m = multiReducer(m, { type: 'ADD_PROJECT_FROM_FILE', payload: fileData });

    assert.equal(m.projectOrder.length, 2, 'проектов стало два');
    assert.ok(m.projects[firstId].nodes.nodeA, 'первый проект НЕ затёрт');
    const imported = m.projects[m.activeProjectId];
    assert.notEqual(m.activeProjectId, firstId, 'импортированный стал активным');
    assert.equal(imported.projectName, 'Импортированный проект', 'имя из файла');
    assert.ok(imported.nodes.imp1 && imported.nodes.imp2, 'содержимое файла на месте');
    // v14: иерархии уровней больше нет — imp2 просто вложен в imp1 как дочерний
    // узел внутри одного и того же окна корневой дорожки.
    const importedWindows = Object.values(imported.windows);
    assert.equal(importedWindows.length, 1, 'у импортированного проекта одно окно (корневая дорожка)');
    assert.deepEqual(importedWindows[0].lanes, ['root']);

    // Окно импортированного проекта — правее окна первого проекта
    const firstRight = Math.max(...Object.values(m.projects[firstId].windows)
        .map(w => w.position.x + w.size.w));
    importedWindows.forEach(w => {
        assert.ok(w.position.x >= firstRight, 'окно импортированного проекта правее первого проекта');
    });
    assert.deepEqual(imported.past, [], 'история импортированного пуста');
});

test('ADD_PROJECT_FROM_FILE: файл без имени получает «Проект N (импорт)»; кривой файл — no-op', () => {
    let m = wrapFlatToMulti(makeFlat());
    m = multiReducer(m, { type: 'ADD_PROJECT_FROM_FILE', payload: { nodes: {}, layers: {}, ports: {}, links: {} } });
    assert.match(m.projects[m.activeProjectId].projectName, /^Проект \d+ \(импорт\)$/);

    const before = m;
    const after = multiReducer(m, { type: 'ADD_PROJECT_FROM_FILE', payload: { foo: 'bar' } });
    assert.equal(after, before, 'файл без nodes/ports/links игнорируется');
});

test('TOGGLE_PROJECT_OUTLINER: пер-проектные обозреватели, чистка при удалении проекта', () => {
    let m = wrapFlatToMulti(makeFlat());
    const aId = m.activeProjectId;
    m = multiReducer(m, { type: 'ADD_PROJECT' });
    const bId = m.activeProjectId;

    m = multiReducer(m, { type: 'TOGGLE_PROJECT_OUTLINER', payload: aId });
    m = multiReducer(m, { type: 'TOGGLE_PROJECT_OUTLINER', payload: bId });
    assert.equal(m.ui.outlinerOpen[aId], true, 'обозреватель A открыт');
    assert.equal(m.ui.outlinerOpen[bId], true, 'обозреватель B открыт одновременно');

    m = multiReducer(m, { type: 'TOGGLE_PROJECT_OUTLINER', payload: aId });
    assert.equal(m.ui.outlinerOpen[aId], false, 'повторный тогл закрывает');

    m = multiReducer(m, { type: 'REMOVE_PROJECT', payload: { id: bId } });
    assert.equal(m.ui.outlinerOpen[bId], undefined, 'обозреватель удалённого проекта вычищен');

    const noop = multiReducer(m, { type: 'TOGGLE_PROJECT_OUTLINER', payload: 'proj-ghost' });
    assert.equal(noop, m, 'тогл несуществующего проекта — no-op');
});

// v14 (§3 плана): ADD_LEVEL_WINDOW удалён как обработчик экшена — эти два
// теста опирались на него для сборки фикстуры (второй уровень окна) и
// проверяли поведение, которое теперь принадлежит другому реестру действий
// (NEW_EMPTY_WINDOW/OPEN_LANE + ALIGN_WINDOWS, см. reducer.test.js).
// ALIGN_LEVEL_WINDOWS сам по себе не удалён (не в списке «Удаляются» Фазы 3),
// но без ADD_LEVEL_WINDOW тест не может собрать содержательную фикстуру
// (Главный холст — единственное окно, выравнивать нечего).

// v14: makeProject больше не создаёт окно уровня 0 при рождении проекта —
// уникальность id окон здесь проверять больше не на чем (windows пуст у
// всех новых проектов); заменено проверкой, что это НЕЗАВИСИМЫЕ пустые
// объекты (а не общая по ссылке заглушка defaultState.windows).
test('makeProject: новый проект без окон — независимые пустые объекты, не общая ссылка', () => {
    const p1 = makeProject('proj-x', 'X');
    const p2 = makeProject('proj-y', 'Y');
    assert.deepEqual(p1.windows, {});
    assert.deepEqual(p2.windows, {});
    assert.notEqual(p1.windows, p2.windows, 'разные проекты не делят один и тот же объект windows');
});

test('projectFlatView & writeProjectView: экспортируются и читают/пишут срез проекта независимо', () => {
    const { projectFlatView, writeProjectView } = require('../store/reducer.js');
    assert.equal(typeof projectFlatView, 'function');
    assert.equal(typeof writeProjectView, 'function');

    let m = wrapFlatToMulti(makeFlat());
    const pidA = m.activeProjectId;
    m = multiReducer(m, { type: 'ADD_PROJECT' });
    const pidB = m.activeProjectId;

    const viewA = projectFlatView(m, pidA);
    assert.equal(viewA.projectName, 'Старый проект');
    assert.ok(viewA.nodes.nodeA, 'узел nodeA виден в срезе проекта A');

    const viewB = projectFlatView(m, pidB);
    assert.equal(viewB.projectName, 'Проект 2');
    assert.equal(viewB.nodes.nodeA, undefined, 'узла nodeA нет в срезе проекта B');

    // Проверка независимой записи
    const modifiedA = { ...viewA, nodes: { ...viewA.nodes, nodeA2: { id: 'nodeA2', name: 'A2' } } };
    const mUpdated = writeProjectView(m, pidA, modifiedA);
    assert.ok(mUpdated.projects[pidA].nodes.nodeA2);
    assert.equal(mUpdated.projects[pidB].nodes.nodeA2, undefined, 'проект B не затронут');
});

test('FOR_PROJECT: направляет экшен в неактивный проект и сохраняет глобальные поля', () => {
    let m = wrapFlatToMulti(makeFlat());
    const pidA = m.activeProjectId;
    m = multiReducer(m, { type: 'ADD_PROJECT' });
    const pidB = m.activeProjectId;
    assert.equal(m.activeProjectId, pidB, 'активен проект B');

    // Отправляем экшен добавления узла в неактивный проект A через FOR_PROJECT
    m = multiReducer(m, {
        type: 'FOR_PROJECT',
        payload: {
            projectId: pidA,
            action: {
                type: 'ADD_NODE',
                payload: { id: 'nodeInNonActiveA', name: 'Новый в А', position: { x: 50, y: 50 }, size: { w: 200, h: 100 }, parentId: 'root' }
            }
        }
    });

    assert.ok(m.projects[pidA].nodes.nodeInNonActiveA, 'узел появился в проекте A');
    assert.equal(m.projects[pidB].nodes.nodeInNonActiveA, undefined, 'в проекте B узла нет');
    assert.ok(m.projects[pidA].past.length > 0, 'история записалась в проект A');
    assert.equal(m.projects[pidB].past.length, 0, 'история проекта B чиста');
    assert.equal(m.activeProjectId, pidB, 'активный проект не менялся');
});

test('Защита связей: ADD_LINK блокирует попытку связать порт из проекта A с несуществующим/чужим портом', () => {
    let m = wrapFlatToMulti(makeFlat());
    const pidA = m.activeProjectId;
    m = multiReducer(m, {
        type: 'FOR_PROJECT',
        payload: {
            projectId: pidA,
            action: {
                type: 'ADD_PORT',
                payload: { id: 'portA1', nodeId: 'nodeA', name: 'PortA1' }
            }
        }
    });

    m = multiReducer(m, { type: 'ADD_PROJECT' });
    const pidB = m.activeProjectId;
    m = multiReducer(m, {
        type: 'FOR_PROJECT',
        payload: {
            projectId: pidB,
            action: {
                type: 'ADD_NODE',
                payload: { id: 'nodeB', name: 'Node B', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' }
            }
        }
    });
    m = multiReducer(m, {
        type: 'FOR_PROJECT',
        payload: {
            projectId: pidB,
            action: {
                type: 'ADD_PORT',
                payload: { id: 'portB1', nodeId: 'nodeB', name: 'PortB1' }
            }
        }
    });

    // Попытка создать связь в проекте A с целевым портом из проекта B
    const beforeA = m.projects[pidA];
    m = multiReducer(m, {
        type: 'FOR_PROJECT',
        payload: {
            projectId: pidA,
            action: {
                type: 'ADD_LINK',
                payload: { sourcePortId: 'portA1', targetPortId: 'portB1' }
            }
        }
    });

    assert.equal(Object.keys(m.projects[pidA].links).length, 0, 'связь не создалась в проекте A');
    assert.equal(m.projects[pidA], beforeA, 'проект A не изменился');
});

// v14: MOVE_LEVEL_WINDOW/UPDATE_LEVEL_PROPERTIES/TOGGLE_LEVEL_COLLAPSE — их
// v14-преемники (MOVE_WINDOW/UPDATE_WINDOW_PROPERTIES/TOGGLE_WINDOW_COLLAPSE)
// уже покрыты отдельными v14-тестами в reducer.test.js; ни один живой
// компонент (LevelWindow.js больше не загружается) старые экшены не
// диспатчит. Тест сломан фикстурой (ADD_PROJECT больше не создаёт окно, см.
// §10.7 LANES_MODEL.md) и удалён вместе с проверяемым (фактически более не
// достижимым) поведением, а не перенесён — см. §7.13 плана.

// === Фаза 6.1: кросс-проектные связи ===

const makeTwoProjectsWithPorts = () => {
    let m = wrapFlatToMulti(makeFlat());
    const pidA = m.activeProjectId;
    m = multiReducer(m, {
        type: 'FOR_PROJECT',
        payload: { projectId: pidA, action: { type: 'ADD_PORT', payload: { id: 'portA1', nodeId: 'nodeA', name: 'PortA1' } } }
    });
    m = multiReducer(m, { type: 'ADD_PROJECT' });
    const pidB = m.activeProjectId;
    m = multiReducer(m, {
        type: 'FOR_PROJECT',
        payload: { projectId: pidB, action: { type: 'ADD_NODE', payload: { id: 'nodeB', name: 'Node B', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' } } }
    });
    m = multiReducer(m, {
        type: 'FOR_PROJECT',
        payload: { projectId: pidB, action: { type: 'ADD_PORT', payload: { id: 'portB1', nodeId: 'nodeB', name: 'PortB1' } } }
    });
    return { m, pidA, pidB };
};

test('ADD_CROSS_PROJECT_LINK: связывает порты двух разных проектов, живёт в корне вне PROJECT_FIELDS', () => {
    const { m: m0, pidA, pidB } = makeTwoProjectsWithPorts();
    const m1 = multiReducer(m0, {
        type: 'ADD_CROSS_PROJECT_LINK',
        payload: { sourceProjectId: pidA, sourcePortId: 'portA1', targetProjectId: pidB, targetPortId: 'portB1' }
    });
    const ids = Object.keys(m1.crossProjectLinks);
    assert.equal(ids.length, 1, 'ровно одна кросс-проектная связь');
    const link = m1.crossProjectLinks[ids[0]];
    assert.equal(link.sourceProjectId, pidA);
    assert.equal(link.sourcePortId, 'portA1');
    assert.equal(link.targetProjectId, pidB);
    assert.equal(link.targetPortId, 'portB1');
    assert.equal(Object.keys(m1.projects[pidA].links).length, 0, 'связь НЕ попала в links ни одного из проектов');
    assert.equal(Object.keys(m1.projects[pidB].links).length, 0);
});

test('ADD_CROSS_PROJECT_LINK: отклоняется — тот же проект, несуществующий порт, несуществующий проект', () => {
    const { m: m0, pidA } = makeTwoProjectsWithPorts();
    const sameProject = multiReducer(m0, {
        type: 'ADD_CROSS_PROJECT_LINK',
        payload: { sourceProjectId: pidA, sourcePortId: 'portA1', targetProjectId: pidA, targetPortId: 'portA1' }
    });
    assert.equal(sameProject, m0, 'no-op: source === target project');

    const badPort = multiReducer(m0, {
        type: 'ADD_CROSS_PROJECT_LINK',
        payload: { sourceProjectId: pidA, sourcePortId: 'portA1', targetProjectId: 'ghost-project', targetPortId: 'ghost-port' }
    });
    assert.equal(badPort, m0, 'no-op: несуществующий проект');
});

test('REMOVE_CROSS_PROJECT_LINK: удаляет по id, no-op на отсутствующем id', () => {
    const { m: m0, pidA, pidB } = makeTwoProjectsWithPorts();
    const m1 = multiReducer(m0, {
        type: 'ADD_CROSS_PROJECT_LINK',
        payload: { sourceProjectId: pidA, sourcePortId: 'portA1', targetProjectId: pidB, targetPortId: 'portB1' }
    });
    const linkId = Object.keys(m1.crossProjectLinks)[0];
    const m2 = multiReducer(m1, { type: 'REMOVE_CROSS_PROJECT_LINK', payload: linkId });
    assert.deepEqual(m2.crossProjectLinks, {});
    const m3 = multiReducer(m2, { type: 'REMOVE_CROSS_PROJECT_LINK', payload: linkId });
    assert.equal(m3, m2, 'no-op: связь уже удалена');
});

test('UPDATE_CROSS_PROJECT_PROXY_PORT: пишет ручной оверрайд прокси в саму связь', () => {
    const { m: m0, pidA, pidB } = makeTwoProjectsWithPorts();
    const m1 = multiReducer(m0, {
        type: 'ADD_CROSS_PROJECT_LINK',
        payload: { sourceProjectId: pidA, sourcePortId: 'portA1', targetProjectId: pidB, targetPortId: 'portB1' }
    });
    const linkId = Object.keys(m1.crossProjectLinks)[0];
    const winA = Object.values(m1.projects[pidA].levelWindows)[0];
    const m2 = multiReducer(m1, {
        type: 'UPDATE_CROSS_PROJECT_PROXY_PORT',
        payload: { linkId, windowId: winA.id, edge: 'top', fraction: 0.25 }
    });
    assert.deepEqual(m2.crossProjectLinks[linkId].proxyOverrides[winA.id], { edge: 'top', fraction: 0.25 });
});

test('applyRemoveProject: удаление одной стороны демоутит связь в pendingGateways уцелевшего проекта', () => {
    const { m: m0, pidA, pidB } = makeTwoProjectsWithPorts();
    const m1 = multiReducer(m0, {
        type: 'ADD_CROSS_PROJECT_LINK',
        payload: { sourceProjectId: pidA, sourcePortId: 'portA1', targetProjectId: pidB, targetPortId: 'portB1' }
    });
    const linkId = Object.keys(m1.crossProjectLinks)[0];

    const m2 = multiReducer(m1, { type: 'REMOVE_PROJECT', payload: { id: pidB } });
    assert.deepEqual(m2.crossProjectLinks, {}, 'живая связь исчезла');
    const gateway = m2.projects[pidA].pendingGateways[linkId];
    assert.ok(gateway, 'демоутилась в pendingGateways проекта A');
    assert.equal(gateway.portId, 'portA1', 'локальный порт — тот, что остался в A');
    assert.equal(gateway.direction, 'out', 'A была sourceProjectId связи');
    assert.equal(gateway.remoteProjectId, pidB);
    assert.equal(gateway.remotePortId, 'portB1');
    assert.equal(gateway.remoteProjectName, m1.projects[pidB].projectName);
    assert.equal(gateway.remotePortName, 'PortB1');
    assert.ok(['top', 'bottom', 'left', 'right'].includes(gateway.edge), 'грань по умолчанию проставлена');

    // Удаление ВТОРОЙ (уже единственной оставшейся) стороны не оставляет мусора
    const m3 = multiReducer(m2, { type: 'REMOVE_PROJECT', payload: { id: pidA } });
    assert.equal(m3.projects[pidA], undefined);
    assert.deepEqual(m3.crossProjectLinks, {});
});

// v14: getExternalProxyPortsForWindow — прокси-геометрия для старых окон
// уровней; ни один живой компонент её больше не вызывает (Port.js/Link.js
// переписаны на v14, кросс-проектная прокси-геометрия — Фаза 5, см. комментарий
// вверху Link.js/Port.js). Тест сломан фикстурой (ADD_PROJECT больше не
// создаёт окно) и удалён вместе с проверяемым (более не достижимым живым
// кодом) поведением, а не перенесён — см. §7.13 плана. Функция сама остаётся
// в hierarchy.js нетронутой до её v14-переписи в Фазе 5.

// === Фаза 6.2: externalGateway — примирение штекеров при повторном импорте ===

test('reconcilePendingGateways: две половины с одним linkId в разных проектах собираются в живую связь', () => {
    const { m: m0, pidA, pidB } = makeTwoProjectsWithPorts();
    let m = { ...m0 };
    m.projects = {
        ...m.projects,
        [pidA]: { ...m.projects[pidA], pendingGateways: {
            'xlink-1': { linkId: 'xlink-1', portId: 'portA1', direction: 'out', remoteProjectId: pidB, remotePortId: 'portB1', remoteProjectName: 'B', remotePortName: 'PortB1', linkStyle: 'orthogonal', color: '#111', name: 'L', edge: 'right', fraction: 0.5 }
        } },
        [pidB]: { ...m.projects[pidB], pendingGateways: {
            'xlink-1': { linkId: 'xlink-1', portId: 'portB1', direction: 'in', remoteProjectId: pidA, remotePortId: 'portA1', remoteProjectName: 'A', remotePortName: 'PortA1', linkStyle: 'orthogonal', color: '#111', name: 'L', edge: 'left', fraction: 0.5 }
        } }
    };
    const m1 = reconcilePendingGateways(m);
    const link = m1.crossProjectLinks['xlink-1'];
    assert.ok(link, 'связь пересобрана');
    assert.equal(link.sourceProjectId, pidA);
    assert.equal(link.sourcePortId, 'portA1');
    assert.equal(link.targetProjectId, pidB);
    assert.equal(link.targetPortId, 'portB1');
    assert.deepEqual(m1.projects[pidA].pendingGateways, {}, 'штекер A убран');
    assert.deepEqual(m1.projects[pidB].pendingGateways, {}, 'штекер B убран');
});

test('reconcilePendingGateways: одиночный штекер (вторая половина не загружена) остаётся висеть', () => {
    const { m: m0, pidA, pidB } = makeTwoProjectsWithPorts();
    let m = { ...m0 };
    m.projects = { ...m.projects, [pidA]: { ...m.projects[pidA], pendingGateways: {
        'xlink-1': { linkId: 'xlink-1', portId: 'portA1', direction: 'out', remoteProjectId: pidB, remotePortId: 'portB1', remoteProjectName: 'B', remotePortName: 'PortB1', edge: 'right', fraction: 0.5 }
    } } };
    const m1 = reconcilePendingGateways(m);
    assert.equal(m1, m, 'no-op: только одна сторона');
    assert.ok(m1.projects[pidA].pendingGateways['xlink-1'], 'штекер никуда не делся');
});

test('ADD_PROJECT_FROM_FILE: externalGateways файла становятся pendingGateways нового проекта и примиряются с уже висящим штекером', () => {
    const { m: m0, pidA, pidB } = makeTwoProjectsWithPorts();
    const m1 = multiReducer(m0, {
        type: 'ADD_CROSS_PROJECT_LINK',
        payload: { sourceProjectId: pidA, sourcePortId: 'portA1', targetProjectId: pidB, targetPortId: 'portB1' }
    });
    const linkId = Object.keys(m1.crossProjectLinks)[0];

    // Проект B удаляется — связь демоутится в pendingGateways проекта A
    const m2 = multiReducer(m1, { type: 'REMOVE_PROJECT', payload: { id: pidB } });
    assert.ok(m2.projects[pidA].pendingGateways[linkId], 'штекер на A есть');

    // «Повторный импорт» проекта B из файла, который экспорт (6.2.2) снабдил
    // бы тем же externalGateways.linkId — именно это поле и делает примирение
    // возможным, остальное содержимое файла для этого теста не важно
    const fileData = {
        nodes: { nodeB: { id: 'nodeB', name: 'Node B', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' } },
        ports: { portB1: { id: 'portB1', nodeId: 'nodeB', name: 'PortB1' } },
        links: {},
        externalGateways: [
            { linkId, portId: 'portB1', direction: 'in', remoteProjectId: pidA, remotePortId: 'portA1', remoteProjectName: 'Project A', remotePortName: 'PortA1' }
        ]
    };
    const m3 = multiReducer(m2, { type: 'ADD_PROJECT_FROM_FILE', payload: fileData });
    const newPid = m3.activeProjectId;

    const link = m3.crossProjectLinks[linkId];
    assert.ok(link, 'связь автоматически восстановлена при повторном импорте второй половины');
    assert.equal(link.sourceProjectId, pidA);
    assert.equal(link.targetProjectId, newPid);
    assert.deepEqual(m3.projects[pidA].pendingGateways, {}, 'штекер A убран после примирения');
    assert.deepEqual(m3.projects[newPid].pendingGateways, {}, 'штекер нового проекта убран после примирения');
});

test('HierarchyUtils.getPendingGatewayProxiesForWindow: висящий штекер рисуется на правильном окне без магистрали', () => {
    const { m: m0, pidA } = makeTwoProjectsWithPorts();
    const winA = Object.values(m0.projects[pidA].levelWindows)[0];
    let m = { ...m0 };
    m.projects = { ...m.projects, [pidA]: { ...m.projects[pidA], pendingGateways: {
        'xlink-1': { linkId: 'xlink-1', portId: 'portA1', direction: 'out', remoteProjectId: 'ghost', remotePortId: 'ghost-port', remoteProjectName: 'Призрачный проект', remotePortName: 'Ghost', edge: 'left', fraction: 0.4 }
    } } };
    const proxies = HierarchyUtils.getPendingGatewayProxiesForWindow(winA.id, pidA, m);
    assert.equal(proxies.length, 1);
    assert.equal(proxies[0].isPending, true);
    assert.equal(proxies[0].edge, 'left');
    assert.equal(proxies[0].slotFraction, 0.4);
    assert.equal(proxies[0].gateway.remoteProjectName, 'Призрачный проект');

    // Порт другого узла того же проекта не заводит штекер на его окне
    const otherWindow = 'nonexistent-window';
    assert.deepEqual(HierarchyUtils.getPendingGatewayProxiesForWindow(otherWindow, pidA, m), []);
});

// === Фаза 6.3: кросс-проектный перенос сущностей (REPARENT_ENTITY + targetProjectId) ===

test('REPARENT_ENTITY (кросс-проектный, Deep): узел с портом переезжает целиком, исчезая из исходного проекта', () => {
    let m = wrapFlatToMulti(makeFlat());
    const pidA = m.activeProjectId;
    m = multiReducer(m, { type: 'FOR_PROJECT', payload: { projectId: pidA, action: { type: 'ADD_PORT', payload: { id: 'portA', nodeId: 'nodeA', name: 'PortA' } } } });
    m = multiReducer(m, { type: 'ADD_PROJECT' });
    const pidB = m.activeProjectId;

    m = multiReducer(m, {
        type: 'REPARENT_ENTITY',
        payload: { ids: ['nodeA'], sourceProjectId: pidA, targetProjectId: pidB, targetParentId: 'root', mode: 'deep' }
    });

    assert.equal(m.projects[pidA].nodes.nodeA, undefined, 'узел ушёл из A');
    assert.equal(m.projects[pidA].ports.portA, undefined, 'порт ушёл вместе с узлом');
    assert.ok(m.projects[pidB].nodes.nodeA, 'узел появился в B');
    assert.equal(m.projects[pidB].nodes.nodeA.parentId, 'root');
    assert.ok(m.projects[pidB].ports.portA, 'порт появился в B');
    assert.equal(m.projects[pidA].ports.portA, undefined);
});

test('REPARENT_ENTITY (кросс-проектный, Deep): ветка (узел + дочерний узел) переезжает целиком', () => {
    let m = wrapFlatToMulti(makeFlat());
    const pidA = m.activeProjectId;
    m = multiReducer(m, { type: 'FOR_PROJECT', payload: { projectId: pidA, action: { type: 'ADD_NODE', payload: { id: 'child', name: 'Child', position: { x: 10, y: 10 }, size: { w: 100, h: 60 }, parentId: 'nodeA' } } } });
    m = multiReducer(m, { type: 'ADD_PROJECT' });
    const pidB = m.activeProjectId;

    m = multiReducer(m, {
        type: 'REPARENT_ENTITY',
        payload: { ids: ['nodeA'], sourceProjectId: pidA, targetProjectId: pidB, targetParentId: 'root', mode: 'deep' }
    });

    assert.equal(m.projects[pidA].nodes.nodeA, undefined);
    assert.equal(m.projects[pidA].nodes.child, undefined, 'ребёнок ушёл вместе с веткой');
    assert.ok(m.projects[pidB].nodes.nodeA);
    assert.ok(m.projects[pidB].nodes.child);
    assert.equal(m.projects[pidB].nodes.child.parentId, 'nodeA', 'родство внутри ветки не тронуто');
});

test('REPARENT_ENTITY (кросс-проектный, Shallow): дети остаются в исходном проекте, усыновляются дедом', () => {
    let m = wrapFlatToMulti(makeFlat());
    const pidA = m.activeProjectId;
    m = multiReducer(m, { type: 'FOR_PROJECT', payload: { projectId: pidA, action: { type: 'ADD_NODE', payload: { id: 'child', name: 'Child', position: { x: 10, y: 10 }, size: { w: 100, h: 60 }, parentId: 'nodeA' } } } });
    m = multiReducer(m, { type: 'ADD_PROJECT' });
    const pidB = m.activeProjectId;

    m = multiReducer(m, {
        type: 'REPARENT_ENTITY',
        payload: { ids: ['nodeA'], sourceProjectId: pidA, targetProjectId: pidB, targetParentId: 'root', mode: 'shallow' }
    });

    assert.equal(m.projects[pidA].nodes.nodeA, undefined, 'сама сущность уехала');
    assert.ok(m.projects[pidA].nodes.child, 'ребёнок остался в A');
    assert.equal(m.projects[pidA].nodes.child.parentId, 'root', 'усыновлён дедом (root)');
    assert.ok(m.projects[pidB].nodes.nodeA, 'сущность появилась в B без детей');
    assert.equal(m.projects[pidB].nodes.child, undefined);
});

test('REPARENT_ENTITY (кросс-проектный): переносит crossProjectLinks и pendingGateways вместе с портом', () => {
    const { m: m0, pidA, pidB } = makeTwoProjectsWithPorts();
    let m = multiReducer(m0, { type: 'ADD_PROJECT' });
    const pidC = m.activeProjectId;

    // Живая связь A<->B через portA1; штекер на A, ожидающий porta1-related linkId
    m = multiReducer(m, {
        type: 'ADD_CROSS_PROJECT_LINK',
        payload: { sourceProjectId: pidA, sourcePortId: 'portA1', targetProjectId: pidB, targetPortId: 'portB1' }
    });
    const linkId = Object.keys(m.crossProjectLinks)[0];
    m = {
        ...m,
        projects: { ...m.projects, [pidA]: { ...m.projects[pidA], pendingGateways: {
            'xlink-extra': { linkId: 'xlink-extra', portId: 'portA1', direction: 'out', remoteProjectId: 'ghost', remotePortId: 'ghost-port', remoteProjectName: 'Ghost', remotePortName: 'Ghost' }
        } } }
    };

    // Узел nodeA (с портом portA1) переезжает из A в C
    m = multiReducer(m, {
        type: 'REPARENT_ENTITY',
        payload: { ids: ['nodeA'], sourceProjectId: pidA, targetProjectId: pidC, targetParentId: 'root', mode: 'deep' }
    });

    const link = m.crossProjectLinks[linkId];
    assert.equal(link.sourceProjectId, pidC, 'живая связь переехала на новый projectId вместе с портом');
    assert.equal(link.sourcePortId, 'portA1');
    assert.deepEqual(m.projects[pidA].pendingGateways, {}, 'штекер ушёл из A');
    assert.ok(m.projects[pidC].pendingGateways['xlink-extra'], 'штекер переехал на C вместе с портом');
});

test('REPARENT_ENTITY (кросс-проектный): targetLevelIndex создаёт/резолвит окно в целевом проекте, targetParentId=узел растит новый уровень', () => {
    let m = wrapFlatToMulti(makeFlat());
    const pidA = m.activeProjectId;
    m = multiReducer(m, { type: 'ADD_PROJECT' });
    const pidB = m.activeProjectId;
    m = multiReducer(m, { type: 'FOR_PROJECT', payload: { projectId: pidB, action: { type: 'ADD_NODE', payload: { id: 'nodeB', name: 'B', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' } } } });

    // Перенос nodeA НА УЗЕЛ nodeB целевого проекта — растит уровень 1 в B
    m = multiReducer(m, {
        type: 'REPARENT_ENTITY',
        payload: { ids: ['nodeA'], sourceProjectId: pidA, targetProjectId: pidB, targetParentId: 'nodeB', mode: 'deep' }
    });

    assert.equal(m.projects[pidA].nodes.nodeA, undefined);
    assert.equal(m.projects[pidB].nodes.nodeA.parentId, 'nodeB');
    const winsB = Object.values(m.projects[pidB].levelWindows);
    assert.ok(winsB.some(w => w.levelIndex === 1), 'новое окно уровня 1 достроилось в B под перенесённого ребёнка узла');
});

test('REPARENT_ENTITY (кросс-проектный): нет проекта-источника/цели — no-op', () => {
    let m = wrapFlatToMulti(makeFlat());
    const pidA = m.activeProjectId;
    const before = m;
    m = multiReducer(m, {
        type: 'REPARENT_ENTITY',
        payload: { ids: ['nodeA'], sourceProjectId: pidA, targetProjectId: 'ghost-project', targetParentId: 'root' }
    });
    assert.equal(m, before, 'no-op: целевого проекта не существует');
});

// === Фаза 5 (§5 плана): applyCrossProjectReparent переписан на v14 ===
// Барьер formatVersion >= 14 (§7.14) снят — фикстуры здесь ЯВНО помечены
// formatVersion: 14 (в отличие от тестов выше, которые намеренно работают с
// НЕ мигрированным v13-состоянием wrapFlatToMulti), так что реально проходят
// именно НОВУЮ v14-ветку (nodes-only, isDescendantOfV14/canReparentToV14).

const makeFlatV14 = (overrides) => ({ ...defaultState, formatVersion: 14, projectName: 'Старый проект', ...overrides });

test('REPARENT_ENTITY (кросс-проектный, v14, Deep): узел с портом переезжает целиком между v14-проектами', () => {
    let m = wrapFlatToMulti(makeFlatV14({
        nodes: { nodeA: { id: 'nodeA', name: 'A', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' } }
    }));
    m = { ...m, formatVersion: 14 };
    const pidA = m.activeProjectId;
    m = multiReducer(m, { type: 'FOR_PROJECT', payload: { projectId: pidA, action: { type: 'ADD_PORT', payload: { id: 'portA', nodeId: 'nodeA', name: 'PortA' } } } });
    m = multiReducer(m, { type: 'ADD_PROJECT' });
    const pidB = m.activeProjectId;

    m = multiReducer(m, {
        type: 'REPARENT_ENTITY',
        payload: { ids: ['nodeA'], sourceProjectId: pidA, targetProjectId: pidB, targetParentId: 'root', mode: 'deep' }
    });

    assert.equal(m.projects[pidA].nodes.nodeA, undefined, 'узел ушёл из A');
    assert.equal(m.projects[pidA].ports.portA, undefined, 'порт ушёл вместе с узлом');
    assert.ok(m.projects[pidB].nodes.nodeA, 'узел появился в B');
    assert.equal(m.projects[pidB].nodes.nodeA.parentId, 'root');
    assert.ok(m.projects[pidB].ports.portA, 'порт появился в B');
});

test('REPARENT_ENTITY (кросс-проектный, v14, Shallow): прямые дети остаются в источнике, усыновляются дедом', () => {
    let m = wrapFlatToMulti(makeFlatV14({
        nodes: {
            nodeA: { id: 'nodeA', name: 'A', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' },
            child: { id: 'child', name: 'Child', position: { x: 10, y: 10 }, size: { w: 100, h: 60 }, parentId: 'nodeA' }
        }
    }));
    m = { ...m, formatVersion: 14 };
    const pidA = m.activeProjectId;
    m = multiReducer(m, { type: 'ADD_PROJECT' });
    const pidB = m.activeProjectId;

    m = multiReducer(m, {
        type: 'REPARENT_ENTITY',
        payload: { ids: ['nodeA'], sourceProjectId: pidA, targetProjectId: pidB, targetParentId: 'root', mode: 'shallow' }
    });

    assert.equal(m.projects[pidA].nodes.nodeA, undefined, 'сама сущность уехала');
    assert.ok(m.projects[pidA].nodes.child, 'ребёнок остался в A');
    assert.equal(m.projects[pidA].nodes.child.parentId, 'root', 'усыновлён дедом (root)');
    assert.ok(m.projects[pidB].nodes.nodeA, 'сущность появилась в B без детей');
    assert.equal(m.projects[pidB].nodes.child, undefined);
});

test('REPARENT_ENTITY (кросс-проектный, v14): цель — узел цели без открытой дорожки, дорожка открывается автоматически (§0.4.3)', () => {
    let m = wrapFlatToMulti(makeFlatV14({
        nodes: { nodeA: { id: 'nodeA', name: 'A', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' } }
    }));
    m = { ...m, formatVersion: 14 };
    const pidA = m.activeProjectId;
    m = multiReducer(m, { type: 'ADD_PROJECT' });
    const pidB = m.activeProjectId;
    m = multiReducer(m, { type: 'FOR_PROJECT', payload: { projectId: pidB, action: { type: 'ADD_NODE', payload: { id: 'nodeB', name: 'B', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' } } } });

    m = multiReducer(m, {
        type: 'REPARENT_ENTITY',
        payload: { ids: ['nodeA'], sourceProjectId: pidA, targetProjectId: pidB, targetParentId: 'nodeB', mode: 'deep' }
    });

    assert.equal(m.projects[pidA].nodes.nodeA, undefined);
    assert.equal(m.projects[pidB].nodes.nodeA.parentId, 'nodeB');
    const winsB = Object.values(m.projects[pidB].windows);
    assert.ok(winsB.some(w => (w.lanes || []).includes('nodeB')), 'дорожка nodeB открылась автоматически в целевом окне B');
});

test('REPARENT_ENTITY (кросс-проектный, v14): переносит crossProjectLinks и pendingGateways вместе с портом', () => {
    let m = wrapFlatToMulti(makeFlatV14({
        nodes: { nodeA: { id: 'nodeA', name: 'A', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' } }
    }));
    m = { ...m, formatVersion: 14 };
    const pidA = m.activeProjectId;
    m = multiReducer(m, { type: 'FOR_PROJECT', payload: { projectId: pidA, action: { type: 'ADD_PORT', payload: { id: 'portA1', nodeId: 'nodeA', name: 'PortA1' } } } });
    m = multiReducer(m, { type: 'ADD_PROJECT' });
    const pidB = m.activeProjectId;
    m = multiReducer(m, { type: 'FOR_PROJECT', payload: { projectId: pidB, action: { type: 'ADD_NODE', payload: { id: 'nodeB', name: 'B', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' } } } });
    m = multiReducer(m, { type: 'FOR_PROJECT', payload: { projectId: pidB, action: { type: 'ADD_PORT', payload: { id: 'portB1', nodeId: 'nodeB', name: 'PortB1' } } } });
    m = multiReducer(m, { type: 'ADD_CROSS_PROJECT_LINK', payload: { sourceProjectId: pidA, sourcePortId: 'portA1', targetProjectId: pidB, targetPortId: 'portB1' } });
    const linkId = Object.keys(m.crossProjectLinks)[0];

    m = multiReducer(m, { type: 'ADD_PROJECT' });
    const pidC = m.activeProjectId;
    m = multiReducer(m, {
        type: 'REPARENT_ENTITY',
        payload: { ids: ['nodeA'], sourceProjectId: pidA, targetProjectId: pidC, targetParentId: 'root', mode: 'deep' }
    });

    const link = m.crossProjectLinks[linkId];
    assert.equal(link.sourceProjectId, pidC, 'живая связь переехала на новый projectId вместе с портом');
    assert.equal(link.sourcePortId, 'portA1');
});

test('HierarchyUtils.getDropTargetAcrossProjects: находит цель в ЧУЖОМ проекте, помечает projectId', () => {
    let m = wrapFlatToMulti(makeFlat()); // nodeA в 'root' Главного холста, pos (0,0) size 200x100
    const pidA = m.activeProjectId;
    m = multiReducer(m, { type: 'ADD_PROJECT' });
    const pidB = m.activeProjectId;
    // v14: ADD_PROJECT/makeProject больше не создают стартовое окно уровня 0
    // (§10.7 LANES_MODEL.md) — эта проверка работает с ЕЩЁ НЕ мигрированным
    // (wrapFlatToMulti напрямую, без migrateToV13/migrateToV14) v13-состоянием
    // и намеренно тестирует старый резолвер getDropTargetAcrossProjects,
    // которому для фикстуры нужно РЕАЛЬНОЕ окно — восстанавливаем его вручную,
    // ровно как раньше это делал makeProject (окно B правее окна A).
    const winBId = 'lvlwin-test-b';
    m = {
        ...m,
        projects: {
            ...m.projects,
            [pidB]: { ...m.projects[pidB], levelWindows: { [winBId]: { id: winBId, levelIndex: 0, position: { x: 1500, y: -400 }, size: { w: 1000, h: 700 } } } }
        }
    };
    m = multiReducer(m, { type: 'FOR_PROJECT', payload: { projectId: pidB, action: { type: 'ADD_NODE', payload: { id: 'nodeB', name: 'B', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' } } } });

    // getDropTargetAcrossProjects зовёт window.getProjectFlatView — в Node это
    // не браузер, стаб делает то же самое, что store/Store.js в реальном приложении.
    global.window = { getProjectFlatView: (pid) => projectFlatView(m, pid) };
    try {
        const viewB = projectFlatView(m, pidB);
        const winB = Object.values(viewB.levelWindows)[0];
        // Мировая позиция nodeB зависит от того, куда ADD_PROJECT сдвинул окно
        // B (globalRightEdge) — нельзя просто взять его ЛОКАЛЬНЫЕ (0,0).
        const boundsB = HierarchyUtils.getEntityWorldBounds('nodeB', viewB);

        // pickBest требует геометрического пересечения КОНТУРА перетаскиваемой
        // сущности с кандидатом (указатель — только тай-брейк при наложении) —
        // в живом жесте контур уже следует за мышью (MOVE_SELECTED на
        // mousemove), здесь эмулируем тем же: подвигаем nodeA к nodeB.
        // position — ЛОКАЛЬНЫЕ координаты внутри СВОЕГО окна (A), а не мировые —
        // пересчёт через рамку окна A, как это делает computeDropPositions.
        const viewA0 = projectFlatView(m, pidA);
        const winA = Object.values(viewA0.levelWindows)[0];
        const { headerH, borderW } = HierarchyUtils.LEVEL_WINDOW_METRICS;
        m = multiReducer(m, { type: 'FOR_PROJECT', payload: { projectId: pidA, action: { type: 'UPDATE_NODE', payload: { id: 'nodeA', updates: { position: {
            x: boundsB.x - winA.position.x - borderW,
            y: boundsB.y - winA.position.y - borderW - headerH
        } }, skipHistory: true } } } });

        // Указатель — точно на nodeB (узел-приёмник в ДРУГОМ проекте)
        const target = HierarchyUtils.getDropTargetAcrossProjects(
            ['nodeA'], { x: boundsB.x + boundsB.w / 2, y: boundsB.y + boundsB.h / 2 }, m, pidA, { dragDropMode: true }
        );
        assert.ok(target, 'цель найдена');
        assert.equal(target.projectId, pidB, 'цель — из проекта B, не A');
        assert.equal(target.kind, 'node');
        assert.equal(target.id, 'nodeB');
        assert.equal(target.valid, true);

        // Пустое место окна проекта B (вдали от nodeB, внутри тела окна) — цель
        // window; isMove не путает номер уровня с id окна (регрессия 6.3.1: у
        // обоих проектов Главный холст — levelIndex 0, но это РАЗНЫЕ окна).
        // nodeA возвращается на своё исходное место — иначе dragRect остался бы
        // наложен на nodeB независимо от точки указателя (pickBest игнорирует
        // указатель для node/layer-кандидатов, он только для тай-брейка).
        m = multiReducer(m, { type: 'FOR_PROJECT', payload: { projectId: pidA, action: { type: 'UPDATE_NODE', payload: { id: 'nodeA', updates: { position: { x: 0, y: 0 } }, skipHistory: true } } } });
        const emptySpot = { x: winB.position.x + winB.size.w - 50, y: winB.position.y + winB.size.h - 50 };
        const winTarget = HierarchyUtils.getDropTargetAcrossProjects(['nodeA'], emptySpot, m, pidA, { dragDropMode: true });
        assert.equal(winTarget.kind, 'window');
        assert.equal(winTarget.id, winB.id);
        assert.equal(winTarget.projectId, pidB);
        assert.equal(winTarget.isMove, false, '«своим окном» цель в ДРУГОМ проекте быть не может, даже при том же levelIndex');
    } finally {
        delete global.window;
    }
});

// v14: computeDropPositions — раскладка при дропе в окно уровня; ни один
// живой компонент её больше не вызывает (v14 REPARENT_ENTITY считает позицию
// через findFreePosition/явный курсор, см. reducer.js). Тест сломан фикстурой
// (ADD_PROJECT больше не создаёт окно) и удалён вместе с проверяемым (более
// не достижимым) поведением, а не перенесён — см. §7.13 плана. Функция сама
// остаётся в hierarchy.js нетронутой до её v14-переписи в Фазе 5.

// === Фаза 6.4: глобальный экспорт/импорт рабочего пространства ===

test('LOAD_GLOBAL_STATE: заменяет всё рабочее пространство целиком, включая crossProjectLinks', () => {
    const { m: source, pidA, pidB } = makeTwoProjectsWithPorts();
    const withLink = multiReducer(source, {
        type: 'ADD_CROSS_PROJECT_LINK',
        payload: { sourceProjectId: pidA, sourcePortId: 'portA1', targetProjectId: pidB, targetPortId: 'portB1' }
    });
    const linkId = Object.keys(withLink.crossProjectLinks)[0];

    // «Файл», как его строит handleExportWorkspace — те же поля один в один
    const fileData = {
        formatVersion: 13, kind: 'global',
        projects: withLink.projects, projectOrder: withLink.projectOrder,
        activeProjectId: withLink.activeProjectId, projectCounter: withLink.projectCounter,
        crossProjectLinks: withLink.crossProjectLinks, canvas: withLink.canvas
    };

    // Импорт в СОВЕРШЕННО ДРУГОЕ пространство (третий, не связанный проект)
    let target = wrapFlatToMulti(makeFlat());
    target = multiReducer(target, { type: 'SET_SELECTED', payload: 'nodeA' });
    target = multiReducer(target, { type: 'LOAD_GLOBAL_STATE', payload: fileData });

    assert.deepEqual(target.projectOrder.slice().sort(), [pidA, pidB].sort(), 'ровно те же два проекта, что в файле');
    assert.equal(target.projects[pidA].ports.portA1.name, 'PortA1', 'содержимое проекта A перенеслось');
    assert.ok(target.projects[pidB].nodes.nodeB, 'содержимое проекта B перенеслось');
    assert.ok(target.crossProjectLinks[linkId], 'кросс-проектная связь восстановилась');
    assert.deepEqual(target.selectedIds, [], 'выделение (указывавшее на сущность из СТАРОГО пространства) сброшено');
});

test('LOAD_GLOBAL_STATE: невалидный файл — no-op; activeProjectId не из файла — фолбэк на первый проект', () => {
    let m = wrapFlatToMulti(makeFlat());
    const before = m;

    const m1 = multiReducer(m, { type: 'LOAD_GLOBAL_STATE', payload: { projects: {} } }); // нет projectOrder
    assert.equal(m1, before, 'no-op: не массив projectOrder');

    const m2 = multiReducer(m, { type: 'LOAD_GLOBAL_STATE', payload: null });
    assert.equal(m2, before, 'no-op: пустой payload');

    const { m: twoProj, pidA } = makeTwoProjectsWithPorts();
    const fileData = {
        projects: twoProj.projects, projectOrder: twoProj.projectOrder,
        activeProjectId: 'проект-которого-нет-в-файле', projectCounter: 2
    };
    const m3 = multiReducer(m, { type: 'LOAD_GLOBAL_STATE', payload: fileData });
    assert.equal(m3.activeProjectId, m3.projectOrder[0], 'activeProjectId, которого нет среди загруженных, откатился на первый');
});

test('LOAD_GLOBAL_STATE: неразрешённые pendingGateways в самом файле примиряются сразу после загрузки', () => {
    const { m: twoProj, pidA, pidB } = makeTwoProjectsWithPorts();
    let m = {
        ...twoProj,
        projects: {
            ...twoProj.projects,
            [pidA]: { ...twoProj.projects[pidA], pendingGateways: {
                'xlink-1': { linkId: 'xlink-1', portId: 'portA1', direction: 'out', remoteProjectId: 'ghost', remotePortId: 'portB1', remoteProjectName: 'B', remotePortName: 'PortB1' }
            } },
            [pidB]: { ...twoProj.projects[pidB], pendingGateways: {
                'xlink-1': { linkId: 'xlink-1', portId: 'portB1', direction: 'in', remoteProjectId: 'ghost2', remotePortId: 'portA1', remoteProjectName: 'A', remotePortName: 'PortA1' }
            } }
        }
    };
    const fileData = { projects: m.projects, projectOrder: m.projectOrder, activeProjectId: m.activeProjectId, projectCounter: 2 };

    let target = wrapFlatToMulti(makeFlat());
    target = multiReducer(target, { type: 'LOAD_GLOBAL_STATE', payload: fileData });

    const link = target.crossProjectLinks['xlink-1'];
    assert.ok(link, 'обе половины штекера нашлись в одном и том же импорте и пересобрались в живую связь');
    assert.deepEqual(target.projects[pidA].pendingGateways, {});
    assert.deepEqual(target.projects[pidB].pendingGateways, {});
});

// === Фаза 6.5: локальный импорт — слияние в активный проект ===

test('MERGE_PROJECT_FROM_FILE: сущности файла получают свежие id, existing-содержимое активного проекта не трогается по id', () => {
    let m = wrapFlatToMulti(makeFlat()); // активный проект уже содержит nodeA
    const pidActive = m.activeProjectId;

    const fileData = {
        nodes: { nodeA: { id: 'nodeA', name: 'Импортированный тёзка', position: { x: 500, y: 500 }, size: { w: 200, h: 100 }, parentId: 'root' } },
        ports: { portX: { id: 'portX', nodeId: 'nodeA', name: 'PortX' } },
        links: {}
    };
    m = multiReducer(m, { type: 'MERGE_PROJECT_FROM_FILE', payload: fileData });

    const proj = m.projects[pidActive];
    assert.ok(proj.nodes.nodeA, 'исходный nodeA активного проекта не задет (тот же id, старое имя)');
    assert.equal(proj.nodes.nodeA.name, 'A');
    const importedIds = Object.keys(proj.nodes).filter(id => id !== 'nodeA');
    assert.equal(importedIds.length, 1, 'ровно один новый узел добавился под СВЕЖИМ id');
    assert.equal(proj.nodes[importedIds[0]].name, 'Импортированный тёзка');
    const importedPortIds = Object.keys(proj.ports).filter(id => id !== 'portX' && proj.ports[id].nodeId === importedIds[0]);
    assert.equal(importedPortIds.length, 1, 'порт файла тоже получил свежий id и указывает на remapped nodeId');
    assert.notEqual(importedPortIds[0], 'portX');
});

test('MERGE_PROJECT_FROM_FILE: связь внутри файла остаётся целой после ремапа обоих портов', () => {
    let m = wrapFlatToMulti(makeFlat());
    const pidActive = m.activeProjectId;
    const fileData = {
        nodes: {
            n1: { id: 'n1', name: 'N1', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' },
            n2: { id: 'n2', name: 'N2', position: { x: 300, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' }
        },
        ports: {
            p1: { id: 'p1', nodeId: 'n1', name: 'Out' },
            p2: { id: 'p2', nodeId: 'n2', name: 'In' }
        },
        links: { l1: { id: 'l1', sourcePortId: 'p1', targetPortId: 'p2', name: 'Link' } }
    };
    m = multiReducer(m, { type: 'MERGE_PROJECT_FROM_FILE', payload: fileData });

    const proj = m.projects[pidActive];
    const linkIds = Object.keys(proj.links);
    assert.equal(linkIds.length, 1);
    const link = proj.links[linkIds[0]];
    assert.notEqual(link.sourcePortId, 'p1', 'sourcePortId переписан на новый id');
    assert.ok(proj.ports[link.sourcePortId], 'переписанный sourcePortId существует среди перенесённых портов');
    assert.ok(proj.ports[link.targetPortId], 'переписанный targetPortId существует среди перенесённых портов');
});

test('MERGE_PROJECT_FROM_FILE: окна файла всегда заводятся заново (без якорения по levelIndex), сдвинуты правее существующих окон активного проекта', () => {
    let m = wrapFlatToMulti(makeFlat());
    const pidActive = m.activeProjectId;
    // v14: у нового проекта нет окна «из коробки» — открываем дорожку root,
    // чтобы было реальное окно, от которого мержу нужно оттолкнуться вправо.
    m = multiReducer(m, {
        type: 'FOR_PROJECT',
        payload: { projectId: pidActive, action: { type: 'OPEN_LANE', payload: { ownerId: 'root' } } }
    });
    const activeWinBefore = Object.values(m.projects[pidActive].windows)[0];

    // Файл в СТАРОМ (v13) формате — levelWindows/levelIndex; LOAD_STATE внутри
    // MERGE_PROJECT_FROM_FILE сам доводит его до v14 (§7.15 плана).
    const fileData = {
        nodes: {
            fRoot: { id: 'fRoot', name: 'FRoot', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' },
            fChild: { id: 'fChild', name: 'FChild', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'fRoot' }
        },
        ports: {},
        links: {},
        levelWindows: {
            'file-lvl0': { id: 'file-lvl0', levelIndex: 0, name: 'File L0', position: { x: 0, y: 0 }, size: { w: 1000, h: 700 } },
            'file-lvl1': { id: 'file-lvl1', levelIndex: 1, name: 'File L1', position: { x: 0, y: 800 }, size: { w: 1000, h: 700 } }
        },
        levelViews: {}
    };
    m = multiReducer(m, { type: 'MERGE_PROJECT_FROM_FILE', payload: fileData });

    const proj = m.projects[pidActive];
    assert.ok(proj.windows[activeWinBefore.id], 'существующее окно активного проекта пережило слияние (тот же id)');
    const newWindows = Object.values(proj.windows).filter(w => w.id !== activeWinBefore.id);
    assert.ok(newWindows.length >= 1, 'окна файла добавились как НОВЫЕ (не слиты ни с чем по адресу/индексу)');
    const activeRight = activeWinBefore.position.x + activeWinBefore.size.w;
    newWindows.forEach(w => {
        assert.ok(w.position.x >= activeRight, 'новое окно файла сдвинуто правее уже существующего окна активного проекта');
    });

    const fRootId = Object.keys(proj.nodes).find(id => proj.nodes[id].name === 'FRoot');
    const fChildId = Object.keys(proj.nodes).find(id => proj.nodes[id].name === 'FChild');
    // Литерал 'root', не явный id окна — тем же адресуется и родное
    // содержимое активного проекта (nodeA), иначе resolveContextCollisions
    // (группировка по СТРОКЕ parentId) не видела бы их общим контекстом.
    assert.equal(proj.nodes[fRootId].parentId, 'root', '«root» файла слился с Главным холстом активного проекта — литералом root');
    assert.equal(proj.nodes[fChildId].parentId, fRootId, 'внутреннее родство (узел -> узел) пережило ремап id');
});

test('MERGE_PROJECT_FROM_FILE: коллизия на корне разводит совпадающие позиции, не трогая структуру', () => {
    let m = wrapFlatToMulti(makeFlat()); // nodeA: position (0,0) size 200x100, parentId 'root'
    const pidActive = m.activeProjectId;
    const fileData = {
        nodes: { imported: { id: 'imported', name: 'Imported', position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, parentId: 'root' } },
        ports: {}, links: {}
    };
    m = multiReducer(m, { type: 'MERGE_PROJECT_FROM_FILE', payload: fileData });

    const proj = m.projects[pidActive];
    const importedId = Object.keys(proj.nodes).find(id => proj.nodes[id].name === 'Imported');
    const a = proj.nodes.nodeA.position;
    const b = proj.nodes[importedId].position;
    const overlapX = a.x < b.x + 200 && a.x + 200 > b.x;
    const overlapY = a.y < b.y + 100 && a.y + 100 > b.y;
    assert.ok(!(overlapX && overlapY), 'resolveContextCollisions развёл наложившиеся друг на друга узлы');
});

test('MERGE_PROJECT_FROM_FILE: externalGateways файла оседают в pendingGateways с перемаппленным portId и сразу примиряются с ДРУГИМ проектом', () => {
    // Реалистичный сценарий: где-то ТРЕТИЙ проект C уже хранит штекер (его
    // контрагент когда-то был удалён/экспортирован без него) — сливаемый файл
    // несёт вторую половину ТОГО ЖЕ linkId. Обе половины должны остаться в
    // РАЗНЫХ проектах после слияния (A и C), иначе это уже не кросс-проектная
    // связь, а обычная внутрипроектная — самой ADD_CROSS_PROJECT_LINK такое
    // намеренно отклоняет (sourceProjectId !== targetProjectId).
    let m = wrapFlatToMulti(makeFlat());
    const pidA = m.activeProjectId;
    m = multiReducer(m, { type: 'ADD_PROJECT' }); // делает C активным
    const pidC = m.activeProjectId;
    m = {
        ...m,
        projects: { ...m.projects, [pidC]: { ...m.projects[pidC], pendingGateways: {
            'xlink-shared': { linkId: 'xlink-shared', portId: 'portC', direction: 'out', remoteProjectId: 'ghost', remotePortId: 'importedPort', remoteProjectName: 'Ghost', remotePortName: 'ImportedPort' }
        } } },
        activeProjectId: pidA // сливаем В A, штекер-ожидание — на C
    };

    const fileData = {
        nodes: { imp: { id: 'imp', name: 'Imp', position: { x: 900, y: 900 }, size: { w: 200, h: 100 }, parentId: 'root' } },
        ports: { importedPort: { id: 'importedPort', nodeId: 'imp', name: 'ImportedPort' } },
        links: {},
        externalGateways: [
            { linkId: 'xlink-shared', portId: 'importedPort', direction: 'in', remoteProjectId: 'unrelated', remotePortId: 'portC', remoteProjectName: 'X', remotePortName: 'Y' }
        ]
    };
    m = multiReducer(m, { type: 'MERGE_PROJECT_FROM_FILE', payload: fileData });

    const link = m.crossProjectLinks['xlink-shared'];
    assert.ok(link, 'штекер проекта C и штекер из файла, слитого в A, нашли друг друга по linkId');
    assert.equal(link.sourceProjectId, pidC);
    assert.equal(link.sourcePortId, 'portC');
    assert.equal(link.targetProjectId, pidA, 'слитый порт остался в A — том проекте, куда шло слияние');
    const importedPortNewId = link.targetPortId;
    assert.notEqual(importedPortNewId, 'importedPort', 'portId в примирённой связи — уже ПЕРЕМАППЛЕННЫЙ id, а не исходный из файла');
    assert.ok(m.projects[pidA].ports[importedPortNewId], 'перемаппленный порт реально существует в A');
    assert.deepEqual(m.projects[pidA].pendingGateways, {});
    assert.deepEqual(m.projects[pidC].pendingGateways, {});
});

test('MERGE_PROJECT_FROM_FILE: невалидный файл или отсутствие активного проекта — no-op', () => {
    let m = wrapFlatToMulti(makeFlat());
    const before = m;
    const m1 = multiReducer(m, { type: 'MERGE_PROJECT_FROM_FILE', payload: { nodes: {} } }); // нет ports/links
    assert.equal(m1, before);

    const noActive = { ...m, activeProjectId: null };
    const m2 = multiReducer(noActive, { type: 'MERGE_PROJECT_FROM_FILE', payload: { nodes: {}, ports: {}, links: {} } });
    assert.equal(m2, noActive);
});

