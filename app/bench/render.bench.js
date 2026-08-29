// Проверка загрузки приложения и замер перерисовок в реальном браузере.
//
// Юнит-тесты не видят React-слой: компоненты транспилируются Babel в браузере,
// поэтому ошибка в них проявляется только белым экраном. Этот скрипт поднимает
// страницу в headless-Chromium, ловит ошибки консоли и, если задан сценарий,
// считает перерисовки компонентов через window.__archRenderStats().
//
// Запуск:  node app/bench/render.bench.js [URL] [--scene=S|M|L]
// Требует: npm i -g playwright  (Chromium уже установлен в окружении)

const path = require('path');
const { execSync } = require('child_process');

const loadPlaywright = () => {
    const candidates = [];
    try { candidates.push(path.join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (e) { /* npm недоступен */ }
    candidates.push('playwright');
    for (const c of candidates) {
        try { return require(c); } catch (e) { /* следующий кандидат */ }
    }
    console.error('Не найден playwright. Установите: npm i -g playwright');
    process.exit(2);
};

const URL = process.argv.find(a => a.startsWith('http')) || 'http://localhost:8777/index.html';
const sceneArg = (process.argv.find(a => a.startsWith('--scene=')) || '').split('=')[1] || null;

(async () => {
    const { chromium } = loadPlaywright();
    // Версия установленного playwright может не совпадать с ревизией
    // предустановленного Chromium — в этом случае берём бинарь напрямую.
    // Страница тянет React/Babel/Tailwind с CDN. В песочнице с корпоративным
    // прокси браузеру его надо передать явно, иначе скрипты не загрузятся и
    // приложение «не смонтируется» по причине, не имеющей отношения к коду.
    const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || null;
    const launchOptions = {};
    if (proxyUrl) {
        launchOptions.proxy = { server: proxyUrl, bypass: 'localhost,127.0.0.1' };
        launchOptions.args = ['--ignore-certificate-errors'];
    }

    let browser;
    try {
        browser = await chromium.launch(launchOptions);
    } catch (e) {
        const fs = require('fs');
        const roots = ['/opt/pw-browsers'];
        let exe = null;
        roots.forEach(root => {
            if (exe || !fs.existsSync(root)) return;
            fs.readdirSync(root).forEach(dir => {
                if (exe) return;
                const candidate = path.join(root, dir, 'chrome-linux', 'chrome');
                if (fs.existsSync(candidate)) exe = candidate;
            });
        });
        if (!exe) throw e;
        browser = await chromium.launch({ ...launchOptions, executablePath: exe });
    }
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, ignoreHTTPSErrors: true });

    const errors = [];
    const warnings = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
        if (msg.type() === 'warning') warnings.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

    // Ошибки загрузки ресурсов приходят в консоль без URL — берём их из событий
    // сети, иначе артефакт стенда (не скачанный шрифт) неотличим от поломки кода.
    const failedUrls = [];
    page.on('requestfailed', (req) => failedUrls.push(req.url()));
    page.on('response', (res) => { if (res.status() >= 400) failedUrls.push(`${res.status()} ${res.url()}`); });

    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    // Babel транспилирует все скрипты в браузере — даём приложению смонтироваться
    await page.waitForTimeout(3000);

    const mounted = await page.evaluate(() => {
        const root = document.getElementById('root');
        return {
            hasRoot: !!root,
            childCount: root ? root.children.length : 0,
            html: root ? root.innerHTML.length : 0,
            hasStore: typeof window.__archStore !== 'undefined',
            projects: (typeof window.__archStore !== 'undefined')
                ? Object.keys(window.__archStore.getState().projects || {}).length
                : null,
            windows: (typeof window.__archStore !== 'undefined')
                ? Object.keys(window.__archStore.getView().levelWindows || {}).length
                : null
        };
    });

    console.log('Смонтировано:', JSON.stringify(mounted));

    let renderStats = null;
    if (sceneArg) {
        // Загружаем синтетическую сцену и считаем перерисовки на серии MOVE_SELECTED
        renderStats = await page.evaluate((scene) => {
            const fx = window.SceneFixtures;
            const store = window.__archStore;
            if (!fx || !store) return { error: 'SceneFixtures или стор недоступны' };
            const flat = fx.generateFlatProject(fx.PRESETS[scene]);
            store.dispatch({ type: 'LOAD_STATE', payload: flat });

            const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));

            return (async () => {
                await sleep(1500); // дать сцене смонтироваться
                const view = store.getView();
                const ids = Object.keys(view.nodes).slice(0, 1);
                store.dispatch({ type: 'SET_MULTI_SELECTED', payload: ids });
                await sleep(300);

                // Перетаскивание — это ОДИН dispatch на кадр в отдельной задаче.
                // Если слать их подряд в цикле, React 18 схлопнет всё в один рендер,
                // и замер покажет картину, которой в реальной работе не бывает.
                window.__ARCH_PROFILE__ = true;
                window.__archResetRenderStats();
                const FRAMES = 30;
                const frameTimes = [];
                for (let i = 0; i < FRAMES; i++) {
                    const t0 = performance.now();
                    store.dispatch({ type: 'MOVE_SELECTED', payload: { dx: 2, dy: 1, skipHistory: true } });
                    await nextFrame();
                    frameTimes.push(performance.now() - t0);
                }
                await sleep(300);
                const stats = window.__archRenderStats();
                window.__ARCH_PROFILE__ = false;
                frameTimes.sort((a, b) => a - b);
                const median = frameTimes[Math.floor(frameTimes.length / 2)];
                return {
                    scene,
                    domElements: document.querySelectorAll('#root *').length,
                    mountedNodes: document.querySelectorAll('[data-file="components/Node.js"]').length,
                    nodes: Object.keys(view.nodes).length,
                    ports: Object.keys(view.ports).length,
                    frames: FRAMES,
                    medianFrameMs: Math.round(median * 10) / 10,
                    fps: Math.round(1000 / median),
                    renders: stats,
                    rendersPerFrame: Object.fromEntries(
                        Object.entries(stats).map(([k, v]) => [k, Math.round(v / FRAMES)])
                    )
                };
            })();
        }, sceneArg);
        console.log('Сцена:', JSON.stringify(renderStats, null, 2));
    }

    await browser.close();

    // Шрифты и картинки к работе логики отношения не имеют: в офлайн-стенде
    // их может не быть, и это не повод считать прогон упавшим.
    const isAsset = (u) => /\.(woff2?|ttf|eot|svg|png|jpg|ico)(\?|$)/i.test(u) || /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(u);
    const assetFailures = failedUrls.filter(isAsset);
    const realFailures = failedUrls.filter(u => !isAsset(u));

    if (assetFailures.length) {
        console.log(`Не загрузились ресурсы оформления (не влияет на логику): ${assetFailures.length}`);
        Array.from(new Set(assetFailures)).slice(0, 5).forEach(u => console.log('  ' + u));
    }
    if (realFailures.length) {
        console.error('\nНЕ ЗАГРУЗИЛИСЬ:');
        Array.from(new Set(realFailures)).slice(0, 10).forEach(u => console.error('  ' + u));
    }
    // Ошибки консоли о незагруженных ресурсах оформления отбрасываем
    const codeErrors = errors.filter(e => !/Failed to load resource/.test(e));
    if (codeErrors.length) {
        console.error('\nОШИБКИ КОДА:');
        codeErrors.slice(0, 20).forEach(e => console.error('  ' + e));
    }
    const booted = mounted.hasRoot && mounted.childCount > 0 && mounted.hasStore;
    if (!booted) {
        console.error('\nПриложение не смонтировалось.');
        process.exit(1);
    }
    if (codeErrors.length || realFailures.length) {
        console.error('\nПриложение смонтировалось, но есть ошибки кода или незагруженные скрипты.');
        process.exit(1);
    }
    console.log('\nПриложение загрузилось без ошибок кода.');
})();
