import { createRoot } from 'react-dom/client';
import { App } from './components/App.tsx';
import './styles/main.css';
import { Toaster, ToastProvider } from './components/ui/index.ts';
import { useStore } from './store/index.ts';

// Run in standalone full-tab mode (mode persists for this page's store instance only)
useStore.getState().setMode('tab');

// A tab opened with ?open=slide-creator (from the sidebar suggestion dialog)
// should land directly in the Slide Creator workspace.
if (new URLSearchParams(location.search).get('open') === 'slide-creator') {
  useStore.getState().openSlideCreator();
}

const root = createRoot(document.getElementById('root')!);
root.render(
    <>
        <ToastProvider>
            <App />
            <Toaster position="bottom-right" />
        </ToastProvider>
    </>
);
