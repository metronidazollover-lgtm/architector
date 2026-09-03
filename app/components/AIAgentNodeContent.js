// === Изолированное хранилище API-ключей (не попадает в основной стейт, экспорт и git) ===
const _API_KEY_STORAGE = 'architector_api_key';
const _SAVED_KEYS_STORAGE = 'architector_saved_api_keys';
function _setActiveApiKey(k) { try { localStorage.setItem(_API_KEY_STORAGE, k); } catch(e) {} }
function _getSavedApiKeys() { try { return JSON.parse(localStorage.getItem(_SAVED_KEYS_STORAGE) || '[]'); } catch(e) { return []; } }
function _setSavedApiKeys(arr) { try { localStorage.setItem(_SAVED_KEYS_STORAGE, JSON.stringify(arr)); } catch(e) {} }

// Потолок команд в одном ответе ассистента. Страховка от runaway-ответа, а не
// рабочее ограничение: весь батч применяется одним шагом истории и снимается
// одним Ctrl+Z, поэтому защитой служит подтверждение, а не малое число.
// Значение продублировано в системном промпте — менять их только вместе.
const MAX_AI_BATCH_SIZE = 500;

// Автоопределение провайдера по префиксу API-ключа
function detectProviderByKey(rawKey) {
    if (!rawKey || typeof rawKey !== 'string') return null;
    const k = rawKey.trim();
    if (k.startsWith('AIzaSy') || k.startsWith('AIza')) return 'google';
    if (k.startsWith('sk-ant-')) return 'anthropic';
    if (k.startsWith('xai-')) return 'grok';
    if (k.startsWith('sk-proj-') || k.startsWith('sk-')) return 'openai';
    return null;
}

function AIAgentNodeContent({ nodeId }) {
    // useProjectStore() вместо useStore(): узел-ассистент рендерится внутри
    // NodeView конкретного проекта на холсте (свой ProjectContext от Canvas.js)
    // и обязан читать/менять СВОЙ проект, даже если сейчас активен другой.
    // useStore() отдавал бы активный проект — узел в неактивном проекте видел
    // бы и правил чужие данные. См. docs/ARCHITECTURE.md, «Проектно-адресный
    // слой поверх Store.js».
    const { state, dispatch } = useProjectStore();
    const [tab, setTab] = React.useState('chat'); // 'chat' | 'logs' | 'settings'
    const [actionLogs, setActionLogs] = React.useState([]);
    const [input, setInput] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);
    const [attachedMedia, setAttachedMedia] = React.useState(null);
    const [testStatus, setTestStatus] = React.useState(null);
    const [fetchedModels, setFetchedModels] = React.useState([]);
    const [isFetchingModels, setIsFetchingModels] = React.useState(false);
    const [fetchModelMsg, setFetchModelMsg] = React.useState('');
    const [showKeyManager, setShowKeyManager] = React.useState(false);
    const [savedKeys, setSavedKeys] = React.useState(_getSavedApiKeys);
    const [kmForm, setKmForm] = React.useState({ label: '', provider: 'openai', key: '' });
    const [pendingBatch, setPendingBatch] = React.useState(null);
    const chatEndRef = React.useRef(null);
    const fileInputRef = React.useRef(null);

    // Актуальный срез стейта для асинхронных колбеков (setTimeout), чтобы не захватывать устаревшее замыкание
    const stateRef = React.useRef(state);
    stateRef.current = state;
    const mountedRef = React.useRef(true);
    React.useEffect(() => { return () => { mountedRef.current = false; }; }, []);

    const { aiAgentSettings = {} } = state.ui;
    // Поддержка множественных сеансов чата для одного узла
    const nodeSessionData = (state.aiChatSessionsByNode && state.aiChatSessionsByNode[nodeId]) || null;
    let currentSessions = nodeSessionData ? nodeSessionData.sessions : null;
    let activeSessionId = nodeSessionData ? nodeSessionData.activeSessionId : null;

    if (!currentSessions || currentSessions.length === 0) {
        const legacyHistory = (state.aiChatHistoryByNode && state.aiChatHistoryByNode[nodeId]) || state.aiChatHistory || [];
        activeSessionId = 'session-default';
        currentSessions = [{ id: 'session-default', title: 'Диалог 1', messages: legacyHistory }];
    }

    const activeSession = currentSessions.find(s => s.id === activeSessionId) || currentSessions[0];
    const chatHistory = activeSession ? activeSession.messages : [];

    // Функция применения батча экшенов от ИИ к холсту.
    //
    // Весь батч — ОДИН шаг Undo. Без этого каждый экшен ИИ писал собственный
    // снимок, батч из 30+ команд полностью вымывал лимит истории в 20 шагов, и
    // отменить работу ассистента одним Ctrl+Z было невозможно в принципе.
    // Пакет открывается до применения и закрывается в finally — прерывание на
    // любой команде не должно оставить историю выключенной.
    const applyActionBatch = React.useCallback((actionsList, cleanAiText = '') => {
        let validCount = 0;
        let invalidCount = 0;
        const logEntries = [];
        const currentState = stateRef.current;

        dispatch({ type: 'BEGIN_HISTORY_BATCH', payload: { logMessage: `ИИ-ассистент: ${actionsList.length} действий` } });
        try {
        actionsList.forEach(action => {
            const val = validateAndSanitizeAction(action, currentState, actionsList);
            if (val.valid) {
                try {
                    dispatch(action);
                    validCount++;
                    logEntries.push({
                        id: Date.now() + Math.random(),
                        time: new Date().toLocaleTimeString(),
                        type: 'success',
                        msg: `Применен экшен ${action.type} (id: ${action.payload?.id || '—'})`
                    });
                } catch (actionErr) {
                    console.error('Ошибка выполнения экшена от ИИ:', actionErr, action);
                    invalidCount++;
                    logEntries.push({
                        id: Date.now() + Math.random(),
                        time: new Date().toLocaleTimeString(),
                        type: 'error',
                        msg: `Ошибка выполнения ${action.type}: ${actionErr.message}`
                    });
                }
            } else {
                console.warn('Отклонен невалидный экшен от ИИ:', val.reason, action);
                invalidCount++;
                logEntries.push({
                    id: Date.now() + Math.random(),
                    time: new Date().toLocaleTimeString(),
                    type: 'warn',
                    msg: `Отклонен экшен ${action.type}: ${val.reason}`
                });
            }
        });
        } finally {
            // Ни одна команда не применилась — пустой шаг в историю не пишем
            if (validCount > 0) {
                dispatch({ type: 'COMMIT_HISTORY', payload: { logMessage: `ИИ-ассистент: применено ${validCount} действий` } });
            } else {
                dispatch({ type: 'CANCEL_HISTORY_BATCH' });
            }
        }

        setActionLogs(prev => [...logEntries, ...prev].slice(0, 150));

        let report = cleanAiText ? (cleanAiText + '\n\n') : '';
        if (validCount > 0) {
            report += `✅ *Применено ${validCount} экшенов к холсту.* Отменить всё разом — Ctrl+Z.`;

            // v14: дорожка не имеет собственного размера (ширина — константа
            // LANE_W/ROOT_LANE_W), поэтому «подогнать слой под содержимое»
            // после пакета команд больше не нужно — остаётся только разложить
            // затронутые окна по колонкам глубины, чтобы новые узлы/окна не
            // громоздились друг на друге.
            setTimeout(() => {
                if (!mountedRef.current) return;
                dispatch({ type: 'ALIGN_WINDOWS' });
            }, 50);
        }
        if (invalidCount > 0) {
            report += (validCount > 0 ? '\n' : '') + `⚠️ *Отклонено ${invalidCount} невалидных команд.*`;
        }

        if (report) {
            dispatch({ type: 'ADD_AI_MESSAGE', payload: { nodeId, message: { role: 'ai', content: report.trim() } } });
        }
        setPendingBatch(null);
    }, [dispatch, nodeId]);

    React.useEffect(() => {
        if (chatEndRef.current && tab === 'chat') {
            // НЕ scrollIntoView: он прокручивает ВСЕХ прокручиваемых предков,
            // включая overflow:hidden контейнеры холста и вьюпорт окна уровня —
            // мир визуально сдвигался, хотя стейт камеры не менялся.
            // Прокручиваем только сам контейнер сообщений.
            const scroller = chatEndRef.current.parentElement;
            if (scroller) scroller.scrollTop = scroller.scrollHeight;
        }
    }, [chatHistory, tab, activeSessionId]);

    // Валидация JSON-экшенов перед вызовом dispatch
    const validateAndSanitizeAction = (action, currentState = state, batchActions = []) => {
        const SUPPORTED_ACTION_TYPES = new Set([
            'ADD_FRAME', 'ADD_NODE', 'ADD_PORT', 'ADD_LINK',
            'UPDATE_NODE', 'UPDATE_FRAME', 'UPDATE_PORT', 'UPDATE_LINK',
            'REPARENT_ENTITY', 'ALIGN_WINDOWS',
            'REMOVE_NODE', 'REMOVE_FRAME', 'REMOVE_PORT', 'REMOVE_LINK',
            'MASS_UPDATE',
            // v14: узлы, дорожки, окна, рамки (используются системным промптом ассистента)
            'CREATE_NESTED_NODE', 'OPEN_LANE', 'CLOSE_LANE', 'CLOSE_WINDOW',
            'FRAME_ADD_MEMBERS', 'FRAME_REMOVE_MEMBERS', 'CLEAR_PROJECT'
        ]);

        // Экшены, у которых payload — просто строка-идентификатор
        const STRING_PAYLOAD_TYPES = new Set(['REMOVE_NODE', 'REMOVE_FRAME', 'REMOVE_PORT', 'REMOVE_LINK']);

        if (!action || typeof action !== 'object' || typeof action.type !== 'string') {
            return { valid: false, reason: 'Экшен должен быть объектом с типом string' };
        }
        if (!SUPPORTED_ACTION_TYPES.has(action.type)) {
            return { valid: false, reason: `Неподдерживаемый тип экшена: ${action.type}` };
        }

        const payload = action.payload;
        if (STRING_PAYLOAD_TYPES.has(action.type)) {
            // REMOVE_* принимают и строку-ID, и объект { id } (редьюсер ждёт строку —
            // объект нормализуем прямо здесь)
            if (typeof payload === 'string' && payload.trim() !== '') return { valid: true };
            if (payload && typeof payload === 'object' && typeof payload.id === 'string') {
                action.payload = payload.id;
                return { valid: true };
            }
            return { valid: false, reason: `${action.type}: payload должен быть строкой-ID` };
        }
        if (!payload || typeof payload !== 'object') {
            return { valid: false, reason: 'Payload должен быть объектом' };
        }

        if (payload.position) {
            if (typeof payload.position === 'object') {
                if (typeof payload.position.x !== 'number' || isNaN(payload.position.x) ||
                    typeof payload.position.y !== 'number' || isNaN(payload.position.y)) {
                    return { valid: false, reason: `Невалидные координаты position в экшене ${action.type}` };
                }
            } else if (typeof payload.position !== 'number' || isNaN(payload.position)) {
                return { valid: false, reason: `Невалидное смещение position в экшене ${action.type}` };
            }
        }
        if (payload.size) {
            if (typeof payload.size.w !== 'number' || isNaN(payload.size.w) ||
                typeof payload.size.h !== 'number' || isNaN(payload.size.h)) {
                return { valid: false, reason: `Невалидные размеры size в экшене ${action.type}` };
            }
        }

        // Проверка целостности связей и портов в батче
        if (action.type === 'ADD_PORT') {
            const nodeId = payload.nodeId;
            const nodeExists = (currentState.nodes && currentState.nodes[nodeId]) ||
                batchActions.some(a => a && a.type === 'ADD_NODE' && a.payload && a.payload.id === nodeId);
            if (!nodeExists) {
                return { valid: false, reason: `Узел ${nodeId} для порта ${payload.id} не существует` };
            }
        }

        if (action.type === 'ADD_LINK') {
            const sPortId = payload.sourcePortId;
            const tPortId = payload.targetPortId;
            const sPortExists = (currentState.ports && currentState.ports[sPortId]) ||
                batchActions.some(a => a && a.type === 'ADD_PORT' && a.payload && a.payload.id === sPortId);
            const tPortExists = (currentState.ports && currentState.ports[tPortId]) ||
                batchActions.some(a => a && a.type === 'ADD_PORT' && a.payload && a.payload.id === tPortId);

            if (!sPortExists || !tPortExists) {
                return { valid: false, reason: `Порты для связи ${payload.id} не найдены (source: ${sPortId}, target: ${tPortId})` };
            }
        }

        return { valid: true };
    };

    // Динамический запрос реального списка доступных моделей напрямую из API провайдера
    const fetchAvailableModels = async (quiet = false) => {
        const { apiKey, baseUrl } = aiAgentSettings;
        const provider = aiAgentSettings.provider || detectProviderByKey(apiKey) || 'openai';
        if (!apiKey || !apiKey.trim()) {
            if (!quiet) setFetchModelMsg('⚠️ Укажите API Ключ');
            return;
        }

        setIsFetchingModels(true);
        if (!quiet) setFetchModelMsg('Загрузка списка моделей...');
        try {
            let apiUrl = '';
            let headers = {};

            if (provider === 'google') {
                if (baseUrl && baseUrl.trim() !== '') {
                    apiUrl = baseUrl.replace(/\/+$/, '') + '/models';
                    headers = {
                        'Authorization': `Bearer ${apiKey.trim()}`,
                        'x-goog-api-key': apiKey.trim()
                    };
                } else {
                    apiUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`;
                    headers = {
                        'x-goog-api-key': apiKey.trim()
                    };
                }
            } else if (provider === 'anthropic') {
                apiUrl = (baseUrl ? baseUrl.replace(/\/+$/, '') : 'https://api.anthropic.com') + '/v1/models';
                headers = {
                    'x-api-key': apiKey.trim(),
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                };
            } else if (provider === 'grok') {
                apiUrl = (baseUrl ? baseUrl.replace(/\/+$/, '') : 'https://api.x.ai/v1') + '/models';
                headers = { 'Authorization': `Bearer ${apiKey.trim()}` };
            } else {
                apiUrl = (baseUrl ? baseUrl.replace(/\/+$/, '') : 'https://api.openai.com') + '/v1/models';
                headers = { 'Authorization': `Bearer ${apiKey.trim()}` };
            }

            const response = await fetch(apiUrl, { method: 'GET', headers });

            if (!response.ok) {
                const errText = await response.text();
                let parsedErr = errText;
                try {
                    const parsedObj = JSON.parse(errText);
                    parsedErr = parsedObj.error?.message || parsedObj.message || errText;
                } catch (e) {}
                throw new Error(`Статус ${response.status}: ${parsedErr.slice(0, 120)}`);
            }

            const data = await response.json();
            let rawList = [];
            if (Array.isArray(data.models)) {
                // Google Gemini format
                rawList = data.models
                    .filter(m => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
                    .map(m => m.name || m.id || m.displayName)
                    .filter(Boolean);
            } else if (Array.isArray(data.data)) {
                // OpenAI / Anthropic / Grok format
                rawList = data.data.map(m => m.id || m.name).filter(Boolean);
                if (provider === 'openai') {
                    rawList.sort((a, b) => {
                        const aPref = /^(gpt|o1|o3|chatgpt)/i.test(a);
                        const bPref = /^(gpt|o1|o3|chatgpt)/i.test(b);
                        if (aPref && !bPref) return -1;
                        if (!aPref && bPref) return 1;
                        return a.localeCompare(b);
                    });
                }
            }

            // Очищаем служебный префикс models/ если сервер его возвращает (например у Google)
            const cleanList = rawList.map(m => String(m).replace(/^models\//, '')).filter(Boolean);

            if (cleanList.length > 0) {
                setFetchedModels(cleanList);
                if (!quiet) setFetchModelMsg(`✅ Найдено ${cleanList.length} моделей`);
                // Если текущая модель не установлена или отсутствует в списке, подставляем первую из реального API
                if (!aiAgentSettings.model || !cleanList.includes(aiAgentSettings.model)) {
                    dispatch({ type: 'UPDATE_AI_SETTINGS', payload: { model: cleanList[0] } });
                }
            } else {
                if (!quiet) setFetchModelMsg('⚠️ Список моделей пуст');
            }
        } catch (e) {
            console.warn('Could not fetch models dynamically:', e);
            if (!quiet) setFetchModelMsg(`⚠️ Не удалось загрузить: ${e.message}`);
        } finally {
            setIsFetchingModels(false);
        }
    };

    const handleTestConnection = async () => {
        setTestStatus({ loading: true, message: 'Проверка соединения...' });
        try {
            const { apiKey, baseUrl, provider = 'openai', model } = aiAgentSettings;
            if (!apiKey || !apiKey.trim()) {
                throw new Error('Пожалуйста, укажите API Ключ в настройках.');
            }

            // Заодно подтягиваем актуальный список моделей с API
            fetchAvailableModels(true);

            let apiUrl = '';
            let headers = {};
            let body = {};

            const targetModel = model && model.trim() !== '' ? model.trim() :
                (provider === 'anthropic' ? 'claude-sonnet-4-5' :
                    provider === 'google' ? 'gemini-2.5-flash' :
                        provider === 'grok' ? 'grok-3-mini' : 'gpt-4o');

            if (provider === 'anthropic') {
                apiUrl = (baseUrl ? baseUrl.replace(/\/+$/, '') : 'https://api.anthropic.com') + '/v1/messages';
                headers = {
                    'x-api-key': apiKey.trim(),
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true',
                    'Content-Type': 'application/json'
                };
                body = {
                    model: targetModel,
                    max_tokens: 10,
                    messages: [{ role: 'user', content: 'Ping' }]
                };
            } else if (provider === 'google') {
                apiUrl = (baseUrl ? baseUrl.replace(/\/+$/, '') : 'https://generativelanguage.googleapis.com/v1beta/openai') + '/chat/completions';
                headers = {
                    'Authorization': `Bearer ${apiKey.trim()}`,
                    'Content-Type': 'application/json'
                };
                body = {
                    model: targetModel,
                    messages: [{ role: 'user', content: 'Ping' }],
                    max_tokens: 5
                };
            } else if (provider === 'grok') {
                apiUrl = (baseUrl ? baseUrl.replace(/\/+$/, '') : 'https://api.x.ai/v1') + '/chat/completions';
                headers = {
                    'Authorization': `Bearer ${apiKey.trim()}`,
                    'Content-Type': 'application/json'
                };
                body = {
                    model: targetModel,
                    messages: [{ role: 'user', content: 'Ping' }],
                    max_tokens: 5
                };
            } else {
                apiUrl = (baseUrl ? baseUrl.replace(/\/+$/, '') : 'https://api.openai.com') + '/v1/chat/completions';
                headers = {
                    'Authorization': `Bearer ${apiKey.trim()}`,
                    'Content-Type': 'application/json'
                };
                body = {
                    model: targetModel,
                    messages: [{ role: 'user', content: 'Ping' }],
                    max_tokens: 5
                };
            }

            const response = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(body) });

            if (!response.ok) {
                const errText = await response.text();
                let parsedErr = errText;
                try {
                    const parsedObj = JSON.parse(errText);
                    parsedErr = parsedObj.error?.message || parsedObj.message || errText;
                } catch (e) { }
                throw new Error(`Статус ${response.status}: ${parsedErr.slice(0, 150)}`);
            }

            setTestStatus({ success: true, message: `✅ Соединение с моделью "${targetModel}" успешно установлено!` });
        } catch (e) {
            console.error('Test connection error:', e);
            setTestStatus({ error: true, message: `❌ Ошибка: ${e.message || 'Сбой сети'}` });
        }
    };

    const handleSend = async () => {
        if (!input.trim() && !attachedMedia) return;

        const userMsg = { role: 'user', content: input, media: attachedMedia };
        dispatch({ type: 'ADD_AI_MESSAGE', payload: { nodeId, message: userMsg } });
        setInput('');
        setAttachedMedia(null);
        setIsLoading(true);

        try {
            const connectedNodes = new Set();
            const myPorts = Object.values(state.ports).filter(p => p.nodeId === nodeId).map(p => p.id);

            Object.values(state.links || {}).forEach(link => {
                let otherPortId = null;
                if (myPorts.includes(link.sourcePortId)) otherPortId = link.targetPortId;
                else if (myPorts.includes(link.targetPortId)) otherPortId = link.sourcePortId;

                if (otherPortId && state.ports[otherPortId]) {
                    const otherNodeId = state.ports[otherPortId].nodeId;
                    if (otherNodeId !== nodeId && state.nodes[otherNodeId]) {
                        connectedNodes.add(state.nodes[otherNodeId]);
                    }
                }
            });

            const currentContextMode = aiAgentSettings.contextMode || 'global';
            const isLocalMode = currentContextMode === 'local';

            if (isLocalMode) {
                const addNestedChildren = (parentId) => {
                    Object.values(state.nodes).forEach(n => {
                        // v14: единственная структура родства — parentId на узел.
                        if (n.parentId === parentId && !connectedNodes.has(n)) {
                            connectedNodes.add(n);
                            addNestedChildren(n.id);
                        }
                    });
                };
                const initialNodes = Array.from(connectedNodes);
                initialNodes.forEach(n => addNestedChildren(n.id));
            }

            // v14: агент получает состояние в НОТАЦИИ (§1 плана / §3
            // LANES_MODEL.md), а не сырым JSON — ДЕРЕВО/ОКНА/РАМКИ/СВЯЗИ.
            // В локальном режиме нотация строится из урезанного среза
            // {nodes, frames, ports, links, windows}, содержащего только
            // подключённые узлы (и их предков по parentId, иначе ДЕРЕВО
            // потеряло бы промежуточные звенья пути).
            const H = window.HierarchyUtils;
            const notationState = (() => {
                if (!isLocalMode) return state;
                const scopedNodes = {};
                connectedNodes.forEach(n => { scopedNodes[n.id] = n; });
                // Достраиваем цепочку предков, иначе HierarchyUtils.getPath
                // оборвётся на первом отсутствующем звене.
                Object.values(state.nodes).forEach(n => {
                    if (scopedNodes[n.id]) {
                        let cur = n;
                        while (cur && cur.parentId && cur.parentId !== 'root' && state.nodes[cur.parentId] && !scopedNodes[cur.parentId]) {
                            scopedNodes[cur.parentId] = state.nodes[cur.parentId];
                            cur = state.nodes[cur.parentId];
                        }
                    }
                });
                return { nodes: scopedNodes, frames: state.frames, ports: state.ports, links: state.links, windows: state.windows };
            })();
            const notation = (H && H.dumpNotation) ? H.dumpNotation(notationState) : '(нотация недоступна)';

            const connectedNodesArray = Array.from(connectedNodes).slice(0, 15);
            let contextStr = '';
            const myNodeName = state.nodes[nodeId]?.name || 'AI Assistant';
            const selectedNode = state.selectedIds && state.selectedIds.length > 0 ? state.nodes[state.selectedIds[0]] : null;
            const selectedEntityStr = selectedNode ? `Выделен узел: ID=${selectedNode.id}, Имя=${selectedNode.name}` : 'Ничего не выделено';

            if (connectedNodesArray.length > 0) {
                const nodesInfo = connectedNodesArray.map(n => `Узел "${n.name}" (ID: ${n.id}):\nТекст: ${n.content || 'пусто'}`).join('\n\n');
                contextStr = `Вы находитесь в узле "${myNodeName}" (ID: ${nodeId}). ${isLocalMode ? 'Вы работаете в ЛОКАЛЬНОМ режиме. Вот узлы в вашей сети (подключенные и их вложенные элементы):' : 'К вам подключены узлы:'}\n${nodesInfo}`;
            } else {
                contextStr = `Вы находитесь в узле "${myNodeName}" (ID: ${nodeId}). Подключенных узлов нет.\nТекущий фокус: ${selectedEntityStr}.`;
            }

            let aiResponse = '';

            let systemPrompt = `Вы — ИИ-ассистент (Copilot) для визуального редактора иерархических графов Architector (модель данных v14: Дорожки/Окна/Рамки, единственная структура родства — parentId узла).

УСТРОЙСТВО ИЕРАРХИИ (важно для понимания проекта):
- Дорожка (lane) — внутренность одного узла (или корня проекта): вертикальная колонка с его прямыми детьми. Не хранится как сущность — производная от parentId.
- Окно (window) — набор дорожек, положенных рядом на холсте; чисто обзорное состояние, узел без открытой дорожки родителя просто не показан.
- Рамка (frame) — множество узлов из любых дорожек (замена прежних «слоёв»), не влияет на родство.
- Родство — ЕДИНСТВЕННОЕ поле parentId: "root" (прямой потомок корня) либо id узла-родителя. Глубина узла = длина цепочки parentId до "root" (прямые дети корня — глубина 1).
- Ниже — состояние проекта в НОТАЦИИ (не JSON): секции ДЕРЕВО (путь каждого узла по parentId), ОКНА (какие дорожки сейчас открыты и где), РАМКИ (членство), СВЯЗИ (порт -> порт).

Текущее состояние холста:
${contextStr}

Состояние проекта (нотация):
${notation}

`;

            if (aiAgentSettings.mode === 'agent') {
                systemPrompt += `ВЫ РАБОТАЕТЕ В РЕЖИМЕ АГЕНТА И МОЖЕТЕ НАПРЯМУЮ РЕДАКТИРОВАТЬ И СТРОИТЬ ХОЛСТ!

ПОЛНАЯ ИНСТРУКЦИЯ И ПОДДЕРЖИВАЕМЫЕ JSON-ЭКШЕНЫ:
Если пользователь просит СОЗДАТЬ, ИЗМЕНИТЬ, УДАЛИТЬ или ПОГРУЗИТЬСЯ в структуры (узлы, порты, связи, рамки), вы ОБЯЗАНЫ приложить в самом конце своего ответа один блок кода в формате JSON с массивом экшенов:

\`\`\`json
[
  { "type": "ADD_NODE", "payload": { "id": "node-1", "name": "Canvas Viewport", "content": "Интерактивный холст", "color": "#0f172a", "position": {"x": 90, "y": 160}, "size": {"w": 250, "h": 120}, "parentId": "root", "shape": "rectangle" } },
  { "type": "ADD_NODE", "payload": { "id": "node-2", "name": "Store Provider", "content": "Хранилище состояния", "color": "#0f172a", "position": {"x": 370, "y": 160}, "size": {"w": 250, "h": 120}, "parentId": "root", "shape": "rectangle" } },
  { "type": "CREATE_NESTED_NODE", "payload": { "parentId": "node-1", "id": "node-sub-1", "name": "Sub-Component" } },
  { "type": "ADD_PORT", "payload": { "id": "port-1-out", "nodeId": "node-1", "type": "output", "edge": "right", "position": 0.5, "name": "Events Out", "color": "#38bdf8" } },
  { "type": "ADD_PORT", "payload": { "id": "port-2-in", "nodeId": "node-2", "type": "input", "edge": "left", "position": 0.5, "name": "Actions In", "color": "#0284c7" } },
  { "type": "ADD_LINK", "payload": { "id": "link-1-to-2", "sourcePortId": "port-1-out", "targetPortId": "port-2-in", "name": "Redux Dispatch", "linkStyle": "orthogonal", "color": "#38bdf8" } },
  { "type": "ADD_FRAME", "payload": { "members": ["node-1", "node-2"], "name": "UI Layer", "color": "#0284c7" } },
  { "type": "UPDATE_NODE", "payload": { "id": "node-1", "updates": { "color": "#HEX", "name": "Новое имя" } } },
  { "type": "REMOVE_NODE", "payload": "node-2" }
]
\`\`\`

СТРОГИЕ ПРАВИЛА И ИНВАРИАНТЫ (модель v14):
1. ФОРМА УЗЛОВ (shape): все узлы СТРОГО прямоугольные (shape: "rectangle").
2. ИЕРАРХИЯ РОДСТВА — через parentId, ЕДИНСТВЕННОЕ поле родства, значение — "root" ИЛИ id узла-родителя (id рамки/окна как parentId НЕДОПУСТИМ):
   - Корневой узел: parentId = "root".
   - Ребёнок узла X: ЛУЧШИЙ способ — { "type": "CREATE_NESTED_NODE", "payload": { "parentId": "X", "id": "...", "name": "..." } } — узел сам попадёт в дорожку X с автоматическим размещением, дорожка X откроется в окне при необходимости.
   - Альтернатива (когда нужна точная позиция): ADD_NODE с "parentId": "X" — но дорожка X должна быть уже открыта, иначе результат не будет виден на холсте (используйте CREATE_NESTED_NODE, если не уверены).
3. ПОЗИЦИИ: локальны ДОРОЖКЕ РОДИТЕЛЯ (не мировому холсту). Узлы одного родителя (братья) лежат в одной дорожке рядом друг с другом, разносите сеткой с шагом ~280 по x.
4. ОБЯЗАТЕЛЬНОЕ СОЗДАНИЕ ПОРТОВ (ADD_PORT): для каждого узла создавайте порты на его гранях. Порт можно поставить и на РАМКУ — тем же ADD_PORT, где nodeId = id рамки (поле называется nodeId по историческим причинам, принимает id узла ИЛИ рамки); такой порт физически рисуется на первом «куске» рамки.
5. СВЯЗИ СОЕДИНЯЮТ ТОЛЬКО ПОРТЫ (ADD_LINK): sourcePortId/targetPortId — строго id портов. Связи между узлами разных дорожек/окон допустимы.
6. УДАЛЕНИЕ И ОЧИСТКА: REMOVE_NODE каскадно удаляет узел со всеми его потомками (вся ветка по parentId); REMOVE_FRAME { "id": "..." } удаляет только рамку — узлы остаются нетронутыми; CLEAR_PROJECT {} — полная очистка ВСЕХ узлов/рамок/связей проекта; REMOVE_PROJECT { "id": "..." } — удалить проект целиком.
7. ДОРОЖКИ И ОКНА: OPEN_LANE { "ownerId": "X" } — открыть дорожку узла X (или "root") в новом окне, если она нигде не открыта; CLOSE_LANE { "windowId": "...", "ownerId": "X" } — закрыть дорожку X в конкретном окне (данные не удаляются); CLOSE_WINDOW { "windowId": "..." } — закрыть окно целиком (обзор, не данные).
8. РАМКИ: ADD_FRAME { "members": [...] } — создать рамку сразу с этими узлами (пустой массив — заготовка без членов); FRAME_ADD_MEMBERS / FRAME_REMOVE_MEMBERS { "frameId": "...", "ids": [...] } — изменить членство.
9. ПЕРЕНОС МЕЖДУ ДОРОЖКАМИ: REPARENT_ENTITY { "id": "n1", "targetParentId": "X" } (или "ids": [...] для нескольких) — перенести узел(ы) в дорожку узла X или "root" (targetParentId — ТОЛЬКО id узла или "root", id рамки/окна недопустим). По умолчанию переносится вся ветка потомков вместе с узлом (mode не указывайте — используется "deep").
10. ЛИМИТ ПАКЕТА: не более ${MAX_AI_BATCH_SIZE} команд в одном ответе — всё сверх этого числа отбрасывается. Если задача крупнее, выполните её частями: выдайте первую порцию и предложите продолжить следующим сообщением. Весь пакет применяется одним шагом истории и отменяется одним Ctrl+Z.
11. ПОДТВЕРЖДЕНИЕ: по умолчанию пользователь видит список ваших команд и подтверждает их вручную. Формулируйте пояснение так, чтобы по нему было понятно, что именно изменится на холсте, — особенно для удаляющих команд.
12. Выдайте короткий вежливый пояснительный текстовый ответ, а в самом конце — ТОЛЬКО один блок \`\`\`json ... \`\`\`.`;
            } else {
                systemPrompt += `ВЫ РАБОТАЕТЕ В РЕЖИМЕ CHAT-ONLY (Только чтение).
Вы просто умный ИИ-помощник. Отвечайте на вопросы пользователя, анализируя предоставленный контекст холста.
ВАМ СТРОГО ЗАПРЕЩЕНО генерировать JSON-команды для изменения графа. Только консультации, советы и ответы на вопросы.`;
            }

            if (aiAgentSettings.apiKey && aiAgentSettings.apiKey.trim() !== '') {
                const provider = aiAgentSettings.provider || 'openai';
                const baseUrl = aiAgentSettings.baseUrl || '';

                const model = (aiAgentSettings.model && aiAgentSettings.model.trim() !== '') ? aiAgentSettings.model.trim() :
                    (provider === 'anthropic' ? 'claude-sonnet-4-5' :
                        provider === 'google' ? 'gemini-2.5-flash' :
                            provider === 'grok' ? 'grok-3-mini' : 'gpt-4o');

                let apiUrl = '';
                let fetchHeaders = {};
                let fetchBody = {};

                // Формируем историю предыдущих реплик (последние 20 сообщений) для сохранения памяти диалога
                const historyMessages = (chatHistory || [])
                    .slice(-20)
                    .map(m => ({
                        role: m.role === 'ai' ? 'assistant' : 'user',
                        content: m.content || ''
                    }))
                    .filter(m => m.content && m.content.trim() !== '');

                if (provider === 'anthropic') {
                    apiUrl = (baseUrl ? baseUrl.replace(/\/+$/, '') : 'https://api.anthropic.com') + '/v1/messages';
                    fetchHeaders = {
                        'x-api-key': aiAgentSettings.apiKey.trim(),
                        'anthropic-version': '2023-06-01',
                        'anthropic-dangerous-direct-browser-access': 'true',
                        'Content-Type': 'application/json'
                    };
                    fetchBody = {
                        model: model,
                        max_tokens: 4096,
                        system: systemPrompt,
                        messages: [
                            ...historyMessages,
                            { role: 'user', content: input }
                        ]
                    };
                } else if (provider === 'google') {
                    apiUrl = (baseUrl ? baseUrl.replace(/\/+$/, '') : 'https://generativelanguage.googleapis.com/v1beta/openai') + '/chat/completions';
                    fetchHeaders = {
                        'Authorization': `Bearer ${aiAgentSettings.apiKey.trim()}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    };
                    fetchBody = {
                        model: model,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            ...historyMessages,
                            { role: 'user', content: input }
                        ]
                    };
                } else if (provider === 'grok') {
                    apiUrl = (baseUrl ? baseUrl.replace(/\/+$/, '') : 'https://api.x.ai/v1') + '/chat/completions';
                    fetchHeaders = {
                        'Authorization': `Bearer ${aiAgentSettings.apiKey.trim()}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    };
                    fetchBody = {
                        model: model,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            ...historyMessages,
                            { role: 'user', content: input }
                        ]
                    };
                } else {
                    apiUrl = (baseUrl ? baseUrl.replace(/\/+$/, '') : 'https://api.openai.com') + '/v1/chat/completions';
                    fetchHeaders = {
                        'Authorization': `Bearer ${aiAgentSettings.apiKey.trim()}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    };
                    fetchBody = {
                        model: model,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            ...historyMessages,
                            { role: 'user', content: input }
                        ]
                    };
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 45000);

                const fetchOptions = {
                    method: 'POST',
                    headers: fetchHeaders,
                    body: JSON.stringify(fetchBody),
                    signal: controller.signal
                };

                let response;
                try {
                    response = await fetch(apiUrl, fetchOptions);
                } finally {
                    clearTimeout(timeoutId);
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    let parsedErr = errorText;
                    try {
                        const parsedObj = JSON.parse(errorText);
                        parsedErr = parsedObj.error?.message || parsedObj.message || errorText;
                    } catch (e) { }
                    throw new Error(`API Error ${response.status}: ${parsedErr}`);
                }

                const data = await response.json();
                if (provider === 'anthropic') {
                    if (data.content && data.content[0] && data.content[0].text) {
                        aiResponse = data.content[0].text;
                    } else {
                        throw new Error('Некорректный формат ответа от Anthropic API');
                    }
                } else {
                    if (data.choices && data.choices[0] && data.choices[0].message) {
                        aiResponse = data.choices[0].message.content;
                    } else {
                        throw new Error('Некорректный формат ответа от API');
                    }
                }
            } else if (typeof invokeAIAgent === 'function') {
                aiResponse = await invokeAIAgent(systemPrompt, input);
            } else {
                await new Promise(r => setTimeout(r, 1200));
                aiResponse = `(Демо-режим) API-ключ не настроен. Перейдите во вкладку "Настройки", чтобы указать ключ OpenAI, Anthropic, Google Gemini или Grok.`;
            }

            aiResponse = aiResponse || '';
            const jsonMatch = aiResponse.match(/```json\n?([\s\S]*?)\n?```/);
            if (jsonMatch && (!aiAgentSettings.mode || aiAgentSettings.mode === 'agent')) {
                try {
                    const rawActions = JSON.parse(jsonMatch[1]);
                    if (Array.isArray(rawActions)) {
                        // Лимит — страховка от runaway-ответа, а не рабочее ограничение:
                        // типовой запрос «схема из 15 узлов» — это уже ~65 команд
                        // (узлы + порты + связи). Прежние 50 молча резали такой ответ
                        // пополам. Реальная защита — подтверждение и откат одним Ctrl+Z.
                        const actions = rawActions.slice(0, MAX_AI_BATCH_SIZE);
                        const truncatedBy = rawActions.length - actions.length;
                        let cleanAiText = aiResponse.replace(jsonMatch[0], '').trim();
                        if (truncatedBy > 0) {
                            // Обрезка не должна быть молчаливой: пользователь обязан
                            // знать, что схема пришла неполной
                            cleanAiText += `\n\n⚠️ *Ответ содержал ${rawActions.length} команд — применены первые ${MAX_AI_BATCH_SIZE}, остальные ${truncatedBy} отброшены. Попросите ассистента продолжить.*`;
                        }
                        const isAuto = aiAgentSettings.confirmMode === 'auto';

                        if (isAuto) {
                            applyActionBatch(actions, cleanAiText);
                            return;
                        } else {
                            const DESTRUCTIVE_TYPES = new Set(['CLEAR_PROJECT', 'REMOVE_FRAME', 'REMOVE_NODE']);
                            setPendingBatch({
                                actions,
                                cleanAiText,
                                totalCount: actions.length,
                                hasDestructive: actions.some(a => a && DESTRUCTIVE_TYPES.has(a.type))
                            });
                            dispatch({ type: 'ADD_AI_MESSAGE', payload: { nodeId, message: { role: 'ai', content: cleanAiText } } });
                            return;
                        }
                    }
                } catch (e) {
                    console.error('AI JSON parse error', e);
                    aiResponse += '\n\n❌ *Ассистент вернул неверный формат действий.*';
                }
            }

            dispatch({ type: 'ADD_AI_MESSAGE', payload: { nodeId, message: { role: 'ai', content: aiResponse } } });
        } catch (e) {
            console.error('Ошибка ИИ:', e);
            let errorMessage = e.message || 'Сбой сети';
            if (e.name === 'AbortError') {
                errorMessage = 'Превышено время ожидания ответа (45 секунд).';
            } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
                errorMessage = 'Сетевая ошибка (CORS или нет интернета). Проверьте Base URL, API-ключ, или укажите адрес локального прокси.';
            }
            dispatch({ type: 'ADD_AI_MESSAGE', payload: { nodeId, message: { role: 'ai', content: `⚠️ Ошибка: ${errorMessage}` } } });
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileAttach = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setAttachedMedia(event.target.result);
            };
            reader.readAsDataURL(file);
        }
        e.target.value = '';
    };

    const currentProvider = aiAgentSettings.provider || detectProviderByKey(aiAgentSettings.apiKey) || 'openai';

    // Запасные статические пресеты, если список моделей еще не загружен с API
    const providerPresets = {
        openai: ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4-turbo'],
        anthropic: ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-sonnet-4-5'],
        google: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
        grok: ['grok-3', 'grok-3-mini', 'grok-2-1212']
    };

    // Если удалось динамически сгрузить реальные модели с API — показываем их, иначе используем статический фоллбек
    const displayModels = fetchedModels.length > 0 ? fetchedModels : (providerPresets[currentProvider] || providerPresets.openai);

    return (
        <div
            className="flex-1 flex flex-col h-full overflow-hidden bg-black/20 rounded-b-lg"
            onMouseDown={e => e.stopPropagation()}
            data-file="components/AIAgentNodeContent.js"
        >
            <div className="px-3 py-2 border-b border-[var(--line)] flex items-center justify-between bg-black/40 text-xs shrink-0">
                <div className="flex gap-4 items-center">
                    <button
                        className={`font-semibold transition-colors pb-1 border-b-2 ${tab === 'chat' ? 'text-purple-400 border-purple-400' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                        onClick={() => setTab('chat')}
                    >
                        Диалог
                    </button>
                    <button
                        className={`font-semibold transition-colors pb-1 border-b-2 flex items-center gap-1 ${tab === 'logs' ? 'text-purple-400 border-purple-400' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                        onClick={() => setTab('logs')}
                    >
                        <span>Логи</span>
                        {actionLogs.length > 0 && (
                            <span className="bg-purple-900/60 text-purple-300 text-[9px] px-1 rounded-full border border-purple-500/30 font-mono">
                                {actionLogs.length}
                            </span>
                        )}
                    </button>
                    <button
                        className={`font-semibold transition-colors pb-1 border-b-2 ${tab === 'settings' ? 'text-purple-400 border-purple-400' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                        onClick={() => setTab('settings')}
                    >
                        Настройки
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    {tab === 'chat' && (
                        <div className="flex items-center gap-1.5">
                            {/* Выпадающий список сохраненных диалогов узла */}
                            {currentSessions && currentSessions.length > 1 && (
                                <select
                                    className="bg-black/60 border border-[var(--line)] text-purple-300 text-[10px] rounded px-1 py-0.5 max-w-[110px] truncate cursor-pointer font-medium"
                                    value={activeSessionId}
                                    onChange={(e) => dispatch({ type: 'SWITCH_AI_SESSION', payload: { nodeId, sessionId: e.target.value } })}
                                    title="Переключить сохраненный диалог"
                                >
                                    {currentSessions.map(s => (
                                        <option key={s.id} value={s.id}>
                                            {s.title} ({s.messages?.length || 0})
                                        </option>
                                    ))}
                                </select>
                            )}

                            {/* Кнопка + Новый чат (Создает новую сессию без удаления старой) */}
                            <button
                                type="button"
                                className="text-purple-200 hover:text-white bg-purple-600/40 hover:bg-purple-600/70 px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 text-[10px] font-semibold border border-purple-500/50"
                                onClick={() => dispatch({ type: 'CREATE_AI_SESSION', payload: { nodeId } })}
                                title="Создать новый чистый диалог (Сохранить текущий)"
                            >
                                <div className="icon-plus text-[10px]"></div>
                                <span>Новый чат</span>
                            </button>

                            {/* Кнопка удаляет только текущую активную сессию */}
                            {chatHistory && chatHistory.length > 0 && (
                                <button
                                    type="button"
                                    className="text-gray-500 hover:text-red-400 p-0.5 rounded transition-colors"
                                    onClick={() => dispatch({ type: 'DELETE_AI_SESSION', payload: { nodeId, sessionId: activeSessionId } })}
                                    title="Удалить этот диалог"
                                >
                                    <div className="icon-trash text-xs"></div>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {tab === 'settings' ? (
                <div className="flex-1 p-3 flex flex-col gap-3.5 overflow-y-auto no-scrollbar rounded-b-lg">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Провайдер ИИ</label>
                        <select
                            className="input-field focus:border-purple-500 cursor-pointer bg-black/50 text-xs"
                            value={currentProvider}
                            onChange={(e) => {
                                const newProv = e.target.value;
                                setFetchedModels([]); // Сбрасываем старый динамический список
                                setFetchModelMsg('');
                                dispatch({
                                    type: 'UPDATE_AI_SETTINGS',
                                    payload: {
                                        provider: newProv
                                    }
                                });
                            }}
                        >
                            <option value="openai">OpenAI (или локальный Ollama/vLLM/DeepSeek)</option>
                            <option value="anthropic">Anthropic Claude</option>
                            <option value="google">Google Gemini (AI Studio)</option>
                            <option value="grok">xAI Grok</option>
                        </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Base URL (Опционально)</label>
                        <input
                            type="text"
                            className="input-field focus:border-purple-500 text-xs"
                            placeholder={currentProvider === 'grok' ? 'https://api.x.ai/v1' : currentProvider === 'google' ? 'https://generativelanguage.googleapis.com/v1beta/openai' : currentProvider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com'}
                            value={aiAgentSettings.baseUrl || ''}
                            onChange={(e) => dispatch({ type: 'UPDATE_AI_SETTINGS', payload: { baseUrl: e.target.value } })}
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">API Ключ</label>
                                <button
                                    type="button"
                                    className="text-purple-400 hover:text-purple-300 transition-colors p-0.5 rounded hover:bg-purple-500/20"
                                    onClick={() => setShowKeyManager(true)}
                                    title="Менеджер сохранённых ключей"
                                >
                                    <div className="icon-key text-[11px]"></div>
                                </button>
                            </div>
                            <button
                                type="button"
                                className="text-[10px] text-purple-400 hover:text-purple-300 underline font-semibold flex items-center gap-1"
                                onClick={() => fetchAvailableModels(false)}
                                disabled={isFetchingModels}
                            >
                                <div className="icon-refresh-cw text-[9px]"></div>
                                {isFetchingModels ? 'Загрузка...' : 'Загрузить список моделей'}
                            </button>
                        </div>
                        <input
                            type="password"
                            className="input-field focus:border-purple-500 text-xs"
                            placeholder={currentProvider === 'grok' ? 'xai-...' : currentProvider === 'google' ? 'AIzaSy...' : 'sk-...'}
                            value={aiAgentSettings.apiKey || ''}
                            onChange={(e) => {
                                const val = e.target.value;
                                _setActiveApiKey(val);
                                const detected = detectProviderByKey(val);
                                const updates = { apiKey: val };
                                if (detected && detected !== currentProvider) {
                                    updates.provider = detected;
                                    setFetchedModels([]);
                                    setFetchModelMsg('');
                                }
                                dispatch({ type: 'UPDATE_AI_SETTINGS', payload: updates });
                            }}
                        />
                        <div className="text-[9px] text-amber-500/60 flex items-center gap-1">
                            <span>⚠️</span>
                            <span>Ключ хранится локально в браузере. Не используйте на общих компьютерах.</span>
                        </div>
                        {fetchModelMsg && (
                            <div className="text-[10px] text-gray-300 mt-0.5 font-medium">{fetchModelMsg}</div>
                        )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                                {fetchedModels.length > 0 ? `Доступные модели с API (${fetchedModels.length})` : 'Модель ИИ (Выбор или ввод)'}
                            </label>
                        </div>

                        {/* Выпадающий список действительно доступных моделей на этом ключе */}
                        <select
                            className="input-field focus:border-purple-500 cursor-pointer bg-black/50 text-xs"
                            value={aiAgentSettings.model || ''}
                            onChange={(e) => dispatch({ type: 'UPDATE_AI_SETTINGS', payload: { model: e.target.value } })}
                        >
                            {displayModels.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>

                        {/* Текстовое поле прямого ввода на случай кастомных имен */}
                        <input
                            type="text"
                            className="input-field focus:border-purple-500 text-xs font-mono mt-1"
                            placeholder="Или введите имя модели вручную..."
                            value={aiAgentSettings.model || ''}
                            onChange={(e) => dispatch({ type: 'UPDATE_AI_SETTINGS', payload: { model: e.target.value } })}
                        />
                    </div>

                    <div className="pt-1 flex flex-col gap-2">
                        <button
                            className="btn bg-purple-600/30 hover:bg-purple-600/50 border-purple-500/50 text-purple-200 text-xs py-1.5 rounded transition-colors flex items-center justify-center gap-1.5"
                            onClick={handleTestConnection}
                            disabled={testStatus && testStatus.loading}
                        >
                            <div className="icon-refresh-cw text-xs"></div>
                            {testStatus && testStatus.loading ? 'Проверка...' : 'Тест соединения'}
                        </button>
                        {testStatus && testStatus.message && (
                            <div className={`text-[11px] p-2 rounded border whitespace-pre-wrap ${testStatus.success ? 'bg-green-950/40 border-green-500/50 text-green-300' : testStatus.error ? 'bg-red-950/40 border-red-500/50 text-red-300' : 'bg-gray-800 text-gray-300'}`}>
                                {testStatus.message}
                            </div>
                        )}
                    </div>
                </div>
            ) : tab === 'logs' ? (
                <div className="flex-1 p-3 flex flex-col overflow-hidden bg-slate-950/90 font-mono text-[11px] rounded-b-lg">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-800 shrink-0">
                        <span className="text-gray-400 font-semibold uppercase text-[10px] tracking-wider">
                            Лог выполнения ИИ-команд ({actionLogs.length})
                        </span>
                        {actionLogs.length > 0 && (
                            <button
                                type="button"
                                className="text-gray-500 hover:text-red-400 text-[10px] transition-colors"
                                onClick={() => setActionLogs([])}
                            >
                                Очистить логи
                            </button>
                        )}
                    </div>
                    {actionLogs.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-gray-600 text-center p-4">
                            История выполнения экшенов пуста.<br />Отправьте запрос в режиме Agent для просмотра подробного лога.
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
                            {actionLogs.map(log => (
                                <div key={log.id} className="flex items-start gap-2 p-1.5 rounded bg-slate-900/80 border border-slate-800 text-xs">
                                    <span className="text-gray-500 text-[10px] shrink-0 font-mono mt-0.5">{log.time}</span>
                                    {log.type === 'success' && <span className="text-green-400 shrink-0 font-bold">✓</span>}
                                    {log.type === 'warn' && <span className="text-yellow-400 shrink-0 font-bold">⚠️</span>}
                                    {log.type === 'error' && <span className="text-red-400 shrink-0 font-bold">✗</span>}
                                    <span className={`break-all ${log.type === 'success' ? 'text-gray-300' :
                                            log.type === 'warn' ? 'text-yellow-300' : 'text-red-300'
                                        }`}>
                                        {log.msg}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                    <div className="flex-1 p-3 overflow-y-auto no-scrollbar flex flex-col gap-3">
                        {chatHistory.map((msg, i) => (
                            <div key={i} className={`group flex flex-col max-w-[95%] ${msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
                                <div className={`flex items-start gap-1.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                    <div className={`px-2.5 py-1.5 rounded-lg text-xs whitespace-pre-wrap break-words select-text cursor-text ${msg.role === 'user' ? 'bg-purple-600 text-white' : 'bg-[var(--panel-2)] border border-[var(--line)] text-gray-200'}`}>
                                        {typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}
                                    </div>
                                    <button
                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-500 hover:text-purple-400 shrink-0 mt-0.5"
                                        title="Комментировать / Цитировать"
                                        onClick={() => {
                                            const sel = window.getSelection().toString();
                                            const textToQuote = sel ? sel : msg.content;
                                            setInput(prev => (prev ? prev + '\n\n' : '') + `> ${textToQuote}\n\n`);
                                        }}
                                    >
                                        <div className="icon-message-square text-xs"></div>
                                    </button>
                                </div>
                                {msg.media && (
                                    <img src={msg.media} alt="Attached" className="mt-1 max-w-full h-auto rounded border border-[var(--line)] max-h-[100px] object-contain" />
                                )}
                            </div>
                        ))}
                        {isLoading && (
                            <div className="self-start px-2 py-1.5 rounded-lg bg-[var(--panel-2)] border border-[var(--line)] flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></div>
                                <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse delay-75"></div>
                                <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse delay-150"></div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    <div className="p-2 pb-2.5 border-t border-[var(--line)] bg-black/40 flex flex-col gap-1.5 shrink-0 rounded-b-lg">
                        {/* Интерактивная карточка запроса на подтверждение экшенов */}
                        {pendingBatch && (
                            <div className="p-2 rounded bg-purple-950/90 border border-purple-500/70 flex flex-col gap-1.5 shadow-lg">
                                <div className="flex items-center justify-between text-[11px] font-semibold text-purple-200">
                                    <span className="flex items-center gap-1.5">
                                        <div className="icon-shield text-purple-400 text-xs"></div>
                                        Запрос на изменение холста ({pendingBatch.totalCount} действий)
                                    </span>
                                    {pendingBatch.hasDestructive && (
                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-900/80 text-red-200 border border-red-500/60">
                                            Удаление
                                        </span>
                                    )}
                                </div>
                                <div className="max-h-20 overflow-y-auto text-[10px] font-mono text-gray-300 space-y-0.5 no-scrollbar bg-black/50 p-1.5 rounded border border-purple-500/30">
                                    {pendingBatch.actions.map((a, idx) => (
                                        <div key={idx} className="truncate">
                                            • <span className="text-purple-300 font-bold">{a.type}</span>: {a.payload?.name || a.payload?.id || JSON.stringify(a.payload || {})}
                                        </div>
                                    ))}
                                </div>
                                <div className="flex items-center justify-end gap-2 pt-0.5">
                                    <button
                                        type="button"
                                        className="px-2 py-1 rounded text-[10px] bg-red-900/40 hover:bg-red-800/60 text-red-200 border border-red-700/50 transition-colors"
                                        onClick={() => {
                                            dispatch({ type: 'ADD_AI_MESSAGE', payload: { nodeId, message: { role: 'ai', content: '🚫 *Команды отклонены пользователем.*' } } });
                                            setPendingBatch(null);
                                        }}
                                    >
                                        Отклонить
                                    </button>
                                    <button
                                        type="button"
                                        className="px-2.5 py-1 rounded text-[10px] font-semibold bg-green-600 hover:bg-green-500 text-white transition-colors flex items-center gap-1 shadow-md shadow-green-900/30"
                                        onClick={() => applyActionBatch(pendingBatch.actions, '')}
                                    >
                                        <div className="icon-check text-[10px]"></div>
                                        Применить ({pendingBatch.totalCount})
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Панель оперативного переключения Режима, Подтверждения и Контекста */}
                        <div className="flex items-center justify-between pb-1 border-b border-[var(--line)]/60 text-[10px] gap-1 flex-wrap">
                            {/* 1. Режим: Agent / Chat */}
                            <div className="flex items-center gap-1">
                                <span className="text-gray-400 font-semibold uppercase text-[9px]">Режим:</span>
                                <div className="flex bg-black/60 p-0.5 rounded border border-[var(--line)]">
                                    <button
                                        type="button"
                                        className={`px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 ${(!aiAgentSettings.mode || aiAgentSettings.mode === 'agent') ? 'bg-purple-600 text-white font-medium' : 'text-gray-400 hover:text-gray-200'}`}
                                        onClick={() => dispatch({ type: 'UPDATE_AI_SETTINGS', payload: { mode: 'agent' } })}
                                        title="ИИ может изменять граф (Agent)"
                                    >
                                        <div className="icon-bot text-[10px]"></div> Agent
                                    </button>
                                    <button
                                        type="button"
                                        className={`px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 ${aiAgentSettings.mode === 'chat' ? 'bg-purple-600 text-white font-medium' : 'text-gray-400 hover:text-gray-200'}`}
                                        onClick={() => dispatch({ type: 'UPDATE_AI_SETTINGS', payload: { mode: 'chat' } })}
                                        title="ИИ только отвечает на вопросы (Chat)"
                                    >
                                        <div className="icon-message-square text-[10px]"></div> Chat
                                    </button>
                                </div>
                            </div>

                            {/* 2. Подтверждение: Спрашивать / Без подтверждения (Авто) */}
                            <div className="flex items-center gap-1">
                                <span className="text-gray-400 font-semibold uppercase text-[9px]">Правки:</span>
                                <div className="flex bg-black/60 p-0.5 rounded border border-[var(--line)]">
                                    <button
                                        type="button"
                                        className={`px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 ${(!aiAgentSettings.confirmMode || aiAgentSettings.confirmMode === 'ask') ? 'bg-purple-600 text-white font-medium' : 'text-gray-400 hover:text-gray-200'}`}
                                        onClick={() => dispatch({ type: 'UPDATE_AI_SETTINGS', payload: { confirmMode: 'ask' } })}
                                        title="Спрашивать подтверждение перед применением экшенов"
                                    >
                                        <div className="icon-shield text-[10px]"></div> Спрашивать
                                    </button>
                                    <button
                                        type="button"
                                        className={`px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 ${aiAgentSettings.confirmMode === 'auto' ? 'bg-purple-600 text-white font-medium' : 'text-gray-400 hover:text-gray-200'}`}
                                        onClick={() => dispatch({ type: 'UPDATE_AI_SETTINGS', payload: { confirmMode: 'auto' } })}
                                        title="Применять экшены автоматически без подтверждения"
                                    >
                                        <div className="icon-zap text-[10px]"></div> Авто
                                    </button>
                                </div>
                            </div>

                            {/* 3. Контекст: Глобально / Локально */}
                            <div className="flex items-center gap-1">
                                <span className="text-gray-400 font-semibold uppercase text-[9px]">Контекст:</span>
                                <div className="flex bg-black/60 p-0.5 rounded border border-[var(--line)]">
                                    <button
                                        type="button"
                                        className={`px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 ${(!aiAgentSettings.contextMode || aiAgentSettings.contextMode === 'global') ? 'bg-purple-600 text-white font-medium' : 'text-gray-400 hover:text-gray-200'}`}
                                        onClick={() => dispatch({ type: 'UPDATE_AI_SETTINGS', payload: { contextMode: 'global' } })}
                                        title="Видеть все узлы проекта (Глобально)"
                                    >
                                        <div className="icon-globe text-[10px]"></div> Глобально
                                    </button>
                                    <button
                                        type="button"
                                        className={`px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 ${aiAgentSettings.contextMode === 'local' ? 'bg-purple-600 text-white font-medium' : 'text-gray-400 hover:text-gray-200'}`}
                                        onClick={() => dispatch({ type: 'UPDATE_AI_SETTINGS', payload: { contextMode: 'local' } })}
                                        title="Видеть только подключенные узлы (Локально)"
                                    >
                                        <div className="icon-network text-[10px]"></div> Локально
                                    </button>
                                </div>
                            </div>
                        </div>

                        {attachedMedia && (
                            <div className="relative w-10 h-10 shrink-0">
                                <img src={attachedMedia} alt="Preview" className="w-full h-full object-cover rounded border border-purple-500/50" />
                                <button
                                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                                    onClick={() => setAttachedMedia(null)}
                                >
                                    <div className="icon-x"></div>
                                </button>
                            </div>
                        )}
                        <div className="flex items-center gap-1.5 w-full px-2">
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={handleFileAttach}
                            />
                            <button
                                className="btn p-1.5 rounded text-gray-400 hover:text-white shrink-0 flex items-center justify-center"
                                onClick={() => fileInputRef.current?.click()}
                                title="Прикрепить"
                            >
                                <div className="icon-paperclip text-sm"></div>
                            </button>
                            <textarea
                                className="input-field focus:border-purple-500 min-h-[100px] max-h-[180px] py-2 text-xs resize-none"
                                placeholder="Задайте вопрос..."
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                            />
                            <button
                                className="btn bg-purple-600 hover:bg-purple-500 text-white border-purple-500 shrink-0 p-1.5 rounded flex items-center justify-center"
                                onClick={handleSend}
                                disabled={isLoading || (!input.trim() && !attachedMedia)}
                            >
                                <div className="icon-send text-sm"></div>
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Модальный менеджер API-ключей */}
            {showKeyManager && (
                <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2" onMouseDown={(e) => { e.stopPropagation(); setShowKeyManager(false); }}>
                    <div className="bg-[#1a1a2e] border border-purple-500/30 rounded-xl w-full max-w-xs max-h-[95%] flex flex-col overflow-hidden shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--line)] bg-black/40">
                            <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                                <div className="icon-key text-xs"></div>
                                Менеджер ключей
                            </span>
                            <button className="text-gray-500 hover:text-white transition-colors p-0.5" onClick={() => setShowKeyManager(false)}>
                                <div className="icon-x text-sm"></div>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 no-scrollbar">
                            {savedKeys.length === 0 ? (
                                <div className="text-center text-gray-500 text-[11px] py-5">Нет сохранённых ключей.<br/>Добавьте ключ ниже.</div>
                            ) : savedKeys.map(k => (
                                <div key={k.id} className="flex items-center gap-1.5 p-2 rounded-lg bg-black/40 border border-[var(--line)] hover:border-purple-500/40 transition-colors group">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1">
                                            <span className="text-[11px] font-semibold text-gray-200 truncate">{k.label}</span>
                                            <span className={`text-[8px] px-1 py-px rounded-full font-bold uppercase ${k.provider === 'anthropic' ? 'bg-orange-900/50 text-orange-400' : k.provider === 'google' ? 'bg-blue-900/50 text-blue-400' : k.provider === 'grok' ? 'bg-red-900/50 text-red-400' : 'bg-green-900/50 text-green-400'}`}>{k.provider}</span>
                                        </div>
                                        <div className="text-[9px] text-gray-500 font-mono mt-0.5">{k.key.slice(0, 7)}••••{k.key.slice(-4)}</div>
                                    </div>
                                    <button className="text-[9px] px-1.5 py-0.5 rounded bg-purple-600/30 hover:bg-purple-600/60 text-purple-300 font-semibold transition-colors" onClick={() => { const prov = k.provider || detectProviderByKey(k.key) || 'openai'; _setActiveApiKey(k.key); setFetchedModels([]); setFetchModelMsg(''); dispatch({ type: 'UPDATE_AI_SETTINGS', payload: { apiKey: k.key, provider: prov } }); setShowKeyManager(false); }}>Применить</button>
                                    <button className="text-gray-600 hover:text-red-400 transition-colors p-0.5 opacity-0 group-hover:opacity-100" onClick={() => { const next = savedKeys.filter(x => x.id !== k.id); setSavedKeys(next); _setSavedApiKeys(next); }}>
                                        <div className="icon-trash text-[10px]"></div>
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="p-2.5 border-t border-[var(--line)] bg-black/30 space-y-1.5">
                            <div className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">Сохранить новый ключ</div>
                            <input type="text" className="input-field focus:border-purple-500 text-xs w-full" placeholder="Название (напр. OpenAI Work)" value={kmForm.label} onChange={(e) => setKmForm(f => ({...f, label: e.target.value}))} onMouseDown={(e) => e.stopPropagation()} />
                            <div className="flex gap-1.5">
                                <select className="input-field focus:border-purple-500 text-[10px] flex-1 cursor-pointer bg-black/50" value={kmForm.provider} onChange={(e) => setKmForm(f => ({...f, provider: e.target.value}))} onMouseDown={(e) => e.stopPropagation()}>
                                    <option value="openai">OpenAI</option>
                                    <option value="anthropic">Anthropic</option>
                                    <option value="google">Google</option>
                                    <option value="grok">Grok</option>
                                </select>
                                <input type="password" className="input-field focus:border-purple-500 text-xs flex-[2]" placeholder="sk-..." value={kmForm.key} onChange={(e) => { const val = e.target.value; const detected = detectProviderByKey(val); setKmForm(f => ({...f, key: val, provider: detected || f.provider })); }} onMouseDown={(e) => e.stopPropagation()} />
                            </div>
                            <button className="w-full btn bg-purple-600/40 hover:bg-purple-600/60 border-purple-500/40 text-purple-200 text-[11px] py-1.5 rounded font-semibold transition-colors" onClick={() => {
                                if (!kmForm.label.trim() || !kmForm.key.trim()) return;
                                const prov = kmForm.provider || detectProviderByKey(kmForm.key) || 'openai';
                                const next = [...savedKeys, { id: 'key-' + Date.now(), label: kmForm.label.trim(), provider: prov, key: kmForm.key.trim(), createdAt: new Date().toISOString().slice(0, 10) }];
                                setSavedKeys(next);
                                _setSavedApiKeys(next);
                                setKmForm({ label: '', provider: 'openai', key: '' });
                            }}>Сохранить</button>
                        </div>
                        <div className="px-2.5 py-1.5 bg-amber-950/20 border-t border-amber-500/20 text-[8px] text-amber-500/60 text-center">
                            ⚠️ Ключи хранятся только в localStorage этого браузера. Не попадают в файлы проекта и git.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

if (typeof window !== 'undefined') window.AIAgentNodeContent = AIAgentNodeContent;
if (typeof module !== 'undefined' && module.exports) module.exports = AIAgentNodeContent;