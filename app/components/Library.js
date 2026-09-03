// v14 (Фаза 4): «Слои» -> «Рамки» (frames); группировка узлов — по дорожке
// родителя (parentId), а не по владению слоем. Дерево (OutlinerTree) и клик
// по узлу — единственное место, где реализовано «клик по узлу с детьми
// открывает его дорожку» (§7.1.7 плана): здесь SET_SELECTED + CENTER_ON_ENTITY
// (сам откроет дорожку узла, если она нигде не открыта) + OPEN_LANE для его
// собственной дорожки, если у узла есть дети.
function Library({ projectId }) {
    const { state, dispatch } = useStore();
    const [objectTab, setObjectTab] = React.useState('tree');
    const H = window.HierarchyUtils;

    const isActiveProject = !projectId || projectId === state.activeProjectId;
    const { nodes, ports, links, past, future, historyLogs } = state;
    const frames = state.frames || {};
    const activeTab = state.ui.libraryTab || 'objects';

    React.useEffect(() => {
        if (state.selectedIds && state.selectedIds.length > 0) {
            const selectedId = state.selectedIds[0];
            if (frames && frames[selectedId]) setObjectTab('frames');
            else if (nodes && nodes[selectedId]) setObjectTab('nodes');
            else if (ports && ports[selectedId]) setObjectTab('ports');
            else if (links && links[selectedId]) setObjectTab('links');
        }
    }, [state.selectedIds]);

    if (!isActiveProject) {
        return (
            <div
                className="w-[350px] glass-panel rounded-xl border-[#444] shadow-2xl px-4 py-3 text-sm text-gray-400 cursor-pointer hover:text-white transition-colors"
                onClick={() => dispatch({ type: 'SET_ACTIVE_PROJECT', payload: projectId })}
                data-file="components/Library.js"
            >
                Проект неактивен — кликните, чтобы активировать и увидеть его объекты
            </div>
        );
    }

    const handleSelect = (id) => {
        const node = nodes[id];
        dispatch({ type: 'SET_SELECTED', payload: [id] });
        dispatch({ type: 'CENTER_ON_ENTITY', payload: id });
        if (node) {
            const hasChildren = (H.getChildrenByParent(nodes)[id] || []).length > 0;
            if (hasChildren) {
                dispatch({ type: 'OPEN_LANE', payload: { ownerId: id } });
                dispatch({ type: 'SET_ACTIVE_LANE', payload: id });
            }
        }
    };

    const laneLabel = (ownerId) => (ownerId === 'root' ? 'Главный холст' : ((nodes[ownerId] && nodes[ownerId].name) || ownerId));

    const ItemRow = ({ id, icon, color, name, subtitle, isHidden, onToggleHidden, depth }) => {
        const isSelected = (state.selectedIds || []).includes(id);
        return (
            <div
                className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs ${isSelected ? 'bg-[var(--accent-blue)]/30' : 'hover:bg-white/5'}`}
                style={{ paddingLeft: 8 + (depth || 0) * 12 }}
                onClick={() => handleSelect(id)}
            >
                {color ? <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} /> : <div className={`${icon} w-3 h-3 shrink-0 text-gray-400`} />}
                <span className={`truncate flex-1 ${isHidden ? 'line-through text-gray-500' : ''}`}>{name}</span>
                {subtitle && <span className="text-gray-500 text-[10px] shrink-0">{subtitle}</span>}
                {onToggleHidden && (
                    <button onClick={(e) => { e.stopPropagation(); onToggleHidden(); }} title={isHidden ? 'Показать' : 'Скрыть'}>
                        <div className={`${isHidden ? 'icon-eye-off' : 'icon-eye'} w-3 h-3 text-gray-400`} />
                    </button>
                )}
            </div>
        );
    };

    const renderContent = () => {
        if (activeTab === 'history') {
            return (
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-1">
                    <div className="text-xs text-gray-500 pl-2 py-1">— Начало —</div>
                    {(historyLogs || []).map((log, i) => (
                        <div key={i} className={`text-xs pl-2 py-1 border-l-2 ${i === historyLogs.length - 1 ? 'border-[var(--accent-blue)] text-white' : 'border-white/10 text-gray-400'}`}>
                            {log}
                        </div>
                    ))}
                </div>
            );
        }

        return (
            <div className="flex flex-col h-full">
                <div className="flex text-[11px] border-b border-white/10 shrink-0 overflow-x-auto no-scrollbar">
                    {[
                        ['tree', 'Дерево'],
                        ['frames', `Рамки (${Object.keys(frames).length})`],
                        ['nodes', `Узлы (${Object.keys(nodes).length})`],
                        ['ports', `Порты (${Object.keys(ports).length})`],
                        ['links', `Связи (${Object.keys(links).length})`]
                    ].map(([id, label]) => (
                        <button
                            key={id}
                            className={`px-2.5 py-1.5 whitespace-nowrap ${objectTab === id ? 'text-white border-b-2 border-[var(--accent-blue)]' : 'text-gray-500 hover:text-gray-300'}`}
                            onClick={() => setObjectTab(id)}
                        >{label}</button>
                    ))}
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {objectTab === 'tree' && <OutlinerTree onSelect={handleSelect} />}
                    {objectTab === 'frames' && Object.values(frames).map(f => (
                        <ItemRow key={f.id} id={f.id} color={f.color || '#0284c7'} name={f.name || f.id} subtitle={`${(f.members || []).length}`} />
                    ))}
                    {objectTab === 'nodes' && Object.values(nodes).map(n => (
                        <ItemRow key={n.id} id={n.id} color={n.color} name={n.name} subtitle={laneLabel(n.parentId || 'root')} isHidden={n.hidden}
                            onToggleHidden={() => dispatch({ type: 'UPDATE_NODE', payload: { id: n.id, updates: { hidden: !n.hidden } } })} />
                    ))}
                    {objectTab === 'ports' && Object.values(ports).map(p => (
                        <ItemRow key={p.id} id={p.id} icon="icon-circle" name={p.name || p.id} subtitle={p.type} />
                    ))}
                    {objectTab === 'links' && Object.values(links).map(l => (
                        <ItemRow key={l.id} id={l.id} icon="icon-git-commit-horizontal" name={l.name || l.id} />
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="w-[350px] glass-panel rounded-xl border-[#444] shadow-2xl max-h-[55vh] shrink-0 flex flex-col overflow-hidden" data-file="components/Library.js">
            <div className="flex items-center border-b border-white/10 shrink-0">
                <button
                    className={`flex-1 px-3 py-2 text-xs font-medium ${activeTab === 'objects' ? 'text-white bg-white/5' : 'text-gray-500 hover:text-gray-300'}`}
                    onClick={() => dispatch({ type: 'SET_LIBRARY_TAB', payload: 'objects' })}
                >Объекты</button>
                <button
                    className={`flex-1 px-3 py-2 text-xs font-medium flex items-center justify-center gap-1.5 ${activeTab === 'history' ? 'text-white bg-white/5' : 'text-gray-500 hover:text-gray-300'}`}
                    onClick={() => dispatch({ type: 'SET_LIBRARY_TAB', payload: 'history' })}
                >
                    История
                    {activeTab === 'history' && (
                        <button
                            className={`ml-1 ${past.length === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:text-white'}`}
                            disabled={past.length === 0}
                            onClick={(e) => { e.stopPropagation(); dispatch({ type: 'UNDO' }); }}
                            title="Отменить"
                        >
                            <div className="icon-undo-2 w-3.5 h-3.5" />
                        </button>
                    )}
                </button>
            </div>
            {renderContent()}
        </div>
    );
}

if (typeof window !== 'undefined') window.Library = Library;
if (typeof module !== 'undefined') module.exports = Library;
