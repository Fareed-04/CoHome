import { useState, useEffect, useCallback } from "react";
import { Users, UserPlus, Trash2, Crown, Shield, User } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import axios from "axios";
import { API } from "@/apiBase";

const roleConfig = {
  owner: { icon: Crown, label: "Owner", color: "bg-amber-100 text-amber-700" },
  admin: { icon: Shield, label: "Admin", color: "bg-indigo-100 text-indigo-700" },
  member: { icon: User, label: "Member", color: "bg-slate-100 text-slate-600" },
};

export default function FamilyPage() {
  const { selectedHomeId, selectedHome, user } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", role: "member" });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

  const load = useCallback(async () => {
    if (!selectedHomeId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/homes/${selectedHomeId}/members`, { withCredentials: true });
      setMembers(res.data);
    } catch {}
    setLoading(false);
  }, [selectedHomeId]);

  useEffect(() => { load(); }, [load]);

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteForm.email) return;
    setInviteLoading(true);
    setInviteError("");
    setInviteSuccess("");
    try {
      const res = await axios.post(`${API}/homes/${selectedHomeId}/members`, inviteForm, { withCredentials: true });
      setMembers(prev => [...prev, res.data]);
      setInviteSuccess(`${res.data.name} added successfully!`);
      setInviteForm({ email: "", role: "member" });
      setTimeout(() => { setShowInvite(false); setInviteSuccess(""); }, 2000);
    } catch (err) {
      setInviteError(err.response?.data?.detail || "Failed to add member");
    }
    setInviteLoading(false);
  };

  const handleRemove = async (memberId) => {
    if (!window.confirm("Remove this member?")) return;
    try {
      await axios.delete(`${API}/homes/${selectedHomeId}/members/${memberId}`, { withCredentials: true });
      setMembers(prev => prev.filter(m => m.user_id !== memberId));
    } catch {}
  };

  const isOwner = selectedHome?.owner_id === user?.user_id;

  return (
    <AppLayout>
      <div data-testid="family-page">
        <div className="flex items-center justify-between mb-8 animate-fade-in-up">
          <div>
            <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Family Access</h1>
            <p className="text-slate-500 mt-1">Manage who can control {selectedHome?.name || 'your home'}</p>
          </div>
          {isOwner && (
            <button data-testid="invite-member-btn" onClick={() => setShowInvite(!showInvite)}
              className="flex items-center gap-2 bg-indigo-600 text-white font-semibold px-5 py-2.5 rounded-full hover:bg-indigo-700 hover:shadow-lg transition-all active:scale-95">
              <UserPlus size={18} /> Invite Member
            </button>
          )}
        </div>

        {/* Invite Form */}
        {showInvite && isOwner && (
          <div className="bg-white rounded-3xl border border-indigo-100 p-8 mb-6 shadow-soft animate-fade-in-up">
            <h2 className="font-bold text-slate-800 text-xl mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>Invite Family Member</h2>
            {inviteError && <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 mb-4 text-sm">{inviteError}</div>}
            {inviteSuccess && <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-3 mb-4 text-sm">{inviteSuccess}</div>}
            <form onSubmit={handleInvite} className="flex gap-4 flex-wrap">
              <div className="flex-1 min-w-56">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address</label>
                <input data-testid="invite-email-input" type="email" value={inviteForm.email}
                  onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
                  placeholder="family@example.com"
                  className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-sm text-slate-800 transition-all" />
              </div>
              <div className="w-36">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Role</label>
                <select data-testid="invite-role-select" value={inviteForm.role}
                  onChange={e => setInviteForm({ ...inviteForm, role: e.target.value })}
                  className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 text-sm text-slate-800 bg-white transition-all">
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex items-end gap-3">
                <button type="submit" data-testid="submit-invite-btn" disabled={inviteLoading}
                  className="h-12 flex items-center gap-2 bg-indigo-600 text-white font-semibold px-8 rounded-full hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-60">
                  {inviteLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <UserPlus size={16} />}
                  Add
                </button>
                <button type="button" onClick={() => { setShowInvite(false); setInviteError(""); }}
                  className="h-12 px-6 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium transition-all">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Owner Card */}
        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-soft mb-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <h2 className="font-semibold text-slate-700 text-sm mb-4">Home Owner</h2>
          <div className="flex items-center gap-4">
            {user?.picture ? (
              <img src={user.picture} alt={user.name} className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-lg">
                {user?.name?.charAt(0)}
              </div>
            )}
            <div className="flex-1">
              <p className="font-semibold text-slate-800">{user?.name}</p>
              <p className="text-sm text-slate-500">{user?.email}</p>
            </div>
            <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <Crown size={11} /> Owner
            </span>
          </div>
        </div>

        {/* Members */}
        {loading ? (
          <div className="space-y-3">
            {[1,2].map(i => <div key={i} className="h-20 bg-white rounded-2xl animate-pulse" />)}
          </div>
        ) : members.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center shadow-soft">
            <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users size={28} className="text-indigo-400" />
            </div>
            <h3 className="font-semibold text-slate-700 mb-2">No Family Members Yet</h3>
            <p className="text-slate-500 text-sm">Invite family members to control your home together.</p>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-soft overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-700 text-sm">Members ({members.length})</h2>
            </div>
            <div className="divide-y divide-slate-50">
              {members.map((member, i) => {
                const role = roleConfig[member.role] || roleConfig.member;
                const RoleIcon = role.icon;
                return (
                  <div key={member.user_id || i} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors">
                    {member.picture ? (
                      <img src={member.picture} alt={member.name} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold">
                        {member.name?.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 text-sm">{member.name}</p>
                      <p className="text-xs text-slate-500 truncate">{member.email}</p>
                    </div>
                    <span className={`text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 ${role.color}`}>
                      <RoleIcon size={11} /> {role.label}
                    </span>
                    {isOwner && (
                      <button data-testid={`remove-member-${member.user_id}`}
                        onClick={() => handleRemove(member.user_id)}
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
