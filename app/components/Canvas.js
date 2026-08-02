function Canvas() {
    const { state, dispatch } = useStore();
    const { offset, zoom } = state.canvas;
    const canvasRef = React.useRef(null);
    const [isPanning, setIsPanning] = React.useState(false);
    const [isInteracting, setIsInteracting] = React.useState(false);
    const wheelTimeoutRef = React.useRef(null);
    
    const getContextDepth = React.useCallback((contextId) => {
        if (!contextId || contextId === 'root') return 0;
        let depth = 0;
        let currentId = contextId;
        const visited = new Set();
        while (currentId && currentId !== 'root' && !visited.has(currentId)) {
            visited.add(currentId);
            if (state.layers && state.layers[currentId]) {
                currentId = state.layers[currentId].parentId || 'root';
            } else if (state.nodes && state.nodes[currentId]) {
                depth++;
                currentId = state.nodes[currentId].parentId || 'root';
            } else if (state.ports && state.ports[currentId]) {
                depth++;
                currentId = state.ports[currentId].nodeId || 'root';
            } else if (state.links && state.links[currentId]) {
                depth++;
                const link = state.links[currentId];
                currentId = link.context || 'root';
            } else {
                break;
            }
        }
        return depth;
    }, [state.layers, state.nodes, state.ports, state.links]);

    const getTrueParentContextId = React.useCallback((entityId) => {
        if (!entityId || entityId === 'root') return 'root';
        const safeNodes = state.nodes || {};
        const safeLayers = state.layers || {};
        const safePorts = state.ports || {};
        const safeLinks = state.links || {};
        const entity = safeNodes[entityId] || safeLayers[entityId] || safePorts[entityId] || safeLinks[entityId];
        if (!entity || !entity.parentId || entity.parentId === 'root') return 'root';
        const pId = entity.parentId;
        if (safeLayers[pId]) {
            return safeLayers[pId].parentId || 'root';
        }
        return pId;
    }, [state.nodes, state.layers, state.ports, state.links]);

    const getActiveLevelsSet = React.useCallback(() => {
        const xRay = state.ui?.xRayLevels;
        const validXRay = Array.isArray(xRay) ? xRay.filter(l => typeof l === 'number' && l >= 0) : [];
        const hUtils = (typeof window !== 'undefined' && window.HierarchyUtils) || (typeof global !== 'undefined' && global.HierarchyUtils) || null;
        const safeNodes = state.nodes || {};
        const safeLayers = state.layers || {};
        const safePorts = state.ports || {};
        const safeLinks = state.links || {};

        if (validXRay.length > 0) {
            return new Set(validXRay);
        }

        const active = new Set();
        const ctx = state.currentContext || 'root';
        if (ctx === 'root') {
            active.add(0);
        } else {
            const ctxDepth = hUtils ? hUtils.getEntityDepth(ctx, safeNodes, safeLayers, safePorts, safeLinks) : 0;
            // Непосредственный родительский уровень-рамка
            active.add(ctxDepth);
            // Внутренний уровень содержимого
            active.add(ctxDepth + 1);
        }
        return active;
    }, [state.ui, state.currentContext, state.nodes, state.layers, state.ports, state.links]);

    const isNodeVisible = React.useCallback((node) => {
        if (!node || node.hidden) return false;
        const isolated = state.isolatedIds || [];
        if (isolated.length > 0 && !isolated.includes(node.id)) return false;

        const safeNodes = state.nodes || {};
        const safeLayers = state.layers || {};
        const safePorts = state.ports || {};
        const safeLinks = state.links || {};

        // Если текущий контекст — это связь, её якоря (source/target nodes) всегда видны
        const ctxLink = safeLinks[state.currentContext];
        if (ctxLink) {
            const sPort = safePorts[ctxLink.sourcePortId];
            const tPort = safePorts[ctxLink.targetPortId];
            if ((sPort && sPort.nodeId === node.id) || (tPort && tPort.nodeId === node.id)) {
                return true;
            }
        }

        const hUtils = (typeof window !== 'undefined' && window.HierarchyUtils) || (typeof HierarchyUtils !== 'undefined' ? HierarchyUtils : null);
        const exactNodeDepth = hUtils ? hUtils.getEntityDepth(node.id, safeNodes, safeLayers, safePorts, safeLinks) : 0;

        const activeLevels = getActiveLevelsSet();

        // Узел виден СТРОГО если его глобальный уровень вложенности входит в список активных уровней
        if (!activeLevels.has(exactNodeDepth)) {
            return false;
        }

        return true;
    }, [state.isolatedIds, state.nodes, state.layers, state.ports, state.links, state.currentContext, getActiveLevelsSet]);

    // Используем Ref для актуального стейта камеры, чтобы не переподключать слушатель wheel каждый кадр
    const cameraRef = React.useRef({ zoom, offset });
    cameraRef.current = { zoom, offset };

    // Свежий стейт для wheel-обработчика (zoom-to-dive, этап 6.2) без переподписки
    const stateRef = React.useRef(state);
    stateRef.current = state;
    const lastAutoNavRef = React.useRef(0);

    // «Хвост» перехода (этап 6.1): прошлый уровень остаётся смонтированным на время полёта камеры
    React.useEffect(() => {
        if (!state.ui.transitionFromContext) return;
        const t = setTimeout(() => {
            dispatch({ type: 'SET_UI', payload: { transitionFromContext: null } });
        }, 550);
        return () => clearTimeout(t);
    }, [state.ui.transitionFromContext, dispatch]);

    React.useEffect(() => {
        const handleKeyDown = (e) => {
            // Игнорируем нажатия, если активен инпут или текстовое поле
            const activeTag = document.activeElement?.tagName?.toLowerCase();
            if (activeTag === 'input' || activeTag === 'textarea') return;

            const { selectedIds, layers, nodes, ports, links, clipboard, past, future } = state;

            // Удаление (Delete / Backspace)
            if (e.code === 'Delete' || e.code === 'Backspace') {
                if (selectedIds.length > 0) {
                    dispatch({ type: 'DELETE_SELECTED' });
                }
            }

            // Esc: сначала выход из режима, потом сброс выделения, потом уровень вверх
            if (e.code === 'Escape') {
                if (state.interactionMode !== 'default') {
                    dispatch({ type: 'SET_MODE', payload: 'default' });
                } else if (selectedIds.length > 0) {
                    dispatch({ type: 'SET_SELECTED', payload: null });
                } else if (state.breadcrumbs.length > 1) {
                    dispatch({ type: 'NAVIGATE_TO', payload: state.breadcrumbs.length - 2 });
                }
            }

            // История посещений контекстов: Cmd/Ctrl+[ назад, Cmd/Ctrl+] вперед
            if ((e.ctrlKey || e.metaKey) && e.code === 'BracketLeft') {
                e.preventDefault();
                dispatch({ type: 'NAV_BACK' });
            }
            if ((e.ctrlKey || e.metaKey) && e.code === 'BracketRight') {
                e.preventDefault();
                dispatch({ type: 'NAV_FORWARD' });
            }

            // Копирование узла (Ctrl+C / Cmd+C) - пока копируем только первый узел (MVP)
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

        // Отпустили Alt — peek гаснет (см. этап 3.2 плана)
        const handleKeyUp = (e) => {
            if (e.key === 'Alt' && state.ui.peekNodeId) {
                dispatch({ type: 'SET_UI', payload: { peekNodeId: null } });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [state, dispatch]);

    React.useEffect(() => {
        const handleWheel = (e) => {
            // Если мы крутим колесико над панелью со скроллом (например, внутри узла или чата), не зумим холст
            const scrollable = e.target.closest('.overflow-y-auto');
            if (scrollable && scrollable.scrollHeight > scrollable.clientHeight) {
                // Если скролл достигнут края, можно позволить зум, но лучше просто оставить скролл
                return;
            }

            e.preventDefault(); // Блокируем стандартную прокрутку страницы
            
            // Отключаем CSS-анимацию (transition) на время зума колесиком мыши
            setIsInteracting(true);
            if (wheelTimeoutRef.current) {
                clearTimeout(wheelTimeoutRef.current);
            }
            wheelTimeoutRef.current = setTimeout(() => {
                setIsInteracting(false);
            }, 150);

            const currentZoom = cameraRef.current.zoom;
            const currentOffset = cameraRef.current.offset;
            
            // Чувствительность зума (подходит и для мыши, и для трекпада)
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
                
                // Обновляем реф немедленно, чтобы следующие события wheel до рендера видели свежие значения
                cameraRef.current = { zoom: newZoom, offset: { x: newOffsetX, y: newOffsetY } };

                dispatch({ type: 'SET_CANVAS', payload: { zoom: newZoom, offset: { x: newOffsetX, y: newOffsetY } } });
            }
        };

        const canvasEl = canvasRef.current;
        if(canvasEl) {
            // passive: false ОБЯЗАТЕЛЕН для вызова e.preventDefault()
            canvasEl.addEventListener('wheel', handleWheel, { passive: false });
        }
        return () => {
            if(canvasEl) canvasEl.removeEventListener('wheel', handleWheel);
            if(wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
        }
    }, [dispatch]);

    const handleTouchStart = (e) => {
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
                // Отключаем анимацию (transition) во время жестов масштабирования пальцами
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
        // Space + Left Click or Middle Click for Pan
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
            // Deselect on canvas click
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
            <div 
                className="absolute inset-0 canvas-grid"
                style={{
                    backgroundSize: `${30 * zoom}px ${30 * zoom}px`,
                    backgroundPosition: `${offset.x}px ${offset.y}px`,
                    opacity: 0.5,
                    transition: (isPanning || isInteracting) ? 'none' : 'background-position 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), background-size 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)'
                }}
            />
            
            <div className={`absolute top-4 transition-all duration-300 ${state.ui.libraryOpen ? 'left-[384px]' : 'left-20'} glass-panel rounded-lg px-4 py-2 flex items-center gap-2 z-40 text-sm border-[#444]`}>
                {/* Кнопки навигации по истории */}
                <button
                    className={`p-1 rounded transition-colors ${
                        (state.navHistory?.past?.length || 0) === 0
                            ? 'text-gray-700 cursor-not-allowed'
                            : 'text-gray-400 hover:text-white hover:bg-white/10'
                    }`}
                    onClick={(e) => { e.stopPropagation(); dispatch({ type: 'NAV_BACK' }); }}
                    disabled={!(state.navHistory?.past?.length)}
                    title="Назад (Ctrl+[)"
                >
                    <div className="icon-arrow-left text-xs"></div>
                </button>
                <button
                    className={`p-1 rounded transition-colors ${
                        (state.navHistory?.future?.length || 0) === 0
                            ? 'text-gray-700 cursor-not-allowed'
                            : 'text-gray-400 hover:text-white hover:bg-white/10'
                    }`}
                    onClick={(e) => { e.stopPropagation(); dispatch({ type: 'NAV_FORWARD' }); }}
                    disabled={!(state.navHistory?.future?.length)}
                    title="Вперёд (Ctrl+])"
                >
                    <div className="icon-arrow-right text-xs"></div>
                </button>
                <span className="w-px h-4 bg-[#444]"></span>

                {/* Активные крошки */}
                {/* Активные крошки */}
                {state.breadcrumbs.map((crumb, index) => {
                    const isCurrent = index === state.breadcrumbs.length - 1;
                    const activeLevels = getActiveLevelsSet();
                    const isLevelActive = activeLevels.has(index);
                    const showEye = true;

                    const handleToggleLevelEye = (e) => {
                        e.stopPropagation();
                        const nextLevels = new Set(activeLevels);
                        if (nextLevels.has(index)) {
                            nextLevels.delete(index);
                        } else {
                            nextLevels.add(index);
                        }
                        dispatch({ 
                            type: 'SET_UI', 
                            payload: { xRayLevels: Array.from(nextLevels) } 
                        });
                    };

                    return (
                        <React.Fragment key={crumb.id}>
                            {index > 0 && <span className="icon-chevron-right text-gray-500 text-xs"></span>}
                            <div className="flex items-center gap-1">
                                <button 
                                    className={`hover:text-[var(--accent-blue)] transition-colors flex items-center gap-1.5 ${isCurrent ? 'text-white font-medium cursor-default pointer-events-none' : 'text-gray-400'}`}
                                    onClick={(e) => { e.stopPropagation(); dispatch({ type: 'NAVIGATE_TO', payload: index }); }}
                                >
                                    {index === 0 && <span className="icon-house text-xs"></span>}
                                    <span>{crumb.name}</span>
                                    <span className="text-[10px] opacity-60 ml-0.5 font-normal">(Уровень {index})</span>
                                    {isLevelActive && <span className="text-[10px] text-[var(--accent-blue)] opacity-80 ml-1">(X-Ray)</span>}
                                </button>
                                {showEye && (
                                    <button 
                                        className={`ml-1 p-0.5 rounded transition-colors ${isLevelActive ? 'text-[var(--accent-blue)] bg-[var(--accent-blue)]/10' : 'text-gray-500 hover:text-gray-300 hover:bg-white/10'}`}
                                        onClick={handleToggleLevelEye}
                                        title={isLevelActive ? `Скрыть элементы Уровня ${index}` : `Показать элементы Уровня ${index}`}
                                    >
                                        <div className={`text-xs ${isLevelActive ? 'icon-eye' : 'icon-eye-off'}`}></div>
                                    </button>
                                )}
                            </div>
                        </React.Fragment>
                    );
                })}
                {/* Индикатор пустого контекста прямо в панели крошек */}
                {(() => {
                    const contextNode = state.nodes[state.currentContext];
                    if (!contextNode) return null;
                    const hasChildren =
                        Object.values(state.nodes).some(n => n && n.parentId === state.currentContext) ||
                        (state.layers && Object.values(state.layers).some(l => l && l.parentId === state.currentContext));
                    if (hasChildren) return null;
                    return (
                        <span className="text-[10px] text-gray-400 bg-white/5 border border-white/10 rounded-full px-2 py-0.5 ml-1 animate-pulse">
                            Пусто (Esc — наверх)
                        </span>
                    );
                })()}
            </div>

            {/* Миникарта (этап 4): правый нижний угол, под PropertyPanel */}
            <div className="absolute right-4 bottom-4 z-40 flex flex-col gap-2 items-end">
                <MiniMap />
            </div>

            {/* Context specific backgrounds */}
            {state.links && state.links[state.currentContext] && (
                <div className="absolute inset-0 pointer-events-none flex justify-between z-0 opacity-10">
                    <div className="w-1/4 h-full bg-gradient-to-r from-[var(--accent-blue)] to-transparent flex items-center p-8">
                        <div className="text-[10rem] font-bold text-white transform -rotate-90 origin-left opacity-20">INPUT</div>
                    </div>
                    <div className="w-1/4 h-full bg-gradient-to-l from-green-500 to-transparent flex items-center justify-end p-8">
                        <div className="text-[10rem] font-bold text-white transform rotate-90 origin-right opacity-20">OUTPUT</div>
                    </div>
                </div>
            )}

            <div 
                className="absolute origin-top-left"
                style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                    transition: (isPanning || isInteracting || !!state.pendingConnection) ? 'none' : 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)'
                }}
            >
                {/* Render ALL Layers */}
                {state.layers && Object.values(state.layers).map((layer, idx) => {
                    if (state.isolatedIds.length > 0 && !state.isolatedIds.includes(layer.id)) return null;

                    const hUtils = (typeof window !== 'undefined' && window.HierarchyUtils) || (typeof HierarchyUtils !== 'undefined' ? HierarchyUtils : null);
                    const layerDepth = hUtils ? hUtils.getEntityDepth(layer.id, state.nodes, state.layers, state.ports, state.links) : 0;
                    const activeLevels = getActiveLevelsSet();

                    if (!activeLevels.has(layerDepth)) return null;

                    return (
                        <div
                            key={layer.id || `layer-${idx}`}
                            style={{ zIndex: 2 }}
                        >
                            <Layer data={layer} />
                        </div>
                    );
                })}

                {/* Render ALL Links */}
                {Object.values(state.links || {}).map((link, idx) => {
                    if (!link || !link.id || !link.sourcePortId || !link.targetPortId) return null;
                    const sPort = state.ports ? state.ports[link.sourcePortId] : null;
                    const tPort = state.ports ? state.ports[link.targetPortId] : null;
                    if (!sPort || !tPort) return null;

                    // Check isolation
                    if (state.isolatedIds.length > 0) {
                        const sNodeId = sPort.nodeId;
                        const tNodeId = tPort.nodeId;
                        if (!state.isolatedIds.includes(sNodeId) || !state.isolatedIds.includes(tNodeId)) return null;
                    }

                    const sNode = sPort ? state.nodes[sPort.nodeId] : null;
                    const tNode = tPort ? state.nodes[tPort.nodeId] : null;

                    if (!sNode || !tNode) return null;

                    const hUtils = (typeof window !== 'undefined' && window.HierarchyUtils) || (typeof HierarchyUtils !== 'undefined' ? HierarchyUtils : null);
                    const safeNodes = state.nodes || {};
                    const safeLayers = state.layers || {};
                    const safePorts = state.ports || {};
                    const safeLinks = state.links || {};

                    const sDepth = hUtils ? hUtils.getEntityDepth(sPort.nodeId, safeNodes, safeLayers, safePorts, safeLinks) : 0;
                    const tDepth = hUtils ? hUtils.getEntityDepth(tPort.nodeId, safeNodes, safeLayers, safePorts, safeLinks) : 0;

                    const activeLevels = getActiveLevelsSet();
                    const isTheContextItself = link.id === state.currentContext;
                    const isBreadcrumbAncestor = (state.breadcrumbs || []).some(b => b && b.id === link.id);
                    const isLinkSelected = (state.selectedIds || []).includes(link.id) || (state.selectedIds || []).includes(sPort.id) || (state.selectedIds || []).includes(tPort.id);

                    const isLinkContextActive = isTheContextItself || isBreadcrumbAncestor || isLinkSelected;

                    // Связь отображается, если она является контекстом погружения ИЛИ если ОБА её присоединенных уровня активны
                    if (!isLinkContextActive && (!activeLevels.has(sDepth) || !activeLevels.has(tDepth))) {
                        return null;
                    }
                    
                    let sContext = 'root';
                    if (sNode) sContext = state.layers && state.layers[sNode.parentId] ? state.layers[sNode.parentId].parentId || 'root' : sNode.parentId || 'root';
                    let tContext = 'root';
                    if (tNode) tContext = state.layers && state.layers[tNode.parentId] ? state.layers[tNode.parentId].parentId || 'root' : tNode.parentId || 'root';

                    const isCrossLevel = sContext !== tContext;
                    let effectiveContextId = link.context || 'root';
                    
                    if (isCrossLevel) {
                        const sDepth = getContextDepth(sContext);
                        const tDepth = getContextDepth(tContext);
                        // Привязываем связь к более глубокому контексту
                        effectiveContextId = sDepth > tDepth ? sContext : (tDepth > sDepth ? tContext : effectiveContextId);
                        
                        const shallowerContext = sDepth < tDepth ? sContext : (tDepth < sDepth ? tContext : 'root');
                        const isExplicitlyVisibleLayer = (state.ui.xRayLevels || []).includes(getContextDepth(shallowerContext)) || (state.ui.xRayLevels || []).includes(getContextDepth(effectiveContextId));

                        // Скрываем на верхнем (более поверхностном) уровне, если нет X-Ray
                        if (state.currentContext === shallowerContext && !isExplicitlyVisibleLayer) {
                            return null;
                        }
                    } else {
                        // Если узлы теперь на одном уровне (например, один из них переместили),
                        // динамически обновляем контекст связи до этого общего уровня
                        effectiveContextId = sContext;
                    }

                    const isCurrentChild = effectiveContextId === state.currentContext;
                    const isAncestorContext = (state.breadcrumbs || []).some(b => b && b.id === effectiveContextId) && effectiveContextId !== state.currentContext;
                    const contextDepth = getContextDepth(effectiveContextId);
                    const isExplicitlyVisible = (state.ui.xRayLevels || []).includes(contextDepth);

                    const currCtx = state.currentContext;
                    const isVisibleInCurrentContext = (sContext === currCtx || tContext === currCtx || link.context === currCtx);
                    const isConnectedToCurrentNodeContext = !!state.nodes[currCtx] && (
                        (sPort && sPort.nodeId === currCtx) || (tPort && tPort.nodeId === currCtx)
                    );
                    const isConnectedToCurrentPortContext = !!state.ports[currCtx] && (
                        link.sourcePortId === currCtx || link.targetPortId === currCtx
                    );

                    // Скрываем связь, если она не относится к текущему контексту, не привязана к нему и не подсвечена X-Ray
                    if (!isCurrentChild && !isTheContextItself && !isVisibleInCurrentContext && !isExplicitlyVisible && !isBreadcrumbAncestor && !isConnectedToCurrentNodeContext && !isConnectedToCurrentPortContext) {
                        return null;
                    }

                    const opacity = (isVisibleInCurrentContext || isExplicitlyVisible || isCurrentChild || isTheContextItself || isConnectedToCurrentNodeContext || isConnectedToCurrentPortContext) ? 1 : 0.15;
                    const pointerEvents = (isVisibleInCurrentContext || isExplicitlyVisible || isCurrentChild || isTheContextItself || isConnectedToCurrentNodeContext || isConnectedToCurrentPortContext) ? 'auto' : 'none';

                    return (
                        <div key={link.id || `link-${idx}`} style={{ opacity, pointerEvents }}>
                            <Link data={link} />
                        </div>
                    );
                })}
                
                <PendingLink />

                {/* Render Nodes */}
                {Object.values(state.nodes).map((node, idx) => {
                    if (!node || !isNodeVisible(node)) return null;

                    // Isolation Filter
                    if (state.isolatedIds.length > 0 && !state.isolatedIds.includes(node.id)) {
                        return null;
                    }

                    // Погружение в узел/слой/порт/связь: прямой ребёнок виден, сам контекст размывается на фоне
                    const getTrueParentContextId = (id) => {
                        const n = state.nodes[id];
                        if (!n || !n.parentId || n.parentId === 'root') return 'root';
                        const pId = n.parentId;
                        if (state.layers && state.layers[pId]) {
                            return state.layers[pId].parentId || 'root';
                        }
                        return pId;
                    };

                    const nodeParentContext = getTrueParentContextId(node.id);
                    const effectiveContextId = state.currentContext;

                    const isCurrentChild = nodeParentContext === effectiveContextId || node.parentId === effectiveContextId;
                    const isTheContextItself = node.id === effectiveContextId;
                    const hUtils = (typeof window !== 'undefined' && window.HierarchyUtils) || (typeof HierarchyUtils !== 'undefined' ? HierarchyUtils : null);
                    // Предок контекста (узла, слоя, порта или связи), на который мы смотрим изнутри
                    const isAncestorContext = hUtils ? hUtils.isDescendantOf(effectiveContextId, node.id, state.nodes, state.layers, state.ports, state.links) : false;
                    // Элементы из хлебных крошек
                    const isBreadcrumbAncestor = state.breadcrumbs.some(b => b.id === node.id);

                    // Проверка явного показа скрытого узла по кнопке "глаз" на панели уровня (X-Ray)
                    const nodeContextDepth = getContextDepth(nodeParentContext);
                    const isExplicitlyVisible = (state.ui.xRayLevels || []).includes(nodeContextDepth) || (state.ui.visibleContexts || []).includes(node.id);

                    // Показываем родительский узел порта, если мы погрузились в этот порт
                    let isParentOfCurrentPort = false;
                    if (state.ports[state.currentContext]) {
                        const activePort = state.ports[state.currentContext];
                        if (activePort) {
                            if (activePort.nodeId === node.id) {
                                isParentOfCurrentPort = true;
                            } else {
                                isParentOfCurrentPort = Object.values(state.links || {}).some(l => 
                                    l && ((l.sourcePortId === activePort.id && state.ports[l.targetPortId]?.nodeId === node.id) ||
                                          (l.targetPortId === activePort.id && state.ports[l.sourcePortId]?.nodeId === node.id))
                                );
                            }
                        }
                    }

                    // Show connected opposite nodes if we dive into a node
                    let isConnectedToCurrentNodeContext = false;
                    if (state.nodes[state.currentContext]) {
                        const activeNodeId = state.currentContext;
                        if (activeNodeId !== node.id) {
                            isConnectedToCurrentNodeContext = Object.values(state.links || {}).some(l => 
                                l && ((state.ports[l.sourcePortId]?.nodeId === activeNodeId && state.ports[l.targetPortId]?.nodeId === node.id) ||
                                      (state.ports[l.targetPortId]?.nodeId === activeNodeId && state.ports[l.sourcePortId]?.nodeId === node.id))
                            );
                        }
                    }

                    // Show source and target nodes if we dive into a link
                    let isLinkSourceOrTarget = false;
                    const contextLink = state.links ? state.links[state.currentContext] : null;
                    if (contextLink) {
                        const sPort = state.ports[contextLink.sourcePortId];
                        const tPort = state.ports[contextLink.targetPortId];
                        if ((sPort && sPort.nodeId === node.id) || (tPort && tPort.nodeId === node.id)) {
                            isLinkSourceOrTarget = true;
                        }
                    }

                    // Alt+hover peek: дети peek-узла временно видимы в полный размер
                    const peekId = state.ui ? state.ui.peekNodeId : null;
                    const isPeekChild = !!peekId && getTrueParentContextId(node.id) === peekId;
                    const isPeekSource = peekId === node.id;
                    const isPeekDimmed = !!peekId && !isPeekChild && !isPeekSource && isCurrentChild;
                    const isTransitionChild = !!state.ui?.transitionFromContext && effectiveContextId === state.ui.transitionFromContext;

                    if (!isCurrentChild && !isTheContextItself && !isAncestorContext && !isParentOfCurrentPort && !isLinkSourceOrTarget && !isConnectedToCurrentNodeContext && !isExplicitlyVisible && !isBreadcrumbAncestor && !isPeekChild && !isTransitionChild) return null;
                    if (node.hidden) return null;
                    
                    // Проверяем, выделен ли хотя бы один из истинных детей этого узла (только среди узлов, исключая слои)
                    const selectedIds = state.selectedIds || [];
                    const hasSelectedChild = selectedIds.some(sid => state.nodes && state.nodes[sid] && getTrueParentContextId(sid) === node.id);
                    const isConnectedToSelectedLink = Object.values(state.links || {}).some(l => l && selectedIds.includes(l.id) && ((state.ports[l.sourcePortId]?.nodeId === node.id) || (state.ports[l.targetPortId]?.nodeId === node.id)));
                    const isConnectedToSelectedPort = selectedIds.some(sid => state.ports && state.ports[sid]?.nodeId === node.id) || Object.values(state.links || {}).some(l => l && ((state.ports[l.sourcePortId]?.nodeId === node.id && selectedIds.includes(l.targetPortId)) || (state.ports[l.targetPortId]?.nodeId === node.id && selectedIds.includes(l.sourcePortId))));
                    const isSelected = selectedIds.includes(node.id) || isConnectedToSelectedLink || isConnectedToSelectedPort;

                    // Если узел имеет выделенных детей, он не должен затухать
                    const isDimmed = (isAncestorContext || isBreadcrumbAncestor) && !isTheContextItself && !isParentOfCurrentPort && !isLinkSourceOrTarget && !isConnectedToCurrentNodeContext && !isExplicitlyVisible && !hasSelectedChild;

                    const isHighlightedContext = isTheContextItself || isLinkSourceOrTarget;
                    const depth = getContextDepth(effectiveContextId);
                    const nodeZIndex = (depth * 10) + (isPeekChild ? 30 : 0) + (isSelected ? 25 : 0) + (isCurrentChild ? 2 : 0) + (hasSelectedChild ? 1 : 0);

                    return (
                        <div 
                            key={node.id || `node-${idx}`} 
                            className={`
                                ${isDimmed && !isBreadcrumbAncestor ? 'opacity-20 pointer-events-none grayscale blur-[2px]' : ''}
                                ${isHighlightedContext ? 'shadow-[0_0_100px_rgba(0,122,255,0.15)] ring-4 ring-[var(--accent-blue)]/30 rounded-lg opacity-100 pointer-events-auto' : ''}
                                ${isExplicitlyVisible && !isCurrentChild && !hasSelectedChild ? 'opacity-100 pointer-events-auto shadow-md' : ''}
                                ${isBreadcrumbAncestor && !isHighlightedContext && !isExplicitlyVisible ? 'opacity-50 pointer-events-none ring-4 ring-[var(--accent-blue)] ring-opacity-50 rounded-lg' : ''}
                                ${isBreadcrumbAncestor && !isHighlightedContext && isExplicitlyVisible ? 'opacity-50 pointer-events-auto ring-4 ring-[var(--accent-blue)] ring-opacity-50 rounded-lg' : ''}
                                ${isPeekChild ? 'opacity-100 pointer-events-none shadow-xl' : ''}
                                ${isPeekDimmed ? 'opacity-25 grayscale' : ''}
                                ${isPeekSource ? 'ring-4 ring-[var(--accent-blue)]/60 rounded-lg' : ''}
                                ${isTransitionChild && !isCurrentChild ? 'opacity-50 pointer-events-none' : ''}
                            `}
                            style={{ zIndex: nodeZIndex }}
                        >
                            <Node data={node} isContextNode={isHighlightedContext || isBreadcrumbAncestor} isParentOfSelected={hasSelectedChild} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}