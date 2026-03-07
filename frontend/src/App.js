import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LandingPage from "@/pages/LandingPage";
import AuthPage from "@/pages/AuthPage";
import AuthCallback from "@/pages/AuthCallback";
import Dashboard from "@/pages/Dashboard";
import SolarPage from "@/pages/SolarPage";
import SecurityPage from "@/pages/SecurityPage";
import ClimatePage from "@/pages/ClimatePage";
import DoorbellPage from "@/pages/DoorbellPage";
import HomesPage from "@/pages/HomesPage";
import FamilyPage from "@/pages/FamilyPage";
import SettingsPage from "@/pages/SettingsPage";
import SubscriptionPage from "@/pages/SubscriptionPage";
import AlertsPage from "@/pages/AlertsPage";
import "@/App.css";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-600 font-medium">Loading Cohome...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function AppRouter() {
  const location = useLocation();

  // Detect session_id in URL fragment synchronously - prevents race conditions
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/solar" element={<ProtectedRoute><SolarPage /></ProtectedRoute>} />
      <Route path="/security" element={<ProtectedRoute><SecurityPage /></ProtectedRoute>} />
      <Route path="/climate" element={<ProtectedRoute><ClimatePage /></ProtectedRoute>} />
      <Route path="/doorbell" element={<ProtectedRoute><DoorbellPage /></ProtectedRoute>} />
      <Route path="/homes" element={<ProtectedRoute><HomesPage /></ProtectedRoute>} />
      <Route path="/family" element={<ProtectedRoute><FamilyPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/subscription" element={<ProtectedRoute><SubscriptionPage /></ProtectedRoute>} />
      <Route path="/alerts" element={<ProtectedRoute><AlertsPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
