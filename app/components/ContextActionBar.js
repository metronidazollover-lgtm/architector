// v14 (Фаза 4): контекстная панель свойств. Структура (поповеры, тир-1/2/3
// вёрстка, FOR_PROJECT-обёртка dispatch) сохранена из v13 почти без изменений
// — переписаны только сами ветки под конкретные сущности: «Слой» → «Рамка»
// (панель свойств, поповер «Назначить на слой» → «Добавить в рамку»), окно
// уровня → окно-дорожка (адресация `window:<id>` вместо `level-window-N`,
// свойства без levelIndex/isolate-глаза уровня — только контейнерная изоляция).
//
// Сознательно упрощено относительно v13 (см. комментарии по месту): импорт/
// экспорт без реконструкции меж-оконных прокси-гейтвеев (геометрия прокси —
// Фаза 5); одна общая (не тройная) реализация поповера «Добавить в рамку».

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
    { size: 11, label: '11px', name: 'XS' }, { size: 12, label: '12px', name: 'SM' },
    { size: 14, label: '14px', name: 'MD' }, { size: 16, label: '16px', name: 'LG' },
    { size: 18, label: '18px', name: 'XL' }, { size: 20, label: '20px', name: '2XL' },
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
        <button className="px-2 h-7 rounded text-xs shrink-0 flex items-center gap-1.5 text-gray-400 hover:text-white border border-white/10 hover:border-white/25 bg-black/40 hover:bg-black/60 transition-all font-mono" onClick={handleCopy} title={`Копировать ID: ${text}`}>
            <span className="max-w-[90px] truncate text-[11px] select-all">{text}</span>
            <div className={`text-xs ${copied ? 'icon-check text-green-400' : 'icon-copy'}`}></div>
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
        if (scrollH <= 32) { el.style.height = '28px'; el.style.overflowY = 'hidden'; }
        else if (scrollH < 140) { el.style.height = `${scrollH}px`; el.style.overflowY = 'hidden'; }
        else { el.style.height = '140px'; el.style.overflowY = 'auto'; }
    }, []);
    React.useLayoutEffect(() => { adjustHeight(); }, [value, adjustHeight]);
    return (
        <textarea
            ref={textareaRef} rows={1}
            className="w-full bg-black/40 text-gray-200 px-2.5 py-1 rounded-lg border border-white/10 focus:border-[var(--accent-blue)] focus:bg-black/60 text-xs outline-none resize-none font-sans break-all whitespace-pre-wrap leading-snug custom-scrollbar transition-all box-border"
            style={{ minHeight: '28px', height: '28px', overflowY: 'hidden' }}
            placeholder={placeholder} value={value || ''} onInput={adjustHeight} onChange={onChange} onBlur={onBlur}
        />
    );
};

const TypographyPopover = ({ currentFont, currentSize, onFontChange, onSizeChange, leftClass = 'left-10' }) => (
    <div className={`absolute ${leftClass} top-12 w-72 panel rounded-xl p-3 shadow-2xl z-50 flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-150`}>
        <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-gray-300 uppercase tracking-wider">
                <span>Размер шрифта</span><span className="text-[var(--accent-blue)] font-mono text-xs font-bold">{currentSize || 14}px</span>
            </div>
            <div className="flex items-center gap-1">
                {FONT_SIZE_PRESETS.map((item) => (
                    <button key={item.size} className={`flex-1 h-7 rounded border text-[11px] font-medium transition-all ${(currentSize || 14) === item.size ? 'bg-[var(--accent-blue)] text-white border-[var(--accent-blue)] shadow' : 'bg-black/30 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white'}`} onClick={() => onSizeChange(item.size)} title={`${item.label} (${item.name})`}>{item.size}</button>
                ))}
            </div>
        </div>
        <div className="flex flex-col gap-1.5 pt-2 border-t border-white/10">
            <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Гарнитура (Шрифт)</div>
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto custom-scrollbar pr-0.5">
                {FONT_PRESETS.map((font) => (
                    <button key={font.id} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-left transition-all ${(currentFont || 'Inter, sans-serif') === font.id ? 'bg-[var(--accent-blue)]/20 border-[var(--accent-blue)] text-white font-medium' : 'bg-black/20 border-white/5 text-gray-300 hover:bg-white/10 hover:text-white'}`} onClick={() => onFontChange(font.id)}>
                        <span className="text-xs truncate" style={{ fontFamily: font.id }}>{font.label}</span>
                        <span className="text-[10px] text-gray-400 font-mono">{font.category}</span>
                    </button>
                ))}
            </div>
        </div>
    </div>
);

const ColorPickerPopover = ({ currentColor, onColorChange, title = 'Выбор цвета', leftClass = 'left-0', showHex = true }) => (
    <div className={`absolute ${leftClass} top-12 w-64 panel rounded-xl p-3 shadow-2xl z-50 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-150`}>
        <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">{title}</div>
        <div className="grid grid-cols-7 gap-1.5">
            {COLOR_PRESETS.map((c) => (
                <button key={c} className={`w-6 h-6 rounded-md border transition-all hover:scale-110 ${(currentColor || '').toLowerCase() === c.toLowerCase() ? 'border-white ring-2 ring-[var(--accent-blue)] scale-105' : 'border-white/20 hover:border-white'}`} style={{ backgroundColor: c }} onClick={() => onColorChange(c, 'preset')} />
            ))}
        </div>
        <div className="flex items-center gap-2 pt-1 border-t border-white/10">
            <span className="text-[11px] text-gray-400">Свой цвет:</span>
            <input type="color" className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0" value={currentColor && currentColor.startsWith('#') && currentColor.length === 7 ? currentColor : '#888888'} onChange={(e) => onColorChange(e.target.value, 'input')} />
            {window.EyeDropper && (
                <button className="w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 border border-white/10 transition-colors" title="Пипетка: взять цвет с экрана" onClick={async () => { try { const res = await new window.EyeDropper().open(); onColorChange(res.sRGBHex, 'eyedropper'); } catch (err) { } }}>
                    <div className="icon-pipette text-xs"></div>
                </button>
            )}
            {showHex && <span className="text-[10px] font-mono text-gray-400 flex-1 truncate">{currentColor || '#1a1a1a'}</span>}
        </div>
    </div>
);

const IconPickerPopover = ({ currentIcon, onIconChange, leftClass = 'left-48' }) => (
    <div className={`absolute ${leftClass} top-12 w-64 panel rounded-xl p-3 shadow-2xl z-50 flex flex-col gap-2 max-h-64 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150`}>
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Иконка Lucide</div>
        <div className="grid grid-cols-5 gap-1.5">
            {ICON_PRESETS.map((item) => (
                <button key={item.id} className={`h-8 rounded flex flex-col items-center justify-center transition-colors border ${currentIcon === item.id ? 'bg-[var(--accent-blue)]/30 border-[var(--accent-blue)] text-white' : 'bg-black/20 border-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}`} title={item.label} onClick={() => onIconChange(item.id)}>
                    {item.icon ? <div className={`${item.icon} text-sm`}></div> : <span className="text-[9px]">Нет</span>}
                </button>
            ))}
        </div>
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-1 pt-1 border-t border-white/10">Эмодзи</div>
        <div className="grid grid-cols-5 gap-1.5">
            {EMOJI_PRESETS.map((emoji) => (
                <button key={emoji} className={`h-8 rounded flex items-center justify-center text-sm transition-colors border ${currentIcon === emoji ? 'bg-[var(--accent-blue)]/30 border-[var(--accent-blue)]' : 'bg-black/20 border-white/5 hover:bg-white/10'}`} onClick={() => onIconChange(emoji)}>{emoji}</button>
            ))}
        </div>
    </div>
);

// Поповер «Добавить в рамку» — общий для одиночного и массового выделения
// (v13 держал три похожие копии; здесь одна, см. рекомендацию в отчёте
// исследования Фазы 4). ids — узлы-кандидаты на членство.
const AssignToFramePopover = ({ ids, frames, onAssign }) => (
    <div className="absolute left-0 top-12 w-56 panel rounded-xl p-2 shadow-2xl z-50 flex flex-col gap-1 max-h-64 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 pb-1">Добавить в рамку</div>
        {Object.values(frames).length === 0 && <div className="text-xs text-gray-500 px-1 py-2">Рамок пока нет</div>}
        {Object.values(frames).map(f => (
            <button key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/10 text-left" onClick={() => onAssign(f.id)}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: f.color || '#0284c7' }} />
                <span className="text-xs truncate flex-1">{f.name || f.id}</span>
                <span className="text-[10px] text-gray-500">{(f.members || []).length}</span>
            </button>
        ))}
    </div>
);

function ContextActionBar() {
    const { state: rootState, dispatch: rawDispatch } = useStore();
    const [activePopover, setActivePopover] = React.useState(null);
    const barRef = React.useRef(null);
    const projectFileInputRef = React.useRef(null);
    const workspaceFileInputRef = React.useRef(null);

    const selectedPid = React.useMemo(() => {
        const first = rootState.selectedIds && rootState.selectedIds[0];
        if (typeof first === 'string' && first.startsWith('project:')) return first.replace('project:', '');
        for (const pid of rootState.projectOrder || []) {
            const p = rootState.projects[pid];
            if (!p) continue;
            if ((first && (p.nodes?.[first] || p.frames?.[first] || p.ports?.[first] || p.links?.[first] || p.windows?.[first]))) return pid;
        }
        return rootState.activeProjectId;
    }, [rootState.selectedIds, rootState.projectOrder, rootState.activeProjectId]);

    const state = selectedPid ? getProjectFlatView(selectedPid) : rootState;

    const dispatch = React.useCallback((action) => {
        if (!action) return action;
        if (selectedPid && selectedPid !== rootState.activeProjectId
            && !['FOR_PROJECT', 'SET_ACTIVE_PROJECT', 'TOGGLE_SELECTED', 'SET_SELECTED', 'CLEAR_SELECTION'].includes(action.type)) {
            return rawDispatch({ type: 'FOR_PROJECT', payload: { projectId: selectedPid, action } });
        }
        return rawDispatch(action);
    }, [selectedPid, rootState.activeProjectId, rawDispatch]);

    const { selectedIds, nodes, ports, links } = state;
    const frames = state.frames || {};
    const windows = state.windows || {};

    // --- Импорт/экспорт (упрощено относительно v13 — без реконструкции
    // меж-оконных прокси-гейтвеев, см. комментарий вверху файла) -------------
    const handleExportProject = () => {
        const data = {
            formatVersion: 14, nodes, frames, ports, links, windows,
            projectName: state.projectName, projectColor: state.projectColor,
            projectFontFamily: state.projectFontFamily, projectContent: state.projectContent,
            canvas: state.canvas
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `architector_project_${new Date().toISOString().slice(0, 10)}.json`;
        a.click(); URL.revokeObjectURL(url);
    };
    const handleImportProject = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = JSON.parse(evt.target.result);
                if (data.kind === 'global') { console.error('Это файл всего рабочего пространства — используйте «Импорт всего»'); return; }
                if (data.nodes && data.ports && data.links) {
                    if (window.confirm('OK — влить в активный проект. Отмена — добавить как новый отдельный проект.')) {
                        rawDispatch({ type: 'MERGE_PROJECT_FROM_FILE', payload: data });
                    } else {
                        dispatch({ type: 'ADD_PROJECT_FROM_FILE', payload: data });
                    }
                } else console.error('Некорректный файл проекта');
            } catch (err) { console.error('Не удалось прочитать файл проекта', err); }
        };
        reader.readAsText(file);
        e.target.value = '';
    };
    const handleExportWorkspace = () => {
        const data = { formatVersion: 14, kind: 'global', projects: rootState.projects, projectOrder: rootState.projectOrder, activeProjectId: rootState.activeProjectId, projectCounter: rootState.projectCounter, crossProjectLinks: rootState.crossProjectLinks, canvas: rootState.canvas };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `architector_workspace_${new Date().toISOString().slice(0, 10)}.json`;
        a.click(); URL.revokeObjectURL(url);
    };
    const handleImportWorkspace = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = JSON.parse(evt.target.result);
                if (data.projects && Array.isArray(data.projectOrder)) {
                    if (window.confirm('Это заменит ВСЁ рабочее пространство целиком. Отменить (Ctrl+Z) будет нельзя. Продолжить?')) {
                        rawDispatch({ type: 'LOAD_GLOBAL_STATE', payload: data });
                    }
                } else console.error('Некорректный файл рабочего пространства');
            } catch (err) { console.error('Не удалось прочитать файл рабочего пространства', err); }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    React.useEffect(() => {
        const handleClick = (e) => { if (barRef.current && !barRef.current.contains(e.target)) setActivePopover(null); };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);
    React.useEffect(() => { setActivePopover(null); }, [selectedIds]);

    if (!selectedIds || selectedIds.length === 0) return null;

    const isContainerId = (id) => typeof id === 'string' && (id === 'project' || id.startsWith('project:') || id.startsWith('window:'));

    // === Ветка 0: множественное выделение контейнеров (проекты/окна) =======
    if (selectedIds.length > 1 && selectedIds.some(isContainerId)) {
        const pickedProjects = [], pickedWindows = [];
        selectedIds.forEach(id => {
            if (id === 'project') pickedProjects.push(rootState.activeProjectId);
            else if (id.startsWith('project:')) pickedProjects.push(id.replace('project:', ''));
            else if (id.startsWith('window:')) pickedWindows.push(id.replace('window:', ''));
        });
        const ownerOfWindow = (wid) => (rootState.projectOrder || []).find(pid => rootState.projects[pid] && rootState.projects[pid].windows && rootState.projects[pid].windows[wid]);
        const toProject = (pid, action) => rawDispatch({ type: 'FOR_PROJECT', payload: { projectId: pid, action } });
        const allIsolated = pickedProjects.every(p => (rootState.containerIsolation?.projectIds || []).includes(p)) && pickedWindows.every(w => (rootState.containerIsolation?.windowIds || []).includes(w));

        const handleIsolate = () => {
            if (allIsolated) rawDispatch({ type: 'CLEAR_CONTAINER_ISOLATION' });
            else rawDispatch({ type: 'SET_CONTAINER_ISOLATION', payload: { projectIds: pickedProjects, windowIds: pickedWindows } });
        };
        const handleColor = (color) => {
            pickedProjects.forEach(pid => toProject(pid, { type: 'UPDATE_PROJECT_PROPERTIES', payload: { updates: { projectColor: color } } }));
            pickedWindows.forEach(wid => { const pid = ownerOfWindow(wid); if (pid) toProject(pid, { type: 'UPDATE_WINDOW_PROPERTIES', payload: { windowId: wid, updates: { color } } }); });
        };
        const handleFont = (updates) => {
            if (updates.fontFamily) pickedProjects.forEach(pid => toProject(pid, { type: 'UPDATE_PROJECT_PROPERTIES', payload: { updates: { projectFontFamily: updates.fontFamily } } }));
            pickedWindows.forEach(wid => { const pid = ownerOfWindow(wid); if (pid) toProject(pid, { type: 'UPDATE_WINDOW_PROPERTIES', payload: { windowId: wid, updates } }); });
        };
        const handleAlign = () => {
            const projSet = new Set(pickedProjects);
            pickedWindows.forEach(wid => { const pid = ownerOfWindow(wid); if (pid) projSet.add(pid); });
            projSet.forEach(pid => toProject(pid, { type: 'ALIGN_WINDOWS' }));
        };
        const handleDelete = () => {
            if (window.confirm(`Удалить выбранные контейнеры (${pickedProjects.length} проект(ов), ${pickedWindows.length} окно(а))?`)) {
                rawDispatch({ type: 'DELETE_SELECTED' });
            }
        };

        return (
            <div ref={barRef} className="fixed top-16 left-1/2 -translate-x-1/2 z-50 panel rounded-2xl shadow-2xl p-2.5 flex flex-col gap-2 w-[420px]">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-300">Контейнеры: {pickedProjects.length} проект(ов), {pickedWindows.length} окно(а)</span>
                    <button className="text-gray-500 hover:text-white" onClick={() => dispatch({ type: 'SET_SELECTED', payload: null })}><div className="icon-x w-4 h-4" /></button>
                </div>
                <div className="flex items-center gap-1.5 relative">
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Цвет" onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}><div className="icon-palette w-4 h-4" /></button>
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Шрифт" onClick={() => setActivePopover(activePopover === 'typography' ? null : 'typography')}><div className="icon-type w-4 h-4" /></button>
                    <button className={`w-9 h-9 rounded-lg border flex items-center justify-center ${allIsolated ? 'bg-orange-500/30 border-orange-400 text-orange-300' : 'bg-black/30 border-white/10 hover:border-white/30'}`} title="Изолировать" onClick={handleIsolate}><div className="icon-scan w-4 h-4" /></button>
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Разложить по колонкам" onClick={handleAlign}><div className="icon-layout-grid w-4 h-4" /></button>
                    <button className="w-9 h-9 rounded-lg bg-red-900/30 border border-red-500/30 hover:bg-red-900/50 flex items-center justify-center text-red-300 ml-auto" title="Удалить" onClick={handleDelete}><div className="icon-trash-2 w-4 h-4" /></button>
                    {activePopover === 'color' && <ColorPickerPopover currentColor="" onColorChange={handleColor} />}
                    {activePopover === 'typography' && <TypographyPopover currentFont="" currentSize={14} onFontChange={(f) => handleFont({ fontFamily: f })} onSizeChange={(s) => handleFont({ fontSize: s })} />}
                </div>
                <div className="text-[10px] text-gray-500">Правки затрагивают только оформление контейнеров, не их содержимое.</div>
            </div>
        );
    }

    // === Ветка 1: множественное выделение сущностей =========================
    if (selectedIds.length > 1) {
        const items = selectedIds.map(id => {
            if (nodes[id]) return { id, type: 'Узел', data: nodes[id] };
            if (frames[id]) return { id, type: 'Рамка', data: frames[id] };
            if (ports[id]) return { id, type: 'Порт', data: ports[id] };
            if (links[id]) return { id, type: 'Связь', data: links[id] };
            return { id, type: '?', data: null };
        }).filter(i => i.data);

        const isAllLinks = items.every(i => i.type === 'Связь');
        const hasNodesOrFrames = items.some(i => i.type === 'Узел' || i.type === 'Рамка');
        const firstItemWithFont = items[0]?.data;
        const firstLink = items.find(i => i.type === 'Связь')?.data;
        const nodeIds = items.filter(i => i.type === 'Узел').map(i => i.id);

        const massUpdate = (updates) => dispatch({ type: 'MASS_UPDATE', payload: { ids: selectedIds, updates } });
        const handleAssignToFrame = (frameId) => { if (nodeIds.length) dispatch({ type: 'FRAME_ADD_MEMBERS', payload: { frameId, ids: nodeIds } }); setActivePopover(null); };
        const handleDelete = () => { if (window.confirm(`Удалить ${selectedIds.length} элементов?`)) dispatch({ type: 'DELETE_SELECTED' }); };

        return (
            <div ref={barRef} className="fixed top-16 left-1/2 -translate-x-1/2 z-50 panel rounded-2xl shadow-2xl p-2.5 flex flex-col gap-2 w-[440px]">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-300">Выделено: {items.length}</span>
                    <button className="text-gray-500 hover:text-white" onClick={() => dispatch({ type: 'SET_SELECTED', payload: null })}><div className="icon-x w-4 h-4" /></button>
                </div>
                <div className="flex items-center gap-1.5 relative flex-wrap">
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Цвет" onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}><div className="icon-palette w-4 h-4" /></button>
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Шрифт" onClick={() => setActivePopover(activePopover === 'typography' ? null : 'typography')}><div className="icon-type w-4 h-4" /></button>
                    {nodeIds.length > 0 && (
                        <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Добавить в рамку" onClick={() => setActivePopover(activePopover === 'frame' ? null : 'frame')}><div className="icon-square-dashed w-4 h-4" /></button>
                    )}
                    {hasNodesOrFrames && (
                        <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Переключить сетку" onClick={() => massUpdate({ snapToGrid: !(firstItemWithFont && firstItemWithFont.snapToGrid) })}><div className="icon-grid-3x3 w-4 h-4" /></button>
                    )}
                    {isAllLinks && (
                        <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Стиль связи" onClick={() => massUpdate({ linkStyle: (firstLink && firstLink.linkStyle === 'orthogonal') ? 'bezier' : 'orthogonal' })}><div className="icon-route w-4 h-4" /></button>
                    )}
                    <button className="w-9 h-9 rounded-lg bg-red-900/30 border border-red-500/30 hover:bg-red-900/50 flex items-center justify-center text-red-300 ml-auto" title="Удалить" onClick={handleDelete}><div className="icon-trash-2 w-4 h-4" /></button>
                    {activePopover === 'color' && <ColorPickerPopover currentColor="" onColorChange={(c) => massUpdate({ color: c })} />}
                    {activePopover === 'typography' && <TypographyPopover currentFont="" currentSize={14} onFontChange={(f) => massUpdate({ fontFamily: f })} onSizeChange={(s) => massUpdate({ fontSize: s })} />}
                    {activePopover === 'frame' && <AssignToFramePopover ids={nodeIds} frames={frames} onAssign={handleAssignToFrame} />}
                </div>
            </div>
        );
    }

    const id = selectedIds[0];

    // === Ветка: проект ========================================================
    if (id === 'project' || id === `project:${selectedPid}`) {
        const handleUpdateProject = (field, val, skipHistory) => dispatch({ type: 'UPDATE_PROJECT_PROPERTIES', payload: { updates: { [field]: val }, skipHistory } });
        return (
            <div ref={barRef} className="fixed top-16 left-1/2 -translate-x-1/2 z-50 panel rounded-2xl shadow-2xl p-3 flex flex-col gap-2.5 w-[440px]">
                <div className="flex items-center justify-between gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: state.projectColor || '#059669' }}>ПРОЕКТ</span>
                    <input className="flex-1 bg-transparent text-sm font-medium text-white outline-none border-b border-transparent focus:border-white/30" value={state.projectName || ''} onChange={(e) => handleUpdateProject('projectName', e.target.value, true)} onBlur={(e) => handleUpdateProject('projectName', e.target.value, false)} />
                    <button className="text-gray-500 hover:text-white" onClick={() => dispatch({ type: 'SET_SELECTED', payload: null })}><div className="icon-x w-4 h-4" /></button>
                </div>
                <div className="flex items-center gap-1.5 relative flex-wrap">
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Цвет" onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}>
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: state.projectColor || '#059669' }} />
                    </button>
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Шрифт" onClick={() => setActivePopover(activePopover === 'typography' ? null : 'typography')}><div className="icon-type w-4 h-4" /></button>
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Разложить окна по колонкам" onClick={() => dispatch({ type: 'ALIGN_WINDOWS' })}><div className="icon-layout-grid w-4 h-4" /></button>
                    <input type="file" ref={projectFileInputRef} accept=".json" className="hidden" onChange={handleImportProject} />
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Импорт проекта" onClick={() => projectFileInputRef.current?.click()}><div className="icon-upload w-4 h-4" /></button>
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Экспорт проекта" onClick={handleExportProject}><div className="icon-download w-4 h-4" /></button>
                    <div className="w-px h-6 bg-white/10" />
                    <input type="file" ref={workspaceFileInputRef} accept=".json" className="hidden" onChange={handleImportWorkspace} />
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Импорт всего рабочего пространства" onClick={() => workspaceFileInputRef.current?.click()}><div className="icon-cloud-upload w-4 h-4" /></button>
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Экспорт всего рабочего пространства" onClick={handleExportWorkspace}><div className="icon-cloud-download w-4 h-4" /></button>
                    <button
                        className="w-9 h-9 rounded-lg bg-red-900/30 border border-red-500/30 hover:bg-red-900/50 flex items-center justify-center text-red-300 ml-auto" title="Удалить проект"
                        onClick={() => { if (window.confirm(`Удалить проект «${state.projectName}» безвозвратно? Отменить (Ctrl+Z) будет нельзя.`)) rawDispatch({ type: 'REMOVE_PROJECT', payload: { id: selectedPid } }); }}
                    ><div className="icon-trash-2 w-4 h-4" /></button>
                    {activePopover === 'color' && <ColorPickerPopover currentColor={state.projectColor} onColorChange={(c) => handleUpdateProject('projectColor', c)} />}
                    {activePopover === 'typography' && <TypographyPopover currentFont={state.projectFontFamily} currentSize={14} onFontChange={(f) => handleUpdateProject('projectFontFamily', f)} onSizeChange={() => {}} />}
                </div>
                <ContextDescriptionInput value={state.projectContent} placeholder="Описание проекта..." onChange={(e) => handleUpdateProject('projectContent', e.target.value, true)} onBlur={(e) => handleUpdateProject('projectContent', e.target.value, false)} />
            </div>
        );
    }

    // === Ветка: окно =========================================================
    if (id.startsWith('window:')) {
        const windowId = id.replace('window:', '');
        const win = windows[windowId];
        if (!win) return null;
        const handleUpdateWin = (field, val, skipHistory) => dispatch({ type: 'UPDATE_WINDOW_PROPERTIES', payload: { windowId, updates: { [field]: val }, skipHistory } });
        const isIsolated = (state.containerIsolation?.windowIds || []).includes(windowId);
        return (
            <div ref={barRef} className="fixed top-16 left-1/2 -translate-x-1/2 z-50 panel rounded-2xl shadow-2xl p-3 flex flex-col gap-2.5 w-[440px]">
                <div className="flex items-center justify-between gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: win.color || '#334155' }}>ОКНО</span>
                    <input className="flex-1 bg-transparent text-sm font-medium text-white outline-none border-b border-transparent focus:border-white/30" value={win.name || ''} placeholder="Без названия" onChange={(e) => handleUpdateWin('name', e.target.value, true)} onBlur={(e) => handleUpdateWin('name', e.target.value, false)} />
                    <button className="text-gray-500 hover:text-white" onClick={() => dispatch({ type: 'SET_SELECTED', payload: null })}><div className="icon-x w-4 h-4" /></button>
                </div>
                <div className="text-[10px] text-gray-500 font-mono truncate">Дорожки: {(win.lanes || []).join(' | ') || '(пусто)'}</div>
                <div className="flex items-center gap-1.5 relative flex-wrap">
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Цвет" onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}>
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: win.color || '#334155' }} />
                    </button>
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Шрифт" onClick={() => setActivePopover(activePopover === 'typography' ? null : 'typography')}><div className="icon-type w-4 h-4" /></button>
                    <button className={`w-9 h-9 rounded-lg border flex items-center justify-center ${isIsolated ? 'bg-orange-500/30 border-orange-400 text-orange-300' : 'bg-black/30 border-white/10 hover:border-white/30'}`} title="Изолировать окно" onClick={() => dispatch({ type: 'TOGGLE_CONTAINER_ISOLATION', payload: { kind: 'window', id: windowId } })}><div className="icon-scan w-4 h-4" /></button>
                    <button className="w-9 h-9 rounded-lg bg-red-900/30 border border-red-500/30 hover:bg-red-900/50 flex items-center justify-center text-red-300 ml-auto" title="Закрыть окно" onClick={() => dispatch({ type: 'CLOSE_WINDOW', payload: { windowId } })}><div className="icon-x w-4 h-4" /></button>
                    {activePopover === 'color' && <ColorPickerPopover currentColor={win.color} onColorChange={(c) => handleUpdateWin('color', c)} />}
                    {activePopover === 'typography' && <TypographyPopover currentFont={win.fontFamily} currentSize={win.fontSize} onFontChange={(f) => handleUpdateWin('fontFamily', f)} onSizeChange={(s) => handleUpdateWin('fontSize', s)} />}
                </div>
            </div>
        );
    }

    const selectedNode = nodes[id];
    const selectedFrame = frames[id];
    const selectedPort = ports[id];
    const selectedLink = links[id];
    if (!selectedNode && !selectedFrame && !selectedPort && !selectedLink) return null;

    // === Ветка: узел =========================================================
    if (selectedNode) {
        const data = selectedNode;
        const handleUpdate = (field, value, skipHistory) => dispatch({ type: 'UPDATE_NODE', payload: { id: data.id, updates: { [field]: value }, skipHistory } });
        const myFrames = (window.HierarchyUtils.framesOf(data.id, frames) || []);
        const otherFrames = Object.fromEntries(Object.entries(frames).filter(([fid]) => !myFrames.some(f => f.id === fid)));
        return (
            <div ref={barRef} className="fixed top-16 left-1/2 -translate-x-1/2 z-50 panel rounded-2xl shadow-2xl p-3 flex flex-col gap-2.5 w-[440px]">
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded shrink-0" style={{ backgroundColor: data.color || '#1a1a1a' }} />
                    <input className="flex-1 bg-transparent text-sm font-medium text-white outline-none border-b border-transparent focus:border-white/30" value={data.name || ''} onChange={(e) => handleUpdate('name', e.target.value, true)} onBlur={(e) => handleUpdate('name', e.target.value, false)} />
                    <CopyButton text={data.id} />
                    <button className="text-gray-500 hover:text-white" onClick={() => dispatch({ type: 'SET_SELECTED', payload: null })}><div className="icon-x w-4 h-4" /></button>
                </div>
                <div className="flex items-center gap-1.5 relative flex-wrap">
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Цвет" onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}>
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: data.color || '#1a1a1a' }} />
                    </button>
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Шрифт" onClick={() => setActivePopover(activePopover === 'typography' ? null : 'typography')}><div className="icon-type w-4 h-4" /></button>
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Медиа" onClick={() => setActivePopover(activePopover === 'media' ? null : 'media')}><div className="icon-image w-4 h-4" /></button>
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Значок" onClick={() => setActivePopover(activePopover === 'icon' ? null : 'icon')}><div className="icon-smile w-4 h-4" /></button>
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Добавить в рамку" onClick={() => setActivePopover(activePopover === 'frame' ? null : 'frame')}><div className="icon-square-dashed w-4 h-4" /></button>
                    <button className={`w-9 h-9 rounded-lg border flex items-center justify-center ${data.snapToGrid ? 'bg-[var(--accent-blue)]/30 border-[var(--accent-blue)] text-white' : 'bg-black/30 border-white/10 hover:border-white/30'}`} title="Прилипание к сетке" onClick={() => handleUpdate('snapToGrid', !data.snapToGrid)}><div className="icon-grid-3x3 w-4 h-4" /></button>
                    <button
                        className="w-9 h-9 rounded-lg bg-red-900/30 border border-red-500/30 hover:bg-red-900/50 flex items-center justify-center text-red-300 ml-auto" title="Удалить узел (каскадом всю ветку)"
                        onClick={() => { if (window.confirm(`Удалить узел «${data.name}» со всей веткой потомков?`)) dispatch({ type: 'REMOVE_NODE', payload: { id: data.id } }); }}
                    ><div className="icon-trash-2 w-4 h-4" /></button>

                    {activePopover === 'color' && <ColorPickerPopover currentColor={data.color} onColorChange={(c) => handleUpdate('color', c)} />}
                    {activePopover === 'typography' && <TypographyPopover currentFont={data.fontFamily} currentSize={data.fontSize} onFontChange={(f) => handleUpdate('fontFamily', f)} onSizeChange={(s) => handleUpdate('fontSize', s)} />}
                    {activePopover === 'icon' && <IconPickerPopover currentIcon={data.icon} onIconChange={(ic) => handleUpdate('icon', ic)} />}
                    {activePopover === 'frame' && <AssignToFramePopover ids={[data.id]} frames={otherFrames} onAssign={(fid) => { dispatch({ type: 'FRAME_ADD_MEMBERS', payload: { frameId: fid, ids: [data.id] } }); setActivePopover(null); }} />}
                    {activePopover === 'media' && (
                        <div className="absolute left-24 top-12 w-64 panel rounded-xl p-3 shadow-2xl z-50 flex flex-col gap-2">
                            <input className="input-field text-xs" placeholder="URL картинки" value={data.mediaUrl || ''} onChange={(e) => handleUpdate('mediaUrl', e.target.value, true)} onBlur={(e) => handleUpdate('mediaUrl', e.target.value, false)} />
                            {data.mediaUrl && <button className="text-xs text-red-300 hover:text-red-200" onClick={() => handleUpdate('mediaUrl', '')}>Удалить картинку</button>}
                        </div>
                    )}
                </div>
                {myFrames.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                        {myFrames.map(f => (
                            <span key={f.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] text-white" style={{ backgroundColor: f.color || '#0284c7' }}>
                                {f.name || f.id}
                                <button onClick={() => dispatch({ type: 'FRAME_REMOVE_MEMBERS', payload: { frameId: f.id, ids: [data.id] } })}>×</button>
                            </span>
                        ))}
                    </div>
                )}
                <ContextDescriptionInput value={data.content} placeholder="Описание узла..." onChange={(e) => handleUpdate('content', e.target.value, true)} onBlur={(e) => handleUpdate('content', e.target.value, false)} />
            </div>
        );
    }

    // === Ветка: рамка ========================================================
    if (selectedFrame) {
        const data = selectedFrame;
        const handleUpdate = (field, value, skipHistory) => dispatch({ type: 'UPDATE_FRAME', payload: { id: data.id, updates: { [field]: value }, skipHistory } });
        const laneOptions = Array.from(new Set((data.members || []).map(mid => nodes[mid] && (nodes[mid].parentId || 'root')).filter(Boolean)));
        return (
            <div ref={barRef} className="fixed top-16 left-1/2 -translate-x-1/2 z-50 panel rounded-2xl shadow-2xl p-3 flex flex-col gap-2.5 w-[440px]">
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: data.color || '#0284c7' }} />
                    <input className="flex-1 bg-transparent text-sm font-medium text-white outline-none border-b border-transparent focus:border-white/30" value={data.name || ''} onChange={(e) => handleUpdate('name', e.target.value, true)} onBlur={(e) => handleUpdate('name', e.target.value, false)} />
                    <span className="text-[10px] text-gray-500">{(data.members || []).length} узлов</span>
                    <button className="text-gray-500 hover:text-white" onClick={() => dispatch({ type: 'SET_SELECTED', payload: null })}><div className="icon-x w-4 h-4" /></button>
                </div>
                <div className="flex items-center gap-1.5 relative flex-wrap">
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Цвет" onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}>
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: data.color || '#0284c7' }} />
                    </button>
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Шрифт" onClick={() => setActivePopover(activePopover === 'typography' ? null : 'typography')}><div className="icon-type w-4 h-4" /></button>
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Открыть как окно" onClick={() => dispatch({ type: 'OPEN_FRAME_WINDOW', payload: { frameId: data.id } })}><div className="icon-app-window w-4 h-4" /></button>
                    <button
                        className="w-9 h-9 rounded-lg bg-red-900/30 border border-red-500/30 hover:bg-red-900/50 flex items-center justify-center text-red-300 ml-auto" title="Удалить рамку (узлы останутся)"
                        onClick={() => { if (window.confirm(`Удалить рамку «${data.name}»? Узлы останутся нетронутыми.`)) dispatch({ type: 'REMOVE_FRAME', payload: data.id }); }}
                    ><div className="icon-trash-2 w-4 h-4" /></button>
                    {activePopover === 'color' && <ColorPickerPopover currentColor={data.color} onColorChange={(c) => handleUpdate('color', c)} />}
                    {activePopover === 'typography' && <TypographyPopover currentFont={data.fontFamily} currentSize={data.fontSize} onFontChange={(f) => handleUpdate('fontFamily', f)} onSizeChange={(s) => handleUpdate('fontSize', s)} />}
                </div>
                {laneOptions.length > 1 && (
                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                        <span className="text-gray-500">Домашняя дорожка:</span>
                        {laneOptions.map(lid => (
                            <button key={lid} className={`px-2 py-0.5 rounded ${data.homeLaneId === lid ? 'bg-[var(--accent-blue)] text-white' : 'bg-black/30 text-gray-300 hover:bg-white/10'}`} onClick={() => handleUpdate('homeLaneId', lid)}>
                                {lid === 'root' ? 'Проект' : ((nodes[lid] && nodes[lid].name) || lid)}
                            </button>
                        ))}
                    </div>
                )}
                <ContextDescriptionInput value={data.content} placeholder="Описание рамки..." onChange={(e) => handleUpdate('content', e.target.value, true)} onBlur={(e) => handleUpdate('content', e.target.value, false)} />
            </div>
        );
    }

    // === Ветка: порт =========================================================
    if (selectedPort) {
        const data = selectedPort;
        const handleUpdate = (field, value) => dispatch({ type: 'UPDATE_PORT', payload: { id: data.id, updates: { [field]: value } } });
        const EDGE_OPTIONS = [{ id: 'left', label: 'Слева' }, { id: 'right', label: 'Справа' }, { id: 'top', label: 'Сверху' }, { id: 'bottom', label: 'Снизу' }];
        return (
            <div ref={barRef} className="fixed top-16 left-1/2 -translate-x-1/2 z-50 panel rounded-2xl shadow-2xl p-3 flex flex-col gap-2.5 w-[400px]">
                <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: data.color || '#374151' }}>ПОРТ</span>
                    <input className="flex-1 bg-transparent text-sm font-medium text-white outline-none border-b border-transparent focus:border-white/30" value={data.name || ''} onChange={(e) => handleUpdate('name', e.target.value)} />
                    <button className="text-gray-500 hover:text-white" onClick={() => dispatch({ type: 'SET_SELECTED', payload: null })}><div className="icon-x w-4 h-4" /></button>
                </div>
                <div className="flex items-center gap-1.5 relative flex-wrap">
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title={`Тип: ${data.type}`} onClick={() => handleUpdate('type', data.type === 'output' ? 'input' : 'output')}><div className={data.type === 'output' ? 'icon-arrow-up-right' : 'icon-arrow-down-left'} /></button>
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Цвет" onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}>
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: data.color || '#374151' }} />
                    </button>
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Грань" onClick={() => setActivePopover(activePopover === 'edge' ? null : 'edge')}><div className="icon-move w-4 h-4" /></button>
                    <button className="w-9 h-9 rounded-lg bg-red-900/30 border border-red-500/30 hover:bg-red-900/50 flex items-center justify-center text-red-300 ml-auto" title="Удалить порт" onClick={() => { if (window.confirm('Удалить порт?')) dispatch({ type: 'REMOVE_PORT', payload: data.id }); }}><div className="icon-trash-2 w-4 h-4" /></button>
                    {activePopover === 'color' && <ColorPickerPopover currentColor={data.color} onColorChange={(c) => handleUpdate('color', c)} />}
                    {activePopover === 'edge' && (
                        <div className="absolute left-24 top-12 w-40 panel rounded-xl p-2 shadow-2xl z-50 flex flex-col gap-1">
                            {EDGE_OPTIONS.map(o => (
                                <button key={o.id} className={`px-2 py-1.5 rounded text-left text-xs ${data.edge === o.id ? 'bg-[var(--accent-blue)] text-white' : 'hover:bg-white/10 text-gray-300'}`} onClick={() => { handleUpdate('edge', o.id); setActivePopover(null); }}>{o.label}</button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // === Ветка: связь ========================================================
    if (selectedLink) {
        const data = selectedLink;
        const handleUpdate = (field, value) => dispatch({ type: 'UPDATE_LINK', payload: { id: data.id, updates: { [field]: value } } });
        return (
            <div ref={barRef} className="fixed top-16 left-1/2 -translate-x-1/2 z-50 panel rounded-2xl shadow-2xl p-3 flex flex-col gap-2.5 w-[400px]">
                <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: data.color || '#666666' }}>СВЯЗЬ</span>
                    <span className="flex-1 text-xs text-gray-400 truncate">{data.id}</span>
                    <button className="text-gray-500 hover:text-white" onClick={() => dispatch({ type: 'SET_SELECTED', payload: null })}><div className="icon-x w-4 h-4" /></button>
                </div>
                <div className="flex items-center gap-1.5 relative">
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Стиль" onClick={() => handleUpdate('linkStyle', data.linkStyle === 'orthogonal' ? 'bezier' : 'orthogonal')}><div className="icon-route w-4 h-4" /></button>
                    <button className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 hover:border-white/30 flex items-center justify-center" title="Цвет" onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}>
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: data.color || '#666666' }} />
                    </button>
                    <button className="w-9 h-9 rounded-lg bg-red-900/30 border border-red-500/30 hover:bg-red-900/50 flex items-center justify-center text-red-300 ml-auto" title="Удалить связь" onClick={() => { if (window.confirm('Удалить связь?')) dispatch({ type: 'REMOVE_LINK', payload: data.id }); }}><div className="icon-trash-2 w-4 h-4" /></button>
                    {activePopover === 'color' && <ColorPickerPopover currentColor={data.color} onColorChange={(c) => handleUpdate('color', c)} />}
                </div>
            </div>
        );
    }

    return null;
}

if (typeof window !== 'undefined') window.ContextActionBar = ContextActionBar;
if (typeof module !== 'undefined') module.exports = ContextActionBar;
