import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ForgePage } from "./pages/ForgePage";
import { EvolvePage } from "./pages/EvolvePage";
import { HubPage } from "./pages/HubPage";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/forge" replace />} />
          <Route path="/forge" element={<ForgePage />} />
          <Route path="/evolve" element={<EvolvePage />} />
          <Route path="/hub" element={<HubPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
