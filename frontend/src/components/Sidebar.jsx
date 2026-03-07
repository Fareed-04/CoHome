import { NavLink } from "react-router-dom";
import { LayoutDashboard, Sun, Shield, Thermometer, Bell, Home, Users, Settings, CreditCard, AlertTriangle, X, Zap } from "lucide-react";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", color: "text-indigo-500" },
  { to: "/solar", icon: Sun, label: "Solar", color: "text-amber-500" },
  { to: "/security", icon: Shield, label: "Security", color: "text-rose-500" },
  { to: "/climate", icon: Thermometer, label: "Climate", color: "text-sky-500" },
  { to: "/doorbell", icon: Bell, label: "Doorbell", color: "text-violet-500" },
];

const mgmtItems = [
  { to: "/homes", icon: Home, label: "My Homes" },
  { to: "/family", icon: Users, label: "Family" },
  { to: "/alerts", icon: AlertTriangle, label: "Alerts" },
  { to: "/subscription", icon: CreditCard, label: "Subscription" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar({ isOpen, onClose }) {
  return (
    <aside className={`
      fixed left-0 top-0 h-full w-64 bg-white border-r border-slate-200 z-40
      transition-transform duration-300 ease-out flex flex-col
      ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
    `}>
      {/* Logo */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200">
            <Zap size={16} className="text-white" />
          </div>
          <span className="font-bold text-xl text-slate-800 tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Cohome
          </span>
        </div>
        <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" data-testid="sidebar-close">
          <X size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">Devices</p>
        {navItems.map(({ to, icon: Icon, label, color }) => (
          <NavLink
            key={to}
            to={to}
            data-testid={`nav-${label.toLowerCase()}`}
            onClick={onClose}
            className={({ isActive }) => `
              flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
              ${isActive
                ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }
            `}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}

        <div className="pt-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">Manage</p>
          {mgmtItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              data-testid={`nav-${label.toLowerCase().replace(' ', '-')}`}
              onClick={onClose}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                ${isActive
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }
              `}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-100">
        <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl p-4">
          <p className="text-xs font-semibold text-indigo-700 mb-1">IoT Platform</p>
          <p className="text-xs text-slate-500">Cohome v1.0 — Pakistan's Smart Home Solution</p>
        </div>
      </div>
    </aside>
  );
}
