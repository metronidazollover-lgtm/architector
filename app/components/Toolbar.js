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
                "layer-1-ui": {
                    id: "layer-1-ui",
                    name: "Слой 1. Пользовательский интерфейс (UI)",
                    content: "Рендеринг элементов управления, панелей свойств и библиотек узлов",
                    color: "#0284c7",
                    position: { x: -350, y: -200 },
                    size: { w: 600, h: 500 },
                    locked: false,
                    parentId: "root",
                    snapToGrid: true
                },
                "layer-1-state": {
                    id: "layer-1-state",
                    name: "Слой 2. Управление состоянием (Redux)",
                    content: "Центральное хранилище данных, история Undo/Redo и бизнес-логика",
                    color: "#0d9488",
                    position: { x: -350, y: -200 }, // Пересекается для тестирования LOAD_STATE
                    size: { w: 550, h: 400 },
                    locked: false,
                    parentId: "root",
                    snapToGrid: true
                },
                "layer-1-geom": {
                    id: "layer-1-geom",
                    name: "Слой 3. Геометрия и разметка (Geometry)",
                    content: "Калькуляторы физических размеров, авторазметки и коллизий на холсте",
                    color: "#b45309",
                    position: { x: -350, y: -200 }, // Пересекается для тестирования LOAD_STATE
                    size: { w: 550, h: 420 },
                    locked: false,
                    parentId: "root",
                    snapToGrid: true
                },
                "layer-1-storage": {
                    id: "layer-1-storage",
                    name: "Слой 4. Локальное хранилище (Storage)",
                    content: "Синхронизация с LocalStorage, импорт/экспорт проектов и миграции версий",
                    color: "#4f46e5",
                    position: { x: -350, y: -200 }, // Пересекается для тестирования LOAD_STATE
                    size: { w: 550, h: 320 },
                    locked: false,
                    parentId: "root",
                    snapToGrid: true
                },
                "layer-1-api": {
                    id: "layer-1-api",
                    name: "Слой 5. ИИ Ассистент и API (AI Chat)",
                    content: "Связующее звено с языковыми моделями, генерация графов и шторка чата",
                    color: "#7c3aed",
                    position: { x: -350, y: -200 }, // Пересекается для тестирования LOAD_STATE
                    size: { w: 550, h: 320 },
                    locked: false,
                    parentId: "root",
                    snapToGrid: true
                },

                // ================= LEVEL 2 LAYERS (Parent: node-1-viewport) =================
                "layer-2-canvas": {
                    id: "layer-2-canvas",
                    name: "Слой 1. Фоновый Холст",
                    content: "Координатная сетка, параллакс-эффекты и трансляция мыши в мировые координаты",
                    color: "#0369a1",
                    position: { x: 50, y: 80 },
                    size: { w: 600, h: 450 },
                    locked: false,
                    parentId: "node-1-viewport",
                    snapToGrid: true
                },
                "layer-2-dragdrop": {
                    id: "layer-2-dragdrop",
                    name: "Слой 2. Drag & Drop Логика",
                    content: "Захват событий перемещения, лимиты перетаскивания и шаги сетки",
                    color: "#0f766e",
                    position: { x: 50, y: 80 },
                    size: { w: 550, h: 400 },
                    locked: false,
                    parentId: "node-1-viewport",
                    snapToGrid: true
                },
                "layer-2-svg-links": {
                    id: "layer-2-svg-links",
                    name: "Слой 3. Отрисовка Связей",
                    content: "Построение кривых Безье и ортогональных линий, SVG стрелки и маркеры",
                    color: "#9a3412",
                    position: { x: 50, y: 80 },
                    size: { w: 550, h: 400 },
                    locked: false,
                    parentId: "node-1-viewport",
                    snapToGrid: true
                },
                "layer-2-zoom": {
                    id: "layer-2-zoom",
                    name: "Слой 4. Масштабирование",
                    content: "Расчет коэффициентов зума, фокус на курсоре и погружение в узлы (auto-dive)",
                    color: "#312e81",
                    position: { x: 50, y: 80 },
                    size: { w: 550, h: 320 },
                    locked: false,
                    parentId: "node-1-viewport",
                    snapToGrid: true
                },
                "layer-2-xray": {
                    id: "layer-2-xray",
                    name: "Слой 5. X-Ray & Фокус",
                    content: "Z-index наложения, подсветка родительских контейнеров при выборе дочерних",
                    color: "#581c87",
                    position: { x: 50, y: 80 },
                    size: { w: 550, h: 420 },
                    locked: false,
                    parentId: "node-1-viewport",
                    snapToGrid: true
                },

                // ================= LEVEL 3 LAYERS (Parent: node-2-coord-trans) =================
                "layer-3-transforms": {
                    id: "layer-3-transforms",
                    name: "Слой 1. Матрицы проекций",
                    content: "Перемножение матриц масштаба и сдвига, оптимизация сложных траекторий",
                    color: "#0284c7",
                    position: { x: 50, y: 80 },
                    size: { w: 500, h: 400 },
                    locked: false,
                    parentId: "node-2-coord-trans",
                    snapToGrid: true
                },
                "layer-3-screen-space": {
                    id: "layer-3-screen-space",
                    name: "Слой 2. Экранное Окружение",
                    content: "DOM координаты, devicePixelRatio калибровка и DPI рендеринг",
                    color: "#0d9488",
                    position: { x: 50, y: 80 },
                    size: { w: 500, h: 400 },
                    locked: false,
                    parentId: "node-2-coord-trans",
                    snapToGrid: true
                },
                "layer-3-canvas-space": {
                    id: "layer-3-canvas-space",
                    name: "Слой 3. Мировые Координаты",
                    content: "Расчет позиций объектов внутри холста с учетом локальных смещений",
                    color: "#b45309",
                    position: { x: 50, y: 80 },
                    size: { w: 500, h: 400 },
                    locked: false,
                    parentId: "node-2-coord-trans",
                    snapToGrid: true
                },
                "layer-3-zoom-math": {
                    id: "layer-3-zoom-math",
                    name: "Слой 4. Математика Зума",
                    content: "Плавное логарифмическое масштабирование и расчет точки привязки (Pivot)",
                    color: "#4f46e5",
                    position: { x: 50, y: 80 },
                    size: { w: 500, h: 400 },
                    locked: false,
                    parentId: "node-2-coord-trans",
                    snapToGrid: true
                },
                "layer-3-offsets": {
                    id: "layer-3-offsets",
                    name: "Слой 5. Смещения Камеры",
                    content: "Хранение смещений viewport, инерционная прокрутка холста и возврат камеры",
                    color: "#7c3aed",
                    position: { x: 50, y: 80 },
                    size: { w: 500, h: 450 },
                    locked: false,
                    parentId: "node-2-coord-trans",
                    snapToGrid: true
                }
            },
            nodes: {
                // ================= LEVEL 1 NODES (Parent: layers on root) =================
                // UI Layer Nodes
                "node-1-viewport": {
                    id: "node-1-viewport",
                    name: "Рендерер Холста (Viewport)",
                    group: "Интерфейс",
                    content: "Интерактивная область визуализации, отрисовка узлов, портов и связей",
                    color: "#1e293b",
                    position: { x: 50, y: 80 },
                    size: { w: 280, h: 140 },
                    parentId: "layer-1-ui",
                    snapToGrid: true,
                    shape: "rectangle",
                    mediaUrl: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=200&auto=format&fit=crop&q=60",
                    mediaHeight: 80
                },
                "node-1-toolbar": {
                    id: "node-1-toolbar",
                    name: "Панель Инструментов (Toolbar)",
                    group: "Интерфейс",
                    content: "Быстрый доступ к добавлению узлов, слоев, экспорту и выравниванию",
                    color: "#1e293b",
                    position: { x: 50, y: 80 },
                    size: { w: 220, h: 100 },
                    parentId: "layer-1-ui",
                    snapToGrid: true,
                    shape: "hexagon"
                },
                "node-1-propertypanel": {
                    id: "node-1-propertypanel",
                    name: "Инспектор Свойств (PropertyPanel)",
                    group: "Интерфейс",
                    content: "Форма изменения названий, цветов, форм и переключения привязки к сетке",
                    color: "#1e293b",
                    position: { x: 50, y: 80 },
                    size: { w: 240, h: 100 },
                    parentId: "layer-1-ui",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-1-library": {
                    id: "node-1-library",
                    name: "Дерево и Библиотека",
                    group: "Интерфейс",
                    content: "Обозреватель проекта с возможностью перетаскивания иерархии (Drag & Drop)",
                    color: "#1e293b",
                    position: { x: 50, y: 80 },
                    size: { w: 230, h: 100 },
                    parentId: "layer-1-ui",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                // State Layer Nodes
                "node-1-store": {
                    id: "node-1-store",
                    name: "React Context Store",
                    group: "Состояние",
                    content: "Хранилище единого источника правды (Single Source of Truth) для всего графа",
                    color: "#0f172a",
                    position: { x: 50, y: 80 },
                    size: { w: 220, h: 100 },
                    parentId: "layer-1-state",
                    snapToGrid: true,
                    shape: "circle"
                },
                "node-1-reducer": {
                    id: "node-1-reducer",
                    name: "Диспетчер Редьюсера (Reducer)",
                    group: "Состояние",
                    content: "Маршрутизация экшенов: ADD_NODE, ALIGN_LAYERS, LOAD_STATE и др.",
                    color: "#0f172a",
                    position: { x: 50, y: 80 },
                    size: { w: 240, h: 100 },
                    parentId: "layer-1-state",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-1-history": {
                    id: "node-1-history",
                    name: "Менеджер Истории",
                    group: "Состояние",
                    content: "Стеки past и future для Undo/Redo операций и логирования изменений",
                    color: "#0f172a",
                    position: { x: 50, y: 80 },
                    size: { w: 210, h: 100 },
                    parentId: "layer-1-state",
                    snapToGrid: true,
                    shape: "octagon"
                },
                // Geometry Layer Nodes
                "node-1-collision": {
                    id: "node-1-collision",
                    name: "Модуль Коллизий",
                    group: "Геометрия",
                    content: "Выталкивание нод (gap=30px), слайдинг слоев (gap=10px) и расталкивание при LOAD_STATE",
                    color: "#1c1917",
                    position: { x: 50, y: 80 },
                    size: { w: 240, h: 100 },
                    parentId: "layer-1-geom",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-1-layout": {
                    id: "node-1-layout",
                    name: "Умное Размещение (Layout)",
                    group: "Геометрия",
                    content: "Алгоритм getSmartPlacement для бесконфликтной укладки элементов в слои",
                    color: "#1c1917",
                    position: { x: 50, y: 80 },
                    size: { w: 240, h: 100 },
                    parentId: "layer-1-geom",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-1-bbox": {
                    id: "node-1-bbox",
                    name: "Калькулятор Границ (BBox)",
                    group: "Геометрия",
                    content: "Расчет bounding box для автоматического подбора размеров слоев (fit-to-content)",
                    color: "#1c1917",
                    position: { x: 50, y: 80 },
                    size: { w: 240, h: 100 },
                    parentId: "layer-1-geom",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                // Storage Layer Nodes
                "node-1-localstorage": {
                    id: "node-1-localstorage",
                    name: "LocalStorage Engine",
                    group: "Хранение",
                    content: "Сериализация стейта, автосохранение изменений при каждой транзакции",
                    color: "#1e1b4b",
                    position: { x: 50, y: 80 },
                    size: { w: 220, h: 100 },
                    parentId: "layer-1-storage",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-1-migration": {
                    id: "node-1-migration",
                    name: "Конвертер Версий (Migration)",
                    group: "Хранение",
                    content: "Самолечение структуры данных, миграция с legacy v9 на v10",
                    color: "#1e1b4b",
                    position: { x: 50, y: 80 },
                    size: { w: 220, h: 100 },
                    parentId: "layer-1-storage",
                    snapToGrid: true,
                    shape: "triangle"
                },
                // API / AI Layer Nodes
                "node-1-ai-client": {
                    id: "node-1-ai-client",
                    name: "💬 AI Assistant (Copilot)",
                    group: "ИИ",
                    content: "Автоматический разбор инцидентов и построение архитектур по текстовым промптам",
                    color: "#3b0764",
                    position: { x: 50, y: 80 },
                    size: { w: 280, h: 120 },
                    parentId: "layer-1-api",
                    snapToGrid: true,
                    shape: "rectangle",
                    type: "ai-agent"
                },
                "node-1-ai-chat": {
                    id: "node-1-ai-chat",
                    name: "Интерфейс AI-чата",
                    group: "ИИ",
                    content: "Интерактивная боковая панель с выводом сообщений от ИИ-помощника",
                    color: "#3b0764",
                    position: { x: 50, y: 80 },
                    size: { w: 220, h: 100 },
                    parentId: "layer-1-api",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-1-exporter": {
                    id: "node-1-exporter",
                    name: "JSON Exporter",
                    group: "Хранение",
                    content: "Формирование готовых JSON файлов проекта для скачивания",
                    color: "#1e1b4b",
                    position: { x: 50, y: 80 },
                    size: { w: 220, h: 100 },
                    parentId: "layer-1-api",
                    snapToGrid: true,
                    shape: "rectangle"
                },

                // ================= LEVEL 2 NODES (Parent: node-1-viewport) =================
                // Canvas layer
                "node-2-grid-render": {
                    id: "node-2-grid-render",
                    name: "Отрисовщик Сетки",
                    group: "Рендеринг",
                    content: "Динамическая отрисовка линий сетки с шагом 20px с учетом масштаба",
                    color: "#1c1917",
                    position: { x: 50, y: 80 },
                    size: { w: 200, h: 100 },
                    parentId: "layer-2-canvas",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-2-coord-trans": {
                    id: "node-2-coord-trans",
                    name: "Преобразователь Координат",
                    group: "Рендеринг",
                    content: "Конвертер экранных кликов в мировые координаты холста",
                    color: "#1c1917",
                    position: { x: 50, y: 80 },
                    size: { w: 260, h: 120 },
                    parentId: "layer-2-canvas",
                    snapToGrid: true,
                    shape: "rectangle",
                    mediaUrl: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=200&auto=format&fit=crop&q=60",
                    mediaHeight: 70
                },
                "node-2-canvas-container": {
                    id: "node-2-canvas-container",
                    name: "SVG Контейнер",
                    group: "Рендеринг",
                    content: "Контейнер SVG элементов, управляющий общим сдвигом холста",
                    color: "#1c1917",
                    position: { x: 50, y: 80 },
                    size: { w: 200, h: 100 },
                    parentId: "layer-2-canvas",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-2-viewport-bounds": {
                    id: "node-2-viewport-bounds",
                    name: "Границы Видимости",
                    group: "Рендеринг",
                    content: "Отсечение невидимых элементов вне экрана для повышения производительности",
                    color: "#1c1917",
                    position: { x: 50, y: 80 },
                    size: { w: 200, h: 100 },
                    parentId: "layer-2-canvas",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                // DragDrop layer
                "node-2-mouse-events": {
                    id: "node-2-mouse-events",
                    name: "Слушатель Событий Мыши",
                    group: "Взаимодействие",
                    content: "Перехватчик мыши: mousedown, mousemove, mouseup",
                    color: "#0f172a",
                    position: { x: 50, y: 80 },
                    size: { w: 200, h: 100 },
                    parentId: "layer-2-dragdrop",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-2-drag-state": {
                    id: "node-2-drag-state",
                    name: "Стейт Перетаскивания",
                    group: "Взаимодействие",
                    content: "Временное хранилище смещения текущего перетаскиваемого объекта",
                    color: "#0f172a",
                    position: { x: 50, y: 80 },
                    size: { w: 200, h: 100 },
                    parentId: "layer-2-dragdrop",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-2-snap-align": {
                    id: "node-2-snap-align",
                    name: "Выравнивание по Сетке",
                    group: "Взаимодействие",
                    content: "Округление перемещаемых координат под шаг 20px (при snapToGrid: true)",
                    color: "#0f172a",
                    position: { x: 50, y: 80 },
                    size: { w: 200, h: 100 },
                    parentId: "layer-2-dragdrop",
                    snapToGrid: true,
                    shape: "hexagon"
                },
                "node-2-layer-push": {
                    id: "node-2-layer-push",
                    name: "Слайдер Слоев (Push)",
                    group: "Взаимодействие",
                    content: "Сдвиг мешающих слоев по краям с зазором 10px при ручном перетаскивании",
                    color: "#0f172a",
                    position: { x: 50, y: 80 },
                    size: { w: 200, h: 100 },
                    parentId: "layer-2-dragdrop",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                // SVG Links layer
                "node-2-path-calc": {
                    id: "node-2-path-calc",
                    name: "Калькулятор Пути Связей",
                    group: "Отрисовка связей",
                    content: "Вычисление точек излома и траекторий для соединительных линий",
                    color: "#1c1917",
                    position: { x: 50, y: 80 },
                    size: { w: 200, h: 100 },
                    parentId: "layer-2-svg-links",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-2-arrowheads": {
                    id: "node-2-arrowheads",
                    name: "Маркеры-Стрелки",
                    group: "Отрисовка связей",
                    content: "Генерация наконечников связей в виде SVG path треугольников",
                    color: "#1c1917",
                    position: { x: 50, y: 80 },
                    size: { w: 200, h: 100 },
                    parentId: "layer-2-svg-links",
                    snapToGrid: true,
                    shape: "triangle"
                },
                "node-2-orthogonal": {
                    id: "node-2-orthogonal",
                    name: "Ортогональные Линии",
                    group: "Отрисовка связей",
                    content: "Отрисовка соединений под прямыми углами 90 градусов",
                    color: "#1c1917",
                    position: { x: 50, y: 80 },
                    size: { w: 200, h: 100 },
                    parentId: "layer-2-svg-links",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-2-bezier": {
                    id: "node-2-bezier",
                    name: "Связи Безье",
                    group: "Отрисовка связей",
                    content: "Интерполяция кривых Безье третьего порядка для красивых соединений",
                    color: "#1c1917",
                    position: { x: 50, y: 80 },
                    size: { w: 200, h: 100 },
                    parentId: "layer-2-svg-links",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                // Zoom layer
                "node-2-scale": {
                    id: "node-2-scale",
                    name: "Zoom Factor",
                    group: "Масштаб",
                    content: "Текущий масштаб отображения холста (от 0.1 до 3.0)",
                    color: "#0f172a",
                    position: { x: 50, y: 80 },
                    size: { w: 200, h: 100 },
                    parentId: "layer-2-zoom",
                    snapToGrid: true,
                    shape: "octagon"
                },
                "node-2-wheel-handler": {
                    id: "node-2-wheel-handler",
                    name: "Обработчик Колеса Мыши",
                    group: "Масштаб",
                    content: "Перехват скролла мыши и тачпада для плавного зумирования",
                    color: "#0f172a",
                    position: { x: 50, y: 80 },
                    size: { w: 200, h: 100 },
                    parentId: "layer-2-zoom",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-2-autodive-check": {
                    id: "node-2-autodive-check",
                    name: "Авто-Погружение (Auto-Dive)",
                    group: "Масштаб",
                    content: "Проверка порогового масштаба для проваливания внутрь нод (если включено в UI)",
                    color: "#0f172a",
                    position: { x: 50, y: 80 },
                    size: { w: 200, h: 100 },
                    parentId: "layer-2-zoom",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                // X-Ray & Focus layer
                "node-2-depth-calc": {
                    id: "node-2-depth-calc",
                    name: "Глубина Иерархии",
                    group: "Интеграция",
                    content: "Вычисление depth для правильной расстановки CSS z-index (depth * 10)",
                    color: "#1e1b4b",
                    position: { x: 50, y: 80 },
                    size: { w: 200, h: 100 },
                    parentId: "layer-2-xray",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-2-xray-pointer": {
                    id: "node-2-xray-pointer",
                    name: "X-Ray Pointer Events",
                    group: "Интеграция",
                    content: "Проброс кликов сквозь полупрозрачные родительские ноды (pointer-events-auto)",
                    color: "#1e1b4b",
                    position: { x: 50, y: 80 },
                    size: { w: 200, h: 100 },
                    parentId: "layer-2-xray",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-2-parent-pulse": {
                    id: "node-2-parent-pulse",
                    name: "Аниматор Пульсации",
                    group: "Интеграция",
                    content: "Плавная CSS-подсветка контуров родительской ноды при выборе дочернего элемента",
                    color: "#1e1b4b",
                    position: { x: 50, y: 80 },
                    size: { w: 200, h: 100 },
                    parentId: "layer-2-xray",
                    snapToGrid: true,
                    shape: "circle"
                },
                "node-2-selection-sync": {
                    id: "node-2-selection-sync",
                    name: "Синхронизатор выбора",
                    group: "Интеграция",
                    content: "Выделение и подсветка ноды в боковом обозревателе проекта",
                    color: "#1e1b4b",
                    position: { x: 50, y: 80 },
                    size: { w: 200, h: 100 },
                    parentId: "layer-2-xray",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-2-focus-element": {
                    id: "node-2-focus-element",
                    name: "Центратор Камеры",
                    group: "Интеграция",
                    content: "Сдвиг и центрирование камеры viewport на выбранном элементе",
                    color: "#1e1b4b",
                    position: { x: 50, y: 80 },
                    size: { w: 200, h: 100 },
                    parentId: "layer-2-xray",
                    snapToGrid: true,
                    shape: "rectangle"
                },

                // ================= LEVEL 3 NODES (Parent: node-2-coord-trans) =================
                // Transforms Layer Nodes
                "node-3-matrix-mult": {
                    id: "node-3-matrix-mult",
                    name: "Матричное Перемножение",
                    group: "Трансформации",
                    content: "Расчет итоговой 2D аффинной матрицы трансформаций",
                    color: "#1c1917",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-transforms",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-3-inverse-matrix": {
                    id: "node-3-inverse-matrix",
                    name: "Инверсия Матрицы",
                    group: "Трансформации",
                    content: "Калькулятор обратного преобразования для определения кликов по холсту",
                    color: "#1c1917",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-transforms",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-3-scale-factor": {
                    id: "node-3-scale-factor",
                    name: "Масштабирующий Вектор",
                    group: "Трансформации",
                    content: "Применение масштабирования по осям X и Y",
                    color: "#1c1917",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-transforms",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-3-affine-transform": {
                    id: "node-3-affine-transform",
                    name: "Аффинные Сдвиги",
                    group: "Трансформации",
                    content: "Применение сдвигов без искажения параллельности линий",
                    color: "#1c1917",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-transforms",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-3-transform-cache": {
                    id: "node-3-transform-cache",
                    name: "Кэш Матриц",
                    group: "Трансформации",
                    content: "Кэширование промежуточных матриц сдвига для ускорения рендеринга",
                    color: "#1c1917",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-transforms",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                // Screen Space Layer Nodes
                "node-3-client-rect": {
                    id: "node-3-client-rect",
                    name: "DOM Client Rect",
                    group: "Экран",
                    content: "Чтение физических размеров контейнера через getBoundingClientRect()",
                    color: "#0f172a",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-screen-space",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-3-mouse-pos": {
                    id: "node-3-mouse-pos",
                    name: "Координаты Курсора",
                    group: "Экран",
                    content: "Чтение клиентских e.clientX и e.clientY во время событий",
                    color: "#0f172a",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-screen-space",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-3-scroll-offset": {
                    id: "node-3-scroll-offset",
                    name: "Скролл Страницы",
                    group: "Экран",
                    content: "Корректировка координат на величины window.scrollX/scrollY",
                    color: "#0f172a",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-screen-space",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-3-screen-center": {
                    id: "node-3-screen-center",
                    name: "Центральная Точка",
                    group: "Экран",
                    content: "Вычисление центра экрана для правильного сброса камеры",
                    color: "#0f172a",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-screen-space",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-3-dpi-scaler": {
                    id: "node-3-dpi-scaler",
                    name: "DPI Scaler",
                    group: "Экран",
                    content: "Калибровка четкости рендеринга сетки с учетом devicePixelRatio",
                    color: "#0f172a",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-screen-space",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                // Canvas Space Layer Nodes
                "node-3-world-pos": {
                    id: "node-3-world-pos",
                    name: "Мировые Координаты",
                    group: "Холст",
                    content: "Итоговые координаты элементов в виртуальной системе отсчета холста",
                    color: "#1c1917",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-canvas-space",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-3-relative-offset": {
                    id: "node-3-relative-offset",
                    name: "Относительный Сдвиг",
                    group: "Холст",
                    content: "Компенсация смещения родительских нод во вложенных контекстах",
                    color: "#1c1917",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-canvas-space",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-3-grid-snap-math": {
                    id: "node-3-grid-snap-math",
                    name: "Шаг Сетки (Математика)",
                    group: "Холст",
                    content: "Округление до ближайшего кратного 20 (Math.round(x/20)*20)",
                    color: "#1c1917",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-canvas-space",
                    snapToGrid: true,
                    shape: "hexagon"
                },
                "node-3-canvas-bounds": {
                    id: "node-3-canvas-bounds",
                    name: "Лимиты Холста",
                    group: "Холст",
                    content: "Крайние геометрические границы для предотвращения бесконечного ухода камеры",
                    color: "#1c1917",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-canvas-space",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-3-clamp-coords": {
                    id: "node-3-clamp-coords",
                    name: "Клиппер Диапазона",
                    group: "Холст",
                    content: "Удержание координат элементов в пределах допустимого холста",
                    color: "#1c1917",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-canvas-space",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                // Zoom Math Layer Nodes
                "node-3-logarithmic-zoom": {
                    id: "node-3-logarithmic-zoom",
                    name: "Логарифмический зум",
                    group: "Масштаб",
                    content: "Расчет плавных шагов зума, предотвращающий резкие скачки масштаба",
                    color: "#0f172a",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-zoom-math",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-3-zoom-limits": {
                    id: "node-3-zoom-limits",
                    name: "Ограничитель Масштаба",
                    group: "Масштаб",
                    content: "Фиксация масштабирования в безопасных пределах (0.1x - 3.0x)",
                    color: "#0f172a",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-zoom-math",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-3-zoom-pivot": {
                    id: "node-3-zoom-pivot",
                    name: "Точка Зума (Pivot)",
                    group: "Масштаб",
                    content: "Математическое удержание курсора мыши в одной точке при зуме",
                    color: "#0f172a",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-zoom-math",
                    snapToGrid: true,
                    shape: "circle"
                },
                "node-3-lerp-zoom": {
                    id: "node-3-lerp-zoom",
                    name: "Интерполятор Зума",
                    group: "Масштаб",
                    content: "Линейная интерполяция (lerp) для сглаженной анимации зума по кнопкам",
                    color: "#0f172a",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-zoom-math",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-3-pinch-gesture": {
                    id: "node-3-pinch-gesture",
                    name: "Детектор Щипка (Pinch)",
                    group: "Масштаб",
                    content: "Обработка жестов масштабирования двумя пальцами на трекпаде и тач-устройствах",
                    color: "#0f172a",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-zoom-math",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                // Offsets Layer Nodes
                "node-3-pan-delta": {
                    id: "node-3-pan-delta",
                    name: "Дельта Смещения",
                    group: "Камера",
                    content: "Расчет вектора панорамирования при перетаскивании холста",
                    color: "#1e1b4b",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-offsets",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-3-canvas-center": {
                    id: "node-3-canvas-center",
                    name: "Расчет Центра Холста",
                    group: "Камера",
                    content: "Позиционирование камеры на нулевую координату {x:0, y:0}",
                    color: "#1e1b4b",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-offsets",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-3-camera-save": {
                    id: "node-3-camera-save",
                    name: "Сохранение Камеры",
                    group: "Камера",
                    content: "Запись смещения и масштаба в dictionary cameraByContext при выходе",
                    color: "#1e1b4b",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-offsets",
                    snapToGrid: true,
                    shape: "octagon"
                },
                "node-3-camera-load": {
                    id: "node-3-camera-load",
                    name: "Загрузка Камеры",
                    group: "Камера",
                    content: "Восстановление сохраненного положения камеры для открываемого контекста",
                    color: "#1e1b4b",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-offsets",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-3-camera-transition": {
                    id: "node-3-camera-transition",
                    name: "Аниматор Перелетов",
                    group: "Камера",
                    content: "Плавное перемещение камеры при двойном клике (входе/выходе из контекста)",
                    color: "#1e1b4b",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-offsets",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                // Дополнительные ноды для гарантии 60+ элементов
                "node-3-inertia-scroll": {
                    id: "node-3-inertia-scroll",
                    name: "Инерционная Прокрутка",
                    group: "Камера",
                    content: "Сглаженное продолжение движения камеры после отпускания мыши (инерция)",
                    color: "#1e1b4b",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-offsets",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-3-reset-view": {
                    id: "node-3-reset-view",
                    name: "Сброс Камеры (Reset)",
                    group: "Камера",
                    content: "Мгновенный сброс смещения и масштаба в дефолтные {x:-30, y:-50} 0.65x",
                    color: "#1e1b4b",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-offsets",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-3-camera-bounds-check": {
                    id: "node-3-camera-bounds-check",
                    name: "Ограничитель Камеры",
                    group: "Камера",
                    content: "Проверка, чтобы камера не уходила слишком далеко от крайних нод проекта",
                    color: "#1e1b4b",
                    position: { x: 50, y: 80 },
                    size: { w: 180, h: 90 },
                    parentId: "layer-3-offsets",
                    snapToGrid: true,
                    shape: "rectangle"
                }
            },
            ports: {
                // ================= LEVEL 1 PORTS =================
                "port-1-vp-in": {
                    id: "port-1-vp-in",
                    nodeId: "node-1-viewport",
                    type: "input",
                    edge: "left",
                    position: 0.3,
                    name: "Рендеринг запросов"
                },
                "port-1-vp-out": {
                    id: "port-1-vp-out",
                    nodeId: "node-1-viewport",
                    type: "output",
                    edge: "right",
                    position: 0.5,
                    name: "События холста"
                },
                "port-1-tb-out": {
                    id: "port-1-tb-out",
                    nodeId: "node-1-toolbar",
                    type: "output",
                    edge: "right",
                    position: 0.5,
                    name: "Инструменты"
                },
                "port-1-pp-in": {
                    id: "port-1-pp-in",
                    nodeId: "node-1-propertypanel",
                    type: "input",
                    edge: "left",
                    position: 0.5,
                    name: "Данные элемента"
                },
                "port-1-store-in": {
                    id: "port-1-store-in",
                    nodeId: "node-1-store",
                    type: "input",
                    edge: "left",
                    position: 0.5,
                    name: "Экшены"
                },
                "port-1-store-out": {
                    id: "port-1-store-out",
                    nodeId: "node-1-store",
                    type: "output",
                    edge: "right",
                    position: 0.5,
                    name: "Свежий стейт"
                },
                "port-1-red-in": {
                    id: "port-1-red-in",
                    nodeId: "node-1-reducer",
                    type: "input",
                    edge: "left",
                    position: 0.5,
                    name: "Обработка"
                },
                "port-1-red-out": {
                    id: "port-1-red-out",
                    nodeId: "node-1-reducer",
                    type: "output",
                    edge: "right",
                    position: 0.5,
                    name: "Новый стейт"
                },
                "port-1-ai-in": {
                    id: "port-1-ai-in",
                    nodeId: "node-1-ai-client",
                    type: "input",
                    edge: "left",
                    position: 0.5,
                    name: "Промпт"
                },
                "port-1-ai-out": {
                    id: "port-1-ai-out",
                    nodeId: "node-1-ai-client",
                    type: "output",
                    edge: "right",
                    position: 0.5,
                    name: "Готовый граф"
                },

                // ================= LEVEL 2 PORTS =================
                "port-2-mouse-out": {
                    id: "port-2-mouse-out",
                    nodeId: "node-2-mouse-events",
                    type: "output",
                    edge: "right",
                    position: 0.5,
                    name: "Клик-События"
                },
                "port-2-trans-in": {
                    id: "port-2-trans-in",
                    nodeId: "node-2-coord-trans",
                    type: "input",
                    edge: "left",
                    position: 0.5,
                    name: "Экран мышь"
                },
                "port-2-trans-out": {
                    id: "port-2-trans-out",
                    nodeId: "node-2-coord-trans",
                    type: "output",
                    edge: "right",
                    position: 0.5,
                    name: "Мир холста"
                },
                "port-2-snap-in": {
                    id: "port-2-snap-in",
                    nodeId: "node-2-snap-align",
                    type: "input",
                    edge: "left",
                    position: 0.5,
                    name: "Мир координаты"
                },
                "port-2-snap-out": {
                    id: "port-2-snap-out",
                    nodeId: "node-2-snap-align",
                    type: "output",
                    edge: "right",
                    position: 0.5,
                    name: "Сетка координаты"
                },
                "port-2-path-in": {
                    id: "port-2-path-in",
                    nodeId: "node-2-path-calc",
                    type: "input",
                    edge: "left",
                    position: 0.5,
                    name: "Порты начала/конца"
                },
                "port-2-path-out": {
                    id: "port-2-path-out",
                    nodeId: "node-2-path-calc",
                    type: "output",
                    edge: "right",
                    position: 0.5,
                    name: "Координаты кривой"
                },
                "port-2-bez-in": {
                    id: "port-2-bez-in",
                    nodeId: "node-2-bezier",
                    type: "input",
                    edge: "left",
                    position: 0.5,
                    name: "Контрольные точки"
                },

                // ================= LEVEL 3 PORTS =================
                "port-3-mouse-out": {
                    id: "port-3-mouse-out",
                    nodeId: "node-3-mouse-pos",
                    type: "output",
                    edge: "right",
                    position: 0.5,
                    name: "X/Y пиксели"
                },
                "port-3-inverse-in": {
                    id: "port-3-inverse-in",
                    nodeId: "node-3-inverse-matrix",
                    type: "input",
                    edge: "left",
                    position: 0.5,
                    name: "Экранные точки"
                },
                "port-3-inverse-out": {
                    id: "port-3-inverse-out",
                    nodeId: "node-3-inverse-matrix",
                    type: "output",
                    edge: "right",
                    position: 0.5,
                    name: "Инверсная проекция"
                },
                "port-3-world-in": {
                    id: "port-3-world-in",
                    nodeId: "node-3-world-pos",
                    type: "input",
                    edge: "left",
                    position: 0.5,
                    name: "Вход проекция"
                },
                "port-3-world-out": {
                    id: "port-3-world-out",
                    nodeId: "node-3-world-pos",
                    type: "output",
                    edge: "right",
                    position: 0.5,
                    name: "Мир координаты"
                },
                "port-3-snap-in": {
                    id: "port-3-snap-in",
                    nodeId: "node-3-grid-snap-math",
                    type: "input",
                    edge: "left",
                    position: 0.5,
                    name: "World X/Y"
                },
                "port-3-snap-out": {
                    id: "port-3-snap-out",
                    nodeId: "node-3-grid-snap-math",
                    type: "output",
                    edge: "right",
                    position: 0.5,
                    name: "Кратные 20"
                }
            },
            links: [
                {
                    id: "link-fe-gw",
                    sourcePortId: "port-fe-out",
                    targetPortId: "port-gw-in",
                    name: "HTTPS",
                    linkStyle: "orthogonal", // Ортогональный стиль связи
                    context: "root"
                },
                {
                    id: "link-gw-core",
                    sourcePortId: "port-gw-out",
                    targetPortId: "port-core-in",
                    name: "gRPC",
                    linkStyle: "bezier", // Стиль Безье
                    context: "root"
                },
                {
                    id: "link-core-db",
                    sourcePortId: "port-core-db",
                    targetPortId: "port-db-in",
                    name: "SQL",
                    context: "root"
                },
                {
                    id: "link-core-ai",
                    sourcePortId: "port-core-ai",
                    targetPortId: "port-ai-in",
                    name: "Telemetry",
                    context: "root"
                }
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
        <div className="absolute left-4 top-1/2 -translate-y-1/2 glass-panel rounded-xl shadow-2xl p-2 flex flex-col gap-2 z-40 border-[#444]" data-file="components/Toolbar.js">
            <button 
                className={`btn w-10 h-10 p-0 rounded-md ${state.ui.libraryOpen && state.ui.libraryTab === 'objects' ? 'bg-[var(--accent-blue)] text-white border-[var(--accent-blue)]' : 'text-gray-400 hover:text-white'}`}
                onClick={() => state.ui.libraryOpen && state.ui.libraryTab === 'objects' ? dispatch({ type: 'TOGGLE_UI', payload: 'libraryOpen' }) : dispatch({ type: 'SET_LIBRARY_TAB', payload: 'objects' })}
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
                    title="Выстроить слои вертикально по порядку номеров (зазор 90px)"
                >
                    <div className="icon-grid text-xl"></div>
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

            <button
                className="btn w-10 h-10 p-0 rounded-md text-gray-400 hover:text-white"
                title="Сбросить вид"
                onClick={() => dispatch({ type: 'SET_CANVAS', payload: { offset: {x:0, y:0}, zoom: 1 }})}
            >
                <div className="icon-house text-xl"></div>
            </button>

            <button
                className={`btn w-10 h-10 p-0 rounded-md transition-colors ${state.ui.autoDive !== false ? 'text-[var(--accent-blue)] bg-[var(--accent-blue)]/10' : 'text-gray-400 hover:text-white'}`}
                title={state.ui.autoDive !== false ? 'Авто-погружение при зуме: включено (зум внутрь узла ныряет в него)' : 'Авто-погружение при зуме: выключено'}
                onClick={() => dispatch({ type: 'SET_UI', payload: { autoDive: state.ui.autoDive === false } })}
            >
                <div className="icon-zoom-in text-xl"></div>
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