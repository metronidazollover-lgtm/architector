// Чистая логика состояния: defaultState, редьюсер, загрузка из localStorage.
// Без JSX и React: файл исполняется и в браузере (text/babel), и в Node для тестов.
// Двойной экспорт в конце файла (см. docs/PLAN.md, этап 0.2).

const STORAGE_KEY = 'architector_state_v10';
const LEGACY_STORAGE_KEY_V9 = 'architector_state_v9';
const FORMAT_VERSION = 10;

// Доступ к окружению с оглядкой на Node (node:test): в браузере — window,
// в тестах — global-заглушки или дефолты.
const getGeometry = () =>
    (typeof window !== 'undefined' && window.GeometryUtils) ? window.GeometryUtils :
    (typeof global !== 'undefined' && global.GeometryUtils) ? global.GeometryUtils : null;

const getHierarchy = () =>
    (typeof window !== 'undefined' && window.HierarchyUtils) ? window.HierarchyUtils :
    (typeof global !== 'undefined' && global.HierarchyUtils) ? global.HierarchyUtils :
    (typeof module !== 'undefined' && typeof require !== 'undefined') ? require('../utils/hierarchy.js') : null;

// Абсолютная позиция порта с учётом иерархии координат (v10: позиции детей относительные)
const getPortAbs = (port, node, state) => {
    const abs = getHierarchy().getAbsolutePosition(node.id, state.nodes, state.layers);
    return getGeometry().getPortAbsolutePosition(port, node, abs);
};

// Миграция формата сохранений: v9 хранил все позиции в мировых координатах,
// v10 хранит позиции детей относительно родителя (см. docs/MIGRATIONS.md).
// Работает на исходных (мировых) значениях, поэтому порядок обхода не важен.
const migrateToV10 = (data) => {
    if (!data || (data.formatVersion || 9) >= FORMAT_VERSION) return data;
    const oldNodes = data.nodes || {};
    const oldLayers = data.layers || {};

    const parentPos = (parentId) => {
        if (!parentId || parentId === 'root') return null;
        const parent = oldNodes[parentId] || oldLayers[parentId];
        return (parent && parent.position) ? parent.position : null;
    };
    const convert = (entity) => {
        if (!entity || !entity.position) return entity;
        const pp = parentPos(entity.parentId);
        if (!pp) return entity;
        return { ...entity, position: { x: entity.position.x - pp.x, y: entity.position.y - pp.y } };
    };

    const nodes = {};
    Object.entries(oldNodes).forEach(([key, n]) => { nodes[key] = convert(n); });
    const layers = {};
    Object.entries(oldLayers).forEach(([key, l]) => { layers[key] = convert(l); });

    return {
        ...data,
        nodes,
        layers,
        // Снапшоты undo содержат старые мировые координаты — истории при миграции сбрасываются
        past: [],
        future: [],
        historyLogs: ['Проект сконвертирован в формат v10 (относительные координаты)'],
        formatVersion: FORMAT_VERSION
    };
};

const getScreenSize = () =>
    (typeof window !== 'undefined') ? { w: window.innerWidth, h: window.innerHeight } : { w: 1280, h: 720 };

const estimateWrappedLines = (text, charsPerLine) => {
    if (!text) return 0;
    const paragraphs = text.split('\n');
    let totalLines = 0;
    paragraphs.forEach(p => {
        const words = p.split(/\s+/).filter(Boolean);
        if (words.length === 0) {
            totalLines += 1;
            return;
        }
        let currentLineLen = 0;
        let pLines = 1;
        words.forEach(word => {
            const wordLen = word.length;
            if (wordLen > charsPerLine) {
                pLines += Math.ceil(wordLen / charsPerLine) - 1;
                currentLineLen = wordLen % charsPerLine;
            } else {
                if (currentLineLen + (currentLineLen > 0 ? 1 : 0) + wordLen > charsPerLine) {
                    pLines += 1;
                    currentLineLen = wordLen;
                } else {
                    currentLineLen += (currentLineLen > 0 ? 1 : 0) + wordLen;
                }
            }
        });
        totalLines += pLines;
    });
    return totalLines;
};

const calculateNodeSize = (name, content, mediaUrl, mediaHeight) => {
    const safeName = name || '';
    const safeContent = content || '';
    const textLength = safeName.length + safeContent.length;

    // Base dimensions for empty node
    const baseW = 200;
    const baseH = 100;

    // Width scales with text length from 200 up to A4 width (794px)
    const maxA4Width = 794;
    let w = baseW + textLength * 0.5;
    if (w > maxA4Width) w = maxA4Width;

    // If there is an image, make sure width is at least 300px
    if (mediaUrl && w < 300) {
        w = 300;
    }

    // Calculate height needed to fit text vertically at this width `w`
    // Padding-X is 10px on each side (total 20px). Using 8.5px average character width.
    const charsPerLine = Math.max(12, Math.floor((w - 20) / 8.5));
    const estimatedLines = estimateWrappedLines(safeContent, charsPerLine);
    const textMinH = estimatedLines * 20;

    let h = 33 + 20; // Header (33px: py-2*2 + font-14px + border-1px + 1px запас) + Padding-Y (20px total: 10px top + 10px bottom)
    if (mediaUrl) {
        h += (mediaHeight || 150);
    }
    if (safeContent) {
        h += textMinH;
    }
    if (mediaUrl && safeContent) {
        h += 10; // Gap (10px)
    }

    // Apply minimum height constraint
    if (h < baseH) h = baseH;

    return {
        w: Math.round(w),
        h: Math.round(h)
    };
};

const defaultState = {
    currentContext: 'root',
    breadcrumbs: [{ id: 'root', name: 'Главный холст' }],

    layers: {},
    nodes: {},
    ports: {},
    links: [],
    selectedIds: [],
    isolatedIds: [],
    interactionMode: 'default',
    pendingConnection: null,
    canvas: {
        offset: { x: -30, y: -50 },
        zoom: 0.65
    },
    cameraByContext: {},
    navHistory: { past: [], future: [] },
        ui: {
            libraryOpen: true,
            libraryTab: 'objects',
            aiAgentOpen: false,
            visibleContexts: [],
            hiddenContexts: [],
            peekNodeId: null,
            transitionFromContext: null,
        aiAgentSettings: {
            apiKey: '',
            model: 'gpt-4o',
            mode: 'agent',
            contextMode: 'global',
            llmEnabled: true
        }
    },
    aiChatHistory: [
        { role: 'ai', content: 'Привет! Я ваш AI-ассистент. Помогу спроектировать архитектуру, ответить на вопросы и организовать ваши идеи на холсте.' }
    ],
    clipboard: null,
    past: [],
    future: [],
    historyLogs: ['Инициализация проекта'],
    formatVersion: FORMAT_VERSION
};

const getInitialState = () => {
    if (typeof localStorage === 'undefined') return defaultState;
    try {
        // Сначала текущий формат, затем legacy v9 с конвертацией на лету
        const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY_V9);
        if (saved) {
            const parsed = migrateToV10(JSON.parse(saved));
            
            // Миграция и самолечение: исправление рассинхрона ключей и ID узлов (удаление призраков)
            const cleanNodes = {};
            if (parsed.nodes) {
                Object.entries(parsed.nodes).forEach(([key, node]) => {
                    // Игнорируем явных призраков (узлы без базовых свойств)
                    if (!node || (!node.name && !node.type)) return;
                    
                    // Жестко синхронизируем внутренний ID с ключом хранилища
                    cleanNodes[key] = { ...node, id: key };
                });
            }

            // Восстанавливаем имена портов из базовой структуры, если они пустые
            const mergedPorts = { ...(parsed.ports || {}) };
            if (defaultState.ports) {
                Object.keys(defaultState.ports).forEach(portId => {
                    if (mergedPorts[portId] && !mergedPorts[portId].name) {
                        mergedPorts[portId].name = defaultState.ports[portId].name;
                    }
                });
            }

            return { 
                ...defaultState, 
                ...parsed, 
                nodes: cleanNodes,
                ports: mergedPorts,
                links: Array.isArray(parsed.links) ? parsed.links : Object.values(parsed.links || {}),
                ui: { ...defaultState.ui, ...(parsed.ui || {}) },
                aiChatHistory: parsed.aiChatHistory || defaultState.aiChatHistory
            };
        }
    } catch (e) {
        console.error('Ошибка загрузки состояния:', e);
    }
    return defaultState;
};

// Хелпер для сохранения истории
const MAX_HISTORY_STEPS = 20;

const saveHistory = (state, logMessage) => {
    // contextId/breadcrumbs — для undo с прыжком в контекст правки (этап 6.3)
    const snapshot = { layers: state.layers, nodes: state.nodes, ports: state.ports, links: state.links, contextId: state.currentContext, breadcrumbs: state.breadcrumbs };
    const newPast = [...state.past, snapshot];
    const newLogs = [...state.historyLogs, logMessage];
    
    if (newPast.length > MAX_HISTORY_STEPS) {
        newPast.shift();
        newLogs.shift();
    }
    
    return {
        past: newPast,
        future: [],
        historyLogs: newLogs
    };
};

// История посещений контекстов (отдельна от undo/redo).
// Хранит и breadcrumbs целиком: контекстом может быть порт или связь, путь к ним по parentId не восстановить.
const MAX_NAV_HISTORY = 50;

const pushNavEntry = (state) => {
    const entry = { id: state.currentContext, breadcrumbs: state.breadcrumbs };
    const past = [...((state.navHistory && state.navHistory.past) || []), entry];
    if (past.length > MAX_NAV_HISTORY) past.shift();
    return { past, future: [] };
};

const contextExists = (state, id) =>
    id === 'root' ||
    !!state.nodes[id] ||
    !!state.ports[id] ||
    !!(state.layers && state.layers[id]) ||
    !!(state.links && state.links.find(l => l && l.id === id));

const reducer = (state, action) => {
    switch (action.type) {
        case 'LOAD_STATE': {
            const payload = migrateToV10(action.payload) || {};
            const historyState = saveHistory(state, `Загружен проект из файла`);
            
            // Recalculate sizes of all nodes on LOAD_STATE to ensure they match their content, and force snapToGrid
            const nodes = { ...payload.nodes };
            Object.keys(nodes).forEach(id => {
                const node = nodes[id];
                if (node) {
                    const size = node.type !== 'ai-agent'
                        ? calculateNodeSize(node.name, node.content, node.mediaUrl, node.mediaHeight)
                        : node.size;
                    nodes[id] = {
                        ...node,
                        snapToGrid: true, // ВСЕГДА ВКЛЮЧЕНО ПРИ ИМПОРТЕ
                        size
                    };
                }
            });

            // Автовыравнивание нод на слоях при загрузке
            let layers = { ...payload.layers };
            // Принудительно включаем привязку к сетке для всех слоев при импорте
            Object.keys(layers).forEach(layerId => {
                if (layers[layerId]) {
                    layers[layerId] = {
                        ...layers[layerId],
                        snapToGrid: true // ВСЕГДА ВКЛЮЧЕНО ПРИ ИМПОРТЕ
                    };
                }
            });
            const geom = getGeometry();
            if (geom && geom.getSmartPlacement) {
                Object.keys(layers).forEach(layerId => {
                    const layer = layers[layerId];
                    const layerNodes = Object.values(nodes).filter(n => n.parentId === layerId);
                    if (layerNodes.length > 0) {
                        // Размещаем ноды слоя с чистого листа
                        const { updatesById, newLayerSize } = geom.getSmartPlacement(layerNodes, layer, {});
                        
                        // Применяем новые позиции к нодам
                        Object.keys(updatesById).forEach(nodeId => {
                            if (nodes[nodeId]) {
                                nodes[nodeId] = {
                                    ...nodes[nodeId],
                                    position: updatesById[nodeId].position
                                };
                            }
                        });
                        
                        // Обновляем размер слоя
                        layers[layerId] = {
                            ...layer,
                            size: newLayerSize
                        };
                    }
                });
            }

            // Мягкое расталкивание слоев (предотвращение наложения при импорте, зазор 30px)
            if (geom && geom.resolveLayerCollisionsOnLoad) {
                layers = geom.resolveLayerCollisionsOnLoad(layers, 30);
            }

            // Выталкивание отдельных нод, перекрывающих слои или другие ноды (зазор 30px)
            let finalNodes = nodes;
            if (geom && geom.resolveContextCollisions) {
                finalNodes = geom.resolveContextCollisions(nodes, layers);
            }

            return {
                ...state,
                ...historyState,
                layers: layers,
                nodes: finalNodes,
                ports: payload.ports || {},
                links: payload.links || [],
                canvas: payload.canvas || { offset: { x: 0, y: 0 }, zoom: 1 },
                currentContext: payload.currentContext || 'root',
                breadcrumbs: payload.breadcrumbs || [{ id: 'root', name: 'Главный холст' }],

                cameraByContext: payload.cameraByContext || {},
                navHistory: { past: [], future: [] },
                selectedIds: [],
                isolatedIds: payload.isolatedIds || [],
                interactionMode: 'default',
                pendingConnection: null
            };
        }
        case 'ADD_LAYER': {
            const id = action.payload.id || 'layer-' + Date.now() + Math.floor(Math.random() * 1000);
            const historyState = saveHistory(state, `Добавлен слой: ${action.payload.name}`);
            const parentId = action.payload.parentId !== undefined ? action.payload.parentId : state.currentContext;
            return {
                ...state,
                ...historyState,
                layers: { ...state.layers, [id]: { ...action.payload, id, parentId, snapToGrid: true } },
                selectedIds: [id]
            };
        }
        case 'UPDATE_LAYER': {
            const { id, updates, skipHistory } = action.payload;
            const historyState = skipHistory ? {} : saveHistory(state, `Изменен слой: ${state.layers[id].name}`);
            return {
                ...state,
                ...historyState,
                layers: {
                    ...state.layers,
                    [id]: { ...state.layers[id], ...updates }
                }
            };
        }
        case 'REMOVE_LAYER': {
            const idToRemove = action.payload;
            const historyState = saveHistory(state, `Удален слой`);
            const newLayers = { ...state.layers };
            const parentContext = state.layers[idToRemove]?.parentId || 'root';
            delete newLayers[idToRemove];
            
            const removedLayerPos = state.layers[idToRemove]?.position || { x: 0, y: 0 };
            const newNodes = { ...state.nodes };
            Object.keys(newNodes).forEach(nodeId => {
                if (newNodes[nodeId].parentId === idToRemove) {
                    // Ребёнок переезжает в контекст слоя: компенсируем смещение слоя,
                    // чтобы абсолютная позиция не изменилась
                    const n = newNodes[nodeId];
                    newNodes[nodeId] = {
                        ...n,
                        parentId: parentContext,
                        position: { x: (n.position?.x || 0) + removedLayerPos.x, y: (n.position?.y || 0) + removedLayerPos.y }
                    };
                }
            });

            return {
                ...state,
                ...historyState,
                layers: newLayers,
                nodes: newNodes,
                selectedIds: state.selectedIds.filter(id => id !== idToRemove)
            };
        }
        case 'ALIGN_LAYERS': {
            const { contextId } = action.payload;
            const geom = getGeometry();
            if (!geom || !geom.alignLayers) return state;

            const historyState = saveHistory(state, 'Выравнивание слоев');
            const alignedLayers = geom.alignLayers(state.layers, state.nodes, contextId, 90);

            return {
                ...state,
                ...historyState,
                layers: {
                    ...state.layers,
                    ...alignedLayers
                }
            };
        }
        case 'ADD_NODE': {
            // Используем переданный ID или генерируем новый с рандомизатором для предотвращения коллизий
            const id = action.payload.id || 'node-' + Date.now() + Math.floor(Math.random() * 1000);
            const historyState = saveHistory(state, `Добавлен узел: ${action.payload.name}`);
            const parentId = action.payload.parentId !== undefined ? action.payload.parentId : state.currentContext;
            
            const nodeData = { ...action.payload, id, parentId, snapToGrid: true };
            if (nodeData.type !== 'ai-agent') {
                nodeData.size = calculateNodeSize(nodeData.name, nodeData.content, nodeData.mediaUrl, nodeData.mediaHeight);
            }
            
            return {
                ...state,
                ...historyState,
                // Сначала разворачиваем payload, затем жестко перезаписываем id, чтобы ключ и внутренний id всегда совпадали
                nodes: { ...state.nodes, [id]: nodeData },
                selectedIds: [id]
            };
        }
        case 'UPDATE_NODE': {
            const { id, updates, skipHistory } = action.payload;
            const historyState = skipHistory ? {} : saveHistory(state, `Изменен узел: ${state.nodes[id].name}`);
            
            const oldNode = state.nodes[id];
            const updatedNode = { ...oldNode, ...updates };
            
            // Контентные поля, при изменении которых size пересчитывается заново (userResized сбрасывается)
            const isContentChange = 'content' in updates || 'mediaUrl' in updates || 'mediaHeight' in updates;
            // Косметические поля (name, color и т.д.) — не сбрасывают userResized
            const isSizeRelevant = isContentChange || 'name' in updates;
            
            if (updatedNode.type !== 'ai-agent' && isSizeRelevant) {
                const autoSize = calculateNodeSize(updatedNode.name, updatedNode.content, updatedNode.mediaUrl, updatedNode.mediaHeight);
                
                if (isContentChange) {
                    // Контент изменился — полный пересчёт, сброс ручного размера
                    updatedNode.size = autoSize;
                    updatedNode.userResized = false;
                } else if (updatedNode.userResized) {
                    // Косметическая правка (имя) + пользователь вручную ресайзил — авто-size как нижняя граница
                    updatedNode.size = {
                        w: Math.max(updatedNode.size?.w || 200, autoSize.w),
                        h: Math.max(updatedNode.size?.h || 100, autoSize.h)
                    };
                } else {
                    // Обычная правка имени без ручного ресайза — полный пересчёт
                    updatedNode.size = autoSize;
                }
            }
            
            return {
                ...state,
                ...historyState,
                nodes: {
                    ...state.nodes,
                    [id]: updatedNode
                }
            };
        }
        case 'ADD_PORT': {
            const id = action.payload.id || 'port-' + Date.now() + Math.floor(Math.random() * 1000);
            const historyState = saveHistory(state, `Добавлен порт`);
            return {
                ...state,
                ...historyState,
                ports: { ...state.ports, [id]: { id, ...action.payload } }
            };
        }
        case 'UPDATE_PORT': {
            const { id, updates, skipHistory } = action.payload;
            const historyState = skipHistory ? {} : saveHistory(state, `Изменен порт`);
            return {
                ...state,
                ...historyState,
                ports: {
                    ...state.ports,
                    [id]: { ...state.ports[id], ...updates }
                }
            };
        }
        case 'COMMIT_HISTORY': {
            const snap = action.payload.snapshot;
            return {
                ...state,
                past: [...state.past, { ...snap, contextId: snap.contextId || state.currentContext, breadcrumbs: snap.breadcrumbs || state.breadcrumbs }],
                future: [],
                historyLogs: [...state.historyLogs, action.payload.logMessage]
            };
        }
        case 'UPDATE_LINK': {
            const { id, updates, skipHistory } = action.payload;
            const historyState = skipHistory ? {} : saveHistory(state, `Изменена связь`);
            return {
                ...state,
                ...historyState,
                links: state.links.map(l => l.id === id ? { ...l, ...updates } : l)
            };
        }
        case 'ADD_LINK': {
            const id = action.payload.id || 'link-' + Date.now() + Math.floor(Math.random() * 1000);
            const historyState = saveHistory(state, `Создана связь`);
            return {
                ...state,
                ...historyState,
                links: [...state.links, { id, name: action.payload.name || `Связь ${id.split('-')[1]}`, context: action.payload.context || state.currentContext, ...action.payload }],
                pendingConnection: null,
                interactionMode: 'default'
            };
        }
        case 'DIVE_INTO': {
            const { id, name } = action.payload;
            if (state.currentContext === id) return state;
            
            // Расчет фокуса камеры
            let targetZoom = 1;
            let targetOffsetX = 0;
            let targetOffsetY = 0;
            const padding = 100;
            const { w: screenW, h: screenH } = getScreenSize();

            if (state.nodes[id]) {
                const node = state.nodes[id];
                const nodeAbs = getHierarchy().getAbsolutePosition(id, state.nodes, state.layers);
                const nx = nodeAbs.x;
                const ny = nodeAbs.y;

                // Рассчитываем Bounding Box для самого узла и всех его прямых детей
                let minX = nx;
                let minY = ny;
                let maxX = nx + (node.size?.w || 200);
                let maxY = ny + (node.size?.h || 100);

                Object.values(state.nodes).forEach(child => {
                    if (child.parentId === id) {
                        // Дети хранят относительные координаты: мировые = позиция узла + смещение
                        const cx = nx + (child.position?.x || 0);
                        const cy = ny + (child.position?.y || 0);
                        minX = Math.min(minX, cx);
                        minY = Math.min(minY, cy);
                        maxX = Math.max(maxX, cx + (child.size?.w || 200));
                        maxY = Math.max(maxY, cy + (child.size?.h || 100));
                    }
                });

                const totalW = maxX - minX;
                const totalH = maxY - minY;
                const centerX = minX + totalW / 2;
                const centerY = minY + totalH / 2;

                const scaleX = (screenW - padding * 2) / totalW;
                const scaleY = (screenH - padding * 2) / totalH;
                targetZoom = Math.min(scaleX, scaleY, 1.2);
                targetOffsetX = (screenW / 2) - centerX * targetZoom;
                targetOffsetY = (screenH / 2) - centerY * targetZoom;
            } else if (state.ports[id]) {
                const port = state.ports[id];
                const node = state.nodes[port.nodeId];
                if (node) {
                    targetZoom = 1; // Стандартное приближение
                    const absPos = getPortAbs(port, node, state);
                    targetOffsetX = (screenW / 2) - absPos.x * targetZoom;
                    targetOffsetY = (screenH / 2) - absPos.y * targetZoom;
                }
            } else {
                const link = state.links ? state.links.find(l => l && l.id === id) : null;
                if (link) {
                    const sourcePort = state.ports[link.sourcePortId];
                    const targetPort = state.ports[link.targetPortId];
                    if (sourcePort && targetPort) {
                        const sNode = state.nodes[sourcePort.nodeId];
                        const tNode = state.nodes[targetPort.nodeId];
                        if (sNode && tNode) {
                            const p1 = getPortAbs(sourcePort, sNode, state);
                            const p2 = getPortAbs(targetPort, tNode, state);
                            const midX = (p1.x + p2.x) / 2;
                            const midY = (p1.y + p2.y) / 2;
                            targetZoom = 2;
                            targetOffsetX = (screenW / 2) - midX * targetZoom;
                            targetOffsetY = (screenH / 2) - midY * targetZoom;
                        }
                    }
                }
            }

            // Проверяем, есть ли у целевого контекста (узла/порта/связи) дети или присоединенные сущности
            const hasChildren = Object.values(state.nodes).some(n => n && n.parentId === id) ||
                                Object.values(state.layers || {}).some(l => l && l.parentId === id) ||
                                !!state.ports[id] ||
                                !!(state.links && state.links.some(l => l && l.id === id));


            // Если уровень уже посещали, возвращаем его сохранённую камеру вместо расчётной.
            // keepCamera (zoom-to-dive, этап 6.2): камера не трогается — переход бесшовный.
            // Для пустых узлов (без детей) — не меняем камеру (нет смысла зумить в пустоту).
            const savedCamera = (state.cameraByContext || {})[id];
            const newCanvas = (action.payload.keepCamera || !hasChildren)
                ? state.canvas
                : (savedCamera || { offset: { x: targetOffsetX, y: targetOffsetY }, zoom: targetZoom });

            return {
                ...state,
                currentContext: id,
                breadcrumbs: [...state.breadcrumbs, { id, name }],
                selectedIds: [],
                canvas: newCanvas,
                cameraByContext: { ...(state.cameraByContext || {}), [state.currentContext]: state.canvas },
                navHistory: pushNavEntry(state),
                ui: { ...state.ui, visibleContexts: [], hiddenContexts: [], xRayLevels: [], transitionFromContext: state.currentContext }
            };
        }
        case 'NAVIGATE_TO': {
            // payload: число (индекс крошки) или { index, keepCamera }
            const index = typeof action.payload === 'object' ? action.payload.index : action.payload;
            const keepCamera = typeof action.payload === 'object' && !!action.payload.keepCamera;
            if (index === state.breadcrumbs.length - 1) return state;
            const newBreadcrumbs = state.breadcrumbs.slice(0, index + 1);
            const newContext = newBreadcrumbs[newBreadcrumbs.length - 1].id;
            const savedCamera = (state.cameraByContext || {})[newContext];
            return {
                ...state,
                currentContext: newContext,
                breadcrumbs: newBreadcrumbs,
                selectedIds: [],
                canvas: keepCamera ? state.canvas : (savedCamera || { offset: { x: 0, y: 0 }, zoom: 1 }),
                cameraByContext: { ...(state.cameraByContext || {}), [state.currentContext]: state.canvas },
                navHistory: pushNavEntry(state),
                ui: { ...state.ui, visibleContexts: [], hiddenContexts: [], xRayLevels: [], transitionFromContext: state.currentContext }
            };
        }
        case 'NAV_BACK': {
            const past = [...((state.navHistory && state.navHistory.past) || [])];
            let entry = null;
            while (past.length > 0) {
                const candidate = past.pop();
                if (contextExists(state, candidate.id)) { entry = candidate; break; }
            }
            if (!entry) return state;
            return {
                ...state,
                currentContext: entry.id,
                breadcrumbs: entry.breadcrumbs,
                selectedIds: [],
                canvas: (state.cameraByContext || {})[entry.id] || { offset: { x: 0, y: 0 }, zoom: 1 },
                cameraByContext: { ...(state.cameraByContext || {}), [state.currentContext]: state.canvas },
                navHistory: {
                    past,
                    future: [{ id: state.currentContext, breadcrumbs: state.breadcrumbs }, ...((state.navHistory && state.navHistory.future) || [])]
                },
                ui: { ...state.ui, visibleContexts: [], hiddenContexts: [], xRayLevels: [], transitionFromContext: state.currentContext }
            };
        }
        case 'NAV_FORWARD': {
            const future = [...((state.navHistory && state.navHistory.future) || [])];
            let entry = null;
            while (future.length > 0) {
                const candidate = future.shift();
                if (contextExists(state, candidate.id)) { entry = candidate; break; }
            }
            if (!entry) return state;
            return {
                ...state,
                currentContext: entry.id,
                breadcrumbs: entry.breadcrumbs,
                selectedIds: [],
                canvas: (state.cameraByContext || {})[entry.id] || { offset: { x: 0, y: 0 }, zoom: 1 },
                cameraByContext: { ...(state.cameraByContext || {}), [state.currentContext]: state.canvas },
                navHistory: {
                    past: [...((state.navHistory && state.navHistory.past) || []), { id: state.currentContext, breadcrumbs: state.breadcrumbs }],
                    future
                },
                ui: { ...state.ui, visibleContexts: [], hiddenContexts: [], xRayLevels: [], transitionFromContext: state.currentContext }
            };
        }
        case 'GO_TO_CONTEXT': {
            const targetId = action.payload;
            if (state.currentContext === targetId) return state;

            const breadcrumbs = [{ id: 'root', name: 'Главный холст' }];
            if (targetId !== 'root') {
                const path = [];
                // Поддержка nodes и layers как цели
                let curr = state.nodes[targetId]
                    || (state.layers && state.layers[targetId])
                    || null;
                // Порт → поднимаемся от его узла-владельца
                if (!curr && state.ports[targetId]) {
                    const port = state.ports[targetId];
                    curr = state.nodes[port.nodeId];
                    path.unshift({ id: targetId, name: port.name || 'Порт' });
                }
                // Связь → поднимаемся от source-узла
                if (!curr) {
                    const link = state.links.find(l => l && l.id === targetId);
                    if (link) {
                        const sp = state.ports[link.sourcePortId];
                        curr = sp ? state.nodes[sp.nodeId] : null;
                        path.unshift({ id: targetId, name: link.name || 'Связь' });
                    }
                }
                const visited = new Set();
                while (curr && curr.id !== 'root' && !visited.has(curr.id)) {
                    visited.add(curr.id);
                    path.unshift({ id: curr.id, name: curr.name });
                    curr = state.nodes[curr.parentId]
                        || (state.layers && state.layers[curr.parentId])
                        || null;
                }
                breadcrumbs.push(...path);
            }

            return {
                ...state,
                currentContext: targetId,
                breadcrumbs,
                canvas: (state.cameraByContext || {})[targetId] || state.canvas,
                cameraByContext: { ...(state.cameraByContext || {}), [state.currentContext]: state.canvas },
                navHistory: pushNavEntry(state),
                ui: { ...state.ui, visibleContexts: [], hiddenContexts: [], xRayLevels: [], transitionFromContext: state.currentContext }
            };
        }
        case 'REMOVE_LINK': {
            const historyState = saveHistory(state, `Удалена связь`);
            return {
                ...state,
                ...historyState,
                links: state.links.filter(l => l.id !== action.payload)
            };
        }
        case 'REMOVE_NODE': {
            const nodeId = action.payload;
            const historyState = saveHistory(state, `Удален узел`);
            
            const newNodes = { ...state.nodes };
            delete newNodes[nodeId];
            
            const portsToRemove = Object.values(state.ports).filter(p => p.nodeId === nodeId).map(p => p.id);
            const newPorts = { ...state.ports };
            portsToRemove.forEach(pid => delete newPorts[pid]);
            
            const newLinks = state.links.filter(l => !portsToRemove.includes(l.sourcePortId) && !portsToRemove.includes(l.targetPortId));
            
            let newContext = state.currentContext;
            let newBreadcrumbs = state.breadcrumbs;
            let newCanvas = state.canvas;
            if (state.currentContext === nodeId || state.breadcrumbs.some(b => b.id === nodeId)) {
                newContext = 'root';
                newBreadcrumbs = [{ id: 'root', name: 'Главный холст' }];
                newCanvas = { offset: { x: 0, y: 0 }, zoom: 1 };
            }

            return {
                ...state,
                ...historyState,
                nodes: newNodes,
                ports: newPorts,
                links: newLinks,
                currentContext: newContext,
                breadcrumbs: newBreadcrumbs,
                canvas: newCanvas,
                selectedIds: state.selectedIds.filter(sid => sid !== nodeId)
            };
        }
        case 'REMOVE_PORT': {
            const historyState = saveHistory(state, `Удален порт`);
            const newPorts = { ...state.ports };
            delete newPorts[action.payload];
            // Также удаляем все связанные с портом связи
            const newLinks = state.links.filter(l => l.sourcePortId !== action.payload && l.targetPortId !== action.payload);
            return {
                ...state,
                ...historyState,
                ports: newPorts,
                links: newLinks,
                selectedEntityId: null
            };
        }
        case 'UNDO': {
            if (state.past.length === 0) return state;
            const previous = state.past[state.past.length - 1];
            const newPast = state.past.slice(0, state.past.length - 1);
            const currentSnapshot = { layers: state.layers, nodes: state.nodes, ports: state.ports, links: state.links, contextId: state.currentContext, breadcrumbs: state.breadcrumbs };
            const newLogs = state.historyLogs.slice(0, state.historyLogs.length - 1);

            // Прыжок в контекст правки (этап 6.3): иначе откат из другого уровня невидим
            let navPatch = {};
            if (previous.contextId && previous.contextId !== state.currentContext) {
                const restoredState = { ...state, layers: previous.layers || {}, nodes: previous.nodes, ports: previous.ports, links: previous.links };
                if (contextExists(restoredState, previous.contextId)) {
                    navPatch = {
                        currentContext: previous.contextId,
                        breadcrumbs: previous.breadcrumbs || [{ id: 'root', name: 'Главный холст' }],
                        canvas: (state.cameraByContext || {})[previous.contextId] || state.canvas,
                        ui: { ...state.ui, transitionFromContext: state.currentContext }
                    };
                }
            }

            return {
                ...state,
                layers: previous.layers || {},
                nodes: previous.nodes,
                ports: previous.ports,
                links: previous.links,
                past: newPast,
                future: [currentSnapshot, ...state.future],
                historyLogs: newLogs,
                selectedIds: [],
                ...navPatch
            };
        }
        case 'REDO': {
            if (state.future.length === 0) return state;
            const next = state.future[0];
            const newFuture = state.future.slice(1);
            const currentSnapshot = { layers: state.layers, nodes: state.nodes, ports: state.ports, links: state.links, contextId: state.currentContext, breadcrumbs: state.breadcrumbs };

            let navPatch = {};
            if (next.contextId && next.contextId !== state.currentContext) {
                const restoredState = { ...state, layers: next.layers || {}, nodes: next.nodes, ports: next.ports, links: next.links };
                if (contextExists(restoredState, next.contextId)) {
                    navPatch = {
                        currentContext: next.contextId,
                        breadcrumbs: next.breadcrumbs || [{ id: 'root', name: 'Главный холст' }],
                        canvas: (state.cameraByContext || {})[next.contextId] || state.canvas,
                        ui: { ...state.ui, transitionFromContext: state.currentContext }
                    };
                }
            }

            return {
                ...state,
                layers: next.layers || {},
                nodes: next.nodes,
                ports: next.ports,
                links: next.links,
                past: [...state.past, currentSnapshot],
                future: newFuture,
                historyLogs: [...state.historyLogs, 'Повтор действия'],
                selectedIds: [],
                ...navPatch
            };
        }
        case 'TOGGLE_CONTEXT_VISIBILITY': {
            const contextId = action.payload;
            const currentVis = state.ui.visibleContexts || [];
            const newVis = currentVis.includes(contextId) 
                ? currentVis.filter(id => id !== contextId)
                : [...currentVis, contextId];
            return { ...state, ui: { ...state.ui, visibleContexts: newVis } };
        }
        case 'TOGGLE_CONTEXT_HIDDEN': {
            const contextId = action.payload;
            const currentHidden = state.ui.hiddenContexts || [];
            const newHidden = currentHidden.includes(contextId) 
                ? currentHidden.filter(id => id !== contextId)
                : [...currentHidden, contextId];
            return { ...state, ui: { ...state.ui, hiddenContexts: newHidden } };
        }
        case 'TOGGLE_XRAY_LEVEL': {
            const level = action.payload;
            const currentLevels = state.ui.xRayLevels || [];
            const newLevels = currentLevels.includes(level)
                ? currentLevels.filter(l => l !== level)
                : [...currentLevels, level];
            return { ...state, ui: { ...state.ui, xRayLevels: newLevels } };
        }
        case 'TOGGLE_UI': {
            return {
                ...state,
                ui: { ...state.ui, [action.payload]: !state.ui[action.payload] }
            };
        }
        case 'SET_UI': {
            return {
                ...state,
                ui: { ...state.ui, ...action.payload }
            };
        }
        case 'SET_LIBRARY_TAB': {
            return {
                ...state,
                ui: { ...state.ui, libraryOpen: true, libraryTab: action.payload }
            };
        }
        case 'TOGGLE_AI_AGENT': {
            return {
                ...state,
                ui: { ...state.ui, aiAgentOpen: !state.ui.aiAgentOpen }
            };
        }
        case 'UPDATE_AI_SETTINGS': {
            return {
                ...state,
                ui: { ...state.ui, aiAgentSettings: { ...state.ui.aiAgentSettings, ...action.payload } }
            };
        }
        case 'ADD_AI_MESSAGE': {
            const currentHistory = state.aiChatHistory || [];
            return {
                ...state,
                aiChatHistory: [...currentHistory, action.payload]
            };
        }
        case 'EMERGENCY_CLEAR_MEMORY': {
            // Очищаем историю и тяжелые медиафайлы прямо в стейте React
            const cleanNodes = { ...state.nodes };
            Object.keys(cleanNodes).forEach(key => {
                if (cleanNodes[key].mediaUrl && cleanNodes[key].mediaUrl.startsWith('data:image')) {
                    cleanNodes[key] = { ...cleanNodes[key], mediaUrl: null };
                }
            });

            return {
                ...state,
                past: [],
                future: [],
                historyLogs: ['История была автоматически очищена для освобождения памяти'],
                aiChatHistory: (state.aiChatHistory || []).map(msg => ({...msg, media: null})),
                nodes: cleanNodes
            };
        }
        case 'SET_SELECTED':
            return { ...state, selectedIds: action.payload ? [action.payload] : [] };
        case 'SET_MULTI_SELECTED':
            return { ...state, selectedIds: Array.isArray(action.payload) ? action.payload : [] };
        case 'TOGGLE_SELECTED': {
            const id = action.payload;
            if (state.selectedIds.includes(id)) {
                return { ...state, selectedIds: state.selectedIds.filter(sid => sid !== id) };
            } else {
                return { ...state, selectedIds: [...state.selectedIds, id] };
            }
        }
        case 'SET_ISOLATED':
            return { ...state, isolatedIds: action.payload };
        case 'MASS_UPDATE': {
            const { ids, updates, updatesById } = action.payload;
            const historyState = saveHistory(state, `Массовое изменение элементов`);
            const newNodes = { ...state.nodes };
            const newLayers = { ...state.layers };
            const newPorts = { ...state.ports };
            const newLinks = [...state.links];

            ids.forEach(id => {
                const specificUpdates = updatesById && updatesById[id] ? updatesById[id] : updates;
                if (newNodes[id]) newNodes[id] = { ...newNodes[id], ...specificUpdates };
                else if (newLayers[id]) newLayers[id] = { ...newLayers[id], ...specificUpdates };
                else if (newPorts[id]) newPorts[id] = { ...newPorts[id], ...specificUpdates };
                else {
                    const lIdx = newLinks ? newLinks.findIndex(l => l && l.id === id) : -1;
                    if (lIdx !== -1) newLinks[lIdx] = { ...newLinks[lIdx], ...specificUpdates };
                }
            });

            return { ...state, ...historyState, nodes: newNodes, layers: newLayers, ports: newPorts, links: newLinks };
        }
        case 'MOVE_SELECTED': {
            const { dx, dy, skipHistory } = action.payload;
            const historyState = skipHistory ? {} : saveHistory(state, `Перемещение выделенных элементов`);

            const newNodes = { ...state.nodes };
            const newLayers = { ...state.layers };

            // Координаты относительные: если выделен и предок, и его потомок,
            // двигаем только предка — потомок поедет вместе с ним автоматически
            const selectedSet = new Set(state.selectedIds);
            const hasSelectedAncestor = (id) => {
                let current = state.nodes[id] || (state.layers && state.layers[id]);
                const visited = new Set();
                while (current && current.parentId && current.parentId !== 'root' && !visited.has(current.parentId)) {
                    if (selectedSet.has(current.parentId)) return true;
                    visited.add(current.parentId);
                    current = state.nodes[current.parentId] || (state.layers && state.layers[current.parentId]) || null;
                }
                return false;
            };

            state.selectedIds.forEach(id => {
                if (hasSelectedAncestor(id)) return;
                if (newNodes[id]) {
                    newNodes[id] = { ...newNodes[id], position: { x: newNodes[id].position.x + dx, y: newNodes[id].position.y + dy } };
                } else if (newLayers[id]) {
                    newLayers[id] = { ...newLayers[id], position: { x: newLayers[id].position.x + dx, y: newLayers[id].position.y + dy } };
                }
            });

            return { ...state, ...historyState, nodes: newNodes, layers: newLayers };
        }
        case 'REPARENT_ENTITY': {
            // Перевложение с сохранением абсолютной позиции (см. docs/PLAN.md, этап 5.2)
            const { id, newParentId } = action.payload;
            const H = getHierarchy();
            const entity = state.nodes[id] || (state.layers && state.layers[id]);
            if (!entity || entity.parentId === newParentId) return state;
            if (newParentId !== 'root' && H.isDescendantOf(newParentId, id, state.nodes, state.layers)) return state;

            const abs = H.getAbsolutePosition(id, state.nodes, state.layers);
            const rel = H.toRelativePosition(abs, newParentId, state.nodes, state.layers);
            const historyState = saveHistory(state, `Элемент перевложен: ${entity.name}`);

            if (state.nodes[id]) {
                return { ...state, ...historyState, nodes: { ...state.nodes, [id]: { ...entity, parentId: newParentId, position: rel } } };
            }
            return { ...state, ...historyState, layers: { ...state.layers, [id]: { ...entity, parentId: newParentId, position: rel } } };
        }
        case 'DELETE_SELECTED': {
            if (state.selectedIds.length === 0) return state;
            const historyState = saveHistory(state, `Удалено ${state.selectedIds.length} элементов`);
            
            let newNodes = { ...state.nodes };
            let newLayers = { ...state.layers };
            let newPorts = { ...state.ports };
            let newLinks = [...state.links];
            
            let portsToRemove = [];
            let removedLayerIds = [];

            state.selectedIds.forEach(id => {
                if (newNodes[id]) {
                    delete newNodes[id];
                    Object.values(newPorts).forEach(p => { if(p.nodeId === id) portsToRemove.push(p.id); });
                }
                else if (newLayers[id]) {
                    removedLayerIds.push({ id, parentId: newLayers[id].parentId || 'root', position: newLayers[id].position || { x: 0, y: 0 } });
                    delete newLayers[id];
                }
                else if (newPorts[id]) portsToRemove.push(id);
                else {
                    newLinks = newLinks.filter(l => l.id !== id);
                }
            });

            removedLayerIds.forEach(removedLayer => {
                Object.keys(newNodes).forEach(nodeId => {
                    if (newNodes[nodeId].parentId === removedLayer.id) {
                        // Компенсация смещения удалённого слоя: абсолютная позиция сохраняется
                        const n = newNodes[nodeId];
                        newNodes[nodeId] = {
                            ...n,
                            parentId: removedLayer.parentId,
                            position: { x: (n.position?.x || 0) + removedLayer.position.x, y: (n.position?.y || 0) + removedLayer.position.y }
                        };
                    }
                });
            });

            portsToRemove.forEach(pid => delete newPorts[pid]);
            newLinks = newLinks.filter(l => !portsToRemove.includes(l.sourcePortId) && !portsToRemove.includes(l.targetPortId));

            return {
                ...state,
                ...historyState,
                nodes: newNodes,
                layers: newLayers,
                ports: newPorts,
                links: newLinks,
                selectedIds: [],
                isolatedIds: state.isolatedIds.filter(id => !state.selectedIds.includes(id))
            };
        }
        case 'CENTER_ON_ENTITY': {
            const id = action.payload;
            if (!id) return state;
            
            let targetZoom = state.canvas.zoom;
            let targetOffsetX = state.canvas.offset.x;
            let targetOffsetY = state.canvas.offset.y;
            const { w: screenW, h: screenH } = getScreenSize();

            let newZoom = targetZoom;
            
            // Центрируем с учетом открытой панели библиотеки (сдвигаем визуальный центр правее)
            const libraryWidth = state.ui.libraryOpen ? 300 : 0;
            const visualCenterX = (screenW + libraryWidth) / 2;

            if (state.nodes[id]) {
                const node = state.nodes[id];
                const nodeAbs = getHierarchy().getAbsolutePosition(id, state.nodes, state.layers);
                const nx = nodeAbs.x;
                const ny = nodeAbs.y;
                const nw = node.size?.w || 200;
                const nh = node.size?.h || 100;
                const padding = 200;
                const scaleX = (screenW - libraryWidth - padding) / nw;
                const scaleY = (screenH - padding) / nh;
                newZoom = Math.min(Math.max(scaleX, scaleY, 0.5), 1.2); // Плавный зум для узла
                targetOffsetX = visualCenterX - (nx + nw / 2) * newZoom;
                targetOffsetY = (screenH / 2) - (ny + nh / 2) * newZoom;
            } else if (state.layers && state.layers[id]) {
                const layer = state.layers[id];
                const layerAbs = getHierarchy().getAbsolutePosition(id, state.nodes, state.layers);
                const lx = layerAbs.x;
                const ly = layerAbs.y;
                const lw = layer.size?.w || 600;
                const lh = layer.size?.h || 400;
                const padding = 200;
                const scaleX = (screenW - libraryWidth - padding) / lw;
                const scaleY = (screenH - padding) / lh;
                newZoom = Math.min(Math.max(scaleX, scaleY, 0.1), 1.0); // Плавный зум для слоя
                targetOffsetX = visualCenterX - (lx + lw / 2) * newZoom;
                targetOffsetY = (screenH / 2) - (ly + lh / 2) * newZoom;
            } else if (state.ports[id]) {
                const port = state.ports[id];
                const node = state.nodes[port.nodeId];
                if (node) {
                    // Сохраняем текущий зум (newZoom остается равным targetZoom)
                    const absPos = getPortAbs(port, node, state);
                    targetOffsetX = visualCenterX - absPos.x * newZoom;
                    targetOffsetY = (screenH / 2) - absPos.y * newZoom;
                }
            } else {
                const link = state.links ? state.links.find(l => l && l.id === id) : null;
                if (link) {
                    const sourcePort = state.ports[link.sourcePortId];
                    const targetPort = state.ports[link.targetPortId];
                    if (sourcePort && targetPort) {
                        const sNode = state.nodes[sourcePort.nodeId];
                        const tNode = state.nodes[targetPort.nodeId];
                        if (sNode && tNode) {
                            const p1 = getPortAbs(sourcePort, sNode, state);
                            const p2 = getPortAbs(targetPort, tNode, state);
                            const midX = (p1.x + p2.x) / 2;
                            const midY = (p1.y + p2.y) / 2;

                            const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                            const scale = (screenW - libraryWidth - 200) / (dist || 1);
                            newZoom = Math.min(Math.max(scale, 0.5), 1.5);
                            
                            targetOffsetX = visualCenterX - midX * newZoom;
                            targetOffsetY = (screenH / 2) - midY * newZoom;
                        }
                    }
                }
            }

            return {
                ...state,
                canvas: { ...state.canvas, offset: { x: targetOffsetX, y: targetOffsetY }, zoom: newZoom }
            };
        }
        case 'SET_MODE':
            return { ...state, interactionMode: action.payload, pendingConnection: null };
        case 'SET_PENDING_CONNECTION':
            return { ...state, pendingConnection: action.payload };
        case 'UPDATE_PENDING_CONNECTION':
            if (!state.pendingConnection) return state;
            return { ...state, pendingConnection: { ...state.pendingConnection, endPos: action.payload } };
        case 'SET_CLIPBOARD':
            return { ...state, clipboard: action.payload };
        case 'SET_CANVAS':
            return { ...state, canvas: { ...state.canvas, ...action.payload } };
        default:
            return state;
    }
};

const ArchitectorStore = { STORAGE_KEY, LEGACY_STORAGE_KEY_V9, FORMAT_VERSION, defaultState, getInitialState, reducer, saveHistory, pushNavEntry, contextExists, migrateToV10 };
if (typeof window !== 'undefined') window.ArchitectorStore = ArchitectorStore;
if (typeof module !== 'undefined') module.exports = ArchitectorStore;
