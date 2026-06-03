class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0f1115] text-white">
          <div className="text-center glass-panel p-8 rounded-lg">
            <h1 className="text-2xl font-bold mb-4 flex items-center justify-center gap-2">
              <span className="icon-triangle-alert text-red-500"></span> Системная ошибка
            </h1>
            <p className="text-gray-400 mb-6">Произошел сбой в рендеринге компонента.</p>
            <button onClick={() => window.location.reload()} className="btn btn-primary w-full">
              Перезагрузить
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  try {
    return (
      <StoreProvider>
        <div className="w-screen h-screen flex overflow-hidden relative" data-name="app" data-file="app.js">
          <Canvas />
          <Toolbar />
          <Library />
          <PropertyPanel />
        </div>
      </StoreProvider>
    );
  } catch (error) {
    console.error('App component error:', error);
    return null;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);