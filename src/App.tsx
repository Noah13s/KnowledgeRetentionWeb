import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import BottomNav from "./components/BottomNav";
import CategoryPage from "./pages/main/CategoryEditor";
import ImagePage from "./pages/main/ImageLibrary";
import AiSettingsPage from './pages/main/AiSettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      {/* 1. Added an outer wrapper locked to 100vh */}
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
        
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