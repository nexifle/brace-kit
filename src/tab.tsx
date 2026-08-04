import { createRoot } from 'react-dom/client';
import { App } from './components/App.tsx';
import './styles/main.css';
import { Toaster, ToastProvider } from './components/ui/index.ts';
import { useStore } from './store/index.ts';

// Run in standalone full-tab mode (mode persists for this page's store instance only)
useStore.getState().setMode('tab');

const root = createRoot(document.getElementById('root')!);
root.render(
    <>
        <ToastProvider>
            <App />
            <Toaster position="bottom-right" />
        </ToastProvider>
    </>
);
