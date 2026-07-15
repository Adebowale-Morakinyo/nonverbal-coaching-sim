import { BrowserRouter, Route, Routes } from "react-router-dom";
import { InterviewPage } from "./pages/InterviewPage";
import { ReportPage } from "./pages/ReportPage";
import { SetupPage } from "./pages/SetupPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SetupPage />} />
        <Route path="/session/:id" element={<InterviewPage />} />
        <Route path="/session/:id/report" element={<ReportPage />} />
      </Routes>
    </BrowserRouter>
  );
}
