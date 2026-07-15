function Canvas() {
    const { state, dispatch } = useStore();
    const { offset, zoom } = state.canvas;
    const { nodes } = state.nodes;
    const canvasRef = React.useRef(null);
    const [isPanning, setIsPanning] = React.useState(false);
    const [isInteracting, setIsInteracting] = React.useState(false);
    const wheelTimeoutRef = React.useRef(null);
    
    const getContextDepth = React.useCallback((contextId) => {
        if (contextId === 'root') return 0;
        let depth = 0;
        let currentId = contextId;
        const visited = new Set();
        while (currentId && currentId !== 'root' && !visited.has(currentId)) {
            visited.add(currentId);
            if (state.layers && state.layers[currentId]) {
                currentId = state.layers[currentId].parentId || 'root';
            } else if (state.nodes[currentId]) {
                depth++;
                currentId = state.nodes[currentId].parentId || 'root';
            } else {
                break;
            }
        }
        return depth;
    }, [state.layers, state.nodes]);

    const getTrueParentNodeId = React.useCallback((entityId) => {
        if (!entityId || entityId === 'root') return 'root';
        let currentId = state.nodes[entityId]?.parentId || (state.layers && state.layers[entityId]?.parentId) || 'root';
        const visited = new Set();
        while (currentId && currentId !== 'root' && !visited.has(currentId)) {
            visited.add(currentId);
            if (state.nodes[currentId]) return currentId;
            if (state.layers && state.layers[currentId]) {
                currentId = state.layers[currentId].parentId || 'root';
            } else {
                break;
            }
        }
        return 'root';
    }, [state.nodes, state.layers]);

    // Используем Ref для актуального стейта камеры, чтобы не переподключать слушатель wheel каждый кадр
    const cameraRef = React.useRef({ zoom, offset });
    cameraRef.current = { zoom, offset };

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
                {state.breadcrumbs.map((crumb, index) => {
                    const isCurrent = index === state.breadcrumbs.length - 1;
                    
                    const isVisible = (state.ui.xRayLevels || []).includes(index);
                    
                    // Скрываем глаз для самого первого уровня (Root), если мы находимся прямо в нём
                    const showEye = !(isCurrent && index === 0);

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
                                    {isVisible && <span className="text-[10px] text-[var(--accent-blue)] opacity-80 ml-1">(X-Ray)</span>}
                                </button>
                                {showEye && (
                                    <button 
                                        className={`ml-1 p-0.5 rounded transition-colors ${isVisible ? 'text-[var(--accent-blue)] bg-[var(--accent-blue)]/10' : 'text-gray-500 hover:text-gray-300 hover:bg-white/10'}`}
                                        onClick={(e) => { 
                                            e.stopPropagation(); 
                                            dispatch({ type: 'TOGGLE_XRAY_LEVEL', payload: index }); 
                                        }}
                                        title={isVisible ? "Отключить X-Ray для этого уровня" : "Показать всех соседей этого уровня (Включить X-Ray)"}
                                    >
                                        <div className={`text-xs ${isVisible ? 'icon-eye' : 'icon-eye-off'}`}></div>
                                    </button>
                                )}
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Empty state: мы внутри узла, а в нём пусто */}
            {(() => {
                const contextNode = state.nodes[state.currentContext];
                if (!contextNode) return null;
                const hasChildren =
                    Object.values(state.nodes).some(n => n && n.parentId === state.currentContext) ||
                    (state.layers && Object.values(state.layers).some(l => l && l.parentId === state.currentContext));
                if (hasChildren) return null;
                return (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                        <div className="glass-panel rounded-xl px-8 py-6 text-center pointer-events-auto max-w-md shadow-2xl">
                            <div className="text-base text-white font-medium mb-2">Вы внутри узла «{contextNode.name}»</div>
                            <div className="text-sm text-gray-400 mb-4">Здесь пока пусто. Добавьте элементы или вернитесь на уровень выше.</div>
                            <div className="flex gap-2 justify-center">
                                <button className="btn" onClick={() => dispatch({ type: 'SET_LIBRARY_TAB', payload: 'objects' })}>
                                    Открыть библиотеку
                                </button>
                                <button className="btn" onClick={() => dispatch({ type: 'NAVIGATE_TO', payload: state.breadcrumbs.length - 2 })}>
                                    Наверх (Esc)
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Context specific backgrounds */}
            {state.links && state.links.find(l => l && l.id === state.currentContext) && (
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
                    transition: (isPanning || isInteracting) ? 'none' : 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)'
                }}
            >
                {/* Render ALL Layers */}
                {state.layers && Object.values(state.layers).map((layer, idx) => {
                    if (state.isolatedIds.length > 0 && !state.isolatedIds.includes(layer.id)) return null;

                    const effectiveContextId = layer.parentId || 'root';
                    const isCurrentChild = effectiveContextId === state.currentContext;
                    const isTheContextItself = layer.id === state.currentContext;
                    const isAncestorContext = state.breadcrumbs.some(b => b.id === effectiveContextId) && effectiveContextId !== state.currentContext;
                    const contextDepth = getContextDepth(effectiveContextId);
                    const isExplicitlyVisible = (state.ui.xRayLevels || []).includes(contextDepth);
                    const isBreadcrumbAncestor = state.breadcrumbs.some(b => b.id === layer.id) && !isTheContextItself;
                    const isPeekChild = !!state.ui.peekNodeId && effectiveContextId === state.ui.peekNodeId;

                    if (!isCurrentChild && !isTheContextItself && !isAncestorContext && !isExplicitlyVisible && !isBreadcrumbAncestor && !isPeekChild) return null;

                    const isDimmed = (isAncestorContext || isBreadcrumbAncestor) && !isTheContextItself && !isExplicitlyVisible && !isPeekChild;

                    return (
                        <div
                            key={layer.id || `layer-${idx}`}
                            className={`
                                ${isDimmed ? 'opacity-30 pointer-events-none grayscale' : ''}
                                ${isExplicitlyVisible && !isCurrentChild ? 'pointer-events-auto' : ''}
                                ${isBreadcrumbAncestor ? 'animate-pulse opacity-50 ring-2 ring-[var(--accent-blue)] rounded-xl' : ''}
                                ${isPeekChild ? 'opacity-100 pointer-events-none' : ''}
                            `}
                            style={{ zIndex: isPeekChild ? 30 : (isCurrentChild ? 5 : (isExplicitlyVisible ? 2 : (isBreadcrumbAncestor ? 1 : 0))) }}
                        >
                            <Layer data={layer} />
                        </div>
                    );
                })}

                {/* Render ALL Links but fade out non-current */}
                {state.links.map((link, idx) => {
                    // Check isolation
                    if (state.isolatedIds.length > 0) {
                        const sPort = state.ports[link.sourcePortId];
                        const tPort = state.ports[link.targetPortId];
                        if (!sPort || !tPort) return null;
                        const sNodeId = sPort.nodeId;
                        const tNodeId = tPort.nodeId;
                        // Show link only if both connected nodes are isolated
                        if (!state.isolatedIds.includes(sNodeId) || !state.isolatedIds.includes(tNodeId)) return null;
                    }

                    const sPort = state.ports[link.sourcePortId];
                    const tPort = state.ports[link.targetPortId];
                    const sNode = sPort ? state.nodes[sPort.nodeId] : null;
                    const tNode = tPort ? state.nodes[tPort.nodeId] : null;
                    
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
                    const isTheContextItself = link.id === state.currentContext;
                    const isAncestorContext = state.breadcrumbs.some(b => b.id === effectiveContextId) && effectiveContextId !== state.currentContext;
                    const contextDepth = getContextDepth(effectiveContextId);
                    const isExplicitlyVisible = (state.ui.xRayLevels || []).includes(contextDepth);
                    const isBreadcrumbAncestor = state.breadcrumbs.some(b => b.id === link.id) && !isTheContextItself;

                    if (isCrossLevel && !isExplicitlyVisible && sContext !== tContext && getContextDepth(sContext) === getContextDepth(tContext)) {
                        return null; // Разные контексты на одной глубине без X-Ray
                    }

                    const isPeekChildLink = !!state.ui.peekNodeId && effectiveContextId === state.ui.peekNodeId;

                    if (!isCurrentChild && !isTheContextItself && !isAncestorContext && !isExplicitlyVisible && !isBreadcrumbAncestor && !isPeekChildLink) return null;

                    const isDimmed = (isAncestorContext || isBreadcrumbAncestor) && !isTheContextItself && !isExplicitlyVisible && !isPeekChildLink;

                    return (
                        <div key={link.id || `link-${idx}`} className={`${isDimmed ? 'opacity-30 pointer-events-none grayscale' : ''} ${isExplicitlyVisible && !isCurrentChild ? 'pointer-events-auto opacity-100' : ''} ${isPeekChildLink ? 'opacity-100 pointer-events-none' : ''}`} style={{ zIndex: isPeekChildLink ? 30 : (isCurrentChild ? 10 : (isExplicitlyVisible ? 5 : 0)) }}>
                            <Link data={link} />
                        </div>
                    );
                })}
                
                <PendingLink />

                {/* Render ALL Nodes but fade out non-current */}
                {Object.values(state.nodes).map((node, idx) => {
                    if (!node) return null;
                    if (state.isolatedIds.length > 0 && !state.isolatedIds.includes(node.id)) return null;

                    // If a node is assigned to a layer, its effective context parent is the layer's parent context
                    const nodeParentLayer = state.layers && state.layers[node.parentId];
                    const effectiveContextId = nodeParentLayer ? (nodeParentLayer.parentId || 'root') : (node.parentId || 'root');

                    const isCurrentChild = effectiveContextId === state.currentContext;
                    const isTheContextItself = node.id === state.currentContext;
                    const isAncestorContext = state.breadcrumbs.some(b => b.id === effectiveContextId) && effectiveContextId !== state.currentContext;
                    const contextDepth = getContextDepth(effectiveContextId);
                    const isExplicitlyVisible = (state.ui.xRayLevels || []).includes(contextDepth);
                    const isBreadcrumbAncestor = state.breadcrumbs.some(b => b.id === node.id) && !isTheContextItself;
                    
                    // Always show the parent node of a port if we dive into a port
                    let isParentOfCurrentPort = false;
                    if (state.ports[state.currentContext]) {
                        const activePort = state.ports[state.currentContext];
                        if (activePort && activePort.nodeId === node.id) {
                            isParentOfCurrentPort = true;
                        }
                    }

                    // Show source and target nodes if we dive into a link
                    let isLinkSourceOrTarget = false;
                    const contextLink = state.links ? state.links.find(l => l && l.id === state.currentContext) : null;
                    if (contextLink) {
                        const sPort = state.ports[contextLink.sourcePortId];
                        const tPort = state.ports[contextLink.targetPortId];
                        if ((sPort && sPort.nodeId === node.id) || (tPort && tPort.nodeId === node.id)) {
                            isLinkSourceOrTarget = true;
                        }
                    }

                    // Alt+hover peek: дети peek-узла временно видимы в полный размер
                    const peekId = state.ui.peekNodeId;
                    const isPeekChild = !!peekId && effectiveContextId === peekId;
                    const isPeekSource = peekId === node.id;
                    const isPeekDimmed = !!peekId && !isPeekChild && !isPeekSource && isCurrentChild;

                    if (!isCurrentChild && !isTheContextItself && !isAncestorContext && !isParentOfCurrentPort && !isLinkSourceOrTarget && !isExplicitlyVisible && !isBreadcrumbAncestor && !isPeekChild) return null;
                    if (node.hidden) return null;
                    
                    // Проверяем, выделен ли хотя бы один из истинных детей этого узла
                    const hasSelectedChild = state.selectedIds.some(sid => (state.nodes[sid] || state.layers?.[sid]) && getTrueParentNodeId(sid) === node.id);
                    
                    // Проверяем, является ли узел "братом" выделенного (на том же уровне внутри того же родительского узла)
                    const isSelected = state.selectedIds.includes(node.id);
                    let isSiblingOfSelected = false;
                    if (!isSelected && state.selectedIds.length > 0) {
                        const myParent = getTrueParentNodeId(node.id);
                        if (myParent !== 'root') {
                            isSiblingOfSelected = state.selectedIds.some(sid => (state.nodes[sid] || state.layers?.[sid]) && getTrueParentNodeId(sid) === myParent);
                        }
                    }

                    // Если узел имеет выделенных детей, он не должен затухать
                    const isDimmed = (isAncestorContext || isBreadcrumbAncestor) && !isTheContextItself && !isParentOfCurrentPort && !isLinkSourceOrTarget && !isExplicitlyVisible && !hasSelectedChild;
                    const isHighlightedContext = isTheContextItself || isLinkSourceOrTarget || hasSelectedChild;
                    
                    // Узел пульсирует только если выделены его дочерние элементы
                    const isPulsing = hasSelectedChild;
                    
                    return (
                        <div 
                            key={node.id || `node-${idx}`} 
                            className={`
                                ${isDimmed && !isBreadcrumbAncestor ? 'opacity-20 pointer-events-none grayscale blur-[2px]' : ''}
                                ${isHighlightedContext && !isPulsing ? 'shadow-[0_0_100px_rgba(0,122,255,0.15)] ring-4 ring-[var(--accent-blue)]/50 rounded-lg opacity-100 pointer-events-auto' : ''}
                                ${isExplicitlyVisible && !isCurrentChild && !hasSelectedChild ? 'opacity-100 pointer-events-auto shadow-md' : ''}
                                ${isBreadcrumbAncestor && !isPulsing && !isHighlightedContext ? 'opacity-50 pointer-events-none ring-4 ring-[var(--accent-blue)] ring-opacity-50 rounded-lg' : ''}
                                ${isPulsing ? 'ring-4 ring-[var(--accent-blue)] ring-opacity-80 rounded-lg animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite] opacity-100 pointer-events-auto shadow-xl' : ''}
                                ${isPeekChild ? 'opacity-100 pointer-events-none shadow-xl' : ''}
                                ${isPeekDimmed ? 'opacity-25 grayscale' : ''}
                                ${isPeekSource ? 'ring-4 ring-[var(--accent-blue)]/60 rounded-lg' : ''}
                            `}
                            style={{ zIndex: isPeekChild ? 30 : (isPulsing ? 20 : (isCurrentChild ? 10 : (hasSelectedChild ? 15 : (isExplicitlyVisible ? 5 : (isHighlightedContext ? 2 : (isBreadcrumbAncestor ? 1 : 1)))))) }}
                        >
                            <Node data={node} isContextNode={isHighlightedContext || isBreadcrumbAncestor || isPulsing} isSiblingOfSelected={isSiblingOfSelected} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}