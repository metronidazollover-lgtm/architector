function Library() {
    const { state, dispatch } = useStore();
    const [objectTab, setObjectTab] = React.useState('layers');

    const { layers, nodes, ports, links, past, future, historyLogs } = state;
    const activeTab = state.ui.libraryTab || 'objects';

    React.useEffect(() => {
        if (state.selectedIds && state.selectedIds.length > 0) {
            const selectedId = state.selectedIds[0];
            if (layers && layers[selectedId]) {
                setObjectTab('layers');
            } else if (nodes && nodes[selectedId]) {
                setObjectTab('nodes');
            } else if (ports && ports[selectedId]) {
                setObjectTab('ports');
            } else {
                const link = links ? links[selectedId] : null;
                if (link) {
                    setObjectTab('links');
                }
            }
        }
    }, [state.selectedIds, layers, nodes, ports, links]);

    if (!state.ui.libraryOpen) return null;

    const handleSelect = (id) => {
        dispatch({ type: 'SET_SELECTED', payload: id });
        dispatch({ type: 'CENTER_ON_ENTITY', payload: id });
    };

    const getNodeHierarchyInfo = (entityId) => {
        let level = 1;
        if (!entityId || entityId === 'root') return { level: 0, parentNode: null };

        const safeNodes = nodes || {};
        const safeLayers = layers || {};
        const safePorts = ports || {};
        const safeLinks = Array.isArray(links) ? links.reduce((acc, l) => { if (l && l.id) acc[l.id] = l; return acc; }, {}) : (links || {});

        let currentId = safeNodes[entityId]?.parentId || 
                        safeLayers[entityId]?.parentId || 
                        safePorts[entityId]?.nodeId || 
                        safeLinks[entityId]?.context || null;
        let parentNode = null;
        const visited = new Set();
        if (entityId) visited.add(entityId);
        
        while (currentId && currentId !== 'root' && !visited.has(currentId)) {
            visited.add(currentId);
            if (safeLayers[currentId]) {
                currentId = safeLayers[currentId].parentId;
            } else if (safeNodes[currentId]) {
                if (!parentNode) parentNode = safeNodes[currentId];
                level++;
                currentId = safeNodes[currentId].parentId;
            } else if (safePorts[currentId]) {
                if (!parentNode && safeNodes[safePorts[currentId].nodeId]) parentNode = safeNodes[safePorts[currentId].nodeId];
                level++;
                currentId = safePorts[currentId].nodeId;
            } else if (safeLinks[currentId]) {
                level++;
                currentId = safeLinks[currentId].context;
            } else {
                break;
            }
        }
        return { level, parentNode };
    };

    const ItemRow = ({ id, icon, color, title, subtitle, hidden, onToggleHide, level = 1, parentNode = null }) => {
        const isSelected = state.selectedIds && state.selectedIds.includes(id);
        
        const handleParentClick = (e) => {
            e.stopPropagation();
            if (parentNode) handleSelect(parentNode.id);
        };

        return (
            <div 
                className={`group flex items-center justify-between px-3 py-2 cursor-pointer border-b border-[#333]/50 transition-colors
                ${isSelected ? 'bg-[var(--accent-blue)]/10 border-[var(--accent-blue)]/30' : 'hover:bg-white/5'} ${hidden ? 'opacity-50' : ''}`}
                onClick={() => handleSelect(id)}
            >
                <div className="flex items-center gap-2 overflow-hidden flex-1" style={{ paddingLeft: `${(level - 1) * 12}px` }}>
                    {parentNode && (
                        <div 
                            className="w-3 h-3 rounded-[2px] shrink-0 border border-white/20 cursor-pointer hover:scale-110 transition-transform flex items-center justify-center shadow-sm"
                            style={{ backgroundColor: parentNode.color || '#333' }}
                            onClick={handleParentClick}
                            title={`Родитель: ${parentNode.name}`}
                        >
                            <div className="icon-arrow-up text-[8px] text-white/70"></div>
                        </div>
                    )}
                    
                    {level > 1 && (
                        <span className="text-[9px] font-mono bg-black/40 text-gray-400 px-1 py-0.5 rounded shrink-0">L{level}</span>
                    )}

                    {color ? (
                        <div className="w-3 h-3 rounded-[3px] shrink-0 border border-white/10" style={{ backgroundColor: color }}></div>
                    ) : (
                        <div className={`${icon} text-gray-400 shrink-0 text-sm ${isSelected ? 'text-[var(--accent-blue)]' : ''}`}></div>
                    )}
                    <div className="flex flex-col overflow-hidden">
                        <span className={`text-sm truncate ${isSelected ? 'text-[var(--accent-blue)] font-medium' : 'text-gray-200'} ${hidden ? 'line-through' : ''}`}>
                            {title}
                        </span>
                        {subtitle && <span className="text-[10px] text-gray-500 truncate">{subtitle}</span>}
                    </div>
                </div>
                {onToggleHide ? (
                    <button 
                        className={`transition-opacity text-sm p-1 rounded hover:bg-white/10 ${hidden ? 'opacity-100 text-gray-500' : 'opacity-0 group-hover:opacity-100 text-gray-400'} ${isSelected ? 'opacity-100 text-[var(--accent-blue)]' : ''}`}
                        onClick={(e) => { e.stopPropagation(); onToggleHide(id); }}
                        title={hidden ? "Показать" : "Скрыть"}
                    >
                        <div className={hidden ? "icon-eye-off" : "icon-eye"}></div>
                    </button>
                ) : (
                    <div className={`icon-eye text-gray-500 text-sm opacity-0 group-hover:opacity-100 transition-opacity ${isSelected ? 'opacity-100 text-[var(--accent-blue)]' : ''}`}></div>
                )}
            </div>
        );
    };

    // Grouping nodes
    const nodesArray = Object.values(nodes);
    const groupedNodes = nodesArray.reduce((acc, node) => {
        const g = node.group || 'Без группы';
        if (!acc[g]) acc[g] = [];
        acc[g].push(node);
        return acc;
    }, {});

    const renderContent = () => {
        if (activeTab === 'objects') {
            return (
                <div className="flex flex-col flex-1 overflow-hidden">
                    <div className="flex px-2 py-1.5 gap-1 border-b border-[#333]/50 bg-[#1a1a1a]/50 shrink-0 overflow-x-auto no-scrollbar">
                        <button
                            className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${objectTab === 'tree' ? 'bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]' : 'text-gray-500 hover:bg-white/5'}`}
                            onClick={() => setObjectTab('tree')}
                            title="Иерархия всего проекта: клик — показать, двойной клик — войти, drag-and-drop — перевложить"
                        >
                            Дерево
                        </button>
                        <button
                            className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${objectTab === 'layers' ? 'bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]' : 'text-gray-500 hover:bg-white/5'}`}
                            onClick={() => setObjectTab('layers')}
                        >
                            Слои ({(layers && Object.keys(layers).length) || 0})
                        </button>
                        <button 
                            className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${objectTab === 'nodes' ? 'bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]' : 'text-gray-500 hover:bg-white/5'}`}
                            onClick={() => setObjectTab('nodes')}
                        >
                            Узлы ({Object.keys(nodes).length})
                        </button>
                        <button 
                            className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${objectTab === 'ports' ? 'bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]' : 'text-gray-500 hover:bg-white/5'}`}
                            onClick={() => setObjectTab('ports')}
                        >
                            Порты ({Object.keys(ports).length})
                        </button>
                        <button 
                            className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${objectTab === 'links' ? 'bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]' : 'text-gray-500 hover:bg-white/5'}`}
                            onClick={() => setObjectTab('links')}
                        >
                            Связи ({links ? Object.keys(links).length : 0})
                        </button>
                    </div>
                    <div className="flex flex-col overflow-y-auto no-scrollbar pb-2 flex-1">
                        {objectTab === 'tree' && <OutlinerTree onSelect={handleSelect} />}

                        {objectTab === 'layers' && (
                            <div className="flex flex-col">
                                {(!layers || Object.keys(layers).length === 0) && <div className="text-gray-600 italic px-4 py-3 text-sm">Нет слоев</div>}
                                
                                {layers && Object.values(layers).map(layer => (
                                    <ItemRow 
                                        key={layer.id} 
                                        id={layer.id} 
                                        icon="icon-layers" 
                                        color={layer.color}
                                        title={layer.name}
                                    />
                                ))}
                            </div>
                        )}

                        {objectTab === 'nodes' && (
                            <div className="flex flex-col">
                                {Object.keys(nodes).length === 0 && <div className="text-gray-600 italic px-4 py-3 text-sm">Нет узлов</div>}
                                
                                {Object.entries(groupedNodes).map(([groupName, groupNodes]) => (
                                    <div key={groupName} className="flex flex-col">
                                        <div 
                                            className="px-3 py-1.5 bg-[#1a1a1a] text-[10px] uppercase text-gray-500 hover:text-white cursor-pointer font-semibold border-b border-[#333]/50 sticky top-0 backdrop-blur-md z-10 transition-colors flex items-center justify-between group"
                                            onClick={() => dispatch({ type: 'SET_MULTI_SELECTED', payload: groupNodes.map(n => n.id) })}
                                            title="Выделить все узлы в этой группе"
                                        >
                                            <span>{groupName}</span>
                                            <div className="icon-scan text-xs opacity-0 group-hover:opacity-100 transition-opacity text-[var(--accent-blue)]"></div>
                                        </div>
                                        {groupNodes.map(node => {
                                            const { level, parentNode } = getNodeHierarchyInfo(node.id);
                                            return (
                                                <ItemRow 
                                                    key={node.id} 
                                                    id={node.id} 
                                                    color={node.color} 
                                                    title={node.name}
                                                    hidden={node.hidden}
                                                    onToggleHide={(id) => dispatch({ 
                                                        type: 'UPDATE_NODE', 
                                                        payload: { id, updates: { hidden: !node.hidden }, skipHistory: true } 
                                                    })}
                                                    level={level}
                                                    parentNode={parentNode}
                                                />
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        )}

                        {objectTab === 'ports' && (
                            <div className="flex flex-col">
                                {Object.keys(ports).length === 0 && <div className="text-gray-600 italic px-4 py-3 text-sm">Нет портов</div>}
                                {Object.values(ports).map(port => {
                                    const pNode = nodes[port.nodeId];
                                    let level = 1;
                                    let parentNode = pNode;
                                    if (pNode) {
                                        const info = getNodeHierarchyInfo(pNode.id);
                                        level = info.level + 1;
                                    }
                                    return (
                                        <ItemRow 
                                            key={port.id} 
                                            id={port.id} 
                                            icon={port.type === 'input' ? 'icon-circle-arrow-down' : 'icon-circle-arrow-up'} 
                                            title={port.name || (port.type === 'input' ? 'Вход' : 'Выход')}
                                            subtitle={`Узел: ${pNode?.name || port.nodeId}`}
                                            level={level}
                                            parentNode={parentNode}
                                        />
                                    );
                                })}
                            </div>
                        )}

                        {objectTab === 'links' && (
                            <div className="flex flex-col">
                                {(!links || Object.keys(links).length === 0) && <div className="text-gray-600 italic px-4 py-3 text-sm">Нет связей</div>}
                                {links && Object.values(links).map(link => {
                                    if (!link) return null;
                                    let level = 1;
                                    let parentNode = null;
                                    if (link.context && link.context !== 'root') {
                                        const info = getNodeHierarchyInfo(link.context);
                                        level = info.level;
                                        if (nodes[link.context]) {
                                            level++;
                                            parentNode = nodes[link.context];
                                        }
                                    }
                                    return (
                                        <ItemRow 
                                            key={link.id} 
                                            id={link.id} 
                                            icon="icon-git-commit" 
                                            title={link.name || `Связь ${link.id.split('-')[1]}`} 
                                            level={level}
                                            parentNode={parentNode}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        if (activeTab === 'levels') {
            const H = window.HierarchyUtils;
            const maxDepths = H ? H.getMaxRelativeDepths(state.currentContext, nodes, layers, ports, links) : { maxDown: 10, maxUp: 10 };
            const currentDown = state.ui?.xRayDown || 0;
            const currentUp = state.ui?.xRayUp || 0;
            const maxUp = maxDepths.maxUp;
            const maxDown = maxDepths.maxDown;

            const currCtx = state.currentContext || 'root';
            const directChildren = [];
            const xrayChildren = [];

            Object.values(nodes || {}).forEach(n => {
                if (!n) return;
                const rel = H ? H.getRelativeDepth(n.id, currCtx, nodes, layers, ports, links) : null;
                if (rel === 1) directChildren.push({ entity: n, type: 'node', name: n.name, icon: 'icon-box' });
                else if (rel !== null && rel > 1 && rel <= currentDown + 1) {
                    xrayChildren.push({ entity: n, type: 'node', name: n.name, rel, icon: 'icon-box' });
                }
            });

            Object.values(layers || {}).forEach(l => {
                if (!l) return;
                const rel = H ? H.getRelativeDepth(l.id, currCtx, nodes, layers, ports, links) : null;
                if (rel === 1) directChildren.push({ entity: l, type: 'layer', name: l.name, icon: 'icon-layers' });
                else if (rel !== null && rel > 1 && rel <= currentDown + 1) {
                    xrayChildren.push({ entity: l, type: 'layer', name: l.name, rel, icon: 'icon-layers' });
                }
            });

            return (
                <div className="flex flex-col flex-1 overflow-hidden p-3 gap-3 text-sm">
                    {/* Секция X-Ray контроля */}
                    <div className="rounded-lg border border-[#333] bg-[#1a1a1a]/80 p-3 flex flex-col gap-2.5">
                        <div className="text-xs font-semibold text-gray-300 flex items-center justify-between">
                            <span>🔍 Просвечивание (X-Ray)</span>
                            <button
                                className="text-[10px] text-gray-400 hover:text-white underline"
                                onClick={() => {
                                    dispatch({ type: 'SET_XRAY_DOWN', payload: 0 });
                                    dispatch({ type: 'SET_XRAY_UP', payload: 0 });
                                }}
                            >
                                Сбросить
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Кнопка "Наверх (предки)" со стрелкой ВВЕРХ */}
                            <div className="flex-1 flex items-center justify-between bg-black/30 px-2.5 py-1.5 rounded border border-white/5">
                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                    <span>Наверх:</span>
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-mono font-semibold text-amber-400">
                                        {maxUp === 0 ? '0' : `${currentUp}/${maxUp}`}
                                    </span>
                                    <button
                                        className={`w-6 h-6 flex items-center justify-center rounded transition-all text-xs font-bold ${currentUp > 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.3)]' : 'bg-white/10 text-gray-300 hover:bg-white/20'} disabled:opacity-30 disabled:hover:bg-white/10`}
                                        disabled={maxUp === 0}
                                        title={maxUp === 0 ? 'Нет уровней наверху' : `Просвечивание предков (${currentUp} из ${maxUp} ур.)`}
                                        onClick={() => {
                                            const nextUp = (currentUp + 1) > maxUp ? 0 : currentUp + 1;
                                            dispatch({ type: 'SET_XRAY_UP', payload: nextUp });
                                        }}
                                    >
                                        ↑
                                    </button>
                                </div>
                            </div>

                            {/* Кнопка "Вглубь (потомки)" со стрелкой ВНИЗ */}
                            <div className="flex-1 flex items-center justify-between bg-black/30 px-2.5 py-1.5 rounded border border-white/5">
                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                    <span>Вглубь:</span>
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-mono font-semibold text-[var(--accent-blue)]">
                                        {maxDown === 0 ? '0' : `${currentDown}/${maxDown}`}
                                    </span>
                                    <button
                                        className={`w-6 h-6 flex items-center justify-center rounded transition-all text-xs font-bold ${currentDown > 0 ? 'bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] border border-[var(--accent-blue)]/40 shadow-[0_0_8px_rgba(56,189,248,0.3)]' : 'bg-white/10 text-gray-300 hover:bg-white/20'} disabled:opacity-30 disabled:hover:bg-white/10`}
                                        disabled={maxDown === 0}
                                        title={maxDown === 0 ? 'Нет уровней внизу' : `Просвечивание потомков (${currentDown} из ${maxDown} ур.)`}
                                        onClick={() => {
                                            const nextDown = (currentDown + 1) > maxDown ? 0 : currentDown + 1;
                                            dispatch({ type: 'SET_XRAY_DOWN', payload: nextDown });
                                        }}
                                    >
                                        ↓
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Секция текущего контекста и содержимого */}
                    <div className="flex flex-col flex-1 overflow-y-auto no-scrollbar gap-2">
                        {directChildren.length === 0 && xrayChildren.length === 0 ? (
                            <div className="text-gray-500 italic px-2 py-4 text-center text-xs">Контекст пуст</div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {directChildren.length > 0 && (
                                    <div className="flex flex-col gap-1">
                                        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 px-1">
                                            Прямой контент ({directChildren.length})
                                        </div>
                                        {directChildren.map(item => {
                                            const isSelected = state.selectedIds && state.selectedIds.includes(item.entity.id);
                                            return (
                                                <div
                                                    key={item.entity.id}
                                                    className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer text-xs transition-colors border ${isSelected ? 'bg-[var(--accent-blue)]/20 border-[var(--accent-blue)]/50 text-white' : 'bg-[#1a1a1a] border-[#333] hover:border-[#555] text-gray-300'}`}
                                                    onClick={() => handleSelect(item.entity.id)}
                                                    onDoubleClick={() => {
                                                        if (item.type === 'node') {
                                                            dispatch({ type: 'DIVE_INTO', payload: { id: item.entity.id, name: item.name } });
                                                        } else {
                                                            handleSelect(item.entity.id);
                                                        }
                                                    }}
                                                >
                                                    <div className="flex items-center gap-2 truncate">
                                                        <div className={`${item.icon} text-gray-400 shrink-0`}></div>
                                                        <span className="truncate">{item.name}</span>
                                                    </div>
                                                    <span className="text-[9px] uppercase text-gray-500 font-mono">{item.type}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {xrayChildren.length > 0 && (
                                    <div className="flex flex-col gap-1">
                                        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-blue)] px-1">
                                            Вложенные (X-Ray: {xrayChildren.length})
                                        </div>
                                        {xrayChildren.map(item => {
                                            const isSelected = state.selectedIds && state.selectedIds.includes(item.entity.id);
                                            return (
                                                <div
                                                    key={item.entity.id}
                                                    className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer text-xs transition-colors border ${isSelected ? 'bg-[var(--accent-blue)]/20 border-[var(--accent-blue)]/50 text-white' : 'bg-black/40 border-[#2a2a2a] hover:border-[#444] text-gray-400'}`}
                                                    onClick={() => handleSelect(item.entity.id)}
                                                    onDoubleClick={() => {
                                                        if (item.type === 'node') {
                                                            dispatch({ type: 'DIVE_INTO', payload: { id: item.entity.id, name: item.name } });
                                                        } else {
                                                            handleSelect(item.entity.id);
                                                        }
                                                    }}
                                                >
                                                    <div className="flex items-center gap-2 truncate">
                                                        <div className={`${item.icon} text-gray-500 shrink-0`}></div>
                                                        <span className="truncate">{item.name}</span>
                                                    </div>
                                                    <span className="text-[9px] text-[var(--accent-blue)] font-mono">+{item.rel - 1} ур.</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        return (
            <div className="flex flex-col overflow-y-auto flex-1 p-2 gap-1 no-scrollbar relative min-h-[200px]">
                <div className="absolute left-[19px] top-4 bottom-4 w-px bg-[#333] z-0"></div>
                
                <div className="flex items-center gap-3 px-2 py-1.5 z-10">
                    <div className="w-2.5 h-2.5 rounded-full border-[2px] border-gray-500 bg-[#1f1f1f] shrink-0"></div>
                    <span className="text-gray-500 text-sm italic">Начало</span>
                </div>

                {historyLogs.map((log, i) => {
                    const isLast = i === historyLogs.length - 1;
                    return (
                        <div key={i} className={`flex items-center gap-3 px-2 py-2 rounded-lg z-10 transition-colors ${isLast ? 'bg-[var(--accent-blue)]/10' : 'hover:bg-white/5'}`}>
                            <div className={`w-2.5 h-2.5 rounded-full border-[2px] shrink-0 ${isLast ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]' : 'border-gray-400 bg-[#1f1f1f]'}`}></div>
                            <span className={`text-sm ${isLast ? 'text-[var(--accent-blue)] font-medium' : 'text-gray-300'}`}>
                                {log}
                            </span>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="absolute left-4 top-4 w-[350px] glass-panel rounded-xl flex flex-col max-h-[calc(100vh-2rem)] z-40 shadow-2xl overflow-hidden border-[#444] transition-all duration-300" data-file="components/Library.js">
            <div className="p-3 border-b border-[#333] flex items-center gap-4 bg-[#1f1f1f]">
                <button 
                    className={`text-sm font-semibold transition-colors pb-1 border-b-2 ${activeTab === 'objects' ? 'text-gray-100 border-[var(--accent-blue)]' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                    onClick={() => dispatch({ type: 'SET_LIBRARY_TAB', payload: 'objects' })}
                >
                    Объекты
                </button>
                <button 
                    className={`text-sm font-semibold transition-colors pb-1 border-b-2 ${activeTab === 'levels' ? 'text-gray-100 border-[var(--accent-blue)]' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                    onClick={() => dispatch({ type: 'SET_LIBRARY_TAB', payload: 'levels' })}
                >
                    Уровни
                </button>
                <button 
                    className={`text-sm font-semibold transition-colors pb-1 border-b-2 ${activeTab === 'history' ? 'text-gray-100 border-[var(--accent-blue)]' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                    onClick={() => dispatch({ type: 'SET_LIBRARY_TAB', payload: 'history' })}
                >
                    История
                </button>
                
                {activeTab === 'history' && (
                    <div className="ml-auto flex gap-1">
                        <button 
                            className={`p-1 rounded text-sm transition-colors ${past.length === 0 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-300 hover:bg-white/10 hover:text-white'}`}
                            onClick={() => dispatch({ type: 'UNDO' })}
                            disabled={past.length === 0}
                            title="Шаг назад"
                        >
                            <div className="icon-undo-2"></div>
                        </button>
                    </div>
                )}
            </div>
            {renderContent()}
        </div>
    );
}