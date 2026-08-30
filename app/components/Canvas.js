// Магистральные отрезки межуровневых связей — те, что идут между рамками окон
// через мировое пространство (внутренние отрезки рисует сам LevelWindow).
//
// Компонент параметризован состоянием ПРОЕКТА, а не берёт активный: иначе у
// неактивных проектов на рамках висели бы прокси-порты без соединяющего их
// пунктира, и связь выглядела бы оборванной. Изоляция «глазом» считается по
// состоянию своего проекта — иначе «глаз» активного гасил бы чужие связи.
function CrossLevelLinkLayer({ projectState, dispatch, interactive = true, opacity = 1 }) {
    if (typeof StoreEngine !== 'undefined') StoreEngine.profileRender('CrossLevelLinkLayer');
    const state = projectState;
    if (!state || !state.links) return null;

    // Перебираются ТОЛЬКО межуровневые связи, взятые из кэшированного индекса.
    // Прежде слой проходил по всем связям проекта на каждый рендер и для каждой
    // вычислял уровни обоих концов — на сцене в 3000 связей это был самый
    // дорогой участок кадра (около 60% процессорного времени по профилю).
    const HU = window.HierarchyUtils;

    // Видимая часть мира: магистраль, чьи оба окна целиком за экраном, рисовать
    // незачем. Проверка идёт по объединяющему прямоугольнику ДВУХ окон, а не по
    // точкам концов: связь между окном выше экрана и окном ниже экрана проходит
    // через видимую область, и отбросить её было бы ошибкой.
    const cam = state.canvas || { offset: { x: 0, y: 0 }, zoom: 1 };
    const camZoom = cam.zoom || 1;
    const screenW = (typeof window !== 'undefined' && window.innerWidth) || 1600;
    const screenH = (typeof window !== 'undefined' && window.innerHeight) || 900;
    const padX = screenW / camZoom;
    const padY = screenH / camZoom;
    const viewRect = {
        x0: (0 - cam.offset.x) / camZoom - padX,
        y0: (0 - cam.offset.y) / camZoom - padY,
        x1: (screenW - cam.offset.x) / camZoom + padX,
        y1: (screenH - cam.offset.y) / camZoom + padY
    };
    const winRectOfLevel = (lvl) => {
        const w = HU ? HU.getWindowOfLevel(Number(lvl), state.levelWindows) : null;
        if (!w) return null;
        const pos = w.position || { x: 0, y: 0 };
        const size = w.size || { w: 1000, h: 700 };
        return { x0: pos.x, y0: pos.y, x1: pos.x + size.w, y1: pos.y + size.h };
    };
    const rectCache = {};
    const rectOf = (lvl) => {
        if (!(lvl in rectCache)) rectCache[lvl] = winRectOfLevel(lvl);
        return rectCache[lvl];
    };

    const crossLinks = [];
    if (HU && HU.getCrossLinksByLevel) {
        const byLevel = HU.getCrossLinksByLevel(state);
        Object.keys(byLevel).forEach(lvl => {
            byLevel[lvl].forEach(entry => {
                // Каждая межуровневая связь лежит в индексе дважды (со стороны
                // источника и со стороны приёмника) — берём её один раз
                if (!entry || !entry.isSource) return;
                const a = rectOf(lvl);
                const b = rectOf(entry.otherLevel);
                if (a && b) {
                    const box = {
                        x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
                        x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1)
                    };
                    if (box.x1 < viewRect.x0 || box.x0 > viewRect.x1 ||
                        box.y1 < viewRect.y0 || box.y0 > viewRect.y1) return; // за экраном
                }
                crossLinks.push(entry.link);
            });
        });
    } else {
        Object.values(state.links || {}).forEach(l => { if (l) crossLinks.push(l); });
    }

    return (
        <svg className="absolute top-0 left-0 pointer-events-none" style={{ width: '1px', height: '1px', overflow: 'visible', zIndex: 35, opacity }}>
                    {crossLinks.map((link) => {
                        if (!link || !link.id) return null;
                        const sPort = state.ports && state.ports[link.sourcePortId];
                        const tPort = state.ports && state.ports[link.targetPortId];
                        if (!sPort || !tPort) return null;

                        const sNode = (state.nodes && state.nodes[sPort.nodeId]) || (state.layers && state.layers[sPort.nodeId]);
                        const tNode = (state.nodes && state.nodes[tPort.nodeId]) || (state.layers && state.layers[tPort.nodeId]);
                        if (!sNode || !tNode) return null;

                        const H = window.HierarchyUtils;

                        // Конец связи скрыт изоляцией («глаз») — пунктир не рисуем,
                        // иначе он повиснет над пустым местом
                        if (H && H.isEntityVisible &&
                            (!H.isEntityVisible(sNode.id, state) || !H.isEntityVisible(tNode.id, state))) {
                            return null;
                        }
                        const sLvl = H ? H.getEntityLevel(sNode.id, state.nodes, state.layers) : 0;
                        const tLvl = H ? H.getEntityLevel(tNode.id, state.nodes, state.layers) : 0;

                        // Рендерим в глобальном слое только межуровневые связи
                        if (sLvl === tLvl) return null;

                        const sWin = H ? H.getWindowOfLevel(sLvl, state.levelWindows) : null;
                        const tWin = H ? H.getWindowOfLevel(tLvl, state.levelWindows) : null;
                        const sView = (H && sWin) ? H.getLevelView(sWin.id, state) : { isCollapsed: false };
                        const tView = (H && tWin) ? H.getLevelView(tWin.id, state) : { isCollapsed: false };

                        let p1 = null;
                        let p2 = null;

                        // Магистральный отрезок связи идёт ОТ РАМКИ ДО РАМКИ через
                        // прокси-порты, а не от порта к порту. Иначе пунктир ляжет
                        // поверх чужого содержимого: глобальный слой лежит выше окон.
                        const edgeToDir = { top: 'top', bottom: 'bottom', left: 'left', right: 'right' };

                        if (sWin && sView.isCollapsed) {
                            p1 = H ? H.getMasterPortWorldCoordinates(sWin.id, state) : null;
                            if (p1) p1.edge = 'top';
                        } else {
                            const pr = (H && sWin) ? H.getProxyForLink(link.id, sWin.id, state) : null;
                            if (pr) {
                                p1 = { x: pr.worldPos.x, y: pr.worldPos.y, edge: edgeToDir[pr.edge] || 'bottom' };
                            } else {
                                p1 = H ? H.getPortWorldPosition(link.sourcePortId, state) : null;
                                if (p1) p1.edge = sPort.edge || 'right';
                            }
                        }

                        if (tWin && tView.isCollapsed) {
                            p2 = H ? H.getMasterPortWorldCoordinates(tWin.id, state) : null;
                            if (p2) p2.edge = 'top';
                        } else {
                            const pr = (H && tWin) ? H.getProxyForLink(link.id, tWin.id, state) : null;
                            if (pr) {
                                p2 = { x: pr.worldPos.x, y: pr.worldPos.y, edge: edgeToDir[pr.edge] || 'top' };
                            } else {
                                p2 = H ? H.getPortWorldPosition(link.targetPortId, state) : null;
                                if (p2) p2.edge = tPort.edge || 'left';
                            }
                        }

                        if (!p1 || !p2) return null;

                        // Тот же построитель пути, что и у внутриуровневых связей:
                        // иначе переключение стиля работало бы только внутри окна.
                        // Порядковый номер — из кэшированного индекса. Поиск через
                        // Object.keys(links).indexOf() выполнялся для КАЖДОЙ магистрали
                        // на каждом кадре и давал O(связи²): на 3000 связей это больше
                        // миллиона операций в кадр.
                        const linkIndex = (HU && HU.getLinkOrderIndex)
                            ? (HU.getLinkOrderIndex(state.links)[link.id] ?? -1)
                            : Object.keys(state.links || {}).indexOf(link.id);
                        const pathD = window.GeometryUtils.buildLinkPath(p1, p2, link.linkStyle, linkIndex);

                        const isSelected = state.selectedIds && (
                            state.selectedIds.includes(link.id)
                            || state.selectedIds.includes(link.sourcePortId)
                            || state.selectedIds.includes(link.targetPortId)
                            || state.selectedIds.includes(sNode.id)
                            || state.selectedIds.includes(tNode.id)
                        );
                        const linkColor = link.color || '#38bdf8';

                        return (
                            <g key={`cross-link-${link.id}`}>
                                <path
                                    d={pathD}
                                    fill="none"
                                    stroke="transparent"
                                    strokeWidth="16"
                                    className="pointer-events-auto cursor-pointer"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (!interactive) return;
                                        dispatch({ type: 'SET_SELECTED', payload: link.id });
                                    }}
                                    onDoubleClick={(e) => {
                                        e.stopPropagation();
                                        if (!interactive) return;
                                        dispatch({ type: 'FOCUS_CONNECTED_ELEMENTS', payload: { entityId: link.id } });
                                    }}
                                />
                                <path
                                    d={pathD}
                                    fill="none"
                                    stroke={linkColor}
                                    strokeWidth={isSelected ? "4.5" : "2.5"}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeDasharray="3, 5"
                                    vectorEffect="non-scaling-stroke"
                                    className="transition-all duration-150 pointer-events-none"
                                    style={{
                                        filter: isSelected ? `drop-shadow(0 0 10px ${linkColor})` : `drop-shadow(0 0 4px ${linkColor}66)`
                                    }}
                                />
                            </g>
                        );
                    })}
        </svg>
    );
}

function Canvas() {
    if (typeof StoreEngine !== 'undefined') StoreEngine.profileRender('Canvas');
    const { state, dispatch } = useStore();
    const HU = window.HierarchyUtils;
    const { offset, zoom } = state.canvas;
    const canvasRef = React.useRef(null);
    const [isPanning, setIsPanning] = React.useState(false);
    const [isInteracting, setIsInteracting] = React.useState(false);
    const wheelTimeoutRef = React.useRef(null);

    // Используем Ref для актуального стейта камеры, чтобы не переподключать слушатель wheel каждый кадр
    const cameraRef = React.useRef({ zoom, offset });
    cameraRef.current = { zoom, offset };

    React.useEffect(() => {
        const handleKeyDown = (e) => {
            // Игнорируем нажатия, если активен инпут или текстовое поле
            const activeTag = document.activeElement?.tagName?.toLowerCase();
            if (activeTag === 'input' || activeTag === 'textarea') return;

            const { selectedIds, nodes, clipboard, past, future } = state;

            // Удаление (Delete / Backspace)
            if (e.code === 'Delete' || e.code === 'Backspace') {
                if (selectedIds.length > 0) {
                    dispatch({ type: 'DELETE_SELECTED' });
                }
            }

            // Esc: сначала выход из режима, потом сброс выделения
            if (e.code === 'Escape') {
                if (state.interactionMode !== 'default') {
                    dispatch({ type: 'SET_MODE', payload: 'default' });
                } else if (selectedIds.length > 0) {
                    dispatch({ type: 'SET_SELECTED', payload: null });
                }
            }

            // Копирование узла (Ctrl+C / Cmd+C)
            if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyC' || e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'с')) {
                e.preventDefault();
                const primaryId = selectedIds[0];
                if (primaryId && nodes[primaryId]) {
                    dispatch({ type: 'SET_CLIPBOARD', payload: nodes[primaryId] });
                }
            }

            // Вставка узла (Ctrl+V / Cmd+V)
            if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyV' || e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 'м')) {
                e.preventDefault();
                if (clipboard) {
                    const newId = 'node-' + Date.now() + Math.floor(Math.random() * 1000);
                    dispatch({
                        type: 'ADD_NODE',
                        payload: {
                            ...clipboard,
                            id: newId,
                            name: `${clipboard.name} (Копия)`,
                            position: { x: clipboard.position.x + 30, y: clipboard.position.y + 30 }
                        }
                    });
                }
            }

            // Отмена действия (Ctrl+Z)
            if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyZ' || e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'я') && !e.shiftKey) {
                e.preventDefault();
                if (past.length > 0) dispatch({ type: 'UNDO' });
            }

            // Повтор действия (Ctrl+Y или Ctrl+Shift+Z)
            if ((e.ctrlKey || e.metaKey) && (
                e.code === 'KeyY' || e.key.toLowerCase() === 'y' || e.key.toLowerCase() === 'н' || 
                ((e.code === 'KeyZ' || e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'я') && e.shiftKey)
            )) {
                e.preventDefault();
                if (future.length > 0) dispatch({ type: 'REDO' });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [state, dispatch]);

    React.useEffect(() => {
        const handleWheel = (e) => {
            // Ctrl/Cmd + колесо = зум ОБЩЕГО холста, где бы ни был курсор
            // (в т.ч. над окном уровня — LevelWindow пропускает такое событие
            // всплыть сюда). Без модификатора: над окном уровня зум обрабатывает
            // само окно, поэтому здесь выходим.
            const forceWorldZoom = e.ctrlKey || e.metaKey;

            if (!forceWorldZoom) {
                if (e.target.closest('.level-window')) {
                    return;
                }

                const scrollable = e.target.closest('.overflow-y-auto');
                if (scrollable && scrollable.scrollHeight > scrollable.clientHeight) {
                    const isScrollingUp = e.deltaY < 0;
                    const isScrollingDown = e.deltaY > 0;
                    const atTop = scrollable.scrollTop <= 0;
                    const atBottom = Math.abs(scrollable.scrollTop + scrollable.clientHeight - scrollable.scrollHeight) <= 2;

                    if ((isScrollingUp && !atTop) || (isScrollingDown && !atBottom)) {
                        return;
                    }
                }
            }

            // preventDefault обязателен: иначе Ctrl+колесо зумит саму страницу браузера
            e.preventDefault();
            
            setIsInteracting(true);
            if (wheelTimeoutRef.current) {
                clearTimeout(wheelTimeoutRef.current);
            }
            wheelTimeoutRef.current = setTimeout(() => {
                setIsInteracting(false);
            }, 150);

            const currentZoom = cameraRef.current.zoom;
            const currentOffset = cameraRef.current.offset;
            
            const zoomSensitivity = 0.001;
            const delta = -e.deltaY * zoomSensitivity;
            let newZoom = Math.min(Math.max(0.1, currentZoom + delta), 5.0);
            
            if(canvasRef.current) {
                const rect = canvasRef.current.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                
                const zoomRatio = newZoom / currentZoom;
                const newOffsetX = mouseX - (mouseX - currentOffset.x) * zoomRatio;
                const newOffsetY = mouseY - (mouseY - currentOffset.y) * zoomRatio;
                
                cameraRef.current = { zoom: newZoom, offset: { x: newOffsetX, y: newOffsetY } };

                dispatch({ type: 'SET_CANVAS', payload: { zoom: newZoom, offset: { x: newOffsetX, y: newOffsetY } } });
            }
        };

        const canvasEl = canvasRef.current;
        if(canvasEl) {
            canvasEl.addEventListener('wheel', handleWheel, { passive: false });
        }
        return () => {
            if(canvasEl) canvasEl.removeEventListener('wheel', handleWheel);
            if(wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
        };
    }, [dispatch]);

    const handleTouchStart = (e) => {
        if (e.target.closest('.level-window')) {
            return;
        }
        if (e.target.id === 'canvas-container' || e.target.classList.contains('canvas-grid')) {
            if (e.touches.length === 1) {
                dispatch({ type: 'SET_SELECTED', payload: null });
                if (state.ui.libraryOpen) {
                    dispatch({ type: 'SET_UI', payload: { libraryOpen: false } });
                }
                if (state.interactionMode === 'add-port') {
                    dispatch({ type: 'SET_MODE', payload: 'default' });
                }
                
                setIsPanning(true);
                const touch = e.touches[0];
                const startX = touch.clientX - cameraRef.current.offset.x;
                const startY = touch.clientY - cameraRef.current.offset.y;

                const handleTouchMove = (moveEvent) => {
                    if (moveEvent.touches.length === 1) {
                        moveEvent.preventDefault();
                        const t = moveEvent.touches[0];
                        const newOffset = { x: t.clientX - startX, y: t.clientY - startY };
                        cameraRef.current.offset = newOffset;
                        dispatch({
                            type: 'SET_CANVAS',
                            payload: { offset: newOffset, zoom: cameraRef.current.zoom }
                        });
                    }
                };

                const handleTouchEnd = () => {
                    setIsPanning(false);
                    window.removeEventListener('touchmove', handleTouchMove);
                    window.removeEventListener('touchend', handleTouchEnd);
                    window.removeEventListener('touchcancel', handleTouchEnd);
                };

                window.addEventListener('touchmove', handleTouchMove, { passive: false });
                window.addEventListener('touchend', handleTouchEnd);
                window.addEventListener('touchcancel', handleTouchEnd);
                
            } else if (e.touches.length === 2) {
                setIsInteracting(true);
                const getDist = (touches) => Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY);
                const getCenter = (touches) => ({
                    x: (touches[1].clientX + touches[0].clientX) / 2,
                    y: (touches[1].clientY + touches[0].clientY) / 2
                });

                const startDist = getDist(e.touches);
                const startZoom = cameraRef.current.zoom;
                const startOffset = cameraRef.current.offset;
                const startCenter = getCenter(e.touches);

                const handleTouchMove = (moveEvent) => {
                    if (moveEvent.touches.length === 2) {
                        moveEvent.preventDefault();
                        const currentDist = getDist(moveEvent.touches);
                        const currentCenter = getCenter(moveEvent.touches);
                        
                        const zoomRatio = currentDist / startDist;
                        let newZoom = Math.min(Math.max(0.1, startZoom * zoomRatio), 5.0);
                        
                        const currentZoomRatio = newZoom / startZoom;
                        const newOffsetX = currentCenter.x - (startCenter.x - startOffset.x) * currentZoomRatio;
                        const newOffsetY = currentCenter.y - (startCenter.y - startOffset.y) * currentZoomRatio;
                        
                        const newOffset = { x: newOffsetX, y: newOffsetY };
                        cameraRef.current = { zoom: newZoom, offset: newOffset };

                        dispatch({
                            type: 'SET_CANVAS',
                            payload: { zoom: newZoom, offset: newOffset }
                        });
                    }
                };

                const handleTouchEnd = () => {
                    setIsInteracting(false);
                    window.removeEventListener('touchmove', handleTouchMove);
                    window.removeEventListener('touchend', handleTouchEnd);
                    window.removeEventListener('touchcancel', handleTouchEnd);
                };

                window.addEventListener('touchmove', handleTouchMove, { passive: false });
                window.addEventListener('touchend', handleTouchEnd);
                window.addEventListener('touchcancel', handleTouchEnd);
            }
        }
    };

    const handleMouseDown = (e) => {
        if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
            setIsPanning(true);
            const startX = e.clientX - offset.x;
            const startY = e.clientY - offset.y;

            const handleMouseMove = (moveEvent) => {
                const newOffset = { x: moveEvent.clientX - startX, y: moveEvent.clientY - startY };
                cameraRef.current.offset = newOffset;
                dispatch({
                    type: 'SET_CANVAS',
                    payload: { offset: newOffset }
                });
            };

            const handleMouseUp = () => {
                setIsPanning(false);
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };

            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            if (e.target.id === 'canvas-container' || e.target.classList.contains('canvas-grid')) {
                dispatch({ type: 'SET_SELECTED', payload: null });
                if (state.ui.libraryOpen) {
                    dispatch({ type: 'SET_UI', payload: { libraryOpen: false } });
                }
                if (state.interactionMode === 'add-port') {
                    dispatch({ type: 'SET_MODE', payload: 'default' });
                }
            }
        }
    };

    return (
        <div 
            id="canvas-container"
            ref={canvasRef}
            className={`w-full h-full relative overflow-hidden ${isPanning ? 'cursor-grabbing' : 'cursor-default'}`}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            data-file="components/Canvas.js"
        >
            {/* Стек плашек проектов: по плашке на каждый проект, активная
                подсвечена; под плашкой — обозреватель её проекта (если открыт),
                плашки ниже съезжают вниз. Клик по плашке активирует проект и
                открывает его панель свойств. */}
            <div className="fixed top-4 left-6 z-40 flex flex-col gap-2 items-start max-h-[calc(100vh-2rem)] overflow-y-auto no-scrollbar pr-1">
                {(state.projectOrder || []).map((pid) => {
                    const proj = state.projects && state.projects[pid];
                    if (!proj) return null;
                    const isActive = pid === state.activeProjectId;
                    const color = proj.projectColor || '#059669';
                    const projSelected = (state.selectedIds || []).includes(`project:${pid}`)
                        || (isActive && (state.selectedIds || []).includes('project'));
                    return (
                        <React.Fragment key={pid}>
                            <div
                                className={`flex items-center gap-2.5 glass-panel bg-[#0d1017]/90 backdrop-blur-md rounded-xl px-3.5 py-2 shadow-2xl cursor-pointer transition-all hover:scale-[1.02] group ${isActive ? '' : 'opacity-75 hover:opacity-100'}`}
                                onClick={(e) => {
                                    // Shift+клик набирает проекты пачкой и НЕ меняет активный:
                                    // «активный» и «выделенный» — разные вещи
                                    if (e.shiftKey) {
                                        dispatch({ type: 'TOGGLE_SELECTED', payload: `project:${pid}` });
                                        return;
                                    }
                                    if (!isActive) dispatch({ type: 'SET_ACTIVE_PROJECT', payload: pid });
                                    dispatch({ type: 'SET_SELECTED', payload: `project:${pid}` });
                                }}
                                title={isActive
                                    ? 'Свойства проекта (кликните для редактирования)'
                                    : `Проект «${proj.projectName || 'Без имени'}» — кликните, чтобы сделать активным`}
                                style={{
                                    // Выделение и активность — разные признаки: выделенная
                                    // плашка обведена, активная светится
                                    border: projSelected ? `2px solid #f8fafc` : `1.5px solid ${color}`,
                                    boxShadow: isActive ? `0 0 20px ${color}66` : `0 0 8px ${color}22`
                                }}
                            >
                                <div
                                    className="w-6 h-6 rounded-lg flex items-center justify-center text-white border text-xs shrink-0 shadow-sm"
                                    style={{ backgroundColor: color, borderColor: 'rgba(255,255,255,0.3)' }}
                                >
                                    🌐
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span
                                        className="text-xs font-bold text-gray-100 group-hover:text-white truncate max-w-[180px]"
                                        style={{ fontFamily: proj.projectFontFamily || 'Inter, sans-serif' }}
                                    >
                                        {proj.projectName || 'Проект Архитектуры'}
                                    </span>
                                    <span className="text-[10px] text-gray-400 font-mono">
                                        Уровней: {Object.keys(proj.levelWindows || {}).length}{isActive ? ' · активный' : ''}
                                    </span>
                                </div>
                                <button
                                    className={`ml-1.5 w-6 h-6 rounded flex items-center justify-center transition-colors shrink-0 ${
                                        state.ui && state.ui.outlinerOpen && state.ui.outlinerOpen[pid]
                                            ? 'bg-[var(--accent-blue)] text-white shadow-sm'
                                            : 'text-gray-400 hover:text-white hover:bg-white/10'
                                    }`}
                                    title={
                                        state.ui && state.ui.outlinerOpen && state.ui.outlinerOpen[pid]
                                            ? 'Закрыть обозреватель проекта'
                                            : 'Обозреватель проекта (Библиотека)'
                                    }
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        dispatch({ type: 'TOGGLE_PROJECT_OUTLINER', payload: pid });
                                    }}
                                >
                                    <div className="icon-list text-xs"></div>
                                </button>
                            </div>
                            {state.ui && state.ui.outlinerOpen && state.ui.outlinerOpen[pid] && (
                                <Library projectId={pid} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Пустой холст: проектов нет */}
            {(!state.projectOrder || state.projectOrder.length === 0) && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <div className="glass-panel rounded-xl px-6 py-4 text-gray-400 text-sm border-[#444] shadow-2xl">
                        Проектов нет — наведите на кнопку «+» справа и выберите «Добавить проект»
                    </div>
                </div>
            )}

            {/* Панель утилит холста в правом верхнем углу (масштаб, Drag&Drop, изоляция) */}
            <div
                className="fixed top-4 right-4 z-40 glass-panel bg-[#0d1017]/90 backdrop-blur-md rounded-xl p-1.5 shadow-2xl flex flex-col items-center gap-1 border border-white/10 select-none"
            >
                {/* Индикатор зума */}
                <div
                    className="px-1 py-0.5 text-center text-[10px] text-gray-400 font-mono"
                    title="Масштаб холста"
                >
                    {Math.round(state.canvas.zoom * 100)}%
                </div>

                {/* Разделитель */}
                <div className="w-5 h-px bg-white/10"></div>

                {/* Тумблер глобального режима Drag&Drop */}
                <button
                    className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                        state.ui && state.ui.dragDropMode
                            ? 'text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 shadow-sm'
                            : 'text-gray-400 hover:text-white hover:bg-white/10'
                    }`}
                    title={
                        state.ui && state.ui.dragDropMode
                            ? 'Режим Drag&Drop включён: перетаскивание между уровнями и вложение элементов разрешены. Клик — выключить'
                            : 'Включить режим Drag&Drop: перетаскивание между уровнями и вложение элементов друг в друга'
                    }
                    onClick={(e) => {
                        e.stopPropagation();
                        dispatch({ type: 'TOGGLE_UI', payload: 'dragDropMode' });
                    }}
                >
                    <div className="icon-move text-xs"></div>
                </button>

                {/* Разделитель */}
                <div className="w-5 h-px bg-white/10"></div>

                {/* Кнопка изоляции (статична, тусклая при отсутствии выделения) */}
                {(() => {
                    const isIsolated = state.isolatedIds && state.isolatedIds.length > 0;
                    const hasSelection = state.selectedIds && state.selectedIds.length > 0;
                    return (
                        <button
                            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                                isIsolated
                                    ? 'bg-orange-500 text-white hover:bg-orange-600 shadow-md'
                                    : hasSelection
                                        ? 'text-gray-300 hover:text-white hover:bg-white/10'
                                        : 'opacity-30 cursor-not-allowed text-gray-500'
                            }`}
                            title={
                                isIsolated
                                    ? 'Отключить изоляцию'
                                    : hasSelection
                                        ? 'Изолировать выделенные элементы'
                                        : 'Выделите элементы для изоляции'
                            }
                            disabled={!isIsolated && !hasSelection}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (isIsolated) {
                                    dispatch({ type: 'SET_ISOLATED', payload: [] });
                                } else if (hasSelection) {
                                    dispatch({ type: 'SET_ISOLATED', payload: [...state.selectedIds] });
                                    dispatch({ type: 'SET_SELECTED', payload: null });
                                }
                            }}
                        >
                            <div className="icon-scan text-xs"></div>
                        </button>
                    );
                })()}
            </div>

            <div
                className="absolute inset-0 canvas-grid"
                style={{
                    backgroundSize: `${30 * zoom}px ${30 * zoom}px`,
                    backgroundPosition: `${offset.x}px ${offset.y}px`,
                    opacity: 0.5,
                    transition: (isPanning || isInteracting) ? 'none' : 'background-position 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), background-size 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)'
                }}
            />

            <div 
                className="absolute origin-top-left"
                style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                    transition: (isPanning || isInteracting || !!state.pendingConnection) ? 'none' : 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)'
                }}
            >
                {/* 1. Окна уровней АКТИВНОГО проекта */}
                <ProjectContext.Provider value={state.activeProjectId}>
                    {Object.values(state.levelWindows || {})
                        .filter((win) => !HU || !HU.isWindowVisible
                            || HU.isWindowVisible(win.id, state.activeProjectId, state.containerIsolation))
                        .map((win) => (
                        <LevelWindow
                            key={win.id}
                            /* Камера живёт в state.levelViews; в компонент окно приходит
                               одним объектом, чтобы не тащить два источника по дереву. */
                            windowData={{
                                ...win,
                                index: win.levelIndex,
                                ...(window.HierarchyUtils ? window.HierarchyUtils.getLevelView(win.id, state) : {})
                            }}
                            nodes={state.nodes}
                            layers={state.layers}
                            ports={state.ports}
                            links={state.links}
                            selectedIds={state.selectedIds}
                            isolatedIds={state.isolatedIds}
                            interactionMode={state.interactionMode}
                            dispatch={dispatch}
                            state={state}
                            worldZoom={zoom}
                        />
                    ))}
                    {/* Магистральные отрезки межуровневых связей активного проекта */}
                    <CrossLevelLinkLayer projectState={state} dispatch={dispatch} />
                </ProjectContext.Provider>

                {/* 1.05 Окна уровней НЕАКТИВНЫХ проектов: параллельный интерактивный вид
                    с независимым ProjectContext и маршрутизацией FOR_PROJECT. */}
                {(state.projectOrder || []).filter(pid => pid !== state.activeProjectId).map((pid) => {
                    const proj = state.projects && state.projects[pid];
                    if (!proj) return null;
                    // Изоляция контейнеров: скрытый проект не рисуется вовсе
                    if (HU && HU.isProjectVisible && !HU.isProjectVisible(pid, state.containerIsolation, proj.levelWindows)) return null;
                    const projectFlat = getProjectFlatView(pid);
                    return (
                        <ProjectContext.Provider key={`project-${pid}`} value={pid}>
                            <div className="opacity-95 transition-opacity">
                                {Object.values(proj.levelWindows || {})
                                    .filter((win) => !HU || !HU.isWindowVisible
                                        || HU.isWindowVisible(win.id, pid, state.containerIsolation))
                                    .map((win) => (
                                    <LevelWindow
                                        key={win.id}
                                        windowData={{
                                            ...win,
                                            index: win.levelIndex,
                                            ...(window.HierarchyUtils ? window.HierarchyUtils.getLevelView(win.id, projectFlat) : {})
                                        }}
                                        nodes={proj.nodes}
                                        layers={proj.layers}
                                        ports={proj.ports}
                                        links={proj.links}
                                        selectedIds={state.selectedIds}
                                        isolatedIds={state.isolatedIds}
                                        interactionMode={state.interactionMode}
                                        dispatch={dispatch}
                                        state={projectFlat}
                                        worldZoom={zoom}
                                    />
                                ))}
                            </div>
                            {/* Магистральные отрезки межуровневых связей неактивного проекта */}
                            <CrossLevelLinkLayer projectState={projectFlat} dispatch={dispatch} interactive={true} />
                        </ProjectContext.Provider>
                    );
                })}

                {/* 1.1 Drag&Drop: переносимые элементы рисуются ПОВЕРХ всех окон
                    в контексте своего проекта. */}
                {state.ui && state.ui.dragDropMode && state.dragGesture && state.dragGesture.ids && state.dragGesture.ids.length > 0 && (() => {
                    const H = window.HierarchyUtils;
                    if (!H) return null;
                    const dragPid = (state.dragGesture && state.dragGesture.projectId) || (() => {
                        const firstId = state.dragGesture && state.dragGesture.ids && state.dragGesture.ids[0];
                        if (!firstId) return state.activeProjectId;
                        for (const pid of (state.projectOrder || [])) {
                            const p = state.projects && state.projects[pid];
                            if (p && ((p.nodes && p.nodes[firstId]) || (p.layers && p.layers[firstId]))) return pid;
                        }
                        return state.activeProjectId;
                    })();
                    const dragProjectView = getProjectFlatView(dragPid);
                    // Расширяем перетаскиваемый набор его parentId-вложенными потомками
                    // (например, узел, назначенный на перетаскиваемый слой) — этот оверлей
                    // рисуется ПОВЕРХ всех окон и не режется их overflow-hidden, но включает
                    // только явно перечисленные id; без расширения вложенный узел остаётся
                    // рендериться исключительно «под» границей своего исходного окна и пропадает
                    // из виду в момент, когда слой визуально пересекает эту границу (баг: узел,
                    // назначенный на перетаскиваемый слой, исчезал на время пересечения).
                    // ⚠️ Именно `hasContainerAncestorIn` (только parentId), НЕ `hasAncestorIn`:
                    // та поднимается и по ownerId — при перетаскивании обычного узла его
                    // настоящий ownerId-потомок на ДРУГОМ уровне ошибочно тоже подхватывался
                    // сюда и материализовался в этом нескливаемом оверлее вне своей рамки
                    // (Plan_fix.md), хотя визуально с перетаскиваемым узлом никак не связан.
                    const expandedDragIds = (() => {
                        const seeds = state.dragGesture.ids;
                        const keep = new Set(seeds);
                        if (H.hasContainerAncestorIn) {
                            Object.keys(dragProjectView.nodes || {}).forEach(nid => {
                                if (!keep.has(nid) && H.hasContainerAncestorIn(nid, seeds, dragProjectView.nodes, dragProjectView.layers)) keep.add(nid);
                            });
                            Object.keys(dragProjectView.layers || {}).forEach(lid => {
                                if (!keep.has(lid) && H.hasContainerAncestorIn(lid, seeds, dragProjectView.nodes, dragProjectView.layers)) keep.add(lid);
                            });
                        }
                        return Array.from(keep);
                    })();
                    const byWin = {};
                    expandedDragIds.forEach(id => {
                        if (!dragProjectView.nodes[id] && !(dragProjectView.layers && dragProjectView.layers[id])) return;
                        const lvl = H.getEntityLevel(id, dragProjectView.nodes, dragProjectView.layers);
                        const win = H.getWindowOfLevel(lvl, dragProjectView.levelWindows);
                        if (!win) return;
                        (byWin[win.id] = byWin[win.id] || []).push(id);
                    });
                    const M = H.LEVEL_WINDOW_METRICS;
                    return (
                        <ProjectContext.Provider value={dragPid}>
                            {Object.entries(byWin).map(([winId, ids]) => {
                                const win = dragProjectView.levelWindows[winId];
                                if (!win) return null;
                                const view = H.getLevelView(winId, dragProjectView);
                                if (view.isCollapsed) return null;
                                return (
                                    <div
                                        key={`drag-overlay-${winId}`}
                                        className="absolute pointer-events-none"
                                        style={{
                                            left: (win.position?.x || 0) + M.borderW,
                                            top: (win.position?.y || 0) + M.borderW + M.headerH,
                                            zIndex: 60
                                        }}
                                    >
                                        <div style={{
                                            transform: `translate(${view.innerOffset?.x || 0}px, ${view.innerOffset?.y || 0}px) scale(${view.innerZoom || 1})`,
                                            transformOrigin: 'top left'
                                        }}>
                                            {ids.map(id => dragProjectView.nodes[id] ? (
                                                <NodeComponent
                                                    key={`drag-ov-${id}`}
                                                    data={dragProjectView.nodes[id]}
                                                    zoom={view.innerZoom || 1}
                                                />
                                            ) : (
                                                <Layer
                                                    key={`drag-ov-${id}`}
                                                    data={dragProjectView.layers[id]}
                                                    nodes={dragProjectView.nodes}
                                                    layers={dragProjectView.layers}
                                                    selectedIds={state.selectedIds}
                                                    isolatedIds={state.isolatedIds}
                                                    dispatch={dispatch}
                                                    zoom={view.innerZoom || 1}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </ProjectContext.Provider>
                    );
                })()}

                <PendingLink />
            </div>
        </div>
    );
}

if (typeof window !== 'undefined') window.Canvas = Canvas;