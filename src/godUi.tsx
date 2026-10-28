import { ReactNode, createContext, useContext, useState } from 'react';

// UI state the God menu shares with the map: the speaking radius to preview
// (in tiles), or null when the speak controls aren't open.
const GodUiContext = createContext<{
  speechRadius: number | null;
  setSpeechRadius: (radius: number | null) => void;
}>({ speechRadius: null, setSpeechRadius: () => {} });

export function GodUiProvider({ children }: { children: ReactNode }) {
  const [speechRadius, setSpeechRadius] = useState<number | null>(null);
  return (
    <GodUiContext.Provider value={{ speechRadius, setSpeechRadius }}>
      {children}
    </GodUiContext.Provider>
  );
}

export const useGodUi = () => useContext(GodUiContext);
