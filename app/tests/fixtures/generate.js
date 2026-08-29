// Генератор синтетических сцен для бенчмарков и нагрузочных тестов.
// Детерминирован: одинаковый seed — побайтово одинаковая сцена, поэтому
// замеры «до» и «после» сравнимы, а тесты воспроизводимы.
// Двойной экспорт: window для браузера, module.exports для node:test.

/**
 * Детерминированный ГПСЧ (mulberry32). Math.random() здесь недопустим:
 * бенчмарк на разных сценах ничего не доказывает.
 * @param {number} seed
 * @returns {() => number} значение в [0, 1)
 */
const makeRng = (seed) => {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

const GRID_STEP_X = 320;
const GRID_STEP_Y = 220;
const NODES_PER_ROW = 8;

/**
 * Сцена: N узлов, распределённых по L уровням через цепочку ownerId,
 * с портами и связями (внутриуровневыми и межуровневыми).
 *
 * @param {Object} [opts]
 * @param {number} [opts.nodes] сколько узлов всего
 * @param {number} [opts.levels] сколько уровней (включая L0)
 * @param {number} [opts.portsPerNode]
 * @param {number} [opts.linkRatio] связей на узел
 * @param {number} [opts.crossLevelRatio] доля межуровневых связей
 * @param {number} [opts.seed]
 * @returns {Object} плоское состояние проекта (v11-совместимое)
 */
const generateFlatProject = (opts = {}) => {
    const {
        nodes: nodeCount = 100,
        levels = 3,
        portsPerNode = 2,
        linkRatio = 1.5,
        crossLevelRatio = 0.15,
        seed = 20260824
    } = opts;

    const rng = makeRng(seed);
    const nodes = {};
    const layers = {};
    const ports = {};
    const links = {};

    // 1. Распределение узлов по уровням: L0 получает корни, каждый следующий
    //    уровень — владельцев с предыдущего (ownerId), уровень выводится сам.
    const byLevel = Array.from({ length: levels }, () => []);
    for (let i = 0; i < nodeCount; i++) {
        byLevel[i % levels].push(i);
    }

    for (let lvl = 0; lvl < levels; lvl++) {
        byLevel[lvl].forEach((globalIdx, idxInLevel) => {
            const id = `n${globalIdx}`;
            const col = idxInLevel % NODES_PER_ROW;
            const row = Math.floor(idxInLevel / NODES_PER_ROW);
            /** @type {any} */
            const node = {
                id,
                name: `Узел ${globalIdx}`,
                position: { x: col * GRID_STEP_X, y: row * GRID_STEP_Y },
                size: { w: 240, h: 120 },
                parentId: 'root',
                shape: 'rectangle',
                type: 'default'
            };
            if (lvl > 0) {
                const owners = byLevel[lvl - 1];
                node.ownerId = `n${owners[Math.floor(rng() * owners.length)]}`;
            }
            nodes[id] = node;
        });
    }

    // 2. Порты: чередование вход/выход по противоположным граням
    Object.keys(nodes).forEach(nodeId => {
        for (let p = 0; p < portsPerNode; p++) {
            const isOut = p % 2 === 0;
            const id = `${nodeId}-p${p}`;
            ports[id] = {
                id,
                nodeId,
                type: isOut ? 'output' : 'input',
                edge: isOut ? 'right' : 'left',
                position: portsPerNode === 1 ? 0.5 : (p + 1) / (portsPerNode + 1),
                name: isOut ? `out${p}` : `in${p}`
            };
        }
    });

    // 3. Связи: порт→порт, часть внутри уровня, часть между соседними уровнями
    const outPortsOf = (nodeId) => Object.keys(ports).filter(pid => ports[pid].nodeId === nodeId && ports[pid].type === 'output');
    const inPortsOf = (nodeId) => Object.keys(ports).filter(pid => ports[pid].nodeId === nodeId && ports[pid].type === 'input');
    const outCache = {};
    const inCache = {};
    Object.keys(nodes).forEach(id => { outCache[id] = outPortsOf(id); inCache[id] = inPortsOf(id); });

    const linkCount = Math.floor(nodeCount * linkRatio);
    let made = 0;
    let guard = 0;
    while (made < linkCount && guard < linkCount * 20) {
        guard++;
        const wantCross = rng() < crossLevelRatio && levels > 1;
        const srcLvl = Math.floor(rng() * levels);
        const dstLvl = wantCross
            ? Math.min(levels - 1, Math.max(0, srcLvl + (rng() < 0.5 ? -1 : 1)))
            : srcLvl;
        if (!wantCross && dstLvl !== srcLvl) continue;
        const srcPool = byLevel[srcLvl];
        const dstPool = byLevel[dstLvl];
        if (!srcPool.length || !dstPool.length) continue;

        const srcNode = `n${srcPool[Math.floor(rng() * srcPool.length)]}`;
        const dstNode = `n${dstPool[Math.floor(rng() * dstPool.length)]}`;
        if (srcNode === dstNode) continue;

        const srcPorts = outCache[srcNode];
        const dstPorts = inCache[dstNode];
        if (!srcPorts.length || !dstPorts.length) continue;

        const sourcePortId = srcPorts[Math.floor(rng() * srcPorts.length)];
        const targetPortId = dstPorts[Math.floor(rng() * dstPorts.length)];
        const id = `l${made}`;
        links[id] = { id, sourcePortId, targetPortId, linkStyle: 'bezier' };
        made++;
    }

    const store = (typeof module !== 'undefined' && typeof require !== 'undefined')
        ? require('../../store/reducer.js')
        : (typeof window !== 'undefined' ? window.ArchitectorStore : null);
    if (!store) throw new Error('generate.js: ArchitectorStore недоступен');

    const normalized = store.normalizeLevelWindows({}, nodes, layers, null);

    return {
        ...store.defaultState,
        projectName: `Сцена ${nodeCount}×${levels}`,
        nodes,
        layers,
        ports,
        links,
        levelWindows: normalized.levelWindows,
        levelViews: normalized.levelViews,
        past: [],
        future: []
    };
};

/**
 * То же, но сразу в мультипроектной обёртке v12.
 * @param {Object} [opts] см. generateFlatProject
 * @returns {Object}
 */
const generateMultiState = (opts = {}) => {
    const store = (typeof module !== 'undefined' && typeof require !== 'undefined')
        ? require('../../store/reducer.js')
        : (typeof window !== 'undefined' ? window.ArchitectorStore : null);
    if (!store) throw new Error('generate.js: ArchitectorStore недоступен');
    return store.wrapFlatToMulti(generateFlatProject(opts));
};

/** Пресеты нагрузки: S — комфорт, M — рабочий предел сегодня, L — цель плана. */
const PRESETS = {
    S: { nodes: 100, levels: 3 },
    M: { nodes: 500, levels: 4 },
    L: { nodes: 2000, levels: 5 }
};

const SceneFixtures = { makeRng, generateFlatProject, generateMultiState, PRESETS };
if (typeof window !== 'undefined') window.SceneFixtures = SceneFixtures;
if (typeof module !== 'undefined') module.exports = SceneFixtures;
