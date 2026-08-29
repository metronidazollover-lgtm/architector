// Бенчмарк чистого ядра: иерархия, индексы, редьюсер, резолвер дропа.
// Запуск: node app/bench/core.bench.js [S|M|L|all]
//
// Числа отсюда — единственное основание утверждать, что оптимизация сработала.
// Сцены детерминированы (см. tests/fixtures/generate.js), поэтому прогоны сравнимы.

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
 * Стоимость одного кадра Port.js в его нынешнем виде: пять независимых
 * проходов по всем связям на КАЖДЫЙ порт. Меряем как есть, чтобы фаза 3
 * могла предъявить разницу.
 */
const simulatePortRenderPass = (state) => {
    const selectedIds = state.selectedIds || [];
    const links = Object.values(state.links || {});
    let acc = 0;
    Object.values(state.ports || {}).forEach(port => {
        const id = port.id;
        if (links.some(l => l && selectedIds.includes(l.id) && (l.sourcePortId === id || l.targetPortId === id))) acc++;
        if (links.some(l => l && ((l.sourcePortId === id && selectedIds.includes(l.targetPortId)) || (l.targetPortId === id && selectedIds.includes(l.sourcePortId))))) acc++;
        if (links.some(l => {
            if (!l) return false;
            const opp = l.sourcePortId === id ? l.targetPortId : (l.targetPortId === id ? l.sourcePortId : null);
            if (!opp) return false;
            const op = state.ports[opp];
            return op && selectedIds.includes(op.nodeId);
        })) acc++;
        links.forEach(l => { if (l && (l.sourcePortId === id || l.targetPortId === id)) acc++; });
        acc += H.getCrossLevelPortInfo(id, state.ports, state.links, state.nodes, state.layers).targetLevels.length;
    });
    return acc;
};

const runPreset = (name) => {
    const opts = PRESETS[name];
    const flat = generateFlatProject(opts);
    const multi = store.wrapFlatToMulti(flat);
    const nodeIds = Object.keys(flat.nodes);
    const portIds = Object.keys(flat.ports);

    const rows = [];

    // Уровни: холодный проход (новое поколение nodes на каждый прогон) и тёплый
    rows.push(bench('getEntityLevel × все узлы (холодный кэш)', () => {
        const fresh = { ...flat.nodes };
        nodeIds.forEach(id => H.getEntityLevel(id, fresh, flat.layers));
    }));
    rows.push(bench('getEntityLevel × все узлы (тёплый кэш)', () => {
        nodeIds.forEach(id => H.getEntityLevel(id, flat.nodes, flat.layers));
    }));

    // Индексы: построение и повторное чтение
    rows.push(bench('getPortsByNodeId (построение)', () => {
        const fresh = { ...flat.ports };
        H.getPortsByNodeId(fresh);
    }));
    rows.push(bench('getLinksByPortId (построение)', () => {
        const fresh = { ...flat.links };
        H.getLinksByPortId(fresh);
    }));

    // Горячий путь Port.js «как сейчас»
    rows.push(bench('Port.js: один кадр отрисовки всех портов', () => {
        simulatePortRenderPass(flat);
    }, 3));

    // Межуровневая информация по всем портам
    rows.push(bench('getCrossLevelPortInfo × все порты', () => {
        portIds.forEach(id => H.getCrossLevelPortInfo(id, flat.ports, flat.links, flat.nodes, flat.layers));
    }, 3));

    // Резолвер цели дропа — вызывается на каждый mousemove
    const dragged = [nodeIds[0]];
    rows.push(bench('getDropTarget × 60 кадров жеста', () => {
        for (let i = 0; i < 60; i++) {
            H.getDropTarget(dragged, { x: 300 + i * 7, y: 260 + i * 3 }, flat, { dragDropMode: true });
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
            nodes: Object.keys(flat.nodes).length,
            ports: Object.keys(flat.ports).length,
            links: Object.keys(flat.links).length,
            levels: Object.keys(flat.levelWindows).length
        },
        rows
    };
};

const arg = (process.argv[2] || 'all').toUpperCase();
const presets = arg === 'ALL' ? ['S', 'M', 'L'] : [arg];

const results = presets.map(runPreset);

results.forEach(r => {
    console.log(`\n### Пресет ${r.name} — ${r.meta.nodes} узлов, ${r.meta.ports} портов, ${r.meta.links} связей, ${r.meta.levels} уровней\n`);
    console.log('| Операция | Медиана, мс |');
    console.log('|---|---:|');
    r.rows.forEach(row => console.log(`| ${row.label} | ${row.ms.toFixed(2)} |`));
});

if (typeof module !== 'undefined') module.exports = { runPreset, bench };
