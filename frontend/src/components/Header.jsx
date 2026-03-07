import { useState } from "react";
import { Bell, ChevronDown, Menu, LogOut, Settings, User, CreditCard } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function Header({ onMenuClick }) {
  const { user, homes, selectedHomeId, setSelectedHomeId, logout, isAuthenticated } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showHomeMenu, setShowHomeMenu] = useState(false);
  const navigate = useNavigate();

  const selectedHome = homes.find(h => h.home_id === selectedHomeId) || homes[0];

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Hamburger + Home selector */}
        <div className="flex items-center gap-4">
          <button
            data-testid="sidebar-toggle"
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
          >
            <Menu size={20} />
          </button>

          {homes.length > 0 && (
            <div className="relative">
              <button
                data-testid="home-selector"
                onClick={() => setShowHomeMenu(!showHomeMenu)}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition-colors"
              >
                <span className="w-2 h-2 bg-green-500 rounded-full" />
                {selectedHome?.name || "Select Home"}
                <ChevronDown size={14} />
              </button>
              {showHomeMenu && (
                <div className="absolute top-full left-0 mt-2 bg-white rounded-2xl shadow-lg border border-slate-200 py-2 min-w-48 z-50">
                  {homes.map(h => (
                    <button
                      key={h.home_id}
                      data-testid={`home-option-${h.home_id}`}
                      onClick={() => { setSelectedHomeId(h.home_id); setShowHomeMenu(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 flex items-center gap-2 ${selectedHomeId === h.home_id ? 'text-indigo-600 font-medium' : 'text-slate-700'}`}
                    >
                      {selectedHomeId === h.home_id && <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />}
                      {h.name} — {h.city}
                    </button>
                  ))}
                  <div className="border-t border-slate-100 mt-1 pt-1">
                    <Link to="/homes" onClick={() => setShowHomeMenu(false)}
                      className="w-full text-left px-4 py-2.5 text-sm text-indigo-600 hover:bg-slate-50 flex items-center gap-2">
                      + Manage Homes
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Alerts + User */}
        <div className="flex items-center gap-3">
          <Link to="/alerts" data-testid="alerts-btn"
            className="relative p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors">
            <Bell size={20} />
          </Link>

          <div className="relative">
            <button
              data-testid="user-menu-btn"
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-100 transition-colors"
            >
              {user?.picture ? (
                <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold">
                  {user?.name?.charAt(0) || "U"}
                </div>
              )}
              <ChevronDown size={14} className="text-slate-500" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 top-full mt-2 bg-white rounded-2xl shadow-lg border border-slate-200 py-2 w-52 z-50">
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="font-medium text-slate-800 text-sm">{user?.name}</p>
                  <p className="text-xs text-slate-500">{user?.email}</p>
                </div>
                <Link to="/settings" onClick={() => setShowUserMenu(false)}
                  data-testid="settings-link"
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                  <Settings size={15} /> Settings
                </Link>
                <Link to="/subscription" onClick={() => setShowUserMenu(false)}
                  data-testid="subscription-link"
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                  <CreditCard size={15} /> Subscription
                </Link>
                <button onClick={handleLogout} data-testid="logout-btn"
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50">
                  <LogOut size={15} /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
