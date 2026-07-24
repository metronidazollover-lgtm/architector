function Toolbar() {
    const { dispatch, state } = useStore();
    const fileInputRef = React.useRef(null);

    // Новые сущности получают parentId = currentContext, а их position относительна
    // родителю (v10). Мировую точку центра экрана переводим в систему контекста.
    const toContextRelative = (worldX, worldY) => {
        const ctxAbs = window.HierarchyUtils.getAbsolutePosition(state.currentContext, state.nodes, state.layers);
        return { x: worldX - ctxAbs.x, y: worldY - ctxAbs.y };
    };

    const handleExport = () => {
        const data = {
            formatVersion: state.formatVersion || 10,
            layers: state.layers,
            nodes: state.nodes,
            ports: state.ports,
            links: state.links,
            canvas: state.canvas,
            currentContext: state.currentContext,
            breadcrumbs: state.breadcrumbs,
            cameraByContext: state.cameraByContext || {}
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `architector_project_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.nodes && data.ports && data.links) {
                    dispatch({ type: 'LOAD_STATE', payload: data });
                } else {
                    console.error('Некорректный файл проекта');
                }
            } catch (err) {
                console.error('Ошибка чтения файла', err);
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset
    };

    const handleLoadDemo = () => {
        if (!window.confirm('Вы уверены, что хотите загрузить демонстрационный проект? Текущие несохраненные изменения будут перезаписаны.')) return;

        const demoState = {
            formatVersion: 10,
            layers: {
                // ================= LEVEL 1 LAYERS (Parent: root) =================
                "layer-0-guide": {
                    id: "layer-0-guide",
                    name: "6. Инструкция & Быстрый старт (Guide)",
                    content: "Подробное руководство пользователя по всем возможностям приложения Architector",
                    color: "#e11d48",
                    position: { x: -1050, y: -250 },
                    size: { w: 600, h: 540 },
                    locked: false,
                    parentId: "root",
                    snapToGrid: true
                },
                "layer-1-ui": {
                    id: "layer-1-ui",
                    name: "1. Пользовательский интерфейс (UI & Viewport)",
                    content: "Интерактивный холст, боковые панели, библиотека и визуальные эффекты",
                    color: "#0284c7",
                    position: { x: -400, y: -250 },
                    size: { w: 620, h: 540 },
                    locked: false,
                    parentId: "root",
                    snapToGrid: true
                },
                "layer-1-state": {
                    id: "layer-1-state",
                    name: "2. Движок состояния (Store & Reducer)",
                    content: "Центральное хранилище данных, история действий (Undo/Redo) и мутации",
                    color: "#0d9488",
                    position: { x: 300, y: -250 },
                    size: { w: 600, h: 540 },
                    locked: false,
                    parentId: "root",
                    snapToGrid: true
                },
                "layer-1-geom": {
                    id: "layer-1-geom",
                    name: "3. Математика & Геометрия (Geometry)",
                    content: "Расчет абсолютных координат, коллизий слоев, портов и авторазметки",
                    color: "#b45309",
                    position: { x: -400, y: 350 },
                    size: { w: 620, h: 500 },
                    locked: false,
                    parentId: "root",
                    snapToGrid: true
                },
                "layer-1-storage": {
                    id: "layer-1-storage",
                    name: "4. Персистенция & Хранение (Storage)",
                    content: "Синхронизация с LocalStorage, импорт/экспорт JSON и конвертация v9->v10",
                    color: "#4f46e5",
                    position: { x: 300, y: 350 },
                    size: { w: 600, h: 500 },
                    locked: false,
                    parentId: "root",
                    snapToGrid: true
                },
                "layer-1-ai": {
                    id: "layer-1-ai",
                    name: "5. ИИ-Ассистент & Копилот (AI & API)",
                    content: "Автоматическое проектирование архитектур, чат-ассистент и исполнение JSON-команд",
                    color: "#7c3aed",
                    position: { x: 950, y: 50 },
                    size: { w: 620, h: 650 },
                    locked: false,
                    parentId: "root",
                    snapToGrid: true
                },

                // ================= LEVEL 2 LAYERS (Inside node-ui-canvas) =================
                "layer-2-canvas-render": {
                    id: "layer-2-canvas-render",
                    name: "Слой 2.1. Рендеринг граф-элементов",
                    content: "Отрисовка SVG-связей, маркеров, портов и Z-Index подсветок",
                    color: "#0369a1",
                    position: { x: 30, y: 70 },
                    size: { w: 540, h: 360 },
                    locked: false,
                    parentId: "node-ui-canvas",
                    snapToGrid: true
                }
            },
            nodes: {
                // ================= LAYER 0: GUIDE NODES =================
                "node-guide-main": {
                    id: "node-guide-main",
                    name: "📖 Руководство пользователя Architector",
                    group: "Инструкция",
                    content: "### 🚀 Как работать с визуальным редактором:\n\n1. **🖱️ Навигация и Зум:**\n   - **Колесико мыши:** зум строго в точку курсора.\n   - **Зажатая СКМ / Shift+ЛКМ по холсту:** панорамирование и перемещение камеры.\n\n2. **🔍 Рекурсивные погружения (Dive In):**\n   - **Двойной клик по Ноде:** войти в ее внутренний контекст.\n   - **Двойной клик по Порту:** войти во внутренний контекст Порта.\n   - **Двойной клик по Связи:** войти во внутреннюю структуру Линии.\n   - **Хлебные крошки вверху:** быстрый возврат на уровни выше.\n\n3. **⚡ Связи и Порты:**\n   - **Перетаскивание от Порта:** тяните линию к любому порту или ноде.\n   - **Shift+Перетаскивание Порта:** скольжение порта по всему периметру грани.\n   - **Стили связей:** поддерживает кривые Bezier и прямые углы Orthogonal.\n\n4. **🎨 Слои и Автовыравнивание:**\n   - **Перетаскивание слоя за шапку:** слои скользят по границам друг друга без перекрытий.\n   - **Кнопка плинки в тулбаре:** вертикальное выравнивание слоев в 1 клик.\n\n5. **🤖 ИИ-Копилот (AI Agent):**\n   - Клик по ноде **AI Copilot** открывает чат-инженер. Вводите промпт, и ИИ сам построит слои, ноды и связи через JSON-протокол!",
                    color: "#881337",
                    position: { x: 30, y: 80 },
                    size: { w: 540, h: 420 },
                    parentId: "layer-0-guide",
                    snapToGrid: true,
                    shape: "rectangle"
                },

                // ================= LEVEL 1 NODES (Parent: Layers) =================
                // UI Layer Nodes
                "node-ui-canvas": {
                    id: "node-ui-canvas",
                    name: "🔍 Интерактивный Холст (Canvas)",
                    group: "Интерфейс",
                    content: "Главная область визуализации. Двойной клик — войти внутрь ноды (Dive In)!",
                    color: "#0f172a",
                    position: { x: 30, y: 80 },
                    size: { w: 260, h: 160 },
                    parentId: "layer-1-ui",
                    snapToGrid: true,
                    shape: "rectangle",
                    mediaUrl: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=200&auto=format&fit=crop&q=60",
                    mediaHeight: 70
                },
                "node-ui-toolbar": {
                    id: "node-ui-toolbar",
                    name: "Панель Инструментов (Toolbar)",
                    group: "Интерфейс",
                    content: "Быстрый доступ к добавлению нод/слоев, автовыравниванию и экспорту",
                    color: "#1e293b",
                    position: { x: 320, y: 80 },
                    size: { w: 250, h: 120 },
                    parentId: "layer-1-ui",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-ui-library": {
                    id: "node-ui-library",
                    name: "Обозреватель Проекта (Library)",
                    group: "Интерфейс",
                    content: "Дерево иерархии объектов, вкладка Уровни и Лог Истории (ширина 350px)",
                    color: "#1e293b",
                    position: { x: 30, y: 280 },
                    size: { w: 260, h: 120 },
                    parentId: "layer-1-ui",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-ui-property": {
                    id: "node-ui-property",
                    name: "Панель Свойств (PropertyPanel)",
                    group: "Интерфейс",
                    content: "Инспектор одиночного и массового редактирования названий, цветов и ID",
                    color: "#1e293b",
                    position: { x: 320, y: 280 },
                    size: { w: 250, h: 120 },
                    parentId: "layer-1-ui",
                    snapToGrid: true,
                    shape: "rectangle"
                },

                // State Layer Nodes
                "node-state-store": {
                    id: "node-state-store",
                    name: "React Context Provider",
                    group: "Состояние",
                    content: "Единый источник правды (Single Source of Truth) графа диаграммы",
                    color: "#0f172a",
                    position: { x: 30, y: 80 },
                    size: { w: 240, h: 120 },
                    parentId: "layer-1-state",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-state-reducer": {
                    id: "node-state-reducer",
                    name: "Чистый Редьюсер (Reducer)",
                    group: "Состояние",
                    content: "Чистая функция обработки экшенов: ADD_NODE, MOVE_SELECTED, DIVE_INTO",
                    color: "#0f172a",
                    position: { x: 310, y: 80 },
                    size: { w: 250, h: 120 },
                    parentId: "layer-1-state",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-state-history": {
                    id: "node-state-history",
                    name: "Менеджер Истории (Undo/Redo)",
                    group: "Состояние",
                    content: "Стеки past/future до 20 шагов с возможностью автопрыжка в контекст правки",
                    color: "#0f172a",
                    position: { x: 30, y: 280 },
                    size: { w: 240, h: 120 },
                    parentId: "layer-1-state",
                    snapToGrid: true,
                    shape: "circle" // Демонстрация круглой формы!
                },
                "node-state-nav": {
                    id: "node-state-nav",
                    name: "Навигатор Контекстов (NavHistory)",
                    group: "Состояние",
                    content: "Запоминание позиций камер каждого посещенного уровня (cameraByContext)",
                    color: "#0f172a",
                    position: { x: 310, y: 280 },
                    size: { w: 250, h: 120 },
                    parentId: "layer-1-state",
                    snapToGrid: true,
                    shape: "rectangle"
                },

                // Geometry Layer Nodes
                "node-geom-abs": {
                    id: "node-geom-abs",
                    name: "HierarchyUtils (getAbsolutePosition)",
                    group: "Геометрия",
                    content: "Расчет мировых координат из относительных с защитой от циклов parentId",
                    color: "#1c1917",
                    position: { x: 30, y: 80 },
                    size: { w: 260, h: 120 },
                    parentId: "layer-1-geom",
                    snapToGrid: true,
                    shape: "hexagon" // Демонстрация формы шестиугольника!
                },
                "node-geom-placement": {
                    id: "node-geom-placement",
                    name: "GeometryUtils (getSmartPlacement)",
                    group: "Геометрия",
                    content: "Бесконфликтная расстановка нод на слоях и Fit-to-Content сжатие рамок",
                    color: "#1c1917",
                    position: { x: 320, y: 80 },
                    size: { w: 250, h: 120 },
                    parentId: "layer-1-geom",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-geom-collision": {
                    id: "node-geom-collision",
                    name: "Детектор Коллизий Слоев",
                    group: "Геометрия",
                    content: "Скольжение слоев по границам друг друга при ручном перетаскивании",
                    color: "#1c1917",
                    position: { x: 30, y: 280 },
                    size: { w: 260, h: 120 },
                    parentId: "layer-1-geom",
                    snapToGrid: true,
                    shape: "diamond" // Демонстрация формы ромба!
                },
                "node-geom-align": {
                    id: "node-geom-align",
                    name: "Выравнивание Слоев (alignLayers)",
                    group: "Геометрия",
                    content: "Сортировка по имени и выстраивание слоев по вертикали с зазором 90px",
                    color: "#1c1917",
                    position: { x: 320, y: 280 },
                    size: { w: 250, h: 120 },
                    parentId: "layer-1-geom",
                    snapToGrid: true,
                    shape: "rectangle"
                },

                // Storage Layer Nodes
                "node-storage-migration": {
                    id: "node-storage-migration",
                    name: "Конвертер Версий (migrateToV10)",
                    group: "Хранилище",
                    content: "Автоматическая бесшовная миграция старых файлов v9 в формат v10 на лету",
                    color: "#1e1b4b",
                    position: { x: 30, y: 80 },
                    size: { w: 250, h: 120 },
                    parentId: "layer-1-storage",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-storage-persist": {
                    id: "node-storage-persist",
                    name: "Синхронизатор LocalStorage",
                    group: "Хранилище",
                    content: "Автоматическое сохранение графа в браузерное хранилище local_storage_v10",
                    color: "#1e1b4b",
                    position: { x: 310, y: 80 },
                    size: { w: 240, h: 120 },
                    parentId: "layer-1-storage",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-storage-export": {
                    id: "node-storage-export",
                    name: "JSON Экспортер / Импортер",
                    group: "Хранилище",
                    content: "Сохранение и загрузка JSON файлов архитектур в 1 клик",
                    color: "#1e1b4b",
                    position: { x: 30, y: 280 },
                    size: { w: 240, h: 120 },
                    parentId: "layer-1-storage",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-storage-demo": {
                    id: "node-storage-demo",
                    name: "Загрузчик Демо-Архитектур",
                    group: "Хранилище",
                    content: "Генерация богатых учебных графов со всеми видами связей и погружений",
                    color: "#1e1b4b",
                    position: { x: 310, y: 280 },
                    size: { w: 250, h: 120 },
                    parentId: "layer-1-storage",
                    snapToGrid: true,
                    shape: "rectangle"
                },

                // AI Layer Nodes
                "node-ai-agent": {
                    id: "node-ai-agent",
                    name: "💬 AI Copilot Assistant",
                    group: "ИИ",
                    content: "Интерактивный ИИ-инженер. Умеет строить графы и генерировать схемы!",
                    color: "#3b0764",
                    position: { x: 30, y: 80 },
                    size: { w: 280, h: 160 },
                    parentId: "layer-1-ai",
                    snapToGrid: true,
                    shape: "rectangle",
                    type: "ai-agent"
                },
                "node-ai-parser": {
                    id: "node-ai-parser",
                    name: "Парсер JSON Команд ИИ",
                    group: "ИИ",
                    content: "Извлечение JSON-массива Redux-экшенов из текстового ответа нейросети",
                    color: "#312e81",
                    position: { x: 340, y: 80 },
                    size: { w: 240, h: 120 },
                    parentId: "layer-1-ai",
                    snapToGrid: true,
                    shape: "hexagon"
                },

                // ================= LEVEL 3 DIVE-IN DEMO NODES =================
                "node-inside-port": {
                    id: "node-inside-port",
                    name: "🔌 Дочерний Виджет Порта (Level 3)",
                    group: "Погружение",
                    content: "Этот узел лежит ВНУТРИ контекста порта (parentId: port-1-vp-out)!",
                    color: "#0284c7",
                    position: { x: 20, y: 20 },
                    size: { w: 220, h: 100 },
                    parentId: "port-1-vp-out",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-inside-link": {
                    id: "node-inside-link",
                    name: "⚡ Перехватчик Пакетов Связи (Level 3)",
                    group: "Погружение",
                    content: "Этот узел лежит ВНУТРИ контекста связи (parentId: link-1-store-to-red)!",
                    color: "#0d9488",
                    position: { x: 20, y: 20 },
                    size: { w: 240, h: 100 },
                    parentId: "link-1-store-to-red",
                    snapToGrid: true,
                    shape: "rectangle"
                }
            },
            ports: {
                // ================= LEVEL 1 PORTS =================
                "port-1-vp-in": {
                    id: "port-1-vp-in",
                    nodeId: "node-ui-canvas",
                    type: "input",
                    edge: "left",
                    position: 0.3,
                    name: "Рендеринг запросов",
                    color: "#38bdf8"
                },
                "port-1-vp-out": {
                    id: "port-1-vp-out",
                    nodeId: "node-ui-canvas",
                    type: "output",
                    edge: "right",
                    position: 0.5,
                    name: "События холста",
                    color: "#0284c7"
                },
                "port-1-tb-out": {
                    id: "port-1-tb-out",
                    nodeId: "node-ui-toolbar",
                    type: "output",
                    edge: "right",
                    position: 0.5,
                    name: "Инструменты",
                    color: "#38bdf8"
                },
                "port-1-pp-in": {
                    id: "port-1-pp-in",
                    nodeId: "node-ui-property",
                    type: "input",
                    edge: "left",
                    position: 0.5,
                    name: "Данные элемента",
                    color: "#0284c7"
                },
                "port-1-store-in": {
                    id: "port-1-store-in",
                    nodeId: "node-state-store",
                    type: "input",
                    edge: "left",
                    position: 0.5,
                    name: "Экшены",
                    color: "#2dd4bf"
                },
                "port-1-store-out": {
                    id: "port-1-store-out",
                    nodeId: "node-state-store",
                    type: "output",
                    edge: "right",
                    position: 0.5,
                    name: "Свежий стейт",
                    color: "#0d9488"
                },
                "port-1-red-in": {
                    id: "port-1-red-in",
                    nodeId: "node-state-reducer",
                    type: "input",
                    edge: "left",
                    position: 0.5,
                    name: "Обработка",
                    color: "#2dd4bf"
                },
                "port-1-red-out": {
                    id: "port-1-red-out",
                    nodeId: "node-state-reducer",
                    type: "output",
                    edge: "right",
                    position: 0.5,
                    name: "Новый стейт",
                    color: "#0d9488"
                },
                "port-1-geom-in": {
                    id: "port-1-geom-in",
                    nodeId: "node-geom-abs",
                    type: "input",
                    edge: "left",
                    position: 0.5,
                    name: "Координаты нод",
                    color: "#f59e0b"
                },
                "port-1-geom-out": {
                    id: "port-1-geom-out",
                    nodeId: "node-geom-abs",
                    type: "output",
                    edge: "right",
                    position: 0.5,
                    name: "Мировая матрица",
                    color: "#b45309"
                },
                "port-1-storage-in": {
                    id: "port-1-storage-in",
                    nodeId: "node-storage-migration",
                    type: "input",
                    edge: "left",
                    position: 0.5,
                    name: "Дамп стейта",
                    color: "#818cf8"
                },
                "port-1-storage-out": {
                    id: "port-1-storage-out",
                    nodeId: "node-storage-migration",
                    type: "output",
                    edge: "right",
                    position: 0.5,
                    name: "Сохраненный JSON",
                    color: "#4f46e5"
                },
                "port-1-ai-in": {
                    id: "port-1-ai-in",
                    nodeId: "node-ai-agent",
                    type: "input",
                    edge: "left",
                    position: 0.3,
                    name: "Промпт",
                    color: "#c084fc"
                },
                "port-1-ai-out": {
                    id: "port-1-ai-out",
                    nodeId: "node-ai-agent",
                    type: "output",
                    edge: "right",
                    position: 0.5,
                    name: "Готовый граф",
                    color: "#7c3aed"
                }
            },
            links: [
                // ================= ROOT CONTEXT LINKS (LEVEL 1) =================
                { id: "link-1-vp-to-store", sourcePortId: "port-1-vp-out", targetPortId: "port-1-store-in", name: "User Action Dispatch", linkStyle: "bezier", color: "#38bdf8", context: "root" },
                { id: "link-1-tb-to-store", sourcePortId: "port-1-tb-out", targetPortId: "port-1-store-in", name: "Toolbar Command", linkStyle: "orthogonal", color: "#0284c7", context: "root" },
                { id: "link-1-store-to-red", sourcePortId: "port-1-store-out", targetPortId: "port-1-red-in", name: "State Action Payload", linkStyle: "orthogonal", color: "#2dd4bf", context: "root" },
                { id: "link-1-red-to-store", sourcePortId: "port-1-red-out", targetPortId: "port-1-store-in", name: "New State Mutation", linkStyle: "bezier", color: "#0d9488", context: "root" },
                { id: "link-1-store-to-vp", sourcePortId: "port-1-store-out", targetPortId: "port-1-vp-in", name: "Canvas Re-render Sync", linkStyle: "orthogonal", color: "#2dd4bf", context: "root" },
                { id: "link-1-store-to-pp", sourcePortId: "port-1-store-out", targetPortId: "port-1-pp-in", name: "Selected Properties", linkStyle: "bezier", color: "#0d9488", context: "root" },
                { id: "link-1-vp-to-geom", sourcePortId: "port-1-vp-out", targetPortId: "port-1-geom-in", name: "Mouse Drag Delta", linkStyle: "orthogonal", color: "#f59e0b", context: "root" },
                { id: "link-1-geom-to-vp", sourcePortId: "port-1-geom-out", targetPortId: "port-1-vp-in", name: "Absolute Bounds", linkStyle: "bezier", color: "#b45309", context: "root" },
                { id: "link-1-store-to-storage", sourcePortId: "port-1-store-out", targetPortId: "port-1-storage-in", name: "LocalStorage Persist", linkStyle: "orthogonal", color: "#818cf8", context: "root" },
                { id: "link-1-storage-to-store", sourcePortId: "port-1-storage-out", targetPortId: "port-1-store-in", name: "Initial Hydrate", linkStyle: "bezier", color: "#4f46e5", context: "root" },
                { id: "link-1-store-to-ai", sourcePortId: "port-1-store-out", targetPortId: "port-1-ai-in", name: "Graph Context Prompt", linkStyle: "orthogonal", color: "#c084fc", context: "root" },
                { id: "link-1-ai-to-store", sourcePortId: "port-1-ai-out", targetPortId: "port-1-store-in", name: "Generated Graph JSON", linkStyle: "bezier", color: "#7c3aed", context: "root" },

                // Дополнительные взаимосвязи архитектуры (36 связей всего)
                { id: "link-extra-1", sourcePortId: "port-1-tb-out", targetPortId: "port-1-vp-in", name: "Tool Select", linkStyle: "orthogonal", color: "#38bdf8", context: "root" },
                { id: "link-extra-2", sourcePortId: "port-1-red-out", targetPortId: "port-1-pp-in", name: "Property Update", linkStyle: "bezier", color: "#0d9488", context: "root" },
                { id: "link-extra-3", sourcePortId: "port-1-geom-out", targetPortId: "port-1-store-in", name: "BBox Update", linkStyle: "orthogonal", color: "#f59e0b", context: "root" },
                { id: "link-extra-4", sourcePortId: "port-1-ai-out", targetPortId: "port-1-vp-in", name: "Auto-layout render", linkStyle: "bezier", color: "#c084fc", context: "root" },
                { id: "link-extra-5", sourcePortId: "port-1-vp-out", targetPortId: "port-1-pp-in", name: "Selection Inspector", linkStyle: "bezier", color: "#38bdf8", context: "root" },
                { id: "link-extra-6", sourcePortId: "port-1-tb-out", targetPortId: "port-1-geom-in", name: "Align Command", linkStyle: "orthogonal", color: "#0284c7", context: "root" },
                { id: "link-extra-7", sourcePortId: "port-1-storage-out", targetPortId: "port-1-vp-in", name: "Viewport Hydrate", linkStyle: "bezier", color: "#818cf8", context: "root" },
                { id: "link-extra-8", sourcePortId: "port-1-ai-out", targetPortId: "port-1-storage-in", name: "Backup AI Graph", linkStyle: "bezier", color: "#7c3aed", context: "root" },
                { id: "link-extra-9", sourcePortId: "port-1-store-out", targetPortId: "port-1-geom-in", name: "Hierarchy Sync", linkStyle: "orthogonal", color: "#2dd4bf", context: "root" },
                { id: "link-extra-10", sourcePortId: "port-1-red-out", targetPortId: "port-1-ai-in", name: "Graph State Feedback", linkStyle: "bezier", color: "#0d9488", context: "root" }
            ],
            canvas: {
                offset: { x: 950, y: 350 },
                zoom: 0.5
            },
            currentContext: "root",
            breadcrumbs: [
                { id: "root", name: "Главный холст" }
            ],
            cameraByContext: {}
        };

        dispatch({ type: 'LOAD_STATE', payload: demoState });
    };

    const addNode = () => {
        // Position at center of view based on offset and zoom
        const centerX = (-state.canvas.offset.x + window.innerWidth / 2) / state.canvas.zoom;
        const centerY = (-state.canvas.offset.y + window.innerHeight / 2) / state.canvas.zoom;

        dispatch({
            type: 'ADD_NODE',
            payload: {
                name: 'New Node',
                position: toContextRelative(centerX - 100, centerY - 50),
                size: { w: 200, h: 100 },
                color: '#1a1a1a',
                shape: 'rectangle'
            }
        });
    };

    const clearCanvas = () => {
        const templateState = {
            layers: {},
            nodes: {},
            ports: {},
            links: []
        };
        dispatch({ type: 'LOAD_STATE', payload: templateState });
    };

    return (
        <div className={`absolute top-1/2 -translate-y-1/2 glass-panel rounded-xl shadow-2xl p-2 flex flex-col gap-2 z-40 border-[#444] transition-all duration-300 ${state.ui.libraryOpen ? 'left-[382px]' : 'left-4'}`} data-file="components/Toolbar.js">
            <button
                className={`btn w-10 h-10 p-0 rounded-md ${state.ui.libraryOpen ? 'bg-[var(--accent-blue)] text-white border-[var(--accent-blue)]' : 'text-gray-400 hover:text-white'}`}
                onClick={() => dispatch({ type: 'TOGGLE_UI', payload: 'libraryOpen' })}
                title="Обозреватель проекта (Библиотека)"
            >
                <div className="icon-list text-xl"></div>
            </button>

            <div className="w-full h-px bg-[#333] my-1"></div>

            <button
                className="btn btn-primary w-10 h-10 p-0 rounded-md"
                onClick={addNode}
                title="Быстрый пустой узел"
            >
                <div className="icon-square-plus text-xl"></div>
            </button>

            <button
                className="btn w-10 h-10 p-0 rounded-md text-orange-400 hover:text-orange-300 hover:bg-white/5 border border-transparent"
                onClick={() => {
                    const centerX = (-state.canvas.offset.x + window.innerWidth / 2) / state.canvas.zoom;
                    const centerY = (-state.canvas.offset.y + window.innerHeight / 2) / state.canvas.zoom;
                    dispatch({
                        type: 'ADD_LAYER',
                        payload: {
                            name: 'Новый слой',
                            position: toContextRelative(centerX - 300, centerY - 200),
                            size: { w: 600, h: 400 },
                            color: '#ff9500'
                        }
                    });
                }}
                title="Добавить слой"
            >
                <div className="icon-layers text-xl"></div>
            </button>

            {Object.values(state.layers).filter(l => (l.parentId || 'root') === state.currentContext).length >= 2 && (
                <button
                    className="btn w-10 h-10 p-0 rounded-md text-cyan-400 hover:text-cyan-300 hover:bg-white/5 border border-transparent"
                    onClick={() => {
                        dispatch({
                            type: 'ALIGN_LAYERS',
                            payload: { contextId: state.currentContext }
                        });
                    }}
                    title="Выровнять слои"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 2v20" strokeDasharray="2 2" opacity="0.5" />
                        <rect x="7" y="3" width="13" height="4" rx="1" fill="currentColor" fillOpacity="0.25" />
                        <rect x="7" y="10" width="10" height="4" rx="1" fill="currentColor" fillOpacity="0.25" />
                        <rect x="7" y="17" width="14" height="4" rx="1" fill="currentColor" fillOpacity="0.25" />
                    </svg>
                </button>
            )}

            <button
                className={`btn w-10 h-10 p-0 rounded-md ${state.interactionMode === 'add-port' ? 'btn-primary' : 'text-gray-400 hover:text-white'}`}
                title="Добавить порт (Кликните по краю узла)"
                onClick={() => dispatch({ type: 'SET_MODE', payload: state.interactionMode === 'add-port' ? 'default' : 'add-port' })}
            >
                <div className="icon-circle text-xl"></div>
            </button>

            <div className="w-full h-px bg-[#333] my-1"></div>

            <button
                className={`btn w-10 h-10 p-0 rounded-md transition-colors ${state.isolatedIds.length > 0 ? 'bg-orange-500 text-white hover:bg-orange-600' : 'text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed'}`}
                title={state.isolatedIds.length > 0 ? "Отключить изоляцию" : "Изолировать выделенные элементы"}
                disabled={state.selectedIds.length === 0 && state.isolatedIds.length === 0}
                onClick={() => {
                    if (state.isolatedIds.length > 0) {
                        dispatch({ type: 'SET_ISOLATED', payload: [] });
                    } else {
                        dispatch({ type: 'SET_ISOLATED', payload: [...state.selectedIds] });
                        dispatch({ type: 'SET_SELECTED', payload: null }); // clear selection after isolate
                    }
                }}
            >
                <div className="icon-scan text-xl"></div>
            </button>

            <div className="w-full h-px bg-[#333] my-1"></div>

            <button
                className={`btn w-10 h-10 p-0 rounded-md ${state.selectedIds && state.selectedIds.length > 0 && state.nodes[state.selectedIds[0]]?.type === 'ai-agent' ? 'bg-purple-600 text-white border-purple-500 shadow-[0_0_15px_rgba(147,51,234,0.5)]' : 'text-purple-400 hover:text-purple-300'}`}
                title="Ассистент"
                onClick={() => {
                    dispatch({
                        type: 'ADD_NODE',
                        payload: {
                            name: '💬 AI Assistant Copilot',
                            type: 'ai-agent',
                            position: toContextRelative(-state.canvas.offset.x / state.canvas.zoom + 200, -state.canvas.offset.y / state.canvas.zoom + 100),
                            size: { w: 320, h: 450 },
                            color: '#3b0764'
                        }
                    });
                }}
            >
                <div className="icon-bot text-xl"></div>
            </button>

            <div className="w-full h-px bg-[#333] my-1"></div>

            <button
                className="btn w-10 h-10 p-0 rounded-md text-gray-400 hover:text-white"
                title="Импорт проекта"
                onClick={() => fileInputRef.current?.click()}
            >
                <div className="icon-upload text-xl"></div>
            </button>
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".json"
                onChange={handleImport}
            />

            <button
                className="btn w-10 h-10 p-0 rounded-md text-gray-400 hover:text-white"
                title="Экспорт проекта"
                onClick={handleExport}
            >
                <div className="icon-download text-xl"></div>
            </button>

            <button
                className="btn w-10 h-10 p-0 rounded-md text-green-500/80 hover:text-green-400 hover:bg-green-500/10"
                title="Загрузить тестовый проект (Тест)"
                onClick={handleLoadDemo}
            >
                <div className="icon-boxes text-xl"></div>
            </button>

            <button
                className="btn w-10 h-10 p-0 rounded-md text-red-500/80 hover:text-red-400 hover:bg-red-500/10"
                title="Очистить проект (Удалить все сохранения)"
                onClick={() => {
                    if (window.confirm('Вы уверены, что хотите полностью очистить холст и удалить все сохранения?')) {
                        const store = window.ArchitectorStore || {};
                        localStorage.removeItem(store.STORAGE_KEY || 'architector_state_v10');
                        localStorage.removeItem(store.LEGACY_STORAGE_KEY_V9 || 'architector_state_v9');
                        window.location.reload();
                    }
                }}
            >
                <div className="icon-rotate-ccw text-xl"></div>
            </button>

            <div className="w-full h-px bg-[#333] my-1"></div>
            <div className="text-center text-[10px] text-gray-500 font-mono" title="Масштаб">
                {Math.round(state.canvas.zoom * 100)}%
            </div>
        </div>
    );
}