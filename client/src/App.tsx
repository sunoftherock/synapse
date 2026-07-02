import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api";
import type { NoteListItem, Settings } from "./types";
import Sidebar from "./components/Sidebar";
import NotePage from "./pages/NotePage";
import CapturePage from "./pages/CapturePage";
import GraphPage from "./pages/GraphPage";
import ActionsPage from "./pages/ActionsPage";
import SettingsPage from "./pages/SettingsPage";
import AskPage from "./pages/AskPage";

interface AppContextValue {
  notes: NoteListItem[];
  loaded: boolean;
  query: string;
  setQuery: (q: string) => void;
  typeFilter: string;
  setTypeFilter: (t: string) => void;
  refresh: () => Promise<void>;
  settings: Settings | null;
  refreshSettings: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside provider");
  return ctx;
}

function Home() {
  const { notes, loaded } = useApp();
  if (!loaded) return null;
  return notes.length > 0 ? <Navigate to={`/note/${notes[0].id}`} replace /> : <Navigate to="/capture" replace />;
}

export default function App() {
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);

  const refresh = useCallback(async () => {
    try {
      setNotes(await api.listNotes(query, typeFilter));
    } catch (e) {
      console.error("Failed to load notes", e);
    } finally {
      setLoaded(true);
    }
  }, [query, typeFilter]);

  const refreshSettings = useCallback(async () => {
    try {
      setSettings(await api.getSettings());
    } catch (e) {
      console.error("Failed to load settings", e);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(refresh, query ? 200 : 0);
    return () => clearTimeout(t);
  }, [refresh, query]);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  const value = useMemo(
    () => ({ notes, loaded, query, setQuery, typeFilter, setTypeFilter, refresh, settings, refreshSettings }),
    [notes, loaded, query, typeFilter, refresh, settings, refreshSettings]
  );

  return (
    <AppContext.Provider value={value}>
      <div className="app">
        <Sidebar />
        <main className="main">
          <Routes>
            <Route index element={<Home />} />
            <Route path="/note/:id" element={<NotePage />} />
            <Route path="/capture" element={<CapturePage />} />
            <Route path="/graph" element={<GraphPage />} />
            <Route path="/ask" element={<AskPage />} />
            <Route path="/actions" element={<ActionsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </AppContext.Provider>
  );
}
