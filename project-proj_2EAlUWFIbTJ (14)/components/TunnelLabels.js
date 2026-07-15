// Туннельные метки (этап 5.3a плана): внутри контекста узла по краям экрана
// показаны связи, пересекающие границу контекста. Слева входящие, справа исходящие.
// Клик — переход к внешнему узлу на его уровне. Только чтение: рендер связей не трогаем.
function TunnelLabels() {
    const { state, dispatch } = useStore();

    const boundary = React.useMemo(() => {
        if (state.currentContext === 'root' || !state.nodes[state.currentContext]) return null;
        const b = window.HierarchyUtils.getBoundaryLinks(
            state.currentContext, state.nodes, state.layers, state.ports, state.links
        );
        return (b.incoming.length || b.outgoing.length) ? b : null;
    }, [state.currentContext, state.nodes, state.layers, state.ports, state.links]);

    if (!boundary) return null;

    const goToOuter = (outerNodeId) => {
        const outer = state.nodes[outerNodeId];
        if (!outer) return;
        let targetContext = outer.parentId || 'root';
        // Слой — визуальный фрейм, контекстом служит его родитель
        if (state.layers && state.layers[targetContext]) {
            targetContext = state.layers[targetContext].parentId || 'root';
        }
        dispatch({ type: 'GO_TO_CONTEXT', payload: targetContext });
        dispatch({ type: 'SET_SELECTED', payload: outerNodeId });
        dispatch({ type: 'CENTER_ON_ENTITY', payload: outerNodeId });
    };

    const TunnelButton = ({ item, direction }) => {
        const outer = state.nodes[item.outerNodeId];
        const inner = state.nodes[item.innerNodeId];
        if (!outer) return null;
        return (
            <button
                className="glass-panel rounded-lg px-3 py-1.5 text-xs flex items-center gap-2 border-[#444] text-gray-300 hover:text-white hover:border-[var(--accent-blue)] transition-colors max-w-[220px]"
                onClick={() => goToOuter(item.outerNodeId)}
                title={`${direction === 'in' ? 'Входящая' : 'Исходящая'} связь${item.link.name ? ` «${item.link.name}»` : ''}: ${inner?.name || '?'} ${direction === 'in' ? '←' : '→'} ${outer.name}. Клик — к внешнему узлу`}
            >
                <span
                    className={`shrink-0 ${direction === 'in' ? 'icon-arrow-right' : 'icon-arrow-right'}`}
                    style={{ color: item.link.color || '#888' }}
                ></span>
                <span className="truncate">{direction === 'in' ? `от: ${outer.name}` : `к: ${outer.name}`}</span>
            </button>
        );
    };

    return (
        <React.Fragment>
            {boundary.incoming.length > 0 && (
                <div className="absolute left-20 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-1.5 items-start" data-file="components/TunnelLabels.js">
                    <div className="text-[10px] text-gray-500 uppercase pl-1">Снаружи → сюда</div>
                    {boundary.incoming.map(item => (
                        <TunnelButton key={item.link.id} item={item} direction="in" />
                    ))}
                </div>
            )}
            {boundary.outgoing.length > 0 && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-1.5 items-end">
                    <div className="text-[10px] text-gray-500 uppercase pr-1">Отсюда → наружу</div>
                    {boundary.outgoing.map(item => (
                        <TunnelButton key={item.link.id} item={item} direction="out" />
                    ))}
                </div>
            )}
        </React.Fragment>
    );
}
