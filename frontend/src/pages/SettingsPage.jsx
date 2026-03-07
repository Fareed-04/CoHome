import { useState } from "react";
import { User, Shield, Bell, Eye, EyeOff, CheckCircle } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SettingsPage() {
  const { user, setUser } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const [profileForm, setProfileForm] = useState({ name: user?.name || "" });
  const [pwForm, setPwForm] = useState({ current: "", new: "", confirm: "" });
  const [showPw, setShowPw] = useState({ current: false, new: false });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const [notifications, setNotifications] = useState({
    motion_alerts: true, door_alerts: true, solar_alerts: false, geyser_alerts: true
  });

  const handleProfileSave = async () => {
    setSaving(true); setError(""); setSuccess("");
    try {
      // Update user name via a simple approach (no dedicated endpoint yet, using mock)
      setUser(prev => ({ ...prev, name: profileForm.name }));
      setSuccess("Profile updated successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch { setError("Failed to update profile"); }
    setSaving(false);
  };

  const tabs = [
    { id: "profile", icon: User, label: "Profile" },
    { id: "security", icon: Shield, label: "Security" },
    { id: "notifications", icon: Bell, label: "Notifications" },
  ];

  return (
    <AppLayout>
      <div data-testid="settings-page">
        <div className="mb-8 animate-fade-in-up">
          <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Settings</h1>
          <p className="text-slate-500 mt-1">Manage your account and preferences</p>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Tabs */}
          <div className="bg-white rounded-3xl border border-slate-100 p-4 shadow-soft h-fit animate-fade-in-up">
            {tabs.map(({ id, icon: Icon, label }) => (
              <button key={id} data-testid={`settings-tab-${id}`}
                onClick={() => setActiveTab(id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all mb-1 ${activeTab === id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                <Icon size={17} /> {label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="lg:col-span-3 bg-white rounded-3xl border border-slate-100 p-8 shadow-soft animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            {success && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl p-3 mb-6 text-sm">
                <CheckCircle size={15} /> {success}
              </div>
            )}
            {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 mb-6 text-sm">{error}</div>}

            {activeTab === "profile" && (
              <div>
                <h2 className="font-bold text-slate-800 text-xl mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>Profile Information</h2>
                <div className="flex items-center gap-5 mb-8">
                  {user?.picture ? (
                    <img src={user.picture} alt={user.name} className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-md" />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold shadow-md">
                      {user?.name?.charAt(0) || "U"}
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-slate-800">{user?.name}</p>
                    <p className="text-slate-500 text-sm">{user?.email}</p>
                    <span className="inline-block mt-1.5 text-xs font-medium px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 capitalize">
                      {user?.subscription || 'Free'} Plan
                    </span>
                  </div>
                </div>
                <div className="space-y-5 max-w-md">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                    <input data-testid="profile-name-input" value={profileForm.name}
                      onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-sm text-slate-800 transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                    <input value={user?.email || ""} disabled
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 text-sm cursor-not-allowed" />
                    <p className="text-xs text-slate-400 mt-1">Email cannot be changed.</p>
                  </div>
                  <button data-testid="save-profile-btn" onClick={handleProfileSave} disabled={saving}
                    className="px-8 py-3 bg-indigo-600 text-white font-semibold rounded-full hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-60">
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            )}

            {activeTab === "security" && (
              <div>
                <h2 className="font-bold text-slate-800 text-xl mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>Security Settings</h2>
                {user?.auth_provider === "google" ? (
                  <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <img src="https://www.google.com/favicon.ico" alt="Google" className="w-6 h-6" />
                      <p className="font-semibold text-slate-700">Google Account</p>
                    </div>
                    <p className="text-slate-600 text-sm">Your account is secured via Google OAuth. Password management is handled by Google.</p>
                  </div>
                ) : (
                  <div className="max-w-md space-y-5">
                    {["current", "new"].map(field => (
                      <div key={field}>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5 capitalize">{field} Password</label>
                        <div className="relative">
                          <input data-testid={`${field}-password-input`}
                            type={showPw[field] ? "text" : "password"}
                            value={pwForm[field]}
                            onChange={e => setPwForm({ ...pwForm, [field]: e.target.value })}
                            placeholder={field === "current" ? "Current password" : "New password"}
                            className="w-full h-12 px-4 pr-12 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-sm text-slate-800 transition-all" />
                          <button type="button" onClick={() => setShowPw(p => ({ ...p, [field]: !p[field] }))}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                            {showPw[field] ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                    ))}
                    <button data-testid="change-password-btn"
                      className="px-8 py-3 bg-indigo-600 text-white font-semibold rounded-full hover:bg-indigo-700 transition-all active:scale-95">
                      Update Password
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === "notifications" && (
              <div>
                <h2 className="font-bold text-slate-800 text-xl mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>Notification Preferences</h2>
                <div className="space-y-4 max-w-md">
                  {[
                    { key: "motion_alerts", label: "Motion Detection Alerts", desc: "Get notified when motion is detected" },
                    { key: "door_alerts", label: "Door & Gate Alerts", desc: "Alerts for door lock/unlock events" },
                    { key: "solar_alerts", label: "Solar Energy Reports", desc: "Daily solar generation summary" },
                    { key: "geyser_alerts", label: "Geyser Notifications", desc: "Geyser schedule and temperature alerts" },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                      <div>
                        <p className="font-medium text-slate-700 text-sm">{label}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                      </div>
                      <button data-testid={`notif-${key}`}
                        onClick={() => setNotifications(p => ({ ...p, [key]: !p[key] }))}
                        className={`w-11 h-6 rounded-full transition-all relative flex-shrink-0 ${notifications[key] ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${notifications[key] ? 'left-5' : 'left-0.5'}`} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
