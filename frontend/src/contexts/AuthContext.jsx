import { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedHomeId, setSelectedHomeId] = useState(null);
  const [homes, setHomes] = useState([]);

  const loadHomes = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/homes`, { withCredentials: true });
      setHomes(res.data);
      setSelectedHomeId(prev => prev || (res.data.length > 0 ? res.data[0].home_id : null));
    } catch {
      setHomes([]);
    }
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/auth/me`, { withCredentials: true });
      setUser(res.data);
      await loadHomes();
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [loadHomes]);

  useEffect(() => {
    // CRITICAL: If returning from OAuth callback, skip the /me check.
    // AuthCallback will exchange the session_id and establish the session first.
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    if (window.location.hash?.includes('session_id=')) {
      setLoading(false);
      return;
    }
    checkAuth();
  }, [checkAuth]);

  const login = async (email, password) => {
    const res = await axios.post(`${API}/auth/login`, { email, password }, { withCredentials: true });
    setUser(res.data.user);
    await loadHomes();
    return res.data;
  };

  const register = async (name, email, password) => {
    const res = await axios.post(`${API}/auth/register`, { name, email, password }, { withCredentials: true });
    setUser(res.data.user);
    await loadHomes();
    return res.data;
  };

  const loginWithGoogle = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + '/dashboard';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const logout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
    } catch {}
    setUser(null);
    setHomes([]);
    setSelectedHomeId(null);
  };

  const refreshHomes = loadHomes;

  const selectedHome = homes.find(h => h.home_id === selectedHomeId) || homes[0];

  return (
    <AuthContext.Provider value={{
      user, loading, homes, selectedHomeId, selectedHome,
      setSelectedHomeId, setUser, setHomes,
      login, register, loginWithGoogle, logout, refreshHomes,
      isAuthenticated: !!user
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
