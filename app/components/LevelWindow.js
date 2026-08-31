// Компонент перемещаемого окна уровня (Spatial Level Window).
// Располагается в глобальном мировом пространстве холста.
// Внутренне бесконечен: содержит собственный координатный вьюпорт с узлами и слоями данного уровня.

function LevelWindow({ windowData, nodes, layers, ports, links, selectedIds, isolatedIds, interactionMode, dispatch, state = {}, worldZoom = 1 }) {
    if (typeof StoreEngine !== 'undefined') StoreEngine.profileRender('LevelWindow');
    if (!windowData) return null;
    const s = state || {};
    const projectId = React.useContext(ProjectContext);
    const windowId = windowData.id;
    const { index, name, color, position = { x: 0, y: 0 }, size = { w: 1000, h: 700 }, innerOffset = { x: 0, y: 0 }, innerZoom = 1, isCollapsed, fontFamily, fontSize } = windowData;
    // Обе формы: каноническая (по id окна) и легаси (по номеру уровня) —
    // selectedIds персистится, старые значения обязаны продолжать работать
    const isSelected = !!(selectedIds && (
        selectedIds.includes('window:' + (windowData && windowData.id))
        || selectedIds.includes(`level-window-${index}`)
    ));
    const isIsolated = s.levelHideNeighbors && s.levelHideNeighbors[index];
    const globalEyeOn = s.levelHideNeighbors && s.levelHideNeighbors[0];

    const H = window.HierarchyUtils;
    // Фокус-набор веток уровня (массив; toFocusList понимает и легаси-строку)
    const focusList = H && H.toFocusList
        ? H.toFocusList(s.levelFocusParentId && s.levelFocusParentId[index])
        : [];

    // Видимость сущностей: единые правила в HierarchyUtils.isEntityVisible —
    // глаз Главного холста глобален и приоритетен, локальные глаза действуют
    // в пределах своего уровня, когда глобальный выключен.
    const hideDicts = [s.levelHideNeighbors, s.levelFocusParentId];

    // Канонический идентификатор окна в выделении: по стабильному id окна,
    // уникальному между проектами (номер уровня для этого не годится — уровень 1
    // есть у каждого проекта).
    const winSelectionId = 'window:' + windowData.id;
    const isWindowSelected = !!(selectedIds && (selectedIds.includes(winSelectionId) || selectedIds.includes(`level-window-${index}`)));
    const isWindowIsolated = !!(s.containerIsolation
        && (s.containerIsolation.windowIds || []).includes(windowData.id));

    // === Culling по вьюпорту ===
    // Сущности за пределами экрана не создаются вовсе: браузер обязан размещать
    // и держать каждый элемент страницы, и на крупных сценах именно это, а не
    // логика, становится потолком. Запас в один экран гасит мигание при панораме.
    // Безусловные исключения — участники жеста и выделенное: их размонтирование
    // оборвало бы перетаскивание и подсветку.
    const screenSize = (typeof window !== 'undefined')
        ? { w: window.innerWidth || 1600, h: window.innerHeight || 900 }
        : { w: 1600, h: 900 };
    const visibleRect = React.useMemo(() => {
        if (!H || !H.getVisibleLocalRect || isCollapsed) return null;
        return H.getVisibleLocalRect(
            { position, size },
            { innerOffset, innerZoom },
            (state && state.canvas) || { offset: { x: 0, y: 0 }, zoom: 1 },
            screenSize
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [H, isCollapsed, position, size, innerOffset, innerZoom, state && state.canvas, screenSize.w, screenSize.h]);

    // Окно целиком за экраном — его содержимое не нужно
    const windowOffScreen = !isCollapsed && visibleRect === null;

    const alwaysKeep = React.useMemo(() => {
        const keep = new Set(selectedIds || []);
        const g = state && state.dragGesture;
        if (g && Array.isArray(g.ids)) g.ids.forEach(id => keep.add(id));
        return keep;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedIds, state && state.dragGesture]);

    const isCulled = React.useCallback((entity) => {
        if (!entity) return true;
        if (alwaysKeep.has(entity.id)) return false;
        if (windowOffScreen) return true;
        if (!visibleRect || !H || !H.isRectVisible) return false;
        const pos = H.getLocalPosition
            ? H.getLocalPosition(entity.id, nodes, layers)
            : (entity.position || { x: 0, y: 0 });
        return !H.isRectVisible(pos, entity.size, visibleRect);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [alwaysKeep, windowOffScreen, visibleRect, H, nodes, layers]);

    // Фильтрация узлов, принадлежащих данному уровню
    const levelNodes = React.useMemo(() => {
        const result = {};
        // Сущности своего уровня берутся из общего индекса: перебирать все узлы
        // проекта в каждом окне — лишняя работа, разложение по уровням одинаково
        // для всех окон и считается один раз на поколение состояния.
        const bucket = (H && H.getEntitiesByLevel) ? (H.getEntitiesByLevel(nodes, layers)[index] || { nodes: [], layers: [] }) : null;
        const candidates = bucket ? bucket.nodes : Object.values(nodes || {});
        candidates.forEach(node => {
            if (!node) return;
            const nId = node.id;
            if (!bucket) {
                const lvl = H ? H.getEntityLevel(nId, nodes, layers) : 0;
                if (lvl !== index) return;
            }
            // Если включена глобальная изоляция (Toolbar)
            if (isolatedIds && isolatedIds.length > 0 && !isolatedIds.includes(nId)) return;
            // Изоляция веток («глаз»)
            if (H && H.isEntityVisible && !H.isEntityVisible(nId, state)) return;
            if (isCulled(node)) return; // за пределами экрана — не создаём
            result[nId] = node;
        });
        return result;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodes, layers, index, isolatedIds, H, isCulled, ...hideDicts]);

    // Фильтрация слоев, принадлежащих данному уровню
    const levelLayers = React.useMemo(() => {
        const result = {};
        const bucketL = (H && H.getEntitiesByLevel) ? (H.getEntitiesByLevel(nodes, layers)[index] || { nodes: [], layers: [] }) : null;
        const candidatesL = bucketL ? bucketL.layers : Object.values(layers || {});
        candidatesL.forEach(layer => {
            if (!layer) return;
            const lId = layer.id;
            if (!bucketL) {
                const lvl = H ? H.getEntityLevel(lId, nodes, layers) : 0;
                if (lvl !== index) return;
            }
            if (isolatedIds && isolatedIds.length > 0 && !isolatedIds.includes(lId)) return;
            if (H && H.isEntityVisible && !H.isEntityVisible(lId, state)) return;
            if (isCulled(layer)) return; // за пределами экрана — не создаём
            result[lId] = layer;
        });
        return result;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layers, nodes, index, isolatedIds, H, isCulled, ...hideDicts]);

    // Внутриуровневые связи (оба конца на этом уровне)
    const intraLevelLinks = React.useMemo(() => {
        const linkList = Array.isArray(links) ? links : Object.values(links || {});
        return linkList.filter(l => {
            if (!l) return false;
            const sp = ports && ports[l.sourcePortId];
            const tp = ports && ports[l.targetPortId];
            if (!sp || !tp) return false;
            const sLvl = H ? H.getEntityLevel(sp.nodeId, nodes, layers) : 0;
            const tLvl = H ? H.getEntityLevel(tp.nodeId, nodes, layers) : 0;
            if (sLvl !== index || tLvl !== index) return false;
            // Связи скрытых изоляцией сущностей не рисуем — иначе линии висят над пустотой
            const sEntity = levelNodes[sp.nodeId] || levelLayers[sp.nodeId];
            const tEntity = levelNodes[tp.nodeId] || levelLayers[tp.nodeId];
            return !!(sEntity && tEntity);
        });
    }, [links, ports, nodes, layers, index, H, levelNodes, levelLayers]);

    // Прокси-порты на границах рамки для межуровневых связей.
    // Прокси скрытого изоляцией узла тоже скрывается (его магистраль не рисуется).
    const proxyPorts = React.useMemo(() => {
        const internal = (H && H.getProxyPortsForWindow) ? H.getProxyPortsForWindow(index, state) : [];
        // Кросс-проектные прокси (Фаза 6.1): `state` — плоский вид ЭТОГО
        // проекта, но он несёт глобальные поля мультисостояния как есть
        // (mergeActiveView/projectFlatView спредят их поверх), включая
        // projects/crossProjectLinks — отдельный «корневой» стейт не нужен.
        const external = (H && H.getExternalProxyPortsForWindow && projectId)
            ? H.getExternalProxyPortsForWindow(windowId, projectId, state)
            : [];
        // Штекеры непримирённых гейтвеев (Фаза 6.2): второй половины связи
        // сейчас нет — только внутренний отрезок до рамки, без магистрали.
        const pending = (H && H.getPendingGatewayProxiesForWindow && projectId)
            ? H.getPendingGatewayProxiesForWindow(windowId, projectId, state)
            : [];
        const list = internal.concat(external, pending);
        if (!H || !H.isEntityVisible) return list;
        return list.filter(proxy => {
            const myPort = ports && ports[proxy.myPortId];
            if (myPort && myPort.nodeId && !H.isEntityVisible(myPort.nodeId, state)) return false;
            // Второй конец связи: узел другого уровня (мастер-порты без nodeId не фильтруем).
            // Для внешнего прокси и штекера второй конец либо в ДРУГОМ проекте,
            // либо вовсе не загружен — видимость нечем проверить, кроме своей стороны.
            if (proxy.isExternal || proxy.isPending) return true;
            const link = proxy.link;
            if (link) {
                const otherPortId = link.sourcePortId === proxy.myPortId ? link.targetPortId : link.sourcePortId;
                const otherPort = ports && ports[otherPortId];
                if (otherPort && otherPort.nodeId && !H.isEntityVisible(otherPort.nodeId, state)) return false;
            }
            return true;
        });
    }, [index, state, H, ports, projectId, windowId]);

    // 1. Dragging окна по мировому пространству за шапку
    const handleMouseDownHeader = (e) => {
        if (e.button !== 0) return;
        // Если кликнули по кнопкам в шапке, не начинаем drag
        if (e.target.closest('button') || e.target.closest('input')) return;

        e.stopPropagation();
        if (projectId && s && projectId !== s.activeProjectId) {
            dispatch({ type: 'SET_ACTIVE_PROJECT', payload: projectId });
        }
        dispatch({ type: 'SET_SELECTED', payload: winSelectionId });

        const startX = e.clientX;
        const startY = e.clientY;
        const startPos = { ...position };
        let latestPos = { ...startPos };

        const handleMouseMove = (moveEvent) => {
            const dx = (moveEvent.clientX - startX) / worldZoom;
            const dy = (moveEvent.clientY - startY) / worldZoom;
            latestPos = { x: Math.round(startPos.x + dx), y: Math.round(startPos.y + dy) };
            dispatch({
                type: 'MOVE_LEVEL_WINDOW',
                payload: {
                    windowId,
                    index,
                    position: latestPos,
                    skipHistory: true
                }
            });
        };

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            dispatch({
                type: 'MOVE_LEVEL_WINDOW',
                payload: { windowId, index, position: latestPos, skipHistory: false }
            });
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    // 2. Resize окна за правый нижний угол
    const handleMouseDownResize = (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        if (projectId && s && projectId !== s.activeProjectId) {
            dispatch({ type: 'SET_ACTIVE_PROJECT', payload: projectId });
        }

        const startX = e.clientX;
        const startY = e.clientY;
        const startSize = { ...size };
        let latestSize = { ...startSize };

        const handleMouseMove = (moveEvent) => {
            const dw = (moveEvent.clientX - startX) / worldZoom;
            const dh = (moveEvent.clientY - startY) / worldZoom;
            latestSize = {
                w: Math.max(450, Math.round(startSize.w + dw)),
                h: Math.max(300, Math.round(startSize.h + dh))
            };
            dispatch({
                type: 'RESIZE_LEVEL_WINDOW',
                payload: {
                    windowId,
                    index,
                    size: latestSize,
                    skipHistory: true
                }
            });
        };

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            dispatch({
                type: 'RESIZE_LEVEL_WINDOW',
                payload: { windowId, index, size: latestSize, skipHistory: false }
            });
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const viewportRef = React.useRef(null);
    const winRef = React.useRef({ innerZoom: innerZoom || 1, innerOffset: innerOffset || { x: 0, y: 0 } });
    winRef.current = { innerZoom: innerZoom || 1, innerOffset: innerOffset || { x: 0, y: 0 } };

    // index, windowId и dispatch читаются из ref, чтобы wheel-обработчик, привязанный к
    // DOM-узлу, всегда видел актуальные значения (levelIndex окна может
    // сдвинуться при удалении нижележащего уровня).
    const indexRef = React.useRef(index);
    indexRef.current = index;
    const windowIdRef = React.useRef(windowId);
    windowIdRef.current = windowId;
    const dispatchRef = React.useRef(dispatch);
    dispatchRef.current = dispatch;

    // 3. Индивидуальный зум колесом мыши над окном уровня.
    //
    // ВАЖНО: подписка живёт через callback-ref, а НЕ через useEffect.
    // Тело окна рендерится условно ({!isCollapsed && ...}), поэтому DOM-узел
    // вьюпорта пересоздаётся при каждом цикле свернуть/развернуть (а при
    // загрузке свёрнутым его нет вовсе). useEffect с deps [index, dispatch]
    // здесь уже приводил к «мёртвому» зуму: эффект не перезапускался, и новый
    // узел оставался без слушателя. Callback-ref вызывается самим React при
    // появлении узла (node) и при его удалении (null) — подписка гарантированно
    // следует за жизненным циклом DOM-узла, какой бы ни была причина пересоздания.
    const wheelCleanupRef = React.useRef(null);
    const setViewportRef = React.useCallback((node) => {
        if (wheelCleanupRef.current) {
            wheelCleanupRef.current();
            wheelCleanupRef.current = null;
        }
        viewportRef.current = node;
        if (!node) return;

        const handleWheel = (e) => {
            // Ctrl/Cmd + колесо = зум общего холста, а не этого окна.
            // Не гасим и не обрабатываем событие — пусть всплывёт до
            // canvas-container, где Canvas сделает мировой зум (и вызовет
            // preventDefault, чтобы браузер не зумил страницу).
            if (e.ctrlKey || e.metaKey) return;

            // Проверяем скролл внутри текстовых полей
            const scrollable = e.target.closest('.overflow-y-auto');
            if (scrollable && scrollable.scrollHeight > scrollable.clientHeight) {
                const isScrollingUp = e.deltaY < 0;
                const isScrollingDown = e.deltaY > 0;
                const atTop = scrollable.scrollTop <= 0;
                const atBottom = Math.abs(scrollable.scrollTop + scrollable.clientHeight - scrollable.scrollHeight) <= 2;
                if ((isScrollingUp && !atTop) || (isScrollingDown && !atBottom)) {
                    return;
                }
            }

            e.preventDefault();
            e.stopPropagation();

            const currentZ = winRef.current.innerZoom;
            const currentOff = winRef.current.innerOffset;

            const zoomSensitivity = 0.0012;
            const delta = -e.deltaY * zoomSensitivity;
            const newZ = Math.min(Math.max(0.2, currentZ + delta), 4.0);

            const rect = node.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const ratio = newZ / currentZ;
            const newOffsetX = mouseX - (mouseX - currentOff.x) * ratio;
            const newOffsetY = mouseY - (mouseY - currentOff.y) * ratio;

            const newOff = { x: newOffsetX, y: newOffsetY };
            winRef.current = { innerZoom: newZ, innerOffset: newOff };

            dispatchRef.current({
                type: 'UPDATE_LEVEL_PROPERTIES',
                payload: {
                    windowId: windowIdRef.current,
                    index: indexRef.current,
                    updates: {
                        innerZoom: newZ,
                        innerOffset: newOff
                    },
                    skipHistory: true
                }
            });
        };

        node.addEventListener('wheel', handleWheel, { passive: false });
        // React 18: ref-callback не умеет возвращать cleanup — отписка вручную
        // при следующем вызове с null/новым узлом.
        wheelCleanupRef.current = () => node.removeEventListener('wheel', handleWheel);
    }, []);

    // 4. Индивидуальные тач-жесты (1 палец = панорамирование, 2 пальца = Pinch-to-Zoom)
    const handleTouchStartViewport = (e) => {
        if (e.target.closest('.node-entity') || e.target.closest('.layer-entity') || e.target.closest('.port-entity')) {
            return;
        }

        e.stopPropagation();

        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const startX = touch.clientX;
            const startY = touch.clientY;
            const startOff = { ...(winRef.current.innerOffset || { x: 0, y: 0 }) };

            const handleTouchMove = (moveEvent) => {
                if (moveEvent.touches.length === 1) {
                    moveEvent.preventDefault();
                    moveEvent.stopPropagation();
                    const t = moveEvent.touches[0];
                    const dx = (t.clientX - startX) / worldZoom;
                    const dy = (t.clientY - startY) / worldZoom;
                    const newOff = { x: startOff.x + dx, y: startOff.y + dy };
                    winRef.current.innerOffset = newOff;

                    dispatch({
                        type: 'UPDATE_LEVEL_PROPERTIES',
                        payload: {
                            windowId,
                            index,
                            updates: { innerOffset: newOff },
                            skipHistory: true
                        }
                    });
                }
            };

            const handleTouchEnd = () => {
                window.removeEventListener('touchmove', handleTouchMove);
                window.removeEventListener('touchend', handleTouchEnd);
                window.removeEventListener('touchcancel', handleTouchEnd);
            };

            window.addEventListener('touchmove', handleTouchMove, { passive: false });
            window.addEventListener('touchend', handleTouchEnd);
            window.addEventListener('touchcancel', handleTouchEnd);

        } else if (e.touches.length === 2) {
            const vp = viewportRef.current;
            const rect = vp ? vp.getBoundingClientRect() : { left: 0, top: 0 };

            const getDist = (touches) => Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY);
            const getCenter = (touches) => ({
                x: (touches[1].clientX + touches[0].clientX) / 2 - rect.left,
                y: (touches[1].clientY + touches[0].clientY) / 2 - rect.top
            });

            const startDist = getDist(e.touches);
            const startZoom = winRef.current.innerZoom;
            const startOff = winRef.current.innerOffset;
            const startCenter = getCenter(e.touches);

            const handleTouchMove = (moveEvent) => {
                if (moveEvent.touches.length === 2) {
                    moveEvent.preventDefault();
                    moveEvent.stopPropagation();
                    const currentDist = getDist(moveEvent.touches);
                    const currentCenter = getCenter(moveEvent.touches);

                    const zoomRatio = currentDist / startDist;
                    const newZ = Math.min(Math.max(0.2, startZoom * zoomRatio), 4.0);

                    const currentRatio = newZ / startZoom;
                    const newOffsetX = currentCenter.x - (startCenter.x - startOff.x) * currentRatio;
                    const newOffsetY = currentCenter.y - (startCenter.y - startOff.y) * currentRatio;

                    const newOff = { x: newOffsetX, y: newOffsetY };
                    winRef.current = { innerZoom: newZ, innerOffset: newOff };

                    dispatch({
                        type: 'UPDATE_LEVEL_PROPERTIES',
                        payload: {
                            windowId,
                            index,
                            updates: { innerZoom: newZ, innerOffset: newOff },
                            skipHistory: true
                        }
                    });
                }
            };

            const handleTouchEnd = () => {
                window.removeEventListener('touchmove', handleTouchMove);
                window.removeEventListener('touchend', handleTouchEnd);
                window.removeEventListener('touchcancel', handleTouchEnd);
            };

            window.addEventListener('touchmove', handleTouchMove, { passive: false });
            window.addEventListener('touchend', handleTouchEnd);
            window.addEventListener('touchcancel', handleTouchEnd);
        }
    };

    // 5. Внутреннее панорамирование окна мышью (Shift+LMB или Middle click)
    const handleMouseDownViewport = (e) => {
        // Если клик по узлу/порту - даем сработать их обработчикам
        if (e.target.closest('.node-entity') || e.target.closest('.layer-entity') || e.target.closest('.port-entity')) {
            return;
        }

        if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
            e.stopPropagation();
            const startX = e.clientX;
            const startY = e.clientY;
            const startOff = { ...(winRef.current.innerOffset || { x: 0, y: 0 }) };

            const handleMouseMove = (moveEvent) => {
                const dx = (moveEvent.clientX - startX) / worldZoom;
                const dy = (moveEvent.clientY - startY) / worldZoom;
                const newOff = { x: startOff.x + dx, y: startOff.y + dy };
                winRef.current.innerOffset = newOff;

                dispatch({
                    type: 'UPDATE_LEVEL_PROPERTIES',
                    payload: {
                        windowId,
                        index,
                        updates: { innerOffset: newOff },
                        skipHistory: true
                    }
                });
            };

            const handleMouseUp = () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };

            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else if (e.button === 0) {
            if (projectId && s && projectId !== s.activeProjectId) {
                dispatch({ type: 'SET_ACTIVE_PROJECT', payload: projectId });
            }
            // Клик по пустому месту вьюпорта сбрасывает выделение узлов и активирует этот уровень для добавления элементов
            dispatch({ type: 'SET_SELECTED', payload: null });
            dispatch({ type: 'SET_LEVEL_FOCUS', payload: { levelIndex: index, windowId } });
        }
    };

    // Метрики берутся из координатного ядра: пока значение одно, DOM и расчёт
    // точек привязки связей не могут разойтись (см. hierarchy.js LEVEL_WINDOW_METRICS).
    const METRICS = (window.HierarchyUtils && window.HierarchyUtils.LEVEL_WINDOW_METRICS) || { headerH: 40, borderW: 2 };
    const headerHeight = METRICS.headerH;
    const bodyHeight = isCollapsed ? 0 : Math.max(200, size.h - headerHeight);
    const borderColor = color || (index === 0 ? '#1e293b' : '#334155');

    // Drag&Drop: окно-приёмник (указатель мыши пересёк рамку при валидном
    // дропе) подсвечивается КАК при выделении шапки — но панель свойств уровня
    // не открывается, выделение элементов не трогается
    const dropT = state.dragGesture && state.dragGesture.target;
    const isDropHighlight = !!(dropT && dropT.kind === 'window' && dropT.id === windowData.id && dropT.valid);

    return (
        <div
            className={`level-window absolute select-none rounded-2xl transition-all duration-150 flex flex-col ${
                (isSelected || isDropHighlight) ? 'ring-2 ring-[var(--accent-blue)]' : ''
            }`}
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: `${size.w}px`,
                border: `${METRICS.borderW}px solid ${borderColor}`,
                backgroundColor: '#0a0d14',
                boxShadow: (isSelected || isDropHighlight)
                    ? `0 0 35px ${borderColor}88, 0 0 10px rgba(56,189,248,0.3)`
                    : `0 10px 30px rgba(0,0,0,0.5), 0 0 15px ${borderColor}33`,
                zIndex: isSelected ? 30 : 10 + index
            }}
        >
            {/* 1. Шапка окна уровня */}
            <div
                className="level-window-header h-10 px-3.5 flex items-center justify-between rounded-t-2xl cursor-grab active:cursor-grabbing border-b border-white/10 backdrop-blur-md transition-colors"
                style={{ backgroundColor: color || '#1e293b' }}
                onMouseDown={handleMouseDownHeader}
                onClick={(e) => {
                    if (projectId && s && projectId !== s.activeProjectId) {
                        dispatch({ type: 'SET_ACTIVE_PROJECT', payload: projectId });
                    }
                    dispatch({
                        // Shift+клик по шапке набирает окна пачкой — так же, как узлы
                        type: e.shiftKey ? 'TOGGLE_SELECTED' : 'SET_SELECTED',
                        payload: winSelectionId
                    });
                }}
            >
                {/* Левая часть: Иконка, Мастер-порт и Название */}
                <div className="flex items-center gap-2 min-w-0">
                    <div 
                        className="flex items-center justify-center min-w-6 h-6 px-1.5 rounded-lg bg-black/40 text-white font-mono text-[11px] font-bold border border-white/20 shrink-0 gap-1"
                        title={`Уровень ${index}`}
                    >
                        <div className="icon-folder text-xs text-sky-400"></div>
                        <span>{index}</span>
                    </div>

                    {/* Мастер-порт шапки уровня */}
                    <div
                        className={`relative w-4 h-4 rounded-full border border-sky-400/80 flex items-center justify-center transition-all cursor-pointer hover:scale-125 shrink-0 ${
                            isCollapsed && proxyPorts.length > 0
                                ? 'bg-sky-500 shadow-[0_0_12px_#38bdf8] ring-2 ring-sky-300'
                                : 'bg-black/60 hover:bg-sky-500/40'
                        }`}
                        title={`Мастер-порт Уровня ${index}${proxyPorts.length > 0 ? ` (${proxyPorts.length} межуровневых связей)` : ''}`}
                        onMouseDown={(e) => {
                            if (e.button !== 0) return;
                            e.stopPropagation();
                            const masterPortId = `port-master-level-${index}`;
                            dispatch({
                                type: 'SET_PENDING_CONNECTION',
                                payload: { sourcePortId: masterPortId, endPos: { x: e.clientX, y: e.clientY } }
                            });
                            const handleMove = (moveEv) => {
                                dispatch({
                                    type: 'UPDATE_PENDING_CONNECTION',
                                    payload: { x: moveEv.clientX, y: moveEv.clientY }
                                });
                            };
                            const handleUp = (upEv) => {
                                window.removeEventListener('mousemove', handleMove);
                                window.removeEventListener('mouseup', handleUp);
                                const dist = Math.hypot(upEv.clientX - e.clientX, upEv.clientY - e.clientY);
                                if (dist < 8) {
                                    dispatch({ type: 'SET_PENDING_CONNECTION', payload: null });
                                    dispatch({ type: 'SET_SELECTED', payload: winSelectionId });
                                    return;
                                }

                                const container = document.getElementById('canvas-container');
                                const rect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };
                                const p2x = (upEv.clientX - rect.left - state.canvas.offset.x) / worldZoom;
                                const p2y = (upEv.clientY - rect.top - state.canvas.offset.y) / worldZoom;

                                const H = window.HierarchyUtils;
                                let targetPortId = null;
                                let minDist = 40 / worldZoom;

                                Object.values(state.ports || {}).forEach(port => {
                                    if (port.id === masterPortId) return;
                                    const absPos = H ? H.getPortWorldCoordinates(port.id, state) : null;
                                    if (!absPos) return;
                                    const d = Math.hypot(p2x - absPos.x, p2y - absPos.y);
                                    if (d < minDist) {
                                        minDist = d;
                                        targetPortId = port.id;
                                    }
                                });

                                if (targetPortId) {
                                    dispatch({
                                        type: 'ADD_LINK',
                                        payload: { sourcePortId: masterPortId, targetPortId: targetPortId }
                                    });
                                } else {
                                    dispatch({ type: 'SET_PENDING_CONNECTION', payload: null });
                                }
                            };
                            window.addEventListener('mousemove', handleMove);
                            window.addEventListener('mouseup', handleUp);
                        }}
                    >
                        <div className="w-1.5 h-1.5 rounded-full bg-sky-400 pointer-events-none"></div>
                    </div>

                    <span
                        className="text-sm font-semibold text-white truncate max-w-[260px]"
                        style={{ fontFamily: fontFamily || 'Inter, sans-serif' }}
                    >
                        {name || 'New level'}
                    </span>

                    {/* Бейдж связей в свернутом режиме */}
                    {isCollapsed && proxyPorts.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40 shrink-0">
                            ⚡ {proxyPorts.length}
                        </span>
                    )}

                    {isIsolated && focusList.length > 0 && (
                        <span
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 truncate max-w-[160px]"
                            title={focusList.map(fid => nodes[fid]?.name || (layers && layers[fid]?.name) || fid).join(', ')}
                        >
                            {focusList.length === 1
                                ? `Ветка: ${nodes[focusList[0]]?.name || (layers && layers[focusList[0]]?.name) || focusList[0]}`
                                : `Веток: ${focusList.length}`}
                        </span>
                    )}

                    {/* Пометка: отображение уровня перекрыто глобальным глазом Главного холста */}
                    {index > 0 && globalEyeOn && (
                        <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-500/20 text-sky-300 border border-sky-500/40 shrink-0"
                            title="Включён глаз Главного холста: видимость на этом уровне определяет он"
                        >
                            👁 L0
                        </span>
                    )}
                </div>

                {/* Правая часть: Кнопки управления */}
                <div className="flex items-center gap-1 shrink-0">
                    {/* Тогл Глаз: Изоляция ветки.
                        Уровень 0 — глобальный: просвечивает ветки выделенных корневых
                        родителей на ВСЕХ уровнях, игнорируя локальные глаза.
                        Уровни >0 — локальный: показывает только ветки владельцев
                        выделенных детей в пределах этого уровня. */}
                    <button
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                            isIsolated
                                ? 'bg-amber-500 text-black font-bold shadow'
                                : 'text-gray-300 hover:text-white hover:bg-black/30'
                        }`}
                        title={index === 0
                            ? (isIsolated
                                ? 'Глобальная изоляция включена: на всех уровнях видны только ветки выделенных родителей. Клик — показать всё'
                                : 'Просветить ветки выделенных родителей на всех уровнях (скрыть остальные)')
                            : (isIsolated
                                ? 'Изоляция ветки включена (чужие ветки уровня скрыты). Клик — показать всех'
                                : 'Показать только ветки выделенных узлов этого уровня')}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (projectId && s && projectId !== s.activeProjectId) {
                                dispatch({ type: 'SET_ACTIVE_PROJECT', payload: projectId });
                            }
                            dispatch({ type: 'TOGGLE_LEVEL_NEIGHBORS', payload: { id: windowData.id, windowId: windowData.id, levelIndex: index } });
                        }}
                    >
                        <div className={`text-xs ${isIsolated ? 'icon-eye-off' : 'icon-eye'}`}></div>
                    </button>

                    {/* Изоляция окна уровня на общем холсте. Кнопка живёт на самом
                        окне: изолированное остаётся видимым, значит выйти из режима
                        всегда есть чем — отдельный индикатор не нужен. */}
                    <button
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                            isWindowIsolated
                                ? 'text-amber-300 bg-amber-500/25 ring-1 ring-amber-400/60'
                                : 'text-gray-300 hover:text-white hover:bg-black/30'
                        }`}
                        title={isWindowIsolated
                            ? 'Уровень изолирован на холсте: остальные окна скрыты. Клик — показать всё'
                            : 'Изолировать уровень: скрыть с холста всё, кроме него'}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (projectId && s && projectId !== s.activeProjectId) {
                                dispatch({ type: 'SET_ACTIVE_PROJECT', payload: projectId });
                            }
                            dispatch({ type: 'TOGGLE_CONTAINER_ISOLATION', payload: { kind: 'window', id: windowData.id } });
                        }}
                    >
                        <div className={`text-xs ${isWindowIsolated ? 'icon-scan' : 'icon-scan-line'}`}></div>
                    </button>

                    {/* Тогл Свернуть/Развернуть */}
                    <button
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-white hover:bg-black/30 transition-all"
                        title={isCollapsed ? 'Развернуть окно' : 'Свернуть окно'}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (projectId && s && projectId !== s.activeProjectId) {
                                dispatch({ type: 'SET_ACTIVE_PROJECT', payload: projectId });
                            }
                            dispatch({ type: 'TOGGLE_LEVEL_COLLAPSE', payload: { id: windowData.id, windowId: windowData.id, index } });
                        }}
                    >
                        <div className={`text-xs ${isCollapsed ? 'icon-maximize' : 'icon-minimize'}`}></div>
                    </button>

                    {/* Закрыть / Удалить окно */}
                    <button
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:text-red-200 hover:bg-red-500/30 transition-all"
                        title={index === 0 ? 'Удалить Главный холст' : `Удалить Уровень ${index}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            const curProjectId = projectId || (s && s.activeProjectId);
                            if (curProjectId && s && curProjectId !== s.activeProjectId) {
                                dispatch({ type: 'SET_ACTIVE_PROJECT', payload: curProjectId });
                            }
                            const allWindows = Object.values(state.levelWindows || {}).filter(Boolean);
                            const hasOtherLevels = allWindows.some(w => w.id !== windowData.id);
                            if (!hasOtherLevels) {
                                if (window.confirm('Это единственное окно проекта. Проект будет удален. Продолжить?')) {
                                    dispatch({ type: 'REMOVE_PROJECT', payload: { id: curProjectId } });
                                }
                                return;
                            }
                            const msg = index === 0
                                ? 'Удалить Главный холст? Его элементы будут удалены, а Уровень 1 станет Главным холстом.'
                                : `Удалить Уровень ${index}? Его элементы будут удалены, а потомки и уровни ниже поднимутся на один (Уровень ${index + 1} станет Уровнем ${index}).`;
                            if (window.confirm(msg)) {
                                dispatch({
                                    type: index === 0 ? 'REMOVE_ROOT_CANVAS' : 'REMOVE_LEVEL_WINDOW',
                                    payload: { id: windowData.id, windowId: windowData.id, index }
                                });
                            }
                        }}
                    >
                        <div className="icon-x text-xs"></div>
                    </button>
                </div>
            </div>

            {/* Мост через шапку: у связей, подходящих сверху, внешний прокси
                стоит на самом верху рамки (y=0), а внутренний отрезок связи
                рисуется в SVG тела окна, которое начинается ПОД шапкой и
                обрезано overflow-hidden — дотянуться до дота само не может.
                Этот короткий сегмент — недостающий кусок между ними, тело
                шапки визуально прикрывает его нижнюю половину, но верхняя
                (там же, где дот) должна быть видна поверх неё.

                Толщина non-scaling-stroke зависит от ЧИСЛА вложенных
                CSS-трансформов масштаба над путём, а не только от их итоговой
                величины: внутренний отрезок сидит под общим зумом холста И
                ЕЩЁ под zoom-обвязкой самого уровня (innerZoom), а этот мост
                раньше был только под общим зумом холста — на глаз линия
                «ломалась» по толщине ровно на стыке. Обёртка ниже добавляет
                мосту тот же второй слой scale(innerZoom) вокруг той же точки
                (0,0) — с компенцией размеров на 1/innerZoom, чтобы сама
                геометрия моста (он же часть неподвижной шапки) не поехала. */}
            {!isCollapsed && (
                <svg
                    className="absolute top-0 left-0 pointer-events-none overflow-visible"
                    style={{
                        width: size.w / (innerZoom || 1),
                        height: headerHeight / (innerZoom || 1),
                        transform: `scale(${innerZoom || 1})`,
                        transformOrigin: 'top left',
                        zIndex: 25
                    }}
                >
                    {proxyPorts.filter(p => p.edge === 'top').map(proxy => {
                        const myPort = ports && ports[proxy.myPortId];
                        const myNode = myPort && nodes ? nodes[myPort.nodeId] : null;
                        const otherProj = proxy.isExternal && state.projects ? state.projects[proxy.otherProjectId] : null;
                        const otherPort = proxy.isPending ? null
                            : (proxy.isExternal ? (otherProj && otherProj.ports && otherProj.ports[proxy.otherPortId]) : (ports && ports[proxy.otherPortId]));
                        const otherNodeId = otherPort ? otherPort.nodeId : null;
                        const bridgeSelected = selectedIds && (
                            selectedIds.includes(proxy.linkId)
                            || selectedIds.includes(proxy.myPortId)
                            || (!proxy.isPending && selectedIds.includes(proxy.otherPortId))
                            || (myNode && selectedIds.includes(myNode.id))
                            || (otherNodeId && selectedIds.includes(otherNodeId))
                        );
                        const x = proxy.framePos.x / (innerZoom || 1);
                        const yEnd = headerHeight / (innerZoom || 1);
                        return (
                            <path
                                key={`bridge-${proxy.id}`}
                                d={`M ${x} 0 L ${x} ${yEnd}`}
                                fill="none"
                                stroke={proxy.color || '#38bdf8'}
                                strokeWidth={bridgeSelected ? '4.5' : '2.5'}
                                strokeLinecap="round"
                                strokeDasharray={proxy.isPending ? '2, 4' : '3, 5'}
                                vectorEffect="non-scaling-stroke"
                                className={proxy.isExternal ? 'cross-project-link-pulse' : ''}
                                style={{
                                    opacity: proxy.isPending ? 0.55 : 1,
                                    filter: bridgeSelected ? `drop-shadow(0 0 10px ${proxy.color || '#38bdf8'})` : 'none'
                                }}
                            />
                        );
                    })}
                </svg>
            )}

            {/* Прокси-порты на границах внешней рамки окна */}
            {!isCollapsed && proxyPorts.map(proxy => (
                <div
                    key={proxy.id}
                    className={`absolute w-3 h-3 rounded-full border border-sky-300 bg-[#0a0d14] transform -translate-x-1/2 -translate-y-1/2 cursor-pointer z-30 hover:scale-150 transition-transform shadow-[0_0_8px_rgba(56,189,248,0.7)]${proxy.isExternal ? ' cross-project-link-pulse' : ''}`}
                    style={{
                        left: `${proxy.framePos.x}px`,
                        top: `${proxy.framePos.y}px`,
                        borderColor: proxy.color || '#38bdf8',
                        opacity: proxy.isPending ? 0.55 : 1,
                        borderStyle: proxy.isPending ? 'dashed' : 'solid'
                    }}
                    title={proxy.isPending
                        ? `Связано с «${proxy.gateway.remotePortName || proxy.gateway.remotePortId || '?'}» в проекте «${proxy.gateway.remoteProjectName || 'без имени'}» (сейчас не загружен)`
                        : proxy.isExternal
                            ? `Кросс-проектная связь (${proxy.link.name || proxy.linkId}). Shift+драг — переместить по рамке`
                            : `Прокси-порт к Уровню ${proxy.targetLevel} (Связь: ${proxy.link.name || proxy.linkId}). Shift+драг — переместить по рамке`}
                    onClick={(e) => {
                        e.stopPropagation();
                        dispatch({ type: 'SET_SELECTED', payload: proxy.linkId });
                    }}
                    onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        // Shift+драг: скольжение прокси по всему периметру рамки окна —
                        // как у портов на контуре узла. Без Shift клик отдаём onClick
                        // (выделение связи).
                        if (!e.shiftKey) return;

                        let hasMoved = false;
                        const startX = e.clientX;
                        const startY = e.clientY;
                        const initialSnapshot = { layers: state.layers, nodes: state.nodes, ports: state.ports, links: state.links };
                        const HM = window.HierarchyUtils;
                        const M = (HM && HM.LEVEL_WINDOW_METRICS) || { headerH: 40, borderW: 2 };

                        const handleProxyMove = (moveEvent) => {
                            if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 3) {
                                hasMoved = true;
                            }
                            if (!hasMoved) return;

                            // Мировые координаты мыши -> локальные координаты рамки окна
                            const container = document.getElementById('canvas-container');
                            const rect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };
                            const worldX = (moveEvent.clientX - rect.left - state.canvas.offset.x) / worldZoom;
                            const worldY = (moveEvent.clientY - rect.top - state.canvas.offset.y) / worldZoom;
                            const localX = worldX - position.x - M.borderW;
                            const localY = worldY - position.y - M.borderW;

                            const w = size.w;
                            const h = size.h;
                            const bodyH2 = Math.max(200, h - M.headerH);

                            // Ближайшая грань: верх рамки — внешний контур окна (y = 0),
                            // как и у остальных граней (см. makeProxy в hierarchy.js)
                            const distTop = Math.abs(localY);
                            const distBottom = Math.abs(localY - h);
                            const distLeft = Math.abs(localX);
                            const distRight = Math.abs(localX - w);
                            const minDist = Math.min(distTop, distBottom, distLeft, distRight);

                            let newEdge;
                            let fraction;
                            if (minDist === distTop) {
                                newEdge = 'top';
                                fraction = localX / w;
                            } else if (minDist === distBottom) {
                                newEdge = 'bottom';
                                fraction = localX / w;
                            } else if (minDist === distLeft) {
                                newEdge = 'left';
                                fraction = (localY - M.headerH) / bodyH2;
                            } else {
                                newEdge = 'right';
                                fraction = (localY - M.headerH) / bodyH2;
                            }

                            // Кросс-проектная связь (Фаза 6.1): живёт вне истории Undo
                            // проектов (см. AGENTS.md) — обновляется сразу, без пары
                            // skipHistory/COMMIT_HISTORY, которой для неё просто нет.
                            if (proxy.isExternal) {
                                dispatch({
                                    type: 'UPDATE_CROSS_PROJECT_PROXY_PORT',
                                    payload: { linkId: proxy.linkId, windowId: windowData.id, edge: newEdge, fraction }
                                });
                                return;
                            }
                            // Штекер (Фаза 6.2): один-единственный локальный конец — оверрайд
                            // не привязан к windowId, второго окна для сравнения нет.
                            if (proxy.isPending) {
                                dispatch({
                                    type: 'UPDATE_PENDING_GATEWAY_PROXY',
                                    payload: { linkId: proxy.linkId, edge: newEdge, fraction, skipHistory: true }
                                });
                                return;
                            }
                            dispatch({
                                type: 'UPDATE_PROXY_PORT',
                                payload: {
                                    linkId: proxy.linkId,
                                    windowId: windowData.id,
                                    edge: newEdge,
                                    fraction,
                                    skipHistory: true
                                }
                            });
                        };

                        const handleProxyUp = () => {
                            window.removeEventListener('mousemove', handleProxyMove);
                            window.removeEventListener('mouseup', handleProxyUp);
                            if (hasMoved && !proxy.isExternal) {
                                dispatch({
                                    type: 'COMMIT_HISTORY',
                                    payload: { snapshot: initialSnapshot, logMessage: 'Перемещён прокси-порт связи' }
                                });
                            }
                        };

                        window.addEventListener('mousemove', handleProxyMove);
                        window.addEventListener('mouseup', handleProxyUp);
                    }}
                >
                    <div 
                        className="w-1.5 h-1.5 rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" 
                        style={{ backgroundColor: proxy.color || '#38bdf8' }}
                    />
                </div>
            ))}

            {/* 2. Тело окна (Внутренний вьюпорт с собственной сеткой) */}
            {!isCollapsed && (
                <div
                    ref={setViewportRef}
                    className="relative overflow-hidden rounded-b-2xl"
                    style={{
                        height: `${bodyHeight}px`,
                        backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)`,
                        backgroundSize: '24px 24px'
                    }}
                    onMouseDown={handleMouseDownViewport}
                    onTouchStart={handleTouchStartViewport}
                >
                    {/* Внутренняя координатная плоскость */}
                    <div
                        className="absolute inset-0 origin-top-left pointer-events-none"
                        style={{
                            transform: `translate(${innerOffset?.x || 0}px, ${innerOffset?.y || 0}px) scale(${innerZoom || 1})`
                        }}
                    >
                        {/* Слои этого уровня */}
                        {Object.values(levelLayers).map(layer => (
                            <div key={layer.id} className="pointer-events-auto">
                                <Layer
                                    data={layer}
                                    layer={layer}
                                    nodes={levelNodes}
                                    layers={layers}
                                    selectedIds={selectedIds}
                                    isolatedIds={isolatedIds}
                                    dispatch={dispatch}
                                    zoom={innerZoom || 1}
                                />
                            </div>
                        ))}

                        {/* Внутриуровневые связи и локальные сегменты межуровневых связей */}
                        <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none" style={{ zIndex: 1 }}>
                            {/* 0. Внутренние отрезки межуровневых связей: от порта узла
                                   до прокси-порта на рамке. Магистральный отрезок между
                                   рамками рисует Canvas в глобальном слое (§5.1 плана). */}
                            {proxyPorts.map(proxy => {
                                const H2 = window.HierarchyUtils;
                                const G2 = window.GeometryUtils;
                                if (!H2 || !G2) return null;
                                const myPort = ports && ports[proxy.myPortId];
                                const myNode = myPort ? ((nodes && nodes[myPort.nodeId]) || (layers && layers[myPort.nodeId])) : null;
                                if (!myPort || !myNode) return null;

                                const nodeLocal = H2.getLocalPosition(myNode.id, nodes, layers);
                                const rel = G2.getPortRelativePosition(myPort, myNode);
                                const a = { x: nodeLocal.x + rel.x, y: nodeLocal.y + rel.y, edge: myPort.edge || 'right' };
                                const bp = H2.getProxyViewportLocalPos(proxy, { innerZoom: innerZoom || 1, innerOffset: innerOffset || { x: 0, y: 0 } });
                                // Грань прокси задаёт направление НАРУЖУ — туда уходит магистральный
                                // отрезок. Внутренний отрезок подходит к прокси с обратной стороны,
                                // изнутри окна. Возьми ту же грань — маршрут ляжет вдоль самой
                                // линии обрезки и станет невидимым, а связь будет выглядеть рваной.
                                const INWARD = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
                                const b = { x: bp.x, y: bp.y, edge: INWARD[proxy.edge] || 'top' };
                                const stubPath = G2.buildLinkPath(a, b, proxy.link.linkStyle, 0);
                                // Штекер (Фаза 6.2): второй половины связи нет вовсе — не с
                                // чем резолвить otherPortId, и незачем: gateway уже несёт
                                // remotePortName/remoteProjectName для тултипа напрямую.
                                const otherPortId = proxy.isPending ? null
                                    : (proxy.link.sourcePortId === proxy.myPortId ? proxy.link.targetPortId : proxy.link.sourcePortId);
                                // Внешний прокси (Фаза 6.1): второй порт живёт в ДРУГОМ
                                // проекте, а не в локальном ports этого окна.
                                const otherProj = proxy.isExternal && state.projects ? state.projects[proxy.otherProjectId] : null;
                                const otherPort = proxy.isExternal ? (otherProj && otherProj.ports && otherProj.ports[otherPortId]) : (ports && ports[otherPortId]);
                                const otherNodeId = otherPort ? otherPort.nodeId : null;
                                const stubSelected = selectedIds && (
                                    selectedIds.includes(proxy.linkId)
                                    || selectedIds.includes(proxy.myPortId)
                                    || selectedIds.includes(otherPortId)
                                    || selectedIds.includes(myNode.id)
                                    || (otherNodeId && selectedIds.includes(otherNodeId))
                                );
                                const selectStub = (e) => {
                                    e.stopPropagation();
                                    dispatch({ type: 'SET_SELECTED', payload: proxy.linkId });
                                };
                                const focusStub = (e) => {
                                    e.stopPropagation();
                                    dispatch({ type: 'FOCUS_CONNECTED_ELEMENTS', payload: { entityId: proxy.linkId } });
                                };

                                return (
                                    <g key={`stub-${proxy.id}`}>
                                        {/* Хитбокс: внутренний отрезок — такая же часть связи,
                                            как и магистральный, и должен выделяться кликом */}
                                        <path
                                            d={stubPath}
                                            fill="none"
                                            stroke="transparent"
                                            strokeWidth="16"
                                            vectorEffect="non-scaling-stroke"
                                            className="pointer-events-auto cursor-pointer"
                                            onClick={selectStub}
                                            onDoubleClick={focusStub}
                                        />
                                        <path
                                            d={stubPath}
                                            fill="none"
                                            stroke={proxy.color || '#38bdf8'}
                                            strokeWidth={stubSelected ? '4.5' : '2.5'}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeDasharray={proxy.isPending ? '2, 4' : '3, 5'}
                                            vectorEffect="non-scaling-stroke"
                                            className={`pointer-events-none transition-all duration-150${proxy.isExternal ? ' cross-project-link-pulse' : ''}`}
                                            style={{
                                                opacity: proxy.isPending ? 0.55 : 1,
                                                filter: stubSelected ? `drop-shadow(0 0 10px ${proxy.color || '#38bdf8'})` : 'none'
                                            }}
                                        />
                                        {/* Маркер разрыва (Фаза 6.2): полая точка на конце штекера
                                            + тултип с именем второй, сейчас не загруженной стороны. */}
                                        {proxy.isPending && (
                                            <circle cx={b.x} cy={b.y} r="4" fill="none" stroke={proxy.color || '#38bdf8'} strokeWidth="1.5" opacity="0.7">
                                                <title>{`Связано с «${proxy.gateway.remotePortName || proxy.gateway.remotePortId || '?'}» в проекте «${proxy.gateway.remoteProjectName || 'без имени'}» (сейчас не загружен)`}</title>
                                            </circle>
                                        )}
                                    </g>
                                );
                            })}

                            {/* 1. Внутриуровневые связи */}
                            {intraLevelLinks.map(link => (
                                <Link
                                    key={link.id}
                                    linkId={link.id}
                                />
                            ))}
                        </svg>

                        {/* Узлы этого уровня */}
                        {Object.values(levelNodes).map(node => (
                            <div key={node.id} className="pointer-events-auto">
                                <NodeComponent
                                    nodeId={node.id}
                                    zoom={innerZoom || 1}
                                />
                            </div>
                        ))}
                    </div>

                    {/* Ресайз-хэндл за правый нижний угол */}
                    <div
                        className="absolute bottom-1 right-1 w-4 h-4 cursor-se-resize flex items-center justify-center text-gray-500 hover:text-white transition-colors z-40 select-none"
                        onMouseDown={handleMouseDownResize}
                        title="Изменить размер окна"
                    >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                            <circle cx="8" cy="8" r="1.2" />
                            <circle cx="4" cy="8" r="1.2" />
                            <circle cx="8" cy="4" r="1.2" />
                        </svg>
                    </div>
                </div>
            )}
        </div>
    );
}

if (typeof window !== 'undefined') window.LevelWindow = LevelWindow;
if (typeof module !== 'undefined') module.exports = LevelWindow;
