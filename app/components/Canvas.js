// v14 (Фаза 4, заменяет прежний Canvas.js): мировой холст — окна (LaneWindow),
// связи между разными дорожками (CrossWindowLinkLayer, мировые координаты,
// без прокси-геометрии — см. Link.js), оверлей перетаскиваемых узлов поверх
// всех окон (DragOverlay, чтобы overflow-hidden тела дорожки не обрезал
// карточку при пересечении границы), панель утилит, плашки проектов.
//
// v14 (доп., см. HierarchyUtils.getPortHostOwnerId в hierarchy.js): связь
// межлановая (или межоконная) — если её порты сейчас показаны в РАЗНЫХ
// дорожках (по данным, не по владению). CrossWindowLinkLayer рисует ровно те
// связи, которые Link.js внутри Lane.js не рисует.
function CrossWindowLinkLayer() {
    const derived = useProjectSelector(React.useCallback((view) => {
        const H = window.HierarchyUtils;
        if (!H) return [];
        const links = view.links || {};
        const list = Array.isArray(links) ? links : Object.values(links);
        const out = [];
        list.forEach(l => {
            if (!l) return;
            const sOwner = H.getPortHostOwnerId(l.sourcePortId, view);
            const tOwner = H.getPortHostOwnerId(l.targetPortId, view);
            if (!sOwner || !tOwner || sOwner === tOwner) return;
            const p1 = H.getPortWorldPositionV14(l.sourcePortId, view);
            const p2 = H.getPortWorldPositionV14(l.targetPortId, view);
            if (!p1 || !p2) return;
            out.push({
                id: l.id, p1x: p1.x, p1y: p1.y, p2x: p2.x, p2y: p2.y,
                color: l.color || '#666666',
                selected: (view.selectedIds || []).includes(l.id),
                dashed: l.linkStyle === 'dashed'
            });
        });
        return out;
    }, []));
    const dispatch = useProjectDispatch();
    const projectId = React.useContext(ProjectContext);

    if (!derived.length) return null;
    return (
        <svg className="absolute top-0 left-0 pointer-events-none" style={{ width: '1px', height: '1px', overflow: 'visible' }}>
            {derived.map(l => {
                const d = `M ${l.p1x} ${l.p1y} L ${l.p2x} ${l.p2y}`;
                const select = (e) => {
                    e.stopPropagation();
                    const rootState = (typeof architectorStore !== 'undefined') ? architectorStore.getState() : null;
                    if (projectId && rootState && rootState.activeProjectId !== projectId) dispatch({ type: 'SET_ACTIVE_PROJECT', payload: projectId });
                    dispatch({ type: e.shiftKey ? 'TOGGLE_SELECTED' : 'SET_SELECTED', payload: l.id });
                };
                return (
                    <g key={l.id}>
                        <path d={d} fill="none" stroke="transparent" strokeWidth="15" className="pointer-events-auto cursor-pointer" onClick={select} />
                        <path d={d} fill="none" stroke={l.color} strokeWidth={l.selected ? 4.5 : 2.5}
                            strokeDasharray={l.dashed ? '5,5' : '3,6'} vectorEffect="non-scaling-stroke"
                            style={{ filter: l.selected ? `drop-shadow(0 0 8px ${l.color}AA)` : 'none' }} />
                    </g>
                );
            })}
        </svg>
    );
}

// Оверлей перетаскиваемых узлов: пока идёт Drag&Drop-жест (dragGesture.ids),
// перерисовывает эти узлы (и всю их ветку потомков — она едет визуально
// вместе, Deep-режим по умолчанию) НАД всеми окнами, в мировых координатах —
// иначе overflow-hidden тела дорожки (Lane.js) обрежет карточку в момент,
// когда она пересекает границу своей дорожки.
function DragOverlay() {
    const derived = useProjectSelector(React.useCallback((view) => {
        const ids = view.dragGesture && view.dragGesture.ids;
        if (!ids || !ids.length) return [];
        const H = window.HierarchyUtils;
        const nodes = view.nodes || {};
        const expanded = new Set(ids);
        Object.keys(nodes).forEach(id => {
            if (expanded.has(id)) return;
            if (ids.some(d => H.isDescendantOfV14(id, d, nodes))) expanded.add(id);
        });
        return Array.from(expanded).map(id => {
            const rect = H.nodeWorldRect(id, view);
            const pos = nodes[id] && nodes[id].position;
            return rect && pos ? { id, rect, pos } : null;
        }).filter(Boolean);
    }, []));

    if (!derived.length) return null;
    return (
        <div className="absolute top-0 left-0 pointer-events-none" style={{ zIndex: 200 }}>
            {derived.map(({ id, rect, pos }) => (
                <div key={id} className="absolute" style={{ left: rect.x - pos.x, top: rect.y - pos.y }}>
                    <NodeComponent nodeId={id} zoom={1} />
                </div>
            ))}
        </div>
    );
}

// v14 (Фаза 5, §5 плана; было в v13 — Фаза 6.1): кросс-проектные связи
// (state.crossProjectLinks) — глобальное поле, не принадлежит ни одному
// проекту, поэтому рисуется ОДИН раз поверх всех проектов (не внутри
// ProjectContext.Provider, как CrossWindowLinkLayer). Та же идея, что и
// CrossWindowLinkLayer: оба конца уже лежат в общем мировом пространстве
// (Canvas рисует окна всех проектов на одном холсте), так что достаточно
// прямой линии между HierarchyUtils.getPortWorldPositionV14 обеих сторон —
// никакой отдельной прокси-геометрии на грани окна не нужно.
function CrossProjectLinkLayer() {
    const { state, dispatch } = useStore();
    const HU = window.HierarchyUtils;
    const links = (HU && state && state.crossProjectLinks) ? Object.values(state.crossProjectLinks).filter(Boolean) : [];
    if (!links.length) return null;

    const derived = links.map(link => {
        const sProj = state.projects && state.projects[link.sourceProjectId];
        const tProj = state.projects && state.projects[link.targetProjectId];
        if (!sProj || !tProj) return null;
        if (HU.isProjectVisible && (!HU.isProjectVisible(link.sourceProjectId, state.containerIsolation, sProj.windows)
            || !HU.isProjectVisible(link.targetProjectId, state.containerIsolation, tProj.windows))) return null;

        const sView = getProjectFlatView(link.sourceProjectId);
        const tView = getProjectFlatView(link.targetProjectId);
        const p1 = HU.getPortWorldPositionV14(link.sourcePortId, sView);
        const p2 = HU.getPortWorldPositionV14(link.targetPortId, tView);
        if (!p1 || !p2) return null;

        const isSelected = (state.selectedIds || []).includes(link.id)
            || (state.selectedIds || []).includes(link.sourcePortId)
            || (state.selectedIds || []).includes(link.targetPortId);
        return { id: link.id, p1x: p1.x, p1y: p1.y, p2x: p2.x, p2y: p2.y, color: link.color || '#38bdf8', isSelected };
    }).filter(Boolean);

    if (!derived.length) return null;
    return (
        <svg className="absolute top-0 left-0 pointer-events-none" style={{ width: '1px', height: '1px', overflow: 'visible', zIndex: 35 }}>
            {derived.map(l => {
                const d = `M ${l.p1x} ${l.p1y} L ${l.p2x} ${l.p2y}`;
                return (
                    <g key={`cross-project-link-${l.id}`}>
                        <path d={d} fill="none" stroke="transparent" strokeWidth="16"
                            className="pointer-events-auto cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_SELECTED', payload: l.id }); }}
                            onDoubleClick={(e) => { e.stopPropagation(); dispatch({ type: 'FOCUS_CONNECTED_ELEMENTS', payload: { entityId: l.id } }); }}
                        />
                        <path d={d} fill="none" stroke={l.color} strokeWidth={l.isSelected ? '4.5' : '2.5'}
                            strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3,5"
                            vectorEffect="non-scaling-stroke" className="pointer-events-none"
                            style={{ filter: l.isSelected ? `drop-shadow(0 0 10px ${l.color})` : `drop-shadow(0 0 4px ${l.color}66)` }}
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
    const { offset, zoom } = state.canvas;
    const canvasRef = React.useRef(null);
    const [isPanning, setIsPanning] = React.useState(false);
    const [isInteracting, setIsInteracting] = React.useState(false);
    const wheelTimeoutRef = React.useRef(null);

    const cameraRef = React.useRef({ zoom, offset });
    cameraRef.current = { zoom, offset };

    React.useEffect(() => {
        const handleKeyDown = (e) => {
            const activeTag = document.activeElement?.tagName?.toLowerCase();
            if (activeTag === 'input' || activeTag === 'textarea') return;

            const { selectedIds, nodes, clipboard, past, future } = state;

            if (e.code === 'Delete' || e.code === 'Backspace') {
                if (selectedIds.length > 0) dispatch({ type: 'DELETE_SELECTED' });
            }

            if (e.code === 'Escape') {
                if (state.interactionMode !== 'default') {
                    dispatch({ type: 'SET_MODE', payload: 'default' });
                } else if (state.activeFrameId) {
                    dispatch({ type: 'SET_ACTIVE_FRAME', payload: null });
                } else if (selectedIds.length > 0) {
                    dispatch({ type: 'SET_SELECTED', payload: null });
                }
            }

            if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyC' || e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'с')) {
                e.preventDefault();
                const primaryId = selectedIds[0];
                if (primaryId && nodes[primaryId]) dispatch({ type: 'SET_CLIPBOARD', payload: nodes[primaryId] });
            }

            if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyV' || e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 'м')) {
                e.preventDefault();
                if (clipboard) {
                    const newId = 'node-' + Date.now() + Math.floor(Math.random() * 1000);
                    dispatch({
                        type: 'ADD_NODE',
                        payload: { ...clipboard, id: newId, name: `${clipboard.name} (Копия)`, position: { x: clipboard.position.x + 30, y: clipboard.position.y + 30 } }
                    });
                }
            }

            if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyZ' || e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'я') && !e.shiftKey) {
                e.preventDefault();
                if (past.length > 0) dispatch({ type: 'UNDO' });
            }

            if ((e.ctrlKey || e.metaKey) && (
                e.code === 'KeyY' || e.key.toLowerCase() === 'y' || e.key.toLowerCase() === 'н' ||
                ((e.code === 'KeyZ' || e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'я') && e.shiftKey)
            )) {
                e.preventDefault();
                if (future.length > 0) dispatch({ type: 'REDO' });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [state, dispatch]);

    React.useEffect(() => {
        const handleWheel = (e) => {
            const forceWorldZoom = e.ctrlKey || e.metaKey;

            if (!forceWorldZoom) {
                if (e.target.closest('.lane-window')) return;

                const scrollable = e.target.closest('.overflow-y-auto');
                if (scrollable && scrollable.scrollHeight > scrollable.clientHeight) {
                    const isScrollingUp = e.deltaY < 0;
                    const isScrollingDown = e.deltaY > 0;
                    const atTop = scrollable.scrollTop <= 0;
                    const atBottom = Math.abs(scrollable.scrollTop + scrollable.clientHeight - scrollable.scrollHeight) <= 2;
                    if ((isScrollingUp && !atTop) || (isScrollingDown && !atBottom)) return;
                }
            }

            e.preventDefault();
            setIsInteracting(true);
            if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
            wheelTimeoutRef.current = setTimeout(() => setIsInteracting(false), 150);

            const currentZoom = cameraRef.current.zoom;
            const currentOffset = cameraRef.current.offset;
            const delta = -e.deltaY * 0.001;
            let newZoom = Math.min(Math.max(0.1, currentZoom + delta), 5.0);

            if (canvasRef.current) {
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
        if (canvasEl) canvasEl.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            if (canvasEl) canvasEl.removeEventListener('wheel', handleWheel);
            if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
        };
    }, [dispatch]);

    const handleTouchStart = (e) => {
        if (e.target.closest('.lane-window')) return;
        if (e.target.id === 'canvas-container' || e.target.classList.contains('canvas-grid')) {
            if (e.touches.length === 1) {
                dispatch({ type: 'SET_SELECTED', payload: null });
                if (state.interactionMode === 'add-port') dispatch({ type: 'SET_MODE', payload: 'default' });

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
                        dispatch({ type: 'SET_CANVAS', payload: { offset: newOffset, zoom: cameraRef.current.zoom } });
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
                const getCenter = (touches) => ({ x: (touches[1].clientX + touches[0].clientX) / 2, y: (touches[1].clientY + touches[0].clientY) / 2 });

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
                        const newOffset = {
                            x: currentCenter.x - (startCenter.x - startOffset.x) * currentZoomRatio,
                            y: currentCenter.y - (startCenter.y - startOffset.y) * currentZoomRatio
                        };
                        cameraRef.current = { zoom: newZoom, offset: newOffset };
                        dispatch({ type: 'SET_CANVAS', payload: { zoom: newZoom, offset: newOffset } });
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
                dispatch({ type: 'SET_CANVAS', payload: { offset: newOffset, zoom: cameraRef.current.zoom } });
            };
            const handleMouseUp = () => {
                setIsPanning(false);
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return;
        }

        if (e.button === 0 && (e.target.id === 'canvas-container' || e.target.classList.contains('canvas-grid'))) {
            dispatch({ type: 'SET_SELECTED', payload: null });
            if (state.interactionMode === 'add-port') dispatch({ type: 'SET_MODE', payload: 'default' });
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
            <div className="fixed top-4 left-6 z-40 flex flex-col gap-2 items-start max-h-[calc(100vh-2rem)] overflow-y-auto no-scrollbar pr-1">
                {(state.projectOrder || []).map((pid) => {
                    const proj = state.projects && state.projects[pid];
                    if (!proj) return null;
                    const isActive = pid === state.activeProjectId;
                    const color = proj.projectColor || '#059669';
                    const projSelected = (state.selectedIds || []).includes(`project:${pid}`) || (isActive && (state.selectedIds || []).includes('project'));
                    return (
                        <React.Fragment key={pid}>
                            <div
                                className={`flex items-center gap-2.5 glass-panel bg-[#0d1017]/90 backdrop-blur-md rounded-xl px-3.5 py-2 shadow-2xl cursor-pointer transition-all hover:scale-[1.02] group ${isActive ? '' : 'opacity-75 hover:opacity-100'}`}
                                onClick={(e) => {
                                    if (e.shiftKey) { dispatch({ type: 'TOGGLE_SELECTED', payload: `project:${pid}` }); return; }
                                    if (!isActive) dispatch({ type: 'SET_ACTIVE_PROJECT', payload: pid });
                                    dispatch({ type: 'SET_SELECTED', payload: `project:${pid}` });
                                }}
                                title={isActive ? 'Свойства проекта (кликните для редактирования)' : `Проект «${proj.projectName || 'Без имени'}» — кликните, чтобы сделать активным`}
                                style={{
                                    border: projSelected ? `2px solid #f8fafc` : `1.5px solid ${color}`,
                                    boxShadow: isActive ? `0 0 20px ${color}66` : `0 0 8px ${color}22`
                                }}
                            >
                                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white border text-xs shrink-0 shadow-sm" style={{ backgroundColor: color, borderColor: 'rgba(255,255,255,0.3)' }}>🌐</div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-xs font-bold text-gray-100 group-hover:text-white truncate max-w-[180px]" style={{ fontFamily: proj.projectFontFamily || 'Inter, sans-serif' }}>
                                        {proj.projectName || 'Проект Архитектуры'}
                                    </span>
                                    <span className="text-[10px] text-gray-400 font-mono">
                                        Окон: {Object.keys(proj.windows || {}).length}{isActive ? ' · активный' : ''}
                                    </span>
                                </div>
                                <button
                                    className={`ml-1.5 w-6 h-6 rounded flex items-center justify-center transition-colors shrink-0 ${
                                        state.ui && state.ui.outlinerOpen && state.ui.outlinerOpen[pid] ? 'bg-[var(--accent-blue)] text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/10'
                                    }`}
                                    title={state.ui && state.ui.outlinerOpen && state.ui.outlinerOpen[pid] ? 'Закрыть обозреватель проекта' : 'Обозреватель проекта (Библиотека)'}
                                    onClick={(e) => { e.stopPropagation(); dispatch({ type: 'TOGGLE_PROJECT_OUTLINER', payload: pid }); }}
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

            {(!state.projectOrder || state.projectOrder.length === 0) && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <div className="glass-panel rounded-xl px-6 py-4 text-gray-400 text-sm border-[#444] shadow-2xl">
                        Проектов нет — наведите на кнопку «+» справа и выберите «Добавить проект»
                    </div>
                </div>
            )}

            <div className="fixed top-4 right-4 z-40 glass-panel bg-[#0d1017]/90 backdrop-blur-md rounded-xl p-1.5 shadow-2xl flex flex-col items-center gap-1 border border-white/10 select-none">
                <div className="px-1 py-0.5 text-center text-[10px] text-gray-400 font-mono" title="Масштаб холста">
                    {Math.round(state.canvas.zoom * 100)}%
                </div>
                <div className="w-5 h-px bg-white/10"></div>
                {(() => {
                    const dragMode = (state.ui && state.ui.dragDropMode) || false;
                    const isDragOn = !!dragMode;
                    const mainMode = dragMode || 'deep';
                    const altMode = mainMode === 'shallow' ? 'deep' : 'shallow';
                    const modeIconClass = (m) => `icon-move text-xs${m === 'shallow' ? ' rotate-45' : ''}`;
                    const modeLabel = (m) => (m === 'shallow'
                        ? 'Shallow («вырывание»: прямые дети остаются в прежней дорожке, усыновляются дедом)'
                        : 'Deep (обычный: вся ветка потомков едет вслед за узлом)');
                    return (
                        <div className="relative w-7 h-7 group">
                            <button
                                className="absolute top-0 right-7 w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-200 ease-out opacity-0 -translate-x-1 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto"
                                title={`Включить перенос: ${modeLabel(altMode)}`}
                                onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_UI', payload: { dragDropMode: altMode } }); }}
                            >
                                <div className={modeIconClass(altMode)}></div>
                            </button>
                            <button
                                className={`absolute top-0 right-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors ${isDragOn ? 'text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                                title={isDragOn ? `Drag&Drop включён: ${modeLabel(mainMode)}. Клик — выключить` : 'Включить Drag&Drop: перенос узла в другую дорожку/окно/проект (§6 LANES_MODEL.md)'}
                                onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_UI', payload: { dragDropMode: isDragOn ? false : 'deep' } }); }}
                            >
                                <div className={modeIconClass(mainMode)}></div>
                            </button>
                        </div>
                    );
                })()}
                <div className="w-5 h-px bg-white/10"></div>
                <button
                    className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                    title="Скопировать состояние проекта в нотации (§1 плана / §3 LANES_MODEL.md)"
                    onClick={(e) => {
                        e.stopPropagation();
                        const H = window.HierarchyUtils;
                        if (H && H.dumpNotation && navigator.clipboard) {
                            navigator.clipboard.writeText(H.dumpNotation(state)).catch(() => {});
                        }
                    }}
                >
                    <div className="icon-clipboard-copy text-xs"></div>
                </button>
            </div>

            <div
                className="absolute inset-0 canvas-grid"
                style={{
                    backgroundSize: `${30 * zoom}px ${30 * zoom}px`,
                    backgroundPosition: `${offset.x}px ${offset.y}px`,
                    opacity: 0.5,
                    transition: isPanning || isInteracting ? 'none' : 'background-position 0.05s linear'
                }}
            ></div>

            <div
                className="absolute origin-top-left"
                style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                    transition: isPanning || isInteracting ? 'none' : 'transform 0.05s linear'
                }}
            >
                {state.activeProjectId && (() => {
                    const HU = window.HierarchyUtils;
                    const ci = state.containerIsolation;
                    const visibleWinIds = Object.keys(state.windows || {}).filter(wid => HU.isWindowVisible(wid, state.activeProjectId, ci));
                    return (
                        <ProjectContext.Provider value={state.activeProjectId}>
                            {visibleWinIds.map(wid => (
                                <LaneWindow key={wid} windowId={wid} />
                            ))}
                            <CrossWindowLinkLayer />
                            <DragOverlay />
                        </ProjectContext.Provider>
                    );
                })()}

                {(() => {
                    const HU = window.HierarchyUtils;
                    const ci = state.containerIsolation;
                    return (state.projectOrder || []).filter(pid => pid !== state.activeProjectId).map(pid => {
                        const proj = state.projects && state.projects[pid];
                        if (!proj || !HU.isProjectVisible(pid, ci, proj.windows)) return null;
                        const visibleWinIds = Object.keys(proj.windows || {}).filter(wid => HU.isWindowVisible(wid, pid, ci));
                        return (
                            <ProjectContext.Provider key={'project-' + pid} value={pid}>
                                <div className="opacity-95">
                                    {visibleWinIds.map(wid => (
                                        <LaneWindow key={wid} windowId={wid} />
                                    ))}
                                    <CrossWindowLinkLayer />
                                    <DragOverlay />
                                </div>
                            </ProjectContext.Provider>
                        );
                    });
                })()}

                <CrossProjectLinkLayer />
                <PendingLink />
            </div>
        </div>
    );
}

if (typeof window !== 'undefined') window.Canvas = Canvas;
if (typeof module !== 'undefined') module.exports = Canvas;
