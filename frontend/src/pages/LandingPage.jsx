import { Link } from "react-router-dom";
import { Sun, Shield, Thermometer, Bell, Home, Users, Zap, ArrowRight, Check, Star } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const features = [
  { icon: Sun, label: "Solar Monitor", desc: "Track energy generation, battery level, and monthly savings in real-time.", color: "bg-amber-50 text-amber-600", border: "border-amber-100" },
  { icon: Shield, label: "Security", desc: "Monitor cameras, control smart doors & gates, and get motion alerts.", color: "bg-rose-50 text-rose-600", border: "border-rose-100" },
  { icon: Thermometer, label: "Climate Control", desc: "Control your geyser remotely, set schedules, and save energy.", color: "bg-sky-50 text-sky-600", border: "border-sky-100" },
  { icon: Bell, label: "Smart Doorbell", desc: "See who's at your door from anywhere, anytime.", color: "bg-violet-50 text-violet-600", border: "border-violet-100" },
  { icon: Home, label: "Multi-Home", desc: "Manage multiple properties from a single dashboard.", color: "bg-emerald-50 text-emerald-600", border: "border-emerald-100" },
  { icon: Users, label: "Family Access", desc: "Share access with family members with role-based permissions.", color: "bg-indigo-50 text-indigo-600", border: "border-indigo-100" },
];

const plans = [
  { name: "Free", price: "0", period: "forever", features: ["1 Home", "Up to 5 devices", "Basic dashboard", "Email alerts", "2 family members"], cta: "Get Started Free", primary: false },
  { name: "Pro", price: "999", period: "month", features: ["Unlimited homes", "Unlimited devices", "Advanced analytics", "Priority support", "Unlimited family members", "Automation rules", "Historical data (1 year)"], cta: "Start Pro Trial", primary: true },
];

export default function LandingPage() {
  const { loginWithGoogle } = useAuth();

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: 'DM Sans, sans-serif' }}>
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <Zap size={18} className="text-white" />
            </div>
            <span className="font-bold text-xl text-slate-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Cohome</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-600">
            <a href="#features" className="hover:text-slate-900 transition-colors">Features</a>
            <a href="#pricing" className="hover:text-slate-900 transition-colors">Pricing</a>
            <a href="#security" className="hover:text-slate-900 transition-colors">Security</a>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" data-testid="login-btn" className="text-sm font-medium text-slate-600 hover:text-slate-900 px-4 py-2 rounded-full hover:bg-slate-100 transition-all">
              Login
            </Link>
            <Link to="/register" data-testid="get-started-btn" className="text-sm font-semibold bg-indigo-600 text-white px-5 py-2.5 rounded-full hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-200 transition-all active:scale-95">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 pb-24 px-6">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(79, 70, 229, 0.08) 0%, rgba(255,255,255,0) 70%)' }} />
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="animate-fade-in-up">
              <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-xs font-semibold px-4 py-2 rounded-full border border-indigo-100 mb-6">
                <Star size={12} fill="currentColor" /> Pakistan's #1 Smart Home Platform
              </div>
              <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 leading-tight tracking-tight mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Your Entire Home,<br />
                <span className="text-indigo-600">One Dashboard</span>
              </h1>
              <p className="text-lg text-slate-600 leading-relaxed mb-8 max-w-lg">
                Manage solar panels, security cameras, smart doors, geyser, and more — all from one beautiful, secure app built for Pakistani homes.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link to="/register" data-testid="hero-get-started-btn"
                  className="inline-flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold px-8 py-4 rounded-full hover:bg-indigo-700 hover:shadow-xl hover:shadow-indigo-200 transition-all active:scale-95">
                  Start for Free <ArrowRight size={18} />
                </Link>
                <button onClick={loginWithGoogle} data-testid="hero-google-btn"
                  className="inline-flex items-center justify-center gap-3 bg-white text-slate-800 font-medium px-8 py-4 rounded-full border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all active:scale-95">
                  <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
                  Continue with Google
                </button>
              </div>
              <p className="mt-4 text-sm text-slate-500">No credit card required. Free plan includes 1 home & 5 devices.</p>
            </div>

            <div className="relative animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-slate-200">
                <img
                  src="https://images.unsplash.com/photo-1687865014576-9ae3570f550a?crop=entropy&cs=srgb&fm=jpg&w=800&q=80"
                  alt="Modern smart home with solar panels"
                  className="w-full h-80 object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 flex gap-3">
                  <div className="bg-white/95 backdrop-blur rounded-2xl px-4 py-3 flex items-center gap-3 flex-1">
                    <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center">
                      <Sun size={16} className="text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Solar Today</p>
                      <p className="text-sm font-bold text-slate-800">18.6 kWh</p>
                    </div>
                  </div>
                  <div className="bg-white/95 backdrop-blur rounded-2xl px-4 py-3 flex items-center gap-3 flex-1">
                    <div className="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center">
                      <Shield size={16} className="text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Security</p>
                      <p className="text-sm font-bold text-slate-800">All Secure</p>
                    </div>
                  </div>
                </div>
              </div>
              {/* Floating device count */}
              <div className="absolute -top-3 -right-3 bg-indigo-600 text-white rounded-2xl px-4 py-2 shadow-lg shadow-indigo-200">
                <p className="text-xs font-medium">7 Devices</p>
                <p className="text-xs opacity-80">Connected</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 px-6 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-bold text-slate-900 mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>Everything Under One Roof</h2>
            <p className="text-slate-600 max-w-xl mx-auto">From solar monitoring to security — Cohome connects all your smart devices in one powerful platform.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, label, desc, color, border }, i) => (
              <div key={label}
                className={`bg-white border ${border} rounded-3xl p-8 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 animate-fade-in-up`}
                style={{ animationDelay: `${i * 0.07}s` }}>
                <div className={`w-12 h-12 ${color} rounded-2xl flex items-center justify-center mb-5 border ${border}`}>
                  <Icon size={22} />
                </div>
                <h3 className="font-semibold text-slate-800 text-lg mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>{label}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section id="security" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-3xl p-10 md:p-16 text-white">
            <div className="grid md:grid-cols-2 gap-10 items-center">
              <div>
                <div className="inline-flex items-center gap-2 bg-white/10 text-white/90 text-xs font-semibold px-4 py-2 rounded-full border border-white/20 mb-6">
                  <Shield size={12} /> Enterprise-Grade Security
                </div>
                <h2 className="text-4xl font-bold mb-5" style={{ fontFamily: 'Outfit, sans-serif' }}>Built for Security, From the Ground Up</h2>
                <p className="text-white/70 leading-relaxed mb-8">Your home's security is our top priority. Every connection is encrypted, every session authenticated, and your data stays private.</p>
                <div className="space-y-3">
                  {["End-to-end encrypted device communication", "JWT session tokens with 7-day expiry", "Multi-factor authentication support", "Role-based access for family members"].map(f => (
                    <div key={f} className="flex items-center gap-3">
                      <div className="w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <Check size={11} />
                      </div>
                      <span className="text-white/80 text-sm">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative">
                <img
                  src="https://images.unsplash.com/photo-1759771618528-8179a49ae81a?crop=entropy&cs=srgb&fm=jpg&w=600&q=80"
                  alt="Security camera"
                  className="rounded-2xl w-full h-64 object-cover opacity-80"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-bold text-slate-900 mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>Simple, Honest Pricing</h2>
            <p className="text-slate-600">Start free. Upgrade when you're ready.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {plans.map(({ name, price, period, features: planFeatures, cta, primary }) => (
              <div key={name}
                className={`rounded-3xl p-8 ${primary ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-200 scale-105' : 'bg-white border border-slate-200'}`}>
                <div className="mb-6">
                  <h3 className="text-xl font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>{name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs">PKR</span>
                    <span className="text-4xl font-bold">{price}</span>
                    <span className={`text-sm ${primary ? 'text-white/70' : 'text-slate-500'}`}>/{period}</span>
                  </div>
                </div>
                <ul className="space-y-3 mb-8">
                  {planFeatures.map(f => (
                    <li key={f} className="flex items-center gap-3 text-sm">
                      <Check size={15} className={primary ? 'text-white' : 'text-indigo-600'} />
                      <span className={primary ? 'text-white/90' : 'text-slate-600'}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/register" data-testid={`pricing-${name.toLowerCase()}-btn`}
                  className={`block text-center font-semibold py-3 rounded-full transition-all active:scale-95 ${primary ? 'bg-white text-indigo-600 hover:bg-indigo-50' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                  {cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-slate-100">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Zap size={14} className="text-white" />
            </div>
            <span className="font-bold text-slate-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Cohome</span>
          </div>
          <p className="text-slate-500 text-sm">© 2025 Cohome. Making Pakistani homes smarter.</p>
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <a href="#" className="hover:text-slate-800 transition-colors">Privacy</a>
            <a href="#" className="hover:text-slate-800 transition-colors">Terms</a>
            <a href="#" className="hover:text-slate-800 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
