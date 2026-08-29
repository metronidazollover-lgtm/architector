// React-обвязка стора. Состояние живёт ВНЕ React — в движке из store/engine.js,
// компоненты подписываются на него через useSyncExternalStore.
//
// Почему не useReducer + контекст, как было раньше: значение контекста
// { state, dispatch } пересоздавалось на каждый dispatch, поэтому любое действие
// перерисовывало все компоненты, читающие стор. При перетаскивании узла это
// 60–120 полных перерисовок сцены в секунду. Теперь подписчик получает сигнал и
// сам решает, изменилось ли то, что он читает (см. useSelector).
//
// v12: состояние мультипроектное (multiReducer), компоненты получают ПЛОСКИЙ
// вид активного проекта (mergeActiveView) — весь существующий код продолжает
// читать state.nodes / state.levelWindows и т.д. без изменений; поля
// projects / projectOrder / activeProjectId доступны там же для UI плашек.
const { createContext, useContext } = React;

// Единственный экземпляр стора на приложение. Создаётся при загрузке скрипта:
// getInitialMultiState() читает localStorage и прогоняет миграции ровно один раз.
const architectorStore = StoreEngine.createStore(multiReducer, getInitialMultiState(), {
    project: mergeActiveView
});

// dispatch стабилен на всё время жизни приложения. Это не косметика: он входит
// в зависимости десятков useCallback/useEffect, и его прежняя нестабильность
// заставляла переподписывать обработчики (например, keydown в Canvas) на каждый
// рендер.
const dispatch = architectorStore.dispatch;

// Контекст сохранён для обратной совместимости: значение стабильно и не
// является каналом доставки состояния.
const StoreContext = createContext({ dispatch });

/**
 * Контекст конкретного проекта на холсте.
 * Предоставляет projectId (string) компонентам окна проекта.
 * null означает дефолтный активный проект.
 */
const ProjectContext = createContext(null);

const _projectFlatViewCache = new Map();

/**
 * Гранулярный кэш плоского вида проекта.
 * Инвалидируется строго по ссылке на срез проекта state.projects[projectId] и rootState,
 * сохраняя неизменные ссылки на словари сущностей проекта.
 * @param {string|null} projectId
 * @returns {any}
 */
const getProjectFlatView = (projectId) => {
    const rootState = architectorStore.getState();
    if (!projectId || !rootState.projects || !rootState.projects[projectId]) {
        return architectorStore.getView();
    }
    if (projectId === rootState.activeProjectId) {
        return architectorStore.getView();
    }
    const projectState = rootState.projects[projectId];
    const cached = _projectFlatViewCache.get(projectId);
    if (cached && cached.lastRootState === rootState && cached.lastProjectState === projectState) {
        return cached.flatView;
    }
    const flatView = projectFlatView(rootState, projectId);
    _projectFlatViewCache.set(projectId, {
        lastRootState: rootState,
        lastProjectState: projectState,
        flatView
    });
    return flatView;
};

/**
 * Полный плоский вид активного проекта. Контракт прежний: { state, dispatch }.
 * Компонент, вызвавший этот хук, перерисовывается на любое изменение состояния —
 * для горячих компонентов используйте useSelector.
 * @returns {{ state: any, dispatch: (action: any) => any }}
 */
const useStore = () => {
    const state = useStoreView();
    return { state, dispatch };
};

/**
 * Стабильный dispatch без подписки на состояние: компонент, который только
 * посылает действия, не перерисовывается вовсе.
 * @returns {(action: any) => any}
 */
const useDispatch = () => dispatch;

/**
 * Точечная подписка: компонент перерисовывается, только если ВЫЧИСЛЕННЫЙ срез
 * изменился.
 *
 * Селектор получает полный вид и волен считать производные значения через
 * HierarchyUtils (мировая позиция, уровень, видимость, флаги подсветки) — это
 * дёшево, потому что уровни, позиции и индексы кэшируются по поколению стейта.
 * Именно поэтому «рябь» не теряется: изменение далёкого предка меняет
 * производную потомка, и сравнение результата это ловит. Подписка на «свою
 * запись» такого не умеет — не делайте так.
 *
 * @param {(view: any) => any} selector должен быть стабильным (useCallback или
 *        функция вне компонента) — иначе кэш пересоздаётся каждый рендер
 * @param {(a: any, b: any) => boolean} [isEqual] по умолчанию поверхностное сравнение
 * @returns {any}
 */
const useSelector = (selector, isEqual) => {
    const cacheRef = React.useRef(null);
    const depsRef = React.useRef(null);
    if (!cacheRef.current || depsRef.current !== selector) {
        cacheRef.current = StoreEngine.createSelectorCache(selector, isEqual);
        depsRef.current = selector;
    }
    const getSnapshot = React.useCallback(
        () => cacheRef.current(architectorStore.getView()),
        []
    );
    return useSyncExternalStoreCompat(architectorStore.subscribe, getSnapshot);
};

/**
 * Селектор с привязкой к проекту из ProjectContext.
 * Если компонент находится внутри <ProjectContext.Provider value={projectId}>,
 * читает срез соответствующего проекта; иначе возвращает активный проект.
 * @param {(view: any) => any} selector
 * @param {(a: any, b: any) => boolean} [isEqual]
 * @returns {any}
 */
const useProjectSelector = (selector, isEqual) => {
    const projectId = useContext(ProjectContext);
    const cacheRef = React.useRef(null);
    const depsRef = React.useRef(null);
    if (!cacheRef.current || depsRef.current !== selector) {
        cacheRef.current = StoreEngine.createSelectorCache(selector, isEqual);
        depsRef.current = selector;
    }
    const getSnapshot = React.useCallback(
        () => cacheRef.current(getProjectFlatView(projectId)),
        [projectId]
    );
    return useSyncExternalStoreCompat(architectorStore.subscribe, getSnapshot);
};

/**
 * Dispatch с привязкой к проекту из ProjectContext.
 * Если действие выполняется в контексте неактивного проекта,
 * автоматически заворачивает экшен в FOR_PROJECT для целевого проекта.
 * @returns {(action: any) => any}
 */
const useProjectDispatch = () => {
    const projectId = useContext(ProjectContext);
    return React.useCallback((action) => {
        if (!action) return action;
        const rootState = architectorStore.getState();
        const activePid = rootState.activeProjectId;
        if (projectId && projectId !== activePid && action.type !== 'FOR_PROJECT' && action.type !== 'SET_ACTIVE_PROJECT') {
            return dispatch({
                type: 'FOR_PROJECT',
                payload: {
                    projectId,
                    action
                }
            });
        }
        return dispatch(action);
    }, [projectId]);
};

/**
 * Полный плоский вид ПРОЕКТА ИЗ ProjectContext (аналог useStore(), но не
 * привязанный к активному проекту).
 *
 * Зачем нужен. useStore() всегда возвращает mergeActiveView — плоский вид
 * АКТИВНОГО проекта. Это верно для панелей (Toolbar/Library/ContextActionBar),
 * которые сознательно работают с активным проектом, но неверно для узла
 * ИИ-ассистента (AIAgentNodeContent.js): он рендерится внутри NodeView, а
 * значит физически находится в конкретном проекте на холсте (свой
 * ProjectContext от Canvas.js), и должен читать/менять СВОЙ проект, даже
 * если сейчас активен другой. До этого хука узел-ассистент в неактивном
 * проекте молча читал и правил активный проект — баг того же семейства, что
 * чинили для окон уровней (см. REPORT_LEVEL_WINDOW_PROJECT_ROUTING).
 *
 * getProjectFlatView(projectId) уже возвращает полный плоский вид (глобальные
 * поля — ui/selectedIds/canvas/aiChatSessionsByNode и т.д. — те же, что и у
 * активного проекта; PROJECT_FIELDS — nodes/layers/ports/links/levelWindows и
 * т.д. — свои, из state.projects[projectId]), поэтому дополнительный селектор
 * не нужен: компонент подписывается на стор напрямую и перечитывает срез
 * своего проекта при каждом уведомлении, как и useStoreView().
 * @returns {{ state: any, dispatch: (action: any) => any }}
 */
const useProjectStore = () => {
    const projectId = useContext(ProjectContext);
    const getSnapshot = React.useCallback(() => getProjectFlatView(projectId), [projectId]);
    const state = useSyncExternalStoreCompat(architectorStore.subscribe, getSnapshot);
    const dispatch = useProjectDispatch();
    return { state, dispatch };
};

/** Полный вид без селектора. @returns {any} */
const useStoreView = () => useSyncExternalStoreCompat(architectorStore.subscribe, architectorStore.getView);

/**
 * Актуальное состояние БЕЗ подписки — для обработчиков событий.
 * Обработчик выполняется в момент клика и должен видеть свежие данные, но
 * подписываться ради этого не должен: иначе компонент перерисовывается на
 * каждое изменение только потому, что «вдруг кликнут».
 * @returns {any}
 */
const getStoreView = () => architectorStore.getView();

/**
 * useSyncExternalStore есть в React 18; фолбэк оставлен на случай отката UMD-сборки
 * на React 17, чтобы приложение не падало белым экраном.
 * @param {(cb: () => void) => (() => void)} subscribe
 * @param {() => any} getSnapshot
 * @returns {any}
 */
const useSyncExternalStoreCompat = (subscribe, getSnapshot) => {
    if (typeof React.useSyncExternalStore === 'function') {
        return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    }
    const [value, setValue] = React.useState(getSnapshot);
    React.useEffect(() => {
        const check = () => setValue(() => getSnapshot());
        check(); // изменение могло случиться между рендером и подпиской
        return subscribe(check);
    }, [subscribe, getSnapshot]);
    return value;
};

const StoreProvider = ({ children }) => {
    // Провайдер больше не владеет состоянием: он подписан на стор только ради
    // персистентности, и отвечает за сохранение в localStorage.
    const mstate = useSyncExternalStoreCompat(architectorStore.subscribe, architectorStore.getState);
    const stateRef = React.useRef(mstate);
    stateRef.current = mstate;

    const saveStateToStorage = React.useCallback((currentState) => {
        try {
            // Очищаем past/future для всех проектов перед сохранением в localStorage
            // (история Undo остаётся активной в оперативной памяти текущей вкладки,
            // предотвращая переполнение квоты памяти localStorage 5 МБ)
            const cleanProjects = {};
            Object.entries(currentState.projects || {}).forEach(([pid, p]) => {
                if (p) {
                    cleanProjects[pid] = { ...p, past: [], future: [] };
                }
            });

            // API-ключ хранится отдельно (architector_api_key), вырезаем из основного стейта
            const safeState = {
                ...currentState,
                projects: cleanProjects,
                // Пакет истории транзиентен и держит полные словари сущностей —
                // в хранилище он удвоил бы объём записи и не имеет смысла после перезагрузки
                historyBatch: null,
                ui: { ...currentState.ui, aiAgentSettings: { ...currentState.ui.aiAgentSettings, apiKey: '' } }
            };
            localStorage.setItem(STORAGE_KEY_V12, JSON.stringify(safeState));
        } catch (e) {
            console.error('Ошибка сохранения состояния:', e);
            if (e.name === 'QuotaExceededError' || (e.message && e.message.includes('QuotaExceededError'))) {
                try {
                    // Аварийный режим: картинки чата и логи вырезаются
                    const strippedProjects = {};
                    Object.entries(currentState.projects || {}).forEach(([pid, p]) => {
                        strippedProjects[pid] = { ...p, past: [], future: [], historyLogs: ['История была автоматически очищена для освобождения памяти'] };
                    });
                    const emergencyState = {
                        ...currentState,
                        projects: strippedProjects,
                        historyBatch: null,
                        aiChatHistory: (currentState.aiChatHistory || []).map(msg => ({...msg, media: null})),
                        ui: { ...currentState.ui, aiAgentSettings: { ...currentState.ui.aiAgentSettings, apiKey: '' } }
                    };
                    localStorage.setItem(STORAGE_KEY_V12, JSON.stringify(emergencyState));
                    console.warn('Состояние сохранено в аварийном режиме (без картинок).');
                } catch (fallbackError) {
                    console.error('Не удалось сохранить состояние даже в аварийном режиме:', fallbackError);
                }
            }
        }
    }, []);

    // Дебаунс 400 мс сохранения в localStorage. Сама запись уводится в паузу
    // между кадрами (requestIdleCallback), чтобы сериализация не попадала
    // в кадр активного жеста.
    React.useEffect(() => {
        let idleHandle = null;
        const timer = setTimeout(() => {
            const run = () => saveStateToStorage(stateRef.current);
            if (typeof window.requestIdleCallback === 'function') {
                idleHandle = window.requestIdleCallback(run, { timeout: 1000 });
            } else {
                run();
            }
        }, 400);

        return () => {
            clearTimeout(timer);
            if (idleHandle !== null && typeof window.cancelIdleCallback === 'function') {
                window.cancelIdleCallback(idleHandle);
            }
        };
    }, [mstate, saveStateToStorage]);

    // Синхронный флаш при закрытии вкладки или скрытии страницы
    React.useEffect(() => {
        const handleFlush = () => {
            if (stateRef.current) {
                saveStateToStorage(stateRef.current);
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                handleFlush();
            }
        };

        window.addEventListener('beforeunload', handleFlush);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('beforeunload', handleFlush);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [saveStateToStorage]);

    return (
        <StoreContext.Provider value={{ dispatch }}>
            {children}
        </StoreContext.Provider>
    );
};

if (typeof window !== 'undefined') {
    window.ProjectContext = ProjectContext;
    window.getProjectFlatView = getProjectFlatView;
    window.useProjectSelector = useProjectSelector;
    window.useProjectDispatch = useProjectDispatch;
    window.useProjectStore = useProjectStore;
    window.StoreContext = StoreContext;
    window.useStore = useStore;
    window.useDispatch = useDispatch;
    window.useSelector = useSelector;
    window.getStoreView = getStoreView;
    window.StoreProvider = StoreProvider;
    // Доступ к стору из инструментов и бенчмарков (window.__archStore.dispatch(...))
    window.__archStore = architectorStore;
}
if (typeof module !== 'undefined') {
    module.exports = {
        architectorStore,
        dispatch,
        StoreContext,
        ProjectContext,
        useStore,
        useDispatch,
        useSelector,
        useProjectSelector,
        useProjectDispatch,
        useProjectStore,
        getStoreView,
        getProjectFlatView,
        StoreProvider
    };
}
