// Верхняя контекстная панель свойств (Context Action Bar).
// Располагается по центру экрана строго под строкой навигации (top-16).
// Реализует 3-ярусную компоновку: Название + ID, Ряд кнопок (40x40px) с поповерами, Поле описания.

const COLOR_PRESETS = [
    '#1a1a1a', '#0f172a', '#1e293b', '#14532d', 
    '#064e3b', '#1e3a8a', '#312e81', '#581c87', 
    '#701a75', '#7f1d1d', '#78350f', '#134e4a',
    '#27272a', '#3f3f46'
];

const FONT_PRESETS = [
    { id: 'Inter, sans-serif', label: 'Inter', category: 'Modern Sans' },
    { id: 'Roboto, sans-serif', label: 'Roboto', category: 'Geometric Sans' },
    { id: 'Montserrat, sans-serif', label: 'Montserrat', category: 'Grotesque Sans' },
    { id: 'Fira Code, monospace', label: 'Fira Code', category: 'Monospace' },
    { id: 'JetBrains Mono, monospace', label: 'JetBrains Mono', category: 'Monospace' },
    { id: 'Playfair Display, serif', label: 'Playfair', category: 'Classic Serif' },
    { id: 'Merriweather, serif', label: 'Merriweather', category: 'Book Serif' },
    { id: 'Oswald, sans-serif', label: 'Oswald', category: 'Condensed' },
    { id: 'Comic Neue, cursive, sans-serif', label: 'Comic Neue', category: 'Casual' },
    { id: 'Comfortaa, cursive, sans-serif', label: 'Comfortaa', category: 'Rounded' },
    { id: 'Courier New, monospace', label: 'Courier New', category: 'System Mono' }
];

const FONT_SIZE_PRESETS = [
    { size: 11, label: '11px', name: 'XS' },
    { size: 12, label: '12px', name: 'SM' },
    { size: 14, label: '14px', name: 'MD' },
    { size: 16, label: '16px', name: 'LG' },
    { size: 18, label: '18px', name: 'XL' },
    { size: 20, label: '20px', name: '2XL' },
    { size: 24, label: '24px', name: '3XL' }
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

const CopyButton = ({ text }) => {
    const [copied, setCopied] = React.useState(false);
    const handleCopy = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button 
            className="px-2 h-7 rounded text-xs shrink-0 flex items-center gap-1.5 text-gray-400 hover:text-white border border-white/10 hover:border-white/25 bg-black/40 hover:bg-black/60 transition-all font-mono"
            onClick={handleCopy}
            title={`Копировать ID: ${text}`}
        >
            <span className="max-w-[90px] truncate text-[11px] select-all">{text}</span>
            <div className={`text-xs ${copied ? "icon-check text-green-400" : "icon-copy"}`}></div>
        </button>
    );
};

const ContextDescriptionInput = ({ value, placeholder, onChange, onBlur }) => {
    const textareaRef = React.useRef(null);

    const adjustHeight = React.useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        const scrollH = el.scrollHeight;
        if (scrollH <= 32) {
            el.style.height = '28px';
            el.style.overflowY = 'hidden';
        } else if (scrollH < 140) {
            el.style.height = `${scrollH}px`;
            el.style.overflowY = 'hidden';
        } else {
            el.style.height = '140px';
            el.style.overflowY = 'auto';
        }
    }, []);

    React.useLayoutEffect(() => {
        adjustHeight();
    }, [value, adjustHeight]);

    return (
        <textarea 
            ref={textareaRef}
            rows={1}
            className="w-full bg-black/40 text-gray-200 px-2.5 py-1 rounded-lg border border-white/10 focus:border-[var(--accent-blue)] focus:bg-black/60 text-xs outline-none resize-none font-sans break-all whitespace-pre-wrap leading-snug custom-scrollbar transition-all box-border"
            style={{ minHeight: '28px', height: '28px', overflowY: 'hidden' }}
            placeholder={placeholder}
            value={value || ''}
            onInput={adjustHeight}
            onChange={onChange}
            onBlur={onBlur}
        />
    );
};

const TypographyPopover = ({ currentFont, currentSize, onFontChange, onSizeChange, leftClass = "left-10" }) => {
    return (
        <div className={`absolute ${leftClass} top-12 w-72 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-xl p-3 shadow-2xl z-50 flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-150`}>
            {/* Размер шрифта */}
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-gray-300 uppercase tracking-wider">
                    <span>Размер шрифта</span>
                    <span className="text-[var(--accent-blue)] font-mono text-xs font-bold">{currentSize || 14}px</span>
                </div>
                <div className="flex items-center gap-1">
                    {FONT_SIZE_PRESETS.map((item) => (
                        <button
                            key={item.size}
                            className={`flex-1 h-7 rounded border text-[11px] font-medium transition-all ${
                                (currentSize || 14) === item.size
                                    ? 'bg-[var(--accent-blue)] text-white border-[var(--accent-blue)] shadow'
                                    : 'bg-black/30 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white'
                            }`}
                            onClick={() => onSizeChange(item.size)}
                            title={`${item.label} (${item.name})`}
                        >
                            {item.size}
                        </button>
                    ))}
                </div>
            </div>

            {/* Гарнитура / Шрифт */}
            <div className="flex flex-col gap-1.5 pt-2 border-t border-white/10">
                <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Гарнитура (Шрифт)</div>
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto custom-scrollbar pr-0.5">
                    {FONT_PRESETS.map((font) => (
                        <button
                            key={font.id}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-left transition-all ${
                                (currentFont || 'Inter, sans-serif') === font.id
                                    ? 'bg-[var(--accent-blue)]/20 border-[var(--accent-blue)] text-white font-medium'
                                    : 'bg-black/20 border-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
                            }`}
                            onClick={() => onFontChange(font.id)}
                        >
                            <span className="text-xs truncate" style={{ fontFamily: font.id }}>{font.label}</span>
                            <span className="text-[10px] text-gray-400 font-mono">{font.category}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

function ContextActionBar() {
    const { state, dispatch } = useStore();
    const [activePopover, setActivePopover] = React.useState(null); // 'color' | 'media' | 'layer' | 'group' | 'icon' | 'edge' | 'typography' | null
    const barRef = React.useRef(null);

    const { selectedIds, nodes, layers, ports, links } = state;

    // Закрытие выпадающих поповеров при клике вне панели
    React.useEffect(() => {
        if (!activePopover) return;
        const handleOutside = (e) => {
            if (barRef.current && !barRef.current.contains(e.target)) {
                setActivePopover(null);
            }
        };
        window.addEventListener('mousedown', handleOutside);
        return () => window.removeEventListener('mousedown', handleOutside);
    }, [activePopover]);

    // Сброс активного поповера при смене выделения
    React.useEffect(() => {
        setActivePopover(null);
    }, [selectedIds]);

    if (!selectedIds || selectedIds.length === 0) {
        return null;
    }

    // === 1. РЕЖИМ МАССОВОГО ВЫДЕЛЕНИЯ ===
    if (selectedIds.length > 1) {
        const selectedItems = selectedIds.map(id => {
            if (nodes[id]) return { type: 'Узел', icon: 'icon-box', data: nodes[id] };
            if (layers && layers[id]) return { type: 'Слой', icon: 'icon-layers', data: layers[id] };
            if (ports[id]) return { type: 'Порт', icon: 'icon-circle', data: ports[id] };
            const l = links ? links[id] : null;
            if (l) return { type: 'Связь', icon: 'icon-git-commit', data: l };
            return null;
        }).filter(Boolean);

        const isAllNodes = selectedItems.length > 0 && selectedItems.every(i => i.type === 'Узел');
        const isAllLinks = selectedItems.length > 0 && selectedItems.every(i => i.type === 'Связь');
        const hasNodesOrLayers = selectedItems.some(i => i.type === 'Узел' || i.type === 'Слой');
        const firstNodeOrLayer = selectedItems.find(i => i.type === 'Узел' || i.type === 'Слой');
        const currentSnap = firstNodeOrLayer ? firstNodeOrLayer.data.snapToGrid : true;
        const firstLink = selectedItems.find(i => i.type === 'Связь');
        const currentLinkStyle = firstLink ? (firstLink.data.linkStyle || 'orthogonal') : 'orthogonal';
        const firstItemWithFont = selectedItems.find(i => i.data.fontFamily || i.data.fontSize);
        const massFont = firstItemWithFont ? firstItemWithFont.data.fontFamily : 'Inter, sans-serif';
        const massFontSize = firstItemWithFont ? firstItemWithFont.data.fontSize : 14;

        const handleMassColorChange = (color) => {
            dispatch({ type: 'MASS_UPDATE', payload: { ids: selectedIds, updates: { color } } });
        };

        const handleMassFontChange = (fontFamily) => {
            dispatch({ type: 'MASS_UPDATE', payload: { ids: selectedIds, updates: { fontFamily } } });
        };

        const handleMassSizeChange = (fontSize) => {
            dispatch({ type: 'MASS_UPDATE', payload: { ids: selectedIds, updates: { fontSize } } });
        };

        const handleMassLayerChange = (parentId) => {
            const nodeIds = selectedItems.filter(item => item.type === 'Узел').map(i => i.data.id);
            const targetLayer = layers[parentId];
            
            if (targetLayer) {
                const nodesToPlace = nodeIds.map(id => nodes[id]);
                const { updatesById, newLayerSize } = window.GeometryUtils.getSmartPlacement(nodesToPlace, targetLayer, nodes);

                dispatch({ type: 'UPDATE_LAYER', payload: { id: parentId, updates: { size: newLayerSize } } });
                dispatch({ type: 'MASS_UPDATE', payload: { ids: nodeIds, updatesById } });
            } else {
                const H = window.HierarchyUtils;
                const updatesById = {};
                nodeIds.forEach(id => {
                    const abs = H.getAbsolutePosition(id, nodes, layers);
                    updatesById[id] = { parentId, position: H.toRelativePosition(abs, parentId, nodes, layers) };
                });
                dispatch({ type: 'MASS_UPDATE', payload: { ids: nodeIds, updatesById } });
            }
            setActivePopover(null);
        };

        return (
            <div 
                ref={barRef}
                className="fixed top-16 left-1/2 -translate-x-1/2 z-40 max-w-[794px] w-[540px] max-w-[92vw] glass-panel rounded-2xl p-2.5 flex flex-col gap-2 shadow-2xl backdrop-blur-md bg-slate-900/90 border border-white/10 animate-in fade-in slide-in-from-top-2 duration-200"
                data-file="components/ContextActionBar.js"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 1. Верхний ярус: Бейдж массового выделения + Кнопка сброса */}
                <div className="flex items-center justify-between gap-2 px-1">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--accent-blue)]">
                        <div className="icon-list-check text-base"></div>
                        <span>Выбрано элементов: {selectedIds.length}</span>
                    </div>
                    <button 
                        className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                        onClick={() => dispatch({ type: 'SET_SELECTED', payload: null })}
                        title="Снять выделение (Esc)"
                    >
                        <div className="icon-x text-sm"></div>
                    </button>
                </div>

                {/* 2. Средний ярус: Кнопки массовых действий (40x40px) */}
                <div className="flex items-center gap-1.5 px-0.5 relative">
                    {/* Массовый цвет */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'color' ? 'bg-white/20 text-white border-white/30' : 'text-gray-300 hover:text-white'
                        }`}
                        title="Массово изменить цвет"
                        onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}
                    >
                        <div className="icon-palette text-lg text-amber-400"></div>
                    </button>

                    {/* Массовая типографика (Шрифт и Размер) */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'typography' ? 'bg-white/20 text-white border-white/30' : 'text-gray-300 hover:text-white'
                        }`}
                        title="Массово изменить шрифт и размер"
                        onClick={() => setActivePopover(activePopover === 'typography' ? null : 'typography')}
                    >
                        <div className="icon-type text-lg text-indigo-400"></div>
                    </button>

                    {/* Массовый слой (для узлов) */}
                    {isAllNodes && (
                        <button
                            className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                                activePopover === 'layer' ? 'bg-white/20 text-white border-white/30' : 'text-gray-300 hover:text-white'
                            }`}
                            title="Массово назначить на слой"
                            onClick={() => setActivePopover(activePopover === 'layer' ? null : 'layer')}
                        >
                            <div className="icon-layers text-lg text-sky-400"></div>
                        </button>
                    )}

                    {/* Массовая привязка к сетке */}
                    {hasNodesOrLayers && (
                        <button
                            className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                                currentSnap ? 'text-[var(--accent-blue)]' : 'text-gray-500'
                            }`}
                            title={currentSnap ? 'Сетка включена для всех (клик — выключить)' : 'Сетка выключена для всех (клик — включить)'}
                            onClick={() => dispatch({ type: 'MASS_UPDATE', payload: { ids: selectedIds, updates: { snapToGrid: !currentSnap } } })}
                        >
                            <div className="icon-layout-grid text-lg"></div>
                        </button>
                    )}

                    {/* Массовый стиль связей */}
                    {isAllLinks && (
                        <button
                            className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-gray-300 hover:text-white"
                            title={`Стиль связей: ${currentLinkStyle === 'orthogonal' ? 'Ортогональный (клик — Безье)' : 'Безье (клик — Ортогональный)'}`}
                            onClick={() => dispatch({ type: 'MASS_UPDATE', payload: { ids: selectedIds, updates: { linkStyle: currentLinkStyle === 'orthogonal' ? 'bezier' : 'orthogonal' } } })}
                        >
                            {currentLinkStyle === 'orthogonal' ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent-blue)]">
                                    <path d="M4 19h8v-14h8" />
                                    <circle cx="4" cy="19" r="2" fill="currentColor" />
                                    <circle cx="20" cy="5" r="2" fill="currentColor" />
                                </svg>
                            ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400">
                                    <path d="M4 19 C 10 19, 14 5, 20 5" />
                                    <circle cx="4" cy="19" r="2" fill="currentColor" />
                                    <circle cx="20" cy="5" r="2" fill="currentColor" />
                                </svg>
                            )}
                        </button>
                    )}

                    <div className="flex-1"></div>

                    {/* Массовое удаление */}
                    <button
                        className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/20 border-red-500/30 transition-colors"
                        title={`Удалить все выделенные элементы (${selectedIds.length})`}
                        onClick={() => {
                            if (window.confirm(`Вы уверены, что хотите удалить ${selectedIds.length} элементов?`)) {
                                dispatch({ type: 'DELETE_SELECTED' });
                            }
                        }}
                    >
                        <div className="icon-trash text-lg"></div>
                    </button>

                    {/* Поповер цвета для группы */}
                    {activePopover === 'color' && (
                        <div className="absolute left-0 top-12 w-64 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-xl p-3 shadow-2xl z-50 flex flex-col gap-2.5">
                            <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Массовый цвет</div>
                            <div className="grid grid-cols-7 gap-1.5">
                                {COLOR_PRESETS.map((c) => (
                                    <button
                                        key={c}
                                        className="w-6 h-6 rounded-md border border-white/20 hover:scale-110 transition-all hover:border-white"
                                        style={{ backgroundColor: c }}
                                        onClick={() => { handleMassColorChange(c); setActivePopover(null); }}
                                    />
                                ))}
                            </div>
                            <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                                <span className="text-[11px] text-gray-400">Свой цвет:</span>
                                <input
                                    type="color"
                                    className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
                                    defaultValue="#888888"
                                    onChange={(e) => handleMassColorChange(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {/* Поповер типографики для группы */}
                    {activePopover === 'typography' && (
                        <TypographyPopover
                            currentFont={massFont}
                            currentSize={massFontSize}
                            onFontChange={handleMassFontChange}
                            onSizeChange={handleMassSizeChange}
                            leftClass="left-6"
                        />
                    )}

                    {/* Поповер слоя для группы */}
                    {activePopover === 'layer' && (
                        <div className="absolute left-16 top-12 w-64 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-xl p-2.5 shadow-2xl z-50 flex flex-col gap-1.5 max-h-56 overflow-y-auto no-scrollbar">
                            <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider px-1">Назначить на слой</div>
                            <button
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-xs text-gray-300 hover:bg-white/10 transition-colors"
                                onClick={() => handleMassLayerChange('root')}
                            >
                                <div className="icon-home text-gray-400 text-xs"></div>
                                <span className="truncate flex-1">Главный холст (Root)</span>
                            </button>
                            {layers && Object.values(layers).map((l) => (
                                <button
                                    key={l.id}
                                    className="flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-xs text-gray-300 hover:bg-white/10 transition-colors"
                                    onClick={() => handleMassLayerChange(l.id)}
                                >
                                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: l.color || '#0284c7' }}></div>
                                    <span className="truncate flex-1">{l.name || l.id}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // === 2. РЕЖИМ ЕДИНИЧНОГО ВЫДЕЛЕНИЯ ===
    const id = selectedIds[0];
    const selectedNode = nodes[id];
    const selectedLink = links ? links[id] : null;
    const selectedPort = ports[id];
    const selectedLayer = layers ? layers[id] : null;

    if (!selectedNode && !selectedLink && !selectedPort && !selectedLayer) return null;

    // === А. ЕДИНИЧНЫЙ УЗЕЛ (Node) ===
    if (selectedNode) {
        const handleUpdateField = (field, value, skipHistory = false) => {
            dispatch({
                type: 'UPDATE_NODE',
                payload: { id: selectedNode.id, updates: { [field]: value }, skipHistory }
            });
        };

        const handleLayerChange = (targetLayerId) => {
            if (targetLayerId !== 'root' && layers && layers[targetLayerId]) {
                const targetLayer = layers[targetLayerId];
                const { updatesById, newLayerSize } = window.GeometryUtils.getSmartPlacement(
                    [selectedNode], targetLayer, nodes
                );
                dispatch({ type: 'UPDATE_LAYER', payload: { id: targetLayerId, updates: { size: newLayerSize } } });
                dispatch({ type: 'UPDATE_NODE', payload: {
                    id: selectedNode.id,
                    updates: updatesById[selectedNode.id] || { parentId: targetLayerId, position: { x: 40, y: 90 } }
                }});
            } else {
                dispatch({ type: 'REPARENT_ENTITY', payload: { id: selectedNode.id, newParentId: 'root' } });
            }
            setActivePopover(null);
        };

        return (
            <div 
                ref={barRef}
                className="fixed top-16 left-1/2 -translate-x-1/2 z-40 max-w-[794px] w-[600px] max-w-[92vw] glass-panel rounded-2xl p-2.5 flex flex-col gap-2.5 shadow-2xl backdrop-blur-md bg-slate-900/90 border border-white/10 animate-in fade-in slide-in-from-top-2 duration-200"
                data-file="components/ContextActionBar.js"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 1. Верхний ярус: Бейдж типа + Инлайн Название (с выбранным шрифтом) + ID + Закрыть */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-sky-500/20 text-sky-300 text-xs font-semibold shrink-0 border border-sky-500/30">
                        <div className="icon-box text-sm"></div>
                        <span>Узел</span>
                    </div>

                    <input 
                        type="text"
                        className="input-field flex-1 h-8 text-sm font-medium px-2.5 bg-black/40 border-white/10 focus:border-[var(--accent-blue)] focus:bg-black/60 transition-all rounded-lg"
                        style={{ fontFamily: selectedNode.fontFamily || 'inherit' }}
                        placeholder="Название узла..."
                        value={selectedNode.name || ''}
                        onChange={(e) => handleUpdateField('name', e.target.value, true)}
                        onBlur={() => {
                            dispatch({
                                type: 'COMMIT_HISTORY',
                                payload: { snapshot: { nodes, layers, ports, links }, logMessage: `Изменено имя узла: ${selectedNode.name}` }
                            });
                        }}
                    />

                    <CopyButton text={selectedNode.id} />

                    <button 
                        className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                        onClick={() => dispatch({ type: 'SET_SELECTED', payload: null })}
                        title="Снять выделение (Esc)"
                    >
                        <div className="icon-x text-sm"></div>
                    </button>
                </div>

                {/* 2. Средний ярус: Кнопки функций (40x40px) */}
                <div className="flex items-center gap-1.5 relative">
                    {/* Цвет */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'color' ? 'bg-white/20 text-white border-white/30' : 'text-gray-300 hover:text-white'
                        }`}
                        title="Цвет фона узла"
                        onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}
                    >
                        <div className="w-5 h-5 rounded-md border border-white/30 shadow-sm" style={{ backgroundColor: selectedNode.color || '#1e293b' }}></div>
                    </button>

                    {/* Типографика (Шрифт и Размер) */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'typography' ? 'bg-white/20 text-white border-white/30' : (selectedNode.fontFamily || selectedNode.fontSize ? 'text-indigo-400' : 'text-gray-300 hover:text-white')
                        }`}
                        title={`Шрифт: ${selectedNode.fontFamily || 'Inter'} (${selectedNode.fontSize || 14}px)`}
                        onClick={() => setActivePopover(activePopover === 'typography' ? null : 'typography')}
                    >
                        <div className="icon-type text-lg"></div>
                    </button>

                    {/* Медиа / Картинка */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'media' ? 'bg-white/20 text-white border-white/30' : (selectedNode.mediaUrl ? 'text-emerald-400' : 'text-gray-300 hover:text-white')
                        }`}
                        title="Изображение / Медиа"
                        onClick={() => setActivePopover(activePopover === 'media' ? null : 'media')}
                    >
                        <div className="icon-image text-lg"></div>
                    </button>

                    {/* Слой */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'layer' ? 'bg-white/20 text-white border-white/30' : (selectedNode.parentId && selectedNode.parentId !== 'root' ? 'text-sky-400' : 'text-gray-300 hover:text-white')
                        }`}
                        title="Назначить на слой"
                        onClick={() => setActivePopover(activePopover === 'layer' ? null : 'layer')}
                    >
                        <div className="icon-layers text-lg"></div>
                    </button>

                    {/* Группа */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'group' ? 'bg-white/20 text-white border-white/30' : (selectedNode.group ? 'text-amber-400' : 'text-gray-300 hover:text-white')
                        }`}
                        title="Группа / Классификация"
                        onClick={() => setActivePopover(activePopover === 'group' ? null : 'group')}
                    >
                        <div className="icon-tag text-lg"></div>
                    </button>

                    {/* Привязка к сетке */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            selectedNode.snapToGrid ? 'text-[var(--accent-blue)]' : 'text-gray-500'
                        }`}
                        title={selectedNode.snapToGrid ? 'Привязка к сетке: Вкл' : 'Привязка к сетке: Выкл'}
                        onClick={() => handleUpdateField('snapToGrid', !selectedNode.snapToGrid)}
                    >
                        <div className="icon-layout-grid text-lg"></div>
                    </button>

                    {/* Войти внутрь (Dive Into) */}
                    <button
                        className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                        title="Войти внутрь узла (Dive In)"
                        onClick={() => dispatch({ type: 'DIVE_INTO', payload: { id: selectedNode.id, name: selectedNode.name } })}
                    >
                        <div className="icon-folder-open text-lg"></div>
                    </button>

                    {/* Значок / Эмодзи */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'icon' ? 'bg-white/20 text-[var(--accent-blue)] border-white/30' : (selectedNode.icon ? 'text-amber-400' : 'text-gray-300 hover:text-white')
                        }`}
                        title="Выбрать значок / эмодзи"
                        onClick={() => setActivePopover(activePopover === 'icon' ? null : 'icon')}
                    >
                        <div className="icon-smile text-lg"></div>
                    </button>

                    <div className="flex-1"></div>

                    {/* Удалить */}
                    <button
                        className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/20 border-red-500/30 transition-colors"
                        title="Удалить узел"
                        onClick={() => {
                            if (window.confirm(`Удалить узел "${selectedNode.name || selectedNode.id}"?`)) {
                                dispatch({ type: 'REMOVE_NODE', payload: selectedNode.id });
                            }
                        }}
                    >
                        <div className="icon-trash text-lg"></div>
                    </button>

                    {/* Поповер: ЦВЕТ */}
                    {activePopover === 'color' && (
                        <div className="absolute left-0 top-12 w-64 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-xl p-3 shadow-2xl z-50 flex flex-col gap-2.5">
                            <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Цвет фона узла</div>
                            <div className="grid grid-cols-7 gap-1.5">
                                {COLOR_PRESETS.map((c) => (
                                    <button
                                        key={c}
                                        className={`w-6 h-6 rounded-md border transition-all ${
                                            (selectedNode.color || '#1a1a1a').toLowerCase() === c.toLowerCase()
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
                                    value={selectedNode.color || '#1a1a1a'}
                                    onChange={(e) => handleUpdateField('color', e.target.value)}
                                />
                                <span className="text-[10px] font-mono text-gray-400 flex-1 truncate">{selectedNode.color || '#1a1a1a'}</span>
                            </div>
                        </div>
                    )}

                    {/* Поповер: ТИПОГРАФИКА */}
                    {activePopover === 'typography' && (
                        <TypographyPopover
                            currentFont={selectedNode.fontFamily}
                            currentSize={selectedNode.fontSize}
                            onFontChange={(fontFamily) => handleUpdateField('fontFamily', fontFamily)}
                            onSizeChange={(fontSize) => handleUpdateField('fontSize', fontSize)}
                            leftClass="left-6"
                        />
                    )}

                    {/* Поповер: МЕДИА */}
                    {activePopover === 'media' && (
                        <div className="absolute left-16 top-12 w-64 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-xl p-3 shadow-2xl z-50 flex flex-col gap-2.5">
                            <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Изображение / Картинка</div>
                            <input
                                type="text"
                                placeholder="https://example.com/image.png"
                                className="input-field text-xs py-1"
                                value={selectedNode.mediaUrl || ''}
                                onChange={(e) => handleUpdateField('mediaUrl', e.target.value)}
                            />
                            {selectedNode.mediaUrl && (
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between text-[11px] text-gray-400">
                                        <span>Высота:</span>
                                        <span>{selectedNode.mediaHeight || 150}px</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="50"
                                        max="600"
                                        step="10"
                                        value={selectedNode.mediaHeight || 150}
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

                    {/* Поповер: СЛОЙ */}
                    {activePopover === 'layer' && (
                        <div className="absolute left-28 top-12 w-60 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-xl p-2.5 shadow-2xl z-50 flex flex-col gap-1.5 max-h-56 overflow-y-auto no-scrollbar">
                            <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider px-1">Назначить на слой</div>
                            <button
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-xs transition-colors ${
                                    (!selectedNode.parentId || selectedNode.parentId === 'root')
                                        ? 'bg-[var(--accent-blue)]/30 text-white font-medium border border-[var(--accent-blue)]/50'
                                        : 'text-gray-300 hover:bg-white/10'
                                }`}
                                onClick={() => handleLayerChange('root')}
                            >
                                <div className="icon-home text-gray-400 text-xs"></div>
                                <span className="truncate flex-1">Главный холст (Root)</span>
                            </button>
                            {layers && Object.values(layers).map((l) => (
                                <button
                                    key={l.id}
                                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-xs transition-colors ${
                                        selectedNode.parentId === l.id
                                            ? 'bg-[var(--accent-blue)]/30 text-white font-medium border border-[var(--accent-blue)]/50'
                                            : 'text-gray-300 hover:bg-white/10'
                                    }`}
                                    onClick={() => handleLayerChange(l.id)}
                                >
                                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: l.color || '#0284c7' }}></div>
                                    <span className="truncate flex-1">{l.name || l.id}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Поповер: ГРУППА */}
                    {activePopover === 'group' && (
                        <div className="absolute left-36 top-12 w-60 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-xl p-3 shadow-2xl z-50 flex flex-col gap-2">
                            <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Группа узла</div>
                            <input
                                type="text"
                                placeholder="Название группы..."
                                className="input-field text-xs py-1"
                                value={selectedNode.group || ''}
                                onChange={(e) => handleUpdateField('group', e.target.value)}
                            />
                        </div>
                    )}

                    {/* Поповер: ЗНАЧОК / ЭМОДЗИ */}
                    {activePopover === 'icon' && (
                        <div className="absolute left-48 top-12 w-64 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-xl p-3 shadow-2xl z-50 flex flex-col gap-2 max-h-64 overflow-y-auto custom-scrollbar">
                            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Иконка Lucide</div>
                            <div className="grid grid-cols-5 gap-1.5">
                                {ICON_PRESETS.map((item) => (
                                    <button
                                        key={item.id}
                                        className={`h-8 rounded border flex items-center justify-center transition-all ${
                                            selectedNode.icon === item.id
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
                                            selectedNode.icon === emoji
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

                {/* 3. Нижний ярус: Сразу открытое поле Описания (1 строка по умолчанию, авто-рост) */}
                <div className="flex flex-col gap-1 px-0.5">
                    <ContextDescriptionInput 
                        placeholder="Описание узла..."
                        value={selectedNode.content || ''}
                        onChange={(e) => handleUpdateField('content', e.target.value, true)}
                        onBlur={() => {
                            dispatch({
                                type: 'COMMIT_HISTORY',
                                payload: { snapshot: { nodes, layers, ports, links }, logMessage: `Изменено описание узла: ${selectedNode.name || selectedNode.id}` }
                            });
                        }}
                    />
                </div>
            </div>
        );
    }

    // === Б. ЕДИНИЧНЫЙ СЛОЙ (Layer) ===
    if (selectedLayer) {
        const handleUpdateLayer = (field, value) => {
            dispatch({ type: 'UPDATE_LAYER', payload: { id: selectedLayer.id, updates: { [field]: value } } });
        };

        return (
            <div 
                ref={barRef}
                className="fixed top-16 left-1/2 -translate-x-1/2 z-40 max-w-[794px] w-[560px] max-w-[92vw] glass-panel rounded-2xl p-2.5 flex flex-col gap-2.5 shadow-2xl backdrop-blur-md bg-slate-900/90 border border-white/10 animate-in fade-in slide-in-from-top-2 duration-200"
                data-file="components/ContextActionBar.js"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 1. Верхний ярус: Бейдж типа + Инлайн Название (с выбранным шрифтом) + ID + Закрыть */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/20 text-amber-300 text-xs font-semibold shrink-0 border border-amber-500/30">
                        <div className="icon-layers text-sm"></div>
                        <span>Слой</span>
                    </div>

                    <input 
                        type="text"
                        className="input-field flex-1 h-8 text-sm font-medium px-2.5 bg-black/40 border-white/10 focus:border-[var(--accent-blue)] focus:bg-black/60 transition-all rounded-lg"
                        style={{ fontFamily: selectedLayer.fontFamily || 'inherit' }}
                        placeholder="Название слоя..."
                        value={selectedLayer.name || ''}
                        onChange={(e) => handleUpdateLayer('name', e.target.value)}
                    />

                    <CopyButton text={selectedLayer.id} />

                    <button 
                        className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                        onClick={() => dispatch({ type: 'SET_SELECTED', payload: null })}
                        title="Снять выделение (Esc)"
                    >
                        <div className="icon-x text-sm"></div>
                    </button>
                </div>

                {/* 2. Средний ярус: Кнопки функций (40x40px) */}
                <div className="flex items-center gap-1.5 relative">
                    {/* Цвет слоя */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'color' ? 'bg-white/20 text-white border-white/30' : 'text-gray-300 hover:text-white'
                        }`}
                        title="Цвет границы и шапки слоя"
                        onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}
                    >
                        <div className="w-5 h-5 rounded-md border border-white/30 shadow-sm" style={{ backgroundColor: selectedLayer.color || '#ff9500' }}></div>
                    </button>

                    {/* Типографика слоя (Шрифт и Размер) */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'typography' ? 'bg-white/20 text-white border-white/30' : (selectedLayer.fontFamily || selectedLayer.fontSize ? 'text-indigo-400' : 'text-gray-300 hover:text-white')
                        }`}
                        title={`Шрифт: ${selectedLayer.fontFamily || 'Inter'} (${selectedLayer.fontSize || 14}px)`}
                        onClick={() => setActivePopover(activePopover === 'typography' ? null : 'typography')}
                    >
                        <div className="icon-type text-lg"></div>
                    </button>

                    {/* Привязка к сетке */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            selectedLayer.snapToGrid ? 'text-[var(--accent-blue)]' : 'text-gray-500'
                        }`}
                        title={selectedLayer.snapToGrid ? 'Привязка к сетке: Вкл' : 'Привязка к сетке: Выкл'}
                        onClick={() => handleUpdateLayer('snapToGrid', !selectedLayer.snapToGrid)}
                    >
                        <div className="icon-layout-grid text-lg"></div>
                    </button>

                    {/* Авто-подгонка (Fit-to-content) */}
                    <button
                        className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors"
                        title="Оптимизировать размер слоя под вложенные узлы (Fit-to-content)"
                        onClick={() => {
                            const layerNodes = Object.values(nodes).filter(n => n.parentId === selectedLayer.id);
                            if (layerNodes.length > 0 && window.GeometryUtils?.getSmartPlacement) {
                                const { updatesById, newLayerSize } = window.GeometryUtils.getSmartPlacement(layerNodes, selectedLayer, nodes);
                                dispatch({ type: 'UPDATE_LAYER', payload: { id: selectedLayer.id, updates: { size: newLayerSize } } });
                                dispatch({ type: 'MASS_UPDATE', payload: { ids: Object.keys(updatesById), updatesById } });
                            }
                        }}
                    >
                        <div className="icon-maximize-2 text-lg"></div>
                    </button>

                    <div className="flex-1"></div>

                    {/* Удалить слой */}
                    <button
                        className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/20 border-red-500/30 transition-colors"
                        title="Удалить слой"
                        onClick={() => {
                            if (window.confirm(`Удалить слой "${selectedLayer.name || selectedLayer.id}"?`)) {
                                dispatch({ type: 'REMOVE_LAYER', payload: selectedLayer.id });
                            }
                        }}
                    >
                        <div className="icon-trash text-lg"></div>
                    </button>

                    {/* Поповер цвета слоя */}
                    {activePopover === 'color' && (
                        <div className="absolute left-0 top-12 w-64 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-xl p-3 shadow-2xl z-50 flex flex-col gap-2.5">
                            <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Цвет слоя</div>
                            <div className="grid grid-cols-7 gap-1.5">
                                {COLOR_PRESETS.map((c) => (
                                    <button
                                        key={c}
                                        className="w-6 h-6 rounded-md border border-white/20 hover:scale-110 transition-all hover:border-white"
                                        style={{ backgroundColor: c }}
                                        onClick={() => { handleUpdateLayer('color', c); setActivePopover(null); }}
                                    />
                                ))}
                            </div>
                            <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                                <span className="text-[11px] text-gray-400">Свой цвет:</span>
                                <input
                                    type="color"
                                    className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
                                    value={selectedLayer.color || '#ff9500'}
                                    onChange={(e) => handleUpdateLayer('color', e.target.value)}
                                />
                                <span className="text-[10px] font-mono text-gray-400 flex-1 truncate">{selectedLayer.color || '#ff9500'}</span>
                            </div>
                        </div>
                    )}

                    {/* Поповер типографики слоя */}
                    {activePopover === 'typography' && (
                        <TypographyPopover
                            currentFont={selectedLayer.fontFamily}
                            currentSize={selectedLayer.fontSize}
                            onFontChange={(fontFamily) => handleUpdateLayer('fontFamily', fontFamily)}
                            onSizeChange={(fontSize) => handleUpdateLayer('fontSize', fontSize)}
                            leftClass="left-8"
                        />
                    )}
                </div>

                {/* 3. Нижний ярус: Поле Описания (1 строка по умолчанию, авто-рост) */}
                <div className="flex flex-col gap-1 px-0.5">
                    <ContextDescriptionInput 
                        placeholder="Описание назначения слоя..."
                        value={selectedLayer.content || ''}
                        onChange={(e) => handleUpdateLayer('content', e.target.value)}
                    />
                </div>
            </div>
        );
    }

    // === В. ЕДИНИЧНЫЙ ПОРТ (Port) ===
    if (selectedPort) {
        const handleUpdatePort = (field, value) => {
            dispatch({ type: 'UPDATE_PORT', payload: { id: selectedPort.id, updates: { [field]: value } } });
        };

        const EDGE_OPTIONS = [
            { id: 'left', label: 'Слева', icon: 'icon-arrow-left' },
            { id: 'right', label: 'Справа', icon: 'icon-arrow-right' },
            { id: 'top', label: 'Сверху', icon: 'icon-arrow-up' },
            { id: 'bottom', label: 'Снизу', icon: 'icon-arrow-down' }
        ];

        return (
            <div 
                ref={barRef}
                className="fixed top-16 left-1/2 -translate-x-1/2 z-40 max-w-[794px] w-[560px] max-w-[92vw] glass-panel rounded-2xl p-2.5 flex flex-col gap-2.5 shadow-2xl backdrop-blur-md bg-slate-900/90 border border-white/10 animate-in fade-in slide-in-from-top-2 duration-200"
                data-file="components/ContextActionBar.js"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 1. Верхний ярус: Бейдж типа + Инлайн Название (с выбранным шрифтом) + ID + Закрыть */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-purple-500/20 text-purple-300 text-xs font-semibold shrink-0 border border-purple-500/30">
                        <div className="icon-circle text-sm"></div>
                        <span>Порт</span>
                    </div>

                    <input 
                        type="text"
                        className="input-field flex-1 h-8 text-sm font-medium px-2.5 bg-black/40 border-white/10 focus:border-[var(--accent-blue)] focus:bg-black/60 transition-all rounded-lg"
                        style={{ fontFamily: selectedPort.fontFamily || 'inherit' }}
                        placeholder="Название порта..."
                        value={selectedPort.name || ''}
                        onChange={(e) => handleUpdatePort('name', e.target.value)}
                    />

                    <CopyButton text={selectedPort.id} />

                    <button 
                        className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                        onClick={() => dispatch({ type: 'SET_SELECTED', payload: null })}
                        title="Снять выделение (Esc)"
                    >
                        <div className="icon-x text-sm"></div>
                    </button>
                </div>

                {/* 2. Средний ярус: Кнопки функций (40x40px) */}
                <div className="flex items-center gap-1.5 relative">
                    {/* Тогл типа порта (Input / Output) */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            selectedPort.type === 'output' ? 'text-emerald-400' : 'text-blue-400'
                        }`}
                        title={`Тип: ${selectedPort.type === 'output' ? 'Выход (Output) — клик для смены на Вход' : 'Вход (Input) — клик для смены на Выход'}`}
                        onClick={() => handleUpdatePort('type', selectedPort.type === 'output' ? 'input' : 'output')}
                    >
                        <div className={`text-lg ${selectedPort.type === 'output' ? 'icon-log-out' : 'icon-log-in'}`}></div>
                    </button>

                    {/* Цвет порта */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'color' ? 'bg-white/20 text-white border-white/30' : 'text-gray-300 hover:text-white'
                        }`}
                        title="Цвет точки привязки"
                        onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}
                    >
                        <div className="w-4 h-4 rounded-full border border-white/40 shadow-sm" style={{ backgroundColor: selectedPort.color || '#3b82f6' }}></div>
                    </button>

                    {/* Типографика порта (Шрифт и Размер) */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'typography' ? 'bg-white/20 text-white border-white/30' : (selectedPort.fontFamily || selectedPort.fontSize ? 'text-indigo-400' : 'text-gray-300 hover:text-white')
                        }`}
                        title={`Шрифт: ${selectedPort.fontFamily || 'Inter'} (${selectedPort.fontSize || 12}px)`}
                        onClick={() => setActivePopover(activePopover === 'typography' ? null : 'typography')}
                    >
                        <div className="icon-type text-lg"></div>
                    </button>

                    {/* Грань узла (Edge) */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'edge' ? 'bg-white/20 text-white border-white/30' : 'text-gray-300 hover:text-white'
                        }`}
                        title={`Грань узла: ${selectedPort.edge || 'right'}`}
                        onClick={() => setActivePopover(activePopover === 'edge' ? null : 'edge')}
                    >
                        <div className="icon-compass text-lg text-sky-400"></div>
                    </button>

                    <div className="flex-1"></div>

                    {/* Удалить порт */}
                    <button
                        className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/20 border-red-500/30 transition-colors"
                        title="Удалить порт"
                        onClick={() => {
                            if (window.confirm(`Удалить порт "${selectedPort.name || selectedPort.id}"?`)) {
                                dispatch({ type: 'REMOVE_PORT', payload: selectedPort.id });
                            }
                        }}
                    >
                        <div className="icon-trash text-lg"></div>
                    </button>

                    {/* Поповер цвета порта */}
                    {activePopover === 'color' && (
                        <div className="absolute left-10 top-12 w-64 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-xl p-3 shadow-2xl z-50 flex flex-col gap-2.5">
                            <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Цвет порта</div>
                            <div className="grid grid-cols-7 gap-1.5">
                                {COLOR_PRESETS.map((c) => (
                                    <button
                                        key={c}
                                        className="w-6 h-6 rounded-md border border-white/20 hover:scale-110 transition-all hover:border-white"
                                        style={{ backgroundColor: c }}
                                        onClick={() => { handleUpdatePort('color', c); setActivePopover(null); }}
                                    />
                                ))}
                            </div>
                            <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                                <span className="text-[11px] text-gray-400">Свой цвет:</span>
                                <input
                                    type="color"
                                    className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
                                    value={selectedPort.color || '#3b82f6'}
                                    onChange={(e) => handleUpdatePort('color', e.target.value)}
                                />
                                <span className="text-[10px] font-mono text-gray-400 flex-1 truncate">{selectedPort.color || '#3b82f6'}</span>
                            </div>
                        </div>
                    )}

                    {/* Поповер типографики порта */}
                    {activePopover === 'typography' && (
                        <TypographyPopover
                            currentFont={selectedPort.fontFamily}
                            currentSize={selectedPort.fontSize}
                            onFontChange={(fontFamily) => handleUpdatePort('fontFamily', fontFamily)}
                            onSizeChange={(fontSize) => handleUpdatePort('fontSize', fontSize)}
                            leftClass="left-16"
                        />
                    )}

                    {/* Поповер грани (Edge) */}
                    {activePopover === 'edge' && (
                        <div className="absolute left-28 top-12 w-48 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-xl p-2 shadow-2xl z-50 flex flex-col gap-1">
                            <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider px-1 mb-1">Грань узла</div>
                            {EDGE_OPTIONS.map(edge => (
                                <button
                                    key={edge.id}
                                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs transition-colors ${
                                        selectedPort.edge === edge.id
                                            ? 'bg-[var(--accent-blue)] text-white font-medium'
                                            : 'text-gray-300 hover:bg-white/10'
                                    }`}
                                    onClick={() => { handleUpdatePort('edge', edge.id); setActivePopover(null); }}
                                >
                                    <div className={`${edge.icon} text-sm`}></div>
                                    <span>{edge.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* 3. Нижний ярус: Поле Описания (1 строка по умолчанию, авто-рост) */}
                <div className="flex flex-col gap-1 px-0.5">
                    <ContextDescriptionInput 
                        placeholder="Описание назначения порта или типа данных..."
                        value={selectedPort.content || ''}
                        onChange={(e) => handleUpdatePort('content', e.target.value)}
                    />
                </div>
            </div>
        );
    }

    // === Г. ЕДИНИЧНАЯ СВЯЗЬ (Link) ===
    if (selectedLink) {
        const handleUpdateLink = (field, value) => {
            dispatch({ type: 'UPDATE_LINK', payload: { id: selectedLink.id, updates: { [field]: value } } });
        };

        const isOrthogonal = (selectedLink.linkStyle || 'bezier') === 'orthogonal';

        return (
            <div 
                ref={barRef}
                className="fixed top-16 left-1/2 -translate-x-1/2 z-40 max-w-[794px] w-[560px] max-w-[92vw] glass-panel rounded-2xl p-2.5 flex flex-col gap-2.5 shadow-2xl backdrop-blur-md bg-slate-900/90 border border-white/10 animate-in fade-in slide-in-from-top-2 duration-200"
                data-file="components/ContextActionBar.js"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 1. Верхний ярус: Бейдж типа + Инлайн Название (с выбранным шрифтом) + ID + Закрыть */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-300 text-xs font-semibold shrink-0 border border-emerald-500/30">
                        <div className="icon-git-commit text-sm"></div>
                        <span>Связь</span>
                    </div>

                    <input 
                        type="text"
                        className="input-field flex-1 h-8 text-sm font-medium px-2.5 bg-black/40 border-white/10 focus:border-[var(--accent-blue)] focus:bg-black/60 transition-all rounded-lg"
                        style={{ fontFamily: selectedLink.fontFamily || 'inherit' }}
                        placeholder="Название связи..."
                        value={selectedLink.name || ''}
                        onChange={(e) => handleUpdateLink('name', e.target.value)}
                    />

                    <CopyButton text={selectedLink.id} />

                    <button 
                        className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                        onClick={() => dispatch({ type: 'SET_SELECTED', payload: null })}
                        title="Снять выделение (Esc)"
                    >
                        <div className="icon-x text-sm"></div>
                    </button>
                </div>

                {/* 2. Средний ярус: Кнопки функций (40x40px) */}
                <div className="flex items-center gap-1.5 relative">
                    {/* Стиль линии */}
                    <button
                        className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-gray-300 hover:text-white transition-colors"
                        title={`Стиль линии: ${isOrthogonal ? 'Ортогональная (Прямые углы) — клик для Безье' : 'Безье (Кривая) — клик для Ортогональной'}`}
                        onClick={() => handleUpdateLink('linkStyle', isOrthogonal ? 'bezier' : 'orthogonal')}
                    >
                        {isOrthogonal ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent-blue)]">
                                <path d="M4 19h8v-14h8" />
                                <circle cx="4" cy="19" r="2" fill="currentColor" />
                                <circle cx="20" cy="5" r="2" fill="currentColor" />
                            </svg>
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400">
                                <path d="M4 19 C 10 19, 14 5, 20 5" />
                                <circle cx="4" cy="19" r="2" fill="currentColor" />
                                <circle cx="20" cy="5" r="2" fill="currentColor" />
                            </svg>
                        )}
                    </button>

                    {/* Цвет линии */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'color' ? 'bg-white/20 text-white border-white/30' : 'text-gray-300 hover:text-white'
                        }`}
                        title="Цвет провода связи"
                        onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}
                    >
                        <div className="w-4 h-4 rounded-full border border-white/40 shadow-sm" style={{ backgroundColor: selectedLink.color || '#3b82f6' }}></div>
                    </button>

                    {/* Типографика связи (Шрифт и Размер) */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'typography' ? 'bg-white/20 text-white border-white/30' : (selectedLink.fontFamily || selectedLink.fontSize ? 'text-indigo-400' : 'text-gray-300 hover:text-white')
                        }`}
                        title={`Шрифт: ${selectedLink.fontFamily || 'Inter'} (${selectedLink.fontSize || 12}px)`}
                        onClick={() => setActivePopover(activePopover === 'typography' ? null : 'typography')}
                    >
                        <div className="icon-type text-lg"></div>
                    </button>

                    <div className="flex-1"></div>

                    {/* Удалить связь */}
                    <button
                        className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/20 border-red-500/30 transition-colors"
                        title="Удалить связь"
                        onClick={() => {
                            if (window.confirm(`Удалить связь "${selectedLink.name || selectedLink.id}"?`)) {
                                dispatch({ type: 'REMOVE_LINK', payload: selectedLink.id });
                            }
                        }}
                    >
                        <div className="icon-trash text-lg"></div>
                    </button>

                    {/* Поповер цвета связи */}
                    {activePopover === 'color' && (
                        <div className="absolute left-10 top-12 w-64 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-xl p-3 shadow-2xl z-50 flex flex-col gap-2.5">
                            <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Цвет линии связи</div>
                            <div className="grid grid-cols-7 gap-1.5">
                                {COLOR_PRESETS.map((c) => (
                                    <button
                                        key={c}
                                        className="w-6 h-6 rounded-md border border-white/20 hover:scale-110 transition-all hover:border-white"
                                        style={{ backgroundColor: c }}
                                        onClick={() => { handleUpdateLink('color', c); setActivePopover(null); }}
                                    />
                                ))}
                            </div>
                            <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                                <span className="text-[11px] text-gray-400">Свой цвет:</span>
                                <input
                                    type="color"
                                    className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
                                    value={selectedLink.color || '#3b82f6'}
                                    onChange={(e) => handleUpdateLink('color', e.target.value)}
                                />
                                <span className="text-[10px] font-mono text-gray-400 flex-1 truncate">{selectedLink.color || '#3b82f6'}</span>
                            </div>
                        </div>
                    )}

                    {/* Поповер типографики связи */}
                    {activePopover === 'typography' && (
                        <TypographyPopover
                            currentFont={selectedLink.fontFamily}
                            currentSize={selectedLink.fontSize}
                            onFontChange={(fontFamily) => handleUpdateLink('fontFamily', fontFamily)}
                            onSizeChange={(fontSize) => handleUpdateLink('fontSize', fontSize)}
                            leftClass="left-16"
                        />
                    )}
                </div>

                {/* 3. Нижний ярус: Поле Описания (1 строка по умолчанию, авто-рост) */}
                <div className="flex flex-col gap-1 px-0.5">
                    <ContextDescriptionInput 
                        placeholder="Описание передаваемых данных или протокола связи..."
                        value={selectedLink.content || ''}
                        onChange={(e) => handleUpdateLink('content', e.target.value)}
                    />
                </div>
            </div>
        );
    }

    return null;
}
