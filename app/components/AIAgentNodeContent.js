function AIAgentNodeContent({ nodeId }) {
    const { state, dispatch } = useStore();
    const [tab, setTab] = React.useState('chat'); // 'chat' | 'logs' | 'settings'
    const [actionLogs, setActionLogs] = React.useState([]);
    const [input, setInput] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);
    const [attachedMedia, setAttachedMedia] = React.useState(null);
    const [testStatus, setTestStatus] = React.useState(null);
    const [fetchedModels, setFetchedModels] = React.useState([]);
    const [isFetchingModels, setIsFetchingModels] = React.useState(false);
    const [fetchModelMsg, setFetchModelMsg] = React.useState('');
    const chatEndRef = React.useRef(null);
    const fileInputRef = React.useRef(null);

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

    React.useEffect(() => {
        if (chatEndRef.current && tab === 'chat') {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatHistory, tab, activeSessionId]);

    // Валидация JSON-экшенов перед вызовом dispatch
    const validateAndSanitizeAction = (action, currentState = state, batchActions = []) => {
        const SUPPORTED_ACTION_TYPES = new Set([
            'ADD_LAYER', 'ADD_NODE', 'ADD_PORT', 'ADD_LINK',
            'UPDATE_NODE', 'UPDATE_LAYER', 'UPDATE_PORT', 'UPDATE_LINK',
            'REPARENT_ENTITY', 'DELETE_SELECTED', 'ALIGN_LAYERS',
            'DIVE_INTO', 'GO_TO_CONTEXT', 'NAV_BACK', 'NAV_FORWARD',
            'REMOVE_NODE', 'REMOVE_LAYER', 'REMOVE_PORT', 'REMOVE_LINK',
            'MASS_UPDATE'
        ]);

        if (!action || typeof action !== 'object' || typeof action.type !== 'string') {
            return { valid: false, reason: 'Экшен должен быть объектом с типом string' };
        }
        if (!SUPPORTED_ACTION_TYPES.has(action.type)) {
            return { valid: false, reason: `Неподдерживаемый тип экшена: ${action.type}` };
        }

        const payload = action.payload;
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
        const { apiKey, baseUrl, provider = 'openai' } = aiAgentSettings;
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
                apiUrl = (baseUrl ? baseUrl.replace(/\/+$/, '') : 'https://generativelanguage.googleapis.com/v1beta/openai') + '/models';
                headers = { 'Authorization': `Bearer ${apiKey.trim()}` };
            } else if (provider === 'anthropic') {
                apiUrl = (baseUrl ? baseUrl.replace(/\/+$/, '') : 'https://api.anthropic.com') + '/v1/models';
                headers = {
                    'x-api-key': apiKey.trim(),
                    'anthropic-version': '2023-06-01'
                };
            } else if (provider === 'grok') {
                apiUrl = (baseUrl ? baseUrl.replace(/\/+$/, '') : 'https://api.x.ai/v1') + '/models';
                headers = { 'Authorization': `Bearer ${apiKey.trim()}` };
            } else {
                apiUrl = (baseUrl ? baseUrl.replace(/\/+$/, '') : 'https://api.openai.com') + '/v1/models';
                headers = { 'Authorization': `Bearer ${apiKey.trim()}` };
            }

            let response;
            try {
                response = await fetch(apiUrl, { method: 'GET', headers });
            } catch (directErr) {
                console.warn('Direct model list fetch failed, trying proxy...', directErr);
                response = await fetch(`https://proxy-api.trickle-app.host/?url=${encodeURIComponent(apiUrl)}`, {
                    method: 'GET',
                    headers
                });
            }

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Статус ${response.status}: ${errText.slice(0, 100)}`);
            }

            const data = await response.json();
            let rawList = [];
            if (Array.isArray(data.data)) {
                rawList = data.data.map(m => m.id || m.name).filter(Boolean);
            } else if (Array.isArray(data.models)) {
                rawList = data.models.map(m => m.id || m.name || m.displayName).filter(Boolean);
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
            if (!quiet) setFetchModelMsg(`⚠️ Не удалось загрузить список: ${e.message}`);
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
                (provider === 'anthropic' ? 'claude-3-5-sonnet' : 
                 provider === 'google' ? 'gemini-1.5-flash' : 
                 provider === 'grok' ? 'grok-2-mini' : 'gpt-4o');

            if (provider === 'anthropic') {
                apiUrl = (baseUrl ? baseUrl.replace(/\/+$/, '') : 'https://api.anthropic.com') + '/v1/messages';
                headers = {
                    'x-api-key': apiKey.trim(),
                    'anthropic-version': '2023-06-01',
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

            let response;
            try {
                response = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(body) });
            } catch (directErr) {
                console.warn('Direct fetch failed, trying proxy...', directErr);
                response = await fetch(`https://proxy-api.trickle-app.host/?url=${encodeURIComponent(apiUrl)}`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body)
                });
            }

            if (!response.ok) {
                const errText = await response.text();
                let parsedErr = errText;
                try {
                    const parsedObj = JSON.parse(errText);
                    parsedErr = parsedObj.error?.message || parsedObj.message || errText;
                } catch(e) {}
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
            
            state.links.forEach(link => {
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
                        if (n.parentId === parentId && !connectedNodes.has(n)) {
                            connectedNodes.add(n);
                            addNestedChildren(n.id);
                        }
                    });
                };
                const initialNodes = Array.from(connectedNodes);
                initialNodes.forEach(n => addNestedChildren(n.id));
            }

            let nodesSummary;
            if (isLocalMode) {
                nodesSummary = Array.from(connectedNodes).map(n => ({
                    id: n.id, 
                    name: n.name, 
                    parentId: n.parentId,
                    type: n.type || 'default'
                }));
            } else {
                nodesSummary = Object.values(state.nodes).map(n => ({
                    id: n.id, 
                    name: n.name, 
                    parentId: n.parentId,
                    type: n.type || 'default'
                }));
            }

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

            let systemPrompt = `Вы — ИИ-ассистент (Copilot) для визуального редактора узлов Architector. 

Текущее состояние холста:
${contextStr}

Доступный список узлов для вашей работы (ID, Имя, Родитель):
${JSON.stringify(nodesSummary)}

`;

            if (aiAgentSettings.mode === 'agent') {
                systemPrompt += `ВЫ РАБОТАЕТЕ В РЕЖИМЕ АГЕНТА И МОЖЕТЕ НАПРЯМУЮ РЕДАКТИРОВАТЬ И СТРОИТЬ ХОЛСТ!

ПОЛНАЯ ИНСТРУКЦИЯ И ПОДДЕРЖИВАЕМЫЕ JSON-ЭКШЕНЫ:
Если пользователь просит СОЗДАТЬ, ИЗМЕНИТЬ, УДАЛИТЬ или ПОГРУЗИТЬСЯ в структуры (слои, узлы, порты, связи), вы ОБЯЗАНЫ приложить в самом конце своего ответа один блок кода в формате JSON с массивом экшенов:

\`\`\`json
[
  { "type": "ADD_LAYER", "payload": { "id": "layer-1-ui", "name": "1. UI Layer", "content": "Описание слоя", "color": "#0284c7", "position": {"x": -400, "y": -250}, "size": {"w": 650, "h": 450}, "parentId": "root" } },
  { "type": "ADD_NODE", "payload": { "id": "node-1", "name": "Canvas Viewport", "content": "Интерактивный холст", "color": "#0f172a", "position": {"x": 30, "y": 80}, "size": {"w": 250, "h": 120}, "parentId": "layer-1-ui", "shape": "rectangle", "mediaUrl": "https://...", "mediaHeight": 70 } },
  { "type": "ADD_NODE", "payload": { "id": "node-2", "name": "Store Provider", "content": "Хранилище состояния", "color": "#0f172a", "position": {"x": 310, "y": 80}, "size": {"w": 250, "h": 120}, "parentId": "layer-1-ui", "shape": "rectangle" } },
  { "type": "ADD_NODE", "payload": { "id": "node-sub-1", "name": "Sub-Component", "content": "Дочерний узел (Уровень 2)", "color": "#0284c7", "position": {"x": 20, "y": 20}, "parentId": "node-1", "shape": "rectangle" } },
  { "type": "ADD_PORT", "payload": { "id": "port-1-out", "nodeId": "node-1", "type": "output", "edge": "right", "position": 0.5, "name": "Events Out", "color": "#38bdf8" } },
  { "type": "ADD_PORT", "payload": { "id": "port-2-in", "nodeId": "node-2", "type": "input", "edge": "left", "position": 0.5, "name": "Actions In", "color": "#0284c7" } },
  { "type": "ADD_LINK", "payload": { "id": "link-1-to-2", "sourcePortId": "port-1-out", "targetPortId": "port-2-in", "name": "Redux Dispatch", "linkStyle": "orthogonal", "color": "#38bdf8", "context": "layer-1-ui" } },
  { "type": "DIVE_INTO", "payload": { "id": "node-1", "name": "Canvas Viewport" } },
  { "type": "UPDATE_NODE", "payload": { "id": "node-1", "updates": { "color": "#HEX", "name": "Новое имя" } } },
  { "type": "REMOVE_NODE", "payload": "node-2" }
]
\`\`\`

СТРОГИЕ ПРАВИЛА И ИНВАРИАНТЫ:
1. ФОРМА УЗЛОВ (shape): Все узлы ИМЕЮТ СТРОГО ПРЯМОУГОЛЬНУЮ ФОРМУ (shape: "rectangle"). Не-прямоугольные формы запрещены.
2. ПОГРУЖЕНИЕ (DIVE_INTO): Вы можете переключить фокус камеры пользователя внутрь сгенерированного узла, слоя, порта или связи командой { "type": "DIVE_INTO", "payload": { "id": "node-id", "name": "Заголовок" } }.
3. МНОГОУРОВНЕВАЯ ВЛОЖЕННОСТЬ (parentId):
   - Уровень 1: parentId === "root" или parentId === ID слоя.
   - Уровень 2 (Внутри Узла): parentId === ID узла (создание дочерних суб-узлов внутри узла-контейнера).
   - Уровень 3 (Внутри Порта/Связи): parentId === ID порта или связи.
4. ОБЯЗАТЕЛЬНОЕ СОЗДАНИЕ ПОРТОВ (ADD_PORT): Для каждого узла создавайте порты на его гранях!
5. СВЯЗИ СОЕДИНЯЮТ ТОЛЬКО ПОРТЫ (ADD_LINK): sourcePortId и targetPortId содержат СТРОГО ID портов.
6. Выдайте короткий вежливый пояснительный текстовый ответ, а в самом конце — ТОЛЬКО один блок \`\`\`json ... \`\`\`.`;
            } else {
                systemPrompt += `ВЫ РАБОТАЕТЕ В РЕЖИМЕ CHAT-ONLY (Только чтение).
Вы просто умный ИИ-помощник. Отвечайте на вопросы пользователя, анализируя предоставленный контекст холста.
ВАМ СТРОГО ЗАПРЕЩЕНО генерировать JSON-команды для изменения графа. Только консультации, советы и ответы на вопросы.`;
            }

            if (aiAgentSettings.llmEnabled === false) {
                await new Promise(r => setTimeout(r, 800));
                aiResponse = `(Локальная сеть) LLM отключен. Вы можете включить LLM тумблер в шапке или настроить API-ключ в настройках.`;
            } else if (aiAgentSettings.apiKey && aiAgentSettings.apiKey.trim() !== '') {
                const provider = aiAgentSettings.provider || 'openai';
                const baseUrl = aiAgentSettings.baseUrl || '';
                
                const model = (aiAgentSettings.model && aiAgentSettings.model.trim() !== '') ? aiAgentSettings.model.trim() : 
                    (provider === 'anthropic' ? 'claude-3-5-sonnet' : 
                     provider === 'google' ? 'gemini-1.5-flash' : 
                     provider === 'grok' ? 'grok-2-mini' : 'gpt-4o');

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
                } catch (directErr) {
                    console.warn('Direct fetch failed, attempting proxy fallback...', directErr);
                    if (directErr.name === 'AbortError') throw directErr;
                    response = await fetch(`https://proxy-api.trickle-app.host/?url=${encodeURIComponent(apiUrl)}`, fetchOptions);
                } finally {
                    clearTimeout(timeoutId);
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    let parsedErr = errorText;
                    try {
                        const parsedObj = JSON.parse(errorText);
                        parsedErr = parsedObj.error?.message || parsedObj.message || errorText;
                    } catch(e) {}
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
                    const actions = JSON.parse(jsonMatch[1]);
                    if (Array.isArray(actions)) {
                        let validCount = 0;
                        let invalidCount = 0;
                        const logEntries = [];

                        actions.forEach(action => {
                            const val = validateAndSanitizeAction(action, state, actions);
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

                        setActionLogs(prev => [...logEntries, ...prev].slice(0, 150));

                        aiResponse = aiResponse.replace(jsonMatch[0], '').trim();
                        if (validCount > 0) {
                            aiResponse += `\n\n✅ *Применено ${validCount} экшенов к холсту.*`;

                            // Автоматически применяем авто-расстановку узлов для всех слоев, куда ИИ добавил ноды
                            setTimeout(() => {
                                const currentState = useStore.getState ? useStore.getState() : state;
                                const affectedLayerIds = new Set();
                                actions.forEach(a => {
                                    if (a && a.payload) {
                                        if (a.type === 'ADD_LAYER') affectedLayerIds.add(a.payload.id);
                                        if (a.type === 'ADD_NODE' && a.payload.parentId && a.payload.parentId !== 'root') {
                                            affectedLayerIds.add(a.payload.parentId);
                                        }
                                    }
                                });

                                affectedLayerIds.forEach(lId => {
                                    const layer = currentState.layers ? currentState.layers[lId] : null;
                                    if (layer) {
                                        const layerNodes = Object.values(currentState.nodes || {}).filter(n => n && n.parentId === lId);
                                        if (layerNodes.length > 0 && window.GeometryUtils && window.GeometryUtils.getSmartPlacement) {
                                            const { updatesById, newLayerSize } = window.GeometryUtils.getSmartPlacement(layerNodes, layer, currentState.nodes);
                                            dispatch({ type: 'UPDATE_LAYER', payload: { id: lId, updates: { size: newLayerSize }, skipHistory: true } });
                                            dispatch({ type: 'MASS_UPDATE', payload: { ids: layerNodes.map(n => n.id), updatesById, skipHistory: true } });
                                        }
                                    }
                                });

                                // Авто-выравнивание слоев на корневом уровне
                                dispatch({ type: 'ALIGN_LAYERS', payload: { contextId: 'root' } });
                            }, 50);
                        }
                        if (invalidCount > 0) {
                            aiResponse += `\n⚠️ *Отклонено ${invalidCount} невалидных команд.*`;
                        }
                    }
                } catch(e) {
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
            } else if (errorMessage.includes('Failed to fetch')) {
                errorMessage = 'Блокировка запроса браузером (CORS) или отсутствие интернета. Проверьте Base URL или API-ключ.';
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

    const currentProvider = aiAgentSettings.provider || 'openai';

    // Запасные статические пресеты, если список моделей еще не загружен с API
    const providerPresets = {
        openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-mini'],
        anthropic: ['claude-3-5-sonnet', 'claude-3-haiku', 'claude-3-opus'],
        google: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash-8b'],
        grok: ['grok-2-mini', 'grok-2', 'grok-beta']
    };
    
    // Если удалось динамически сгрузить реальные модели с API — показываем их, иначе используем статический фоллбек
    const displayModels = fetchedModels.length > 0 ? fetchedModels : (providerPresets[currentProvider] || providerPresets.openai);

    return (
        <div 
            className="flex-1 flex flex-col h-full overflow-hidden bg-black/20" 
            onMouseDown={e => e.stopPropagation()}
            data-file="components/AIAgentNodeContent.js"
        >
            <div className="px-3 py-2 border-b border-[#333] flex items-center justify-between bg-black/40 text-xs shrink-0">
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
                                    className="bg-black/60 border border-[#444] text-purple-300 text-[10px] rounded px-1 py-0.5 max-w-[110px] truncate cursor-pointer font-medium"
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
                                <span>+ Новый чат</span>
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
                    <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">LLM</span>
                    <button 
                        className={`w-8 h-4 rounded-full transition-colors relative ${aiAgentSettings.llmEnabled !== false ? 'bg-purple-500' : 'bg-[#444]'}`}
                        onClick={() => dispatch({ type: 'UPDATE_AI_SETTINGS', payload: { llmEnabled: aiAgentSettings.llmEnabled === false ? true : false } })}
                        title={aiAgentSettings.llmEnabled !== false ? "LLM Включен" : "LLM Выключен"}
                    >
                        <div className={`absolute top-[2px] left-[2px] w-3 h-3 rounded-full bg-white transition-transform ${aiAgentSettings.llmEnabled !== false ? 'translate-x-4' : 'translate-x-0'}`}></div>
                    </button>
                </div>
            </div>

            {tab === 'settings' ? (
                <div className="flex-1 p-3 flex flex-col gap-3.5 overflow-y-auto no-scrollbar">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Провайдер ИИ</label>
                        <select 
                            className="input-field border-[#444] focus:border-purple-500 cursor-pointer bg-black/50 text-xs"
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
                            className="input-field border-[#444] focus:border-purple-500 text-xs" 
                            placeholder={currentProvider === 'grok' ? 'https://api.x.ai/v1' : currentProvider === 'google' ? 'https://generativelanguage.googleapis.com/v1beta/openai' : currentProvider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com'}
                            value={aiAgentSettings.baseUrl || ''}
                            onChange={(e) => dispatch({ type: 'UPDATE_AI_SETTINGS', payload: { baseUrl: e.target.value } })}
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">API Ключ</label>
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
                            className="input-field border-[#444] focus:border-purple-500 text-xs" 
                            placeholder={currentProvider === 'grok' ? 'xai-...' : currentProvider === 'google' ? 'AIzaSy...' : 'sk-...'}
                            value={aiAgentSettings.apiKey || ''}
                            onChange={(e) => dispatch({ type: 'UPDATE_AI_SETTINGS', payload: { apiKey: e.target.value } })}
                        />
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
                            className="input-field border-[#444] focus:border-purple-500 cursor-pointer bg-black/50 text-xs"
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
                            className="input-field border-[#444] focus:border-purple-500 text-xs font-mono mt-1" 
                            placeholder="Или введите имя модели вручную..."
                            value={aiAgentSettings.model || ''}
                            onChange={(e) => dispatch({ type: 'UPDATE_AI_SETTINGS', payload: { model: e.target.value } })}
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Режим</label>
                        <div className="flex gap-2">
                            <button 
                                className={`flex-1 py-1.5 rounded border text-xs flex items-center justify-center gap-1.5 transition-colors ${(!aiAgentSettings.mode || aiAgentSettings.mode === 'agent') ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-black/30 border-[#444] text-gray-400 hover:bg-black/50'}`}
                                onClick={() => dispatch({ type: 'UPDATE_AI_SETTINGS', payload: { mode: 'agent' } })}
                                title="ИИ может изменять граф"
                            >
                                <div className="icon-bot text-sm"></div> Agent
                            </button>
                            <button 
                                className={`flex-1 py-1.5 rounded border text-xs flex items-center justify-center gap-1.5 transition-colors ${aiAgentSettings.mode === 'chat' ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-black/30 border-[#444] text-gray-400 hover:bg-black/50'}`}
                                onClick={() => dispatch({ type: 'UPDATE_AI_SETTINGS', payload: { mode: 'chat' } })}
                                title="ИИ только читает и отвечает на вопросы"
                            >
                                <div className="icon-message-square text-sm"></div> Chat
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Окружение (Контекст)</label>
                        <div className="flex gap-2">
                            <button 
                                className={`flex-1 py-1.5 rounded border text-xs flex items-center justify-center gap-1.5 transition-colors ${(!aiAgentSettings.contextMode || aiAgentSettings.contextMode === 'global') ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-black/30 border-[#444] text-gray-400 hover:bg-black/50'}`}
                                onClick={() => dispatch({ type: 'UPDATE_AI_SETTINGS', payload: { contextMode: 'global' } })}
                                title="Видеть все узлы проекта"
                            >
                                <div className="icon-globe text-sm"></div> Глобально
                            </button>
                            <button 
                                className={`flex-1 py-1.5 rounded border text-xs flex items-center justify-center gap-1.5 transition-colors ${aiAgentSettings.contextMode === 'local' ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-black/30 border-[#444] text-gray-400 hover:bg-black/50'}`}
                                onClick={() => dispatch({ type: 'UPDATE_AI_SETTINGS', payload: { contextMode: 'local' } })}
                                title="Видеть только подключенные узлы и их внутренности"
                            >
                                <div className="icon-network text-sm"></div> Локально
                            </button>
                        </div>
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
                <div className="flex-1 p-3 flex flex-col overflow-hidden bg-slate-950/90 font-mono text-[11px]">
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
                            История выполнения экшенов пуста.<br/>Отправьте запрос в режиме Agent для просмотра подробного лога.
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
                            {actionLogs.map(log => (
                                <div key={log.id} className="flex items-start gap-2 p-1.5 rounded bg-slate-900/80 border border-slate-800 text-xs">
                                    <span className="text-gray-500 text-[10px] shrink-0 font-mono mt-0.5">{log.time}</span>
                                    {log.type === 'success' && <span className="text-green-400 shrink-0 font-bold">✓</span>}
                                    {log.type === 'warn' && <span className="text-yellow-400 shrink-0 font-bold">⚠️</span>}
                                    {log.type === 'error' && <span className="text-red-400 shrink-0 font-bold">✗</span>}
                                    <span className={`break-all ${
                                        log.type === 'success' ? 'text-gray-300' :
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
                                    <div className={`px-2.5 py-1.5 rounded-lg text-xs whitespace-pre-wrap break-words select-text cursor-text ${msg.role === 'user' ? 'bg-purple-600 text-white' : 'bg-[#2a2a2a] border border-[#444] text-gray-200'}`}>
                                        {msg.content}
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
                                    <img src={msg.media} alt="Attached" className="mt-1 max-w-full h-auto rounded border border-[#444] max-h-[100px] object-contain" />
                                )}
                            </div>
                        ))}
                        {isLoading && (
                            <div className="self-start px-2 py-1.5 rounded-lg bg-[#2a2a2a] border border-[#444] flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></div>
                                <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse delay-75"></div>
                                <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse delay-150"></div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    <div className="p-2 border-t border-[#333] bg-black/40 flex flex-col gap-1.5 shrink-0">
                        {/* Панель оперативного переключения Режима и Контекста */}
                        <div className="flex items-center justify-between pb-1 border-b border-[#333]/60 text-[10px] gap-1">
                            <div className="flex items-center gap-1">
                                <span className="text-gray-400 font-semibold uppercase text-[9px]">Режим:</span>
                                <div className="flex bg-black/60 p-0.5 rounded border border-[#444]">
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

                            <div className="flex items-center gap-1">
                                <span className="text-gray-400 font-semibold uppercase text-[9px]">Контекст:</span>
                                <div className="flex bg-black/60 p-0.5 rounded border border-[#444]">
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
                        <div className="flex items-end gap-1.5">
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept="image/*"
                                onChange={handleFileAttach}
                            />
                            <button 
                                className="btn p-1.5 rounded text-gray-400 hover:text-white shrink-0"
                                onClick={() => fileInputRef.current?.click()}
                                title="Прикрепить"
                            >
                                <div className="icon-paperclip text-sm"></div>
                            </button>
                            <textarea 
                                className="input-field border-[#444] focus:border-purple-500 min-h-[32px] max-h-[80px] py-1.5 text-xs resize-none"
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
                                className="btn bg-purple-600 hover:bg-purple-500 text-white border-purple-500 shrink-0 p-1.5 rounded"
                                onClick={handleSend}
                                disabled={isLoading || (!input.trim() && !attachedMedia)}
                            >
                                <div className="icon-send text-sm"></div>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}