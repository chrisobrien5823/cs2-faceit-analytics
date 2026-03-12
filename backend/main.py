from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
from dotenv import load_dotenv
from collections import defaultdict
from datetime import datetime

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://cs2-faceit-analytics.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FACEIT_API_KEY = os.getenv("FACEIT_API_KEY")
BASE_URL = "https://open.faceit.com/data/v4"

def faceit_headers():
    return {"Authorization": f"Bearer {FACEIT_API_KEY}"}

async def faceit_get(path: str, params: dict = {}):
    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{BASE_URL}{path}",
            headers=faceit_headers(),
            params=params,
            timeout=20.0
        )
        if res.status_code == 404:
            raise HTTPException(status_code=404, detail="Resource not found")
        if res.status_code == 401:
            raise HTTPException(status_code=401, detail="Invalid API key")
        res.raise_for_status()
        return res.json()

def safe_float(val, default=0.0):
    try: return float(val)
    except: return default

def safe_int(val, default=0):
    try: return int(val)
    except: return default


# ─── Route 1: Player profile ──────────────────────────────────────────────────
@app.get("/player/{nickname}")
async def get_player(nickname: str):
    data  = await faceit_get("/players", {"nickname": nickname, "game": "cs2"})
    games = data.get("games", {}).get("cs2", {})
    return {
        "player_id":  data["player_id"],
        "nickname":   data["nickname"],
        "avatar":     data.get("avatar", ""),
        "country":    data.get("country", ""),
        "elo":        games.get("faceit_elo", 0),
        "level":      games.get("skill_level", 0),
        "faceit_url": data.get("faceit_url", ""),
    }


# ─── Route 2: Lifetime stats + all-time map segments ─────────────────────────
@app.get("/player/{player_id}/stats")
async def get_lifetime_stats(player_id: str):
    data     = await faceit_get(f"/players/{player_id}/stats/cs2")
    lifetime = data.get("lifetime", {})
    segments = data.get("segments", [])

    # All-time map stats from segments (covers entire career, not just recent)
    map_stats = []
    for seg in segments:
        if seg.get("type") != "Map":
            continue
        s = seg.get("stats", {})
        map_stats.append({
            "map":          seg.get("label", "Unknown"),
            "matches":      safe_int(s.get("Matches", 0)),
            "wins":         safe_int(s.get("Wins", 0)),
            "win_rate":     safe_float(s.get("Win Rate %", 0)),
            "kd":           safe_float(s.get("Average K/D Ratio", 0)),
            "kr":           safe_float(s.get("Average K/R Ratio", 0)),
            "avg_kills":    safe_float(s.get("Average Kills", 0)),
            "avg_deaths":   safe_float(s.get("Average Deaths", 0)),
            "avg_assists":  safe_float(s.get("Average Assists", 0)),
            "avg_hs":       safe_float(s.get("Average Headshots %", 0)),
            "avg_mvps":     safe_float(s.get("Average MVPs", 0)),
            "triple_kills": safe_int(s.get("Triple Kills", 0)),
            "quadro_kills": safe_int(s.get("Quadro Kills", 0)),
            "penta_kills":  safe_int(s.get("Penta Kills", 0)),
        })

    map_stats.sort(key=lambda x: x["matches"], reverse=True)

    return {
        "lifetime": {
            "matches":        lifetime.get("Matches", "0"),
            "wins":           lifetime.get("Wins", "0"),
            "win_rate":       lifetime.get("Win Rate %", "0") + "%",
            "avg_kd":         lifetime.get("Average K/D Ratio", "0"),
            "avg_hs":         lifetime.get("Average Headshots %", "0") + "%",
            "longest_streak": lifetime.get("Longest Win Streak", "0"),
            "current_streak": lifetime.get("Current Win Streak", "0"),
            "recent_results": lifetime.get("Recent Results", []),
            "triple_kills":   lifetime.get("Total Triple Kills", "0"),
            "quadro_kills":   lifetime.get("Total Quadro Kills", "0"),
            "penta_kills":    lifetime.get("Total Penta Kills", "0"),
        },
        "map_stats": map_stats,
    }


# ─── Route 3: Match history with full stats ────────────────────────────────────
@app.get("/player/{player_id}/history")
async def get_match_history(player_id: str, limit: int = 20):
    history = await faceit_get(
        f"/players/{player_id}/history",
        {"game": "cs2", "limit": limit}
    )

    matches = []
    for item in history.get("items", []):
        match_id = item["match_id"]
        date_ts  = item.get("finished_at", 0)
        date_str = datetime.utcfromtimestamp(date_ts).strftime("%b %d") if date_ts else "—"

        # Win/loss detection — find which faction the player is on
        teams       = item.get("teams", {})
        winner      = item.get("results", {}).get("winner", "")
        player_team = None
        for faction_key, faction_data in teams.items():
            for p in faction_data.get("players", []):
                if p.get("player_id") == player_id:
                    player_team = faction_key
                    break
            if player_team:
                break

        result = "W" if (player_team and winner and player_team == winner) else ("L" if player_team else "?")

        try:
            stats_data   = await faceit_get(f"/matches/{match_id}/stats")
            rounds       = stats_data.get("rounds", [{}])
            match_teams  = rounds[0].get("teams", []) if rounds else []
            round_stats  = rounds[0].get("round_stats", {}) if rounds else {}
            map_name     = round_stats.get("Map", "Unknown")
            score        = round_stats.get("Score", "")

            ps = {}
            for team in match_teams:
                for player in team.get("players", []):
                    if player.get("player_id") == player_id:
                        ps = player.get("player_stats", {})
                        break

            matches.append({
                "match_id":    match_id,
                "result":      result,
                "map":         map_name,
                "score":       score,
                "date":        date_str,
                "timestamp":   date_ts,
                # Core
                "kills":       safe_int(ps.get("Kills")),
                "deaths":      safe_int(ps.get("Deaths")),
                "assists":     safe_int(ps.get("Assists")),
                "mvps":        safe_int(ps.get("MVPs")),
                "kd":          safe_float(ps.get("K/D Ratio")),
                "kr":          safe_float(ps.get("K/R Ratio")),
                "hs_pct":      safe_float(ps.get("Headshots %")),
                "hs":          safe_int(ps.get("Headshots")),
                # Advanced
                "adr":         safe_float(ps.get("ADR")),
                "triple":      safe_int(ps.get("Triple Kills")),
                "quadro":      safe_int(ps.get("Quadro Kills")),
                "penta":       safe_int(ps.get("Penta Kills")),
                "first_kills": safe_int(ps.get("First Kills")),
                "clutch_1v1":  safe_int(ps.get("1v1Wins")),
                "clutch_1v2":  safe_int(ps.get("1v2Wins")),
                "utility_dmg": safe_float(ps.get("Utility Damage")),
                "flash_count": safe_int(ps.get("Flash Count")),
                "sniper_kills":safe_int(ps.get("Sniper Kills")),
                "rounds":      safe_int(round_stats.get("Rounds", 0)),
            })
        except Exception:
            matches.append({
                "match_id": match_id, "result": result, "map": "Unknown",
                "score": "", "date": date_str, "timestamp": date_ts,
                "kills": 0, "deaths": 0, "assists": 0, "mvps": 0,
                "kd": 0.0, "kr": 0.0, "hs_pct": 0.0, "hs": 0,
                "adr": 0.0, "triple": 0, "quadro": 0, "penta": 0,
                "first_kills": 0, "clutch_1v1": 0, "clutch_1v2": 0,
                "utility_dmg": 0.0, "flash_count": 0, "sniper_kills": 0, "rounds": 0,
            })

    return matches


# ─── Route 4: Global ranking ─────────────────────────────────────────────────
@app.get("/player/{player_id}/ranking")
async def get_ranking(player_id: str):
    try:
        data = await faceit_get(f"/rankings/games/cs2/regions/EU/players/{player_id}", {"limit": 1})
        return {
            "position": data.get("position", None),
            "points":   data.get("faceit_points", None),
        }
    except Exception:
        return {"position": None, "points": None}


# ─── Route 5: Advanced pattern analysis ──────────────────────────────────────
@app.get("/player/{player_id}/patterns")
async def get_patterns(player_id: str):
    matches  = await get_match_history(player_id, limit=30)
    real     = [m for m in matches if m["result"] in ("W", "L")]
    patterns = []
    if not real:
        return patterns

    wins     = sum(1 for m in real if m["result"] == "W")
    win_rate = wins / len(real)
    kds      = [m["kd"]  for m in real if m["kd"]  > 0]
    adrs     = [m["adr"] for m in real if m["adr"] > 0]
    avg_kd   = sum(kds)  / len(kds)  if kds  else 0
    avg_adr  = sum(adrs) / len(adrs) if adrs else 0
    avg_hs   = sum(m["hs_pct"] for m in real) / len(real)

    total_clutch_1v1 = sum(m["clutch_1v1"] for m in real)
    total_clutch_1v2 = sum(m["clutch_1v2"] for m in real)
    total_first      = sum(m["first_kills"] for m in real)
    total_triples    = sum(m["triple"] for m in real)
    total_pentas     = sum(m["penta"]  for m in real)
    total_utility    = sum(m["utility_dmg"] for m in real)
    total_sniper     = sum(m["sniper_kills"] for m in real)
    total_kills      = sum(m["kills"] for m in real)
    total_rounds     = sum(m["rounds"] for m in real)

    # Win rate
    if win_rate < 0.45:
        patterns.append({"label": "Below 50% Win Rate", "desc": f"Winning {round(win_rate*100,1)}% of last {len(real)} matches. Focus on your best 2–3 maps to stabilize.", "severity": "high"})
    elif win_rate >= 0.60:
        patterns.append({"label": "Strong Win Rate", "desc": f"Winning {round(win_rate*100,1)}% of recent matches — well above average. Keep your map pool tight.", "severity": "positive"})

    # K/D
    low_kd = sum(1 for k in kds if k < 0.8)
    if low_kd >= 5:
        patterns.append({"label": "Frequent Low K/D Games", "desc": f"{low_kd}/{len(real)} matches had K/D below 0.8. Review positioning and entry timing.", "severity": "high"})
    if avg_kd >= 1.4:
        patterns.append({"label": "Above Average Fragger", "desc": f"Avg K/D of {round(avg_kd,2)} puts you above most players at your ELO.", "severity": "positive"})

    # ADR
    if avg_adr > 0:
        if avg_adr < 60:
            patterns.append({"label": "Low ADR", "desc": f"Avg damage per round of {round(avg_adr,1)} is below average (70–80). You may be losing duels early or not trading effectively.", "severity": "high"})
        elif avg_adr >= 85:
            patterns.append({"label": "High Impact Player", "desc": f"ADR of {round(avg_adr,1)} is excellent — you're consistently dealing high damage each round.", "severity": "positive"})

    # Entry fragging
    if total_rounds > 0:
        entry_rate = total_first / total_rounds
        if entry_rate >= 0.18:
            patterns.append({"label": "Entry Fragger Role", "desc": f"You open {round(entry_rate*100,1)}% of rounds with first kills — you're a natural entry fragger. Make sure your team is ready to trade you.", "severity": "positive"})
        elif entry_rate < 0.06 and total_rounds > 100:
            patterns.append({"label": "Passive Playstyle", "desc": f"Low entry rate of {round(entry_rate*100,1)}%. Consider being more proactive in opening rounds on CT-side maps.", "severity": "medium"})

    # Clutch ability
    clutch_total = total_clutch_1v1 + total_clutch_1v2
    if clutch_total >= 5:
        patterns.append({"label": "Clutch Performer", "desc": f"{total_clutch_1v1} 1v1 wins and {total_clutch_1v2} 1v2 wins across {len(real)} matches — strong composure under pressure.", "severity": "positive"})
    elif len(real) >= 15 and clutch_total == 0:
        patterns.append({"label": "Clutch Deficit", "desc": "No recorded clutch wins in recent matches. Practice retake scenarios and 1v1 duels.", "severity": "medium"})

    # Multi-kills
    if total_pentas > 0:
        patterns.append({"label": "Ace Machine", "desc": f"{total_pentas} penta kill(s) in your last {len(real)} matches — exceptional round-winning ability.", "severity": "positive"})
    if total_triples >= 10:
        patterns.append({"label": "Multi-Kill Threat", "desc": f"{total_triples} triple kills in {len(real)} matches. You regularly win important duels in sequence.", "severity": "positive"})

    # HS%
    if avg_hs < 35:
        patterns.append({"label": "Low Headshot %", "desc": f"Avg HS% of {round(avg_hs,1)}% suggests crosshair placement could be improved. Try aim_botz drills focusing on head level.", "severity": "medium"})
    elif avg_hs >= 60:
        patterns.append({"label": "Headshot Specialist", "desc": f"HS% of {round(avg_hs,1)}% is elite. Your aim is consistently precise.", "severity": "positive"})

    # Utility usage
    if total_utility > 0 and total_rounds > 0:
        util_per_round = total_utility / total_rounds
        if util_per_round < 2 and total_rounds > 100:
            patterns.append({"label": "Underusing Utility", "desc": f"Low utility damage per round ({round(util_per_round,1)}). Consider adding flash/molotov usage to your play.", "severity": "medium"})

    # Sniper
    if total_kills > 0:
        sniper_rate = total_sniper / total_kills
        if sniper_rate >= 0.25:
            patterns.append({"label": "AWPer / Sniper Role", "desc": f"{round(sniper_rate*100,1)}% of your kills are with sniper rifles — you're filling the AWP role.", "severity": "positive"})

    # Fraggers not winning
    if avg_kd >= 1.3 and win_rate < 0.48:
        patterns.append({"label": "Fragging but Not Winning", "desc": f"K/D of {round(avg_kd,2)} is strong but win rate is only {round(win_rate*100,1)}%. Focus more on objectives and utility.", "severity": "medium"})

    # Map pool
    unique_maps = set(m["map"] for m in real if m["map"] != "Unknown")
    if len(unique_maps) >= 6:
        patterns.append({"label": "Wide Map Pool", "desc": f"Playing {len(unique_maps)} different maps. Narrowing to 3–4 strongest maps improves consistency.", "severity": "medium"})

    # Best map
    map_wins = defaultdict(lambda: {"wins": 0, "matches": 0})
    for m in real:
        if m["map"] == "Unknown": continue
        map_wins[m["map"]]["matches"] += 1
        if m["result"] == "W": map_wins[m["map"]]["wins"] += 1
    best = max(((k, v) for k, v in map_wins.items() if v["matches"] >= 3), key=lambda x: x[1]["wins"] / x[1]["matches"], default=(None, None))
    if best[0]:
        wr = round(best[1]["wins"] / best[1]["matches"] * 100, 1)
        patterns.append({"label": f"{best[0]} Specialist", "desc": f"Best map: {best[0]} at {wr}% win rate. Prioritize queuing it.", "severity": "positive"})

    return patterns