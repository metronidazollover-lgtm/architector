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
                const link = (links && Array.isArray(links)) ? links.find(l => l && l.id === selectedId) : null;
                if (link) {
                    setObjectTab('links');
                }
            }
        }
    }, [state.selectedIds, layers, nodes, ports, links]);

    if (!state.ui.libraryOpen) return null;

    const handleSelect = (id) => {
        let targetContext = 'root';
        if (nodes[id]) {
            targetContext = nodes[id].parentId || 'root';
        } else if (layers && layers[id]) {
            targetContext = layers[id].parentId || 'root';
        } else if (ports[id]) {
            const portNode = nodes[ports[id].nodeId];
            if (portNode) targetContext = portNode.parentId || 'root';
        } else {
            const link = (links && Array.isArray(links)) ? links.find(l => l && l.id === id) : null;
            if (link) targetContext = link.context || 'root';
        }

        // Если вычисленный контекст является слоем, нам нужен его родитель (так как слои - это просто визуальные фреймы)
        if (layers && layers[targetContext]) {
            targetContext = layers[targetContext].parentId || 'root';
        }

        if (state.currentContext !== targetContext) {
            dispatch({ type: 'GO_TO_CONTEXT', payload: targetContext });
        }

        dispatch({ type: 'SET_SELECTED', payload: id });
        dispatch({ type: 'CENTER_ON_ENTITY', payload: id });
    };

    const getNodeHierarchyInfo = (entityId) => {
        let level = 1;
        let currentId = nodes[entityId]?.parentId || (layers && layers[entityId] ? layers[entityId].parentId : null);
        let parentNode = null;
        
        while (currentId && currentId !== 'root') {
            if (layers && layers[currentId]) {
                currentId = layers[currentId].parentId;
            } else if (nodes[currentId]) {
                if (!parentNode) parentNode = nodes[currentId];
                level++;
                currentId = nodes[currentId].parentId;
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

    return (
        <div className="absolute left-20 top-4 w-72 glass-panel rounded-xl flex flex-col max-h-[calc(100vh-2rem)] z-40 shadow-2xl overflow-hidden border-[#444]" data-file="components/Library.js">
            <div className="p-3 border-b border-[#333] flex items-center gap-4 bg-[#1f1f1f]">
                <button 
                    className={`text-sm font-semibold transition-colors pb-1 border-b-2 ${activeTab === 'objects' ? 'text-gray-100 border-[var(--accent-blue)]' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                    onClick={() => dispatch({ type: 'SET_LIBRARY_TAB', payload: 'objects' })}
                >
                    Объекты
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
                        <button 
                            className={`p-1 rounded text-sm transition-colors ${future.length === 0 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-300 hover:bg-white/10 hover:text-white'}`}
                            onClick={() => dispatch({ type: 'REDO' })}
                            disabled={future.length === 0}
                            title="Шаг вперед"
                        >
                            <div className="icon-redo-2"></div>
                        </button>
                    </div>
                )}
            </div>
            
            {activeTab === 'objects' ? (
                <div className="flex flex-col flex-1 overflow-hidden">
                    <div className="flex px-3 py-2 gap-2 border-b border-[#333]/50 bg-[#1a1a1a]/50 shrink-0 overflow-x-auto no-scrollbar">
                        <button 
                            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${objectTab === 'layers' ? 'bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]' : 'text-gray-500 hover:bg-white/5'}`}
                            onClick={() => setObjectTab('layers')}
                        >
                            Слои ({(layers && Object.keys(layers).length) || 0})
                        </button>
                        <button 
                            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${objectTab === 'nodes' ? 'bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]' : 'text-gray-500 hover:bg-white/5'}`}
                            onClick={() => setObjectTab('nodes')}
                        >
                            Узлы ({Object.keys(nodes).length})
                        </button>
                        <button 
                            className={`flex-1 py-1.5 text-xs font-semibold rounded transition-colors ${objectTab === 'ports' ? 'bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]' : 'text-gray-500 hover:bg-white/5'}`}
                            onClick={() => setObjectTab('ports')}
                        >
                            Порты ({Object.keys(ports).length})
                        </button>
                        <button 
                            className={`flex-1 py-1.5 text-xs font-semibold rounded transition-colors ${objectTab === 'links' ? 'bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]' : 'text-gray-500 hover:bg-white/5'}`}
                            onClick={() => setObjectTab('links')}
                        >
                            Связи ({links ? links.length : 0})
                        </button>
                    </div>
                    <div className="flex flex-col overflow-y-auto no-scrollbar pb-2 flex-1">
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
                                {(!links || links.length === 0) && <div className="text-gray-600 italic px-4 py-3 text-sm">Нет связей</div>}
                                {links && Array.isArray(links) && links.map(link => {
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
            ) : (
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
            )}
        </div>
    );
}