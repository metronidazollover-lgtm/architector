// v14 (Фаза 4): FAB — контекст «+» теперь однозначен (§10 LANES_MODEL.md,
// HierarchyUtils.getAddContextV14): activeLaneId, либо дорожка единственного
// выделенного узла, либо root. «Слой» -> «Рамка»: двойной режим по наличию
// выделения В МОМЕНТ КЛИКА (§7.9 плана) — карточка/её контекст здесь ни при
// чём, в отличие от узла/ассистента. «Уровень» -> переделан в «Новое окно»
// (NEW_EMPTY_WINDOW, §7.1.4 плана) — не привязанное к дорожке окно про запас.
function Toolbar() {
    const { state, dispatch } = useStore();
    const [menuOpen, setMenuOpen] = React.useState(false);
    const closeTimeoutRef = React.useRef(null);
    const longPressTimerRef = React.useRef(null);
    const isLongPressRef = React.useRef(false);
    const touchStartPosRef = React.useRef({ x: 0, y: 0 });

    const openMenu = () => {
        if (closeTimeoutRef.current) { clearTimeout(closeTimeoutRef.current); closeTimeoutRef.current = null; }
        setMenuOpen(true);
    };
    const closeMenuWithDelay = (delay = 140) => {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = setTimeout(() => setMenuOpen(false), delay);
    };
    const closeMenuImmediately = () => {
        if (closeTimeoutRef.current) { clearTimeout(closeTimeoutRef.current); closeTimeoutRef.current = null; }
        setMenuOpen(false);
    };

    React.useEffect(() => () => {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    }, []);

    React.useEffect(() => {
        if (!menuOpen) return;
        const handlePointerDown = (e) => {
            if (!e.target.closest('[data-fab-root]')) closeMenuImmediately();
        };
        window.addEventListener('pointerdown', handlePointerDown);
        return () => window.removeEventListener('pointerdown', handlePointerDown);
    }, [menuOpen]);

    const H = window.HierarchyUtils;
    const hasProject = !!state.activeProjectId;

    const addCtx = !hasProject
        ? { ok: false, parentId: null, reason: 'no-project' }
        : (H && H.getAddContextV14 ? H.getAddContextV14(state) : { ok: true, parentId: 'root', reason: null });

    const singleSelId = (state.selectedIds && state.selectedIds.length === 1) ? state.selectedIds[0] : null;
    const selectedNode = hasProject && singleSelId ? state.nodes[singleSelId] || null : null;
    const selectedFrame = hasProject && singleSelId ? (state.frames && state.frames[singleSelId]) || null : null;
    const fabContext = selectedNode ? 'node' : (selectedFrame ? 'frame' : 'none');

    const addDisabledHint = addCtx.reason === 'no-project'
        ? 'Сначала создайте проект'
        : (addCtx.reason === 'multi-select' ? 'Выделите один узел, чтобы добавить рядом' : 'Недоступно');

    const addNode = () => {
        if (!addCtx.ok) return;
        const parentId = addCtx.parentId;
        const siblings = Object.values(state.nodes).filter(n => n && (n.parentId || 'root') === parentId);
        const pos = (H && H.getSmartLevelPlacement) ? H.getSmartLevelPlacement(parentId, siblings) : { x: 50 + siblings.length * 40, y: 80 };
        dispatch({ type: 'ADD_NODE', payload: { name: 'New Node', position: pos, size: { w: 200, h: 100 }, color: '#1a1a1a', shape: 'rectangle', parentId } });
    };

    const addChildNode = () => {
        if (!selectedNode) return;
        dispatch({ type: 'CREATE_NESTED_NODE', payload: { parentId: selectedNode.id } });
    };

    const addAssistant = () => {
        if (!hasProject) return;
        const parentId = addCtx.ok ? addCtx.parentId : 'root';
        dispatch({ type: 'ADD_NODE', payload: { name: '💬 AI Assistant Copilot', type: 'ai-agent', size: { w: 380, h: 480 }, color: '#3b0764', position: { x: 60, y: 60 }, parentId } });
    };
    const addChildAssistant = () => {
        if (!selectedNode) return;
        dispatch({ type: 'ADD_NODE', payload: { name: '💬 AI Assistant Copilot', type: 'ai-agent', size: { w: 380, h: 480 }, color: '#3b0764', position: { x: 40, y: 80 }, parentId: selectedNode.id } });
        dispatch({ type: 'OPEN_LANE', payload: { ownerId: selectedNode.id } });
        dispatch({ type: 'SET_ACTIVE_LANE', payload: selectedNode.id });
    };

    const addFrame = () => {
        if (!hasProject) return;
        const selNodeIds = (state.selectedIds || []).filter(id => state.nodes[id]);
        dispatch({ type: 'ADD_FRAME', payload: { members: selNodeIds } });
    };

    const toggleAddPortMode = () => {
        dispatch({ type: 'SET_MODE', payload: state.interactionMode === 'add-port' ? 'default' : 'add-port' });
    };

    const addNewWindow = () => {
        if (!hasProject) return;
        dispatch({ type: 'NEW_EMPTY_WINDOW' });
    };

    const addProject = () => dispatch({ type: 'ADD_PROJECT' });

    const RADIUS = 64;
    const isAssistantSelected = !!(selectedNode && selectedNode.type === 'ai-agent');
    const gateClass = (okClass) => (hasProject ? okClass : 'opacity-30 cursor-not-allowed text-gray-500');
    const DIM_CONTEXT = 'opacity-40 cursor-not-allowed text-gray-500';
    const irrelevantInContext = fabContext !== 'none';

    const nodeSat = fabContext === 'node'
        ? { title: `Добавить дочерний узел в дорожку «${selectedNode.name}»`, onClick: addChildNode, ok: true }
        : { title: addCtx.ok ? 'Добавить независимый узел' : addDisabledHint, onClick: addNode, ok: addCtx.ok };

    const assistantSat = fabContext === 'node'
        ? { title: `Добавить ассистента в дорожку «${selectedNode.name}»`, onClick: addChildAssistant, ok: true }
        : { title: hasProject ? 'Добавить ассистента' : addDisabledHint, onClick: addAssistant, ok: hasProject };

    const satellites = [
        { key: 'port', angleDeg: 260, icon: 'icon-circle', ok: hasProject && !irrelevantInContext, active: state.interactionMode === 'add-port', onClick: toggleAddPortMode, title: 'Режим добавления порта', colorClass: gateClass(irrelevantInContext ? DIM_CONTEXT : 'text-sky-300') },
        { key: 'frame', angleDeg: 220, icon: 'icon-square-dashed', ok: hasProject, onClick: addFrame, title: (state.selectedIds || []).some(id => state.nodes[id]) ? 'Создать рамку из выделенных узлов' : 'Создать пустую рамку', colorClass: gateClass('text-orange-300') },
        { key: 'window', angleDeg: 180, icon: 'icon-app-window', ok: hasProject, onClick: addNewWindow, title: 'Новое пустое окно (не закрывается само)', colorClass: gateClass('text-cyan-300') },
        { key: 'assistant', angleDeg: 140, icon: 'icon-bot', ok: assistantSat.ok, active: isAssistantSelected, onClick: assistantSat.onClick, title: assistantSat.title, colorClass: gateClass('text-purple-300') },
        { key: 'project', angleDeg: 100, icon: 'icon-globe', ok: true, onClick: addProject, title: 'Добавить проект', colorClass: irrelevantInContext ? DIM_CONTEXT : 'text-emerald-300' }
    ];

    const handleTouchStart = () => {
        touchStartPosRef.current = null;
        isLongPressRef.current = false;
        longPressTimerRef.current = setTimeout(() => {
            isLongPressRef.current = true;
            openMenu();
            if (navigator.vibrate) navigator.vibrate(25);
        }, 350);
    };
    const handleTouchMove = (e) => {
        const t = e.touches[0];
        if (!touchStartPosRef.current) { touchStartPosRef.current = { x: t.clientX, y: t.clientY }; return; }
        const dx = Math.abs(t.clientX - touchStartPosRef.current.x), dy = Math.abs(t.clientY - touchStartPosRef.current.y);
        if (dx > 10 || dy > 10) { clearTimeout(longPressTimerRef.current); }
    };
    const handleTouchEnd = (e) => {
        clearTimeout(longPressTimerRef.current);
        if (isLongPressRef.current && e.cancelable) e.preventDefault();
    };

    const fabOk = fabContext === 'node' ? true : (fabContext === 'frame' ? true : addCtx.ok);
    const fabDefaultAction = fabContext === 'node' ? addChildNode : addNode;
    const fabTitle = fabContext === 'node'
        ? `Добавить дочерний узел в дорожку «${selectedNode.name}»`
        : fabContext === 'frame'
            ? 'Быстрый пустой узел'
            : (addCtx.ok ? 'Быстрый пустой узел (наведите — ещё действия)' : addDisabledHint);

    const handleFabClick = () => {
        if (isLongPressRef.current) { isLongPressRef.current = false; return; }
        if (!fabOk) return;
        fabDefaultAction();
        closeMenuImmediately();
    };

    return (
        <div
            data-fab-root
            className="fixed top-1/2 -translate-y-1/2 right-4 z-40"
            onMouseEnter={openMenu}
            onMouseLeave={() => closeMenuWithDelay(140)}
        >
            <div
                className="absolute pointer-events-none"
                style={{ top: -75, left: -85, width: 145, height: 200, borderRadius: '100px 24px 24px 100px', pointerEvents: menuOpen ? 'auto' : 'none' }}
            />
            {satellites.map(sat => {
                const rad = (sat.angleDeg * Math.PI) / 180;
                const dx = Math.cos(rad) * RADIUS, dy = Math.sin(rad) * RADIUS;
                return (
                    <button
                        key={sat.key}
                        className={`absolute w-10 h-10 rounded-full glass-panel border border-white/20 flex items-center justify-center transition-all duration-200 ease-out shadow-lg ${sat.colorClass} ${sat.active ? 'ring-2 ring-white/60' : ''}`}
                        style={{
                            top: -20, left: -20,
                            transform: menuOpen ? `translate(${dx}px, ${dy}px)` : 'translate(0,0)',
                            opacity: menuOpen ? 1 : 0,
                            pointerEvents: menuOpen ? 'auto' : 'none'
                        }}
                        title={sat.title}
                        onClick={(e) => { e.stopPropagation(); if (!sat.ok) return; sat.onClick(); closeMenuImmediately(); }}
                        disabled={!sat.ok}
                    >
                        <div className={`${sat.icon} w-4 h-4`} />
                    </button>
                );
            })}
            <button
                className={`relative w-12 h-12 rounded-full flex items-center justify-center shadow-2xl transition-colors ${fabOk ? 'btn-primary' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                title={fabTitle}
                onClick={handleFabClick}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
            >
                <div className="icon-square-plus w-5 h-5" />
                {fabContext === 'node' && (
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-[9px] flex items-center justify-center text-white font-bold">+</span>
                )}
                {fabContext === 'frame' && (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center">
                        <div className="icon-square-dashed w-2.5 h-2.5 text-white" />
                    </div>
                )}
            </button>
        </div>
    );
}

if (typeof window !== 'undefined') window.Toolbar = Toolbar;
if (typeof module !== 'undefined') module.exports = Toolbar;
