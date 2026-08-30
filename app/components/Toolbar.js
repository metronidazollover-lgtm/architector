function Toolbar() {
    const { dispatch, state } = useStore();
    const [menuOpen, setMenuOpen] = React.useState(false);
    const closeTimeoutRef = React.useRef(null);
    const longPressTimerRef = React.useRef(null);
    const isLongPressRef = React.useRef(false);
    const touchStartPosRef = React.useRef({ x: 0, y: 0 });

    const openMenu = React.useCallback(() => {
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
        setMenuOpen(true);
    }, []);

    const closeMenuWithDelay = React.useCallback((delay = 140) => {
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
        }
        closeTimeoutRef.current = setTimeout(() => {
            setMenuOpen(false);
            closeTimeoutRef.current = null;
        }, delay);
    }, []);

    const closeMenuImmediately = React.useCallback(() => {
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
        setMenuOpen(false);
    }, []);

    // Очистка таймеров при демонтировании
    React.useEffect(() => {
        return () => {
            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
            if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        };
    }, []);

    // Закрытие веера кликом/тапом мимо него
    React.useEffect(() => {
        if (!menuOpen) return;
        const handleOutside = (e) => {
            if (!e.target.closest('[data-fab-root]')) {
                closeMenuImmediately();
            }
        };
        window.addEventListener('pointerdown', handleOutside);
        return () => window.removeEventListener('pointerdown', handleOutside);
    }, [menuOpen, closeMenuImmediately]);

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

    // PLAN_LAYERS_AND_CONTEXT_CREATION.md, раздел 5: FAB и веер спутников
    // явно переключаются между 3 контекстами выделения (⚠️ п.0.3 — фикс
    // «галлюцинации» слоя целиком здесь, getAddContext не тронут). Ровно один
    // элемент может быть выделен для контекста «узел»/«слой» — при пустом
    // выделении или множественном выборе действует контекст «ничего».
    const singleSelId = (state.selectedIds && state.selectedIds.length === 1) ? state.selectedIds[0] : null;
    const selectedNode = hasProject && singleSelId ? (state.nodes && state.nodes[singleSelId]) || null : null;
    const selectedLayer = hasProject && singleSelId ? (state.layers && state.layers[singleSelId]) || null : null;
    const fabContext = selectedNode ? 'node' : (selectedLayer ? 'layer' : 'none');

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

    // --- Контекст «выделен узел»: рождение потомка на подуровне L{lvl+1}. ---
    // Клик по самой «+» переиспользует уже существующий, протестированный
    // CREATE_NESTED_NODE (раньше он же жил за кнопкой «+» в шапке Node.js,
    // теперь единственный вход — сюда; ⚠️ п.0.7).
    const H = window.HierarchyUtils;
    const nodeChildLevel = selectedNode && H ? H.getEntityLevel(selectedNode.id, state.nodes, state.layers) + 1 : null;

    const addChildNode = () => {
        if (!selectedNode) return;
        dispatch({ type: 'CREATE_NESTED_NODE', payload: { parentId: selectedNode.id } });
    };

    // Слой/ассистент-потомок подуровня — окна для этого уровня может ещё не
    // быть (раньше оно появлялось только побочным эффектом CREATE_NESTED_NODE),
    // поэтому досоздаём его тем же ADD_LEVEL_WINDOW, что и кнопка «уровень».
    const ensureLevelWindow = (levelIndex) => {
        if (!H) return;
        const win = H.getWindowOfLevel(levelIndex, state.levelWindows);
        if (!win) dispatch({ type: 'ADD_LEVEL_WINDOW' });
    };

    const addChildLayer = () => {
        if (!selectedNode || nodeChildLevel == null) return;
        ensureLevelWindow(nodeChildLevel);
        const levelLayers = {};
        Object.entries(state.layers || {}).forEach(([id, l]) => {
            if (H && H.getEntityLevel(id, state.nodes, state.layers) === nodeChildLevel) levelLayers[id] = l;
        });
        const pos = H ? H.getSmartLevelPlacement(selectedNode.id, levelLayers) : { x: 80, y: 100 };
        dispatch({
            type: 'ADD_LAYER',
            payload: {
                name: `Новый слой (потомок «${selectedNode.name}»)`,
                position: pos,
                size: { w: 600, h: 400 },
                color: '#ff9500',
                parentId: selectedNode.id // normalizeContainer превратит это в ownerId
            }
        });
    };

    const addChildAssistant = () => {
        if (!selectedNode || nodeChildLevel == null) return;
        ensureLevelWindow(nodeChildLevel);
        const levelNodes = {};
        Object.entries(state.nodes || {}).forEach(([id, n]) => {
            if (H && H.getEntityLevel(id, state.nodes, state.layers) === nodeChildLevel) levelNodes[id] = n;
        });
        const pos = H ? H.getSmartLevelPlacement(selectedNode.id, levelNodes) : { x: 80, y: 100 };
        dispatch({
            type: 'ADD_NODE',
            payload: {
                name: '💬 AI Assistant Copilot',
                type: 'ai-agent',
                position: pos,
                size: { w: 380, h: 480 },
                color: '#3b0764',
                parentId: selectedNode.id // normalizeContainer превратит это в ownerId
            }
        });
    };

    // --- Контекст «выделен слой»: ассистент/подслой ВНУТРИ слоя (parentId,
    // группировка того же уровня — не смена владения). Узел внутрь слоя уже
    // создаёт addNode() через addCtx (getAddContext уже отдаёт parentId
    // слоя), «слой внутрь слоя» — уже addLayer() тем же путём; здесь только
    // недостающий кейс — ассистент. ---
    const addAssistantInLayer = () => {
        if (!selectedLayer) return;
        dispatch({
            type: 'ADD_NODE',
            payload: {
                name: '💬 AI Assistant Copilot',
                type: 'ai-agent',
                position: { x: 40, y: 80 },
                size: { w: 380, h: 480 },
                color: '#3b0764',
                parentId: selectedLayer.id
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
    // Приглушение спутника, нерелевантного текущему контексту выделения
    // (PLAN_LAYERS_AND_CONTEXT_CREATION.md, разд.5): порт/уровень/проект гасятся,
    // когда выделен узел или слой — независимо от hasProject.
    const DIM_CONTEXT = 'opacity-30 cursor-not-allowed text-gray-500';
    const irrelevantInContext = fabContext !== 'none';

    // «layer»-слот: три разных действия по контексту — независимый слой
    // (root), дочерний слой на подуровне узла, слой внутрь выделенного слоя.
    // Одна и та же позиция веера, разный смысл — намеренно раздельные функции,
    // а не одна веточка if внутри addLayer() (⚠️ п.0.3, фикс «галлюцинации»).
    const layerSat = fabContext === 'node'
        ? { title: `Добавить дочерний слой на подуровень (Уровень ${nodeChildLevel})`, onClick: addChildLayer, ok: true }
        : fabContext === 'layer'
            ? { title: `Добавить слой внутрь слоя «${selectedLayer.name}»`, onClick: addLayer, ok: true }
            : { title: addCtx.ok ? 'Добавить независимый слой' : addDisabledHint, onClick: addLayer, ok: addCtx.ok };

    const assistantSat = fabContext === 'node'
        ? { title: `Добавить дочернего ассистента на подуровень (Уровень ${nodeChildLevel})`, onClick: addChildAssistant, ok: true }
        : fabContext === 'layer'
            ? { title: `Добавить ассистента внутрь слоя «${selectedLayer.name}»`, onClick: addAssistantInLayer, ok: true }
            : { title: hasProject ? 'Добавить ассистента' : addDisabledHint, onClick: addAssistant, ok: hasProject };

    const satellites = [
        {
            key: 'port', angleDeg: 260, icon: 'icon-circle',
            title: irrelevantInContext ? 'Недоступно при этом выделении' : (hasProject ? 'Добавить порт (Кликните по краю узла)' : addDisabledHint),
            active: state.interactionMode === 'add-port', disabled: !hasProject || irrelevantInContext,
            onClick: toggleAddPortMode,
            colorClass: irrelevantInContext ? DIM_CONTEXT : gateClass(state.interactionMode === 'add-port' ? 'btn-primary' : 'text-gray-300 hover:text-white')
        },
        {
            key: 'layer', angleDeg: 220, icon: 'icon-layers',
            title: layerSat.ok ? layerSat.title : addDisabledHint,
            active: false, disabled: !layerSat.ok,
            onClick: layerSat.onClick,
            colorClass: layerSat.ok ? 'text-orange-400 hover:text-orange-300 hover:bg-white/5' : 'opacity-40 cursor-not-allowed text-gray-500'
        },
        {
            key: 'level', angleDeg: 180, icon: 'icon-folder-plus',
            title: irrelevantInContext ? 'Недоступно при этом выделении' : (hasProject ? `Добавить уровень (новый пустой Уровень ${nextLevelIndex})` : addDisabledHint),
            active: false, disabled: !hasProject || irrelevantInContext,
            onClick: addLevel,
            colorClass: irrelevantInContext ? DIM_CONTEXT : gateClass('text-sky-400 hover:text-sky-300 hover:bg-white/5')
        },
        {
            key: 'assistant', angleDeg: 140, icon: 'icon-bot',
            title: assistantSat.ok ? assistantSat.title : addDisabledHint,
            active: isAssistantSelected, disabled: !assistantSat.ok,
            onClick: assistantSat.onClick,
            colorClass: assistantSat.ok ? 'text-purple-400 hover:text-purple-300' : 'opacity-40 cursor-not-allowed text-gray-500'
        },
        {
            key: 'project', angleDeg: 100, icon: 'icon-globe',
            title: irrelevantInContext ? 'Недоступно при этом выделении' : 'Добавить проект (новый независимый проект на этом же холсте)',
            active: false, disabled: irrelevantInContext,
            onClick: addProject,
            colorClass: irrelevantInContext ? DIM_CONTEXT : 'text-emerald-400 hover:text-emerald-300 hover:bg-white/5'
        }
    ];

    const handleTouchStart = (e) => {
        if (!e.touches || e.touches.length === 0) return;
        touchStartPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        isLongPressRef.current = false;
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = setTimeout(() => {
            isLongPressRef.current = true;
            openMenu();
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(25);
            }
        }, 350);
    };

    const handleTouchMove = (e) => {
        if (!e.touches || e.touches.length === 0) return;
        const dx = Math.abs(e.touches[0].clientX - touchStartPosRef.current.x);
        const dy = Math.abs(e.touches[0].clientY - touchStartPosRef.current.y);
        if (dx > 10 || dy > 10) {
            if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
            }
        }
    };

    const handleTouchEnd = (e) => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        if (isLongPressRef.current) {
            // Если сработало долгое нажатие для раскрытия веера, предотвращаем клик
            if (e.cancelable) e.preventDefault();
        }
    };

    // Действие по умолчанию главной «+»: зависит от контекста (⚠️ разд.5) —
    // узел выделен → его потомок на подуровне (раньше это была кнопка «+» в
    // шапке Node.js, ⚠️ п.0.7); слой выделен → узел внутрь него (addNode()
    // уже это делает через addCtx); иначе — обычный узел на текущем холсте.
    const fabOk = fabContext === 'node' ? true : (fabContext === 'layer' ? true : addCtx.ok);
    const fabDefaultAction = fabContext === 'node' ? addChildNode : addNode;
    const fabTitle = fabContext === 'node'
        ? `Добавить дочерний узел на Уровень ${nodeChildLevel} для «${selectedNode.name}»`
        : fabContext === 'layer'
            ? `Добавить узел внутрь слоя «${selectedLayer.name}»`
            : (addCtx.ok ? 'Быстрый пустой узел (наведите — ещё действия)' : addDisabledHint);

    const handleFabClick = () => {
        if (isLongPressRef.current) {
            isLongPressRef.current = false;
            return;
        }
        if (!fabOk) return;
        fabDefaultAction();
        closeMenuImmediately();
    };

    return (
        <div
            className="fixed top-1/2 -translate-y-1/2 right-4 z-40 flex flex-col items-center gap-2"
            data-file="components/Toolbar.js"
        >
            <div
                data-fab-root
                className="relative"
                onMouseEnter={openMenu}
                onMouseLeave={() => closeMenuWithDelay(140)}
            >
                {/* Невидимый хитбокс, соединяющий кнопку «+» и полукруг веера спутников без потери ховера */}
                <div
                    className="absolute pointer-events-none"
                    style={{
                        top: -75,
                        left: -85,
                        width: 145,
                        height: 200,
                        borderRadius: '100px 24px 24px 100px',
                        pointerEvents: menuOpen ? 'auto' : 'none'
                    }}
                />

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
                                closeMenuImmediately();
                            }}
                        >
                            <div className={`${sat.icon} text-lg`}></div>
                        </button>
                    );
                })}

                <button
                    className={`btn relative w-12 h-12 p-0 rounded-full shadow-2xl flex items-center justify-center transition-colors z-10 ${
                        fabOk ? 'btn-primary' : 'opacity-40 cursor-not-allowed text-gray-500'
                    }`}
                    title={fabTitle}
                    onClick={handleFabClick}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                >
                    <div className="icon-square-plus text-2xl"></div>
                    {/* Бейдж контекста (разд.5): «+» меняет смысл при выделении узла/слоя */}
                    {fabContext === 'node' && (
                        <span className="absolute -bottom-1 -right-1 text-[9px] leading-none font-bold bg-slate-900 text-white rounded-full w-4 h-4 flex items-center justify-center border border-white/30">
                            L{nodeChildLevel}
                        </span>
                    )}
                    {fabContext === 'layer' && (
                        <div className="icon-layers absolute -bottom-1 -right-1 text-xs bg-slate-900 text-orange-400 rounded-full w-4 h-4 flex items-center justify-center border border-white/30"></div>
                    )}
                </button>
            </div>
        </div>
    );
}
