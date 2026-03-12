import { useState } from "react";
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PolarRadiusAxis, Cell, AreaChart, Area,
  ScatterChart, Scatter, ZAxis
} from "recharts";

// ── Point to your live Render backend ────────────────────────────────────────
const BASE_URL = "https://cs2-faceit-analytics.onrender.com";

// ── Color system ──────────────────────────────────────────────────────────────
const GREEN  = "#4ade80";
const YELLOW = "#facc15";
const RED    = "#f87171";
const BLUE   = "#60a5fa";
const PURPLE = "#c084fc";
const DIM    = "#3f3f46";

const kdColor  = v => v >= 1.5 ? GREEN  : v >= 1.0 ? YELLOW : RED;
const adrColor = v => v >= 85  ? GREEN  : v >= 65  ? YELLOW : RED;
const wrColor  = v => v >= 60  ? GREEN  : v >= 50  ? YELLOW : RED;
const hsColor  = v => v >= 55  ? GREEN  : v >= 35  ? YELLOW : RED;

// ── Fix 3: map name cleaner ───────────────────────────────────────────────────
function cleanMap(name) {
  if (!name || name === "Unknown") return name;
  return name.replace(/^(de_|cs_|ar_|gg_)/i, "").replace(/^(.)/, c => c.toUpperCase());
}

// ── Fix 5: rename quadro→4K, penta→ACE everywhere ────────────────────────────
function fmtMK(label) {
  return label
    .replace(/quadro kills?/gi, "4Ks")
    .replace(/quadro/gi, "4K")
    .replace(/penta kills?/gi, "ACEs")
    .replace(/penta/gi, "ACE");
}

// ── Fix 6: Faceit URL builder — API sometimes returns bad URLs ────────────────
function faceitUrl(player) {
  const base = player.faceit_url || "";
  // If it already looks like a valid URL use it, else build from nickname
  if (base.startsWith("http")) return base;
  return `https://www.faceit.com/en/players/${player.nickname}`;
}

async function apiFetch(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "Request failed"); }
  return res.json();
}

const sum = arr => arr.reduce((a, b) => a + b, 0);
const avg = arr => arr.length ? sum(arr) / arr.length : 0;

// ── Fix 1: use match_id as unique XAxis key so duplicate dates don't clash ───
// We add a sequential index to each match for the chart X axis
function indexedHistory(history) {
  return history.map((m, i) => ({ ...m, idx: i + 1, label: `#${i + 1} · ${m.map} · ${m.date}` }));
}

// ── Radar builder ─────────────────────────────────────────────────────────────
function buildRadar(lt, history) {
  if (!lt || !history?.length) return [];
  const avgKd    = parseFloat(lt.avg_kd) || 0;
  const avgHs    = parseFloat(lt.avg_hs) || 0;
  const wr       = parseFloat(lt.win_rate) || 0;
  const adrs     = history.filter(m => m.adr > 0).map(m => m.adr);
  const avgAdr   = adrs.length ? avg(adrs) : 0;
  const clutchTot = sum(history.map(m => m.clutch_1v1 + m.clutch_1v2));
  const entryTot  = sum(history.map(m => m.first_kills));
  const roundTot  = sum(history.map(m => m.rounds));
  return [
    { stat: "Aim",      value: Math.min(100, Math.round(avgKd * 55)),    raw: avgKd.toFixed(2),    label: "K/D",      color: kdColor(avgKd)  },
    { stat: "HS%",      value: Math.min(100, Math.round(avgHs * 1.5)),   raw: avgHs.toFixed(1)+"%", label: "Avg HS%",  color: hsColor(avgHs)  },
    { stat: "Win Rate", value: Math.min(100, Math.round(wr * 1.4)),      raw: wr.toFixed(1)+"%",    label: "Win Rate", color: wrColor(wr)     },
    { stat: "ADR",      value: Math.min(100, Math.round(avgAdr)),        raw: avgAdr.toFixed(1),    label: "ADR",      color: adrColor(avgAdr)},
    { stat: "Clutch",   value: Math.min(100, clutchTot * 5),             raw: clutchTot,            label: "Clutches", color: GREEN           },
    { stat: "Entry",    value: roundTot > 0 ? Math.min(100, Math.round(entryTot / roundTot * 600)) : 50,
                                                                          raw: roundTot > 0 ? (entryTot/roundTot*100).toFixed(1)+"%" : "—",
                                                                          label: "Entry Rate", color: BLUE },
  ];
}

// ── Shared components ─────────────────────────────────────────────────────────
const Card = ({ children, style = {} }) => (
  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 22, ...style }}>
    {children}
  </div>
);

const Title = ({ children, sub }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 10, color: "#555", letterSpacing: 3, textTransform: "uppercase", fontWeight: 600 }}>{children}</div>
    {sub && <div style={{ fontSize: 11, color: "#444", marginTop: 3 }}>{sub}</div>}
  </div>
);

const Pill = ({ label, value, color, highlight }) => (
  <div style={{ textAlign: "center", padding: "14px 18px", background: highlight ? "rgba(74,222,128,0.06)" : "rgba(255,255,255,0.03)", border: `1px solid ${highlight ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.07)"}`, borderRadius: 12, flex: 1, minWidth: 100 }}>
    <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 800, color: color || (highlight ? GREEN : "#fff"), fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>{value}</div>
  </div>
);

const Badge = ({ label, value, color }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.06)", minWidth: 80 }}>
    <div style={{ fontSize: 20, fontWeight: 800, color: color || "#fff", fontFamily: "'Bebas Neue'" }}>{value}</div>
    <div style={{ fontSize: 10, color: "#555", letterSpacing: 1.5, textTransform: "uppercase", marginTop: 3, textAlign: "center" }}>{label}</div>
  </div>
);

const PatternCard = ({ label, desc, severity }) => {
  const colors = { high: RED, medium: YELLOW, positive: GREEN };
  const icons  = { high: "⚠", medium: "◈", positive: "✦" };
  return (
    <div style={{ borderLeft: `3px solid ${colors[severity]}`, background: "rgba(255,255,255,0.02)", borderRadius: "0 8px 8px 0", padding: "12px 16px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
        <span style={{ color: colors[severity], fontSize: 12 }}>{icons[severity]}</span>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 12 }}>{label}</span>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "#777", lineHeight: 1.5 }}>{desc}</p>
    </div>
  );
};

// ── Fix 1: Custom tooltip uses the full label (match # · map · date) ──────────
const Tip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: "9px 13px", fontSize: 12, maxWidth: 200 }}>
      {d?.label && <div style={{ color: "#666", marginBottom: 5, fontSize: 11 }}>{d.label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || "#ccc" }}>
          {p.name}: <strong style={{ color: "#fff" }}>
            {typeof p.value === "number" && p.value % 1 !== 0 ? p.value.toFixed(2) : p.value}
          </strong>
        </div>
      ))}
    </div>
  );
};

const Spinner = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 14 }}>
    <div style={{ width: 36, height: 36, border: "3px solid rgba(74,222,128,0.15)", borderTop: `3px solid ${GREEN}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    <span style={{ color: "#555", fontSize: 13 }}>Fetching player data...</span>
  </div>
);

const NAV = [
  { id: "overview",  icon: "◉", label: "Overview"       },
  { id: "combat",    icon: "⚡", label: "Combat"         },
  { id: "clutch",    icon: "🎯", label: "Clutch & Entry" },
  { id: "multikill", icon: "💥", label: "Multi-Kills"    },
  { id: "maps",      icon: "⬡", label: "Maps"           },
  { id: "patterns",  icon: "◈", label: "AI Patterns"    },
  { id: "history",   icon: "≡", label: "History"        },
];

const LEVEL_COLORS = ["#52525b","#60a5fa","#60a5fa","#60a5fa","#60a5fa","#c084fc","#c084fc","#c084fc","#fb923c","#fb923c",GREEN];

// ── Score bar used in the new overview skill panel ────────────────────────────
const ScoreBar = ({ label, raw, value, color }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
      <span style={{ fontSize: 12, color: "#a1a1aa" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: "#555" }}>{raw}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "'Bebas Neue'", minWidth: 32, textAlign: "right" }}>{value}</span>
      </div>
    </div>
    <div style={{ height: 4, background: "#27272a", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${value}%`, background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
    </div>
  </div>
);

// ── Main ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [tab,      setTab]      = useState("overview");
  const [player,   setPlayer]   = useState(null);
  const [stats,    setStats]    = useState(null);
  const [history,  setHistory]  = useState([]);
  const [patterns, setPatterns] = useState([]);

  async function search() {
    const nick = input.trim();
    if (!nick) return;
    setLoading(true); setError(null);
    setPlayer(null); setStats(null); setHistory([]); setPatterns([]);
    setTab("overview");
    try {
      const p = await apiFetch(`/player/${encodeURIComponent(nick)}`);
      setPlayer(p);
      const id = p.player_id;
      const [s, h, pt] = await Promise.all([
        apiFetch(`/player/${id}/stats`),
        apiFetch(`/player/${id}/history?limit=20`),
        apiFetch(`/player/${id}/patterns`),
      ]);
      setStats(s);
      setHistory(h.map(m => ({ ...m, map: cleanMap(m.map) })));
      setPatterns(pt);
    } catch (e) {
      setError(e.message || "Something went wrong. Is your backend running?");
    } finally {
      setLoading(false);
    }
  }

  const lt       = stats?.lifetime;
  const mapData  = (stats?.map_stats || []).map(m => ({ ...m, map: cleanMap(m.map) }));
  const hasData  = !!(player && stats && lt);
  const radar    = buildRadar(lt, history);

  // Fix 1: indexed history for charts so each match has a unique X key
  const chartHistory = indexedHistory(history);

  // Aggregates
  const validH      = history.filter(m => m.result !== "?");
  const recentWins  = validH.filter(m => m.result === "W").length;
  const recentWR    = validH.length ? Math.round(recentWins / validH.length * 100) : 0;
  const avgKD       = avg(history.filter(m => m.kd > 0).map(m => m.kd));
  const avgADR      = avg(history.filter(m => m.adr > 0).map(m => m.adr));
  const avgKR       = avg(history.filter(m => m.kr > 0).map(m => m.kr));
  const totalTriples = sum(history.map(m => m.triple));
  const totalQuadros = sum(history.map(m => m.quadro));
  const totalPentas  = sum(history.map(m => m.penta));
  const totalC1v1    = sum(history.map(m => m.clutch_1v1));
  const totalC1v2    = sum(history.map(m => m.clutch_1v2));
  const totalFirstK  = sum(history.map(m => m.first_kills));
  const totalRounds  = sum(history.map(m => m.rounds));
  const entryRate    = totalRounds > 0 ? (totalFirstK / totalRounds * 100).toFixed(1) : "—";
  const avgUtility   = avg(history.filter(m => m.utility_dmg > 0).map(m => m.utility_dmg));
  const totalSniper  = sum(history.map(m => m.sniper_kills));
  const totalKills   = sum(history.map(m => m.kills));
  const sniperPct    = totalKills > 0 ? (totalSniper / totalKills * 100).toFixed(1) : "0";
  const avgHS        = avg(history.map(m => m.hs_pct));

  // Overall score for the overview panel (0–100)
  const overallScore = radar.length ? Math.round(sum(radar.map(r => r.value)) / radar.length) : 0;
  const overallColor = overallScore >= 65 ? GREEN : overallScore >= 45 ? YELLOW : RED;

  return (
    <div style={{
      display: "flex", width: "100vw", height: "100vh",
      background: "#0b0b0d", color: "#fff",
      fontFamily: "'DM Sans','Helvetica Neue',sans-serif",
      overflow: "hidden", position: "fixed", inset: 0
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { width: 100%; height: 100%; background: #0b0b0d; overflow: hidden; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 4px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .nav-btn { display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:500; transition:all 0.15s; color:#52525b; border:none; background:none; width:100%; text-align:left; font-family:'DM Sans',sans-serif; }
        .nav-btn:hover { color:#a1a1aa; background:rgba(255,255,255,0.04); }
        .nav-btn.active { color:#fff; background:rgba(74,222,128,0.08); }
        .nav-btn.active .nav-icon { color:${GREEN}; }
        .nav-btn:disabled { opacity:0.2; cursor:default; }
        .s-input { background:none; border:none; outline:none; color:#fff; font-size:13px; font-family:'DM Sans',sans-serif; flex:1; min-width:0; }
        .s-input::placeholder { color:#3f3f46; }
        .s-btn { background:${GREEN}; color:#000; border:none; border-radius:7px; padding:8px 14px; font-weight:800; font-size:11px; cursor:pointer; letter-spacing:0.5px; transition:background 0.15s; font-family:'DM Sans',sans-serif; white-space:nowrap; }
        .s-btn:hover { background:#86efac; } .s-btn:disabled { opacity:0.4; cursor:not-allowed; }
        .t-row:hover td { background:rgba(255,255,255,0.02); }
        .animated { animation: fadeIn 0.3s ease both; }
      `}</style>

      {/* ── SIDEBAR ── */}
      <aside style={{ width: 215, flexShrink: 0, borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", padding: "0 10px", overflowY: "auto" }}>
        <div style={{ padding: "18px 4px", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: GREEN, display: "grid", placeItems: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 13, color: "#000", fontWeight: 900 }}>⬡</span>
            </div>
            <div>
              <div style={{ fontFamily: "'Bebas Neue'", fontSize: 17, letterSpacing: 2, lineHeight: 1 }}>FRAGLYTICS</div>
              <div style={{ fontSize: 9, color: "#52525b", letterSpacing: 2, marginTop: 1 }}>CS2 · FACEIT</div>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 9, color: "#3f3f46", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Player Search</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "7px 10px", gap: 6 }}>
              <span style={{ color: "#3f3f46", fontSize: 12 }}>🔍</span>
              <input className="s-input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} placeholder="Faceit username..." />
            </div>
            <button className="s-btn" onClick={search} disabled={loading} style={{ width: "100%", padding: "9px" }}>
              {loading ? "LOADING..." : "SEARCH"}
            </button>
          </div>
          {error && <div style={{ marginTop: 8, fontSize: 11, color: RED, lineHeight: 1.5, padding: "8px 10px", background: "rgba(248,113,113,0.08)", borderRadius: 6 }}>⚠ {error}</div>}
        </div>

        <div style={{ fontSize: 9, color: "#3f3f46", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Navigation</div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {NAV.map(n => (
            <button key={n.id} className={`nav-btn ${tab === n.id ? "active" : ""}`} onClick={() => setTab(n.id)} disabled={!hasData}>
              <span className="nav-icon" style={{ fontSize: 13, width: 16, textAlign: "center" }}>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>

        {hasData && (
          <div style={{ marginTop: "auto", paddingTop: 14, paddingBottom: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <img src={player.avatar || `https://i.pravatar.cc/40?u=${player.nickname}`} alt="" style={{ width: 36, height: 36, borderRadius: "50%", display: "block", border: `2px solid ${LEVEL_COLORS[player.level] || "#555"}` }} />
                <div style={{ position: "absolute", bottom: -3, right: -3, background: LEVEL_COLORS[player.level] || "#555", color: "#000", borderRadius: 4, padding: "1px 4px", fontSize: 9, fontWeight: 800 }}>{player.level}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{player.nickname}</div>
                <div style={{ fontSize: 11, color: GREEN, fontWeight: 600 }}>{player.elo.toLocaleString()} ELO</div>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ── MAIN ── */}
      <main style={{ flex: 1, overflow: "auto", padding: "24px 28px", minWidth: 0 }}>
        {!hasData && !loading && !error && (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, opacity: 0.35 }}>
            <div style={{ fontSize: 52 }}>🎯</div>
            <div style={{ fontFamily: "'Bebas Neue'", fontSize: 34, letterSpacing: 4 }}>SEARCH A PLAYER</div>
            <div style={{ fontSize: 13, color: "#71717a" }}>Enter any Faceit username to load full CS2 analytics</div>
          </div>
        )}
        {loading && <Spinner />}

        {hasData && !loading && (
          <div className="animated">

            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <img src={player.avatar || `https://i.pravatar.cc/56?u=${player.nickname}`} alt="" style={{ width: 52, height: 52, borderRadius: "50%", border: `3px solid ${LEVEL_COLORS[player.level] || "#555"}` }} />
                <div>
                  <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: 34, letterSpacing: 3, lineHeight: 1, marginBottom: 4 }}>{player.nickname}</h1>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12 }}>
                    <span style={{ color: "#52525b" }}>🌍 {player.country.toUpperCase()}</span>
                    <span style={{ color: "#27272a" }}>|</span>
                    <span style={{ color: "#52525b" }}>{parseInt(lt.matches).toLocaleString()} career matches</span>
                    <span style={{ color: "#27272a" }}>|</span>
                    {/* Fix 6: always build a valid faceit URL */}
                    <a href={faceitUrl(player)} target="_blank" rel="noreferrer" style={{ color: GREEN, textDecoration: "none", fontSize: 11 }}>
                      Faceit Profile ↗
                    </a>
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "'Bebas Neue'", fontSize: 42, color: GREEN, lineHeight: 1 }}>{player.elo.toLocaleString()}</div>
                <div style={{ fontSize: 10, color: "#52525b", letterSpacing: 2, textTransform: "uppercase" }}>ELO · Level {player.level}</div>
              </div>
            </div>

            {/* Stat pills */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              <Pill label="Career WR"   value={lt.win_rate}           highlight />
              <Pill label="Career K/D"  value={lt.avg_kd}             color={kdColor(parseFloat(lt.avg_kd))} />
              <Pill label="Career HS%"  value={lt.avg_hs}             color={hsColor(parseFloat(lt.avg_hs))} />
              <Pill label="Best Streak" value={`${lt.longest_streak}W`} />
              <Pill label="Recent K/D"  value={avgKD.toFixed(2)}      color={kdColor(avgKD)} />
              <Pill label="Recent ADR"  value={avgADR.toFixed(1)}     color={adrColor(avgADR)} />
              <Pill label="Recent WR"   value={`${recentWR}%`}        color={wrColor(recentWR)} />
            </div>

            {/* ── OVERVIEW ── */}
            {tab === "overview" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 300px", gap: 14 }}>

                {/* Fix 3: tighter card heights for K/D and ADR */}
                <Card style={{ padding: "16px 18px" }}>
                  <Title>K/D Trend · Last {history.length} Matches</Title>
                  <ResponsiveContainer width="100%" height={150}>
                    <AreaChart data={chartHistory}>
                      <defs>
                        <linearGradient id="gKD" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={GREEN} stopOpacity={0.18} />
                          <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1e" />
                      {/* Fix 1: use idx as dataKey so each match is unique */}
                      <XAxis dataKey="idx" tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} domain={[0, "auto"]} width={28} />
                      <Tooltip content={<Tip />} />
                      <Area type="monotone" dataKey="kd" name="K/D" stroke={GREEN} fill="url(#gKD)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: GREEN }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>

                <Card style={{ padding: "16px 18px" }}>
                  <Title>ADR Trend · Last {history.length} Matches</Title>
                  <ResponsiveContainer width="100%" height={150}>
                    <AreaChart data={chartHistory}>
                      <defs>
                        <linearGradient id="gADR" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={BLUE} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={BLUE} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1e" />
                      <XAxis dataKey="idx" tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} width={28} />
                      <Tooltip content={<Tip />} />
                      <Area type="monotone" dataKey="adr" name="ADR" stroke={BLUE} fill="url(#gADR)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: BLUE }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>

                {/* Fix 2: Premier skill panel — radar + score bars + insights */}
                <Card style={{ gridRow: "1 / 3", display: "flex", flexDirection: "column", gap: 14, padding: "18px 18px" }}>
                  {/* Overall score */}
                  <div style={{ textAlign: "center", paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: 9, color: "#52525b", letterSpacing: 3, textTransform: "uppercase", marginBottom: 4 }}>Overall Score</div>
                    <div style={{ fontFamily: "'Bebas Neue'", fontSize: 52, lineHeight: 1, color: overallColor }}>{overallScore}</div>
                    <div style={{ fontSize: 10, color: overallColor, marginTop: 2 }}>
                      {overallScore >= 65 ? "Strong Performer" : overallScore >= 45 ? "Average Performer" : "Needs Improvement"}
                    </div>
                  </div>

                  {/* Radar */}
                  <ResponsiveContainer width="100%" height={170}>
                    <RadarChart data={radar}>
                      <PolarGrid stroke="#27272a" />
                      <PolarAngleAxis dataKey="stat" tick={{ fontSize: 10, fill: "#71717a" }} />
                      <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
                      <Radar dataKey="value" stroke={GREEN} fill={GREEN} fillOpacity={0.12} strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>

                  {/* Score bars for each stat */}
                  <div>
                    <div style={{ fontSize: 9, color: "#52525b", letterSpacing: 3, textTransform: "uppercase", marginBottom: 10 }}>Stat Breakdown</div>
                    {radar.map((r, i) => (
                      <ScoreBar key={i} label={r.label} raw={r.raw} value={r.value} color={r.color} />
                    ))}
                  </div>

                  {/* AI insights */}
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
                    <div style={{ fontSize: 9, color: "#52525b", letterSpacing: 3, textTransform: "uppercase", marginBottom: 10 }}>Top Insights</div>
                    {patterns.slice(0, 2).map((p, i) => <PatternCard key={i} {...p} />)}
                    {patterns.length > 2 && (
                      <button onClick={() => setTab("patterns")} style={{ background: "none", border: "none", color: GREEN, fontSize: 11, cursor: "pointer", marginTop: 4, padding: 0 }}>
                        +{patterns.length - 2} more →
                      </button>
                    )}
                    {patterns.length === 0 && <p style={{ fontSize: 12, color: "#52525b" }}>No patterns detected yet.</p>}
                  </div>
                </Card>

                {/* Kills bar + Fix 4: career highlights with totals */}
                <Card style={{ padding: "16px 18px" }}>
                  <Title>Kills per Match · Win / Loss</Title>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={chartHistory} barSize={12}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1e" />
                      <XAxis dataKey="idx" tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} width={28} />
                      <Tooltip content={<Tip />} />
                      <Bar dataKey="kills" name="Kills" radius={[3, 3, 0, 0]}>
                        {chartHistory.map((m, i) => <Cell key={i} fill={m.result === "W" ? GREEN : RED} opacity={0.85} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: GREEN }}>■ Win</span>
                    <span style={{ fontSize: 11, color: RED }}>■ Loss</span>
                  </div>
                </Card>

                {/* Fix 4: Career highlights now show career totals from lifetime stats */}
                <Card style={{ padding: "16px 18px" }}>
                  <Title>Career Highlights</Title>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {/* Fix 5: renamed to 3Ks, 4Ks, ACEs */}
                    <Badge label="3Ks (career)"  value={parseInt(lt.triple_kills).toLocaleString()} color={YELLOW} />
                    <Badge label="4Ks (career)"  value={parseInt(lt.quadro_kills).toLocaleString()} color={PURPLE} />
                    <Badge label="ACEs (career)" value={parseInt(lt.penta_kills).toLocaleString()}  color={GREEN}  />
                    <Badge label="Best Streak"   value={`${lt.longest_streak}W`}                    color={BLUE}   />
                  </div>
                </Card>

              </div>
            )}

            {/* ── COMBAT ── */}
            {tab === "combat" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Card>
                  <Title sub="Each dot = one match">ADR vs K/D Correlation</Title>
                  <ResponsiveContainer width="100%" height={220}>
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1e" />
                      <XAxis dataKey="adr" name="ADR" tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} label={{ value: "ADR", position: "insideBottom", offset: -2, fill: "#444", fontSize: 11 }} />
                      <YAxis dataKey="kd"  name="K/D" tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} />
                      <ZAxis range={[40, 40]} />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]?.payload;
                        return (
                          <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: "9px 13px", fontSize: 12 }}>
                            <div style={{ color: d?.result === "W" ? GREEN : RED, fontWeight: 700, marginBottom: 4 }}>{d?.result} · {d?.map} · {d?.date}</div>
                            <div style={{ color: "#aaa" }}>ADR: <strong style={{ color: "#fff" }}>{d?.adr}</strong></div>
                            <div style={{ color: "#aaa" }}>K/D: <strong style={{ color: "#fff" }}>{d?.kd}</strong></div>
                          </div>
                        );
                      }} />
                      <Scatter data={history.filter(m => m.adr > 0)}>
                        {history.filter(m => m.adr > 0).map((m, i) => <Cell key={i} fill={m.result === "W" ? GREEN : RED} opacity={0.75} />)}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </Card>

                <Card>
                  <Title>K/R Ratio Per Match</Title>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1e" />
                      <XAxis dataKey="idx" tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} width={28} />
                      <Tooltip content={<Tip />} />
                      <Line type="monotone" dataKey="kr" name="K/R" stroke={PURPLE} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>

                <Card>
                  <Title>Headshot % Per Match</Title>
                  <ResponsiveContainer width="100%" height={170}>
                    <BarChart data={chartHistory} barSize={12}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1e" />
                      <XAxis dataKey="idx" tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} unit="%" width={32} />
                      <Tooltip content={<Tip />} />
                      <Bar dataKey="hs_pct" name="HS%" radius={[3, 3, 0, 0]}>
                        {chartHistory.map((m, i) => <Cell key={i} fill={hsColor(m.hs_pct)} opacity={0.85} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                <Card>
                  <Title>Combat Summary · Recent {history.length} Matches</Title>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <Badge label="Avg ADR"     value={avgADR.toFixed(1)}   color={adrColor(avgADR)} />
                    <Badge label="Avg K/R"     value={avgKR.toFixed(2)}    color={PURPLE} />
                    <Badge label="Avg K/D"     value={avgKD.toFixed(2)}    color={kdColor(avgKD)} />
                    <Badge label="Sniper Rate" value={`${sniperPct}%`}     color={BLUE} />
                    <Badge label="Avg Utility" value={avgUtility.toFixed(0)} color={YELLOW} />
                    <Badge label="Avg HS%"     value={`${avgHS.toFixed(1)}%`} color={hsColor(avgHS)} />
                  </div>
                </Card>
              </div>
            )}

            {/* ── CLUTCH & ENTRY ── */}
            {tab === "clutch" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Card>
                  <Title>Clutch Wins Per Match</Title>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartHistory} barSize={10}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1e" />
                      <XAxis dataKey="idx" tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} allowDecimals={false} width={24} />
                      <Tooltip content={<Tip />} />
                      <Bar dataKey="clutch_1v1" name="1v1 Wins" fill={GREEN}  opacity={0.85} radius={[3, 3, 0, 0]} />
                      <Bar dataKey="clutch_1v2" name="1v2 Wins" fill={PURPLE} opacity={0.85} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: GREEN }}>■ 1v1</span>
                    <span style={{ fontSize: 11, color: PURPLE }}>■ 1v2</span>
                  </div>
                </Card>

                <Card>
                  <Title>Entry Frags Per Match</Title>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartHistory} barSize={12}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1e" />
                      <XAxis dataKey="idx" tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} allowDecimals={false} width={24} />
                      <Tooltip content={<Tip />} />
                      <Bar dataKey="first_kills" name="First Kills" radius={[3, 3, 0, 0]}>
                        {chartHistory.map((m, i) => <Cell key={i} fill={m.first_kills >= 4 ? GREEN : m.first_kills >= 2 ? YELLOW : BLUE} opacity={0.85} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                <Card>
                  <Title>Clutch & Entry Summary</Title>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
                    <Badge label="1v1 Wins"   value={totalC1v1}       color={GREEN}  />
                    <Badge label="1v2 Wins"   value={totalC1v2}       color={PURPLE} />
                    <Badge label="Entry Rate" value={`${entryRate}%`} color={YELLOW} />
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, color: "#52525b", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>Role Analysis</div>
                    {(() => {
                      const er = parseFloat(entryRate);
                      const ct = totalC1v1 + totalC1v2;
                      if (er >= 18 && ct < 5)  return <p style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.6 }}>🔫 <strong style={{ color: "#fff" }}>Entry Fragger</strong> — You open rounds aggressively. Work on your clutch game to become more versatile.</p>;
                      if (er < 10  && ct >= 5) return <p style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.6 }}>🧠 <strong style={{ color: "#fff" }}>Clutch Player</strong> — You excel in late-round situations. Consider being more proactive on CT-side.</p>;
                      if (er >= 15 && ct >= 5) return <p style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.6 }}>⭐ <strong style={{ color: "#fff" }}>Star Player</strong> — High entry rate AND strong clutch numbers. You're a rare dual-threat.</p>;
                      return                          <p style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.6 }}>📊 <strong style={{ color: "#fff" }}>Balanced Role</strong> — Well-rounded play style. More matches needed to confirm a role specialization.</p>;
                    })()}
                  </div>
                </Card>

                <Card>
                  <Title>Flash Performance Per Match</Title>
                  <ResponsiveContainer width="100%" height={155}>
                    <BarChart data={chartHistory.filter(m => m.flash_count > 0)} barSize={12}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1e" />
                      <XAxis dataKey="idx" tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} width={24} />
                      <Tooltip content={<Tip />} />
                      <Bar dataKey="flash_count" name="Flashes" fill={BLUE} radius={[3, 3, 0, 0]} opacity={0.8} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ marginTop: 10, fontSize: 12, color: "#52525b" }}>
                    Avg flashes per match: <strong style={{ color: "#fff" }}>
                      {avg(history.filter(m => m.flash_count > 0).map(m => m.flash_count)).toFixed(1)}
                    </strong>
                  </div>
                </Card>
              </div>
            )}

            {/* ── MULTI-KILLS ── */}
            {tab === "multikill" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Card style={{ gridColumn: "1 / -1" }}>
                  {/* Fix 5: renamed to 3Ks, 4Ks, ACEs */}
                  <Title>Multi-Kill Breakdown · Recent {history.length} Matches</Title>
                  <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
                    <Badge label="3Ks"      value={totalTriples} color={YELLOW} />
                    <Badge label="4Ks"      value={totalQuadros} color={PURPLE} />
                    <Badge label="ACEs"     value={totalPentas}  color={GREEN}  />
                    <Badge label="Per Match" value={((totalTriples + totalQuadros + totalPentas) / Math.max(history.length, 1)).toFixed(1)} color={BLUE} />
                  </div>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={chartHistory} barSize={8}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1e" />
                      <XAxis dataKey="idx" tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} allowDecimals={false} width={24} />
                      <Tooltip content={<Tip />} />
                      <Bar dataKey="triple" name="3K"  stackId="mk" fill={YELLOW} opacity={0.85} />
                      <Bar dataKey="quadro" name="4K"  stackId="mk" fill={PURPLE} opacity={0.85} />
                      <Bar dataKey="penta"  name="ACE" stackId="mk" fill={GREEN}  opacity={0.85} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: YELLOW }}>■ 3K</span>
                    <span style={{ fontSize: 11, color: PURPLE }}>■ 4K</span>
                    <span style={{ fontSize: 11, color: GREEN }}>■ ACE</span>
                  </div>
                </Card>

                <Card>
                  <Title>Career Multi-Kill Totals</Title>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
                    {[
                      { label: "3Ks",  value: lt.triple_kills, color: YELLOW, pct: Math.min(100, parseInt(lt.triple_kills) / 5) },
                      { label: "4Ks",  value: lt.quadro_kills, color: PURPLE, pct: Math.min(100, parseInt(lt.quadro_kills) / 2) },
                      { label: "ACEs", value: lt.penta_kills,  color: GREEN,  pct: Math.min(100, parseInt(lt.penta_kills) * 5)  },
                    ].map((r, i) => (
                      <div key={i}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 12, color: "#a1a1aa" }}>{r.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: r.color }}>{parseInt(r.value).toLocaleString()}</span>
                        </div>
                        <div style={{ height: 5, background: "#27272a", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${r.pct}%`, background: r.color, borderRadius: 3 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card>
                  <Title>Matches With Multi-Kills</Title>
                  <div style={{ overflowY: "auto", maxHeight: 230 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr>
                          {["#", "Date", "Map", "3K", "4K", "ACE"].map(h => (
                            <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, color: "#444", letterSpacing: 2, textTransform: "uppercase", fontWeight: 500, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {chartHistory.filter(m => m.triple + m.quadro + m.penta > 0).map((m, i) => (
                          <tr key={i} className="t-row">
                            <td style={{ padding: "9px 10px", color: "#52525b" }}>{m.idx}</td>
                            <td style={{ padding: "9px 10px", color: "#52525b" }}>{m.date}</td>
                            <td style={{ padding: "9px 10px", color: "#e4e4e7", fontWeight: 600 }}>{m.map}</td>
                            <td style={{ padding: "9px 10px", color: m.triple > 0 ? YELLOW : DIM, fontWeight: m.triple > 0 ? 700 : 400 }}>{m.triple || "—"}</td>
                            <td style={{ padding: "9px 10px", color: m.quadro > 0 ? PURPLE : DIM, fontWeight: m.quadro > 0 ? 700 : 400 }}>{m.quadro || "—"}</td>
                            <td style={{ padding: "9px 10px", color: m.penta  > 0 ? GREEN  : DIM, fontWeight: m.penta  > 0 ? 700 : 400 }}>{m.penta  || "—"}</td>
                          </tr>
                        ))}
                        {chartHistory.filter(m => m.triple + m.quadro + m.penta > 0).length === 0 && (
                          <tr><td colSpan={6} style={{ padding: "20px 10px", color: "#52525b", fontSize: 13 }}>No multi-kill matches in recent history</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}

            {/* ── MAPS ── */}
            {tab === "maps" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Card>
                  <Title sub={`${mapData.reduce((a, m) => a + m.matches, 0).toLocaleString()} total career matches`}>All-Time Win Rate by Map</Title>
                  <ResponsiveContainer width="100%" height={Math.max(200, mapData.length * 36)}>
                    <BarChart data={mapData} layout="vertical" barSize={16}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1e" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
                      <YAxis type="category" dataKey="map" tick={{ fontSize: 11, fill: "#a1a1aa" }} tickLine={false} axisLine={false} width={70} />
                      <Tooltip content={<Tip />} />
                      <Bar dataKey="win_rate" name="Win Rate %" radius={[0, 4, 4, 0]}>
                        {mapData.map((m, i) => <Cell key={i} fill={wrColor(m.win_rate)} opacity={0.85} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                <Card>
                  <Title>All-Time K/D by Map</Title>
                  <ResponsiveContainer width="100%" height={Math.max(200, mapData.length * 36)}>
                    <BarChart data={mapData} layout="vertical" barSize={16}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1e" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} domain={[0, "auto"]} />
                      <YAxis type="category" dataKey="map" tick={{ fontSize: 11, fill: "#a1a1aa" }} tickLine={false} axisLine={false} width={70} />
                      <Tooltip content={<Tip />} />
                      <Bar dataKey="kd" name="K/D" radius={[0, 4, 4, 0]}>
                        {mapData.map((m, i) => <Cell key={i} fill={kdColor(m.kd)} opacity={0.85} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                <Card style={{ gridColumn: "1 / -1" }}>
                  <Title>Full Career Map Breakdown</Title>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 700 }}>
                      <thead>
                        <tr>
                          {["Map","Matches","Wins","Win Rate","K/D","K/R","Avg K","Avg D","HS%","3Ks","4Ks","ACEs"].map(h => (
                            <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, color: "#444", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 500, borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {mapData.map((m, i) => (
                          <tr key={i} className="t-row">
                            <td style={{ padding: "11px 12px", fontWeight: 700, color: "#fff" }}>{m.map}</td>
                            <td style={{ padding: "11px 12px", color: "#71717a" }}>{m.matches}</td>
                            <td style={{ padding: "11px 12px", color: "#71717a" }}>{m.wins}</td>
                            <td style={{ padding: "11px 12px", color: wrColor(m.win_rate), fontWeight: 700 }}>{m.win_rate}%</td>
                            <td style={{ padding: "11px 12px", color: kdColor(m.kd),       fontWeight: 700 }}>{m.kd}</td>
                            <td style={{ padding: "11px 12px", color: "#a1a1aa" }}>{m.kr}</td>
                            <td style={{ padding: "11px 12px", color: "#a1a1aa" }}>{m.avg_kills}</td>
                            <td style={{ padding: "11px 12px", color: "#a1a1aa" }}>{m.avg_deaths}</td>
                            <td style={{ padding: "11px 12px", color: hsColor(m.avg_hs)  }}>{m.avg_hs}%</td>
                            <td style={{ padding: "11px 12px", color: m.triple_kills > 0 ? YELLOW : DIM }}>{m.triple_kills || "—"}</td>
                            <td style={{ padding: "11px 12px", color: m.quadro_kills > 0 ? PURPLE : DIM }}>{m.quadro_kills || "—"}</td>
                            <td style={{ padding: "11px 12px", color: m.penta_kills  > 0 ? GREEN  : DIM, fontWeight: m.penta_kills > 0 ? 700 : 400 }}>{m.penta_kills || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}

            {/* ── PATTERNS ── */}
            {tab === "patterns" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Card style={{ gridColumn: "1 / -1" }}>
                  <Title>Analysis Summary</Title>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                    {[
                      { label: "Matches Analyzed", value: history.length,                                         color: BLUE  },
                      { label: "Total Patterns",   value: patterns.length,                                        color: "#fff"},
                      { label: "Issues Found",     value: patterns.filter(p => p.severity === "high").length,     color: RED   },
                      { label: "Strengths",        value: patterns.filter(p => p.severity === "positive").length, color: GREEN },
                    ].map((s, i) => (
                      <div key={i} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: "14px 18px", border: "1px solid rgba(255,255,255,0.05)", textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: "#52525b", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
                        <div style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Bebas Neue'", letterSpacing: 1, color: s.color }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card>
                  <Title>Issues to Address</Title>
                  {patterns.filter(p => p.severity !== "positive").length === 0
                    ? <p style={{ color: "#52525b", fontSize: 13 }}>No major issues detected — great job!</p>
                    : patterns.filter(p => p.severity !== "positive").map((p, i) => <PatternCard key={i} {...p} />)}
                </Card>
                <Card>
                  <Title>Your Strengths</Title>
                  {patterns.filter(p => p.severity === "positive").length === 0
                    ? <p style={{ color: "#52525b", fontSize: 13 }}>Keep playing to identify your strengths.</p>
                    : patterns.filter(p => p.severity === "positive").map((p, i) => <PatternCard key={i} {...p} />)}
                </Card>
              </div>
            )}

            {/* ── HISTORY ── */}
            {tab === "history" && (
              <Card>
                <Title>Full Match History · Last {history.length} Games</Title>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 900 }}>
                    <thead>
                      <tr>
                        {["#","Result","Map","Score","K","D","A","K/D","ADR","HS%","3K","4K","ACE","1v1","1v2","Entry","MVPs","Date"].map(h => (
                          <th key={h} style={{ padding: "10px 11px", textAlign: "left", fontSize: 10, color: "#444", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 500, borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {chartHistory.map((m, i) => (
                        <tr key={i} className="t-row">
                          <td style={{ padding: "10px 11px", color: "#52525b" }}>{m.idx}</td>
                          <td style={{ padding: "10px 11px" }}>
                            <span style={{ background: m.result === "W" ? "rgba(74,222,128,0.12)" : m.result === "L" ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.04)", color: m.result === "W" ? GREEN : m.result === "L" ? RED : "#555", borderRadius: 5, padding: "2px 8px", fontWeight: 800, fontSize: 11 }}>{m.result}</span>
                          </td>
                          <td style={{ padding: "10px 11px", fontWeight: 600, color: "#e4e4e7", whiteSpace: "nowrap" }}>{m.map}</td>
                          <td style={{ padding: "10px 11px", color: "#52525b", whiteSpace: "nowrap" }}>{m.score}</td>
                          <td style={{ padding: "10px 11px", color: "#a1a1aa" }}>{m.kills}</td>
                          <td style={{ padding: "10px 11px", color: "#a1a1aa" }}>{m.deaths}</td>
                          <td style={{ padding: "10px 11px", color: "#a1a1aa" }}>{m.assists}</td>
                          <td style={{ padding: "10px 11px", color: kdColor(m.kd),  fontWeight: 700 }}>{m.kd}</td>
                          <td style={{ padding: "10px 11px", color: m.adr > 0 ? adrColor(m.adr) : DIM, fontWeight: m.adr > 0 ? 600 : 400 }}>{m.adr > 0 ? m.adr.toFixed(1) : "—"}</td>
                          <td style={{ padding: "10px 11px", color: hsColor(m.hs_pct) }}>{m.hs_pct.toFixed(0)}%</td>
                          <td style={{ padding: "10px 11px", color: m.triple > 0 ? YELLOW : DIM, fontWeight: m.triple > 0 ? 700 : 400 }}>{m.triple || "—"}</td>
                          <td style={{ padding: "10px 11px", color: m.quadro > 0 ? PURPLE : DIM, fontWeight: m.quadro > 0 ? 700 : 400 }}>{m.quadro || "—"}</td>
                          <td style={{ padding: "10px 11px", color: m.penta  > 0 ? GREEN  : DIM, fontWeight: m.penta  > 0 ? 700 : 400 }}>{m.penta  || "—"}</td>
                          <td style={{ padding: "10px 11px", color: m.clutch_1v1 > 0 ? GREEN  : DIM }}>{m.clutch_1v1 || "—"}</td>
                          <td style={{ padding: "10px 11px", color: m.clutch_1v2 > 0 ? PURPLE : DIM }}>{m.clutch_1v2 || "—"}</td>
                          <td style={{ padding: "10px 11px", color: m.first_kills > 0 ? YELLOW : DIM }}>{m.first_kills || "—"}</td>
                          <td style={{ padding: "10px 11px", color: "#a1a1aa" }}>{m.mvps}</td>
                          <td style={{ padding: "10px 11px", color: "#52525b", whiteSpace: "nowrap" }}>{m.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

          </div>
        )}
      </main>
    </div>
  );
}