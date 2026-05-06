import { useState } from "react";
import { CreditCard, Check, Zap, ArrowRight, Star } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import axios from "axios";
import { API } from "@/apiBase";

const plans = [
  {
    id: "free",
    name: "Free",
    price: "0",
    period: "forever",
    desc: "Perfect for getting started",
    features: ["1 home", "Up to 5 devices", "Basic dashboard", "Email alerts", "2 family members", "7-day history"],
    limits: ["No advanced analytics", "Limited homes"],
    color: "border-slate-200",
    badge: null,
  },
  {
    id: "pro",
    name: "Pro",
    price: "999",
    period: "month",
    desc: "For power users & families",
    features: ["Unlimited homes", "Unlimited devices", "Advanced analytics", "Priority support", "Unlimited family members", "1-year history", "Automation rules", "Energy reports"],
    limits: [],
    color: "border-indigo-300",
    badge: "Most Popular",
  },
];

export default function SubscriptionPage() {
  const { user, setUser } = useAuth();
  const [upgrading, setUpgrading] = useState(false);
  const [upgraded, setUpgraded] = useState(false);
  const currentPlan = user?.subscription || "free";

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      await axios.post(`${API}/subscription/upgrade`, {}, { withCredentials: true });
      setUser(prev => ({ ...prev, subscription: "pro" }));
      setUpgraded(true);
    } catch {}
    setUpgrading(false);
  };

  return (
    <AppLayout>
      <div data-testid="subscription-page">
        <div className="mb-8 animate-fade-in-up">
          <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Subscription</h1>
          <p className="text-slate-500 mt-1">Manage your Cohome plan</p>
        </div>

        {/* Current Plan Banner */}
        <div className={`rounded-3xl p-6 mb-8 border animate-fade-in-up ${currentPlan === "pro" ? "bg-indigo-600 border-indigo-500 text-white" : "bg-white border-slate-200 shadow-soft"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${currentPlan === "pro" ? "bg-white/20" : "bg-indigo-50"}`}>
                <CreditCard size={22} className={currentPlan === "pro" ? "text-white" : "text-indigo-600"} />
              </div>
              <div>
                <p className={`text-sm ${currentPlan === "pro" ? "text-white/70" : "text-slate-500"}`}>Current Plan</p>
                <p className={`text-2xl font-bold capitalize ${currentPlan === "pro" ? "text-white" : "text-slate-800"}`} style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {currentPlan === "pro" ? "Pro Plan" : "Free Plan"}
                </p>
              </div>
            </div>
            {currentPlan === "pro" && (
              <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full">
                <Star size={14} className="text-white" fill="white" />
                <span className="text-white font-semibold text-sm">Active</span>
              </div>
            )}
          </div>
          {upgraded && (
            <div className="mt-4 bg-white/20 rounded-xl p-3 text-white text-sm font-medium text-center">
              Welcome to Pro! All features are now unlocked.
            </div>
          )}
        </div>

        {/* Plans */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl">
          {plans.map((plan, i) => {
            const isCurrentPlan = currentPlan === plan.id;
            return (
              <div key={plan.id}
                className={`bg-white rounded-3xl border-2 p-8 shadow-soft hover:shadow-card transition-all animate-fade-in-up ${plan.color} ${isCurrentPlan ? 'ring-2 ring-indigo-300 ring-offset-2' : ''}`}
                style={{ animationDelay: `${i * 0.1}s` }}>
                {plan.badge && (
                  <div className="inline-flex items-center gap-1.5 bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-full mb-5">
                    <Star size={11} fill="white" /> {plan.badge}
                  </div>
                )}
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-slate-800 mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>{plan.name}</h2>
                  <p className="text-slate-500 text-sm">{plan.desc}</p>
                  <div className="flex items-baseline gap-1 mt-4">
                    <span className="text-sm text-slate-500">PKR</span>
                    <span className="text-4xl font-bold text-slate-800" style={{ fontFamily: 'Outfit, sans-serif' }}>{plan.price}</span>
                    <span className="text-slate-400 text-sm">/{plan.period}</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-3 text-sm text-slate-600">
                      <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Check size={11} className="text-green-600" />
                      </div>
                      {f}
                    </li>
                  ))}
                  {plan.limits.map(f => (
                    <li key={f} className="flex items-center gap-3 text-sm text-slate-400">
                      <div className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-slate-400 text-xs">×</span>
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrentPlan ? (
                  <div className="w-full py-3 bg-slate-100 text-slate-500 rounded-full text-sm font-semibold text-center flex items-center justify-center gap-2">
                    <Check size={15} /> Current Plan
                  </div>
                ) : plan.id === "pro" ? (
                  <button data-testid="upgrade-btn" onClick={handleUpgrade} disabled={upgrading}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-full transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2">
                    {upgrading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Zap size={16} /> Upgrade to Pro <ArrowRight size={16} /></>}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Note */}
        <div className="mt-8 bg-amber-50 border border-amber-100 rounded-2xl p-4 max-w-4xl animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <p className="text-amber-700 text-sm">
            <span className="font-semibold">Payment integration coming soon.</span> Currently upgrading is free for early users. Stripe payment will be integrated in the next release.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
