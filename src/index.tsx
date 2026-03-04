import { createRoot } from 'react-dom/client';
import { App } from './components/App.tsx';
import './styles/main.css';
import { Toaster, ToastProvider } from './components/ui/index.ts';

const root = createRoot(document.getElementById('root')!);
root.render(
    <>
        <ToastProvider>
            <App />
            <Toaster position="bottom-right" />
        </ToastProvider>
    </>
);
