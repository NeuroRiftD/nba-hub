// Hardwood NBA server: zero dependencies, Node 18+.  Run: node server.js
// Data comes from ESPN's unofficial public JSON endpoints (no key needed, but unsupported and may change).
const http = require("http"), fs = require("fs"), path = require("path");
const E = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const cache = new Map();

async function get(url, ttl) {
  const c = cache.get(url);
  if (c && Date.now() - c.t < ttl) return c.v;
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 hardwood-nba" } });
  if (!r.ok) throw new Error(r.status + " from data source");
  const v = await r.json();
  cache.set(url, { t: Date.now(), v });
  return v;
}
const team = t => t && { id: t.id, abbr: t.abbreviation, name: t.displayName, logo: t.logo || (t.logos && t.logos[0] && t.logos[0].href) || "" };
const status = (...o) => { for (const x of o) if (x && x.type) return x.type; return {}; };

async function scoreboard(q) {
  const d = (q.get("date") || "").replace(/-/g, "");
  const j = await get(`${E}/scoreboard${/^\d{8}$/.test(d) ? "?dates=" + d : ""}`, 15e3);
  return (j.events || []).map(e => {
    const c = e.competitions[0], s = status(e.status, c.status);
    const f = h => { const x = c.competitors.find(k => k.homeAway === h); return { ...team(x.team), score: +x.score || 0, record: (x.records && x.records[0] && x.records[0].summary) || "" }; };
    return { id: e.id, date: e.date, state: s.state, detail: s.shortDetail, home: f("home"), away: f("away"), tv: (c.broadcasts || []).flatMap(b => b.names || []).join(", ") };
  });
}

async function game(id) {
  if (!/^\d+$/.test(id)) throw new Error("bad id");
  const j = await get(`${E}/summary?event=${id}`, 15e3);
  const teams = ((j.boxscore && j.boxscore.players) || []).map(t => {
    const st = (t.statistics && t.statistics[0]) || {};
    const keyOf = i => [st.labels && st.labels[i], st.names && st.names[i], st.keys && st.keys[i]].filter(Boolean);
    const mk = a => { const o = {}; (a.stats || []).forEach((v, i) => keyOf(i).forEach(k => { if (!(k in o)) o[k] = v; })); return o; };
    return {
      ...team(t.team),
      players: (st.athletes || []).filter(a => !a.didNotPlay && a.stats && a.stats.length).map(a => ({
        id: a.athlete.id, name: a.athlete.displayName, pos: (a.athlete.position && a.athlete.position.abbreviation) || "",
        jersey: a.athlete.jersey || "", starter: !!a.starter, stats: mk(a)
      }))
    };
  });
  const plays = (j.plays || []).slice(-60).reverse().map(p => ({ text: p.text, clock: p.clock && p.clock.displayValue, q: p.period && p.period.number, score: p.awayScore != null ? p.awayScore + "-" + p.homeScore : "" }));
  return { teams, plays };
}

const teamsList = async () => {
  const j = await get(`${E}/teams`, 864e5);
  return j.sports[0].leagues[0].teams.map(x => team(x.team)).sort((a, b) => a.name.localeCompare(b.name));
};

const injStatus = x => typeof x === "string" ? x : (x && (x.description || x.name)) || "Injured";
async function injuries() {
  const j = await get(`${E}/injuries`, 6e5), m = {};
  for (const t of j.injuries || []) for (const i of t.injuries || []) {
    const id = i.athlete && i.athlete.id;
    if (!id) continue;
    const d = i.details || {};
    m[id] = { status: injStatus(i.status), note: [d.type, d.detail, d.side].filter(Boolean).join(" · "), comment: i.shortComment || "", ret: d.returnDate || "" };
  }
  return m;
}

async function roster(id) {
  const [j, inj] = await Promise.all([get(`${E}/teams/${id}/roster`, 36e5), injuries().catch(() => ({}))]);
  const a = (j.athletes || []).flatMap(x => x.items || [x]);
  return a.map(p => ({
    id: p.id, name: p.displayName, jersey: p.jersey || "", pos: (p.position && p.position.abbreviation) || "", height: p.displayHeight || "", age: p.age || "",
    inj: inj[p.id] || (p.injuries && p.injuries[0] ? { status: injStatus(p.injuries[0].status), note: "", comment: "", ret: "" } : null)
  }));
}

async function schedule(id) {
  const j = await get(`${E}/teams/${id}/schedule`, 36e5);
  return (j.events || []).map(e => {
    const c = e.competitions[0], s = status(c.status, e.status), f = h => team(c.competitors.find(x => x.homeAway === h).team);
    return { id: e.id, date: e.date, state: s.state || "pre", detail: s.shortDetail || "", home: f("home"), away: f("away") };
  });
}

async function standings() {
  const j = await get("https://site.api.espn.com/apis/v2/sports/basketball/nba/standings", 3e5);
  return (j.children || []).map(c => ({
    conf: (c.name || "").replace(" Conference", ""),
    rows: ((c.standings && c.standings.entries) || []).map(e => {
      const v = n => { const s = (e.stats || []).find(x => x.name === n); return s ? s.value : 0; };
      const w = v("wins"), l = v("losses");
      return { id: e.team.id, abbr: e.team.abbreviation, name: e.team.displayName, logo: (e.team.logos && e.team.logos[0] && e.team.logos[0].href) || "", w, l, pct: w + l ? w / (w + l) : 0 };
    }).sort((a, b) => b.pct - a.pct || b.w - a.w)
  }));
}

async function news(q) {
  const t = q.get("team");
  const j = await get(`${E}/news${t && /^\d+$/.test(t) ? "?team=" + t : ""}`, 3e5);
  return (j.articles || []).map(a => ({ title: a.headline, text: a.description || "", time: a.published, link: a.links && a.links.web && a.links.web.href, img: a.images && a.images[0] && a.images[0].url }));
}

async function player(id) {
  if (!/^\d+$/.test(id)) throw new Error("bad id");
  const j = await get(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${id}/overview`, 36e5);
  const s = j.statistics || {}, sp = (s.splits || [])[0] || {};
  return { labels: s.labels || s.names || [], stats: sp.stats || [], split: sp.displayName || "" };
}

async function players() {
  const base = "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete?region=us&lang=en&contentorigin=espn&limit=50&seasontype=2";
  const sorts = ["offensive.avgPoints", "general.avgRebounds", "offensive.avgAssists", "defensive.avgSteals", "defensive.avgBlocks", "offensive.fieldGoalPct", "offensive.threePointFieldGoalPct", "offensive.freeThrowPct"];
  const pull = async q => (await Promise.allSettled(sorts.map(s => get(`${base}&isqualified=${q}&sort=${s}:desc`, 6e5)))).filter(r => r.status === "fulfilled").map(r => r.value);
  let res = await pull(true);
  if (!res.some(j => (j.athletes || []).length)) res = await pull(false); // early season: nobody is "qualified" yet
  const COLS = ["GP", "MIN", "PTS", "REB", "AST", "STL", "BLK", "FG%", "3P%", "FT%"], seen = new Map();
  for (const j of res) for (const a of j.athletes || []) {
    const id = a.athlete && a.athlete.id;
    if (!id || seen.has(id)) continue;
    const v = {};
    for (const ac of a.categories || []) {
      const def = (j.categories || []).find(c => c.name === ac.name);
      if (!def) continue;
      const vals = ac.values || ac.totals || [];
      (def.labels || []).forEach((l, i) => { if (COLS.includes(l) && !(l in v)) { const n = parseFloat(vals[i]); v[l] = isNaN(n) ? null : n; } });
    }
    seen.set(id, { id, name: a.athlete.displayName, team: a.athlete.teamShortName || "", v });
  }
  const rows = [...seen.values()];
  return { cols: COLS.filter(c => rows.some(r => r.v[c] != null)), rows };
}

const routes = { scoreboard: (q) => scoreboard(q), game: (q, a) => game(a), teams: () => teamsList(), roster: (q, a) => roster(a), schedule: (q, a) => schedule(a), standings: () => standings(), news: (q) => news(q), player: (q, a) => player(a), players: () => players() };

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x"), m = u.pathname.split("/");
  if (m[1] === "api") {
    try {
      const fn = routes[m[2]];
      if (!fn || (["game", "roster", "schedule", "player"].includes(m[2]) && !/^\d+$/.test(m[3] || ""))) { res.writeHead(404); return res.end("{}"); }
      const d = await fn(u.searchParams, m[3]);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(d));
    } catch (e) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message) }));
    }
    return;
  }
  const f = path.join(__dirname, "public", "index.html");
  fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end("Not found"); } res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(b); });
}).listen(process.env.PORT || 3000, () => console.log("Hardwood running on http://localhost:" + (process.env.PORT || 3000)));
