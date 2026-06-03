const { createContext, useReducer, useContext } = React;

const STORAGE_KEY = 'architector_state_v9';

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
        ui: {
            libraryOpen: true,
            libraryTab: 'objects',
            aiAgentOpen: false,
            visibleContexts: [],
            hiddenContexts: [],
        aiAgentSettings: {
            apiKey: '',
            model: 'gpt-4o',
            mode: 'agent',
            contextMode: 'global',
            llmEnabled: true
        }
    },
    aiChatHistory: [
        { role: 'ai', content: 'Привет! Я построил для вас архитектуру Централизованной Криптобиржи (CEX) из 16 узлов и 3 слоев, как вы и просили!' }
    ],
    clipboard: null,
    past: [],
    future: [],
    historyLogs: ['Инициализация CEX архитектуры']
};

const getInitialState = () => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            
            // Миграция и самолечение: исправление рассинхрона ключей и ID узлов (удаление призраков)
            const cleanNodes = {};
            if (parsed.nodes) {
                Object.entries(parsed.nodes).forEach(([key, node]) => {
                    // Игнорируем явных призраков (узлы без базовых свойств)
                    if (!node || (!node.name && !node.type)) return;
                    
                    // Авто-заполнение пустого узла "Итог анализа рисков"
                    if (node.name && node.name.toLowerCase().includes('итог анализа рисков') && (!node.content || node.content.trim() === '')) {
                        node.content = "⚠️ АНАЛИЗ РИСКОВ И РЕШЕНИЯ\n\n1. Финансовые риски:\n- Внезапные просадки (Drawdowns)\n> Решение: Жесткий Margin Call Engine и резервный фонд (Insurance Fund).\n\n2. Технические риски:\n- Сбой в Matching Engine\n> Решение: Heartbeat-мониторинг, автоматический Failover (Kill Switch).\n\n3. Операционные риски:\n- Атака на горячие кошельки\n> Решение: Хранение 95% средств на холодных кошельках, мультисиг-подтверждение.";
                        node.size = { w: 320, h: 220 }; // Корректируем размер под текст
                    }
                    
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
    const snapshot = { layers: state.layers, nodes: state.nodes, ports: state.ports, links: state.links };
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

const reducer = (state, action) => {
    switch (action.type) {
        case 'LOAD_STATE': {
            const historyState = saveHistory(state, `Загружен проект из файла`);
            return {
                ...state,
                ...historyState,
                layers: action.payload.layers || {},
                nodes: action.payload.nodes || {},
                ports: action.payload.ports || {},
                links: action.payload.links || [],
                canvas: action.payload.canvas || { offset: { x: 0, y: 0 }, zoom: 1 },
                currentContext: action.payload.currentContext || 'root',
                breadcrumbs: action.payload.breadcrumbs || [{ id: 'root', name: 'Главный холст' }],
                selectedIds: [],
                isolatedIds: action.payload.isolatedIds || [],
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
                layers: { ...state.layers, [id]: { ...action.payload, id, parentId } },
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
            
            const newNodes = { ...state.nodes };
            Object.keys(newNodes).forEach(nodeId => {
                if (newNodes[nodeId].parentId === idToRemove) {
                    newNodes[nodeId] = { ...newNodes[nodeId], parentId: parentContext };
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
        case 'ADD_NODE': {
            // Используем переданный ID или генерируем новый с рандомизатором для предотвращения коллизий
            const id = action.payload.id || 'node-' + Date.now() + Math.floor(Math.random() * 1000);
            const historyState = saveHistory(state, `Добавлен узел: ${action.payload.name}`);
            const parentId = action.payload.parentId !== undefined ? action.payload.parentId : state.currentContext;
            return {
                ...state,
                ...historyState,
                // Сначала разворачиваем payload, затем жестко перезаписываем id, чтобы ключ и внутренний id всегда совпадали
                nodes: { ...state.nodes, [id]: { ...action.payload, id, parentId } },
                selectedIds: [id]
            };
        }
        case 'UPDATE_NODE': {
            const { id, updates, skipHistory } = action.payload;
            const historyState = skipHistory ? {} : saveHistory(state, `Изменен узел: ${state.nodes[id].name}`);
            return {
                ...state,
                ...historyState,
                nodes: {
                    ...state.nodes,
                    [id]: { ...state.nodes[id], ...updates }
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
            return {
                ...state,
                past: [...state.past, action.payload.snapshot],
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
            const screenW = window.innerWidth;
            const screenH = window.innerHeight;

            if (state.nodes[id]) {
                const node = state.nodes[id];
                const nx = node.position?.x || 0;
                const ny = node.position?.y || 0;
                
                // Рассчитываем Bounding Box для самого узла и всех его прямых детей
                let minX = nx;
                let minY = ny;
                let maxX = nx + (node.size?.w || 200);
                let maxY = ny + (node.size?.h || 100);
                
                Object.values(state.nodes).forEach(child => {
                    if (child.parentId === id) {
                        const cx = child.position?.x || 0;
                        const cy = child.position?.y || 0;
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
                targetZoom = Math.min(scaleX, scaleY, 5);
                targetOffsetX = (screenW / 2) - centerX * targetZoom;
                targetOffsetY = (screenH / 2) - centerY * targetZoom;
            } else if (state.ports[id]) {
                const port = state.ports[id];
                const node = state.nodes[port.nodeId];
                if (node) {
                    targetZoom = 1; // Стандартное приближение
                    const absPos = window.GeometryUtils.getPortAbsolutePosition(port, node);
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
                            const p1 = window.GeometryUtils.getPortAbsolutePosition(sourcePort, sNode);
                            const p2 = window.GeometryUtils.getPortAbsolutePosition(targetPort, tNode);
                            const midX = (p1.x + p2.x) / 2;
                            const midY = (p1.y + p2.y) / 2;
                            targetZoom = 2;
                            targetOffsetX = (screenW / 2) - midX * targetZoom;
                            targetOffsetY = (screenH / 2) - midY * targetZoom;
                        }
                    }
                }
            }

            return {
                ...state,
                currentContext: id,
                breadcrumbs: [...state.breadcrumbs, { id, name }],
                selectedIds: [],
                canvas: { offset: { x: targetOffsetX, y: targetOffsetY }, zoom: targetZoom },
                ui: { ...state.ui, visibleContexts: [], hiddenContexts: [], xRayLevels: [] }
            };
        }
        case 'NAVIGATE_TO': {
            const index = action.payload;
            if (index === state.breadcrumbs.length - 1) return state;
            const newBreadcrumbs = state.breadcrumbs.slice(0, index + 1);
            const newContext = newBreadcrumbs[newBreadcrumbs.length - 1].id;
            return {
                ...state,
                currentContext: newContext,
                breadcrumbs: newBreadcrumbs,
                selectedIds: [],
                canvas: { offset: { x: 0, y: 0 }, zoom: 1 }, // сброс камеры при выходе
                ui: { ...state.ui, visibleContexts: [], hiddenContexts: [], xRayLevels: [] }
            };
        }
        case 'GO_TO_CONTEXT': {
            const targetId = action.payload;
            if (state.currentContext === targetId) return state;

            const breadcrumbs = [{ id: 'root', name: 'Главный холст' }];
            if (targetId !== 'root') {
                const path = [];
                let curr = state.nodes[targetId];
                const visited = new Set();
                while (curr && curr.id !== 'root' && !visited.has(curr.id)) {
                    visited.add(curr.id);
                    path.unshift({ id: curr.id, name: curr.name });
                    curr = state.nodes[curr.parentId];
                }
                breadcrumbs.push(...path);
            }

            return {
                ...state,
                currentContext: targetId,
                breadcrumbs,
                ui: { ...state.ui, visibleContexts: [], hiddenContexts: [], xRayLevels: [] }
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
            const currentSnapshot = { layers: state.layers, nodes: state.nodes, ports: state.ports, links: state.links };
            const newLogs = state.historyLogs.slice(0, state.historyLogs.length - 1);
            
            return {
                ...state,
                layers: previous.layers || {},
                nodes: previous.nodes,
                ports: previous.ports,
                links: previous.links,
                past: newPast,
                future: [currentSnapshot, ...state.future],
                historyLogs: newLogs,
                selectedIds: []
            };
        }
        case 'REDO': {
            if (state.future.length === 0) return state;
            const next = state.future[0];
            const newFuture = state.future.slice(1);
            const currentSnapshot = { layers: state.layers, nodes: state.nodes, ports: state.ports, links: state.links };
            
            return {
                ...state,
                layers: next.layers || {},
                nodes: next.nodes,
                ports: next.ports,
                links: next.links,
                past: [...state.past, currentSnapshot],
                future: newFuture,
                historyLogs: [...state.historyLogs, 'Повтор действия'],
                selectedIds: []
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
            
            state.selectedIds.forEach(id => {
                if (newNodes[id]) {
                    newNodes[id] = { ...newNodes[id], position: { x: newNodes[id].position.x + dx, y: newNodes[id].position.y + dy } };
                } else if (newLayers[id]) {
                    newLayers[id] = { ...newLayers[id], position: { x: newLayers[id].position.x + dx, y: newLayers[id].position.y + dy } };
                }
            });

            return { ...state, ...historyState, nodes: newNodes, layers: newLayers };
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
                    removedLayerIds.push({ id, parentId: newLayers[id].parentId || 'root' });
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
                        newNodes[nodeId] = { ...newNodes[nodeId], parentId: removedLayer.parentId };
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
            const screenW = window.innerWidth;
            const screenH = window.innerHeight;

            let newZoom = targetZoom;
            
            // Центрируем с учетом открытой панели библиотеки (сдвигаем визуальный центр правее)
            const libraryWidth = state.ui.libraryOpen ? 300 : 0;
            const visualCenterX = (screenW + libraryWidth) / 2;

            if (state.nodes[id]) {
                const node = state.nodes[id];
                const nx = node.position?.x || 0;
                const ny = node.position?.y || 0;
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
                const lx = layer.position?.x || 0;
                const ly = layer.position?.y || 0;
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
                    const absPos = window.GeometryUtils.getPortAbsolutePosition(port, node);
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
                            const p1 = window.GeometryUtils.getPortAbsolutePosition(sourcePort, sNode);
                            const p2 = window.GeometryUtils.getPortAbsolutePosition(targetPort, tNode);
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

const StoreContext = createContext();

const StoreProvider = ({ children }) => {
    const [state, dispatch] = useReducer(reducer, getInitialState());

    React.useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.error('Ошибка сохранения состояния:', e);
            if (e.name === 'QuotaExceededError' || e.message.includes('QuotaExceededError')) {
                // Если превышена квота, пробуем сохранить без длинной истории и тяжелых медиафайлов в чате
                try {
                    const emergencyState = { 
                        ...state, 
                        past: [], 
                        future: [], 
                        historyLogs: ['История была автоматически очищена для освобождения памяти'],
                        aiChatHistory: state.aiChatHistory.map(msg => ({...msg, media: null})) // Удаляем тяжелые картинки из чата
                    };
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(emergencyState));
                    console.warn('Состояние сохранено в аварийном режиме (без истории и картинок).');
                } catch (fallbackError) {
                    console.error('Не удалось сохранить состояние даже в аварийном режиме:', fallbackError);
                }
            }
        }
    }, [state]);

    return (
        <StoreContext.Provider value={{ state, dispatch }}>
            {children}
        </StoreContext.Provider>
    );
};

const useStore = () => useContext(StoreContext);