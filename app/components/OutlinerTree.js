// v14 (Фаза 4): дерево обозревателя — по parentId напрямую (без слоёв/портов
// как узлов дерева, они убраны из этого представления — см. §10 плана,
// обозреватель проекта показывает структуру ветвления, а не всё подряд).
// Поиск по имени — прямо здесь (§7.5 плана), без отдельного оверлея на холсте.
const MIME_OUTLINER = 'application/x-architector-outliner';

function matchesQuery(name, query) {
    if (!query) return true;
    return (name || '').toLowerCase().includes(query.toLowerCase());
}

function OutlinerRow({ entity, depth, onSelect, query, visited, dragCtx }) {
    const { state, dispatch } = useProjectStore();
    const [collapsed, setCollapsed] = React.useState(false);
    const H = window.HierarchyUtils;

    const byParent = H.getChildrenByParent(state.nodes);
    const allDescendants = React.useMemo(() => {
        const out = [];
        const stack = [entity.id];
        const seen = new Set();
        while (stack.length) {
            const id = stack.pop();
            if (seen.has(id)) continue;
            seen.add(id);
            (byParent[id] || []).forEach(n => { out.push(n); stack.push(n.id); });
        }
        return out;
    }, [state.nodes, entity.id]);

    const kids = byParent[entity.id] || [];
    const selfMatches = matchesQuery(entity.name, query);
    const hasMatchingDescendant = query && allDescendants.some(n => matchesQuery(n.name, query));
    if (query && !selfMatches && !hasMatchingDescendant) return null;

    const isSelected = (state.selectedIds || []).includes(entity.id);
    const dropTarget = state.dragGesture && state.dragGesture.target;
    const isDropTarget = dragCtx.overId === entity.id;
    const isCollapsed = collapsed && !hasMatchingDescendant;

    const canDropOn = (targetId) => {
        const dragId = dragCtx.ref.current;
        if (!dragId || dragId === targetId) return false;
        const dragNode = state.nodes[dragId];
        if (!dragNode || (dragNode.parentId || 'root') === targetId) return false;
        if (!(state.ui && state.ui.dragDropMode)) return false;
        return H.canReparentToV14(dragId, targetId, state.nodes).ok;
    };

    return (
        <div className="select-none">
            <div
                className={`flex items-center gap-1 py-1 px-1 rounded cursor-pointer text-xs ${isSelected ? 'bg-[var(--accent-blue)]/30' : 'hover:bg-white/5'} ${isDropTarget ? 'bg-emerald-500/30 outline outline-1 outline-emerald-400' : ''}`}
                style={{ paddingLeft: 8 + depth * 14 }}
                draggable
                onDragStart={(e) => { dragCtx.ref.current = entity.id; e.dataTransfer.setData(MIME_OUTLINER, entity.id); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(e) => { if (!canDropOn(entity.id)) return; e.preventDefault(); if (dragCtx.overId !== entity.id) dragCtx.setOverId(entity.id); }}
                onDragLeave={() => { if (dragCtx.overId === entity.id) dragCtx.setOverId(null); }}
                onDrop={(e) => {
                    e.preventDefault();
                    if (canDropOn(entity.id)) {
                        const ids = (state.selectedIds || []).includes(dragCtx.ref.current) ? state.selectedIds.filter(id => state.nodes[id]) : [dragCtx.ref.current];
                        dispatch({ type: 'REPARENT_ENTITY', payload: { ids, targetParentId: entity.id } });
                    }
                    dragCtx.setOverId(null);
                }}
                onDragEnd={() => { dragCtx.ref.current = null; dragCtx.setOverId(null); }}
                onClick={() => onSelect(entity.id)}
                title={`${entity.name} — ${kids.length} детей`}
            >
                <button
                    className={kids.length ? '' : 'invisible'}
                    onClick={(e) => { e.stopPropagation(); setCollapsed(c => !c); }}
                >
                    <div className={`${isCollapsed ? 'icon-chevron-right' : 'icon-chevron-down'} w-3 h-3 text-gray-500`} />
                </button>
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: entity.color || '#333' }} />
                <span className="text-gray-500 font-mono text-[10px] shrink-0">D{depth}</span>
                <span className="truncate flex-1">{entity.name}</span>
                {kids.length > 0 && <span className="text-gray-500 text-[10px] shrink-0">{kids.length}</span>}
            </div>
            {!isCollapsed && kids.map(child => (
                <OutlinerRow key={child.id} entity={child} depth={depth + 1} onSelect={onSelect} query={query} visited={visited} dragCtx={dragCtx} />
            ))}
        </div>
    );
}

function OutlinerTree({ onSelect }) {
    const { state, dispatch } = useProjectStore();
    const [query, setQuery] = React.useState('');
    const dragRef = React.useRef(null);
    const [overId, setOverId] = React.useState(null);
    const dragCtx = { ref: dragRef, overId, setOverId };
    const H = window.HierarchyUtils;

    const byParent = H.getChildrenByParent(state.nodes);
    const rootChildren = byParent['root'] || [];

    const canDropOnRoot = () => {
        const dragId = dragRef.current;
        if (!dragId) return false;
        const dragNode = state.nodes[dragId];
        if (!dragNode || (dragNode.parentId || 'root') === 'root') return false;
        if (!(state.ui && state.ui.dragDropMode)) return false;
        return H.canReparentToV14(dragId, 'root', state.nodes).ok;
    };

    return (
        <div className="flex flex-col h-full">
            <div className="p-1.5 shrink-0">
                <input
                    className="input-field w-full text-xs py-1"
                    placeholder="Поиск по имени узла..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar px-1">
                <div
                    className={`flex items-center gap-1 py-1 px-1 rounded cursor-pointer text-xs font-medium hover:bg-white/5 ${overId === 'root' ? 'bg-emerald-500/30 outline outline-1 outline-emerald-400' : ''}`}
                    onDragOver={(e) => { if (!canDropOnRoot()) return; e.preventDefault(); if (overId !== 'root') setOverId('root'); }}
                    onDragLeave={() => { if (overId === 'root') setOverId(null); }}
                    onDrop={(e) => {
                        e.preventDefault();
                        if (canDropOnRoot()) {
                            const ids = (state.selectedIds || []).includes(dragRef.current) ? state.selectedIds.filter(id => state.nodes[id]) : [dragRef.current];
                            dispatch({ type: 'REPARENT_ENTITY', payload: { ids, targetParentId: 'root' } });
                        }
                        setOverId(null);
                    }}
                    onClick={() => { dispatch({ type: 'SET_ACTIVE_LANE', payload: 'root' }); dispatch({ type: 'OPEN_LANE', payload: { ownerId: 'root' } }); }}
                >
                    <div className="icon-home w-3 h-3 text-sky-400" />
                    <span>Главный холст</span>
                </div>
                {rootChildren.map(child => (
                    <OutlinerRow key={child.id} entity={child} depth={1} onSelect={onSelect} query={query} visited={new Set()} dragCtx={dragCtx} />
                ))}

                {Object.keys(state.frames || {}).length > 0 && (
                    <div className="mt-3 border-t border-white/10 pt-2">
                        <div className="text-[10px] uppercase text-gray-500 px-1 mb-1">Рамки</div>
                        {Object.values(state.frames).map(f => (
                            <div
                                key={f.id}
                                className={`flex items-center gap-1 py-1 px-1 rounded cursor-pointer text-xs hover:bg-white/5 ${(state.selectedIds || []).includes(f.id) ? 'bg-[var(--accent-blue)]/30' : ''}`}
                                onClick={() => { dispatch({ type: 'SET_SELECTED', payload: [f.id] }); dispatch({ type: 'SET_ACTIVE_FRAME', payload: f.id }); dispatch({ type: 'CENTER_ON_ENTITY', payload: f.id }); }}
                            >
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: f.color || '#0284c7' }} />
                                <span className="truncate flex-1">{f.name || f.id}</span>
                                <span className="text-gray-500 text-[10px]">{(f.members || []).length}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

if (typeof window !== 'undefined') window.OutlinerTree = OutlinerTree;
if (typeof module !== 'undefined') module.exports = OutlinerTree;
