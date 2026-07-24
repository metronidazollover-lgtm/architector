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
                    name: "1. Пользовательский интерфейс (UI & Viewport)",
                    content: "Интерактивный холст, боковые панели, библиотека и визуальные эффекты",
                    color: "#0284c7",
                    position: { x: -400, y: -250 },
                    size: { w: 620, h: 520 },
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
                    size: { w: 600, h: 520 },
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
                    shape: "rectangle"
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
                    name: "HierarchyUtils ( getAbsolutePosition )",
                    group: "Геометрия",
                    content: "Расчет мировых координат из относительных с защитой от циклов parentId",
                    color: "#1c1917",
                    position: { x: 30, y: 80 },
                    size: { w: 260, h: 120 },
                    parentId: "layer-1-geom",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-geom-placement": {
                    id: "node-geom-placement",
                    name: "Умный Раскладчик (getSmartPlacement)",
                    group: "Геометрия",
                    content: "Авторазмещение нод внутри слоев без перекрытий с ужиманием под контент",
                    color: "#1c1917",
                    position: { x: 320, y: 80 },
                    size: { w: 260, h: 120 },
                    parentId: "layer-1-geom",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-geom-collision": {
                    id: "node-geom-collision",
                    name: "Слайдер Коллизий (resolveCollision)",
                    group: "Геометрия",
                    content: "Скольжение слоев стык-в-стык (10px) и расталкивание свободных нод (30px)",
                    color: "#1c1917",
                    position: { x: 30, y: 280 },
                    size: { w: 260, h: 120 },
                    parentId: "layer-1-geom",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-geom-align": {
                    id: "node-geom-align",
                    name: "Выравниватель Слоев (alignLayers)",
                    group: "Геометрия",
                    content: "Вертикальная автосортировка слоев с естественными зазорами в 90px и 100px",
                    color: "#1c1917",
                    position: { x: 320, y: 280 },
                    size: { w: 260, h: 120 },
                    parentId: "layer-1-geom",
                    snapToGrid: true,
                    shape: "rectangle"
                },

                // Storage Layer Nodes
                "node-storage-engine": {
                    id: "node-storage-engine",
                    name: "LocalStorage Engine",
                    group: "Хранилище",
                    content: "Персистенция стейта под ключом architector_state_v10 с защитой от квоты",
                    color: "#1e1b4b",
                    position: { x: 30, y: 80 },
                    size: { w: 240, h: 120 },
                    parentId: "layer-1-storage",
                    snapToGrid: true,
                    shape: "rectangle"
                },
                "node-storage-migration": {
                    id: "node-storage-migration",
                    name: "Конвертер Версий (migrateToV10)",
                    group: "Хранилище",
                    content: "Автоматическая бесшовная миграция старых файлов v9 в формат v10 на лету",
                    color: "#1e1b4b",
                    position: { x: 300, y: 80 },
                    size: { w: 250, h: 120 },
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
                    position: { x: 300, y: 280 },
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