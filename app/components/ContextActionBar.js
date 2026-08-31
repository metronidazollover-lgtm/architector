// Верхняя контекстная панель свойств (Context Action Bar).
// Располагается по центру экрана строго под строкой навигации (top-16).
// Реализует 3-ярусную компоновку: Название + ID, Ряд кнопок (40x40px) с поповерами, Поле описания.

const COLOR_PRESETS = [
    '#1a1a1a', '#0f172a', '#1e293b', '#14532d', 
    '#064e3b', '#1e3a8a', '#312e81', '#581c87', 
    '#701a75', '#7f1d1d', '#78350f', '#134e4a',
    '#27272a', '#3f3f46'
];

const FONT_PRESETS = [
    { id: 'Inter, sans-serif', label: 'Inter', category: 'Modern Sans' },
    { id: 'Roboto, sans-serif', label: 'Roboto', category: 'Geometric Sans' },
    { id: 'Montserrat, sans-serif', label: 'Montserrat', category: 'Grotesque Sans' },
    { id: 'Fira Code, monospace', label: 'Fira Code', category: 'Monospace' },
    { id: 'JetBrains Mono, monospace', label: 'JetBrains Mono', category: 'Monospace' },
    { id: 'Playfair Display, serif', label: 'Playfair', category: 'Classic Serif' },
    { id: 'Merriweather, serif', label: 'Merriweather', category: 'Book Serif' },
    { id: 'Oswald, sans-serif', label: 'Oswald', category: 'Condensed' },
    { id: 'Comic Neue, cursive, sans-serif', label: 'Comic Neue', category: 'Casual' },
    { id: 'Comfortaa, cursive, sans-serif', label: 'Comfortaa', category: 'Rounded' },
    { id: 'Courier New, monospace', label: 'Courier New', category: 'System Mono' }
];

const FONT_SIZE_PRESETS = [
    { size: 11, label: '11px', name: 'XS' },
    { size: 12, label: '12px', name: 'SM' },
    { size: 14, label: '14px', name: 'MD' },
    { size: 16, label: '16px', name: 'LG' },
    { size: 18, label: '18px', name: 'XL' },
    { size: 20, label: '20px', name: '2XL' },
    { size: 24, label: '24px', name: '3XL' }
];

const ICON_PRESETS = [
    { id: '', label: 'Без значка', icon: null },
    { id: 'icon-box', label: 'Куб', icon: 'icon-box' },
    { id: 'icon-folder', label: 'Папка', icon: 'icon-folder' },
    { id: 'icon-database', label: 'БД', icon: 'icon-database' },
    { id: 'icon-server', label: 'Сервер', icon: 'icon-server' },
    { id: 'icon-cpu', label: 'Процессор', icon: 'icon-cpu' },
    { id: 'icon-globe', label: 'Сеть', icon: 'icon-globe' },
    { id: 'icon-layers', label: 'Слой', icon: 'icon-layers' },
    { id: 'icon-file', label: 'Файл', icon: 'icon-file' },
    { id: 'icon-code', label: 'Код', icon: 'icon-code' },
    { id: 'icon-bot', label: 'ИИ Бот', icon: 'icon-bot' },
    { id: 'icon-shield', label: 'Защита', icon: 'icon-shield' },
    { id: 'icon-zap', label: 'Событие', icon: 'icon-zap' },
    { id: 'icon-tag', label: 'Тег', icon: 'icon-tag' },
    { id: 'icon-bookmark', label: 'Закладка', icon: 'icon-bookmark' },
    { id: 'icon-cloud', label: 'Облако', icon: 'icon-cloud' },
    { id: 'icon-lock', label: 'Замок', icon: 'icon-lock' },
    { id: 'icon-activity', label: 'Пульс', icon: 'icon-activity' },
    { id: 'icon-settings', label: 'Опции', icon: 'icon-settings' }
];

const EMOJI_PRESETS = ['📦', '📁', '🗄️', '🖥️', '⚡', '🌐', '📚', '📄', '💻', '🤖', '🛡️', '⚙️', '🎯', '🚀', '💡', '🏷️', '🔗', '🔔', '⭐', '📌'];

const CopyButton = ({ text }) => {
    const [copied, setCopied] = React.useState(false);
    const handleCopy = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button 
            className="px-2 h-7 rounded text-xs shrink-0 flex items-center gap-1.5 text-gray-400 hover:text-white border border-white/10 hover:border-white/25 bg-black/40 hover:bg-black/60 transition-all font-mono"
            onClick={handleCopy}
            title={`Копировать ID: ${text}`}
        >
            <span className="max-w-[90px] truncate text-[11px] select-all">{text}</span>
            <div className={`text-xs ${copied ? "icon-check text-green-400" : "icon-copy"}`}></div>
        </button>
    );
};

const ContextDescriptionInput = ({ value, placeholder, onChange, onBlur }) => {
    const textareaRef = React.useRef(null);

    const adjustHeight = React.useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        const scrollH = el.scrollHeight;
        if (scrollH <= 32) {
            el.style.height = '28px';
            el.style.overflowY = 'hidden';
        } else if (scrollH < 140) {
            el.style.height = `${scrollH}px`;
            el.style.overflowY = 'hidden';
        } else {
            el.style.height = '140px';
            el.style.overflowY = 'auto';
        }
    }, []);

    React.useLayoutEffect(() => {
        adjustHeight();
    }, [value, adjustHeight]);

    return (
        <textarea 
            ref={textareaRef}
            rows={1}
            className="w-full bg-black/40 text-gray-200 px-2.5 py-1 rounded-lg border border-white/10 focus:border-[var(--accent-blue)] focus:bg-black/60 text-xs outline-none resize-none font-sans break-all whitespace-pre-wrap leading-snug custom-scrollbar transition-all box-border"
            style={{ minHeight: '28px', height: '28px', overflowY: 'hidden' }}
            placeholder={placeholder}
            value={value || ''}
            onInput={adjustHeight}
            onChange={onChange}
            onBlur={onBlur}
        />
    );
};

const TypographyPopover = ({ currentFont, currentSize, onFontChange, onSizeChange, leftClass = "left-10" }) => {
    return (
        <div className={`absolute ${leftClass} top-12 w-72 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-xl p-3 shadow-2xl z-50 flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-150`}>
            {/* Размер шрифта */}
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-gray-300 uppercase tracking-wider">
                    <span>Размер шрифта</span>
                    <span className="text-[var(--accent-blue)] font-mono text-xs font-bold">{currentSize || 14}px</span>
                </div>
                <div className="flex items-center gap-1">
                    {FONT_SIZE_PRESETS.map((item) => (
                        <button
                            key={item.size}
                            className={`flex-1 h-7 rounded border text-[11px] font-medium transition-all ${
                                (currentSize || 14) === item.size
                                    ? 'bg-[var(--accent-blue)] text-white border-[var(--accent-blue)] shadow'
                                    : 'bg-black/30 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white'
                            }`}
                            onClick={() => onSizeChange(item.size)}
                            title={`${item.label} (${item.name})`}
                        >
                            {item.size}
                        </button>
                    ))}
                </div>
            </div>

            {/* Гарнитура / Шрифт */}
            <div className="flex flex-col gap-1.5 pt-2 border-t border-white/10">
                <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Гарнитура (Шрифт)</div>
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto custom-scrollbar pr-0.5">
                    {FONT_PRESETS.map((font) => (
                        <button
                            key={font.id}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-left transition-all ${
                                (currentFont || 'Inter, sans-serif') === font.id
                                    ? 'bg-[var(--accent-blue)]/20 border-[var(--accent-blue)] text-white font-medium'
                                    : 'bg-black/20 border-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
                            }`}
                            onClick={() => onFontChange(font.id)}
                        >
                            <span className="text-xs truncate" style={{ fontFamily: font.id }}>{font.label}</span>
                            <span className="text-[10px] text-gray-400 font-mono">{font.category}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

// source сообщает вызывающему, ЧЕМ выбран цвет: 'preset'/'eyedropper' — выбор
// завершён, поповер можно закрывать; 'input' — нативный пикер шлёт change на
// каждое движение ползунка, и закрытие на первом же событии обрывало подбор.
const ColorPickerPopover = ({ currentColor, onColorChange, title = 'Выбор цвета', leftClass = 'left-0', showHex = true }) => {
    return (
        <div className={`absolute ${leftClass} top-12 w-64 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-xl p-3 shadow-2xl z-50 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-150`}>
            <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">{title}</div>
            <div className="grid grid-cols-7 gap-1.5">
                {COLOR_PRESETS.map((c) => (
                    <button
                        key={c}
                        className={`w-6 h-6 rounded-md border transition-all hover:scale-110 ${
                            (currentColor || '').toLowerCase() === c.toLowerCase()
                                ? 'border-white ring-2 ring-[var(--accent-blue)] scale-105'
                                : 'border-white/20 hover:border-white'
                        }`}
                        style={{ backgroundColor: c }}
                        onClick={() => onColorChange(c, 'preset')}
                    />
                ))}
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                <span className="text-[11px] text-gray-400">Свой цвет:</span>
                <input
                    type="color"
                    className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
                    value={currentColor && currentColor.startsWith('#') && currentColor.length === 7 ? currentColor : '#888888'}
                    onChange={(e) => onColorChange(e.target.value, 'input')}
                />
                {window.EyeDropper && (
                    <button
                        className="w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 border border-white/10 transition-colors"
                        title="Пипетка: взять цвет с экрана"
                        onClick={async () => {
                            try {
                                const res = await new window.EyeDropper().open();
                                onColorChange(res.sRGBHex, 'eyedropper');
                            } catch (err) { /* отмена пипетки */ }
                        }}
                    >
                        <div className="icon-pipette text-xs"></div>
                    </button>
                )}
                {showHex && (
                    <span className="text-[10px] font-mono text-gray-400 flex-1 truncate">{currentColor || '#1a1a1a'}</span>
                )}
            </div>
        </div>
    );
};

const IconPickerPopover = ({ currentIcon, onIconChange, leftClass = 'left-48' }) => {
    return (
        <div className={`absolute ${leftClass} top-12 w-64 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-xl p-3 shadow-2xl z-50 flex flex-col gap-2 max-h-64 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150`}>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Иконка Lucide</div>
            <div className="grid grid-cols-5 gap-1.5">
                {ICON_PRESETS.map((item) => (
                    <button
                        key={item.id}
                        className={`h-8 rounded flex flex-col items-center justify-center transition-colors border ${
                            currentIcon === item.id 
                                ? 'bg-[var(--accent-blue)]/30 border-[var(--accent-blue)] text-white' 
                                : 'bg-black/20 border-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                        }`}
                        title={item.label}
                        onClick={() => onIconChange(item.id)}
                    >
                        {item.icon ? <div className={`${item.icon} text-sm`}></div> : <span className="text-[9px]">Нет</span>}
                    </button>
                ))}
            </div>

            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-1 pt-1 border-t border-white/10">Эмодзи</div>
            <div className="grid grid-cols-5 gap-1.5">
                {EMOJI_PRESETS.map((emoji) => (
                    <button
                        key={emoji}
                        className={`h-8 rounded flex items-center justify-center text-sm transition-colors border ${
                            currentIcon === emoji 
                                ? 'bg-[var(--accent-blue)]/30 border-[var(--accent-blue)]' 
                                : 'bg-black/20 border-white/5 hover:bg-white/10'
                        }`}
                        onClick={() => onIconChange(emoji)}
                    >
                        {emoji}
                    </button>
                ))}
            </div>
        </div>
    );
};

function ContextActionBar() {
    const { state: rootState, dispatch: rawDispatch } = useStore();
    const [activePopover, setActivePopover] = React.useState(null); // 'color' | 'media' | 'layer' | 'icon' | 'edge' | 'typography' | null
    const barRef = React.useRef(null);
    // Импорт/экспорт проекта переехали сюда из тулбара (панель свойств проекта).
    const projectFileInputRef = React.useRef(null);

    // Определяем, какому проекту принадлежит выбранный элемент
    const selectedPid = React.useMemo(() => {
        const firstId = rootState.selectedIds && rootState.selectedIds[0];
        if (!firstId) return rootState.activeProjectId;
        if (typeof firstId === 'string' && firstId.startsWith('project:')) return firstId.slice(8);
        for (const pid of (rootState.projectOrder || [])) {
            const p = rootState.projects && rootState.projects[pid];
            if (p && ((p.nodes && p.nodes[firstId]) || (p.layers && p.layers[firstId]) || (p.ports && p.ports[firstId]) || (p.links && p.links[firstId]) || (p.levelWindows && p.levelWindows[firstId]))) {
                return pid;
            }
        }
        return rootState.activeProjectId;
    }, [rootState.selectedIds, rootState.projects, rootState.projectOrder, rootState.activeProjectId]);

    const state = React.useMemo(() => {
        if (!selectedPid) return rootState;
        if (typeof getProjectFlatView === 'function') {
            return getProjectFlatView(selectedPid);
        }
        return rootState;
    }, [selectedPid, rootState]);

    const dispatch = React.useCallback((action) => {
        if (!action) return action;
        if (selectedPid && selectedPid !== rootState.activeProjectId && action.type !== 'FOR_PROJECT' && action.type !== 'SET_ACTIVE_PROJECT' && action.type !== 'TOGGLE_SELECTED' && action.type !== 'SET_SELECTED' && action.type !== 'CLEAR_SELECTION') {
            return rawDispatch({
                type: 'FOR_PROJECT',
                payload: {
                    projectId: selectedPid,
                    action
                }
            });
        }
        return rawDispatch(action);
    }, [selectedPid, rootState.activeProjectId, rawDispatch]);

    const { selectedIds, nodes, layers, ports, links } = state;

    const handleExportProject = () => {
        // Экспортируется АКТИВНЫЙ проект (плоский формат, обратно совместимый);
        // окна уровней и настройки проекта включены для точного восстановления

        // externalGateways (Фаза 6.2): живые crossProjectLinks, задевающие
        // ЭТОТ проект, не входят в его собственный `links` (глобальное поле) —
        // без этого шага половина связи молча терялась бы при экспорте одного
        // проекта. Каждая запись — воспроизводимый «разрыв»: тот же linkId,
        // что был у живой связи, чтобы повторный импорт ОБЕИХ половин (в любом
        // порядке) мог собрать связь заново (reconcilePendingGateways).
        const H = window.HierarchyUtils;
        const externalGateways = [];
        Object.values(rootState.crossProjectLinks || {}).forEach(link => {
            if (!link) return;
            const isSource = link.sourceProjectId === selectedPid;
            if (!isSource && link.targetProjectId !== selectedPid) return;
            const portId = isSource ? link.sourcePortId : link.targetPortId;
            const remoteProjectId = isSource ? link.targetProjectId : link.sourceProjectId;
            const remotePortId = isSource ? link.targetPortId : link.sourcePortId;
            const remoteProj = rootState.projects && rootState.projects[remoteProjectId];
            const remotePort = remoteProj && remoteProj.ports && remoteProj.ports[remotePortId];

            let edge = 'right';
            let fraction = 0.5;
            const myPort = state.ports && state.ports[portId];
            const myNode = myPort && ((state.nodes && state.nodes[myPort.nodeId]) || (state.layers && state.layers[myPort.nodeId]));
            if (H && myNode) {
                const lvl = H.getEntityLevel(myNode.id, state.nodes, state.layers, state.levelWindows);
                const win = H.getWindowOfLevel(lvl, state.levelWindows);
                const proxy = win ? H.getExternalProxyForLink(link.id, win.id, selectedPid, rootState) : null;
                if (proxy) { edge = proxy.edge; fraction = proxy.slotFraction; }
            }

            externalGateways.push({
                linkId: link.id, portId,
                direction: isSource ? 'out' : 'in',
                remoteProjectId, remotePortId,
                remoteProjectName: (remoteProj && remoteProj.projectName) || '',
                remotePortName: (remotePort && remotePort.name) || '',
                linkStyle: link.linkStyle, color: link.color, name: link.name, content: link.content,
                edge, fraction
            });
        });

        const data = {
            formatVersion: state.formatVersion || 10,
            layers: state.layers,
            nodes: state.nodes,
            ports: state.ports,
            links: state.links,
            levelWindows: state.levelWindows,
            levelViews: state.levelViews,
            projectName: state.projectName,
            projectColor: state.projectColor,
            projectFontFamily: state.projectFontFamily,
            projectContent: state.projectContent,
            canvas: state.canvas,
            ...(externalGateways.length ? { externalGateways } : {})
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `architector_project_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleImportProject = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.nodes && data.ports && data.links) {
                    // Импорт ДОБАВЛЯЕТ новый проект на общий холст (правее
                    // существующих), а не заменяет текущий
                    dispatch({ type: 'ADD_PROJECT_FROM_FILE', payload: data });
                } else {
                    console.error('Некорректный файл проекта');
                }
            } catch (err) {
                console.error('Ошибка чтения файла', err);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    // Закрытие выпадающих поповеров при клике вне панели
    React.useEffect(() => {
        if (!activePopover) return;
        const handleOutside = (e) => {
            if (barRef.current && !barRef.current.contains(e.target)) {
                setActivePopover(null);
            }
        };
        window.addEventListener('mousedown', handleOutside);
        return () => window.removeEventListener('mousedown', handleOutside);
    }, [activePopover]);

    // Сброс активного поповера при смене выделения
    React.useEffect(() => {
        setActivePopover(null);
    }, [selectedIds]);

    if (!selectedIds || selectedIds.length === 0) {
        return null;
    }

    // === 0. МАССОВОЕ ВЫДЕЛЕНИЕ КОНТЕЙНЕРОВ (проекты и уровни) ===
    // Классы взаимоисключающи, поэтому здесь либо только контейнеры, либо
    // только сущности графа — панель всегда однозначна.
    const isContainerId = (sid) => typeof sid === 'string' && (
        sid === 'project' || sid.startsWith('project:') || sid.startsWith('window:') || sid.startsWith('level-window-')
    );
    if (selectedIds.length > 1 && selectedIds.some(isContainerId)) {
        const pickedProjects = [];
        const pickedWindows = [];
        selectedIds.forEach(sid => {
            if (typeof sid !== 'string') return;
            if (sid === 'project') {
                if (state.activeProjectId) pickedProjects.push(state.activeProjectId);
            } else if (sid.startsWith('project:')) {
                pickedProjects.push(sid.slice('project:'.length));
            } else if (sid.startsWith('window:')) {
                pickedWindows.push(sid.slice('window:'.length));
            } else if (sid.startsWith('level-window-')) {
                const idx = parseInt(sid.slice('level-window-'.length), 10);
                const win = Object.values(state.levelWindows || {}).find(w => w && w.levelIndex === idx);
                if (win) pickedWindows.push(win.id);
            }
        });

        const projCount = pickedProjects.length;
        const winCount = pickedWindows.length;
        const ci = state.containerIsolation || { projectIds: [], windowIds: [] };
        const allIsolated = (projCount > 0 || winCount > 0)
            && pickedProjects.every(pid => (ci.projectIds || []).includes(pid))
            && pickedWindows.every(wid => (ci.windowIds || []).includes(wid));

        const applyToAll = (fn) => { pickedProjects.forEach(pid => fn('project', pid)); pickedWindows.forEach(wid => fn('window', wid)); };

        const handleIsolate = () => {
            if (allIsolated) {
                dispatch({ type: 'CLEAR_CONTAINER_ISOLATION' });
                return;
            }
            dispatch({ type: 'SET_CONTAINER_ISOLATION', payload: { projectIds: pickedProjects, windowIds: pickedWindows } });
        };

        // Окно может принадлежать НЕактивному проекту: ищем его владельца по
        // всем проектам (id окон уникальны между проектами)
        const ownerOfWindow = (wid) => {
            const projects = state.projects || {};
            return Object.keys(projects).find(pid => projects[pid].levelWindows && projects[pid].levelWindows[wid]) || null;
        };
        const windowInfo = (wid) => {
            const pid = ownerOfWindow(wid);
            if (!pid) return null;
            const win = state.projects[pid].levelWindows[wid];
            return win ? { projectId: pid, levelIndex: win.levelIndex } : null;
        };
        // FOR_PROJECT доставляет экшен в конкретный проект, не делая его активным:
        // иначе массовая правка дёргала бы камеру и выделение пользователя
        const toProject = (pid, action) => dispatch({ type: 'FOR_PROJECT', payload: { projectId: pid, action } });

        const handleColor = (color) => {
            pickedProjects.forEach(pid => toProject(pid, {
                type: 'UPDATE_PROJECT_PROPERTIES', payload: { updates: { projectColor: color } }
            }));
            pickedWindows.forEach(wid => {
                const info = windowInfo(wid);
                if (info) toProject(info.projectId, {
                    type: 'UPDATE_LEVEL_PROPERTIES', payload: { index: info.levelIndex, updates: { color } }
                });
            });
        };

        const handleFont = (updates) => {
            if (updates.fontFamily) {
                pickedProjects.forEach(pid => toProject(pid, {
                    type: 'UPDATE_PROJECT_PROPERTIES', payload: { updates: { projectFontFamily: updates.fontFamily } }
                }));
            }
            pickedWindows.forEach(wid => {
                const info = windowInfo(wid);
                if (info) toProject(info.projectId, {
                    type: 'UPDATE_LEVEL_PROPERTIES', payload: { index: info.levelIndex, updates }
                });
            });
        };

        const handleAlign = () => {
            // Выравниваются окна тех проектов, что задеты выделением: выстраивать
            // «через одно» окна внутри проекта бессмысленно — уровни идут лестницей
            const projectsToAlign = new Set(pickedProjects);
            pickedWindows.forEach(wid => {
                const pid = ownerOfWindow(wid);
                if (pid) projectsToAlign.add(pid);
            });
            projectsToAlign.forEach(pid => toProject(pid, { type: 'ALIGN_LEVEL_WINDOWS' }));
        };

        const handleDelete = () => {
            const parts = [];
            if (projCount > 0) parts.push(`проектов: ${projCount} (со всем содержимым, БЕЗВОЗВРАТНО — межпроектной истории нет)`);
            if (winCount > 0) parts.push(`уровней: ${winCount} (нижние уровни поднимутся, Главный холст не удаляется)`);
            if (window.confirm(`Удалить ${parts.join('; ')}?`)) {
                dispatch({ type: 'DELETE_SELECTED' });
            }
        };

        return (
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[794px] max-w-[calc(100vw-2rem)]">
                <div className="glass-panel bg-[#0d1017]/95 backdrop-blur-md rounded-2xl shadow-2xl border border-[#2a2a2a] p-3 flex flex-col gap-2.5">
                    <div className="flex items-center gap-2.5">
                        <div className="w-[110px] shrink-0 px-2 py-1 rounded-lg text-[11px] font-bold text-center bg-amber-500/20 text-amber-200 border border-amber-500/40">
                            Контейнеры
                        </div>
                        <div className="text-sm text-gray-200 font-semibold">
                            Выбрано: {projCount > 0 ? `проектов ${projCount}` : ''}{projCount > 0 && winCount > 0 ? ', ' : ''}{winCount > 0 ? `уровней ${winCount}` : ''}
                        </div>
                        <div className="flex-1"></div>
                        <button
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                            title="Снять выделение (Esc)"
                            onClick={() => dispatch({ type: 'SET_SELECTED', payload: null })}
                        >
                            <div className="icon-x text-sm"></div>
                        </button>
                    </div>

                    <div className="flex items-center gap-2 relative">
                        <button
                            className="w-10 h-10 rounded-xl flex items-center justify-center bg-black/40 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                            title="Цвет: плашки проектов и рамки окон. Содержимое не затрагивается"
                            onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}
                        >
                            <div className="icon-palette text-lg"></div>
                        </button>
                        <button
                            className="w-10 h-10 rounded-xl flex items-center justify-center bg-black/40 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                            title="Шрифт заголовков. Содержимое не затрагивается"
                            onClick={() => setActivePopover(activePopover === 'typography' ? null : 'typography')}
                        >
                            <div className="icon-type text-lg"></div>
                        </button>
                        <button
                            className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${
                                allIsolated
                                    ? 'bg-amber-500/25 border-amber-400/60 text-amber-200'
                                    : 'bg-black/40 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
                            }`}
                            title={allIsolated
                                ? 'Изоляция включена: на холсте видно только выбранное. Клик — показать всё'
                                : 'Изолировать выбранное: скрыть с холста всё остальное'}
                            onClick={handleIsolate}
                        >
                            <div className={`text-lg ${allIsolated ? 'icon-scan' : 'icon-scan-line'}`}></div>
                        </button>
                        <button
                            className="w-10 h-10 rounded-xl flex items-center justify-center bg-black/40 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                            title="Выровнять окна уровней"
                            onClick={handleAlign}
                        >
                            <div className="icon-align-vertical-justify-center text-lg"></div>
                        </button>
                        <div className="flex-1"></div>
                        <button
                            className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-900/30 border border-red-700/40 text-red-300 hover:text-red-100 hover:bg-red-800/50 transition-colors"
                            title="Удалить выбранные контейнеры"
                            onClick={handleDelete}
                        >
                            <div className="icon-trash text-lg"></div>
                        </button>

                        {activePopover === 'color' && (
                            <ColorPickerPopover
                                title="Цвет контейнеров"
                                currentColor={'#1a1a1a'}
                                onColorChange={(c, source) => { handleColor(c); if (source !== 'input') setActivePopover(null); }}
                                leftClass="left-0"
                                showHex={false}
                            />
                        )}
                        {activePopover === 'typography' && (
                            <TypographyPopover
                                currentFont={'Inter, sans-serif'}
                                currentSize={14}
                                onFontChange={(f) => handleFont({ fontFamily: f })}
                                onSizeChange={(sz) => handleFont({ fontSize: sz })}
                                leftClass="left-12"
                            />
                        )}
                    </div>

                    <div className="text-[10px] text-gray-500">
                        Правки оформления применяются к самим контейнерам — плашкам проектов и рамкам окон.
                        Узлы, слои и порты внутри не затрагиваются.
                    </div>
                </div>
            </div>
        );
    }

    // === 1. РЕЖИМ МАССОВОГО ВЫДЕЛЕНИЯ ===
    if (selectedIds.length > 1) {
        const selectedItems = selectedIds.map(id => {
            if (nodes[id]) return { type: 'Узел', icon: 'icon-box', data: nodes[id] };
            if (layers && layers[id]) return { type: 'Слой', icon: 'icon-layers', data: layers[id] };
            if (ports[id]) return { type: 'Порт', icon: 'icon-circle', data: ports[id] };
            const l = links ? links[id] : null;
            if (l) return { type: 'Связь', icon: 'icon-git-commit', data: l };
            return null;
        }).filter(Boolean);

        const isAllNodes = selectedItems.length > 0 && selectedItems.every(i => i.type === 'Узел');
        const isAllLinks = selectedItems.length > 0 && selectedItems.every(i => i.type === 'Связь');
        const hasNodesOrLayers = selectedItems.some(i => i.type === 'Узел' || i.type === 'Слой');
        const firstNodeOrLayer = selectedItems.find(i => i.type === 'Узел' || i.type === 'Слой');
        const currentSnap = firstNodeOrLayer ? firstNodeOrLayer.data.snapToGrid : true;
        const firstLink = selectedItems.find(i => i.type === 'Связь');
        const currentLinkStyle = firstLink ? (firstLink.data.linkStyle || 'orthogonal') : 'orthogonal';
        const firstItemWithFont = selectedItems.find(i => i.data.fontFamily || i.data.fontSize);
        const massFont = firstItemWithFont ? firstItemWithFont.data.fontFamily : 'Inter, sans-serif';
        const massFontSize = firstItemWithFont ? firstItemWithFont.data.fontSize : 14;

        const handleMassColorChange = (color) => {
            dispatch({ type: 'MASS_UPDATE', payload: { ids: selectedIds, updates: { color } } });
        };

        const handleMassFontChange = (fontFamily) => {
            dispatch({ type: 'MASS_UPDATE', payload: { ids: selectedIds, updates: { fontFamily } } });
        };

        const handleMassSizeChange = (fontSize) => {
            dispatch({ type: 'MASS_UPDATE', payload: { ids: selectedIds, updates: { fontSize } } });
        };

        const handleMassLayerChange = (parentId) => {
            // v13: REPARENT_ENTITY принимает 'root' точно так же, как id слоя —
            // единая проверка «только верхние» + позиция (то же окно — мировая
            // позиция сохраняется; смена уровня — findFreePosition), больше не
            // нужно вручную дублировать это через MASS_UPDATE.
            const nodeIds = selectedItems.filter(item => item.type === 'Узел').map(i => i.data.id);
            if (nodeIds.length === 0) { setActivePopover(null); return; }
            dispatch({ type: 'REPARENT_ENTITY', payload: { ids: nodeIds, targetParentId: parentId || 'root' } });
            setActivePopover(null);
        };

        return (
            <div 
                ref={barRef}
                className="fixed top-4 left-1/2 -translate-x-1/2 w-full max-w-[794px] z-50 glass-panel bg-[#0d1017]/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl p-2.5 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150"
                data-file="components/ContextActionBar.js"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 1. Верхний ярус: Бейдж массового выделения + Кнопка сброса */}
                <div className="flex items-center justify-between gap-2 px-1">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--accent-blue)]">
                        <div className="icon-list-check text-base"></div>
                        <span>Выбрано элементов: {selectedIds.length}</span>
                    </div>
                    <button 
                        className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                        onClick={() => dispatch({ type: 'SET_SELECTED', payload: null })}
                        title="Снять выделение (Esc)"
                    >
                        <div className="icon-x text-sm"></div>
                    </button>
                </div>

                {/* 2. Средний ярус: Кнопки массовых действий (40x40px) */}
                <div className="flex items-center gap-1 relative border-t border-b border-white/10 py-1.5 px-0.5">
                    {/* Массовый цвет */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'color' ? 'bg-white/20 text-white border-white/30' : 'text-gray-300 hover:text-white'
                        }`}
                        title="Массово изменить цвет"
                        onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}
                    >
                        <div className="icon-palette text-lg text-amber-400"></div>
                    </button>

                    {/* Массовая типографика (Шрифт и Размер) */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'typography' ? 'bg-white/20 text-white border-white/30' : 'text-gray-300 hover:text-white'
                        }`}
                        title="Массово изменить шрифт и размер"
                        onClick={() => setActivePopover(activePopover === 'typography' ? null : 'typography')}
                    >
                        <div className="icon-type text-lg text-indigo-400"></div>
                    </button>

                    {/* Массовый слой (для узлов) */}
                    {isAllNodes && (
                        <button
                            className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                                activePopover === 'layer' ? 'bg-white/20 text-white border-white/30' : 'text-gray-300 hover:text-white'
                            }`}
                            title="Массово назначить на слой"
                            onClick={() => setActivePopover(activePopover === 'layer' ? null : 'layer')}
                        >
                            <div className="icon-layers text-lg text-sky-400"></div>
                        </button>
                    )}

                    {/* Массовая привязка к сетке */}
                    {hasNodesOrLayers && (
                        <button
                            className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                                currentSnap ? 'text-[var(--accent-blue)]' : 'text-gray-500'
                            }`}
                            title={currentSnap ? 'Сетка включена для всех (клик — выключить)' : 'Сетка выключена для всех (клик — включить)'}
                            onClick={() => dispatch({ type: 'MASS_UPDATE', payload: { ids: selectedIds, updates: { snapToGrid: !currentSnap } } })}
                        >
                            <div className="icon-layout-grid text-lg"></div>
                        </button>
                    )}

                    {/* Массовый стиль связей */}
                    {isAllLinks && (
                        <button
                            className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-gray-300 hover:text-white"
                            title={`Стиль связей: ${currentLinkStyle === 'orthogonal' ? 'Ортогональный (клик — Безье)' : 'Безье (клик — Ортогональный)'}`}
                            onClick={() => dispatch({ type: 'MASS_UPDATE', payload: { ids: selectedIds, updates: { linkStyle: currentLinkStyle === 'orthogonal' ? 'bezier' : 'orthogonal' } } })}
                        >
                            {currentLinkStyle === 'orthogonal' ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent-blue)]">
                                    <path d="M4 19h8v-14h8" />
                                    <circle cx="4" cy="19" r="2" fill="currentColor" />
                                    <circle cx="20" cy="5" r="2" fill="currentColor" />
                                </svg>
                            ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400">
                                    <path d="M4 19 C 10 19, 14 5, 20 5" />
                                    <circle cx="4" cy="19" r="2" fill="currentColor" />
                                    <circle cx="20" cy="5" r="2" fill="currentColor" />
                                </svg>
                            )}
                        </button>
                    )}

                    <div className="flex-1"></div>

                    {/* Массовое удаление */}
                    <button
                        className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/20 border-red-500/30 transition-colors"
                        title={`Удалить все выделенные элементы (${selectedIds.length})`}
                        onClick={() => {
                            if (window.confirm(`Вы уверены, что хотите удалить ${selectedIds.length} элементов?`)) {
                                dispatch({ type: 'DELETE_SELECTED' });
                            }
                        }}
                    >
                        <div className="icon-trash text-lg"></div>
                    </button>

                    {/* Поповер цвета для группы */}
                    {activePopover === 'color' && (
                        <ColorPickerPopover
                            title="Массовый цвет"
                            currentColor={firstItemWithFont?.data?.color || '#1a1a1a'}
                            onColorChange={(c, source) => { handleMassColorChange(c); if (source !== 'input') setActivePopover(null); }}
                            leftClass="left-0"
                            showHex={false}
                        />
                    )}

                    {/* Поповер типографики для группы */}
                    {activePopover === 'typography' && (
                        <TypographyPopover
                            currentFont={massFont}
                            currentSize={massFontSize}
                            onFontChange={handleMassFontChange}
                            onSizeChange={handleMassSizeChange}
                            leftClass="left-6"
                        />
                    )}

                    {/* Поповер слоя для группы */}
                    {activePopover === 'layer' && (
                        <div className="absolute left-16 top-12 w-64 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-xl p-2.5 shadow-2xl z-50 flex flex-col gap-1.5 max-h-56 overflow-y-auto no-scrollbar">
                            <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider px-1">Назначить на слой</div>
                            <button
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-xs text-gray-300 hover:bg-white/10 transition-colors"
                                onClick={() => handleMassLayerChange('root')}
                            >
                                <div className="icon-home text-gray-400 text-xs"></div>
                                <span className="truncate flex-1">Главный холст (Root)</span>
                            </button>
                            {layers && Object.values(layers).map((l) => {
                                // v13: вложение в любой слой валидно по дизайну (уровень наследуется
                                // от слоя, docs/IDEAL_INTERACTIONS.md §2) — нет больше отдельного
                                // «спуска в собственную ветку»: если цель окажется внутри ветки
                                // переносимого узла, REPARENT_ENTITY сама отклонит этот id как цикл
                                // (canReparentTo), молча пропустив его в батче. Здесь остаётся только
                                // предохранитель тумблера DnD для межуровневых переносов.
                                const H = window.HierarchyUtils;
                                const layerLvl = (H && H.getEntityLevel) ? H.getEntityLevel(l.id, nodes, layers, state.levelWindows) : 0;
                                const selNodeIds = selectedItems.filter(i => i.type === 'Узел').map(i => i.data.id);
                                // «Только верхние»: потомки других выделенных едут внутри предков
                                const topNodeIds = selNodeIds.filter(nid => !selNodeIds.some(other =>
                                    other !== nid && H && H.isDescendantOf && H.isDescendantOf(nid, other, nodes, layers)));
                                const hasCross = topNodeIds.some(nid =>
                                    H && H.getEntityLevel && H.getEntityLevel(nid, nodes, layers, state.levelWindows) !== layerLvl);
                                // Межуровневый перенос доступен только в режиме Drag&Drop
                                const dndLocked = hasCross && !(state.ui && state.ui.dragDropMode);
                                return (
                                <button
                                    key={l.id}
                                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-xs transition-colors ${
                                        dndLocked
                                            ? 'text-gray-600 opacity-50 cursor-not-allowed'
                                            : 'text-gray-300 hover:bg-white/10'
                                    }`}
                                    title={dndLocked
                                        ? `Слой на Уровне ${layerLvl}. Включите режим Drag&Drop (кнопка в панели проекта), чтобы переносить между уровнями`
                                        : (hasCross ? `Слой уровня ${layerLvl}: узлы других уровней переедут на него (переносятся только верхние из выделения)` : undefined)}
                                    onClick={() => { if (!dndLocked) handleMassLayerChange(l.id); }}
                                >
                                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: l.color || '#0284c7' }}></div>
                                    <span className="truncate flex-1">{l.name || l.id}</span>
                                    {hasCross && (
                                        <span className="px-1 py-px rounded text-[9px] font-mono bg-sky-500/20 text-sky-300 border border-sky-500/40 shrink-0">L{layerLvl}</span>
                                    )}
                                </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // === 2. РЕЖИМ ЕДИНИЧНОГО ВЫДЕЛЕНИЯ ===
    // Единичное выделение контейнера приводится к форме, которую понимают
    // существующие ветки панели: 'project' и 'level-window-<номер>'. Так новая
    // адресация (project:<id> / window:<id>) не потребовала переписывать их.
    const normalizeSingleContainerId = (raw) => {
        if (typeof raw !== 'string') return raw;
        if (raw.startsWith('project:')) {
            return raw.slice('project:'.length) === state.activeProjectId ? 'project' : raw;
        }
        if (raw.startsWith('window:')) {
            const wid = raw.slice('window:'.length);
            const win = (state.levelWindows || {})[wid];
            return win ? `level-window-${win.levelIndex}` : raw;
        }
        return raw;
    };
    const id = normalizeSingleContainerId(selectedIds[0]);

    // === 0. ВЫДЕЛЕНИЕ ПРОЕКТА (Project Header) ===
    if (id === 'project') {
        const projectName = state.projectName || 'Проект Архитектуры';
        const projectColor = state.projectColor || '#0f172a';
        const projectFontFamily = state.projectFontFamily || 'Inter, sans-serif';
        const projectContent = state.projectContent || '';

        const handleUpdateProject = (field, val, skipHistory = false) => {
            dispatch({
                type: 'UPDATE_PROJECT_PROPERTIES',
                payload: { updates: { [field]: val }, skipHistory }
            });
        };

        return (
            <div ref={barRef} className="fixed top-4 left-1/2 -translate-x-1/2 w-full max-w-[794px] z-50 glass-panel bg-[#0d1017]/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl p-2.5 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150">
                {/* 1. Верхний ярус */}
                <div className="flex items-center gap-2">
                    <div 
                        className="flex items-center justify-center gap-1.5 w-[110px] py-1 rounded-md text-xs font-semibold text-white border shrink-0 shadow-sm"
                        style={{
                            backgroundColor: projectColor || '#059669',
                            borderColor: 'rgba(255,255,255,0.3)'
                        }}
                    >
                        <div className="icon-globe text-xs"></div>
                        <span>Проект</span>
                    </div>
                    <input
                        type="text"
                        className="flex-1 bg-transparent text-gray-100 font-semibold px-2 py-0.5 rounded border border-transparent hover:border-white/10 focus:border-[var(--accent-blue)] focus:bg-black/40 text-sm outline-none transition-all truncate"
                        style={{ fontFamily: projectFontFamily }}
                        value={projectName}
                        onChange={(e) => handleUpdateProject('projectName', e.target.value, true)}
                        onBlur={(e) => handleUpdateProject('projectName', e.target.value, false)}
                        placeholder="Название проекта..."
                    />
                    <button
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                        title="Снять выделение (Esc)"
                        onClick={() => dispatch({ type: 'SET_SELECTED', payload: null })}
                    >
                        <div className="icon-x text-sm"></div>
                    </button>
                </div>

                {/* 2. Средний ярус: Кнопки действий */}
                <div className="flex items-center gap-1 relative border-t border-b border-white/10 py-1.5 px-0.5">
                    {/* Цвет темы проекта */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'color' ? 'bg-white/20 text-white border-white/30' : 'text-gray-300 hover:text-white'
                        }`}
                        title="Цвет темы проекта"
                        onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}
                    >
                        <div className="w-5 h-5 rounded-md border border-white/40 shadow-sm" style={{ backgroundColor: projectColor }}></div>
                    </button>

                    {/* Типографика проекта */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'typography' ? 'bg-white/20 text-white border-white/30' : 'text-gray-300 hover:text-white'
                        }`}
                        title={`Шрифт проекта: ${projectFontFamily}`}
                        onClick={() => setActivePopover(activePopover === 'typography' ? null : 'typography')}
                    >
                        <div className="icon-type text-lg"></div>
                    </button>

                    {/* Выровнять окна уровней */}
                    <button
                        className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                        title="Выровнять окна уровней вертикально"
                        onClick={() => dispatch({ type: 'ALIGN_LEVEL_WINDOWS' })}
                    >
                        <div className="icon-layout-grid text-lg text-sky-400"></div>
                    </button>

                    {/* Импорт проекта: переехал из тулбара */}
                    <button
                        className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                        title="Импорт проекта"
                        onClick={() => projectFileInputRef.current?.click()}
                    >
                        <div className="icon-upload text-lg"></div>
                    </button>
                    <input
                        type="file"
                        ref={projectFileInputRef}
                        className="hidden"
                        accept=".json"
                        onChange={handleImportProject}
                    />

                    {/* Экспорт проекта: переехал из тулбара */}
                    <button
                        className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                        title="Экспорт проекта"
                        onClick={handleExportProject}
                    >
                        <div className="icon-download text-lg"></div>
                    </button>

                    <div className="flex-1"></div>

                    {/* Удалить проект: полностью, включая все уровни и плашку */}
                    <button
                        className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/20 border-red-500/30 transition-colors"
                        title="Удалить проект полностью: все уровни, их содержимое и плашка проекта"
                        onClick={() => {
                            if (window.confirm('Проект будет удалён ПОЛНОСТЬЮ — все уровни, их содержимое и плашка проекта. Действие нельзя отменить (Ctrl+Z не вернёт проект). Продолжить?')) {
                                dispatch({ type: 'REMOVE_PROJECT', payload: { id: state.activeProjectId } });
                            }
                        }}
                    >
                        <div className="icon-trash text-lg"></div>
                    </button>

                    {/* Поповер цвета */}
                    {activePopover === 'color' && (
                        <ColorPickerPopover
                            title="Цвет темы проекта"
                            currentColor={projectColor}
                            onColorChange={(c) => { handleUpdateProject('projectColor', c); }}
                            leftClass="left-0"
                        />
                    )}

                    {/* Поповер типографики */}
                    {activePopover === 'typography' && (
                        <TypographyPopover
                            currentFont={projectFontFamily}
                            currentSize={14}
                            onFontChange={(f) => handleUpdateProject('projectFontFamily', f)}
                            onSizeChange={() => {}}
                            leftClass="left-10"
                        />
                    )}
                </div>

                {/* 3. Нижний ярус: Описание */}
                <div className="flex flex-col gap-1 px-0.5">
                    <ContextDescriptionInput 
                        placeholder="Общее описание проекта или архитектуры..."
                        value={projectContent}
                        onChange={(e) => handleUpdateProject('projectContent', e.target.value)}
                    />
                </div>
            </div>
        );
    }

    // === 0.1 ВЫДЕЛЕНИЕ ОКНА УРОВНЯ (Level Window Header) ===
    if (typeof id === 'string' && id.startsWith('level-window-')) {
        const levelIndex = parseInt(id.replace('level-window-', ''), 10);
        const win = (window.HierarchyUtils && window.HierarchyUtils.getWindowOfLevel(levelIndex, state.levelWindows)) || {
            index: levelIndex,
            name: levelIndex === 0 ? 'Главный холст' : `Уровень ${levelIndex}`,
            color: '#1e293b',
            content: '',
            fontFamily: 'Inter, sans-serif',
            fontSize: 14
        };

        const handleUpdateLevelWin = (field, val, skipHistory = false) => {
            dispatch({
                type: 'UPDATE_LEVEL_PROPERTIES',
                payload: { index: levelIndex, updates: { [field]: val }, skipHistory }
            });
        };

        const isIsolated = state.levelHideNeighbors && state.levelHideNeighbors[levelIndex];

        // Выравнивание слоёв: переехало из тулбара. Контекст (какая именно
        // ветка уровня выравнивается) берём из того же резолвера, которым
        // пользуются кнопки добавления в тулбаре — раз панель уровня открыта,
        // selectedIds[0] === 'level-window-K', и getAddContext вернёт
        // parentId нужной ветки этого уровня (или ok:false при нескольких
        // ветках на уровне — тогда, как и у кнопок добавления, действие лучше
        // не применять вслепую).
        const H = window.HierarchyUtils;
        const alignCtx = H ? H.getAddContext(state) : { ok: true, parentId: 'root' };
        const alignContextId = alignCtx.parentId || 'root';
        const layersInContext = Object.values(state.layers || {})
            .filter(l => (l.parentId || 'root') === alignContextId).length;
        const canAlignLayers = alignCtx.ok && layersInContext >= 2;

        return (
            <div ref={barRef} className="fixed top-4 left-1/2 -translate-x-1/2 w-full max-w-[794px] z-50 glass-panel bg-[#0d1017]/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl p-2.5 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150">
                {/* 1. Верхний ярус */}
                <div className="flex items-center gap-2">
                    <div
                        className="flex items-center justify-center gap-1.5 w-[110px] py-1 rounded-md text-xs font-semibold shrink-0 border border-white/10 text-gray-100 shadow-sm"
                        style={{ backgroundColor: win.color || '#191c23' }}
                    >
                        <div className="icon-folder text-xs"></div>
                        <span>Уровень {levelIndex}</span>
                    </div>
                    <input
                        type="text"
                        className="flex-1 bg-transparent text-gray-100 font-semibold px-2 py-0.5 rounded border border-transparent hover:border-white/10 focus:border-[var(--accent-blue)] focus:bg-black/40 text-sm outline-none transition-all truncate"
                        style={{ fontFamily: win.fontFamily || 'Inter, sans-serif' }}
                        value={win.name || ''}
                        onChange={(e) => handleUpdateLevelWin('name', e.target.value, true)}
                        onBlur={(e) => handleUpdateLevelWin('name', e.target.value, false)}
                        placeholder="Название уровня..."
                    />
                    <button
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                        title="Снять выделение (Esc)"
                        onClick={() => dispatch({ type: 'SET_SELECTED', payload: null })}
                    >
                        <div className="icon-x text-sm"></div>
                    </button>
                </div>

                {/* 2. Средний ярус */}
                <div className="flex items-center gap-1 relative border-t border-b border-white/10 py-1.5 px-0.5">
                    {/* Цвет шапки и контура окна */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'color' ? 'bg-white/20 text-white border-white/30' : 'text-gray-300 hover:text-white'
                        }`}
                        title="Цвет шапки и контура окна"
                        onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}
                    >
                        <div className="w-5 h-5 rounded-md border border-white/40 shadow-sm" style={{ backgroundColor: win.color || '#1e293b' }}></div>
                    </button>

                    {/* Типографика окна */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'typography' ? 'bg-white/20 text-white border-white/30' : 'text-gray-300 hover:text-white'
                        }`}
                        title={`Шрифт: ${win.fontFamily || 'Inter'} (${win.fontSize || 14}px)`}
                        onClick={() => setActivePopover(activePopover === 'typography' ? null : 'typography')}
                    >
                        <div className="icon-type text-lg"></div>
                    </button>

                    {/* Тогл Глаз: Изоляция ветки */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            isIsolated ? 'text-amber-400 bg-amber-500/20 border-amber-500/30' : 'text-gray-400 hover:text-white'
                        }`}
                        title={levelIndex === 0
                            ? (isIsolated
                                ? 'Глобальная изоляция включена: на всех уровнях видны только ветки выделенных родителей. Клик — показать всё'
                                : 'Просветить ветки выделенных родителей на всех уровнях (скрыть остальные)')
                            : (isIsolated
                                ? 'Изоляция ветки включена (чужие ветки уровня скрыты). Клик — показать всех'
                                : 'Показать только ветки выделенных узлов этого уровня')}
                        onClick={() => dispatch({ type: 'TOGGLE_LEVEL_NEIGHBORS', payload: { levelIndex } })}
                    >
                        <div className={`text-lg ${isIsolated ? 'icon-eye-off' : 'icon-eye'}`}></div>
                    </button>

                    {/* Тогл Свернуть/Развернуть окно */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            win.isCollapsed ? 'text-sky-400 bg-sky-500/20' : 'text-gray-400 hover:text-white'
                        }`}
                        title={win.isCollapsed ? 'Развернуть окно' : 'Свернуть окно до шапки'}
                        onClick={() => dispatch({ type: 'TOGGLE_LEVEL_COLLAPSE', payload: { index: levelIndex } })}
                    >
                        <div className={`text-lg ${win.isCollapsed ? 'icon-maximize' : 'icon-minimize'}`}></div>
                    </button>

                    {/* Выровнять слои уровня: переехало из тулбара */}
                    {canAlignLayers && (
                        <button
                            className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-cyan-400 hover:text-cyan-300 hover:bg-white/5 transition-colors"
                            title="Выровнять слои этого уровня"
                            onClick={() => dispatch({
                                type: 'ALIGN_LAYERS',
                                payload: { contextId: alignContextId }
                            })}
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 2v20" strokeDasharray="2 2" opacity="0.5" />
                                <rect x="7" y="3" width="13" height="4" rx="1" fill="currentColor" fillOpacity="0.25" />
                                <rect x="7" y="10" width="10" height="4" rx="1" fill="currentColor" fillOpacity="0.25" />
                                <rect x="7" y="17" width="14" height="4" rx="1" fill="currentColor" fillOpacity="0.25" />
                            </svg>
                        </button>
                    )}

                    <div className="flex-1"></div>

                    {/* Очистить уровень: удаляются только элементы САМОГО уровня.
                        Потомки выживают: пере-якорятся на ближайшего живого предка
                        («связь через поколение») или становятся сиротами со своими ветками. */}
                    <button
                        className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-amber-400 hover:text-amber-300 hover:bg-amber-500/20 border-amber-500/30 transition-colors"
                        title={levelIndex === 0
                            ? 'Очистить Главный холст: его элементы удалятся, потомки на Уровне 1 станут сиротами и сохранят свои ветки'
                            : `Очистить Уровень ${levelIndex}: его элементы удалятся, потомки останутся на своих уровнях (связь через поколение)`}
                        onClick={() => {
                            const msg = levelIndex === 0
                                ? 'Очистить Главный холст? Его элементы будут удалены, а их дети на Уровне 1 станут сиротами, сохранив свои ветки.'
                                : `Очистить Уровень ${levelIndex}? Его элементы будут удалены, потомки останутся на своих уровнях и привяжутся к предкам через поколение. Окно уровня останется.`;
                            if (window.confirm(msg)) {
                                dispatch({ type: 'CLEAR_LEVEL_WINDOW', payload: { index: levelIndex } });
                            }
                        }}
                    >
                        <div className="icon-eraser text-lg"></div>
                    </button>

                    {/* Удалить уровень / Удалить холст */}
                    {levelIndex > 0 ? (
                        <button
                            className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/20 border-red-500/30 transition-colors"
                            title={`Удалить Уровень ${levelIndex} (его элементы удалятся, потомки и уровни ниже поднимутся на один)`}
                            onClick={() => {
                                const msg = `Удалить Уровень ${levelIndex}? Его элементы будут удалены, а потомки и уровни ниже поднимутся на один (Уровень ${levelIndex + 1} станет Уровнем ${levelIndex}).`;
                                if (window.confirm(msg)) {
                                    dispatch({ type: 'REMOVE_LEVEL_WINDOW', payload: { index: levelIndex } });
                                }
                            }}
                        >
                            <div className="icon-trash text-lg"></div>
                        </button>
                    ) : (() => {
                        // «Удалить холст»: без других уровней кнопка неактивна.
                        // Подтверждения нет намеренно — операция откатывается Undo.
                        const hasLowerLevels = Object.values(state.levelWindows || {}).some(w => w && w.levelIndex > 0);
                        return (
                            <button
                                className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center border-red-500/30 transition-colors ${
                                    hasLowerLevels
                                        ? 'text-red-400 hover:text-red-300 hover:bg-red-500/20'
                                        : 'text-gray-600 opacity-40 cursor-not-allowed'
                                }`}
                                disabled={!hasLowerLevels}
                                title={hasLowerLevels
                                    ? 'Удалить холст: Главный холст и его элементы удалятся, Уровень 1 станет Главным холстом (имя и цвет сохранятся), потомки поднимутся на уровень вверх. Отменяется через Undo (Ctrl+Z)'
                                    : 'Удалить холст нельзя: других уровней нет'}
                                onClick={() => {
                                    if (!hasLowerLevels) return;
                                    dispatch({ type: 'REMOVE_ROOT_CANVAS' });
                                }}
                            >
                                <div className="icon-trash text-lg"></div>
                            </button>
                        );
                    })()}

                    {/* Поповер цвета окна */}
                    {activePopover === 'color' && (
                        <ColorPickerPopover
                            title="Цвет шапки и контура"
                            currentColor={win.color || '#1e293b'}
                            onColorChange={(c) => { handleUpdateLevelWin('color', c); }}
                            leftClass="left-0"
                        />
                    )}

                    {/* Поповер типографики окна */}
                    {activePopover === 'typography' && (
                        <TypographyPopover
                            currentFont={win.fontFamily}
                            currentSize={win.fontSize}
                            onFontChange={(f) => handleUpdateLevelWin('fontFamily', f)}
                            onSizeChange={(s) => handleUpdateLevelWin('fontSize', s)}
                            leftClass="left-10"
                        />
                    )}
                </div>

                {/* 3. Нижний ярус: Описание уровня */}
                <div className="flex flex-col gap-1 px-0.5">
                    <ContextDescriptionInput 
                        placeholder="Скрытое описание назначения данного уровня..."
                        value={win.content || ''}
                        onChange={(e) => handleUpdateLevelWin('content', e.target.value)}
                    />
                </div>
            </div>
        );
    }

    const selectedNode = nodes[id];
    const selectedLink = links ? links[id] : null;
    const selectedPort = ports[id];
    const selectedLayer = layers ? layers[id] : null;

    if (!selectedNode && !selectedLink && !selectedPort && !selectedLayer) return null;

    // === А. ЕДИНИЧНЫЙ УЗЕЛ (Node) ===
    if (selectedNode) {
        const handleUpdateField = (field, value, skipHistory = false) => {
            dispatch({
                type: 'UPDATE_NODE',
                payload: { id: selectedNode.id, updates: { [field]: value }, skipHistory }
            });
        };

        const handleLayerChange = (targetLayerId) => {
            if (targetLayerId !== 'root' && layers && layers[targetLayerId]) {
                const targetLayer = layers[targetLayerId];
                const { updatesById, newLayerSize } = window.GeometryUtils.getSmartPlacement(
                    [selectedNode], targetLayer, nodes, layers
                );
                dispatch({ type: 'UPDATE_LAYER', payload: { id: targetLayerId, updates: { size: newLayerSize } } });
                dispatch({ type: 'UPDATE_NODE', payload: {
                    id: selectedNode.id,
                    updates: updatesById[selectedNode.id] || { parentId: targetLayerId, position: { x: 40, y: 90 } }
                }});
            } else {
                dispatch({ type: 'REPARENT_ENTITY', payload: { id: selectedNode.id, newParentId: 'root' } });
            }
            setActivePopover(null);
        };

        return (
            <div 
                ref={barRef}
                className="fixed top-4 left-1/2 -translate-x-1/2 w-full max-w-[794px] z-50 glass-panel bg-[#0d1017]/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl p-2.5 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150"
                data-file="components/ContextActionBar.js"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 1. Верхний ярус: Бейдж типа + Инлайн Название (с выбранным шрифтом) + ID + Закрыть */}
                <div className="flex items-center gap-2">
                    <div
                        className="flex items-center justify-center gap-1.5 w-[110px] py-1 rounded-md text-xs font-semibold shrink-0 border border-white/10 text-gray-100 shadow-sm"
                        style={{ backgroundColor: selectedNode.color || '#191c23' }}
                    >
                        <div className="icon-box text-xs"></div>
                        <span>Узел</span>
                    </div>

                    <input 
                        type="text"
                        className="flex-1 bg-transparent text-gray-100 font-semibold px-2 py-0.5 rounded border border-transparent hover:border-white/10 focus:border-[var(--accent-blue)] focus:bg-black/40 text-sm outline-none transition-all truncate"
                        style={{ fontFamily: selectedNode.fontFamily || 'inherit' }}
                        placeholder="Название узла..."
                        value={selectedNode.name || ''}
                        onChange={(e) => handleUpdateField('name', e.target.value, true)}
                        onBlur={() => {
                            dispatch({
                                type: 'COMMIT_HISTORY',
                                payload: { snapshot: { nodes, layers, ports, links }, logMessage: `Изменено имя узла: ${selectedNode.name}` }
                            });
                        }}
                    />

                    <CopyButton text={selectedNode.id} />

                    <button 
                        className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                        onClick={() => dispatch({ type: 'SET_SELECTED', payload: null })}
                        title="Снять выделение (Esc)"
                    >
                        <div className="icon-x text-sm"></div>
                    </button>
                </div>

                {/* 2. Средний ярус: Кнопки функций (40x40px) */}
                <div className="flex items-center gap-1 relative border-t border-b border-white/10 py-1.5 px-0.5">
                    {/* Цвет */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'color' ? 'bg-white/20 text-white border-white/30' : 'text-gray-300 hover:text-white'
                        }`}
                        title="Цвет фона узла"
                        onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}
                    >
                        <div className="w-5 h-5 rounded-md border border-white/30 shadow-sm" style={{ backgroundColor: selectedNode.color || '#1e293b' }}></div>
                    </button>

                    {/* Типографика (Шрифт и Размер) */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'typography' ? 'bg-white/20 text-white border-white/30' : (selectedNode.fontFamily || selectedNode.fontSize ? 'text-indigo-400' : 'text-gray-300 hover:text-white')
                        }`}
                        title={`Шрифт: ${selectedNode.fontFamily || 'Inter'} (${selectedNode.fontSize || 14}px)`}
                        onClick={() => setActivePopover(activePopover === 'typography' ? null : 'typography')}
                    >
                        <div className="icon-type text-lg"></div>
                    </button>

                    {/* Медиа / Картинка */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'media' ? 'bg-white/20 text-white border-white/30' : (selectedNode.mediaUrl ? 'text-emerald-400' : 'text-gray-300 hover:text-white')
                        }`}
                        title="Изображение / Медиа"
                        onClick={() => setActivePopover(activePopover === 'media' ? null : 'media')}
                    >
                        <div className="icon-image text-lg"></div>
                    </button>

                    {/* Слой */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'layer' ? 'bg-white/20 text-white border-white/30' : (selectedNode.parentId && selectedNode.parentId !== 'root' ? 'text-sky-400' : 'text-gray-300 hover:text-white')
                        }`}
                        title="Назначить на слой"
                        onClick={() => setActivePopover(activePopover === 'layer' ? null : 'layer')}
                    >
                        <div className="icon-layers text-lg"></div>
                    </button>

                    {/* Привязка к сетке */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            selectedNode.snapToGrid ? 'text-[var(--accent-blue)]' : 'text-gray-500'
                        }`}
                        title={selectedNode.snapToGrid ? 'Привязка к сетке: Вкл' : 'Привязка к сетке: Выкл'}
                        onClick={() => handleUpdateField('snapToGrid', !selectedNode.snapToGrid)}
                    >
                        <div className="icon-layout-grid text-lg"></div>
                    </button>


                    {/* Значок / Эмодзи */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'icon' ? 'bg-white/20 text-[var(--accent-blue)] border-white/30' : (selectedNode.icon ? 'text-amber-400' : 'text-gray-300 hover:text-white')
                        }`}
                        title="Выбрать значок / эмодзи"
                        onClick={() => setActivePopover(activePopover === 'icon' ? null : 'icon')}
                    >
                        <div className="icon-smile text-lg"></div>
                    </button>

                    <div className="flex-1"></div>

                    {/* Удалить */}
                    <button
                        className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/20 border-red-500/30 transition-colors"
                        title="Удалить узел"
                        onClick={() => {
                            if (window.confirm(`Удалить узел "${selectedNode.name || selectedNode.id}"?`)) {
                                dispatch({ type: 'REMOVE_NODE', payload: selectedNode.id });
                            }
                        }}
                    >
                        <div className="icon-trash text-lg"></div>
                    </button>

                    {/* Поповер: ЦВЕТ */}
                    {activePopover === 'color' && (
                        <ColorPickerPopover
                            title="Цвет фона узла"
                            currentColor={selectedNode.color || '#1a1a1a'}
                            onColorChange={(c) => handleUpdateField('color', c)}
                            leftClass="left-0"
                        />
                    )}

                    {/* Поповер: ТИПОГРАФИКА */}
                    {activePopover === 'typography' && (
                        <TypographyPopover
                            currentFont={selectedNode.fontFamily}
                            currentSize={selectedNode.fontSize}
                            onFontChange={(fontFamily) => handleUpdateField('fontFamily', fontFamily)}
                            onSizeChange={(fontSize) => handleUpdateField('fontSize', fontSize)}
                            leftClass="left-6"
                        />
                    )}

                    {/* Поповер: МЕДИА */}
                    {activePopover === 'media' && (
                        <div className="absolute left-16 top-12 w-64 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-xl p-3 shadow-2xl z-50 flex flex-col gap-2.5">
                            <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Изображение / Картинка</div>
                            <input
                                type="text"
                                placeholder="https://example.com/image.png"
                                className="input-field text-xs py-1"
                                value={selectedNode.mediaUrl || ''}
                                onChange={(e) => handleUpdateField('mediaUrl', e.target.value)}
                            />
                            {selectedNode.mediaUrl && (
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between text-[11px] text-gray-400">
                                        <span>Высота:</span>
                                        <span>{selectedNode.mediaHeight || 150}px</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="50"
                                        max="600"
                                        step="10"
                                        value={selectedNode.mediaHeight || 150}
                                        onChange={(e) => handleUpdateField('mediaHeight', parseInt(e.target.value))}
                                        className="accent-[var(--accent-blue)]"
                                    />
                                    <button
                                        className="btn text-xs py-1 text-red-400 border-red-500/30 hover:bg-red-500/20 mt-1"
                                        onClick={() => handleUpdateField('mediaUrl', '')}
                                    >
                                        Удалить картинку
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Поповер: СЛОЙ */}
                    {activePopover === 'layer' && (
                        <div className="absolute left-28 top-12 w-60 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-xl p-2.5 shadow-2xl z-50 flex flex-col gap-1.5 max-h-56 overflow-y-auto no-scrollbar">
                            <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider px-1">Назначить на слой</div>
                            <button
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-xs transition-colors ${
                                    (!selectedNode.parentId || selectedNode.parentId === 'root')
                                        ? 'bg-[var(--accent-blue)]/30 text-white font-medium border border-[var(--accent-blue)]/50'
                                        : 'text-gray-300 hover:bg-white/10'
                                }`}
                                onClick={() => handleLayerChange('root')}
                            >
                                <div className="icon-home text-gray-400 text-xs"></div>
                                <span className="truncate flex-1">Главный холст (Root)</span>
                            </button>
                            {/* Слои своего уровня — обычная группировка (parentId, через
                                handleLayerChange — сохраняет getSmartPlacement UX).
                                Слои ЧУЖИХ уровней помечены бейджем L№ и переносятся через
                                REPARENT_ENTITY: v13 не различает «свой»/«чужой» уровень
                                слоя структурно — уровень узла просто становится уровнем
                                слоя (docs/IDEAL_INTERACTIONS.md §2). Единственная реальная
                                проверка — canReparentTo (self/цикл): цель внутри собственной
                                ветки узла отклоняется, никакого молчаливого «спуска» v11
                                (REPARENT_ENTITY либо переносит, либо не переносит). */}
                            {layers && Object.values(layers).map((l) => {
                                const H = window.HierarchyUtils;
                                const layerLvl = (H && H.getEntityLevel) ? H.getEntityLevel(l.id, nodes, layers, state.levelWindows) : 0;
                                const nodeLvl = (H && H.getEntityLevel) ? H.getEntityLevel(selectedNode.id, nodes, layers, state.levelWindows) : 0;
                                const isCross = layerLvl !== nodeLvl;
                                const blocked = !!(H && H.canReparentTo &&
                                    !H.canReparentTo(selectedNode.id, l.id, nodes, layers, state.levelWindows).ok);
                                // Межуровневый перенос доступен только в режиме Drag&Drop
                                const dndLocked = isCross && !(state.ui && state.ui.dragDropMode);
                                return (
                                <button
                                    key={l.id}
                                    disabled={blocked || dndLocked}
                                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-xs transition-colors ${
                                        (blocked || dndLocked)
                                            ? 'text-gray-600 opacity-50 cursor-not-allowed'
                                            : selectedNode.parentId === l.id
                                                ? 'bg-[var(--accent-blue)]/30 text-white font-medium border border-[var(--accent-blue)]/50'
                                                : isCross ? 'text-gray-400 opacity-75 hover:opacity-100 hover:bg-white/10' : 'text-gray-300 hover:bg-white/10'
                                    }`}
                                    title={dndLocked
                                        ? `Слой на Уровне ${layerLvl}. Включите режим Drag&Drop (кнопка в панели проекта), чтобы переносить между уровнями`
                                        : blocked
                                            ? 'Недопустимая цель: этот слой лежит внутри собственной ветки узла (цикл)'
                                            : (isCross ? `Слой уровня ${layerLvl}: узел переедет на этот уровень` : undefined)}
                                    onClick={() => {
                                        if (blocked || dndLocked) return;
                                        if (isCross) {
                                            dispatch({ type: 'REPARENT_ENTITY', payload: { id: selectedNode.id, targetParentId: l.id } });
                                            setActivePopover(null);
                                        } else {
                                            handleLayerChange(l.id);
                                        }
                                    }}
                                >
                                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: l.color || '#0284c7' }}></div>
                                    <span className="truncate flex-1">{l.name || l.id}</span>
                                    {isCross && (
                                        <span className="px-1 py-px rounded text-[9px] font-mono bg-sky-500/20 text-sky-300 border border-sky-500/40 shrink-0">L{layerLvl}</span>
                                    )}
                                </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Поповер: ЗНАЧОК / ЭМОДЗИ */}
                    {activePopover === 'icon' && (
                        <IconPickerPopover
                            currentIcon={selectedNode.icon}
                            onIconChange={(icon) => {
                                handleUpdateField('icon', icon);
                                setActivePopover(null);
                            }}
                            leftClass="left-48"
                        />
                    )}
                </div>

                {/* 3. Нижний ярус: Сразу открытое поле Описания (1 строка по умолчанию, авто-рост) */}
                <div className="flex flex-col gap-1 px-0.5">
                    <ContextDescriptionInput 
                        placeholder="Описание узла..."
                        value={selectedNode.content || ''}
                        onChange={(e) => handleUpdateField('content', e.target.value, true)}
                        onBlur={() => {
                            dispatch({
                                type: 'COMMIT_HISTORY',
                                payload: { snapshot: { nodes, layers, ports, links }, logMessage: `Изменено описание узла: ${selectedNode.name || selectedNode.id}` }
                            });
                        }}
                    />
                </div>
            </div>
        );
    }

    // === Б. ЕДИНИЧНЫЙ СЛОЙ (Layer) ===
    if (selectedLayer) {
        const handleUpdateLayer = (field, value) => {
            dispatch({ type: 'UPDATE_LAYER', payload: { id: selectedLayer.id, updates: { [field]: value } } });
        };

        // Назначить на слой (PLAN_LAYERS_AND_CONTEXT_CREATION.md, разд. 2.4):
        // точная копия узлового попапа «назначить слой». v13: REPARENT_ENTITY
        // принимает 'root' и id слоя единым путём — своего/чужого уровня для
        // parentId больше не существует как различие (docs/IDEAL_INTERACTIONS.md §2).
        const handleLayerParentChange = (targetLayerId) => {
            dispatch({ type: 'REPARENT_ENTITY', payload: { id: selectedLayer.id, targetParentId: targetLayerId } });
            setActivePopover(null);
        };

        return (
            <div 
                ref={barRef}
                className="fixed top-4 left-1/2 -translate-x-1/2 w-full max-w-[794px] z-50 glass-panel bg-[#0d1017]/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl p-2.5 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150"
                data-file="components/ContextActionBar.js"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 1. Верхний ярус: Бейдж типа + Инлайн Название (с выбранным шрифтом) + ID + Закрыть */}
                <div className="flex items-center gap-2">
                    <div
                        className="flex items-center justify-center gap-1.5 w-[110px] py-1 rounded-md text-xs font-semibold shrink-0 border border-white/10 text-gray-100 shadow-sm"
                        style={{ backgroundColor: selectedLayer.color || '#191c23' }}
                    >
                        <div className="icon-layers text-xs"></div>
                        <span>Слой</span>
                    </div>

                    <input 
                        type="text"
                        className="flex-1 bg-transparent text-gray-100 font-semibold px-2 py-0.5 rounded border border-transparent hover:border-white/10 focus:border-[var(--accent-blue)] focus:bg-black/40 text-sm outline-none transition-all truncate"
                        style={{ fontFamily: selectedLayer.fontFamily || 'inherit' }}
                        placeholder="Название слоя..."
                        value={selectedLayer.name || ''}
                        onChange={(e) => handleUpdateLayer('name', e.target.value)}
                    />

                    <CopyButton text={selectedLayer.id} />

                    <button 
                        className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                        onClick={() => dispatch({ type: 'SET_SELECTED', payload: null })}
                        title="Снять выделение (Esc)"
                    >
                        <div className="icon-x text-sm"></div>
                    </button>
                </div>

                {/* 2. Средний ярус: Кнопки функций (40x40px) */}
                <div className="flex items-center gap-1 relative border-t border-b border-white/10 py-1.5 px-0.5">
                    {/* Цвет слоя */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'color' ? 'bg-white/20 text-white border-white/30' : 'text-gray-300 hover:text-white'
                        }`}
                        title="Цвет границы и шапки слоя"
                        onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}
                    >
                        <div className="w-5 h-5 rounded-md border border-white/30 shadow-sm" style={{ backgroundColor: selectedLayer.color || '#ff9500' }}></div>
                    </button>

                    {/* Типографика слоя (Шрифт и Размер) */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'typography' ? 'bg-white/20 text-white border-white/30' : (selectedLayer.fontFamily || selectedLayer.fontSize ? 'text-indigo-400' : 'text-gray-300 hover:text-white')
                        }`}
                        title={`Шрифт: ${selectedLayer.fontFamily || 'Inter'} (${selectedLayer.fontSize || 14}px)`}
                        onClick={() => setActivePopover(activePopover === 'typography' ? null : 'typography')}
                    >
                        <div className="icon-type text-lg"></div>
                    </button>

                    {/* Привязка к сетке */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            selectedLayer.snapToGrid ? 'text-[var(--accent-blue)]' : 'text-gray-500'
                        }`}
                        title={selectedLayer.snapToGrid ? 'Привязка к сетке: Вкл' : 'Привязка к сетке: Выкл'}
                        onClick={() => handleUpdateLayer('snapToGrid', !selectedLayer.snapToGrid)}
                    >
                        <div className="icon-layout-grid text-lg"></div>
                    </button>

                    {/* Авто-подгонка (Fit-to-content) */}
                    <button
                        className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors"
                        title="Оптимизировать размер слоя под вложенные узлы (Fit-to-content)"
                        onClick={() => {
                            const layerNodes = Object.values(nodes).filter(n => n.parentId === selectedLayer.id);
                            if (layerNodes.length > 0 && window.GeometryUtils?.getSmartPlacement) {
                                const { updatesById, newLayerSize } = window.GeometryUtils.getSmartPlacement(layerNodes, selectedLayer, nodes, layers);
                                dispatch({ type: 'UPDATE_LAYER', payload: { id: selectedLayer.id, updates: { size: newLayerSize } } });
                                dispatch({ type: 'MASS_UPDATE', payload: { ids: Object.keys(updatesById), updatesById } });
                            }
                        }}
                    >
                        <div className="icon-maximize-2 text-lg"></div>
                    </button>

                    {/* Назначить на слой */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'layer' ? 'bg-white/20 text-white border-white/30' : (selectedLayer.parentId && selectedLayer.parentId !== 'root' ? 'text-sky-400' : 'text-gray-300 hover:text-white')
                        }`}
                        title="Назначить на слой"
                        onClick={() => setActivePopover(activePopover === 'layer' ? null : 'layer')}
                    >
                        <div className="icon-layers text-lg"></div>
                    </button>

                    <div className="flex-1"></div>

                    {/* Удалить слой */}
                    <button
                        className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/20 border-red-500/30 transition-colors"
                        title="Удалить слой"
                        onClick={() => {
                            if (window.confirm(`Удалить слой "${selectedLayer.name || selectedLayer.id}"?`)) {
                                dispatch({ type: 'REMOVE_LAYER', payload: selectedLayer.id });
                            }
                        }}
                    >
                        <div className="icon-trash text-lg"></div>
                    </button>

                    {/* Поповер цвета слоя */}
                    {activePopover === 'color' && (
                        <ColorPickerPopover
                            title="Цвет слоя"
                            currentColor={selectedLayer.color || '#ff9500'}
                            onColorChange={(c) => { handleUpdateLayer('color', c); }}
                            leftClass="left-0"
                        />
                    )}

                    {/* Поповер типографики слоя */}
                    {activePopover === 'typography' && (
                        <TypographyPopover
                            currentFont={selectedLayer.fontFamily}
                            currentSize={selectedLayer.fontSize}
                            onFontChange={(fontFamily) => handleUpdateLayer('fontFamily', fontFamily)}
                            onSizeChange={(fontSize) => handleUpdateLayer('fontSize', fontSize)}
                            leftClass="left-8"
                        />
                    )}

                    {/* Поповер: назначить слой на слой — точная копия узлового попапа
                        «назначить слой», но переносимая сущность — сам selectedLayer.
                        Слои чужого уровня видны, но тусклые при выключенном ui.dragDropMode. */}
                    {activePopover === 'layer' && (
                        <div className="absolute left-28 top-12 w-60 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-xl p-2.5 shadow-2xl z-50 flex flex-col gap-1.5 max-h-56 overflow-y-auto no-scrollbar">
                            <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider px-1">Назначить на слой</div>
                            <button
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-xs transition-colors ${
                                    (!selectedLayer.parentId || selectedLayer.parentId === 'root')
                                        ? 'bg-[var(--accent-blue)]/30 text-white font-medium border border-[var(--accent-blue)]/50'
                                        : 'text-gray-300 hover:bg-white/10'
                                }`}
                                onClick={() => handleLayerParentChange('root')}
                            >
                                <div className="icon-home text-gray-400 text-xs"></div>
                                <span className="truncate flex-1">Главный холст (Root)</span>
                            </button>
                            {layers && Object.values(layers).filter(l => l && l.id !== selectedLayer.id).map((l) => {
                                // v13: canReparentTo уже включает защиту от циклов (isDescendantOf) —
                                // отдельная parentIdCycle-проверка и v11-«спуск» больше не нужны,
                                // см. комментарий у аналогичного попапа для узла выше.
                                const H = window.HierarchyUtils;
                                const layerLvl = (H && H.getEntityLevel) ? H.getEntityLevel(l.id, nodes, layers, state.levelWindows) : 0;
                                const ownLvl = (H && H.getEntityLevel) ? H.getEntityLevel(selectedLayer.id, nodes, layers, state.levelWindows) : 0;
                                const isCross = layerLvl !== ownLvl;
                                const blocked = !!(H && H.canReparentTo &&
                                    !H.canReparentTo(selectedLayer.id, l.id, nodes, layers, state.levelWindows).ok);
                                // Межуровневый перенос доступен только в режиме Drag&Drop
                                const dndLocked = isCross && !(state.ui && state.ui.dragDropMode);
                                return (
                                <button
                                    key={l.id}
                                    disabled={blocked || dndLocked}
                                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-xs transition-colors ${
                                        (blocked || dndLocked)
                                            ? 'text-gray-600 opacity-50 cursor-not-allowed'
                                            : selectedLayer.parentId === l.id
                                                ? 'bg-[var(--accent-blue)]/30 text-white font-medium border border-[var(--accent-blue)]/50'
                                                : isCross ? 'text-gray-400 opacity-75 hover:opacity-100 hover:bg-white/10' : 'text-gray-300 hover:bg-white/10'
                                    }`}
                                    title={blocked
                                        ? 'Нельзя: этот слой лежит внутри переносимого слоя (цикл)'
                                        : dndLocked
                                            ? `Слой на Уровне ${layerLvl}. Включите режим Drag&Drop (кнопка в панели проекта), чтобы переносить между уровнями`
                                            : (isCross ? `Слой уровня ${layerLvl}: этот слой переедет на этот уровень` : undefined)}
                                    onClick={() => {
                                        if (blocked || dndLocked) return;
                                        handleLayerParentChange(l.id);
                                    }}
                                >
                                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: l.color || '#0284c7' }}></div>
                                    <span className="truncate flex-1">{l.name || l.id}</span>
                                    {isCross && (
                                        <span className="px-1 py-px rounded text-[9px] font-mono bg-sky-500/20 text-sky-300 border border-sky-500/40 shrink-0">L{layerLvl}</span>
                                    )}
                                </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 3. Нижний ярус: Поле Описания (1 строка по умолчанию, авто-рост) */}
                <div className="flex flex-col gap-1 px-0.5">
                    <ContextDescriptionInput 
                        placeholder="Описание назначения слоя..."
                        value={selectedLayer.content || ''}
                        onChange={(e) => handleUpdateLayer('content', e.target.value)}
                    />
                </div>
            </div>
        );
    }

    // === В. ЕДИНИЧНЫЙ ПОРТ (Port) ===
    if (selectedPort) {
        const handleUpdatePort = (field, value) => {
            dispatch({ type: 'UPDATE_PORT', payload: { id: selectedPort.id, updates: { [field]: value } } });
        };

        const EDGE_OPTIONS = [
            { id: 'left', label: 'Слева', icon: 'icon-arrow-left' },
            { id: 'right', label: 'Справа', icon: 'icon-arrow-right' },
            { id: 'top', label: 'Сверху', icon: 'icon-arrow-up' },
            { id: 'bottom', label: 'Снизу', icon: 'icon-arrow-down' }
        ];

        return (
            <div 
                ref={barRef}
                className="fixed top-4 left-1/2 -translate-x-1/2 w-full max-w-[794px] z-50 glass-panel bg-[#0d1017]/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl p-2.5 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150"
                data-file="components/ContextActionBar.js"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 1. Верхний ярус: Бейдж типа + Инлайн Название (с выбранным шрифтом) + ID + Закрыть */}
                <div className="flex items-center gap-2">
                    <div
                        className="flex items-center justify-center gap-1.5 w-[110px] py-1 rounded-md text-xs font-semibold shrink-0 border border-white/10 text-gray-100 shadow-sm"
                        style={{ backgroundColor: selectedPort.color || '#191c23' }}
                    >
                        <div className="icon-circle text-xs"></div>
                        <span>Порт</span>
                    </div>

                    <input 
                        type="text"
                        className="flex-1 bg-transparent text-gray-100 font-semibold px-2 py-0.5 rounded border border-transparent hover:border-white/10 focus:border-[var(--accent-blue)] focus:bg-black/40 text-sm outline-none transition-all truncate"
                        style={{ fontFamily: selectedPort.fontFamily || 'inherit' }}
                        placeholder="Название порта..."
                        value={selectedPort.name || ''}
                        onChange={(e) => handleUpdatePort('name', e.target.value)}
                    />

                    <CopyButton text={selectedPort.id} />

                    <button 
                        className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                        onClick={() => dispatch({ type: 'SET_SELECTED', payload: null })}
                        title="Снять выделение (Esc)"
                    >
                        <div className="icon-x text-sm"></div>
                    </button>
                </div>

                {/* 2. Средний ярус: Кнопки функций (40x40px) */}
                <div className="flex items-center gap-1 relative border-t border-b border-white/10 py-1.5 px-0.5">
                    {/* Тогл типа порта (Input / Output) */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            selectedPort.type === 'output' ? 'text-emerald-400' : 'text-blue-400'
                        }`}
                        title={`Тип: ${selectedPort.type === 'output' ? 'Выход (Output) — клик для смены на Вход' : 'Вход (Input) — клик для смены на Выход'}`}
                        onClick={() => handleUpdatePort('type', selectedPort.type === 'output' ? 'input' : 'output')}
                    >
                        <div className={`text-lg ${selectedPort.type === 'output' ? 'icon-log-out' : 'icon-log-in'}`}></div>
                    </button>

                    {/* Цвет порта */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'color' ? 'bg-white/20 text-white border-white/30' : 'text-gray-300 hover:text-white'
                        }`}
                        title="Цвет точки привязки"
                        onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}
                    >
                        <div className="w-4 h-4 rounded-full border border-white/40 shadow-sm" style={{ backgroundColor: selectedPort.color || '#3b82f6' }}></div>
                    </button>

                    {/* Типографика порта (Шрифт и Размер) */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'typography' ? 'bg-white/20 text-white border-white/30' : (selectedPort.fontFamily || selectedPort.fontSize ? 'text-indigo-400' : 'text-gray-300 hover:text-white')
                        }`}
                        title={`Шрифт: ${selectedPort.fontFamily || 'Inter'} (${selectedPort.fontSize || 12}px)`}
                        onClick={() => setActivePopover(activePopover === 'typography' ? null : 'typography')}
                    >
                        <div className="icon-type text-lg"></div>
                    </button>

                    {/* Грань узла (Edge) */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'edge' ? 'bg-white/20 text-white border-white/30' : 'text-gray-300 hover:text-white'
                        }`}
                        title={`Грань: ${selectedPort.edge || 'right'}`}
                        onClick={() => setActivePopover(activePopover === 'edge' ? null : 'edge')}
                    >
                        <div className="icon-compass text-lg text-sky-400"></div>
                    </button>

                    <div className="flex-1"></div>

                    {/* Удалить порт */}
                    <button
                        className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/20 border-red-500/30 transition-colors"
                        title="Удалить порт"
                        onClick={() => {
                            if (window.confirm(`Удалить порт "${selectedPort.name || selectedPort.id}"?`)) {
                                dispatch({ type: 'REMOVE_PORT', payload: selectedPort.id });
                            }
                        }}
                    >
                        <div className="icon-trash text-lg"></div>
                    </button>

                    {/* Поповер цвета порта */}
                    {activePopover === 'color' && (
                        <ColorPickerPopover
                            title="Цвет порта"
                            currentColor={selectedPort.color || '#3b82f6'}
                            onColorChange={(c) => { handleUpdatePort('color', c); }}
                            leftClass="left-10"
                        />
                    )}

                    {/* Поповер типографики порта */}
                    {activePopover === 'typography' && (
                        <TypographyPopover
                            currentFont={selectedPort.fontFamily}
                            currentSize={selectedPort.fontSize}
                            onFontChange={(fontFamily) => handleUpdatePort('fontFamily', fontFamily)}
                            onSizeChange={(fontSize) => handleUpdatePort('fontSize', fontSize)}
                            leftClass="left-16"
                        />
                    )}

                    {/* Поповер грани (Edge) */}
                    {activePopover === 'edge' && (
                        <div className="absolute left-28 top-12 w-48 glass-panel bg-[#14161f]/95 backdrop-blur-md border border-[#444] rounded-xl p-2 shadow-2xl z-50 flex flex-col gap-1">
                            <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider px-1 mb-1">Грань привязки</div>
                            {EDGE_OPTIONS.map(edge => (
                                <button
                                    key={edge.id}
                                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs transition-colors ${
                                        selectedPort.edge === edge.id
                                            ? 'bg-[var(--accent-blue)] text-white font-medium'
                                            : 'text-gray-300 hover:bg-white/10'
                                    }`}
                                    onClick={() => { handleUpdatePort('edge', edge.id); setActivePopover(null); }}
                                >
                                    <div className={`${edge.icon} text-sm`}></div>
                                    <span>{edge.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* 3. Нижний ярус: Поле Описания (1 строка по умолчанию, авто-рост) */}
                <div className="flex flex-col gap-1 px-0.5">
                    <ContextDescriptionInput 
                        placeholder="Описание назначения порта или типа данных..."
                        value={selectedPort.content || ''}
                        onChange={(e) => handleUpdatePort('content', e.target.value)}
                    />
                </div>
            </div>
        );
    }

    // === Г. ЕДИНИЧНАЯ СВЯЗЬ (Link) ===
    if (selectedLink) {
        const handleUpdateLink = (field, value) => {
            dispatch({ type: 'UPDATE_LINK', payload: { id: selectedLink.id, updates: { [field]: value } } });
        };

        const isOrthogonal = (selectedLink.linkStyle || 'bezier') === 'orthogonal';

        return (
            <div 
                ref={barRef}
                className="fixed top-4 left-1/2 -translate-x-1/2 w-full max-w-[794px] z-50 glass-panel bg-[#0d1017]/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl p-2.5 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150"
                data-file="components/ContextActionBar.js"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 1. Верхний ярус: Бейдж типа + Инлайн Название (с выбранным шрифтом) + ID + Закрыть */}
                <div className="flex items-center gap-2">
                    <div
                        className="flex items-center justify-center gap-1.5 w-[110px] py-1 rounded-md text-xs font-semibold shrink-0 border border-white/10 text-gray-100 shadow-sm"
                        style={{ backgroundColor: selectedLink.color || '#191c23' }}
                    >
                        <div className="icon-spline text-xs"></div>
                        <span>Связь</span>
                    </div>

                    <input 
                        type="text"
                        className="flex-1 bg-transparent text-gray-100 font-semibold px-2 py-0.5 rounded border border-transparent hover:border-white/10 focus:border-[var(--accent-blue)] focus:bg-black/40 text-sm outline-none transition-all truncate"
                        style={{ fontFamily: selectedLink.fontFamily || 'inherit' }}
                        placeholder="Название связи..."
                        value={selectedLink.name || ''}
                        onChange={(e) => handleUpdateLink('name', e.target.value)}
                    />

                    <CopyButton text={selectedLink.id} />

                    <button 
                        className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                        onClick={() => dispatch({ type: 'SET_SELECTED', payload: null })}
                        title="Снять выделение (Esc)"
                    >
                        <div className="icon-x text-sm"></div>
                    </button>
                </div>

                {/* 2. Средний ярус: Кнопки функций (40x40px) */}
                <div className="flex items-center gap-1 relative border-t border-b border-white/10 py-1.5 px-0.5">
                    {/* Стиль линии */}
                    <button
                        className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-gray-300 hover:text-white transition-colors"
                        title={`Стиль линии: ${isOrthogonal ? 'Ортогональная (Прямые углы) — клик для Безье' : 'Безье (Кривая) — клик для Ортогональной'}`}
                        onClick={() => handleUpdateLink('linkStyle', isOrthogonal ? 'bezier' : 'orthogonal')}
                    >
                        {isOrthogonal ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent-blue)]">
                                <path d="M4 19h8v-14h8" />
                                <circle cx="4" cy="19" r="2" fill="currentColor" />
                                <circle cx="20" cy="5" r="2" fill="currentColor" />
                            </svg>
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400">
                                <path d="M4 19 C 10 19, 14 5, 20 5" />
                                <circle cx="4" cy="19" r="2" fill="currentColor" />
                                <circle cx="20" cy="5" r="2" fill="currentColor" />
                            </svg>
                        )}
                    </button>

                    {/* Цвет линии */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'color' ? 'bg-white/20 text-white border-white/30' : 'text-gray-300 hover:text-white'
                        }`}
                        title="Цвет провода связи"
                        onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}
                    >
                        <div className="w-4 h-4 rounded-full border border-white/40 shadow-sm" style={{ backgroundColor: selectedLink.color || '#3b82f6' }}></div>
                    </button>

                    {/* Типографика связи (Шрифт и Размер) */}
                    <button
                        className={`btn w-10 h-10 p-0 rounded-lg flex items-center justify-center transition-colors ${
                            activePopover === 'typography' ? 'bg-white/20 text-white border-white/30' : (selectedLink.fontFamily || selectedLink.fontSize ? 'text-indigo-400' : 'text-gray-300 hover:text-white')
                        }`}
                        title={`Шрифт: ${selectedLink.fontFamily || 'Inter'} (${selectedLink.fontSize || 12}px)`}
                        onClick={() => setActivePopover(activePopover === 'typography' ? null : 'typography')}
                    >
                        <div className="icon-type text-lg"></div>
                    </button>

                    <div className="flex-1"></div>

                    {/* Удалить связь */}
                    <button
                        className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/20 border-red-500/30 transition-colors"
                        title="Удалить связь"
                        onClick={() => {
                            if (window.confirm(`Удалить связь "${selectedLink.name || selectedLink.id}"?`)) {
                                dispatch({ type: 'REMOVE_LINK', payload: selectedLink.id });
                            }
                        }}
                    >
                        <div className="icon-trash text-lg"></div>
                    </button>

                    {/* Поповер цвета связи */}
                    {activePopover === 'color' && (
                        <ColorPickerPopover
                            title="Цвет линии связи"
                            currentColor={selectedLink.color || '#3b82f6'}
                            onColorChange={(c) => { handleUpdateLink('color', c); }}
                            leftClass="left-10"
                        />
                    )}

                    {/* Поповер типографики связи */}
                    {activePopover === 'typography' && (
                        <TypographyPopover
                            currentFont={selectedLink.fontFamily}
                            currentSize={selectedLink.fontSize}
                            onFontChange={(fontFamily) => handleUpdateLink('fontFamily', fontFamily)}
                            onSizeChange={(fontSize) => handleUpdateLink('fontSize', fontSize)}
                            leftClass="left-16"
                        />
                    )}
                </div>

                {/* 3. Нижний ярус: Поле Описания (1 строка по умолчанию, авто-рост) */}
                <div className="flex flex-col gap-1 px-0.5">
                    <ContextDescriptionInput 
                        placeholder="Описание передаваемых данных или протокола связи..."
                        value={selectedLink.content || ''}
                        onChange={(e) => handleUpdateLink('content', e.target.value)}
                    />
                </div>
            </div>
        );
    }

    return null;
}
