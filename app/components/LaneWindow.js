// v14 (Фаза 4, заменяет LevelWindow.js): Окно — набор дорожек, положенных
// рядом (§1/§10 LANES_MODEL.md). В отличие от старого окна уровня (одна
// зафиксированная глубина на окно), здесь дорожки — это `win.lanes`, каждая —
// самостоятельная колонка (Lane.js), которая сама решает свою ширину/шапку/
// содержимое; LaneWindow отвечает только за раму окна целиком: общая шапка с
// названиями дорожек, перетаскивание/масштабирование окна, изоляция,
// разворот на весь экран, закрытие.
//
// Прокси-порты на рамке окна для межоконных связей — geometрия Фазы 5 (см.
// комментарий в Link.js); в Фазе 4 такие связи рисует CrossWindowLinkLayer в
// Canvas.js прямой линией в мировых координатах, без бордюрных прокси-точек.
const WIN_SEL_PREFIX = 'window:';

const computeWindowDerived = (view, windowId) => {
    const windows = view.windows || {};
    const win = windows[windowId];
    if (!win) return { ok: false };

    const nodes = view.nodes || {};
    const laneLabel = (ownerId) => {
        if (ownerId === 'root') return 'Проект';
        return (nodes[ownerId] && nodes[ownerId].name) || ownerId;
    };
    const lanesTitle = (win.lanes || []).map(laneLabel).join(' | ') || '(пусто)';
    const title = win.frameId
        ? `Рамка «${win.name || ((view.frames || {})[win.frameId] || {}).name || win.frameId}» ⊂ [${lanesTitle}]`
        : (win.name ? `${win.name} — [${lanesTitle}]` : `[${lanesTitle}]`);

    const selId = WIN_SEL_PREFIX + windowId;
    const selectedIds = view.selectedIds || [];
    const isSelected = selectedIds.includes(selId);
    const isIsolated = !!(view.containerIsolation && (view.containerIsolation.windowIds || []).includes(windowId));

    // Полностью свёрнутое окно: у всех его дорожек включён «глаз» по
    // отдельности — само окно тоже схлопывается в тонкую полосу (§10.6).
    const allLanesHidden = (win.lanes || []).length > 0
        && (win.lanes || []).every(l => (win.hidden || []).includes(l));

    return { ok: true, win, title, isSelected, isIsolated, allLanesHidden };
};

function LaneWindow(props) {
    if (typeof StoreEngine !== 'undefined') StoreEngine.profileRender('LaneWindow');
    const { windowId } = props;
    const dispatch = useProjectDispatch();
    const projectId = React.useContext(ProjectContext);

    const selectDerived = React.useCallback((view) => computeWindowDerived(view, windowId), [windowId]);
    const derived = useProjectSelector(selectDerived);
    if (!derived.ok) return null;
    const { win, title, isSelected, isIsolated, allLanesHidden } = derived;

    const activate = () => {
        const st = getProjectFlatView(projectId);
        if (projectId && projectId !== st.activeProjectId) dispatch({ type: 'SET_ACTIVE_PROJECT', payload: projectId });
    };

    const handleHeaderMouseDown = (e) => {
        if (e.target.closest('button')) return;
        if (e.button !== 0) return;
        e.stopPropagation();
        activate();
        const selId = WIN_SEL_PREFIX + windowId;
        if (e.shiftKey) dispatch({ type: 'TOGGLE_SELECTED', payload: selId });
        else dispatch({ type: 'SET_SELECTED', payload: selId });

        const startX = e.clientX, startY = e.clientY;
        const startPos = { ...win.position };
        const worldZoom = getProjectFlatView(projectId).canvas.zoom || 1;
        let hasMoved = false;

        const handleMove = (moveEvent) => {
            hasMoved = true;
            const dx = (moveEvent.clientX - startX) / worldZoom;
            const dy = (moveEvent.clientY - startY) / worldZoom;
            dispatch({ type: 'MOVE_WINDOW', payload: { windowId, position: { x: startPos.x + dx, y: startPos.y + dy } } });
        };
        const handleUp = () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
    };

    const handleResizeMouseDown = (e) => {
        e.stopPropagation();
        e.preventDefault();
        activate();
        const startX = e.clientX, startY = e.clientY;
        const startSize = { ...win.size };
        const worldZoom = getProjectFlatView(projectId).canvas.zoom || 1;

        const handleMove = (moveEvent) => {
            const dx = (moveEvent.clientX - startX) / worldZoom;
            const dy = (moveEvent.clientY - startY) / worldZoom;
            dispatch({ type: 'RESIZE_WINDOW', payload: { windowId, size: { w: startSize.w + dx, h: startSize.h + dy } } });
        };
        const handleUp = () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
    };

    const toggleIsolation = (e) => {
        e.stopPropagation();
        dispatch({ type: 'TOGGLE_CONTAINER_ISOLATION', payload: { kind: 'window', id: windowId } });
    };
    const toggleMaximize = (e) => {
        e.stopPropagation();
        const st = getProjectFlatView(projectId);
        const container = document.getElementById('canvas-container');
        const rect = container ? container.getBoundingClientRect() : { width: 1200, height: 800 };
        const zoom = st.canvas.zoom || 1;
        const viewport = {
            x: -st.canvas.offset.x / zoom, y: -st.canvas.offset.y / zoom,
            w: rect.width / zoom, h: rect.height / zoom
        };
        dispatch({ type: 'TOGGLE_WINDOW_MAXIMIZE', payload: { windowId, viewport } });
    };
    const closeWindow = (e) => {
        e.stopPropagation();
        dispatch({ type: 'CLOSE_WINDOW', payload: { windowId } });
    };

    // Колёсико над телом окна масштабирует ОБЩУЮ камеру всех его дорожек
    // (win.camera — одна на всё окно, §2.3 LANES_MODEL.md); Ctrl/Cmd+колёсико
    // не перехватывается — уходит наверх, в мировой зум Canvas.js.
    //
    // React 18 регистрирует onWheel как ПАССИВНЫЙ обработчик — e.preventDefault()
    // внутри него не работает и печатает предупреждение в консоль ("Unable to
    // preventDefault inside passive event listener invocation"), а страница
    // прокручивается сама. Вешаем нативный { passive: false } слушатель через
    // callback-ref — тело окна условно рендерится (сворачивается), поэтому
    // useEffect с зависимостями здесь не переживёт пересоздание DOM-узла
    // (тот же приём, что был у LevelWindow.js для зума колесом).
    const handleBodyWheel = (e) => {
        if (e.ctrlKey || e.metaKey) return;
        e.stopPropagation();
        e.preventDefault();
        const st = getProjectFlatView(projectId);
        const w = st.windows[windowId];
        if (!w) return;
        const camera = w.camera || { offset: { x: 0, y: 0 }, zoom: 1 };
        const worldZoom = st.canvas.zoom || 1;
        const rect = e.currentTarget.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) / worldZoom, mouseY = (e.clientY - rect.top) / worldZoom;
        const oldZoom = camera.zoom || 1;
        const newZoom = Math.min(5, Math.max(0.2, oldZoom - e.deltaY * 0.001));
        const oldOffset = camera.offset || { x: 0, y: 0 };
        const newOffset = {
            x: mouseX - ((mouseX - oldOffset.x) / oldZoom) * newZoom,
            y: mouseY - ((mouseY - oldOffset.y) / oldZoom) * newZoom
        };
        dispatch({ type: 'ZOOM_WINDOW', payload: { windowId, zoom: newZoom, offset: newOffset } });
    };

    // Средняя кнопка или Shift+ЛКМ по фону тела окна — панорама общей камеры.
    const handleBodyMouseDown = (e) => {
        if (e.target.closest('.node-entity, .frame-fragment, .lane-header')) return;
        if (!(e.button === 1 || (e.button === 0 && e.shiftKey))) return;
        e.stopPropagation();
        activate();
        const st0 = getProjectFlatView(projectId);
        const w0 = st0.windows[windowId];
        const startCamera = (w0 && w0.camera) || { offset: { x: 0, y: 0 }, zoom: 1 };
        const startX = e.clientX, startY = e.clientY;
        const worldZoom = st0.canvas.zoom || 1;
        const handleMove = (moveEvent) => {
            const dx = (moveEvent.clientX - startX) / worldZoom, dy = (moveEvent.clientY - startY) / worldZoom;
            dispatch({ type: 'PAN_WINDOW', payload: { windowId, offset: { x: (startCamera.offset.x || 0) + dx, y: (startCamera.offset.y || 0) + dy } } });
        };
        const handleUp = () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
    };

    const bodyElRef = React.useRef(null);
    const bodyWheelRef = React.useCallback((node) => {
        if (bodyElRef.current) bodyElRef.current.removeEventListener('wheel', handleBodyWheel);
        bodyElRef.current = node;
        if (node) node.addEventListener('wheel', handleBodyWheel, { passive: false });
    }, [handleBodyWheel]);

    // Ручное сворачивание (win.collapsed) прячет тело окна целиком — обратно
    // его разворачивает та же кнопка в шапке. «Схлопывание» от allLanesHidden
    // (§10.6 LANES_MODEL.md) — другое: оно только СЖИМАЕТ окно по высоте до
    // тонких полосок дорожек, но не должно прятать их совсем — иначе кнопку
    // «глаз», которой можно развернуть дорожку обратно, стало бы некуда
    // нажать (тело окна с этой кнопкой было бы вообще не отрендерено).
    const collapsed = !!win.collapsed;
    const borderColor = win.color || (win.frameId ? '#0284c7' : '#334155');
    const HIDDEN_LANE_H = 28;

    return (
        <div
            className="lane-window absolute rounded-2xl border-2"
            style={{
                left: win.position.x, top: win.position.y,
                width: win.size.w, height: collapsed ? 40 : (allLanesHidden ? 40 + HIDDEN_LANE_H : win.size.h),
                borderColor,
                backgroundColor: '#0a0d14',
                zIndex: isSelected ? 30 : 10,
                boxShadow: isSelected
                    ? `0 0 35px ${borderColor}88, 0 0 10px rgba(56,189,248,0.3)`
                    : `0 10px 30px rgba(0,0,0,0.5), 0 0 15px ${borderColor}33`
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <div
                className="h-10 px-3.5 flex items-center justify-between rounded-t-2xl border-b border-white/10 cursor-grab active:cursor-grabbing text-white text-sm"
                style={{ backgroundColor: borderColor }}
                onMouseDown={handleHeaderMouseDown}
            >
                <span className="truncate flex-1">{title}</span>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button onClick={toggleIsolation} title="Изолировать окно" className={isIsolated ? 'opacity-100' : 'opacity-70 hover:opacity-100'}>
                        <div className={isIsolated ? 'icon-scan-line w-4 h-4' : 'icon-scan w-4 h-4'} />
                    </button>
                    <button onClick={toggleMaximize} title="На весь экран" className="opacity-70 hover:opacity-100">
                        <div className={win.preMaximize ? 'icon-minimize w-4 h-4' : 'icon-maximize w-4 h-4'} />
                    </button>
                    <button onClick={closeWindow} title="Закрыть окно" className="opacity-70 hover:opacity-100 hover:text-red-300">
                        <div className="icon-x w-4 h-4" />
                    </button>
                </div>
            </div>
            {!collapsed && (
                <div ref={bodyWheelRef} className="flex flex-row overflow-hidden rounded-b-2xl" style={{ height: allLanesHidden ? HIDDEN_LANE_H : win.size.h - 40 }} onMouseDown={handleBodyMouseDown}>
                    {(win.lanes || []).map(ownerId => (
                        <Lane key={ownerId} windowId={windowId} ownerId={ownerId} />
                    ))}
                </div>
            )}
        </div>
    );
}

if (typeof window !== 'undefined') window.LaneWindow = LaneWindow;
if (typeof module !== 'undefined') module.exports = LaneWindow;
