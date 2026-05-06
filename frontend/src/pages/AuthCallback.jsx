import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import axios from "axios";
import { API } from "@/apiBase";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser, setHomes, setSelectedHomeId } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Use useRef to prevent double-processing under React StrictMode
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace('#', '?'));
    const sessionId = params.get('session_id');

    if (!sessionId) {
      navigate('/login', { replace: true });
      return;
    }

    const exchangeSession = async () => {
      try {
        const res = await axios.post(`${API}/auth/google/session`, { session_id: sessionId }, { withCredentials: true });
        setUser(res.data.user);
        // Load homes
        try {
          const homesRes = await axios.get(`${API}/homes`, { withCredentials: true });
          setHomes(homesRes.data);
          if (homesRes.data.length > 0) setSelectedHomeId(homesRes.data[0].home_id);
        } catch {}
        navigate('/dashboard', { replace: true, state: { user: res.data.user } });
      } catch {
        navigate('/login?error=auth_failed', { replace: true });
      }
    };

    exchangeSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-700 font-semibold text-lg">Signing you in...</p>
        <p className="text-slate-500 text-sm">Please wait while we verify your account</p>
      </div>
    </div>
  );
}
