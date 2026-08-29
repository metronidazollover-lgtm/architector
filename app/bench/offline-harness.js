// Сборка офлайн-стенда для проверки загрузки приложения.
//
// index.html тянет React, ReactDOM, Babel, Tailwind и шрифт иконок с CDN.
// В закрытом окружении (CI, песочница за прокси) браузер до них не достучится,
// и приложение «не смонтируется» по причине, не связанной с кодом. Стенд
// копирует приложение во временную папку и подменяет только внешние ссылки на
// локальные копии — сам код приложения и порядок скриптов остаются исходными.
//
// Запуск:  node app/bench/offline-harness.js <папка-с-библиотеками> [<папка-стенда>]
// Ожидаемые имена файлов библиотек: react.js, react-dom.js, babel.js,
// tailwind.js, lucide.css (скачиваются один раз любым способом).

const fs = require('fs');
const path = require('path');

const APP_DIR = path.join(__dirname, '..');

/** Внешняя ссылка → имя локального файла. */
const CDN_MAP = [
    [/https:\/\/unpkg\.com\/react@18\/umd\/react\.production\.min\.js/g, 'vendor/react.js'],
    [/https:\/\/unpkg\.com\/react-dom@18\/umd\/react-dom\.production\.min\.js/g, 'vendor/react-dom.js'],
    [/https:\/\/unpkg\.com\/@babel\/standalone\/babel\.min\.js/g, 'vendor/babel.js'],
    [/https:\/\/cdn\.tailwindcss\.com/g, 'vendor/tailwind.js'],
    [/https:\/\/unpkg\.com\/lucide-static@[\d.]+\/font\/lucide\.css/g, 'vendor/lucide.css']
];

const REQUIRED = ['react.js', 'react-dom.js', 'babel.js', 'tailwind.js', 'lucide.css'];

/**
 * @param {string} vendorDir папка со скачанными библиотеками
 * @param {string} outDir папка стенда (создаётся заново)
 * @returns {string} путь к index.html стенда
 */
const buildHarness = (vendorDir, outDir) => {
    const missing = REQUIRED.filter(f => !fs.existsSync(path.join(vendorDir, f)));
    if (missing.length) {
        throw new Error(`В папке библиотек не хватает файлов: ${missing.join(', ')}`);
    }

    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    fs.cpSync(APP_DIR, outDir, { recursive: true });
    fs.cpSync(vendorDir, path.join(outDir, 'vendor'), { recursive: true });

    const indexPath = path.join(outDir, 'index.html');
    let html = fs.readFileSync(indexPath, 'utf8');
    CDN_MAP.forEach(([re, local]) => { html = html.replace(re, local); });
    // Фикстуры сцен нужны замеру перерисовок и в браузере не подключены
    html = html.replace(
        '</body>',
        '    <script type="text/babel" src="tests/fixtures/generate.js"></script>\n</body>'
    );
    fs.writeFileSync(indexPath, html, 'utf8');

    const left = CDN_MAP.filter(([re]) => re.test(html));
    if (left.length) throw new Error('Не все внешние ссылки подменены — стенд неполон');

    return indexPath;
};

if (require.main === module) {
    const vendorDir = process.argv[2];
    const outDir = process.argv[3] || path.join(require('os').tmpdir(), 'architector-harness');
    if (!vendorDir) {
        console.error('Укажите папку с библиотеками: node app/bench/offline-harness.js <vendorDir> [outDir]');
        process.exit(2);
    }
    const index = buildHarness(path.resolve(vendorDir), path.resolve(outDir));
    console.log(index);
}

module.exports = { buildHarness };
