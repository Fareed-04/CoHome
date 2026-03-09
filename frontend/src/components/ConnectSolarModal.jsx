import { useState } from "react";
import { X, CheckCircle, AlertCircle, Loader, ChevronRight, Wifi, WifiOff, Info } from "lucide-react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BRANDS = [
  {
    id: "goodwe", name: "GoodWe", platform: "SEMS Portal", type: "cloud",
    badge: "Working", badgeColor: "bg-green-100 text-green-700",
    highlight: true, logo: "⚡",
    help: "Uses your SEMS Portal account at semsportal.com. Polls every 5 minutes automatically.",
    fields: ["username", "password", "station_id_required"],
    stationHelp: "Log into semsportal.com → click your plant → copy the UUID from the URL: semsportal.com/PowerStation/PowerStatusSnMin/{YOUR-ID-HERE}",
  },
  {
    id: "growatt", name: "Growatt", platform: "ShineMonitor", type: "cloud",
    badge: "Live", badgeColor: "bg-green-100 text-green-700",
    logo: "🌱",
    help: "Uses your Growatt ShineMonitor account (server.growatt.com). Auto-discovers your plants.",
    fields: ["username", "password"],
  },
  {
    id: "solis", name: "Solis", platform: "SolisCloud", type: "cloud",
    badge: "API Key", badgeColor: "bg-sky-100 text-sky-700",
    logo: "🔆",
    help: "SolisCloud requires API keys (not your login password). Get them free at soliscloud.com → Service → API Management.",
    fields: ["key_id", "key_secret", "station_id_optional"],
    stationHelp: "Leave blank to auto-discover your first plant, or enter a specific Plant ID from SolisCloud.",
  },
  {
    id: "fronius", name: "Fronius", platform: "Local API", type: "local",
    badge: "Fastest", badgeColor: "bg-green-100 text-green-700",
    logo: "🔌",
    help: "Direct LAN access — no cloud needed! Connects to your inverter on your home network.",
    fields: ["inverter_ip"],
    ipHelp: "Your Fronius inverter's local IP (e.g., 192.168.1.100). Check your router's connected devices.",
  },
  {
    id: "inverex_growatt", name: "Inverex (Growatt)", platform: "ShineMonitor", type: "cloud",
    badge: "🇵🇰 Local", badgeColor: "bg-emerald-100 text-emerald-700",
    logo: "🇵🇰",
    help: "For Inverex units that use Growatt hardware. Use your Growatt/ShineMonitor account credentials.",
    fields: ["username", "password"],
  },
  {
    id: "inverex_solis", name: "Inverex (Solis)", platform: "SolisCloud", type: "cloud",
    badge: "🇵🇰 Local", badgeColor: "bg-emerald-100 text-emerald-700",
    logo: "🇵🇰",
    help: "For Inverex units that use Solis hardware. Requires SolisCloud API keys.",
    fields: ["key_id", "key_secret", "station_id_optional"],
    stationHelp: "Leave blank to auto-discover your first plant.",
  },
  {
    id: "huawei", name: "Huawei", platform: "FusionSolar", type: "cloud",
    logo: "☀️", partnerOnly: true,
    partnerGuide: "Huawei FusionSolar requires a partner/enterprise OpenAPI account. Regular app credentials do not work. Email eu_inverter_support@huawei.com to request access.",
    fields: [],
  },
  {
    id: "sungrow", name: "Sungrow", platform: "iSolarCloud", type: "cloud",
    logo: "☁️", partnerOnly: true,
    partnerGuide: "Sungrow iSolarCloud requires registering an app in the developer portal and signing an NDA. Contact service@sungrow-emea.com to start the process.",
    fields: [],
  },
  {
    id: "sma", name: "SMA", platform: "Sunny Portal", type: "cloud",
    logo: "💡", partnerOnly: true,
    partnerGuide: "SMA Sunny Portal requires partner API access. Contact SMA support to request OpenAPI credentials.",
    fields: [],
  },
  {
    id: "manual", name: "Manual Entry", platform: "Direct Input", type: "manual",
    logo: "📝",
    help: "Manually update solar readings — useful for any inverter without API access.",
    fields: ["manual"],
  },
];

function BrandCard({ brand, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      data-testid={`brand-${brand.id}`}
      className={`relative w-full text-left p-4 rounded-2xl border-2 transition-all hover:shadow-md active:scale-98 ${
        selected ? "border-indigo-500 bg-indigo-50 shadow-md" : "border-slate-200 bg-white hover:border-indigo-200"
      } ${brand.highlight ? "ring-2 ring-amber-200" : ""}`}
    >
      {brand.badge && (
        <span className={`absolute -top-2 -right-2 text-xs font-bold px-2 py-0.5 rounded-full ${brand.badgeColor}`}>
          {brand.badge}
        </span>
      )}
      <div className="flex items-center gap-3">
        <span className="text-2xl">{brand.logo}</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-800 text-sm">{brand.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${brand.type === "local" ? "bg-green-500" : "bg-sky-400"}`} />
            <p className="text-xs text-slate-500">{brand.platform}</p>
            {brand.type === "local" && <span className="text-xs text-green-600 font-semibold">Local</span>}
          </div>
        </div>
        {selected && <CheckCircle size={18} className="text-indigo-600 flex-shrink-0" />}
      </div>
    </button>
  );
}

export default function ConnectSolarModal({ device, onClose, onConnected }) {
  const [step, setStep] = useState(1);
  const [brand, setBrand] = useState(null);
  const [form, setForm] = useState({
    username: "", password: "",
    key_id: "", key_secret: "",
    inverter_ip: "", station_id: "",
    electricity_rate_pkr: "35",
    manual_power_w: "", manual_today_kwh: "", manual_total_kwh: "",
  });
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedBrand = BRANDS.find(b => b.id === brand);

  const handleTest = async () => {
    setTesting(true);
    setError("");
    setStep(3);
    try {
      const payload = { brand, ...form };
      const res = await axios.post(`${API}/solar/test-connection`, payload, { withCredentials: true });
      setTestResult(res.data);
      setStations(res.data.stations || []);
      if (res.data.stations?.length > 0) setSelectedStation(res.data.stations[0]);
      if (res.data.needs_station_id) setStep(2);
      else setStep(3);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || "Connection failed. Check credentials and try again.";
      setError(msg);
      setStep(2);
    }
    setTesting(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        brand,
        station_id: selectedStation?.id || form.station_id,
        station_name: selectedStation?.name || "My Solar Station",
        username: form.username,
        password: form.password,
        key_id: form.key_id,
        key_secret: form.key_secret,
        inverter_ip: form.inverter_ip,
        electricity_rate_pkr: parseFloat(form.electricity_rate_pkr) || 35,
        manual_power_w: parseFloat(form.manual_power_w) || 0,
        manual_today_kwh: parseFloat(form.manual_today_kwh) || 0,
        manual_total_kwh: parseFloat(form.manual_total_kwh) || 0,
      };
      await axios.post(`${API}/devices/${device.device_id}/solar/configure`, payload, { withCredentials: true });
      setStep(4);
      setTimeout(() => { onConnected?.(); onClose(); }, 2500);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || "Failed to save. Please try again.";
      setError(msg);
      setStep(3);
    }
    setSaving(false);
  };

  const inputClass = "w-full h-12 px-4 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-sm text-slate-800 bg-white transition-all placeholder-slate-400";

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100">
          <div>
            <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>
              {step === 1 && "Connect Your Solar Inverter"}
              {step === 2 && `Configure ${selectedBrand?.name}`}
              {step === 3 && (testing ? "Testing Connection…" : "Connection Result")}
              {step === 4 && "Successfully Connected!"}
            </h2>
            <div className="flex items-center gap-2 mt-2">
              {[1, 2, 3, 4].map(s => (
                <div key={s} className={`h-1.5 rounded-full transition-all ${s <= step ? "bg-indigo-600 w-8" : "bg-slate-200 w-4"}`} />
              ))}
            </div>
          </div>
          <button onClick={onClose} data-testid="close-connect-modal"
            className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-6">

          {/* Step 1: Brand Selection */}
          {step === 1 && (
            <div>
              <p className="text-slate-500 text-sm mb-6">Select your solar inverter brand. We'll guide you through the connection setup.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {BRANDS.map(b => (
                  <BrandCard key={b.id} brand={b} selected={brand === b.id}
                    onClick={() => setBrand(b.id)} />
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Credentials */}
          {step === 2 && selectedBrand && (
            <div className="space-y-5">

              {/* Partner-only brand — show setup guide instead of creds form */}
              {selectedBrand.partnerOnly ? (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-3">
                    <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800 mb-1">Partner API Required</p>
                      <p className="text-sm text-amber-700">{selectedBrand.partnerGuide}</p>
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-4 text-sm text-slate-600">
                    <p className="font-medium mb-2">Why can't I use my app password?</p>
                    <p className="text-xs text-slate-500">
                      {selectedBrand.name} restricts their cloud API to verified partners to protect user data and prevent abuse.
                      Once you get partner API credentials, come back here and we'll connect instantly.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Login success + needs station ID banner */}
                  {testResult?.needs_station_id && (
                    <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex gap-3">
                      <CheckCircle size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-green-800">Login verified!</p>
                        <p className="text-sm text-green-700 mt-0.5">{testResult.message}</p>
                      </div>
                    </div>
                  )}

                  {/* Help banner */}
                  {!testResult?.needs_station_id && (
                    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex gap-3">
                      <Info size={18} className="text-indigo-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-indigo-700">{selectedBrand.help}</p>
                    </div>
                  )}

                  {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 text-sm">{error}</div>}

                  {/* Username + password (cloud brands) — hide once login verified */}
                  {selectedBrand.fields.includes("username") && !testResult?.needs_station_id && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          Email / Username <span className="text-slate-400 font-normal">({selectedBrand.platform} account)</span>
                        </label>
                        <input data-testid="solar-username" type="email" value={form.username}
                          onChange={e => setForm({ ...form, username: e.target.value })}
                          placeholder="your@email.com" className={inputClass} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                        <input data-testid="solar-password" type="password" value={form.password}
                          onChange={e => setForm({ ...form, password: e.target.value })}
                          placeholder="Your portal password" className={inputClass} />
                        <p className="text-xs text-slate-400 mt-1">Stored encrypted using AES-256. Never shared.</p>
                      </div>
                    </>
                  )}

                  {/* Solis / Inverex-Solis API key fields */}
                  {selectedBrand.fields.includes("key_id") && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">API Key ID</label>
                        <input data-testid="solar-key-id" value={form.key_id}
                          onChange={e => setForm({ ...form, key_id: e.target.value })}
                          placeholder="e.g. 2300000000xxxxxxxx" className={inputClass} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">API Secret</label>
                        <input data-testid="solar-key-secret" type="password" value={form.key_secret}
                          onChange={e => setForm({ ...form, key_secret: e.target.value })}
                          placeholder="Your API secret key" className={inputClass} />
                        <div className="mt-2 bg-sky-50 border border-sky-100 rounded-xl p-3">
                          <p className="text-xs text-sky-700 font-medium mb-0.5">How to get your API keys:</p>
                          <p className="text-xs text-sky-600">Log into soliscloud.com → Service → API Management → Create</p>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Required station ID (GoodWe) */}
                  {selectedBrand.fields.includes("station_id_required") && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Power Station ID
                        {!testResult?.needs_station_id && <span className="text-slate-400 font-normal ml-1">(verify login first)</span>}
                      </label>
                      <input data-testid="solar-station-id" value={form.station_id}
                        onChange={e => setForm({ ...form, station_id: e.target.value })}
                        placeholder="e.g. d0eac052-1234-5678-abcd-123456789012" className={inputClass} />
                      {selectedBrand.stationHelp && (
                        <div className="mt-2 bg-amber-50 border border-amber-100 rounded-xl p-3">
                          <p className="text-xs text-amber-700 font-medium mb-1">How to find your Station ID:</p>
                          <p className="text-xs text-amber-600">{selectedBrand.stationHelp}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Optional station ID */}
                  {selectedBrand.fields.includes("station_id_optional") && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Plant ID <span className="text-slate-400 font-normal">(optional — auto-discovered)</span>
                      </label>
                      <input data-testid="solar-station-id" value={form.station_id}
                        onChange={e => setForm({ ...form, station_id: e.target.value })}
                        placeholder="Leave blank to use first plant" className={inputClass} />
                      {selectedBrand.stationHelp && <p className="text-xs text-slate-400 mt-1">{selectedBrand.stationHelp}</p>}
                    </div>
                  )}

                  {/* Fronius IP */}
                  {selectedBrand.fields.includes("inverter_ip") && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Inverter IP Address</label>
                      <input data-testid="solar-inverter-ip" value={form.inverter_ip}
                        onChange={e => setForm({ ...form, inverter_ip: e.target.value })}
                        placeholder="192.168.1.100" className={inputClass} />
                      {selectedBrand.ipHelp && <p className="text-xs text-slate-400 mt-1">{selectedBrand.ipHelp}</p>}
                    </div>
                  )}

                  {/* Manual entry */}
                  {selectedBrand.fields.includes("manual") && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">Current Power (W)</label>
                          <input data-testid="manual-power" type="number" value={form.manual_power_w}
                            onChange={e => setForm({ ...form, manual_power_w: e.target.value })}
                            placeholder="e.g. 3500" className={inputClass} />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">Today's Energy (kWh)</label>
                          <input data-testid="manual-today" type="number" value={form.manual_today_kwh}
                            onChange={e => setForm({ ...form, manual_today_kwh: e.target.value })}
                            placeholder="e.g. 18.5" className={inputClass} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Total Lifetime Energy (kWh)</label>
                        <input data-testid="manual-total" type="number" value={form.manual_total_kwh}
                          onChange={e => setForm({ ...form, manual_total_kwh: e.target.value })}
                          placeholder="e.g. 4250" className={inputClass} />
                      </div>
                    </>
                  )}

                  {/* Electricity rate */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Electricity Rate (PKR per kWh)</label>
                    <input data-testid="electricity-rate" type="number" value={form.electricity_rate_pkr}
                      onChange={e => setForm({ ...form, electricity_rate_pkr: e.target.value })}
                      placeholder="35" className={inputClass} />
                    <p className="text-xs text-slate-400 mt-1">Used to calculate PKR savings. Pakistan avg: PKR 35/kWh</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: Testing / Result */}
          {step === 3 && (
            <div className="py-8">
              {testing ? (
                <div className="flex flex-col items-center gap-5">
                  <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center">
                    <Loader size={36} className="text-indigo-600 animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-slate-800 text-lg" style={{ fontFamily: "Outfit, sans-serif" }}>
                      Connecting to {selectedBrand?.name}…
                    </p>
                    <p className="text-slate-500 text-sm mt-2">Verifying credentials and discovering your station</p>
                  </div>
                </div>
              ) : testResult ? (
                <div className="space-y-5">
                  <div className={`flex items-start gap-4 p-5 rounded-2xl border ${testResult.coming_soon ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${testResult.coming_soon ? "bg-amber-100" : "bg-green-100"}`}>
                      {testResult.coming_soon ? <Info size={20} className="text-amber-600" /> : <CheckCircle size={20} className="text-green-600" />}
                    </div>
                    <div>
                      <p className={`font-semibold ${testResult.coming_soon ? "text-amber-800" : "text-green-800"}`}>
                        {testResult.coming_soon ? "Credentials Saved" : "Connection Successful!"}
                      </p>
                      <p className={`text-sm mt-1 ${testResult.coming_soon ? "text-amber-700" : "text-green-700"}`}>
                        {testResult.message}
                      </p>
                    </div>
                  </div>

                  {/* Discovered stations */}
                  {stations.length > 0 && !testResult.coming_soon && (
                    <div>
                      <p className="text-sm font-semibold text-slate-700 mb-3">Select Power Station:</p>
                      <div className="space-y-2">
                        {stations.map(s => (
                          <button key={s.id}
                            data-testid={`station-${s.id}`}
                            onClick={() => setSelectedStation(s)}
                            className={`w-full text-left p-4 rounded-xl border-2 transition-all ${selectedStation?.id === s.id ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-indigo-200"}`}>
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-semibold text-slate-800 text-sm">{s.name}</p>
                                {s.capacity > 0 && <p className="text-xs text-slate-500 mt-0.5">{s.capacity} kW capacity · {s.address}</p>}
                              </div>
                              {selectedStation?.id === s.id && <CheckCircle size={16} className="text-indigo-600" />}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 text-sm">{error}</div>}
                </div>
              ) : null}
            </div>
          )}

          {/* Step 4: Success */}
          {step === 4 && (
            <div className="py-10 flex flex-col items-center gap-5 text-center">
              <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle size={48} className="text-green-600" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-slate-800" style={{ fontFamily: "Outfit, sans-serif" }}>Solar Inverter Connected!</h3>
                <p className="text-slate-500 mt-2">Your {selectedBrand?.name} inverter is now syncing data every 5 minutes.</p>
                <p className="text-slate-400 text-sm mt-1">Redirecting to your dashboard…</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        {step !== 4 && !testing && (
          <div className="px-8 py-5 border-t border-slate-100 flex justify-between gap-3">
            <button
              onClick={() => { if (step === 1) onClose(); else { setStep(step - 1); setError(""); } }}
              className="px-6 py-3 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium transition-all text-sm">
              {step === 1 ? "Cancel" : "Back"}
            </button>

            {step === 1 && (
              <button data-testid="next-step-btn"
                disabled={!brand}
                onClick={() => { setStep(2); setError(""); }}
                className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white font-semibold rounded-full hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-40 text-sm">
                Continue <ChevronRight size={16} />
              </button>
            )}

            {step === 2 && (
              <button data-testid="test-connection-btn"
                onClick={handleTest}
                disabled={
                  selectedBrand?.partnerOnly ||
                  (testResult?.needs_station_id && !form.station_id) ||
                  (!testResult?.needs_station_id &&
                    !form.username && !form.inverter_ip && !form.key_id &&
                    selectedBrand?.id !== "manual")
                }
                className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white font-semibold rounded-full hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-40 text-sm">
                <Wifi size={16} />
                {testResult?.needs_station_id ? "Verify Station ID" : "Test Connection"}
              </button>
            )}

            {step === 3 && testResult && (
              <button data-testid="save-connection-btn"
                onClick={handleSave}
                disabled={saving || (!selectedStation && stations.length > 0 && !testResult.coming_soon)}
                className="flex items-center gap-2 px-8 py-3 bg-green-600 text-white font-semibold rounded-full hover:bg-green-700 transition-all active:scale-95 disabled:opacity-40 text-sm">
                {saving ? <Loader size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                {saving ? "Saving…" : "Connect & Save"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
