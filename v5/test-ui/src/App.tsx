import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { PotDetail } from "./pages/PotDetail";
import { CoreContracts } from "./pages/CoreContracts";
import { ContractCall } from "./pages/ContractCall";
import { DeployPot } from "./pages/DeployPot";

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route
              path="pot/:address/:name"
              element={<PotDetail />}
            />
            <Route path="deploy" element={<DeployPot />} />
            <Route path="core" element={<CoreContracts />} />
            <Route path="call" element={<ContractCall />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
