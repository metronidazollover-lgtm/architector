function Toolbar() {
    const { dispatch, state } = useStore();
    const fileInputRef = React.useRef(null);

    // Новые сущности получают parentId = currentContext, а их position относительна
    // родителю (v10). Мировую точку центра экрана переводим в систему контекста.
    const toContextRelative = (worldX, worldY) => {
        const ctxAbs = window.HierarchyUtils.getAbsolutePosition(state.currentContext, state.nodes, state.layers);
        return { x: worldX - ctxAbs.x, y: worldY - ctxAbs.y };
    };

    const handleExport = () => {
        const data = {
            formatVersion: state.formatVersion || 10,
            layers: state.layers,
            nodes: state.nodes,
            ports: state.ports,
            links: state.links,
            canvas: state.canvas,
            currentContext: state.currentContext,
            breadcrumbs: state.breadcrumbs,
            cameraByContext: state.cameraByContext || {}
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

    const handleImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.nodes && data.ports && data.links) {
                    dispatch({ type: 'LOAD_STATE', payload: data });
                } else {
                    console.error('Некорректный файл проекта');
                }
            } catch (err) {
                console.error('Ошибка чтения файла', err);
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset
    };

    const addNode = () => {
        // Position at center of view based on offset and zoom
        const centerX = (-state.canvas.offset.x + window.innerWidth / 2) / state.canvas.zoom;
        const centerY = (-state.canvas.offset.y + window.innerHeight / 2) / state.canvas.zoom;

        dispatch({
            type: 'ADD_NODE',
            payload: {
                name: 'New Node',
                position: toContextRelative(centerX - 100, centerY - 50),
                size: { w: 200, h: 100 },
                color: '#1a1a1a',
                shape: 'rectangle'
            }
        });
    };

    const clearCanvas = () => {
        const templateState = {
            layers: {},
            nodes: {},
            ports: {},
            links: []
        };
        dispatch({ type: 'LOAD_STATE', payload: templateState });
    };

    return (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 glass-panel rounded-xl shadow-2xl p-2 flex flex-col gap-2 z-40 border-[#444]" data-file="components/Toolbar.js">
            <button 
                className={`btn w-10 h-10 p-0 rounded-md ${state.ui.libraryOpen && state.ui.libraryTab === 'objects' ? 'bg-[var(--accent-blue)] text-white border-[var(--accent-blue)]' : 'text-gray-400 hover:text-white'}`}
                onClick={() => state.ui.libraryOpen && state.ui.libraryTab === 'objects' ? dispatch({ type: 'TOGGLE_UI', payload: 'libraryOpen' }) : dispatch({ type: 'SET_LIBRARY_TAB', payload: 'objects' })}
                title="Обозреватель проекта (Библиотека)"
            >
                <div className="icon-list text-xl"></div>
            </button>

            <div className="w-full h-px bg-[#333] my-1"></div>

            <button 
                className="btn btn-primary w-10 h-10 p-0 rounded-md"
                onClick={addNode}
                title="Быстрый пустой узел"
            >
                <div className="icon-square-plus text-xl"></div>
            </button>

            <button 
                className="btn w-10 h-10 p-0 rounded-md text-orange-400 hover:text-orange-300 hover:bg-white/5 border border-transparent"
                onClick={() => {
                    const centerX = (-state.canvas.offset.x + window.innerWidth / 2) / state.canvas.zoom;
                    const centerY = (-state.canvas.offset.y + window.innerHeight / 2) / state.canvas.zoom;
                    dispatch({
                        type: 'ADD_LAYER',
                        payload: {
                            name: 'Новый слой',
                            position: toContextRelative(centerX - 300, centerY - 200),
                            size: { w: 600, h: 400 },
                            color: '#ff9500'
                        }
                    });
                }}
                title="Добавить слой"
            >
                <div className="icon-layers text-xl"></div>
            </button>

            <button 
                className={`btn w-10 h-10 p-0 rounded-md ${state.interactionMode === 'add-port' ? 'btn-primary' : 'text-gray-400 hover:text-white'}`}
                title="Добавить порт (Кликните по краю узла)"
                onClick={() => dispatch({ type: 'SET_MODE', payload: state.interactionMode === 'add-port' ? 'default' : 'add-port' })}
            >
                <div className="icon-circle text-xl"></div>
            </button>

            <div className="w-full h-px bg-[#333] my-1"></div>

            <button 
                className={`btn w-10 h-10 p-0 rounded-md transition-colors ${state.isolatedIds.length > 0 ? 'bg-orange-500 text-white hover:bg-orange-600' : 'text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed'}`}
                title={state.isolatedIds.length > 0 ? "Отключить изоляцию" : "Изолировать выделенные элементы"}
                disabled={state.selectedIds.length === 0 && state.isolatedIds.length === 0}
                onClick={() => {
                    if (state.isolatedIds.length > 0) {
                        dispatch({ type: 'SET_ISOLATED', payload: [] });
                    } else {
                        dispatch({ type: 'SET_ISOLATED', payload: [...state.selectedIds] });
                        dispatch({ type: 'SET_SELECTED', payload: null }); // clear selection after isolate
                    }
                }}
            >
                <div className="icon-scan text-xl"></div>
            </button>

            <button 
                className="btn w-10 h-10 p-0 rounded-md text-gray-400 hover:text-white"
                title="Сбросить вид"
                onClick={() => dispatch({ type: 'SET_CANVAS', payload: { offset: {x:0, y:0}, zoom: 1 }})}
            >
                <div className="icon-house text-xl"></div>
            </button>

            <div className="w-full h-px bg-[#333] my-1"></div>

            <button 
                className={`btn w-10 h-10 p-0 rounded-md ${state.selectedIds && state.selectedIds.length > 0 && state.nodes[state.selectedIds[0]]?.type === 'ai-agent' ? 'bg-purple-600 text-white border-purple-500 shadow-[0_0_15px_rgba(147,51,234,0.5)]' : 'text-purple-400 hover:text-purple-300'}`}
                title="Ассистент"
                onClick={() => {
                    dispatch({
                        type: 'ADD_NODE',
                        payload: {
                            name: '💬 AI Assistant Copilot',
                            type: 'ai-agent',
                            position: toContextRelative(-state.canvas.offset.x / state.canvas.zoom + 200, -state.canvas.offset.y / state.canvas.zoom + 100),
                            size: { w: 320, h: 450 },
                            color: '#3b0764'
                        }
                    });
                }}
            >
                <div className="icon-bot text-xl"></div>
            </button>

            <div className="w-full h-px bg-[#333] my-1"></div>

            <button 
                className="btn w-10 h-10 p-0 rounded-md text-gray-400 hover:text-white"
                title="Импорт проекта"
                onClick={() => fileInputRef.current?.click()}
            >
                <div className="icon-upload text-xl"></div>
            </button>
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".json"
                onChange={handleImport}
            />

            <button 
                className="btn w-10 h-10 p-0 rounded-md text-gray-400 hover:text-white"
                title="Экспорт проекта"
                onClick={handleExport}
            >
                <div className="icon-download text-xl"></div>
            </button>

            <button 
                className="btn w-10 h-10 p-0 rounded-md text-red-500/80 hover:text-red-400 hover:bg-red-500/10"
                title="Очистить проект (Удалить все сохранения)"
                onClick={() => {
                    if (window.confirm('Вы уверены, что хотите полностью очистить холст и удалить все сохранения?')) {
                        localStorage.removeItem('architector_state_v9');
                        window.location.reload();
                    }
                }}
            >
                <div className="icon-rotate-ccw text-xl"></div>
            </button>

            <div className="w-full h-px bg-[#333] my-1"></div>
            <div className="text-center text-[10px] text-gray-500 font-mono" title="Масштаб">
                {Math.round(state.canvas.zoom * 100)}%
            </div>
        </div>
    );
}