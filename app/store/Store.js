// Провайдер стора: React-обвязка вокруг чистого редьюсера из store/reducer.js
const { createContext, useReducer, useContext } = React;

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