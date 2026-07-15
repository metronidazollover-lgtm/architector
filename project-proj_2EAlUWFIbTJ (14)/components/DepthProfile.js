// Профиль глубины (этап 4.1 плана): вертикальный срез пути по иерархии.
// Одна строка = один уровень пути (root -> ... -> текущий контекст).
// В строке — все «братья» уровня (дети контекста этого уровня); узел пути подсвечен.
// Клик по брату: перейти на его уровень и центрироваться. Двойной клик: войти внутрь.
function DepthProfile() {
    const { state, dispatch } = useStore();
    const [expandedLevels, setExpandedLevels] = React.useState({});
    const MAX_VISIBLE = 10;

    const rows = React.useMemo(() => state.breadcrumbs.map((crumb, level) => {
        const siblings = [
            ...Object.values(state.layers || {}).filter(l => l && l.parentId === crumb.id),
            ...Object.values(state.nodes).filter(n => n && n.parentId === crumb.id && !n.hidden)
        ];
        return { crumb, level, siblings, pathChildId: state.breadcrumbs[level + 1]?.id };
    }), [state.breadcrumbs, state.nodes, state.layers]);

    const isOpen = state.ui.depthProfileOpen !== false;

    if (!isOpen) {
        // Свёрнутый режим: полоска-градусник глубины, точка на уровень
        return (
            <button
                className="glass-panel rounded-lg px-2 py-3 flex flex-col items-center gap-2 border-[#444] hover:border-[#666] transition-colors"
                onClick={() => dispatch({ type: 'SET_UI', payload: { depthProfileOpen: true } })}
                title="Развернуть профиль глубины"
            >
                {rows.map((row, i) => (
                    <div
                        key={row.crumb.id}
                        className={`rounded-full ${i === rows.length - 1 ? 'w-2.5 h-2.5 bg-[var(--accent-blue)]' : 'w-1.5 h-1.5 bg-gray-500'}`}
                    ></div>
                ))}
            </button>
        );
    }

    const jumpTo = (levelCrumbId, entity) => {
        dispatch({ type: 'GO_TO_CONTEXT', payload: levelCrumbId });
        dispatch({ type: 'CENTER_ON_ENTITY', payload: entity.id });
    };

    const diveInto = (entity) => {
        if (state.nodes[entity.id]) {
            dispatch({ type: 'GO_TO_CONTEXT', payload: entity.id });
        }
    };

    return (
        <div className="glass-panel rounded-lg w-64 max-h-[45vh] flex flex-col border-[#444] overflow-hidden" data-file="components/DepthProfile.js">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#333] shrink-0">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                    <div className="icon-layers"></div>
                    <span>Профиль глубины</span>
                </div>
                <button
                    className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
                    onClick={() => dispatch({ type: 'SET_UI', payload: { depthProfileOpen: false } })}
                    title="Свернуть в полоску"
                >
                    <div className="icon-chevrons-right text-xs"></div>
                </button>
            </div>

            <div className="overflow-y-auto no-scrollbar px-3 py-2 flex flex-col gap-2.5">
                {rows.map((row) => {
                    const isCurrent = row.level === rows.length - 1;
                    const expanded = expandedLevels[row.level];
                    const visible = expanded ? row.siblings : row.siblings.slice(0, MAX_VISIBLE);
                    const hiddenCount = row.siblings.length - visible.length;

                    return (
                        <div key={row.crumb.id}>
                            <div className={`text-[10px] mb-1 truncate ${isCurrent ? 'text-[var(--accent-blue)]' : 'text-gray-500'}`}>
                                Уровень {row.level} · {row.crumb.name}{isCurrent ? ' · вы здесь' : ''}
                            </div>
                            {row.siblings.length === 0 ? (
                                <div className="text-[10px] text-gray-600 italic">пусто</div>
                            ) : (
                                <div className="flex flex-wrap gap-1">
                                    {visible.map(entity => {
                                        const isOnPath = entity.id === row.pathChildId;
                                        const isLayer = !!(state.layers && state.layers[entity.id]);
                                        const stats = window.HierarchyUtils.getChildrenStats(state.nodes, state.layers, state.ports, state.links, entity.id);
                                        return (
                                            <button
                                                key={entity.id}
                                                className={`px-1.5 py-1 rounded text-[10px] leading-none max-w-[90px] truncate transition-colors border
                                                    ${isOnPath
                                                        ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/20 text-blue-200'
                                                        : 'border-[#333] bg-white/5 text-gray-400 hover:text-white hover:border-[#555]'}
                                                    ${isLayer ? 'border-dashed' : ''}
                                                `}
                                                onClick={() => jumpTo(row.crumb.id, entity)}
                                                onDoubleClick={() => diveInto(entity)}
                                                title={`${entity.name}${stats.total > 0 ? ` — внутри: ${stats.total} элем., связей: ${stats.linkCount}. Двойной клик — войти` : ''}`}
                                            >
                                                {entity.name}
                                                {stats.total > 0 && <span className="text-[var(--accent-blue)] ml-0.5">•</span>}
                                            </button>
                                        );
                                    })}
                                    {hiddenCount > 0 && (
                                        <button
                                            className="px-1.5 py-1 rounded text-[10px] leading-none border border-[#333] bg-white/5 text-gray-500 hover:text-white transition-colors"
                                            onClick={() => setExpandedLevels({ ...expandedLevels, [row.level]: true })}
                                            title={`Показать ещё ${hiddenCount}`}
                                        >
                                            +{hiddenCount}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
