import { useState, useEffect } from "react";
import { Home, Plus, MapPin, Trash2, Edit2, Check, X } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import axios from "axios";
import { API } from "@/apiBase";

const CITIES = ["Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Quetta", "Sialkot", "Gujranwala"];

export default function HomesPage() {
  const { homes, selectedHomeId, setSelectedHomeId, refreshHomes, user } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", city: "Karachi" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name || !form.address) { setError("Name and address are required"); return; }
    setLoading(true);
    setError("");
    try {
      await axios.post(`${API}/homes`, form, { withCredentials: true });
      await refreshHomes();
      setShowAdd(false);
      setForm({ name: "", address: "", city: "Karachi" });
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to create home");
    }
    setLoading(false);
  };

  const handleDelete = async (homeId) => {
    if (!window.confirm("Delete this home and all its devices?")) return;
    try {
      await axios.delete(`${API}/homes/${homeId}`, { withCredentials: true });
      if (selectedHomeId === homeId) setSelectedHomeId(null);
      await refreshHomes();
    } catch {}
  };

  const handleEdit = async (homeId) => {
    try {
      await axios.put(`${API}/homes/${homeId}`, editForm, { withCredentials: true });
      setEditId(null);
      await refreshHomes();
    } catch {}
  };

  return (
    <AppLayout>
      <div data-testid="homes-page">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 animate-fade-in-up">
          <div>
            <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Outfit, sans-serif' }}>My Homes</h1>
            <p className="text-slate-500 mt-1">{homes.length} {homes.length === 1 ? 'property' : 'properties'} registered</p>
          </div>
          <button data-testid="add-home-btn" onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 bg-indigo-600 text-white font-semibold px-5 py-2.5 rounded-full hover:bg-indigo-700 hover:shadow-lg transition-all active:scale-95">
            <Plus size={18} /> Add Home
          </button>
        </div>

        {/* Add Form */}
        {showAdd && (
          <div className="bg-white rounded-3xl border border-indigo-100 p-8 mb-6 shadow-soft animate-fade-in-up">
            <h2 className="font-bold text-slate-800 text-xl mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>Add New Property</h2>
            {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 mb-4 text-sm">{error}</div>}
            <form onSubmit={handleAdd} className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Property Name</label>
                <input data-testid="home-name-input" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="My House, Office, etc."
                  className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-sm text-slate-800 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Address</label>
                <input data-testid="home-address-input" value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                  placeholder="123 Street, Block X"
                  className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-sm text-slate-800 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">City</label>
                <select data-testid="home-city-select" value={form.city}
                  onChange={e => setForm({ ...form, city: e.target.value })}
                  className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 text-sm text-slate-800 bg-white transition-all">
                  {CITIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="md:col-span-3 flex gap-3">
                <button type="submit" data-testid="submit-home-btn" disabled={loading}
                  className="flex items-center gap-2 bg-indigo-600 text-white font-semibold px-8 py-3 rounded-full hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-60">
                  {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus size={16} />}
                  {loading ? "Creating..." : "Create Home"}
                </button>
                <button type="button" onClick={() => { setShowAdd(false); setError(""); }}
                  className="px-6 py-3 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium transition-all">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Homes Grid */}
        {homes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center">
              <Home size={36} className="text-indigo-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-700" style={{ fontFamily: 'Outfit, sans-serif' }}>No Homes Yet</h2>
            <p className="text-slate-500 text-sm">Add your first property to get started.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {homes.map((home, i) => (
              <div key={home.home_id}
                className={`bg-white rounded-3xl border p-6 shadow-soft hover:shadow-card transition-all animate-fade-in-up ${selectedHomeId === home.home_id ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-100'}`}
                style={{ animationDelay: `${i * 0.07}s` }}>
                {editId === home.home_id ? (
                  <div className="space-y-3">
                    <input value={editForm.name || ""} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-indigo-400" />
                    <input value={editForm.address || ""} onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-indigo-400" />
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(home.home_id)} className="flex-1 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 flex items-center justify-center gap-1">
                        <Check size={14} /> Save
                      </button>
                      <button onClick={() => setEditId(null)} className="flex-1 py-2 bg-slate-100 text-slate-600 text-sm rounded-lg hover:bg-slate-200 flex items-center justify-center gap-1">
                        <X size={14} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
                        <Home size={22} className="text-indigo-600" />
                      </div>
                      <div className="flex items-center gap-2">
                        <button data-testid={`edit-home-${home.home_id}`}
                          onClick={() => { setEditId(home.home_id); setEditForm({ name: home.name, address: home.address }); }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                          <Edit2 size={14} />
                        </button>
                        {home.owner_id === user?.user_id && (
                          <button data-testid={`delete-home-${home.home_id}`} onClick={() => handleDelete(home.home_id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg" style={{ fontFamily: 'Outfit, sans-serif' }}>{home.name}</h3>
                    <div className="flex items-center gap-1.5 mt-2 text-slate-500">
                      <MapPin size={13} />
                      <p className="text-sm">{home.address}</p>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">{home.city}</p>
                    <div className="flex gap-3 mt-5">
                      <button data-testid={`select-home-${home.home_id}`}
                        onClick={() => setSelectedHomeId(home.home_id)}
                        className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95 ${selectedHomeId === home.home_id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700'}`}>
                        {selectedHomeId === home.home_id ? 'Active' : 'Select'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
