// Движок стора: подписки поверх чистого редьюсера, без React.
//
// Зачем отдельный слой. Раньше состояние жило в useReducer, а компоненты
// получали его через контекст, значение которого пересоздавалось на каждый
// dispatch — то есть КАЖДОЕ действие перерисовывало ВСЕ компоненты сразу.
// При перетаскивании это 60–120 dispatch в секунду на полную сцену.
// Здесь состояние держится вне React, а подписчики получают уведомление и
// сами решают, изменилось ли то, что они читают.
//
// Файл намеренно не знает про React: его логика покрывается юнит-тестами в
// node, а React-обвязка живёт в store/Store.js.
// Двойной экспорт: window для браузера, module.exports для node:test.

/**
 * @param {(state: any, action: any) => any} reducerFn чистый редьюсер
 * @param {any} initialState
 * @param {{ project?: (state: any) => any }} [options]
 *        project — проекция состояния в «вид» для потребителей
 *        (у нас mergeActiveView: плоский вид активного проекта).
 * @returns {{
 *   getState: () => any,
 *   getView: () => any,
 *   dispatch: (action: any) => any,
 *   subscribe: (listener: () => void) => (() => void),
 *   getListenerCount: () => number
 * }}
 */
const createStore = (reducerFn, initialState, options = {}) => {
    const project = typeof options.project === 'function' ? options.project : (s) => s;

    let state = initialState;
    // Вид пересчитывается РОВНО один раз на изменение состояния и держится по
    // стабильной ссылке. Это обязательное условие для useSyncExternalStore:
    // getSnapshot, возвращающий каждый раз новый объект, зациклит React.
    let view = project(state);
    const listeners = new Set();

    const getState = () => state;
    const getView = () => view;

    const dispatch = (action) => {
        const next = reducerFn(state, action);
        // Редьюсер вернул то же состояние по ссылке — менять нечего и будить
        // подписчиков незачем. Экшены-пустышки (правка несуществующего id,
        // перетаскивание без смещения) перестают стоить кадр.
        if (next === state) return action;
        state = next;
        view = project(next);
        // Итерация по снимку: слушатель вправе отписаться прямо в обработчике
        // (React снимает подписку при размонтировании компонента).
        const snapshot = Array.from(listeners);
        for (let i = 0; i < snapshot.length; i++) {
            if (listeners.has(snapshot[i])) snapshot[i]();
        }
        return action;
    };

    const subscribe = (listener) => {
        if (typeof listener !== 'function') return () => {};
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    };

    return { getState, getView, dispatch, subscribe, getListenerCount: () => listeners.size };
};

/**
 * Кэш выбранного среза на поколение вида: пока вид не сменился, селектор не
 * пересчитывается; если пересчитался и результат равен прежнему — возвращается
 * ПРЕЖНЯЯ ссылка, чтобы React мог пропустить рендер.
 *
 * Это ключ ко всему подходу: подписка идёт не на «свою запись» в стейте, а на
 * вычисленный результат. Изменение далёкого предка (перенос, смена владельца,
 * «глаз») меняет производные значения потомка — и он перерисуется, потому что
 * сравнивается именно результат, а не входные данные.
 *
 * @param {(view: any) => any} selector
 * @param {(a: any, b: any) => boolean} [isEqual] по умолчанию поверхностное сравнение
 * @returns {(view: any) => any}
 */
const createSelectorCache = (selector, isEqual) => {
    const eq = typeof isEqual === 'function' ? isEqual : shallowEqual;
    let lastView;
    let lastValue;
    let primed = false;

    return (view) => {
        if (primed && view === lastView) return lastValue;
        const nextValue = selector(view);
        lastView = view;
        if (!primed) {
            lastValue = nextValue;
            primed = true;
            return lastValue;
        }
        if (!eq(nextValue, lastValue)) lastValue = nextValue;
        return lastValue;
    };
};

/**
 * Поверхностное сравнение: массивы и простые объекты сравниваются по элементам,
 * всё остальное — по Object.is. Достаточно для срезов вида
 * { position, isSelected, level } и списков идентификаторов.
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
const shallowEqual = (a, b) => {
    if (Object.is(a, b)) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;

    const aIsArr = Array.isArray(a);
    if (aIsArr !== Array.isArray(b)) return false;
    if (aIsArr) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
        return true;
    }

    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (let i = 0; i < ka.length; i++) {
        const k = ka[i];
        if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
        if (!Object.is(a[k], b[k])) return false;
    }
    return true;
};

// === Профилирование рендеров ===
// Включается из консоли: window.__ARCH_PROFILE__ = true. Нужен, чтобы
// «стало быстрее» подтверждалось числом перерисовок, а не ощущением.
const _renderCounters = Object.create(null);

/** @param {string} name имя компонента */
const profileRender = (name) => {
    if (typeof window === 'undefined' || !window.__ARCH_PROFILE__) return;
    _renderCounters[name] = (_renderCounters[name] || 0) + 1;
};

/** @returns {Object<string, number>} счётчики рендеров по компонентам */
const getRenderStats = () => ({ ..._renderCounters });

/** Обнулить счётчики (перед замеряемым сценарием). */
const resetRenderStats = () => { Object.keys(_renderCounters).forEach(k => { delete _renderCounters[k]; }); };

const StoreEngine = { createStore, createSelectorCache, shallowEqual, profileRender, getRenderStats, resetRenderStats };
if (typeof window !== 'undefined') {
    window.StoreEngine = StoreEngine;
    window.__archRenderStats = getRenderStats;
    window.__archResetRenderStats = resetRenderStats;
}
if (typeof module !== 'undefined') module.exports = StoreEngine;
