import { createContext, useContext } from 'react';

export type LayoutMode = 'panel' | 'tab';

const LayoutModeContext = createContext<LayoutMode>('panel');

export function LayoutModeProvider({
  mode,
  children,
}: {
  mode: LayoutMode;
  children: React.ReactNode;
}) {
  return (
    <LayoutModeContext.Provider value={mode}>
      {children}
    </LayoutModeContext.Provider>
  );
}

export function useLayoutMode() {
  const mode = useContext(LayoutModeContext);

  return {
    mode,
    isTabLayout: mode === 'tab',
    isPanelLayout: mode === 'panel',
  };
}
