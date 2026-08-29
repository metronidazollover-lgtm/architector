// Синтаксический шлюз для zero-build JSX.
//
// Компоненты не покрыты юнит-тестами (в node нет DOM), а транспиляция идёт в
// браузере — значит опечатка в JSX обнаруживается только при открытии страницы.
// Этот скрипт прогоняет через Babel ровно то, что index.html грузит как
// text/babel, и падает с ненулевым кодом при первой же ошибке разбора.
//
// Запуск:  npm i -g @babel/standalone && node app/bench/syntax-check.js
// Babel ищется в глобальной папке npm, чтобы не заводить node_modules в проекте.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const loadBabel = () => {
    const candidates = [];
    try { candidates.push(path.join(execSync('npm root -g').toString().trim(), '@babel/standalone')); } catch (e) { /* npm недоступен */ }
    candidates.push('@babel/standalone');
    for (const c of candidates) {
        try { return require(c); } catch (e) { /* следующий кандидат */ }
    }
    console.error('Не найден @babel/standalone. Установите: npm i -g @babel/standalone');
    process.exit(2);
};

const APP_DIR = path.join(__dirname, '..');
const INDEX = path.join(APP_DIR, 'index.html');

/** Список файлов ровно в том составе, в каком их грузит index.html. */
const filesFromIndex = () => {
    const html = fs.readFileSync(INDEX, 'utf8');
    const re = /<script\s+type="text\/babel"\s+src="([^"?]+)/g;
    const out = [];
    let m;
    while ((m = re.exec(html)) !== null) out.push(m[1]);
    return out;
};

const babel = loadBabel();
const files = filesFromIndex();
if (files.length === 0) {
    console.error('index.html не содержит ни одного script type="text/babel" — проверять нечего');
    process.exit(2);
}

let failed = 0;
files.forEach(rel => {
    const abs = path.join(APP_DIR, rel);
    if (!fs.existsSync(abs)) {
        console.error(`ОТСУТСТВУЕТ  ${rel} — index.html ссылается на несуществующий файл`);
        failed++;
        return;
    }
    const code = fs.readFileSync(abs, 'utf8');
    try {
        babel.transform(code, { presets: ['react'], filename: rel });
        console.log(`ok           ${rel}`);
    } catch (e) {
        console.error(`ОШИБКА       ${rel}\n             ${e.message.split('\n')[0]}`);
        failed++;
    }
});

if (failed > 0) {
    console.error(`\nНе прошло файлов: ${failed} из ${files.length}`);
    process.exit(1);
}
console.log(`\nВсе ${files.length} файлов разбираются без ошибок.`);
