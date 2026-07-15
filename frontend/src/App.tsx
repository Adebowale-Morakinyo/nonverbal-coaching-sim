import { AnimatePresence, motion } from "framer-motion";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { InterviewPage } from "./pages/InterviewPage";
import { ReportPage } from "./pages/ReportPage";
import { SetupPage } from "./pages/SetupPage";

export default function App() {
  return (
    <BrowserRouter>
      <AnimatedRoutes />
    </BrowserRouter>
  );
}

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <Routes location={location}>
          <Route path="/" element={<SetupPage />} />
          <Route path="/session/:id" element={<InterviewPage />} />
          <Route path="/session/:id/report" element={<ReportPage />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}
