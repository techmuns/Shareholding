import { Navigate, Route, Routes } from "react-router-dom";
import { SelectedCompanyProvider } from "@/state/selected-company";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CaptureHandlers } from "@/components/layout/CaptureHandlers";
import CompanySelectPage from "@/pages/CompanySelectPage";
import ShareholdingPage from "@/pages/ShareholdingPage";

export default function App() {
  return (
    <SelectedCompanyProvider>
      <CaptureHandlers />
      <DashboardShell>
        <Routes>
          <Route path="/" element={<CompanySelectPage />} />
          <Route path="/shareholding" element={<ShareholdingPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </DashboardShell>
    </SelectedCompanyProvider>
  );
}
