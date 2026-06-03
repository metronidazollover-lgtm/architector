const CopyButton = ({ text }) => {
    const [copied, setCopied] = React.useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button 
            className="btn p-0 w-[30px] h-[30px] rounded shrink-0 flex items-center justify-center text-gray-400 hover:text-white border border-[#333] hover:border-[#555] bg-black/30 hover:bg-black/50 transition-all"
            onClick={handleCopy}
            title="Копировать ID"
        >
            <div className={`text-sm ${copied ? "icon-check text-green-400" : "icon-copy"}`}></div>
        </button>
    );
};

function PropertyPanel() {
    const { state, dispatch } = useStore();
    
    if (!state.selectedIds || state.selectedIds.length === 0) {
        return null;
    }

    const { selectedIds, nodes, layers, ports, links } = state;

    // Режим массового редактирования
    if (selectedIds.length > 1) {
        const selectedItems = selectedIds.map(id => {
            if (nodes[id]) return { type: 'Узел', icon: 'icon-box', data: nodes[id] };
            if (layers && layers[id]) return { type: 'Слой', icon: 'icon-layers', data: layers[id] };
            if (ports[id]) return { type: 'Порт', icon: 'icon-circle', data: ports[id] };
            const l = (links && Array.isArray(links)) ? links.find(lnk => lnk && lnk.id === id) : null;
            if (l) return { type: 'Связь', icon: 'icon-git-commit', data: l };
            return null;
        }).filter(Boolean);

        const handleMassColorChange = (e) => {
            const color = e.target.value;
            dispatch({ type: 'MASS_UPDATE', payload: { ids: selectedIds, updates: { color } } });
        };

        const handleMassLayerChange = (e) => {
            const parentId = e.target.value;
            const nodeIds = selectedItems.filter(item => item.type === 'Узел').map(i => i.data.id);
            const targetLayer = layers[parentId];
            
            if (targetLayer) {
                const nodesToPlace = nodeIds.map(id => nodes[id]);
                const { updatesById, newLayerSize } = window.GeometryUtils.getSmartPlacement(nodesToPlace, targetLayer, nodes);
                
                dispatch({ type: 'UPDATE_LAYER', payload: { id: parentId, updates: { size: newLayerSize } } });
                dispatch({ type: 'MASS_UPDATE', payload: { ids: nodeIds, updatesById } });
            } else {
                dispatch({ type: 'MASS_UPDATE', payload: { ids: nodeIds, updates: { parentId } } });
            }
        };

        const isAllNodes = selectedItems.every(i => i.type === 'Узел');
        const isAllLinks = selectedItems.every(i => i.type === 'Связь');
        const hasNodesOrLayers = selectedItems.some(i => i.type === 'Узел' || i.type === 'Слой');

        return (
            <div className="absolute right-4 top-4 w-72 glass-panel rounded-lg flex flex-col max-h-[calc(100vh-2rem)] z-50 shadow-2xl" data-file="components/PropertyPanel.js">
                <div className="p-3 border-b border-[#333] font-medium flex items-center gap-2 bg-[#1a1a1a]/80">
                    <div className="icon-list-check text-[var(--accent-blue)]"></div>
                    Выбрано элементов: {selectedIds.length}
                </div>
                
                <div className="p-4 flex flex-col gap-5 overflow-y-auto no-scrollbar">
                    <div className="flex flex-col gap-2">
                        <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Список выбранного</label>
                        <div className="bg-black/30 rounded border border-[#333] max-h-40 overflow-y-auto no-scrollbar py-1">
                            {selectedItems.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 text-sm cursor-default">
                                    <div className={`${item.icon} text-gray-500`}></div>
                                    <div className="truncate flex-1 text-gray-300">{item.data.name || item.data.id}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="w-full h-px bg-[#333]"></div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Цвет элементов</label>
                        <div className="flex gap-2">
                            <input 
                                type="color" 
                                className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0" 
                                defaultValue="#888888"
                                onChange={handleMassColorChange}
                                title="Изменить цвет для всех"
                            />
                            <div className="input-field flex-1 text-gray-500 italic flex items-center cursor-default">
                                Массовая замена
                            </div>
                        </div>
                    </div>

                    {isAllNodes && (
                        <>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Назначить слой (Для узлов)</label>
                                <select 
                                    className="input-field cursor-pointer bg-black/50"
                                    onChange={handleMassLayerChange}
                                    defaultValue=""
                                >
                                    <option value="" disabled>Выберите слой...</option>
                                    <option value="root">Главный холст (Root)</option>
                                    {layers && Object.values(layers).map(layer => (
                                        <option key={layer.id} value={layer.id}>{layer.name}</option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}

                    {hasNodesOrLayers && (
                        <div className="flex flex-col gap-1.5 mt-1">
                            <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Привязка к сетке</label>
                            <div className="flex items-center justify-center gap-4 py-1">
                                <div className={`icon-layout-grid text-lg transition-colors ${selectedItems[0].data.snapToGrid ? 'text-[var(--accent-blue)]' : 'text-gray-500'}`} title="Включена"></div>
                                <button 
                                    className="w-10 h-5 rounded-full transition-colors relative bg-[#444] shrink-0"
                                    onClick={() => dispatch({ type: 'MASS_UPDATE', payload: { ids: selectedIds, updates: { snapToGrid: !selectedItems[0].data.snapToGrid } } })}
                                >
                                    <div className={`absolute top-[2px] left-[2px] w-4 h-4 rounded-full bg-white transition-transform ${!selectedItems[0].data.snapToGrid ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                </button>
                                <div className={`relative flex items-center justify-center w-5 h-5 transition-colors ${!selectedItems[0].data.snapToGrid ? 'text-[var(--accent-blue)]' : 'text-gray-500'}`} title="Выключена">
                                    <div className="icon-layout-grid text-lg"></div>
                                    <div className="absolute w-[120%] h-[2px] bg-current transform -rotate-45 rounded-full"></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {isAllLinks && (
                        <div className="flex flex-col gap-1.5 mt-1">
                            <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Стиль линий</label>
                            <div className="flex items-center justify-center gap-4 py-1">
                                <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-lg transition-colors ${selectedItems[0].data.linkStyle === 'orthogonal' ? 'text-[var(--accent-blue)]' : 'text-gray-500'}`} title="Ортогональная">
                                    <circle cx="19" cy="5" r="2"/>
                                    <circle cx="5" cy="19" r="2"/>
                                    <path d="M5 17V5h12"/>
                                </svg>
                                <button 
                                    className="w-10 h-5 rounded-full transition-colors relative bg-[#444] shrink-0"
                                    onClick={() => dispatch({ type: 'MASS_UPDATE', payload: { ids: selectedIds, updates: { linkStyle: selectedItems[0].data.linkStyle === 'orthogonal' ? 'bezier' : 'orthogonal' } } })}
                                    title="Переключить стиль линий"
                                >
                                    <div className={`absolute top-[2px] left-[2px] w-4 h-4 rounded-full bg-white transition-transform ${selectedItems[0].data.linkStyle === 'orthogonal' ? 'translate-x-0' : 'translate-x-5'}`}></div>
                                </button>
                                <div className={`icon-spline text-lg transition-colors ${selectedItems[0].data.linkStyle !== 'orthogonal' ? 'text-[var(--accent-blue)]' : 'text-gray-500'}`} title="Безье (Изогнутая)"></div>
                            </div>
                        </div>
                    )}

                    <button 
                        className="btn bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30 mt-2 shrink-0"
                        onClick={() => {
                            if(window.confirm(`Вы уверены, что хотите удалить ${selectedIds.length} элементов?`)) {
                                dispatch({ type: 'DELETE_SELECTED' });
                            }
                        }}
                    >
                        <div className="icon-trash"></div> Удалить выделенное
                    </button>
                </div>
            </div>
        );
    }

    // Режим единичного редактирования
    const id = selectedIds[0];
    const selectedNode = nodes[id];
    const selectedLink = (links && Array.isArray(links)) ? links.find(l => l && l.id === id) : null;
    const selectedPort = ports[id];
    const selectedLayer = layers ? layers[id] : null;

    if (!selectedNode && !selectedLink && !selectedPort && !selectedLayer) return null;

    if (selectedLayer) {
        const handleChangeLayer = (field, value) => {
            dispatch({ type: 'UPDATE_LAYER', payload: { id: selectedLayer.id, updates: { [field]: value } } });
        };
        return (
            <div className="absolute right-4 top-4 w-72 glass-panel rounded-lg flex flex-col max-h-[calc(100vh-2rem)]" data-file="components/PropertyPanel.js">
                <div className="p-3 border-b border-[#333] font-medium flex items-center gap-2 bg-[#1a1a1a]/80">
                    <div className="icon-layers text-gray-400"></div> Свойства слоя
                </div>
                <div className="p-4 flex flex-col gap-4 overflow-y-auto no-scrollbar">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">ID (Системный)</label>
                        <div className="flex gap-2">
                            <div className="input-field text-gray-500 font-mono text-[10px] select-all cursor-text bg-black/20 flex-1 truncate leading-[18px]">{selectedLayer.id}</div>
                            <CopyButton text={selectedLayer.id} />
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Название</label>
                        <input type="text" className="input-field" value={selectedLayer.name || ''} onChange={(e) => handleChangeLayer('name', e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Описание</label>
                        <textarea className="input-field min-h-[80px] resize-y" value={selectedLayer.content || ''} onChange={(e) => handleChangeLayer('content', e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Цвет</label>
                        <div className="flex gap-2">
                            <input type="color" className="w-8 h-8 rounded cursor-pointer" value={selectedLayer.color || '#ff9500'} onChange={(e) => handleChangeLayer('color', e.target.value)} />
                            <input type="text" className="input-field flex-1 font-mono" value={selectedLayer.color || '#ff9500'} onChange={(e) => handleChangeLayer('color', e.target.value)} />
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5 mt-1">
                        <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Привязка к сетке</label>
                        <div className="flex items-center justify-center gap-4 py-1">
                            <div className={`icon-layout-grid text-lg transition-colors ${selectedLayer.snapToGrid ? 'text-[var(--accent-blue)]' : 'text-gray-500'}`} title="Включена"></div>
                            <button 
                                className="w-10 h-5 rounded-full transition-colors relative bg-[#444] shrink-0"
                                onClick={() => handleChangeLayer('snapToGrid', !selectedLayer.snapToGrid)}
                            >
                                <div className={`absolute top-[2px] left-[2px] w-4 h-4 rounded-full bg-white transition-transform ${!selectedLayer.snapToGrid ? 'translate-x-5' : 'translate-x-0'}`}></div>
                            </button>
                            <div className={`relative flex items-center justify-center w-5 h-5 transition-colors ${!selectedLayer.snapToGrid ? 'text-[var(--accent-blue)]' : 'text-gray-500'}`} title="Выключена">
                                <div className="icon-layout-grid text-lg"></div>
                                <div className="absolute w-[120%] h-[2px] bg-current transform -rotate-45 rounded-full"></div>
                            </div>
                        </div>
                    </div>
                    <button 
                        className="btn bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30 mt-4 shrink-0"
                        onClick={() => {
                            if(window.confirm('Удалить этот слой?')) {
                                dispatch({ type: 'REMOVE_LAYER', payload: selectedLayer.id });
                            }
                        }}
                    >
                        <div className="icon-trash"></div> Удалить слой
                    </button>
                </div>
            </div>
        );
    }

    if (selectedLink) {
        return (
            <div className="absolute right-4 top-4 w-72 glass-panel rounded-lg flex flex-col max-h-[calc(100vh-2rem)]" data-file="components/PropertyPanel.js">
                <div className="p-3 border-b border-[#333] font-medium flex items-center gap-2 bg-[#1a1a1a]/80">
                    <div className="icon-git-commit text-gray-400"></div> Свойства связи
                </div>
                <div className="p-4 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">ID (Системный)</label>
                        <div className="flex gap-2">
                            <div className="input-field text-gray-500 font-mono text-[10px] select-all cursor-text bg-black/20 flex-1 truncate leading-[18px]">{selectedLink.id}</div>
                            <CopyButton text={selectedLink.id} />
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Название</label>
                        <input type="text" className="input-field" value={selectedLink.name || ''} onChange={(e) => dispatch({ type: 'UPDATE_LINK', payload: { id: selectedLink.id, updates: { name: e.target.value } } })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Содержание (Описание)</label>
                        <textarea className="input-field min-h-[60px] resize-y" value={selectedLink.content || ''} onChange={(e) => dispatch({ type: 'UPDATE_LINK', payload: { id: selectedLink.id, updates: { content: e.target.value } } })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Цвет линии</label>
                        <div className="flex gap-2">
                            <input type="color" className="w-8 h-8 rounded cursor-pointer" value={selectedLink.color || '#666666'} onChange={(e) => dispatch({ type: 'UPDATE_LINK', payload: { id: selectedLink.id, updates: { color: e.target.value } } })} />
                            <input type="text" className="input-field flex-1 font-mono" value={selectedLink.color || '#666666'} onChange={(e) => dispatch({ type: 'UPDATE_LINK', payload: { id: selectedLink.id, updates: { color: e.target.value } } })} />
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5 mt-1">
                        <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Стиль линии</label>
                        <div className="flex items-center justify-center gap-4 py-1">
                            <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-lg transition-colors ${selectedLink.linkStyle === 'orthogonal' ? 'text-[var(--accent-blue)]' : 'text-gray-500'}`} title="Ортогональная">
                                <circle cx="19" cy="5" r="2"/>
                                <circle cx="5" cy="19" r="2"/>
                                <path d="M5 17V5h12"/>
                            </svg>
                            <button 
                                className="w-10 h-5 rounded-full transition-colors relative bg-[#444] shrink-0"
                                onClick={() => dispatch({ type: 'UPDATE_LINK', payload: { id: selectedLink.id, updates: { linkStyle: selectedLink.linkStyle === 'orthogonal' ? 'bezier' : 'orthogonal' } } })}
                                title="Переключить стиль линии"
                            >
                                <div className={`absolute top-[2px] left-[2px] w-4 h-4 rounded-full bg-white transition-transform ${selectedLink.linkStyle === 'orthogonal' ? 'translate-x-0' : 'translate-x-5'}`}></div>
                            </button>
                            <div className={`icon-spline text-lg transition-colors ${selectedLink.linkStyle !== 'orthogonal' ? 'text-[var(--accent-blue)]' : 'text-gray-500'}`} title="Безье (Изогнутая)"></div>
                        </div>
                    </div>
                    <button 
                        className="btn bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30 mt-4 shrink-0"
                        onClick={() => {
                            if(window.confirm('Удалить эту связь?')) {
                                dispatch({ type: 'REMOVE_LINK', payload: selectedLink.id });
                            }
                        }}
                    >
                        <div className="icon-trash"></div> Удалить связь
                    </button>
                </div>
            </div>
        );
    }

    if (selectedPort) {
        return (
            <div className="absolute right-4 top-4 w-72 glass-panel rounded-lg flex flex-col max-h-[calc(100vh-2rem)]" data-file="components/PropertyPanel.js">
                <div className="p-3 border-b border-[#333] font-medium flex items-center gap-2 bg-[#1a1a1a]/80">
                    <div className="icon-circle text-gray-400"></div> Свойства порта
                </div>
                <div className="p-4 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">ID (Системный)</label>
                        <div className="flex gap-2">
                            <div className="input-field text-gray-500 font-mono text-[10px] select-all cursor-text bg-black/20 flex-1 truncate leading-[18px]">{selectedPort.id}</div>
                            <CopyButton text={selectedPort.id} />
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Название</label>
                        <input type="text" className="input-field" value={selectedPort.name || ''} onChange={(e) => dispatch({ type: 'UPDATE_PORT', payload: { id: selectedPort.id, updates: { name: e.target.value } } })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Содержание (Описание)</label>
                        <textarea className="input-field min-h-[80px] resize-y" value={selectedPort.content || ''} onChange={(e) => dispatch({ type: 'UPDATE_PORT', payload: { id: selectedPort.id, updates: { content: e.target.value } } })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Тип</label>
                        <select className="input-field cursor-pointer bg-black/50" value={selectedPort.type || 'input'} onChange={(e) => dispatch({ type: 'UPDATE_PORT', payload: { id: selectedPort.id, updates: { type: e.target.value } } })}>
                            <option value="input">Вход (Input)</option>
                            <option value="output">Выход (Output)</option>
                        </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Цвет порта</label>
                        <div className="flex gap-2">
                            <input type="color" className="w-8 h-8 rounded cursor-pointer" value={selectedPort.color || '#374151'} onChange={(e) => dispatch({ type: 'UPDATE_PORT', payload: { id: selectedPort.id, updates: { color: e.target.value } } })} />
                            <input type="text" className="input-field flex-1 font-mono" value={selectedPort.color || '#374151'} onChange={(e) => dispatch({ type: 'UPDATE_PORT', payload: { id: selectedPort.id, updates: { color: e.target.value } } })} />
                        </div>
                    </div>
                    <button 
                        className="btn bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30 mt-4 shrink-0"
                        onClick={() => {
                            if(window.confirm('Удалить этот порт?')) {
                                dispatch({ type: 'REMOVE_PORT', payload: selectedPort.id });
                            }
                        }}
                    >
                        <div className="icon-trash"></div> Удалить порт
                    </button>
                </div>
            </div>
        );
    }

    const handleChange = (field, value) => {
        if (field === 'parentId' && value !== 'root' && layers[value]) {
            const targetLayer = layers[value];
            dispatch({ type: 'UPDATE_NODE', payload: { 
                id: selectedNode.id, 
                updates: { 
                    parentId: value,
                    position: {
                        x: targetLayer.position.x + 40,
                        y: targetLayer.position.y + 90
                    }
                } 
            }});
        } else {
            dispatch({ type: 'UPDATE_NODE', payload: { id: selectedNode.id, updates: { [field]: value } } });
        }
    };

    const isAIAgent = selectedNode.type === 'ai-agent';

    return (
        <div className="absolute right-4 top-4 w-72 glass-panel rounded-lg flex flex-col max-h-[calc(100vh-2rem)]" data-file="components/PropertyPanel.js">
            <div className="p-3 border-b border-[#333] font-medium flex items-center gap-2 bg-[#1a1a1a]/80">
                <div className={`${isAIAgent ? 'icon-bot text-purple-400' : 'icon-box text-gray-400'}`}></div> 
                {isAIAgent ? 'Свойства ассистента' : 'Свойства узла'}
            </div>
            
            <div className="p-4 flex flex-col gap-4 overflow-y-auto no-scrollbar">
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">ID (Системный)</label>
                    <div className="flex gap-2">
                        <div className="input-field text-gray-500 font-mono text-[10px] select-all cursor-text bg-black/20 flex-1 truncate leading-[18px]">{selectedNode.id}</div>
                        <CopyButton text={selectedNode.id} />
                    </div>
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Название</label>
                    <input type="text" className="input-field" value={selectedNode.name || ''} onChange={(e) => handleChange('name', e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Группа</label>
                    <input type="text" list="existing-groups" className="input-field" placeholder="Название группы..." value={selectedNode.group || ''} onChange={(e) => handleChange('group', e.target.value)} />
                    <datalist id="existing-groups">
                        {Array.from(new Set(Object.values(nodes).map(n => n.group).filter(Boolean))).map(g => (
                            <option key={g} value={g} />
                        ))}
                    </datalist>
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Слой</label>
                    <select 
                        className="input-field cursor-pointer bg-black/50"
                        onChange={(e) => handleChange('parentId', e.target.value)}
                        value={selectedNode.parentId || 'root'}
                    >
                        <option value="root">Главный холст</option>
                        {layers && Object.values(layers).map(layer => (
                            <option key={layer.id} value={layer.id}>{layer.name}</option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Содержание</label>
                    <textarea className="input-field min-h-[80px] resize-y" value={selectedNode.content || ''} onChange={(e) => handleChange('content', e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Медиа URL (Картинка)</label>
                    <input type="text" className="input-field" placeholder="https://..." value={selectedNode.mediaUrl || ''} onChange={(e) => handleChange('mediaUrl', e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Цвет фона</label>
                    <div className="flex gap-2">
                        <input type="color" className="w-8 h-8 rounded cursor-pointer" value={selectedNode.color || '#1a1a1a'} onChange={(e) => handleChange('color', e.target.value)} />
                        <input type="text" className="input-field flex-1 font-mono" value={selectedNode.color || '#1a1a1a'} onChange={(e) => handleChange('color', e.target.value)} />
                    </div>
                </div>
                <div className="flex flex-col gap-1.5 mt-2">
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Привязка к сетке</label>
                    <div className="flex items-center justify-center gap-4 py-1">
                        <div className={`icon-layout-grid text-lg transition-colors ${selectedNode.snapToGrid ? 'text-[var(--accent-blue)]' : 'text-gray-500'}`} title="Включена"></div>
                        <button 
                            className="w-10 h-5 rounded-full transition-colors relative bg-[#444] shrink-0"
                            onClick={() => handleChange('snapToGrid', !selectedNode.snapToGrid)}
                        >
                            <div className={`absolute top-[2px] left-[2px] w-4 h-4 rounded-full bg-white transition-transform ${!selectedNode.snapToGrid ? 'translate-x-5' : 'translate-x-0'}`}></div>
                        </button>
                        <div className={`relative flex items-center justify-center w-5 h-5 transition-colors ${!selectedNode.snapToGrid ? 'text-[var(--accent-blue)]' : 'text-gray-500'}`} title="Выключена">
                            <div className="icon-layout-grid text-lg"></div>
                            <div className="absolute w-[120%] h-[2px] bg-current transform -rotate-45 rounded-full"></div>
                        </div>
                    </div>
                </div>
                <button 
                    className="btn bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30 mt-4 shrink-0"
                    onClick={() => {
                        if(window.confirm('Удалить этот узел?')) {
                            dispatch({ type: 'REMOVE_NODE', payload: selectedNode.id });
                        }
                    }}
                >
                    <div className="icon-trash"></div> Удалить узел
                </button>
            </div>
        </div>
    );
}
