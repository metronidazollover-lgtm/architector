// Outliner (этап 5.1 плана): рекурсивное дерево всей иерархии во вкладке «Дерево» библиотеки.
// Клик — переход и центрирование (через onSelect из Library), двойной клик — вход внутрь узла,
// drag-and-drop строки на строку — перевложение (REPARENT_ENTITY, цикл отклоняется).
// TreeRow вынесен на уровень файла: объявление внутри компонента заставляло React
// перемонтировать все строки при каждом setState, что рвёт живой drag-and-drop.
function OutlinerTreeRow({ entity, depth, ctx, visited = new Set() }) {
    const { state, dispatch, collapsedIds, setCollapsedIds, dropTargetId, setDropTargetId, canDropOn, handleDrop, childrenOf, onSelect } = ctx;

    const isLayer = !!(state.layers && state.layers[entity.id]);
    const kids = childrenOf(entity.id);
    const isCollapsed = collapsedIds[entity.id];
    const isSelected = state.selectedIds.includes(entity.id);
    const isCurrentCtx = state.currentContext === entity.id;
    const isDropTarget = dropTargetId === entity.id;

    const newVisited = new Set(visited);
    newVisited.add(entity.id);

    return (
        <div>
            <div
                draggable
                className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer text-sm transition-colors border-l-2
                    ${isSelected ? 'bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]' : 'text-gray-300 hover:bg-white/5'}
                    ${isCurrentCtx ? 'border-[var(--accent-blue)]' : 'border-transparent'}
                    ${isDropTarget ? 'bg-green-500/20 outline outline-1 outline-green-500' : ''}
                `}
                style={{ paddingLeft: `${8 + depth * 14}px` }}
                onClick={() => onSelect(entity.id)}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (state.nodes[entity.id]) dispatch({ type: 'GO_TO_CONTEXT', payload: entity.id });
                }}
                onDragStart={(e) => {
                    ctx.dragIdRef.current = entity.id;
                    e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                    if (canDropOn(entity.id)) {
                        e.preventDefault();
                        if (dropTargetId !== entity.id) setDropTargetId(entity.id);
                    }
                }}
                onDragLeave={() => { if (dropTargetId === entity.id) setDropTargetId(null); }}
                onDrop={(e) => { e.preventDefault(); handleDrop(entity.id); }}
                onDragEnd={() => { ctx.dragIdRef.current = null; setDropTargetId(null); }}
                title={`${entity.name}${kids.length ? ` — внутри: ${kids.length}` : ''}. Перетащите на другую строку, чтобы перевложить`}
            >
                <button
                    className={`w-4 shrink-0 text-gray-500 hover:text-white ${kids.length ? '' : 'invisible'}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        setCollapsedIds({ ...collapsedIds, [entity.id]: !isCollapsed });
                    }}
                >
                    <div className={`text-[10px] ${isCollapsed ? 'icon-chevron-right' : 'icon-chevron-down'}`}></div>
                </button>
                <div
                    className={`w-3 h-3 shrink-0 rounded-[3px] border border-white/10 ${isLayer ? 'border-dashed border-white/40' : ''}`}
                    style={{ backgroundColor: entity.color || '#333' }}
                ></div>
                <span className="truncate flex-1">{entity.name}</span>
                {kids.length > 0 && <span className="text-[10px] text-gray-500 shrink-0">{kids.length}</span>}
            </div>
            {!isCollapsed && kids.map(child => {
                if (newVisited.has(child.id)) return null;
                return (
                    <OutlinerTreeRow key={child.id} entity={child} depth={depth + 1} ctx={ctx} visited={newVisited} />
                );
            })}
        </div>
    );
}

function OutlinerTree({ onSelect }) {
    const { state, dispatch } = useStore();
    const [collapsedIds, setCollapsedIds] = React.useState({});
    const [dropTargetId, setDropTargetId] = React.useState(null);
    const dragIdRef = React.useRef(null);

    const H = window.HierarchyUtils;

    const childrenOf = (parentId) => [
        ...Object.values(state.layers || {}).filter(l => l && l.parentId === parentId),
        ...Object.values(state.nodes).filter(n => n && n.parentId === parentId)
    ];

    const canDropOn = (targetId) => {
        const dragId = dragIdRef.current;
        if (!dragId || dragId === targetId) return false;
        const dragged = state.nodes[dragId] || (state.layers && state.layers[dragId]);
        if (!dragged || dragged.parentId === targetId) return false;
        if (targetId !== 'root' && H.isDescendantOf(targetId, dragId, state.nodes, state.layers)) return false;
        return true;
    };

    const handleDrop = (targetId) => {
        if (canDropOn(targetId)) {
            dispatch({ type: 'REPARENT_ENTITY', payload: { id: dragIdRef.current, newParentId: targetId } });
        }
        dragIdRef.current = null;
        setDropTargetId(null);
    };

    const ctx = { state, dispatch, collapsedIds, setCollapsedIds, dropTargetId, setDropTargetId, dragIdRef, canDropOn, handleDrop, childrenOf, onSelect };
    const rootChildren = childrenOf('root');

    return (
        <div className="flex flex-col" data-file="components/OutlinerTree.js">
            <div
                className={`flex items-center gap-2 px-3 py-2 text-sm border-b border-[#333]/50 transition-colors
                    ${state.currentContext === 'root' ? 'text-[var(--accent-blue)]' : 'text-gray-400'}
                    ${dropTargetId === 'root' ? 'bg-green-500/20 outline outline-1 outline-green-500' : ''}
                `}
                onDragOver={(e) => {
                    if (canDropOn('root')) {
                        e.preventDefault();
                        if (dropTargetId !== 'root') setDropTargetId('root');
                    }
                }}
                onDragLeave={() => { if (dropTargetId === 'root') setDropTargetId(null); }}
                onDrop={(e) => { e.preventDefault(); handleDrop('root'); }}
                title="Сбросьте сюда, чтобы вытащить элемент на главный холст"
            >
                <div className="icon-house text-xs"></div>
                <span>Главный холст</span>
            </div>
            {rootChildren.length === 0 ? (
                <div className="text-gray-600 italic px-4 py-3 text-sm">Пусто</div>
            ) : (
                rootChildren.map(child => <OutlinerTreeRow key={child.id} entity={child} depth={0} ctx={ctx} />)
            )}
        </div>
    );
}
