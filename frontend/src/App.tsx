import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthGate } from "./auth/AuthContext";
import { Nav } from "./components/Nav";
import { DocumentsPage } from "./pages/DocumentsPage";
import { UploadPage } from "./pages/UploadPage";
import { DocumentDetailPage } from "./pages/DocumentDetailPage";
import { ReviewPage } from "./pages/ReviewPage";
import { EvalPage } from "./pages/EvalPage";
import { EvalRunDetailPage } from "./pages/EvalRunDetailPage";

function App() {
  return (
    <AuthGate>
      <BrowserRouter>
        <div className="min-h-screen">
          <Nav />
          <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
            <Routes>
              <Route path="/" element={<Navigate to="/documents" replace />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/documents/upload" element={<UploadPage />} />
              <Route path="/documents/:sourceId" element={<DocumentDetailPage />} />
              <Route path="/review" element={<ReviewPage />} />
              <Route path="/eval" element={<EvalPage />} />
              <Route path="/eval/:runId" element={<EvalRunDetailPage />} />
              <Route path="*" element={<Navigate to="/documents" replace />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthGate>
  );
}

export default App;
