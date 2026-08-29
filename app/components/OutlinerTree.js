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
    const isDropTarget = dropTargetId === entity.id;

    const newVisited = new Set(visited);
    newVisited.add(entity.id);

    return (
        <div>
            <div
                draggable
                className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer text-sm transition-colors border-l-2
                    ${isSelected ? 'bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border-l-transparent' : 'text-gray-300 hover:bg-white/5 border-l-transparent'}
                    ${isDropTarget ? 'bg-green-500/20 outline outline-1 outline-green-500' : ''}
                `}
                style={{ paddingLeft: `${8 + depth * 14}px` }}
                onClick={() => onSelect(entity.id)}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    onSelect(entity.id);
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
                <span className="text-[10px] font-mono text-gray-500 bg-white/5 px-1 py-0.2 rounded shrink-0">L{window.HierarchyUtils ? window.HierarchyUtils.getEntityLevel(entity.id, state.nodes, state.layers) : depth}</span>
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

    // Модель v11: для узла потомки — это его подопечные с другого уровня (ownerId),
    // для слоя и корня — обычные дети по координатному контейнеру (parentId).
    const childrenOf = (parentId) => {
        const isNode = !!(state.nodes && state.nodes[parentId]);
        const nodePorts = isNode
            ? ((H && H.getPortsByNodeId)
                ? (H.getPortsByNodeId(state.ports)[parentId] || [])
                : Object.values(state.ports || {}).filter(p => p && p.nodeId === parentId))
            : [];
        const belongs = (e) => isNode
            ? e.ownerId === parentId
            : ((e.parentId || 'root') === parentId && !e.ownerId);
        return [
            ...Object.values(state.layers || {}).filter(l => l && belongs(l)),
            ...Object.values(state.nodes).filter(n => n && belongs(n)),
            ...nodePorts
        ];
    };


    const canDropOn = (targetId) => {
        const dragId = dragIdRef.current;
        if (!dragId || dragId === targetId) return false;
        const dragged = state.nodes[dragId] || (state.layers && state.layers[dragId]);
        if (!dragged || dragged.parentId === targetId) return false;
        if (targetId !== 'root' && H.isDescendantOf(targetId, dragId, state.nodes, state.layers)) return false;
        // Слой в ветке перетаскиваемого узла принять его не может
        // («стань собственным ребёнком») — цель не подсвечивается
        if (state.layers && state.layers[targetId] && state.nodes[dragId] && H.canTransferToLayer) {
            if (!H.canTransferToLayer(dragId, targetId, state.nodes, state.layers).ok) return false;
        }
        // Кросс-уровневый сброс (перенос между уровнями) доступен только при
        // включённом режиме Drag&Drop — иначе цель не подсвечивается.
        // Сброс на «Главный холст» (root) меняет только контейнер (уровень
        // задаётся владельцем) — он не гейтится.
        if (!(state.ui && state.ui.dragDropMode) && H.getEntityLevel && targetId !== 'root') {
            const targetLvl = H.getEntityLevel(targetId, state.nodes, state.layers);
            const dragLvl = H.getEntityLevel(dragId, state.nodes, state.layers);
            const targetIsLayer = !!(state.layers && state.layers[targetId]);
            if (targetIsLayer) {
                if (targetLvl !== dragLvl) return false; // слой чужого уровня
            } else if (targetLvl + 1 !== dragLvl) {
                return false; // вложение в узел = смена уровня ребёнка
            }
        }
        return true;
    };

    const handleDrop = (targetId) => {
        if (canDropOn(targetId)) {
            const dragId = dragIdRef.current;
            const H = window.HierarchyUtils;
            const isTargetLayer = !!(state.layers && state.layers[targetId]);
            const isDragNode = !!(state.nodes && state.nodes[dragId]);
            // Сброс узла на слой ЧУЖОГО уровня — это перенос между уровнями:
            // узел усыновляет ветка слоя, поддерево и связи переезжают сами
            // (TRANSFER_NODE). В остальных случаях — обычное перевложение.
            if (isTargetLayer && isDragNode && H && H.getEntityLevel &&
                H.getEntityLevel(targetId, state.nodes, state.layers) !== H.getEntityLevel(dragId, state.nodes, state.layers)) {
                dispatch({ type: 'TRANSFER_NODE', payload: { id: dragId, targetLayerId: targetId } });
            } else {
                dispatch({ type: 'REPARENT_ENTITY', payload: { id: dragId, newParentId: targetId } });
            }
        }
        dragIdRef.current = null;
        setDropTargetId(null);
    };

    const ctx = { state, dispatch, collapsedIds, setCollapsedIds, dropTargetId, setDropTargetId, dragIdRef, canDropOn, handleDrop, childrenOf, onSelect };
    const rootChildren = childrenOf('root');

    return (
        <div className="flex flex-col" data-file="components/OutlinerTree.js">
            <div
                className={`flex items-center gap-2 px-3 py-2 text-sm border-b border-[#333]/50 transition-colors text-gray-300
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
