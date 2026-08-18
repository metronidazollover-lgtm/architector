function Node({ data, isContextNode, isParentOfSelected }) {
    const { state, dispatch } = useStore();
    const [isXRayHovered, setIsXRayHovered] = React.useState(false);

    const isConnectedToSelectedLink = React.useMemo(() => {
        return Object.values(state.links || {}).some(l => {
            if (!l || !state.selectedIds.includes(l.id)) return false;
            const sPort = state.ports[l.sourcePortId];
            const tPort = state.ports[l.targetPortId];
            return (sPort && sPort.nodeId === data.id) || (tPort && tPort.nodeId === data.id);
        });
    }, [state.links, state.selectedIds, state.ports, data.id]);

    const isConnectedToSelectedPort = React.useMemo(() => {
        const ownsSelectedPort = state.selectedIds.some(sid => state.ports[sid] && state.ports[sid].nodeId === data.id);
        if (ownsSelectedPort) return true;

        return Object.values(state.links || {}).some(l => {
            if (!l) return false;
            const sPort = state.ports[l.sourcePortId];
            const tPort = state.ports[l.targetPortId];
            if (!sPort || !tPort) return false;
            if (state.selectedIds.includes(sPort.id) && tPort.nodeId === data.id) return true;
            if (state.selectedIds.includes(tPort.id) && sPort.nodeId === data.id) return true;
            return false;
        });
    }, [state.links, state.selectedIds, state.ports, data.id]);

    const isConnectedToSelectedNode = React.useMemo(() => {
        return Object.values(state.links || {}).some(l => {
            if (!l) return false;
            const sPort = state.ports[l.sourcePortId];
            const tPort = state.ports[l.targetPortId];
            if (!sPort || !tPort) return false;
            if (state.selectedIds.includes(sPort.nodeId) && tPort.nodeId === data.id) return true;
            if (state.selectedIds.includes(tPort.nodeId) && sPort.nodeId === data.id) return true;
            return false;
        });
    }, [state.links, state.selectedIds, state.ports, data.id]);

    const isExplicitlySelected = state.selectedIds.includes(data.id);
    const isSelected = isExplicitlySelected || isConnectedToSelectedLink || isConnectedToSelectedPort || isConnectedToSelectedNode;

    const { zoom } = state.canvas;





    const childrenStats = React.useMemo(
        () => window.HierarchyUtils.getChildrenStats(state.nodes, state.layers, state.ports, state.links, data.id),
        [state.nodes, state.layers, state.ports, state.links, data.id]
    );

    // v10: position относительна родителю, на экран идут мировые координаты
    const absPos = window.HierarchyUtils.getAbsolutePosition(data.id, state.nodes, state.layers);

    // Alt+hover peek: начинка этого узла показывается в полный размер (Canvas)
    const isPeeked = state.ui.peekNodeId === data.id;

    // Semantic zoom disabled: always show normal content instead of nested preview
    const showPreview = false;

    const handlePeekMove = (e) => {
        if (e.altKey && childrenStats.total > 0 && state.ui.peekNodeId !== data.id) {
            dispatch({ type: 'SET_UI', payload: { peekNodeId: data.id } });
        } else if (!e.altKey && isPeeked) {
            dispatch({ type: 'SET_UI', payload: { peekNodeId: null } });
        }
    };

    const handlePeekLeave = () => {
        if (isPeeked) dispatch({ type: 'SET_UI', payload: { peekNodeId: null } });
    };

    const [showToolbar, setShowToolbar] = React.useState(false);

    React.useEffect(() => {
        if (!isExplicitlySelected) {
            setShowToolbar(false);
            setActivePopover(null);
        }
    }, [isExplicitlySelected]);

    const handleMouseDown = (e) => {
        // Разрешаем панорамирование колесиком (1) на любом узле
        if (e.button === 1) return;

        e.stopPropagation();
        if (e.button !== 0) return; // Only left click

        const startX = e.clientX;
        const startY = e.clientY;

        let hasMoved = false;
        const initialSnapshot = { layers: state.layers, nodes: state.nodes, ports: state.ports, links: state.links };

        let cumulativeDx = 0;
        let cumulativeDy = 0;

        const handleMouseMove = (moveEvent) => {
            const distMoved = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
            if (distMoved > 3) {
                if (!hasMoved) {
                    hasMoved = true;
                    // При начале перетаскивания скрываем панель
                    setShowToolbar(false);
                    setActivePopover(null);
                    if (!isExplicitlySelected) {
                        dispatch({ type: 'SET_SELECTED', payload: data.id });
                    }
                }
            }

            if (!hasMoved) return;

            const totalDx = (moveEvent.clientX - startX) / zoom;
            const totalDy = (moveEvent.clientY - startY) / zoom;

            let stepDx = totalDx - cumulativeDx;
            let stepDy = totalDy - cumulativeDy;

            if (data.snapToGrid) {
                const step = 30; // Grid size
                const targetX = initialSnapshot.nodes[data.id].position.x + totalDx;
                const targetY = initialSnapshot.nodes[data.id].position.y + totalDy;
                const newX = Math.round(targetX / step) * step;
                const newY = Math.round(targetY / step) * step;
                
                stepDx = newX - (initialSnapshot.nodes[data.id].position.x + cumulativeDx);
                stepDy = newY - (initialSnapshot.nodes[data.id].position.y + cumulativeDy);
            }

            if (stepDx !== 0 || stepDy !== 0) {
                cumulativeDx += stepDx;
                cumulativeDy += stepDy;
                dispatch({
                    type: 'MOVE_SELECTED',
                    payload: { dx: stepDx, dy: stepDy, skipHistory: true }
                });
            }
        };

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);

            if (hasMoved) {
                // Было перетаскивание: фиксируем историю, панель НЕ открываем
                setShowToolbar(false);
                dispatch({
                    type: 'COMMIT_HISTORY',
                    payload: { snapshot: initialSnapshot, logMessage: `Перемещен узел: ${data.name}` }
                });
            } else {
                // Одиночный клик (нажали и отпустили без сдвига)
                if (e.shiftKey) {
                    dispatch({ type: 'TOGGLE_SELECTED', payload: data.id });
                } else {
                    if (!isExplicitlySelected) {
                        dispatch({ type: 'SET_SELECTED', payload: data.id });
                    }
                    setShowToolbar(true);
                }
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleDoubleClick = (e) => {
        e.stopPropagation();
        dispatch({ type: 'DIVE_INTO', payload: { id: data.id, name: data.name } });
    };

    const handleResizeMouseDown = (e) => {
        e.stopPropagation();
        e.preventDefault();
        dispatch({ type: 'SET_SELECTED', payload: data.id });

        const startX = e.clientX;
        const startY = e.clientY;
        const startW = data.size?.w || 200;
        const startH = data.size?.h || 100;
        
        let hasMoved = false;
        const initialSnapshot = { nodes: state.nodes, ports: state.ports, links: state.links };

        const handleMouseMove = (moveEvent) => {
            hasMoved = true;
            const dx = (moveEvent.clientX - startX) / zoom;
            const dy = (moveEvent.clientY - startY) / zoom;
            
            const newW = Math.max(100, startW + dx);
            const newH = Math.max(80, startH + dy);

            dispatch({
                type: 'UPDATE_NODE',
                payload: {
                    id: data.id,
                    updates: { size: { w: newW, h: newH }, userResized: true },
                    skipHistory: true
                }
            });
        };

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            if (hasMoved) {
                dispatch({
                    type: 'COMMIT_HISTORY',
                    payload: { snapshot: initialSnapshot, logMessage: `Изменен размер узла: ${data.name}` }
                });
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleImageLoad = (e) => {
        const { naturalWidth, naturalHeight } = e.target;
        if (naturalWidth && naturalHeight && !data.mediaHeight) {
            const targetW = Math.max(200, Math.min(naturalWidth, 400));
            const targetH = Math.round(targetW * (naturalHeight / naturalWidth));
            dispatch({
                type: 'UPDATE_NODE',
                payload: {
                    id: data.id,
                    updates: { mediaHeight: targetH },
                    skipHistory: true
                }
            });
        }
    };

    const [isNodeHovered, setIsNodeHovered] = React.useState(false);
    const [isEditingName, setIsEditingName] = React.useState(false);
    const [tempName, setTempName] = React.useState(data.name || '');
    const nameInitialSnapshotRef = React.useRef(null);
    const nameInitialValueRef = React.useRef('');
    const nameTextareaRef = React.useRef(null);
    const [isEditingContent, setIsEditingContent] = React.useState(false);
    const [tempContent, setTempContent] = React.useState(data.content || '');
    const contentInitialSnapshotRef = React.useRef(null);
    const contentInitialValueRef = React.useRef('');
    const contentTextareaRef = React.useRef(null);
    const [activePopover, setActivePopover] = React.useState(null); // 'color' | 'media' | 'layer' | 'group' | 'icon' | null
    const [copiedId, setCopiedId] = React.useState(false);
    const toolbarRef = React.useRef(null);

    React.useLayoutEffect(() => {
        if (isEditingName && nameTextareaRef.current) {
            nameTextareaRef.current.style.height = 'auto';
            nameTextareaRef.current.style.height = `${nameTextareaRef.current.scrollHeight}px`;
        }
    }, [isEditingName, tempName]);

    React.useLayoutEffect(() => {
        if (isEditingContent && contentTextareaRef.current) {
            contentTextareaRef.current.style.height = 'auto';
            contentTextareaRef.current.style.height = `${contentTextareaRef.current.scrollHeight}px`;
        }
    }, [isEditingContent, tempContent]);

    React.useEffect(() => {
        setTempName(data.name || '');
    }, [data.name]);

    React.useEffect(() => {
        setTempContent(data.content || '');
    }, [data.content]);

    // Закрытие всплывающих поповеров при клике вне тулбара
    React.useEffect(() => {
        if (!activePopover) return;
        const handleOutsideClick = (e) => {
            if (toolbarRef.current && !toolbarRef.current.contains(e.target)) {
                setActivePopover(null);
            }
        };
        window.addEventListener('mousedown', handleOutsideClick);
        return () => window.removeEventListener('mousedown', handleOutsideClick);
    }, [activePopover]);

    const handleCopyId = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(data.id);
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 1500);
    };

    const handleUpdateField = (field, value) => {
        dispatch({
            type: 'UPDATE_NODE',
            payload: { id: data.id, updates: { [field]: value } }
        });
    };

    const handleLayerChange = (targetLayerId) => {
        if (targetLayerId !== 'root' && state.layers && state.layers[targetLayerId]) {
            const targetLayer = state.layers[targetLayerId];
            const { updatesById, newLayerSize } = window.GeometryUtils.getSmartPlacement(
                [data], targetLayer, state.nodes
            );
            dispatch({ type: 'UPDATE_LAYER', payload: { id: targetLayerId, updates: { size: newLayerSize } } });
            dispatch({ type: 'UPDATE_NODE', payload: {
                id: data.id,
                updates: updatesById[data.id] || { parentId: targetLayerId, position: { x: 40, y: 90 } }
            }});
        } else {
            dispatch({ type: 'REPARENT_ENTITY', payload: { id: data.id, newParentId: 'root' } });
        }
        setActivePopover(null);
    };

    const isAIAgent = data.type === 'ai-agent';

    const COLOR_PRESETS = [
        '#1a1a1a', '#0f172a', '#1e293b', '#14532d', 
        '#064e3b', '#1e3a8a', '#312e81', '#581c87', 
        '#701a75', '#7f1d1d', '#78350f', '#134e4a',
        '#27272a', '#3f3f46'
    ];

    const ICON_PRESETS = [
        { id: '', label: 'Без значка', icon: null },
        { id: 'icon-box', label: 'Куб', icon: 'icon-box' },
        { id: 'icon-folder', label: 'Папка', icon: 'icon-folder' },
        { id: 'icon-database', label: 'БД', icon: 'icon-database' },
        { id: 'icon-server', label: 'Сервер', icon: 'icon-server' },
        { id: 'icon-cpu', label: 'Процессор', icon: 'icon-cpu' },
        { id: 'icon-globe', label: 'Сеть', icon: 'icon-globe' },
        { id: 'icon-layers', label: 'Слой', icon: 'icon-layers' },
        { id: 'icon-file', label: 'Файл', icon: 'icon-file' },
        { id: 'icon-code', label: 'Код', icon: 'icon-code' },
        { id: 'icon-bot', label: 'ИИ Бот', icon: 'icon-bot' },
        { id: 'icon-shield', label: 'Защита', icon: 'icon-shield' },
        { id: 'icon-zap', label: 'Событие', icon: 'icon-zap' },
        { id: 'icon-tag', label: 'Тег', icon: 'icon-tag' },
        { id: 'icon-bookmark', label: 'Закладка', icon: 'icon-bookmark' },
        { id: 'icon-cloud', label: 'Облако', icon: 'icon-cloud' },
        { id: 'icon-lock', label: 'Замок', icon: 'icon-lock' },
        { id: 'icon-activity', label: 'Пульс', icon: 'icon-activity' },
        { id: 'icon-settings', label: 'Опции', icon: 'icon-settings' }
    ];

    const EMOJI_PRESETS = ['📦', '📁', '🗄️', '🖥️', '⚡', '🌐', '📚', '📄', '💻', '🤖', '🛡️', '⚙️', '🎯', '🚀', '💡', '🏷️', '🔗', '🔔', '⭐', '📌'];

    return (
        <div
            className={`absolute flex flex-col cursor-move transition-all duration-200 glass-panel rounded-lg border
                ${isSelected ? 'outline outline-[2px] outline-offset-[4px] z-30 shadow-lg' : 'border-[#333] shadow-lg'}
                ${isParentOfSelected ? 'animate-parent-pulse' : ''}
            `}
            style={{
                left: absPos.x,
                top: absPos.y,
                width: data.size?.w || 200,
                height: data.size?.h || 100,
                backgroundColor: data.color || 'rgba(26,26,26,0.9)',
                borderColor: isSelected ? (data.color || '#007AFF') : '#333',
                outlineColor: isSelected ? (data.color || '#007AFF') : 'transparent',
                ...(isSelected ? {
                    boxShadow: `0 0 40px ${data.color || '#007AFF'}`
                } : {}),
                '--parent-pulse-color': data.color || '#007AFF'
            }}
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
            onMouseEnter={() => setIsNodeHovered(true)}
            onMouseLeave={() => {
                setIsNodeHovered(false);
                handlePeekLeave();
            }}
            onMouseMove={handlePeekMove}
            data-file="components/Node.js"
        >
            {/* Шапка узла с инлайн-редактированием имени */}
            <div 
                className="px-3 py-2 border-b border-[#333] bg-black/20 rounded-t-lg flex items-start justify-between text-sm font-medium z-10 shrink-0 gap-2"
                style={{ fontFamily: data.fontFamily || 'inherit', fontSize: data.fontSize ? `${data.fontSize}px` : undefined }}
            >
                <div className="flex items-start gap-2 text-[#eee] flex-1 min-w-0">
                    {data.icon && (
                        data.icon.startsWith('icon-') ? (
                            <div className={`${data.icon} w-4 h-4 text-amber-400 shrink-0 mt-0.5`}></div>
                        ) : (
                            <span className="text-xs shrink-0 mt-0.5">{data.icon}</span>
                        )
                    )}
                    {isEditingName ? (
                        <textarea
                            ref={nameTextareaRef}
                            value={tempName}
                            rows={1}
                            autoFocus
                            className="bg-black/90 text-white px-1.5 py-0.5 rounded border border-[var(--accent-blue)] text-sm font-medium w-full outline-none resize-none font-sans break-all whitespace-pre-wrap leading-snug custom-scrollbar overflow-hidden"
                            style={{ minHeight: '26px', fontFamily: data.fontFamily || 'inherit', fontSize: data.fontSize ? `${data.fontSize}px` : undefined }}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onChange={(e) => {
                                const nextName = e.target.value;
                                setTempName(nextName);
                                dispatch({
                                    type: 'UPDATE_NODE',
                                    payload: {
                                        id: data.id,
                                        updates: { name: nextName },
                                        skipHistory: true
                                    }
                                });
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    setIsEditingName(false);
                                    if (tempName.trim() !== nameInitialValueRef.current && nameInitialSnapshotRef.current) {
                                        dispatch({
                                            type: 'COMMIT_HISTORY',
                                            payload: {
                                                snapshot: nameInitialSnapshotRef.current,
                                                logMessage: `Изменено имя узла: ${tempName.trim() || data.id}`
                                            }
                                        });
                                    }
                                } else if (e.key === 'Escape') {
                                    const prev = nameInitialValueRef.current;
                                    setTempName(prev);
                                    dispatch({
                                        type: 'UPDATE_NODE',
                                        payload: {
                                            id: data.id,
                                            updates: { name: prev },
                                            skipHistory: true
                                        }
                                    });
                                    setIsEditingName(false);
                                }
                            }}
                            onBlur={() => {
                                setIsEditingName(false);
                                if (tempName.trim() !== nameInitialValueRef.current && nameInitialSnapshotRef.current) {
                                    dispatch({
                                        type: 'COMMIT_HISTORY',
                                        payload: {
                                            snapshot: nameInitialSnapshotRef.current,
                                            logMessage: `Изменено имя узла: ${tempName.trim() || data.id}`
                                        }
                                    });
                                }
                            }}
                        />
                    ) : (
                        <span 
                            className="break-all whitespace-pre-wrap leading-snug cursor-text hover:text-white hover:underline transition-colors select-none font-medium flex-1"
                            style={{ fontFamily: data.fontFamily || 'inherit', fontSize: data.fontSize ? `${data.fontSize}px` : undefined }}
                            title="Кликните, чтобы переименовать узел"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!isEditingName) {
                                    nameInitialSnapshotRef.current = { nodes: state.nodes, layers: state.layers, ports: state.ports, links: state.links };
                                    nameInitialValueRef.current = data.name || '';
                                    setIsEditingName(true);
                                }
                            }}
                            onDoubleClick={(e) => e.stopPropagation()}
                        >
                            {data.name}
                        </span>
                    )}
                </div>

                {/* X-Ray / Folders Badge */}
                {childrenStats.total > 0 && (() => {
                    const H = window.HierarchyUtils;
                    const maxDepths = H ? H.getMaxRelativeDepths(data.id, state.nodes, state.layers, state.ports, state.links) : { maxDown: 10, maxUp: 10 };
                    const nodeXRay = state.ui?.xRayNodes?.[data.id];
                    const effective = H && H.getEffectiveNodeXRay 
                        ? H.getEffectiveNodeXRay(data.id, state.currentContext, state.ui?.xRayDown || 0, state.ui?.xRayUp || 0, state.nodes, state.layers, state.ports, state.links, state.ui?.xRayNodes)
                        : { down: (typeof nodeXRay?.down === 'number' ? nodeXRay.down : (state.ui?.xRayDown || 0)), up: (typeof nodeXRay?.up === 'number' ? nodeXRay.up : (state.ui?.xRayUp || 0)), isOwn: typeof nodeXRay?.down === 'number' };
                    
                    const currentDown = effective.down;
                    const currentUp = effective.up;
                    const maxUp = maxDepths.maxUp;
                    const maxDown = maxDepths.maxDown;
                    const isXRayActive = currentDown > 0 || currentUp > 0;

                    return (
                        <div 
                            className="relative flex items-center shrink-0 z-20 transition-all duration-200"
                            onMouseEnter={() => setIsXRayHovered(true)}
                            onMouseLeave={() => setIsXRayHovered(false)}
                            onMouseDown={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => e.stopPropagation()}
                        >
                            {/* Стрелочка ВВЕРХ (X-Ray Up / предки) слева */}
                            <button
                                className={`flex items-center justify-center rounded text-[10px] font-bold transition-all duration-200 cursor-pointer overflow-hidden ${
                                    isXRayHovered 
                                        ? 'w-5 h-5 opacity-100 scale-100 mr-1 border' 
                                        : 'w-0 h-5 opacity-0 scale-75 mr-0 border-0 pointer-events-none'
                                } ${
                                    currentUp > 0 
                                        ? 'bg-amber-500/30 text-amber-300 border-amber-500/60 shadow-[0_0_8px_rgba(245,158,11,0.4)]' 
                                        : 'bg-black/50 text-gray-300 border-white/10 hover:bg-amber-500/30 hover:text-amber-300'
                                } ${maxUp === 0 ? 'pointer-events-none opacity-30' : ''}`}
                                disabled={maxUp === 0}
                                title={maxUp === 0 ? 'Нет внешних уровней предков' : `X-Ray Наверх (предки): ${currentUp}/${maxUp}. Клик — просветить предков`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const nextUp = (currentUp + 1) > maxUp ? 0 : currentUp + 1;
                                    dispatch({ type: 'SET_NODE_XRAY_UP', payload: { nodeId: data.id, up: nextUp } });
                                }}
                            >
                                ↑
                            </button>

                            {/* Главная кнопка папки (DIVE INTO) по центру */}
                            <button
                                className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold transition-all duration-150 shrink-0 cursor-pointer ${
                                    isXRayActive
                                        ? 'bg-amber-500/30 text-amber-200 border-amber-500/60 shadow-[0_0_10px_rgba(245,158,11,0.4)]'
                                        : 'bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500 hover:text-white'
                                }`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    dispatch({ type: 'DIVE_INTO', payload: { id: data.id, name: data.name } });
                                }}
                                title={`Папка с объектами (${childrenStats.nodeCount} узл, ${childrenStats.layerCount} сл). Клик — открыть папку`}
                            >
                                <div className="icon-folder text-xs"></div>
                                <span>{childrenStats.total}</span>
                            </button>

                            {/* Стрелочка ВНИЗ (X-Ray Down / потомки) справа */}
                            <button
                                className={`flex items-center justify-center rounded text-[10px] font-bold transition-all duration-200 cursor-pointer overflow-hidden ${
                                    isXRayHovered 
                                        ? 'w-5 h-5 opacity-100 scale-100 ml-1 border' 
                                        : 'w-0 h-5 opacity-0 scale-75 ml-0 border-0 pointer-events-none'
                                } ${
                                    currentDown > 0 
                                        ? 'bg-[var(--accent-blue)]/30 text-[var(--accent-blue)] border-[var(--accent-blue)]/60 shadow-[0_0_8px_rgba(56,189,248,0.4)]' 
                                        : 'bg-black/50 text-gray-300 border-white/10 hover:bg-[var(--accent-blue)]/30 hover:text-[var(--accent-blue)]'
                                } ${maxDown === 0 ? 'pointer-events-none opacity-30' : ''}`}
                                disabled={maxDown === 0}
                                title={maxDown === 0 ? 'Нет вложенных уровней потомков' : `X-Ray Вглубь (потомки): ${currentDown}/${maxDown}. Клик — просветить потомков`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    let nextDown;
                                    if (effective.isOwn && nodeXRay?.down === 0) {
                                        nextDown = 1;
                                    } else if (!effective.isOwn && currentDown > 0) {
                                        nextDown = 0;
                                    } else if (currentDown >= maxDown) {
                                        nextDown = 0;
                                    } else {
                                        nextDown = currentDown + 1;
                                    }
                                    dispatch({ type: 'SET_NODE_XRAY_DOWN', payload: { nodeId: data.id, down: nextDown } });
                                }}
                            >
                                ↓
                            </button>
                        </div>
                    );
                })()}
            </div>

            {/* Встроенная мини-панель инструментов (Quick Action Strip) - отображается только при явном одиночном клике */}
            {showToolbar && isExplicitlySelected && (
                <div 
                    ref={toolbarRef}
                    className="relative px-2 py-1 bg-black/60 border-b border-[#333]/70 flex items-center justify-between text-xs z-20 transition-all duration-150"
                    onMouseDown={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                        {/* 1. Цвет узла */}
                        <button
                            className={`p-1 rounded hover:bg-white/10 transition-colors flex items-center justify-center ${
                                activePopover === 'color' ? 'bg-white/20 text-[var(--accent-blue)]' : 'text-gray-300'
                            }`}
                            title="Цвет узла"
                            onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}
                        >
                            <div className="w-3.5 h-3.5 rounded-full border border-white/40" style={{ backgroundColor: data.color || '#1a1a1a' }}></div>
                        </button>

                        {/* 2. Медиа URL */}
                        <button
                            className={`p-1 rounded hover:bg-white/10 transition-colors flex items-center justify-center ${
                                activePopover === 'media' ? 'bg-white/20 text-[var(--accent-blue)]' : (data.mediaUrl ? 'text-[var(--accent-blue)]' : 'text-gray-300')
                            }`}
                            title="Прикрепить изображение"
                            onClick={() => setActivePopover(activePopover === 'media' ? null : 'media')}
                        >
                            <div className="icon-image text-xs"></div>
                        </button>

                        {/* 3. Слой */}
                        <button
                            className={`p-1 rounded hover:bg-white/10 transition-colors flex items-center justify-center ${
                                activePopover === 'layer' ? 'bg-white/20 text-[var(--accent-blue)]' : (data.parentId && data.parentId !== 'root' ? 'text-amber-400' : 'text-gray-300')
                            }`}
                            title="Назначить на слой"
                            onClick={() => setActivePopover(activePopover === 'layer' ? null : 'layer')}
                        >
                            <div className="icon-layers text-xs"></div>
                        </button>

                        {/* 4. Группа */}
                        <button
                            className={`p-1 rounded hover:bg-white/10 transition-colors flex items-center justify-center ${
                                activePopover === 'group' ? 'bg-white/20 text-[var(--accent-blue)]' : (data.group ? 'text-purple-400' : 'text-gray-300')
                            }`}
                            title={data.group ? `Группа: ${data.group}` : 'Назначить группу'}
                            onClick={() => setActivePopover(activePopover === 'group' ? null : 'group')}
                        >
                            <div className="icon-tag text-xs"></div>
                        </button>

                        {/* 5. Привязка к сетке */}
                        <button
                            className={`p-1 rounded hover:bg-white/10 transition-colors flex items-center justify-center ${
                                data.snapToGrid ? 'text-[var(--accent-blue)]' : 'text-gray-500'
                            }`}
                            title={data.snapToGrid ? 'Привязка к сетке: Вкл' : 'Привязка к сетке: Выкл'}
                            onClick={() => handleUpdateField('snapToGrid', !data.snapToGrid)}
                        >
                            <div className="icon-layout-grid text-xs"></div>
                        </button>

                        {/* 6. Значок узла */}
                        <button
                            className={`p-1 rounded hover:bg-white/10 transition-colors flex items-center justify-center ${
                                activePopover === 'icon' ? 'bg-white/20 text-[var(--accent-blue)]' : (data.icon ? 'text-amber-400' : 'text-gray-300')
                            }`}
                            title="Выбрать значок узла"
                            onClick={() => setActivePopover(activePopover === 'icon' ? null : 'icon')}
                        >
                            <div className="icon-smile text-xs"></div>
                        </button>

                        {/* 7. Копировать ID */}
                        <button
                            className={`p-1 rounded hover:bg-white/10 transition-colors flex items-center justify-center ${
                                copiedId ? 'text-green-400' : 'text-gray-300'
                            }`}
                            title={copiedId ? 'ID скопирован!' : `Копировать ID: ${data.id}`}
                            onClick={handleCopyId}
                        >
                            <div className={`text-xs ${copiedId ? 'icon-check text-green-400' : 'icon-copy'}`}></div>
                        </button>
                    </div>

                    {/* 8. Удалить узел */}
                    <button
                        className="p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors flex items-center justify-center shrink-0"
                        title="Удалить узел"
                        onClick={() => {
                            if (window.confirm(`Удалить узел "${data.name}"?`)) {
                                dispatch({ type: 'REMOVE_NODE', payload: data.id });
                            }
                        }}
                    >
                        <div className="icon-trash text-xs"></div>
                    </button>

                    {/* === ВСПЛЫВАЮЩИЕ ПОПОВЕРЫ МИНИ-ПАНЕЛИ === */}

                    {/* Поповер: ЦВЕТ */}
                    {activePopover === 'color' && (
                        <div className="absolute left-2 top-8 w-60 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-lg p-3 shadow-2xl z-50 flex flex-col gap-2.5">
                            <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Цвет фона узла</div>
                            <div className="grid grid-cols-7 gap-1.5">
                                {COLOR_PRESETS.map((c) => (
                                    <button
                                        key={c}
                                        className={`w-6 h-6 rounded-md border transition-all ${
                                            (data.color || '#1a1a1a').toLowerCase() === c.toLowerCase()
                                                ? 'border-white scale-110 shadow-md ring-2 ring-[var(--accent-blue)]'
                                                : 'border-white/20 hover:scale-105 hover:border-white/60'
                                        }`}
                                        style={{ backgroundColor: c }}
                                        onClick={() => handleUpdateField('color', c)}
                                    />
                                ))}
                            </div>
                            <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                                <span className="text-[11px] text-gray-400">Свой цвет:</span>
                                <input
                                    type="color"
                                    className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
                                    value={data.color || '#1a1a1a'}
                                    onChange={(e) => handleUpdateField('color', e.target.value)}
                                />
                                <span className="text-[10px] font-mono text-gray-400 flex-1 truncate">{data.color || '#1a1a1a'}</span>
                            </div>
                        </div>
                    )}

                    {/* Поповер: МЕДИА (КАРТИНКА) */}
                    {activePopover === 'media' && (
                        <div className="absolute left-2 top-8 w-64 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-lg p-3 shadow-2xl z-50 flex flex-col gap-2.5">
                            <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Изображение / Картинка</div>
                            <input
                                type="text"
                                placeholder="https://example.com/image.png"
                                className="input-field text-xs py-1"
                                value={data.mediaUrl || ''}
                                onChange={(e) => handleUpdateField('mediaUrl', e.target.value)}
                            />
                            {data.mediaUrl && (
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between text-[11px] text-gray-400">
                                        <span>Высота:</span>
                                        <span>{data.mediaHeight || 150}px</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="50"
                                        max="600"
                                        step="10"
                                        value={data.mediaHeight || 150}
                                        onChange={(e) => handleUpdateField('mediaHeight', parseInt(e.target.value))}
                                        className="accent-[var(--accent-blue)]"
                                    />
                                    <button
                                        className="btn text-xs py-1 text-red-400 border-red-500/30 hover:bg-red-500/20 mt-1"
                                        onClick={() => handleUpdateField('mediaUrl', '')}
                                    >
                                        Удалить картинку
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Поповер: НАЗНАЧЕНИЕ НА СЛОЙ */}
                    {activePopover === 'layer' && (
                        <div className="absolute left-2 top-8 w-60 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-lg p-2.5 shadow-2xl z-50 flex flex-col gap-1.5 max-h-56 overflow-y-auto no-scrollbar">
                            <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider px-1">Назначить на слой</div>
                            <button
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-xs transition-colors ${
                                    (!data.parentId || data.parentId === 'root')
                                        ? 'bg-[var(--accent-blue)]/30 text-white font-medium border border-[var(--accent-blue)]/50'
                                        : 'text-gray-300 hover:bg-white/10'
                                }`}
                                onClick={() => handleLayerChange('root')}
                            >
                                <div className="icon-layout-grid text-gray-400"></div>
                                <span>Главный холст (Root)</span>
                            </button>
                            {state.layers && Object.values(state.layers).map((layer) => (
                                <button
                                    key={layer.id}
                                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-xs transition-colors ${
                                        data.parentId === layer.id
                                            ? 'bg-[var(--accent-blue)]/30 text-white font-medium border border-[var(--accent-blue)]/50'
                                            : 'text-gray-300 hover:bg-white/10'
                                    }`}
                                    onClick={() => handleLayerChange(layer.id)}
                                >
                                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: layer.color || '#0284c7' }}></div>
                                    <span className="truncate flex-1">{layer.name || layer.id}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Поповер: ГРУППА */}
                    {activePopover === 'group' && (
                        <div className="absolute left-2 top-8 w-56 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-lg p-3 shadow-2xl z-50 flex flex-col gap-2">
                            <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Группа узла</div>
                            <input
                                type="text"
                                list={`groups-${data.id}`}
                                placeholder="Название группы..."
                                className="input-field text-xs py-1"
                                value={data.group || ''}
                                onChange={(e) => handleUpdateField('group', e.target.value)}
                            />
                            <datalist id={`groups-${data.id}`}>
                                {Array.from(new Set(Object.values(state.nodes || {}).map(n => n.group).filter(Boolean))).map(g => (
                                 <option key={g} value={g} />
                                ))}
                            </datalist>
                        </div>
                    )}

                    {/* Поповер: ЗНАЧОК УЗЛА */}
                    {activePopover === 'icon' && (
                        <div className="absolute left-2 top-8 w-64 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-lg p-3 shadow-2xl z-50 flex flex-col gap-2.5 max-h-60 overflow-y-auto no-scrollbar">
                            <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Значок узла</div>
                            <div className="grid grid-cols-5 gap-1.5">
                                {ICON_PRESETS.map((item) => (
                                    <button
                                        key={item.id}
                                        className={`h-8 rounded border flex items-center justify-center transition-all ${
                                            data.icon === item.id
                                                ? 'bg-[var(--accent-blue)]/30 border-[var(--accent-blue)] text-white'
                                                : 'bg-black/30 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white'
                                        }`}
                                        title={item.label}
                                        onClick={() => {
                                            handleUpdateField('icon', item.id);
                                            setActivePopover(null);
                                        }}
                                    >
                                        {item.icon ? <div className={`${item.icon} text-sm`}></div> : <span className="text-[10px] text-gray-400">∅</span>}
                                    </button>
                                ))}
                            </div>
                            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider pt-1 border-t border-white/10">Эмодзи</div>
                            <div className="grid grid-cols-5 gap-1.5">
                                {EMOJI_PRESETS.map((emoji) => (
                                    <button
                                        key={emoji}
                                        className={`h-8 rounded border flex items-center justify-center text-sm transition-all ${
                                            data.icon === emoji
                                                ? 'bg-[var(--accent-blue)]/30 border-[var(--accent-blue)] text-white'
                                                : 'bg-black/30 border-white/10 hover:bg-white/10'
                                        }`}
                                        onClick={() => {
                                            handleUpdateField('icon', emoji);
                                            setActivePopover(null);
                                        }}
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Тело узла с инлайн-редактированием описания (Content) */}
            <div className={`flex-1 flex flex-col overflow-hidden transition-opacity duration-300 ${zoom < 0.4 ? 'opacity-0 hidden' : 'opacity-100'}`}>
                {data.type === 'ai-agent' ? (
                    <AIAgentNodeContent nodeId={data.id} />
                ) : showPreview ? (
                    <NodePreview nodeId={data.id} />
                ) : (
                    <div 
                        className={`flex-1 p-2.5 flex flex-col gap-2.5 cursor-text select-text z-10 ${data.userResized ? 'overflow-y-auto custom-scrollbar' : 'overflow-hidden'}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!isEditingContent) {
                                contentInitialSnapshotRef.current = { nodes: state.nodes, layers: state.layers, ports: state.ports, links: state.links };
                                contentInitialValueRef.current = data.content || '';
                                setIsEditingContent(true);
                            }
                        }}
                    >
                        {data.mediaUrl && (
                            <img 
                                src={data.mediaUrl} 
                                alt="media" 
                                className="w-full object-contain rounded border border-[#444] bg-black/50 shrink-0 pointer-events-none" 
                                style={{ height: data.mediaHeight || 150 }}
                                onLoad={handleImageLoad}
                                onError={(e) => e.target.style.display = 'none'}
                            />
                        )}
                        {isEditingContent ? (
                            <textarea
                                ref={contentTextareaRef}
                                value={tempContent}
                                autoFocus
                                className={`w-full flex-1 bg-black/80 text-gray-200 p-2 rounded border border-[var(--accent-blue)] text-sm outline-none resize-none font-sans break-all whitespace-pre-wrap leading-snug ${data.userResized ? 'custom-scrollbar' : 'overflow-hidden'}`}
                                style={{ minHeight: '50px', fontFamily: data.fontFamily || 'inherit', fontSize: data.fontSize ? `${data.fontSize}px` : undefined }}
                                placeholder="Введите описание или текст узла..."
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                    const nextVal = e.target.value;
                                    setTempContent(nextVal);
                                    dispatch({
                                        type: 'UPDATE_NODE',
                                        payload: {
                                            id: data.id,
                                            updates: { content: nextVal },
                                            skipHistory: true
                                        }
                                    });
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                        setIsEditingContent(false);
                                        if (tempContent !== contentInitialValueRef.current && contentInitialSnapshotRef.current) {
                                            dispatch({
                                                type: 'COMMIT_HISTORY',
                                                payload: {
                                                    snapshot: contentInitialSnapshotRef.current,
                                                    logMessage: `Изменено описание узла: ${data.name || data.id}`
                                                }
                                            });
                                        }
                                    } else if (e.key === 'Escape') {
                                        const prev = contentInitialValueRef.current;
                                        setTempContent(prev);
                                        dispatch({
                                            type: 'UPDATE_NODE',
                                            payload: {
                                                id: data.id,
                                                updates: { content: prev },
                                                skipHistory: true
                                            }
                                        });
                                        setIsEditingContent(false);
                                    }
                                }}
                                onBlur={() => {
                                    setIsEditingContent(false);
                                    if (tempContent !== contentInitialValueRef.current && contentInitialSnapshotRef.current) {
                                        dispatch({
                                            type: 'COMMIT_HISTORY',
                                            payload: {
                                                snapshot: contentInitialSnapshotRef.current,
                                                logMessage: `Изменено описание узла: ${data.name || data.id}`
                                            }
                                        });
                                    }
                                }}
                            />
                        ) : (
                            data.content ? (
                                <div 
                                    className="text-sm text-gray-200 whitespace-pre-wrap break-all leading-snug"
                                    style={{ fontFamily: data.fontFamily || 'inherit', fontSize: data.fontSize ? `${data.fontSize}px` : undefined }}
                                >
                                    {data.content}
                                </div>
                            ) : (
                                <div className="text-xs text-gray-500 italic py-1 opacity-50 hover:opacity-90 transition-opacity select-none">
                                    Кликните, чтобы добавить описание...
                                </div>
                            )
                        )}
                    </div>
                )}
            </div>
            
            {/* Render Ports */}
            {zoom >= 0.4 && Object.values(state.ports)
                .filter(port => port.nodeId === data.id)
                .map(port => (
                    <Port key={port.id} data={port} nodeData={data} />
                ))
            }

            {/* Overlay for Add Port Mode */}
            {state.interactionMode === 'add-port' && (
                <div 
                    className={`absolute inset-[-4px] cursor-crosshair border-2 border-dashed border-green-500/50 ${isContextNode ? 'z-0' : 'z-10'}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const y = e.clientY - rect.top;
                        const w = rect.width;
                        const h = rect.height;
                        
                        // Determine closest edge
                        const distTop = y;
                        const distBottom = h - y;
                        const distLeft = x;
                        const distRight = w - x;
                        
                        const minDist = Math.min(distTop, distBottom, distLeft, distRight);
                        let edge, position;
                        
                        if (minDist === distTop) { edge = 'top'; position = x / w; }
                        else if (minDist === distBottom) { edge = 'bottom'; position = x / w; }
                        else if (minDist === distLeft) { edge = 'left'; position = y / h; }
                        else { edge = 'right'; position = y / h; }

                        dispatch({
                            type: 'ADD_PORT',
                            payload: {
                                nodeId: data.id,
                                type: edge === 'left' ? 'input' : 'output',
                                position: position,
                                edge: edge
                            }
                        });
                    }}
                >
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-500/80 text-white text-xs px-2 py-1 rounded">
                        Клик по грани
                    </div>
                </div>
            )}

            {!isContextNode && (
                <div 
                    className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize z-20 flex items-end justify-end p-1.5 group"
                    onMouseDown={handleResizeMouseDown}
                    title="Потяните, чтобы изменить размер"
                >
                    <div className="w-2.5 h-2.5 border-r-[2px] border-b-[2px] border-gray-500 rounded-br-[2px] group-hover:border-[var(--accent-blue)] transition-colors"></div>
                </div>
            )}
        </div>
    );
}
