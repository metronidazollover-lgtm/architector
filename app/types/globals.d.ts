// Объявления глобалов для tsc: проект zero-build, модулей нет,
// компоненты и утилиты — глобальные функции, видимые между файлами.

declare const React: any;
declare const ReactDOM: any;

interface Window {
    GeometryUtils: any;
    HierarchyUtils: any;
    ArchitectorStore: any;
    StoreEngine: any;
    SceneFixtures: any;
    // Стор доступен инструментам и бенчмаркам
    __archStore: any;
    // Профилирование перерисовок (включается из консоли)
    __ARCH_PROFILE__: boolean;
    __archRenderStats: () => Record<string, number>;
    __archResetRenderStats: () => void;
}

// Глобальные компоненты (объявлены в components/*.js как function-декларации)
// Компонент узла называется NodeComponent: имя Node занято нативным DOM-интерфейсом
declare function NodeComponent(props: any): any;
declare function Layer(props: any): any;
declare function Link(props: any): any;
declare function PendingLink(props: any): any;
declare function Port(props: any): any;
declare function Canvas(props: any): any;
declare function Toolbar(props: any): any;
declare function Library(props: any): any;
declare function ContextActionBar(props: any): any;
declare function AIAgentNodeContent(props: any): any;
declare function NodePreview(props: any): any;
declare function OutlinerTreeRow(props: any): any;
declare function OutlinerTree(props: any): any;
declare function LevelWindow(props: any): any;
declare function ProjectHeader(props: any): any;


// Привязки из файлов с module.exports: tsc считает такие файлы CommonJS-модулями,
// поэтому их const-декларации не глобальны и объявляются здесь заново.
// В браузере они глобальны (лексический скоуп между text/babel-скриптами).
declare const reducer: (state: any, action: any) => any;
declare const getInitialState: () => any;
declare const STORAGE_KEY: string;
// Мультипроектная обёртка v12 (Этап 1)
declare const multiReducer: (state: any, action: any) => any;
declare const getInitialMultiState: () => any;
declare const mergeActiveView: (state: any) => any;
declare const STORAGE_KEY_V12: string;
declare const GeometryUtils: any;
declare const HierarchyUtils: any;
// Движок стора (store/engine.js): подписки, кэш селекторов, профилирование
declare const StoreEngine: any;
// useStore/useSelector/useDispatch объявлены в store/Store.js — он не CommonJS-модуль,
// поэтому его const-декларации глобальны для tsc и здесь не дублируются.

declare var module: any;
declare var global: any;
declare var require: any;
