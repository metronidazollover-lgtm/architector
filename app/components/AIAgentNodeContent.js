function AIAgentNodeContent({ nodeId }) {
    const { state, dispatch } = useStore();
    const [tab, setTab] = React.useState('chat'); // 'chat' or 'settings'
    const [input, setInput] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);
    const [attachedMedia, setAttachedMedia] = React.useState(null);
    const chatEndRef = React.useRef(null);
    const fileInputRef = React.useRef(null);

    const { aiAgentSettings } = state.ui;
    const chatHistory = state.aiChatHistory || [];

    React.useEffect(() => {
        if (chatEndRef.current && tab === 'chat') {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatHistory, tab]);

    const handleSend = async () => {
        if (!input.trim() && !attachedMedia) return;

        const userMsg = { role: 'user', content: input, media: attachedMedia };
        dispatch({ type: 'ADD_AI_MESSAGE', payload: userMsg });
        setInput('');
        setAttachedMedia(null);
        setIsLoading(true);

        try {
            // Сбор контекста для ИИ: ищем только узлы, непосредственно подключенные к этому ИИ-ассистенту
            const connectedNodes = new Set();
            
            // Находим все порты, принадлежащие этому ИИ-ассистенту
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

            // Если локальный режим, собираем всех вложенных потомков для подключенных узлов
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

            // Сводка узлов (глобальная или локальная)
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

            const connectedNodesArray = Array.from(connectedNodes).slice(0, 15); // Максимум 15 узлов для контекста
            
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
Если пользователь просит СОЗДАТЬ, ИЗМЕНИТЬ или УДАЛИТЬ структуры (слои, узлы, медиа-карточки, порты или связи), вы ОБЯЗАНЫ приложить в самом конце своего ответа один блок кода в формате JSON с массивом экшенов:

\`\`\`json
[
  { "type": "ADD_LAYER", "payload": { "id": "layer-1-ui", "name": "1. UI Layer", "content": "Описание слоя", "color": "#0284c7", "position": {"x": -400, "y": -250}, "size": {"w": 600, "h": 400}, "parentId": "root" } },
  { "type": "ADD_NODE", "payload": { "id": "node-1", "name": "Имя узла", "content": "Текст", "color": "#0f172a", "position": {"x": 30, "y": 80}, "size": {"w": 250, "h": 120}, "parentId": "layer-1-ui", "shape": "rectangle|circle|hexagon|diamond", "type": "default|ai-agent", "mediaUrl": "https://...", "mediaHeight": 80 } },
  { "type": "ADD_PORT", "payload": { "id": "port-1", "nodeId": "node-1", "type": "input|output", "edge": "left|right|top|bottom", "position": 0.5, "name": "Имя порта", "color": "#38bdf8" } },
  { "type": "ADD_LINK", "payload": { "id": "link-1", "sourcePortId": "port-1", "targetPortId": "port-2", "name": "Название линии", "linkStyle": "orthogonal|bezier", "color": "#0284c7", "context": "root" } },
  { "type": "UPDATE_NODE", "payload": { "id": "existing-node-id", "updates": { "color": "#HEX", "name": "Новое имя", "content": "Новый текст" } } },
  { "type": "REPARENT_ENTITY", "payload": { "id": "node-1", "newParentId": "layer-1-ui" } },
  { "type": "DELETE_SELECTED", "payload": { "ids": ["node-1", "port-1"] } }
]
\`\`\`

ВАЖНЫЕ ПРАВИЛА КООРДИНАТ И ИЕРАРХИИ (v10):
1. Всегда придумывайте логичные уникальные текстовые ID (например \`layer-ui\`, \`node-canvas\`, \`port-out\`).
2. Вложенность (parentId): родителем может выступать "root", ID слоя, ID узла, ID порта или ID связи.
3. Координаты (position {x, y}): если parentId === 'root', позиция задается в мировой системе (например x: -400, y: -250). Если parentId !== 'root', позиция ОБЯЗАТЕЛЬНО считается локально от левого верхнего угла родителя (0, 0) (безопасные координаты x: 30..300, y: 70..250).
4. Выдайте короткий вежливый пояснительный текстовый ответ, а в самом конце — ТОЛЬКО один блок \`\`\`json ... \`\`\`.`;
            } else {
                systemPrompt += `ВЫ РАБОТАЕТЕ В РЕЖИМЕ CHAT-ONLY (Только чтение).
Вы просто умный ИИ-помощник. Отвечайте на вопросы пользователя, анализируя предоставленный контекст холста.
ВАМ СТРОГО ЗАПРЕЩЕНО генерировать JSON-команды для изменения графа. Только консультации, советы и ответы на вопросы.`;
            }

            if (aiAgentSettings.llmEnabled === false) {
                await new Promise(r => setTimeout(r, 800));
                aiResponse = `(Локальная сеть) LLM отключен. Здесь в будущем будет реализовано подключение к вашей локальной нейросети или другому внешнему API.`;
            } else if (aiAgentSettings.apiKey && aiAgentSettings.apiKey.trim() !== '') {
                // Использование собственного API ключа через прокси для обхода CORS
                let apiUrl = 'https://api.openai.com/v1/chat/completions';
                let authHeader = `Bearer ${aiAgentSettings.apiKey}`;
                let model = aiAgentSettings.model || 'gpt-4o';
                
                // Простая поддержка Claude, если выбрана модель anthropic
                if (model.includes('claude')) {
                    apiUrl = 'https://api.anthropic.com/v1/messages';
                    authHeader = aiAgentSettings.apiKey; // Claude использует x-api-key
                    // Для Claude прокси потребует дополнительных заголовков, пока оставим базовый запрос как для OpenAI-совместимых API, 
                    // или предупредим, что лучше использовать OpenAI совместимые.
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 секунд таймаут
                
                const fetchOptions = {
                    method: 'POST',
                    headers: {
                        'Authorization': authHeader,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: input }
                        ]
                    }),
                    signal: controller.signal
                };

                let response;
                try {
                    response = await fetch(`https://proxy-api.trickle-app.host/?url=${encodeURIComponent(apiUrl)}`, fetchOptions);
                } catch (proxyErr) {
                    console.warn('Proxy fetch failed, attempting direct fetch...', proxyErr);
                    if (proxyErr.name === 'AbortError') throw proxyErr;
                    response = await fetch(apiUrl, fetchOptions);
                } finally {
                    clearTimeout(timeoutId);
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API Error: ${response.status} - ${errorText}`);
                }

                const data = await response.json();
                if (data.choices && data.choices[0] && data.choices[0].message) {
                    aiResponse = data.choices[0].message.content;
                } else {
                    throw new Error('Некорректный формат ответа от API');
                }
            } else if (typeof invokeAIAgent === 'function') {
                aiResponse = await invokeAIAgent(systemPrompt, input);
            } else {
                await new Promise(r => setTimeout(r, 1500));
                aiResponse = `(Демо-режим) Выполняю тестовую команду.`;
            }

            // Пытаемся найти и выполнить JSON команды
            aiResponse = aiResponse || '';
            const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch) {
                try {
                    const actions = JSON.parse(jsonMatch[1]);
                    if (Array.isArray(actions)) {
                        actions.forEach(action => dispatch(action));
                    }
                    // Очищаем JSON из видимого ответа, чтобы не пугать пользователя кодом
                    aiResponse = aiResponse.replace(jsonMatch[0], '').trim();
                    aiResponse += '\n\n✅ *Действия успешно применены к холсту.*';
                } catch(e) {
                    console.error('AI JSON parse error', e);
                    aiResponse += '\n\n❌ *Ассистент вернул неверный формат действий.*';
                }
            }

            dispatch({ type: 'ADD_AI_MESSAGE', payload: { role: 'ai', content: aiResponse } });
        } catch (e) {
            console.error('Ошибка ИИ:', e);
            let errorMessage = e.message || 'Сбой сети';
            if (e.name === 'AbortError') {
                errorMessage = 'Превышено время ожидания ответа (30 секунд). Сервер не ответил.';
            } else if (errorMessage.includes('Failed to fetch')) {
                errorMessage = 'Блокировка запроса браузером (CORS) или отсутствие интернета. Проверьте VPN или отключите блокировщики рекламы.';
            }
            dispatch({ type: 'ADD_AI_MESSAGE', payload: { role: 'ai', content: `⚠️ Ошибка: ${errorMessage}` } });
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

    return (
        <div 
            className="flex-1 flex flex-col h-full overflow-hidden bg-black/20" 
            onMouseDown={e => e.stopPropagation()} // Предотвращаем перемещение узла при клике внутри
            data-file="components/AIAgentNodeContent.js"
        >
            <div className="px-3 py-2 border-b border-[#333] flex items-center justify-between bg-black/40 text-xs shrink-0">
                <div className="flex gap-4">
                    <button 
                        className={`font-semibold transition-colors pb-1 border-b-2 ${tab === 'chat' ? 'text-purple-400 border-purple-400' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                        onClick={() => setTab('chat')}
                    >
                        Диалог
                    </button>
                    <button 
                        className={`font-semibold transition-colors pb-1 border-b-2 ${tab === 'settings' ? 'text-purple-400 border-purple-400' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                        onClick={() => setTab('settings')}
                    >
                        Настройки
                    </button>
                </div>
                
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">LLM</span>
                    <button 
                        className={`w-8 h-4 rounded-full transition-colors relative ${aiAgentSettings.llmEnabled !== false ? 'bg-purple-500' : 'bg-[#444]'}`}
                        onClick={() => dispatch({ type: 'UPDATE_AI_SETTINGS', payload: { llmEnabled: aiAgentSettings.llmEnabled === false ? true : false } })}
                        title={aiAgentSettings.llmEnabled !== false ? "LLM Включен (Связь с облачным ассистентом)" : "LLM Выключен (Резерв для локальной сети)"}
                    >
                        <div className={`absolute top-[2px] left-[2px] w-3 h-3 rounded-full bg-white transition-transform ${aiAgentSettings.llmEnabled !== false ? 'translate-x-4' : 'translate-x-0'}`}></div>
                    </button>
                </div>
            </div>

            {tab === 'settings' ? (
                <div className="flex-1 p-3 flex flex-col gap-4 overflow-y-auto no-scrollbar">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">API Ключ</label>
                        <input 
                            type="password" 
                            className="input-field border-[#444] focus:border-purple-500 text-xs" 
                            placeholder="sk-..."
                            value={aiAgentSettings.apiKey}
                            onChange={(e) => dispatch({ type: 'UPDATE_AI_SETTINGS', payload: { apiKey: e.target.value } })}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Модель ИИ</label>
                        <select 
                            className="input-field border-[#444] focus:border-purple-500 cursor-pointer bg-black/50 text-xs"
                            value={aiAgentSettings.model}
                            onChange={(e) => dispatch({ type: 'UPDATE_AI_SETTINGS', payload: { model: e.target.value } })}
                        >
                            <option value="gpt-4o">GPT-4o (OpenAI)</option>
                            <option value="gpt-4-turbo">GPT-4 Turbo</option>
                            <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                        </select>
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