function Toolbar() {
    const { dispatch, state } = useStore();
    const [menuOpen, setMenuOpen] = React.useState(false);
    // Тач-устройства не знают onMouseEnter — раскрываем дугу по тапу вместо
    // наведения (см. fabRevealHandlers ниже).
    const isTouchDevice = React.useMemo(
        () => (typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)),
        []
    );

    // Закрытие дуги тапом мимо неё (только тач-режим — на мыши для этого
    // хватает onMouseLeave).
    React.useEffect(() => {
        if (!isTouchDevice || !menuOpen) return;
        const handleOutside = (e) => {
            if (!e.target.closest('[data-fab-root]')) setMenuOpen(false);
        };
        window.addEventListener('touchstart', handleOutside);
        return () => window.removeEventListener('touchstart', handleOutside);
    }, [isTouchDevice, menuOpen]);

    // v12: без активного проекта добавлять некуда — все кнопки создания
    // сущностей гасятся, доступна только «Добавить проект»
    const hasProject = !!state.activeProjectId;

    // Контекст создания: единая логика в HierarchyUtils.getAddContext.
    // ok:false означает неоднозначную цель — кнопки добавления гасятся.
    const addCtx = !hasProject
        ? { ok: false, parentId: null, levelIndex: null, reason: 'no-project' }
        : ((window.HierarchyUtils && window.HierarchyUtils.getAddContext)
            ? window.HierarchyUtils.getAddContext(state)
            : { ok: true, parentId: 'root', levelIndex: 0, reason: null });

    const addDisabledHint = addCtx.reason === 'no-project'
        ? 'Сначала создайте проект (кнопка «Добавить проект» в этом меню)'
        : (addCtx.reason === 'multi-select'
            ? 'Выделено несколько элементов — выделите один узел, чтобы добавить ему брата'
            : 'Видно несколько веток — выделите узел нужной ветки, чтобы добавить ему брата');

    const getActiveContext = () => ({ parentId: addCtx.parentId, levelIndex: addCtx.levelIndex });

    const addNode = () => {
        if (!addCtx.ok) return;
        const { parentId, levelIndex } = getActiveContext();
        const H = window.HierarchyUtils;

        const levelNodes = {};
        Object.entries(state.nodes || {}).forEach(([id, n]) => {
            if (H && H.getEntityLevel(id, state.nodes, state.layers) === levelIndex) {
                levelNodes[id] = n;
            }
        });
        const pos = H ? H.getSmartLevelPlacement(parentId, levelNodes) : { x: 50, y: 80 };

        dispatch({
            type: 'ADD_NODE',
            payload: {
                name: 'New Node',
                position: pos,
                size: { w: 200, h: 100 },
                color: '#1a1a1a',
                shape: 'rectangle',
                parentId: parentId,
                // Сирота-якорь: без фокусной ветки узел создаётся главой
                // независимой ветки на кликнутом уровне (homeLevel), а не
                // усыновляется случайным узлом уровня выше
                ...(addCtx.anchorLevel != null ? { homeLevel: addCtx.anchorLevel } : {}),
                // Брат узла со связью через поколение наследует дистанцию
                ...(addCtx.ownerGap ? { ownerGap: addCtx.ownerGap } : {})
            }
        });
    };

    const addLayer = () => {
        if (!addCtx.ok) return;
        const { parentId, levelIndex } = getActiveContext();
        const H = window.HierarchyUtils;

        const levelLayers = {};
        Object.entries(state.layers || {}).forEach(([id, l]) => {
            if (!H || H.getEntityLevel(id, state.nodes, state.layers) === levelIndex) {
                levelLayers[id] = l;
            }
        });
        const existingCount = Object.keys(levelLayers).length;
        const pos = { x: 40 + existingCount * 40, y: 60 + existingCount * 40 };

        dispatch({
            type: 'ADD_LAYER',
            payload: {
                name: `Новый слой ${existingCount + 1}`,
                position: pos,
                size: { w: 600, h: 400 },
                color: '#ff9500',
                parentId: parentId,
                ...(addCtx.anchorLevel != null ? { homeLevel: addCtx.anchorLevel } : {}),
                ...(addCtx.ownerGap ? { ownerGap: addCtx.ownerGap } : {})
            }
        });
    };

    const toggleAddPortMode = () => {
        dispatch({ type: 'SET_MODE', payload: state.interactionMode === 'add-port' ? 'default' : 'add-port' });
    };

    const addAssistant = () => {
        const centerX = (-state.canvas.offset.x + window.innerWidth / 2) / state.canvas.zoom;
        const centerY = (-state.canvas.offset.y + window.innerHeight / 2) / state.canvas.zoom;
        dispatch({
            type: 'ADD_NODE',
            payload: {
                name: '💬 AI Assistant Copilot',
                type: 'ai-agent',
                position: { x: centerX - 190, y: centerY - 240 },
                size: { w: 380, h: 480 },
                color: '#3b0764',
                parentId: 'root'
            }
        });
    };

    const addLevel = () => {
        if (!hasProject) return;
        dispatch({ type: 'ADD_LEVEL_WINDOW' });
    };

    const addProject = () => {
        dispatch({ type: 'ADD_PROJECT' });
    };

    // Радиальное меню «+»: пять спутников (порт/слой/уровень/ассистент/проект)
    // раскрываются полукольцом слева от кнопки (FAB стоит у правого края
    // экрана — дуга открывается в сторону холста влево, от 260° до 100°,
    // 180° = налево). Клик по самой «+» — действие по умолчанию (добавить
    // узел), как и раньше. «Добавить проект» доступна ВСЕГДА — в том числе
    // на пустом холсте, где остальные кнопки погашены.
    const RADIUS = 64;
    const isAssistantSelected = state.selectedIds && state.selectedIds.length > 0
        && state.nodes[state.selectedIds[0]]?.type === 'ai-agent';
    const nextLevelIndex = (() => {
        const wins = Object.values(state.levelWindows || {}).filter(Boolean);
        return wins.length ? Math.max(...wins.map(w => w.levelIndex || 0)) + 1 : 0;
    })();
    const gateClass = (okClass) => hasProject ? okClass : 'opacity-40 cursor-not-allowed text-gray-500';
    const satellites = [
        {
            key: 'port', angleDeg: 260, icon: 'icon-circle',
            title: hasProject ? 'Добавить порт (Кликните по краю узла)' : addDisabledHint,
            active: state.interactionMode === 'add-port', disabled: !hasProject,
            onClick: toggleAddPortMode,
            colorClass: gateClass(state.interactionMode === 'add-port' ? 'btn-primary' : 'text-gray-300 hover:text-white')
        },
        {
            key: 'layer', angleDeg: 220, icon: 'icon-layers',
            title: addCtx.ok ? 'Добавить слой' : addDisabledHint,
            active: false, disabled: !addCtx.ok,
            onClick: addLayer,
            colorClass: addCtx.ok ? 'text-orange-400 hover:text-orange-300 hover:bg-white/5' : 'opacity-40 cursor-not-allowed text-gray-500'
        },
        {
            key: 'level', angleDeg: 180, icon: 'icon-folder-plus',
            title: hasProject ? `Добавить уровень (новый пустой Уровень ${nextLevelIndex})` : addDisabledHint,
            active: false, disabled: !hasProject,
            onClick: addLevel,
            colorClass: gateClass('text-sky-400 hover:text-sky-300 hover:bg-white/5')
        },
        {
            key: 'assistant', angleDeg: 140, icon: 'icon-bot',
            title: hasProject ? 'Добавить ассистента' : addDisabledHint,
            active: isAssistantSelected, disabled: !hasProject,
            onClick: addAssistant,
            colorClass: gateClass('text-purple-400 hover:text-purple-300')
        },
        {
            key: 'project', angleDeg: 100, icon: 'icon-globe',
            title: 'Добавить проект (новый независимый проект на этом же холсте)',
            active: false, disabled: false,
            onClick: addProject,
            colorClass: 'text-emerald-400 hover:text-emerald-300 hover:bg-white/5'
        }
    ];

    const fabRevealHandlers = isTouchDevice
        ? {
            onClick: (e) => {
                if (!menuOpen) {
                    // Первый тап — только раскрыть дугу, без создания узла.
                    e.preventDefault();
                    setMenuOpen(true);
                    return;
                }
                setMenuOpen(false);
                addNode();
            }
        }
        : {
            onMouseEnter: () => setMenuOpen(true),
            onMouseLeave: () => setMenuOpen(false),
            onClick: addNode
        };

    return (
        <div
            className="fixed top-1/2 -translate-y-1/2 right-4 z-40 flex flex-col items-center gap-2"
            data-file="components/Toolbar.js"
        >
            <div
                data-fab-root
                className="relative"
                onMouseEnter={!isTouchDevice ? () => setMenuOpen(true) : undefined}
                onMouseLeave={!isTouchDevice ? () => setMenuOpen(false) : undefined}
            >
                {satellites.map((sat) => {
                    const rad = (sat.angleDeg * Math.PI) / 180;
                    const dx = Math.round(Math.cos(rad) * RADIUS);
                    const dy = Math.round(Math.sin(rad) * RADIUS);
                    return (
                        <button
                            key={sat.key}
                            className={`btn absolute top-0 left-0 w-10 h-10 p-0 rounded-full glass-panel shadow-xl flex items-center justify-center transition-all duration-200 ${sat.colorClass} ${
                                sat.active ? 'ring-2 ring-white/40' : ''
                            }`}
                            style={{
                                transform: menuOpen ? `translate(${dx}px, ${dy}px)` : 'translate(0px, 0px)',
                                opacity: menuOpen ? 1 : 0,
                                pointerEvents: menuOpen ? 'auto' : 'none'
                            }}
                            disabled={sat.disabled}
                            title={sat.title}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (sat.disabled) return;
                                sat.onClick();
                                if (isTouchDevice) setMenuOpen(false);
                            }}
                        >
                            <div className={`${sat.icon} text-lg`}></div>
                        </button>
                    );
                })}

                <button
                    className={`btn relative w-12 h-12 p-0 rounded-full shadow-2xl flex items-center justify-center transition-colors z-10 ${
                        addCtx.ok ? 'btn-primary' : 'opacity-40 cursor-not-allowed text-gray-500'
                    }`}
                    title={addCtx.ok ? 'Быстрый пустой узел (наведите — ещё действия)' : addDisabledHint}
                    {...fabRevealHandlers}
                >
                    <div className="icon-square-plus text-2xl"></div>
                </button>
            </div>
        </div>
    );
}
