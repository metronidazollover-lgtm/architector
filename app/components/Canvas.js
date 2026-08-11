function Canvas() {
    const { state, dispatch } = useStore();
    const { offset, zoom } = state.canvas;
    const canvasRef = React.useRef(null);
    const [isPanning, setIsPanning] = React.useState(false);
    const [isInteracting, setIsInteracting] = React.useState(false);
    const wheelTimeoutRef = React.useRef(null);
    
    const nodeVisibility = React.useMemo(() => {
        const H = (typeof window !== 'undefined' && window.HierarchyUtils) || (typeof global !== 'undefined' && global.HierarchyUtils) || null;
        if (!H || !H.getVisibilityState) return {};
        const result = {};
        Object.values(state.nodes || {}).forEach(node => {
            if (!node || !node.id) return;
            result[node.id] = H.getVisibilityState(
                node.id,
                state.currentContext || 'root',
                state.ui?.xRayDown || 0,
                state.ui?.xRayUp || 0,
                state.nodes,
                state.layers,
                state.ports,
                state.links,
                {
                    selectedIds: state.selectedIds,
                    peekNodeId: state.ui?.peekNodeId,
                    transitionFromContext: state.ui?.transitionFromContext,
                    isolatedIds: state.isolatedIds,
                    breadcrumbs: state.breadcrumbs,
                    xRayNodes: state.ui?.xRayNodes
                }
            );
        });
        return result;
    }, [state.nodes, state.layers, state.ports, state.links, state.currentContext, state.ui?.xRayDown, state.ui?.xRayUp, state.ui?.xRayNodes, state.selectedIds, state.ui?.peekNodeId, state.ui?.transitionFromContext, state.isolatedIds, state.breadcrumbs]);

    const layerVisibility = React.useMemo(() => {
        const H = (typeof window !== 'undefined' && window.HierarchyUtils) || (typeof global !== 'undefined' && global.HierarchyUtils) || null;
        if (!H || !H.getVisibilityState) return {};
        const result = {};
        Object.values(state.layers || {}).forEach(layer => {
            if (!layer || !layer.id) return;
            result[layer.id] = H.getVisibilityState(
                layer.id,
                state.currentContext || 'root',
                state.ui?.xRayDown || 0,
                state.ui?.xRayUp || 0,
                state.nodes,
                state.layers,
                state.ports,
                state.links,
                {
                    selectedIds: state.selectedIds,
                    peekNodeId: state.ui?.peekNodeId,
                    transitionFromContext: state.ui?.transitionFromContext,
                    isolatedIds: state.isolatedIds,
                    breadcrumbs: state.breadcrumbs,
                    xRayNodes: state.ui?.xRayNodes
                }
            );
        });
        return result;
    }, [state.nodes, state.layers, state.ports, state.links, state.currentContext, state.ui?.xRayDown, state.ui?.xRayUp, state.ui?.xRayNodes, state.selectedIds, state.ui?.peekNodeId, state.ui?.transitionFromContext, state.isolatedIds, state.breadcrumbs]);

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
            // Если мы крутим колесико над панелью со скроллом (например, внутри узла или чата):
            const scrollable = e.target.closest('.overflow-y-auto');
            if (scrollable && scrollable.scrollHeight > scrollable.clientHeight) {
                const isScrollingUp = e.deltaY < 0;
                const isScrollingDown = e.deltaY > 0;
                const atTop = scrollable.scrollTop <= 0;
                const atBottom = Math.abs(scrollable.scrollTop + scrollable.clientHeight - scrollable.scrollHeight) <= 2;

                // Блокируем зум холста ТОЛЬКО если контейнер может прокрутиться дальше в направлении движения
                if ((isScrollingUp && !atTop) || (isScrollingDown && !atBottom)) {
                    return;
                }
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
            
            {/* Контекстная шапка навигации (Floating Scope Banner) вместо старых хлебных крошек */}
            <div className={`absolute top-4 transition-all duration-300 ${state.ui.libraryOpen ? 'left-[384px]' : 'left-20'} glass-panel rounded-xl px-3 py-1.5 flex items-center gap-3 z-40 text-xs border border-white/10 shadow-2xl backdrop-blur-md bg-slate-900/80`}>
                {/* Кнопки навигации по истории (Назад / Вперед) */}
                <div className="flex items-center gap-1">
                    <button
                        className={`p-1.5 rounded-lg transition-colors ${
                            (state.navHistory?.past?.length || 0) === 0
                                ? 'text-gray-600 cursor-not-allowed'
                                : 'text-gray-300 hover:text-white hover:bg-white/10'
                        }`}
                        onClick={(e) => { e.stopPropagation(); dispatch({ type: 'NAV_BACK' }); }}
                        disabled={!(state.navHistory?.past?.length)}
                        title="Назад по истории (Ctrl+[)"
                    >
                        <div className="icon-arrow-left text-xs"></div>
                    </button>
                    <button
                        className={`p-1.5 rounded-lg transition-colors ${
                            (state.navHistory?.future?.length || 0) === 0
                                ? 'text-gray-600 cursor-not-allowed'
                                : 'text-gray-300 hover:text-white hover:bg-white/10'
                        }`}
                        onClick={(e) => { e.stopPropagation(); dispatch({ type: 'NAV_FORWARD' }); }}
                        disabled={!(state.navHistory?.future?.length)}
                        title="Вперёд по истории (Ctrl+])"
                    >
                        <div className="icon-arrow-right text-xs"></div>
                    </button>
                </div>

                <span className="w-px h-4 bg-white/15"></span>

                {/* Интерактивный адресный путь (Windows Explorer style) */}
                <div className="flex items-center gap-1 text-xs">
                    {state.breadcrumbs.map((crumb, idx) => {
                        const isLast = idx === state.breadcrumbs.length - 1;
                        const isRoot = crumb.id === 'root';
                        return (
                            <React.Fragment key={crumb.id || idx}>
                                {idx > 0 && <span className="text-gray-500 font-bold px-0.5">❯</span>}
                                <button
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded transition-colors ${
                                        isLast
                                            ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30'
                                            : 'text-gray-300 hover:text-white hover:bg-white/10'
                                    }`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        dispatch({ type: 'NAVIGATE_TO', payload: idx });
                                    }}
                                    title={isLast ? 'Текущая открытая папка' : `Перейти в ${crumb.name || crumb.id}`}
                                >
                                    <div className={isRoot ? 'icon-house text-cyan-400' : 'icon-folder text-amber-400'}></div>
                                    <span>{crumb.name || (isRoot ? 'Главный холст' : crumb.id)}</span>
                                </button>
                            </React.Fragment>
                        );
                    })}

                    {state.currentContext !== 'root' && (
                        <button
                            className="btn btn-sm bg-white/5 hover:bg-white/15 text-gray-300 border border-white/10 rounded px-2 py-1 ml-2 font-medium transition-all flex items-center gap-1"
                            onClick={(e) => {
                                e.stopPropagation();
                                dispatch({ type: 'NAVIGATE_TO', payload: Math.max(0, state.breadcrumbs.length - 2) });
                            }}
                            title="Подняться на уровень выше (Esc)"
                        >
                            <div className="icon-arrow-up text-xs text-cyan-400"></div>
                            <span className="text-[11px]">Наверх (Esc)</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Миникарта (этап 4): правый нижний угол, под PropertyPanel */}
            <div className="absolute right-4 bottom-4 z-40 flex flex-col gap-2 items-end">
                <MiniMap />
            </div>

            <div 
                className="absolute origin-top-left"
                style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                    transition: (isPanning || isInteracting || !!state.pendingConnection) ? 'none' : 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)'
                }}
            >
                {/* Render ALL Layers */}
                {state.layers && Object.values(state.layers).map((layer, idx) => {
                    if (!layer || !layer.id) return null;
                    const vis = layerVisibility[layer.id];
                    if (!vis || !vis.visible) return null;

                    const isDimmed = vis.role === 'ancestor-ghost' || vis.role === 'transition';
                    const isHighlightedContext = vis.role === 'context';

                    return (
                        <div
                            key={layer.id || `layer-${idx}`}
                            className={`
                                ${isDimmed ? 'opacity-20 pointer-events-none grayscale blur-[2px]' : ''}
                                ${vis.role === 'xray-down' || vis.role === 'xray-up' ? 'pointer-events-auto' : ''}
                            `}
                            style={{
                                zIndex: isHighlightedContext ? 0 : (vis.zIndex || 2),
                                opacity: vis.opacity,
                                pointerEvents: vis.interactive ? 'auto' : 'none'
                            }}
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

                    const sNodeVis = nodeVisibility[sPort.nodeId];
                    const tNodeVis = nodeVisibility[tPort.nodeId];

                    const isLinkSelected = (state.selectedIds || []).includes(link.id) ||
                        (state.selectedIds || []).includes(sPort.id) ||
                        (state.selectedIds || []).includes(tPort.id) ||
                        (state.selectedIds || []).includes(sPort.nodeId) ||
                        (state.selectedIds || []).includes(tPort.nodeId);

                    // Isolation check
                    if (state.isolatedIds.length > 0) {
                        if (!state.isolatedIds.includes(sPort.nodeId) || !state.isolatedIds.includes(tPort.nodeId)) return null;
                    }

                    const isTheContextItself = link.id === state.currentContext;
                    const isBreadcrumbAncestor = (state.breadcrumbs || []).some(b => b && b.id === link.id);

                    const bothNodesVisible = sNodeVis && sNodeVis.visible && tNodeVis && tNodeVis.visible;

                    // Межуровневая связь отрисовывается ТОЛЬКО если на холсте одновременно видны ОБА её узла
                    // (или сама связь является контекстом/предком)
                    if (!bothNodesVisible && !isTheContextItself && !isBreadcrumbAncestor) {
                        return null;
                    }

                    const opacity = 1;
                    const pointerEvents = 'auto';

                    return (
                        <div key={link.id || `link-${idx}`} style={{ opacity, pointerEvents }}>
                            <Link data={link} />
                        </div>
                    );
                })}
                
                <PendingLink />

                {/* Render Nodes */}
                {Object.values(state.nodes || {}).map((node, idx) => {
                    if (!node || !node.id) return null;
                    const vis = nodeVisibility[node.id];
                    if (!vis || !vis.visible || node.hidden) return null;

                    const isDimmed = vis.role === 'ancestor-ghost' || vis.role === 'transition';
                    const isHighlightedContext = vis.role === 'context' || vis.role === 'port-parent' || vis.role === 'link-endpoint';
                    const isBreadcrumbAncestor = (state.breadcrumbs || []).some(b => b && b.id === node.id);

                    return (
                        <div 
                            key={node.id || `node-${idx}`} 
                            className={`
                                ${isDimmed && !isBreadcrumbAncestor ? 'opacity-20 pointer-events-none grayscale blur-[2px]' : ''}
                                ${isHighlightedContext ? 'shadow-[0_0_100px_rgba(0,122,255,0.15)] ring-4 ring-[var(--accent-blue)]/30 rounded-lg opacity-100 pointer-events-auto' : ''}
                                ${vis.role === 'xray-down' || vis.role === 'xray-up' ? 'opacity-100 pointer-events-auto shadow-md' : ''}
                                ${isBreadcrumbAncestor && !isHighlightedContext ? 'opacity-50 pointer-events-none ring-4 ring-[var(--accent-blue)] ring-opacity-50 rounded-lg' : ''}
                                ${vis.role === 'peek' ? 'opacity-100 pointer-events-none shadow-xl' : ''}
                                ${vis.role === 'peek-dimmed' ? 'opacity-25 grayscale' : ''}
                                ${vis.role === 'peek-source' ? 'ring-4 ring-[var(--accent-blue)]/60 rounded-lg' : ''}
                            `}
                            style={{ zIndex: vis.zIndex, opacity: vis.opacity, pointerEvents: vis.interactive ? 'auto' : 'none' }}
                        >
                            <Node data={node} isContextNode={isHighlightedContext || isBreadcrumbAncestor} isParentOfSelected={vis.isParentOfSelected} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}