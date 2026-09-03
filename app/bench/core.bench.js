// Бенчмарк чистого ядра: иерархия, индексы, редьюсер, резолвер дропа (v14).
// Запуск: node app/bench/core.bench.js [S|M|L|all]
//
// Числа отсюда — единственное основание утверждать, что оптимизация сработала.
// Сцены детерминированы (см. tests/fixtures/generate.js), поэтому прогоны сравнимы.
//
// v14 (Фаза 6): generateFlatProject по-прежнему строит v11/v13-совместимую
// плоскую сцену (levelWindows/ownerId и т.д.) — она СПЕЦИАЛЬНО написана как
// вход для цепочки миграций, а не как v14-форма сама по себе. Здесь она сразу
// прогоняется через migrateToV13/migrateToV14 (та же композиция, что и
// getInitialMultiState), и дальше меряется только v14-native код —
// getDepth/getLinksCrossingWindows/resolveDropTarget вместо удалённых в
// Фазе 6 getEntityLevel/getCrossLevelPortInfo/getDropTarget.

const GeometryUtils = require('../utils/geometry.js');
global.GeometryUtils = GeometryUtils;
const HierarchyUtils = require('../utils/hierarchy.js');
global.HierarchyUtils = HierarchyUtils;

const store = require('../store/reducer.js');
const { generateFlatProject, PRESETS } = require('../tests/fixtures/generate.js');

const H = HierarchyUtils;

/** Медиана времени одного прогона fn, мс. */
const bench = (label, fn, runs = 5) => {
    const times = [];
    for (let i = 0; i < runs; i++) {
        const t0 = process.hrtime.bigint();
        fn(i);
        const t1 = process.hrtime.bigint();
        times.push(Number(t1 - t0) / 1e6);
    }
    times.sort((a, b) => a - b);
    return { label, ms: times[Math.floor(times.length / 2)] };
};

/**
 * Стоимость одного кадра Port.js в его нынешнем виде (computePortDerived):
 * индекс связей порта + проход по своим связям на КАЖДЫЙ порт проекта.
 */
const simulatePortRenderPass = (proj) => {
    const selectedIds = proj.selectedIds || [];
    const linksByPort = H.getLinksByPortId(proj.links);
    let acc = 0;
    Object.keys(proj.ports || {}).forEach(portId => {
        const myLinks = linksByPort[portId] || [];
        myLinks.forEach(l => {
            if (!l) return;
            if (selectedIds.includes(l.id)) acc++;
            const oppPortId = l.sourcePortId === portId ? l.targetPortId : l.sourcePortId;
            const oppPort = proj.ports[oppPortId];
            if (oppPort && selectedIds.includes(oppPort.nodeId)) acc++;
        });
    });
    return acc;
};

const runPreset = (name) => {
    const opts = PRESETS[name];
    const flat = generateFlatProject(opts);
    // Та же композиция, что getInitialMultiState — v14-форма от начала до конца.
    const multi = store.migrateToV14(store.migrateToV13(store.wrapFlatToMulti(flat)));
    const proj = multi.projects[multi.activeProjectId];
    const nodeIds = Object.keys(proj.nodes);
    const portIds = Object.keys(proj.ports);

    const rows = [];

    // Глубина: холодный проход (новое поколение nodes на каждый прогон) и тёплый
    rows.push(bench('getDepth × все узлы (холодный кэш)', () => {
        const fresh = { ...proj.nodes };
        nodeIds.forEach(id => H.getDepth(id, fresh));
    }));
    rows.push(bench('getDepth × все узлы (тёплый кэш)', () => {
        nodeIds.forEach(id => H.getDepth(id, proj.nodes));
    }));

    // Индексы: построение и повторное чтение
    rows.push(bench('getPortsByNodeId (построение)', () => {
        const fresh = { ...proj.ports };
        H.getPortsByNodeId(fresh);
    }));
    rows.push(bench('getLinksByPortId (построение)', () => {
        const fresh = { ...proj.links };
        H.getLinksByPortId(fresh);
    }));

    // Горячий путь Port.js «как сейчас» (computePortDerived)
    rows.push(bench('Port.js: один кадр отрисовки всех портов', () => {
        simulatePortRenderPass(proj);
    }, 3));

    // Межоконные связи по всем окнам проекта
    const windowIds = Object.keys(proj.windows || {});
    rows.push(bench('getLinksCrossingWindows + getProxyIndexForWindowV14 × все окна', () => {
        windowIds.forEach(wid => H.getProxyIndexForWindowV14(wid, proj));
    }, 3));

    // Резолвер цели дропа — вызывается на каждый mousemove
    const dragged = [nodeIds[0]];
    rows.push(bench('resolveDropTarget × 60 кадров жеста', () => {
        for (let i = 0; i < 60; i++) {
            H.resolveDropTarget({ x: 300 + i * 7, y: 260 + i * 3 }, dragged, proj, { dragDropMode: true });
        }
    }, 3));

    // Редьюсер: типовые действия
    const moveAction = { type: 'MOVE_SELECTED', payload: { dx: 3, dy: 2, skipHistory: true } };
    const selected = { ...multi, selectedIds: [nodeIds[0], nodeIds[1], nodeIds[2]] };
    rows.push(bench('multiReducer MOVE_SELECTED × 60 кадров', () => {
        let s = selected;
        for (let i = 0; i < 60; i++) s = store.multiReducer(s, moveAction);
    }, 3));

    rows.push(bench('multiReducer DELETE_SELECTED', () => {
        store.multiReducer({ ...multi, selectedIds: [nodeIds[0]] }, { type: 'DELETE_SELECTED' });
    }, 3));

    rows.push(bench('multiReducer LOAD_STATE', () => {
        store.multiReducer(multi, { type: 'LOAD_STATE', payload: flat });
    }, 3));

    rows.push(bench('JSON.stringify всего состояния', () => {
        JSON.stringify(multi);
    }, 3));

    return {
        name,
        meta: {
            nodes: nodeIds.length,
            ports: portIds.length,
            links: Object.keys(proj.links).length,
            windows: windowIds.length
        },
        rows
    };
};

const arg = (process.argv[2] || 'all').toUpperCase();
const presets = arg === 'ALL' ? ['S', 'M', 'L'] : [arg];

const results = presets.map(runPreset);

results.forEach(r => {
    console.log(`\n### Пресет ${r.name} — ${r.meta.nodes} узлов, ${r.meta.ports} портов, ${r.meta.links} связей, ${r.meta.windows} окон\n`);
    console.log('| Операция | Медиана, мс |');
    console.log('|---|---:|');
    r.rows.forEach(row => console.log(`| ${row.label} | ${row.ms.toFixed(2)} |`));
});

if (typeof module !== 'undefined') module.exports = { runPreset, bench };
