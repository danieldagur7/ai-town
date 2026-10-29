import { ReactNode, createContext, useContext, useState } from 'react';

type Focus = { playerId: string; n: number };

// UI state shared between the toolbar menus and the map:
// - speechRadius: the god's speaking reach to preview (tiles), or null when hidden.
// - focus: the latest request to fly the camera to a character.
const GodUiContext = createContext<{
  speechRadius: number | null;
  setSpeechRadius: (radius: number | null) => void;
  focus: Focus | null;
  focusOn: (playerId: string) => void;
}>({ speechRadius: null, setSpeechRadius: () => {}, focus: null, focusOn: () => {} });

export function GodUiProvider({ children }: { children: ReactNode }) {
  const [speechRadius, setSpeechRadius] = useState<number | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const focusOn = (playerId: string) => setFocus((f) => ({ playerId, n: (f?.n ?? 0) + 1 }));
  return (
    <GodUiContext.Provider value={{ speechRadius, setSpeechRadius, focus, focusOn }}>
      {children}
    </GodUiContext.Provider>
  );
}

export const useGodUi = () => useContext(GodUiContext);
