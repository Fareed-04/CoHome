import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Info, Zap, CheckCheck, Trash2, Bell } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import axios from "axios";
import { API } from "@/apiBase";

const severityConfig = {
  info: { icon: Info, color: "bg-blue-50 border-blue-100 text-blue-700", badge: "bg-blue-100 text-blue-600" },
  warning: { icon: AlertTriangle, color: "bg-amber-50 border-amber-100 text-amber-700", badge: "bg-amber-100 text-amber-600" },
  critical: { icon: Zap, color: "bg-rose-50 border-rose-100 text-rose-700", badge: "bg-rose-100 text-rose-600" },
};

export default function AlertsPage() {
  const { selectedHomeId } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    if (!selectedHomeId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/homes/${selectedHomeId}/alerts`, { withCredentials: true });
      setAlerts(res.data);
    } catch {}
    setLoading(false);
  }, [selectedHomeId]);

  useEffect(() => { load(); }, [load]);

  const markRead = async (alertId) => {
    try {
      await axios.patch(`${API}/alerts/${alertId}/read`, {}, { withCredentials: true });
      setAlerts(prev => prev.map(a => a.alert_id === alertId ? { ...a, is_read: true } : a));
    } catch {}
  };

  const deleteAlert = async (alertId) => {
    try {
      await axios.delete(`${API}/alerts/${alertId}`, { withCredentials: true });
      setAlerts(prev => prev.filter(a => a.alert_id !== alertId));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await axios.post(`${API}/alerts/mark-all-read`, {}, { withCredentials: true });
      setAlerts(prev => prev.map(a => ({ ...a, is_read: true })));
    } catch {}
  };

  const filtered = filter === "all" ? alerts : filter === "unread" ? alerts.filter(a => !a.is_read) : alerts.filter(a => a.severity === filter);
  const unreadCount = alerts.filter(a => !a.is_read).length;

  const formatTime = (ts) => {
    try {
      const d = new Date(ts);
      const now = new Date();
      const diff = Math.floor((now - d) / 60000);
      if (diff < 1) return "Just now";
      if (diff < 60) return `${diff}m ago`;
      if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch { return ""; }
  };

  return (
    <AppLayout>
      <div data-testid="alerts-page">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 animate-fade-in-up">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Alerts</h1>
              {unreadCount > 0 && (
                <span className="bg-rose-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">{unreadCount}</span>
              )}
            </div>
            <p className="text-slate-500 mt-1">{alerts.length} total notifications</p>
          </div>
          {unreadCount > 0 && (
            <button data-testid="mark-all-read-btn" onClick={markAllRead}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-50 text-indigo-700 font-semibold rounded-full hover:bg-indigo-100 transition-all text-sm">
              <CheckCheck size={16} /> Mark All Read
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6 flex-wrap animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          {[
            { id: "all", label: "All" },
            { id: "unread", label: "Unread" },
            { id: "critical", label: "Critical" },
            { id: "warning", label: "Warning" },
            { id: "info", label: "Info" },
          ].map(f => (
            <button key={f.id} data-testid={`filter-${f.id}`}
              onClick={() => setFilter(f.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${filter === f.id ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-200 hover:text-indigo-600'}`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Alerts List */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-16 text-center shadow-soft">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bell size={28} className="text-slate-300" />
            </div>
            <h3 className="font-semibold text-slate-600 mb-2">No Alerts</h3>
            <p className="text-slate-400 text-sm">All clear! No notifications to show.</p>
          </div>
        ) : (
          <div className="space-y-3 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            {filtered.map(alert => {
              const sev = severityConfig[alert.severity] || severityConfig.info;
              const Icon = sev.icon;
              return (
                <div key={alert.alert_id}
                  className={`relative flex items-start gap-4 p-5 rounded-2xl border transition-all ${alert.is_read ? 'bg-white border-slate-100' : `${sev.color} border`}`}>
                  {!alert.is_read && <div className="absolute top-4 right-4 w-2 h-2 bg-rose-500 rounded-full" />}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${sev.badge}`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className={`font-semibold text-sm ${alert.is_read ? 'text-slate-700' : 'text-slate-800'}`}>{alert.title}</p>
                        <p className="text-slate-500 text-xs mt-1 leading-relaxed">{alert.message}</p>
                        <p className="text-slate-400 text-xs mt-2">{formatTime(alert.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!alert.is_read && (
                          <button data-testid={`mark-read-${alert.alert_id}`} onClick={() => markRead(alert.alert_id)}
                            className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                            <CheckCheck size={15} />
                          </button>
                        )}
                        <button data-testid={`delete-alert-${alert.alert_id}`} onClick={() => deleteAlert(alert.alert_id)}
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
