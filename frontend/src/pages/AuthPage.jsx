import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Zap, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function AuthPage({ mode = "login" }) {
  const [isLogin, setIsLogin] = useState(mode === "login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login, register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const authError = searchParams.get("error");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isLogin) {
        await login(form.email, form.password);
      } else {
        if (!form.name.trim()) { setError("Name is required"); setLoading(false); return; }
        await register(form.name, form.email, form.password);
      }
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors">
          <ArrowLeft size={18} />
          <span className="text-sm font-medium">Back to home</span>
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200">
            <Zap size={14} className="text-white" />
          </div>
          <span className="font-bold text-slate-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Cohome</span>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="bg-white rounded-3xl shadow-soft border border-slate-100 p-8 animate-fade-in-up">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {isLogin ? "Welcome back" : "Create account"}
              </h1>
              <p className="text-slate-500 text-sm">
                {isLogin ? "Sign in to your Cohome dashboard" : "Start managing your smart home today"}
              </p>
            </div>

            {/* Google Button */}
            <button
              data-testid="google-auth-btn"
              onClick={loginWithGoogle}
              className="w-full flex items-center justify-center gap-3 border border-slate-200 rounded-full py-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95 mb-6"
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
              Continue with Google
            </button>

            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 font-medium">or</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* Error */}
            {(error || authError) && (
              <div data-testid="auth-error" className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-5 text-sm text-rose-700">
                {error || "Authentication failed. Please try again."}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                  <input
                    data-testid="name-input"
                    type="text"
                    placeholder="Ahmed Khan"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all text-sm"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <input
                  data-testid="email-input"
                  type="email"
                  placeholder="ahmed@example.com"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  required
                  className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    data-testid="password-input"
                    type={showPassword ? "text" : "password"}
                    placeholder={isLogin ? "Your password" : "At least 8 characters"}
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    required
                    className="w-full h-12 px-4 pr-12 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all text-sm"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <button
                data-testid="submit-auth-btn"
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold rounded-full transition-all active:scale-95 flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (isLogin ? "Sign In" : "Create Account")}
              </button>
            </form>

            <p className="text-center text-sm text-slate-500 mt-6">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <button
                data-testid="toggle-auth-mode"
                onClick={() => { setIsLogin(!isLogin); setError(""); setForm({ name: "", email: "", password: "" }); }}
                className="text-indigo-600 font-semibold hover:text-indigo-700 transition-colors"
              >
                {isLogin ? "Sign up free" : "Sign in"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
