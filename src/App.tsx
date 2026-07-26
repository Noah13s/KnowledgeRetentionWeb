import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import BottomNav from "./components/BottomNav";
import CategoryPage from "./pages/main/CategoryEditor";
import ImagePage from "./pages/main/ImageLibrary";
import AiSettingsPage from './pages/main/AiSettingsPage';
import { warmupLocalLlmIfDownloaded } from './lib/localLlm';

export default function App() {
  const [readyNotification, setReadyNotification] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function warmupModel() {
      const warmed = await warmupLocalLlmIfDownloaded();
      if (!active || !warmed) return;

      const message = 'AI model is downloaded and ready to use.';
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('AI model ready', { body: message });
      }

      setReadyNotification(message);
      window.setTimeout(() => {
        if (active) setReadyNotification(null);
      }, 8000);
    }

    warmupModel();
    return () => {
      active = false;
    };
  }, []);

  return (
    <BrowserRouter>
      {/* 1. Added an outer wrapper locked to 100vh */}
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
        {readyNotification && (
          <div
            style={{
              background: '#2ecc71',
              color: 'white',
              padding: '10px 14px',
              textAlign: 'center',
              fontWeight: 500,
            }}
          >
            {readyNotification}
          </div>
        )}

        {/* 2. Added minHeight: 0 to the routing container so children can scroll */}
        <div style={{ flex: "1", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <Routes>
            <Route path="/" element={<Navigate to="/image" replace />} />
            <Route path="/image" element={<ImagePage />} />
            <Route path="/ai" element={<AiSettingsPage />} />
            <Route path="/category" element={<CategoryPage />} />
          </Routes>
        </div>

        {/* 3. BottomNav naturally sits at the bottom now */}
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}