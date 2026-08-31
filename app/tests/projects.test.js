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
    makeProject, PROJECT_FIELDS, reconcilePendingGateways
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

test('ADD_PROJECT: второй проект со своим пустым Главным холстом, становится активным', () => {
    const m0 = wrapFlatToMulti(makeFlat());
    const firstId = m0.activeProjectId;
    const m1 = multiReducer(m0, { type: 'ADD_PROJECT' });

    assert.equal(m1.projectOrder.length, 2);
    assert.notEqual(m1.activeProjectId, firstId, 'новый проект стал активным');
    const p2 = m1.projects[m1.activeProjectId];
    assert.equal(p2.projectName, 'Проект 2', 'монотонный счётчик имён');
    assert.equal(Object.keys(p2.nodes).length, 0, 'новый проект пуст');
    const wins = Object.values(p2.levelWindows);
    assert.equal(wins.length, 1);
    assert.equal(wins[0].levelIndex, 0, 'один Главный холст');

    const firstWinIds = Object.keys(m1.projects[firstId].levelWindows);
    const secondWinIds = Object.keys(p2.levelWindows);
    assert.equal(firstWinIds.some(id => secondWinIds.includes(id)), false, 'id окон не пересекаются между проектами');
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

test('ADD_PROJECT: окна нового проекта встают ПРАВЕЕ всех существующих окон', () => {
    let m = wrapFlatToMulti(makeFlat());
    const firstWin = Object.values(m.projects[m.activeProjectId].levelWindows)[0];
    const firstRight = firstWin.position.x + firstWin.size.w;

    m = multiReducer(m, { type: 'ADD_PROJECT' });
    const newWin = Object.values(m.projects[m.activeProjectId].levelWindows)[0];
    assert.ok(newWin.position.x >= firstRight, `новое окно (x=${newWin.position.x}) правее кромки первого (x=${firstRight})`);

    // Третий проект — правее второго
    const secondRight = newWin.position.x + newWin.size.w;
    m = multiReducer(m, { type: 'ADD_PROJECT' });
    const thirdWin = Object.values(m.projects[m.activeProjectId].levelWindows)[0];
    assert.ok(thirdWin.position.x >= secondRight, 'третий проект правее второго');
});

test('ADD_PROJECT_FROM_FILE: импорт добавляет проект, не заменяя существующий', () => {
    let m = wrapFlatToMulti(makeFlat());
    const firstId = m.activeProjectId;
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
    const levels = Object.values(imported.levelWindows).map(w => w.levelIndex).sort();
    assert.deepEqual(levels, [0, 1], 'иерархия дала два уровня');

    // Окна импортированного — правее окон первого проекта
    const firstRight = Math.max(...Object.values(m.projects[firstId].levelWindows)
        .map(w => w.position.x + w.size.w));
    Object.values(imported.levelWindows).forEach(w => {
        assert.ok(w.position.x >= firstRight, `окно уровня ${w.levelIndex} правее первого проекта`);
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

test('ALIGN_LEVEL_WINDOWS: выравнивание в СОБСТВЕННОЙ колонке проекта, а не по x=-500', () => {
    let m = wrapFlatToMulti(makeFlat());
    m = multiReducer(m, { type: 'ADD_PROJECT' }); // второй проект правее
    const pid = m.activeProjectId;
    const colX = Object.values(m.projects[pid].levelWindows)[0].position.x;
    assert.ok(colX > -500, 'второй проект стоит правее дефолтной колонки');

    m = multiReducer(m, { type: 'ADD_LEVEL_WINDOW' });
    m = multiReducer(m, { type: 'ALIGN_LEVEL_WINDOWS' });
    Object.values(m.projects[pid].levelWindows).forEach(w => {
        assert.equal(w.position.x, colX, `окно уровня ${w.levelIndex} осталось в колонке проекта (x=${colX})`);
    });
});

test('ADD_LEVEL_WINDOW: новый уровень второго проекта — в его колонке, под нижним окном', () => {
    let m = wrapFlatToMulti(makeFlat());
    m = multiReducer(m, { type: 'ADD_PROJECT' });
    const pid = m.activeProjectId;
    const l0 = Object.values(m.projects[pid].levelWindows)[0];

    m = multiReducer(m, { type: 'ADD_LEVEL_WINDOW' });
    const l1 = Object.values(m.projects[pid].levelWindows).find(w => w.levelIndex === 1);
    assert.equal(l1.position.x, l0.position.x, 'та же колонка');
    assert.ok(l1.position.y >= l0.position.y + l0.size.h, 'ниже нижней кромки L0');
});

test('makeProject: id окна уровня 0 уникален (не lvlwin-root)', () => {
    const p1 = makeProject('proj-x', 'X');
    const p2 = makeProject('proj-y', 'Y');
    const w1 = Object.keys(p1.levelWindows)[0];
    const w2 = Object.keys(p2.levelWindows)[0];
    assert.notEqual(w1, 'lvlwin-root');
    assert.notEqual(w1, w2, 'у разных проектов разные id окон');
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

test('Окна: MOVE_LEVEL_WINDOW и UPDATE_LEVEL_PROPERTIES адресуются по windowId неактивному проекту', () => {
    let m = wrapFlatToMulti(makeFlat());
    const pidA = m.activeProjectId;
    const winA = Object.values(m.projects[pidA].levelWindows)[0];
    const initialPosA = { ...winA.position };

    // Создаем проект B, он становится активным
    m = multiReducer(m, { type: 'ADD_PROJECT' });
    const pidB = m.activeProjectId;
    const winB = Object.values(m.projects[pidB].levelWindows)[0];
    const initialPosB = { ...winB.position };

    // Двигаем окно проекта A по его windowId (когда активен проект B)
    m = multiReducer(m, {
        type: 'MOVE_LEVEL_WINDOW',
        payload: { windowId: winA.id, index: winA.levelIndex, position: { x: 100, y: 200 } }
    });

    assert.deepEqual(m.projects[pidA].levelWindows[winA.id].position, { x: 100, y: 200 }, 'окно проекта A переместилось');
    assert.deepEqual(m.projects[pidB].levelWindows[winB.id].position, initialPosB, 'окно проекта B не сдвинулось');

    // Зумим окно проекта A по его windowId
    m = multiReducer(m, {
        type: 'UPDATE_LEVEL_PROPERTIES',
        payload: {
            windowId: winA.id,
            index: winA.levelIndex,
            updates: { innerZoom: 1.5, innerOffset: { x: 50, y: 50 } }
        }
    });

    const viewA = m.projects[pidA].levelViews[winA.id];
    assert.equal(viewA.innerZoom, 1.5, 'камера проекта A обновилась');
    assert.deepEqual(viewA.innerOffset, { x: 50, y: 50 });
    const viewB = m.projects[pidB].levelViews[winB.id];
    assert.equal(viewB.innerZoom, 1, 'камера проекта B осталась прежней');

    // Сворачиваем окно проекта A по id/windowId (когда активен проект B)
    m = multiReducer(m, {
        type: 'TOGGLE_LEVEL_COLLAPSE',
        payload: { id: winA.id, windowId: winA.id, index: winA.levelIndex }
    });

    assert.equal(m.projects[pidA].levelViews[winA.id].isCollapsed, true, 'окно проекта A свернулось');
    assert.equal(m.projects[pidB].levelViews[winB.id].isCollapsed, false, 'окно проекта B не свернулось');
});

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

test('HierarchyUtils.getExternalProxyPortsForWindow: прокси появляется на правильном окне с обеих сторон', () => {
    const { m: m0, pidA, pidB } = makeTwoProjectsWithPorts();
    const m1 = multiReducer(m0, {
        type: 'ADD_CROSS_PROJECT_LINK',
        payload: { sourceProjectId: pidA, sourcePortId: 'portA1', targetProjectId: pidB, targetPortId: 'portB1' }
    });
    const linkId = Object.keys(m1.crossProjectLinks)[0];
    const winA = Object.values(m1.projects[pidA].levelWindows)[0];
    const winB = Object.values(m1.projects[pidB].levelWindows)[0];

    const proxiesA = HierarchyUtils.getExternalProxyPortsForWindow(winA.id, pidA, m1);
    assert.equal(proxiesA.length, 1);
    assert.equal(proxiesA[0].linkId, linkId);
    assert.equal(proxiesA[0].isExternal, true);
    assert.equal(proxiesA[0].otherProjectId, pidB);
    assert.equal(proxiesA[0].myPortId, 'portA1');

    const proxiesB = HierarchyUtils.getExternalProxyPortsForWindow(winB.id, pidB, m1);
    assert.equal(proxiesB.length, 1);
    assert.equal(proxiesB[0].myPortId, 'portB1');
    assert.equal(proxiesB[0].otherProjectId, pidA);

    // Ручной оверрайд уважается вместо авторасстановки
    const m2 = multiReducer(m1, {
        type: 'UPDATE_CROSS_PROJECT_PROXY_PORT',
        payload: { linkId, windowId: winA.id, edge: 'left', fraction: 0.75 }
    });
    const overridden = HierarchyUtils.getExternalProxyPortsForWindow(winA.id, pidA, m2)[0];
    assert.equal(overridden.edge, 'left');
    assert.equal(overridden.slotFraction, 0.75);

    // Окно без задействованных сущностей связи прокси не получает
    const emptyProxies = HierarchyUtils.getExternalProxyPortsForWindow('unknown-window', pidA, m1);
    assert.deepEqual(emptyProxies, []);
});

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

