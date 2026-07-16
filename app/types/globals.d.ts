// Объявления глобалов для tsc: проект zero-build, модулей нет,
// компоненты и утилиты — глобальные функции, видимые между файлами.

declare const React: any;
declare const ReactDOM: any;

interface Window {
    GeometryUtils: any;
    HierarchyUtils: any;
    ArchitectorStore: any;
}

// Глобальные компоненты (объявлены в components/*.js как function-декларации)
declare function Node(props: any): any;
declare function Layer(props: any): any;
declare function Link(props: any): any;
declare function PendingLink(props: any): any;
declare function Port(props: any): any;
declare function Canvas(props: any): any;
declare function Toolbar(props: any): any;
declare function Library(props: any): any;
declare function PropertyPanel(props: any): any;
declare function AIAgentNodeContent(props: any): any;
declare function NodePreview(props: any): any;
declare function DepthProfile(props: any): any;
declare function MiniMap(props: any): any;
declare function OutlinerTreeRow(props: any): any;
declare function OutlinerTree(props: any): any;
declare function TunnelLabels(props: any): any;

// Привязки из файлов с module.exports: tsc считает такие файлы CommonJS-модулями,
// поэтому их const-декларации не глобальны и объявляются здесь заново.
// В браузере они глобальны (лексический скоуп между text/babel-скриптами).
declare const reducer: (state: any, action: any) => any;
declare const getInitialState: () => any;
declare const STORAGE_KEY: string;
declare const GeometryUtils: any;
declare const HierarchyUtils: any;

declare var module: any;
declare var global: any;
declare var require: any;
