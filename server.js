// NBA HUB server: zero dependencies, Node 18+.  Run: node server.js
// Data comes from ESPN's unofficial public JSON endpoints (no key needed, but unsupported and may change).
const http = require("http"), fs = require("fs"), path = require("path");
const E = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const APP_V = "v14";
const cache = new Map();
// ESPN names a season by the year it ends (2026-27 = 2027). New season starts in October.
const seasonYear = () => { const [y, m] = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).split("-").map(Number); return m >= 10 ? y + 1 : y; };
const seasonLabel = y => `${y - 1}-${String(y).slice(2)}`;

async function get(url, ttl) {
  const c = cache.get(url);
  if (c && Date.now() - c.t < ttl) return c.v;
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 nba-hub" } });
  if (!r.ok) throw new Error(r.status + " from data source");
  const v = await r.json();
  cache.set(url, { t: Date.now(), v });
  return v;
}
const team = t => t && { id: t.id, abbr: t.abbreviation, name: t.displayName, logo: t.logo || (t.logos && t.logos[0] && t.logos[0].href) || "" };
const status = (...o) => { for (const x of o) if (x && x.type) return x.type; return {}; };

// Special-event label for a game: All-Star, NBA Cup, Play-In, playoffs, Christmas, global games, preseason.
// ESPN puts these in the game's name, its notes, or its season type; anything it doesn't mention stays untagged.
function tagOf(e) {
  try {
    const c = (e.competitions && e.competitions[0]) || {};
    const notes = (c.notes || []).map(n => n.headline || n.text || "").filter(Boolean);
    const txt = [e.name, e.shortName, ...notes].join(" | ");
    const st = (e.season && +e.season.type) || (e.seasonType && +e.seasonType.id) || 0;
    const slug = String((e.season && e.season.slug) || (e.seasonType && e.seasonType.name) || "");
    const day = new Date(e.date).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    if (/all[- ]star|rising stars|celebrity game|skills challenge|3-point (contest|challenge)|three-point (contest|challenge)|slam dunk/i.test(txt)) return { tag: "All-Star", sp: true };
    if (/nba finals/i.test(txt)) return { tag: "NBA Finals", sp: true };
    if (st === 5 || /play-?in/i.test(txt + " " + slug)) return { tag: "Play-In", sp: true };
    if (/nba cup|emirates/i.test(txt)) {
      const m = txt.match(/quarterfinal|semifinal|final/i);
      return m ? { tag: "NBA Cup " + m[0][0].toUpperCase() + m[0].slice(1).toLowerCase(), sp: true } : { tag: "NBA Cup", sp: false };
    }
    if (st === 3 || /playoff|first round|second round|conference (semi)?finals?/i.test(txt)) return { tag: (notes[0] || "Playoffs").slice(0, 40), sp: true };
    if (/-12-25$/.test(day)) return { tag: "Christmas Day", sp: true };
    if (/nba (paris|london|mexico|berlin|global)|global games|abu dhabi/i.test(txt)) return { tag: "Global Games", sp: true };
    if (st === 1 || /preseason/i.test(slug)) return { tag: "Preseason", sp: false };
  } catch (_) {}
  return { tag: "", sp: false };
}

async function scoreboard(q) {
  const d = (q.get("date") || "").replace(/-/g, "");
  const j = await get(`${E}/scoreboard${/^\d{8}$/.test(d) ? "?dates=" + d : ""}`, 15e3);
  return (j.events || []).map(e => {
    const c = e.competitions[0], s = status(e.status, c.status);
    const f = h => { const x = c.competitors.find(k => k.homeAway === h); return { ...team(x.team), score: +x.score || 0, record: (x.records && x.records[0] && x.records[0].summary) || "" }; };
    return { id: e.id, date: e.date, state: s.state, detail: s.shortDetail, home: f("home"), away: f("away"), ...tagOf(e), tv: (c.broadcasts || []).flatMap(b => b.names || []).join(", ") };
  });
}

async function game(id) {
  if (!/^\d+$/.test(id)) throw new Error("bad id");
  const j = await get(`${E}/summary?event=${id}`, 15e3);
  const teams = ((j.boxscore && j.boxscore.players) || []).map(t => {
    const st = (t.statistics && t.statistics[0]) || {};
    const keyOf = i => [st.labels && st.labels[i], st.names && st.names[i], st.keys && st.keys[i]].filter(Boolean);
    const mkT = () => { const o = {}; (st.totals || []).forEach((v, i) => keyOf(i).forEach(k => { if (!(k in o)) o[k] = v; })); return o; };
    const mk = a => { const o = {}; (a.stats || []).forEach((v, i) => keyOf(i).forEach(k => { if (!(k in o)) o[k] = v; })); return o; };
    return {
      ...team(t.team),
      totals: mkT(),
      players: (st.athletes || []).filter(a => !a.didNotPlay && a.stats && a.stats.length).map(a => ({
        id: a.athlete.id, name: a.athlete.displayName, pos: (a.athlete.position && a.athlete.position.abbreviation) || "",
        jersey: a.athlete.jersey || "", starter: !!a.starter, stats: mk(a)
      }))
    };
  });
  const plays = (j.plays || []).slice(-600).reverse().map(p => ({ text: p.text, clock: p.clock && p.clock.displayValue, q: p.period && p.period.number, pd: p.period && p.period.displayValue, score: p.awayScore != null ? p.awayScore + "-" + p.homeScore : "", scoring: !!p.scoringPlay, team: p.team && p.team.id }));
  return { teams, plays };
}

const teamsList = async () => {
  const j = await get(`${E}/teams`, 864e5);
  return j.sports[0].leagues[0].teams.map(x => team(x.team)).sort((a, b) => a.name.localeCompare(b.name));
};

const injStatus = x => typeof x === "string" ? x : (x && (x.description || x.name)) || "Injured";
const normName = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/[^a-z]/g, "");
// ESPN's injury list gives its players no plain "id" field, so dig the id out of the profile links instead.
const athId = a => {
  if (!a) return "";
  if (a.id) return String(a.id);
  for (const l of a.links || []) { const m = /\/id\/(\d+)/.exec(l.href || ""); if (m) return m[1]; }
  const m = /athletes\/(\d+)/.exec(a.$ref || "") || /a:(\d+)/.exec(a.uid || "");
  return m ? m[1] : "";
};
// "out for the season", "season-ending surgery", "will miss the rest of the season" ... but not "back for the season opener".
const SEASON_END = /season-ending|(out|miss\w*|sidelined|done|shut down)\b[^.]{0,30}?\b(for|rest of|remainder of|entire)\s+(the\s+)?(entire\s+|rest of the\s+|remainder of the\s+)?(season|year)\b(?!\s*(opener|debut|start))/i;

function fromEspn(i, tm) {
  const d = i.details || {}, a = i.athlete || {};
  const comment = i.shortComment || String(i.longComment || "").slice(0, 240);
  let status = injStatus(i.status);
  if (/out/i.test(status) && SEASON_END.test([comment, i.longComment, d.detail].filter(Boolean).join(" "))) status = "Out for season";
  return {
    id: athId(a), name: a.displayName || a.fullName || "", pos: (a.position && a.position.abbreviation) || "",
    team: { id: String(tm.id || (a.team && a.team.id) || ""), name: tm.displayName || "" },
    status, note: [d.type, d.detail, d.side].filter(Boolean).join(" · "), comment, date: i.date || "", ret: d.returnDate || ""
  };
}

// injuries-extra.json: injuries you add by hand for anything ESPN misses. It always wins over ESPN, and drops off after its "until" date.
function manualInjuries(tl) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const raw = readJson("injuries-extra.json", []);
  return (Array.isArray(raw) ? raw : []).filter(x => x && x.name && !(x.until && String(x.until) < today)).map(x => {
    const k = String(x.team || "").toLowerCase();
    const t = tl.find(t => String(t.id) === k || (t.abbr || "").toLowerCase() === k || (t.name || "").toLowerCase() === k);
    return { id: x.id ? String(x.id) : "", name: String(x.name), pos: x.pos || "", team: { id: t ? String(t.id) : "", name: t ? t.name : String(x.team || "") }, status: x.status || "Out", note: x.note || "", comment: x.comment || "", date: x.date || "", ret: x.return || "" };
  });
}

// Everyone who is hurt, from three places: ESPN's injury list, the injuries ESPN pins on each roster, and injuries-extra.json.
// ids = which team rosters to read (null = all 30).
async function buildInjuries(ids) {
  let feedFailed = null;
  const [feed, tl] = await Promise.all([get(`${E}/injuries`, 6e5).catch(e => { feedFailed = e; return {}; }), teamsList().catch(() => [])]);
  const want = ids || tl.map(t => String(t.id));
  const rost = await Promise.all(want.map(id => get(`${E}/teams/${id}/roster`, 36e5).then(j => ({ id: String(id), a: (j.athletes || []).flatMap(x => x.items || [x]) })).catch(() => ({ id: String(id), a: [] }))));
  if (feedFailed && rost.every(r => !r.a.length)) throw feedFailed;
  const byTeamName = new Map(), byName = new Map(), tname = id => (tl.find(t => String(t.id) === String(id)) || {}).name || "";
  for (const r of rost) for (const p of r.a) { const n = normName(p.displayName); byTeamName.set(r.id + ":" + n, String(p.id)); byName.set(n, byName.has(n) ? "" : String(p.id)); }
  const all = [];
  for (const t of feed.injuries || []) for (const i of t.injuries || []) all.push(fromEspn(i, t));
  for (const r of rost) for (const p of r.a) for (const i of p.injuries || []) all.push(fromEspn({ ...i, athlete: p }, { id: r.id, displayName: tname(r.id) }));
  const out = new Map();
  const put = (x, force) => {
    if (!x.name) return;
    const n = normName(x.name);
    if (!x.id) x.id = byTeamName.get(x.team.id + ":" + n) || byName.get(n) || "";
    const k = x.id || x.team.id + ":" + n;
    if (force || !out.has(k)) out.set(k, x);
  };
  all.forEach(x => put(x, false));
  manualInjuries(tl).forEach(x => put(x, true));
  return [...out.values()];
}
let injAll = { t: 0, v: null };
async function allInjuries() {
  if (injAll.v && Date.now() - injAll.t < 6e5) return injAll.v;
  const v = await buildInjuries(null);
  injAll = { t: Date.now(), v };
  return v;
}

// Starting five from the team's most recent finished game (ESPN has no depth chart).
async function lastStarters(id) {
  const sch = await schedule(id);
  const done = sch.filter(g => g.state === "post").sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!done) return null;
  const g = await game(done.id), t = g.teams.find(x => String(x.id) === String(id));
  if (!t) return null;
  const home = String(done.home.id) === String(id), opp = home ? done.away : done.home;
  return {
    from: { id: done.id, date: done.date, opp: opp.abbr, home },
    starters: t.players.filter(p => p.starter).slice(0, 5).map(p => ({ id: p.id, name: p.name, pos: p.pos, jersey: p.jersey }))
  };
}

async function roster(id) {
  const [j, inj, ls] = await Promise.all([get(`${E}/teams/${id}/roster`, 36e5), buildInjuries([String(id)]).catch(() => []), lastStarters(id).catch(() => null)]);
  const a = (j.athletes || []).flatMap(x => x.items || [x]);
  const mine = inj.filter(x => String(x.team.id) === String(id));
  const byId = new Map(mine.filter(x => x.id).map(x => [x.id, x])), byN = new Map(mine.map(x => [normName(x.name), x]));
  const players = a.map(p => {
    const x = byId.get(String(p.id)) || byN.get(normName(p.displayName));
    return {
      id: p.id, name: p.displayName, jersey: p.jersey || "", pos: (p.position && p.position.abbreviation) || "", height: p.displayHeight || "", age: p.age || "",
      inj: x ? { status: x.status, note: x.note, comment: x.comment, ret: x.ret } : null
    };
  });
  return { players, starters: (ls && ls.starters) || [], from: (ls && ls.from) || null };
}

async function schedule(id) {
  const j = await get(`${E}/teams/${id}/schedule?season=${seasonYear()}`, 36e5);
  return (j.events || []).map(e => {
    const c = e.competitions[0], s = status(c.status, e.status), f = h => { const x = c.competitors.find(k => k.homeAway === h), sc = x.score == null ? null : +(x.score.displayValue ?? x.score.value ?? x.score); return { ...team(x.team), score: isNaN(sc) ? null : sc, w: x.winner === true ? true : x.winner === false ? false : null }; };
    return { id: e.id, date: e.date, state: s.state || "pre", detail: s.shortDetail || "", home: f("home"), away: f("away"), ...tagOf(e) };
  });
}

async function standings() {
  const j = await get(`https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=${seasonYear()}`, 3e5);
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
  const j = await get(`${E}/news?limit=40${t && /^\d+$/.test(t) ? "&team=" + t : ""}`, 3e5);
  return (j.articles || []).filter(a => a.headline).map(a => ({ title: a.headline, text: a.description || "", time: a.published, link: a.links && a.links.web && a.links.web.href, img: a.images && a.images[0] && a.images[0].url }));
}

async function player(id) {
  if (!/^\d+$/.test(id)) throw new Error("bad id");
  const y = seasonYear(), split = seasonLabel(y) + " regular season";
  try {
    const j = await get(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${y}/types/2/athletes/${id}/statistics`, 36e5);
    const m = {};
    for (const c of (j.splits && j.splits.categories) || []) for (const s of c.stats || []) if (!(s.name in m)) m[s.name] = s.displayValue ?? s.value;
    const pick = [["GP", ["gamesPlayed"]], ["MIN", ["avgMinutes"]], ["PPG", ["avgPoints"]], ["RPG", ["avgRebounds"]], ["APG", ["avgAssists"]], ["SPG", ["avgSteals"]], ["BPG", ["avgBlocks"]], ["TO", ["avgTurnovers"]], ["FG%", ["fieldGoalPct"]], ["3P%", ["threePointFieldGoalPct", "threePointPct"]], ["FT%", ["freeThrowPct"]], ["Total PTS", ["points"]], ["Total REB", ["rebounds"]], ["Total AST", ["assists"]]];
    const out = pick.map(([l, ns]) => [l, ns.map(n => m[n]).find(v => v != null)]).filter(([, v]) => v != null);
    return { labels: out.map(o => o[0]), stats: out.map(o => o[1]), split };
  } catch (e) {
    if (/^404/.test(e.message)) return { labels: [], stats: [], split }; // no games played yet this season
    throw e;
  }
}

async function players() {
  const base = `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete?region=us&lang=en&contentorigin=espn&limit=50&seasontype=2&season=${seasonYear()}`;
  const sorts = ["offensive.avgPoints", "general.avgRebounds", "offensive.avgAssists", "defensive.avgSteals", "defensive.avgBlocks", "offensive.fieldGoalPct", "offensive.threePointFieldGoalPct", "offensive.freeThrowPct"];
  const pull = async q => (await Promise.allSettled(sorts.map(s => get(`${base}&isqualified=${q}&sort=${s}:desc`, 6e5)))).filter(r => r.status === "fulfilled").map(r => r.value);
  let res = await pull(true);
  if (!res.some(j => (j.athletes || []).length)) res = await pull(false); // early season: nobody is "qualified" yet
  const PREF = ["GP", "MIN", "PTS", "REB", "AST", "STL", "BLK", "FG%", "3P%", "FT%"], seen = new Map(), order = [], desc = {};
  for (const j of res) for (const a of j.athletes || []) {
    const id = a.athlete && a.athlete.id;
    if (!id || seen.has(id)) continue;
    const v = {};
    for (const ac of a.categories || []) {
      const def = (j.categories || []).find(c => c.name === ac.name);
      if (!def) continue;
      const vals = ac.values || ac.totals || [];
      (def.labels || []).forEach((l, i) => {
        if (!l || l in v) return;
        const n = parseFloat(vals[i]);
        v[l] = isNaN(n) ? null : n;
        if (!order.includes(l)) order.push(l);
        if (def.descriptions && def.descriptions[i]) desc[l] = def.descriptions[i];
      });
    }
    // If the feed gave season totals instead of per-game numbers (minutes > 48 is impossible per game), convert.
    if (v.GP && v.MIN > 48) for (const k of ["MIN", "PTS", "REB", "AST", "STL", "BLK"]) if (v[k] != null) { const T = v[k]; v[k] = Math.round(T / v.GP * 10) / 10; if (k !== "MIN") v["T" + k] = T; }
    // Season totals = per-game average x games played (can be off by a few because averages are rounded).
    [["PTS", "TPTS"], ["REB", "TREB"], ["AST", "TAST"], ["STL", "TSTL"], ["BLK", "TBLK"]].forEach(([k, t]) => { if (v[t] == null && v[k] != null && v.GP) v[t] = Math.round(v[k] * v.GP); });
    seen.set(id, { id, name: a.athlete.displayName, team: a.athlete.teamShortName || "", v });
  }
  const rows = [...seen.values()];
  const cols = [...PREF, ...order.filter(l => !PREF.includes(l)), "TPTS", "TREB", "TAST", "TSTL", "TBLK"].filter(c => rows.some(r => r.v[c] != null));
  return { cols, rows, desc, season: seasonLabel(seasonYear()) };
}

async function injuryFeed() {
  const list = await allInjuries();
  return list.filter(x => x.name).sort((x, y) => String(y.date).localeCompare(String(x.date)));
}

async function month(ym) {
  if (!/^\d{4}-\d{2}$/.test(ym || "")) throw new Error("bad month");
  const [y, m] = ym.split("-").map(Number), p = n => String(n).padStart(2, "0"), last = new Date(y, m, 0).getDate();
  const j = await get(`${E}/scoreboard?dates=${y}${p(m)}01-${y}${p(m)}${p(last)}&limit=1000`, 3e5);
  return (j.events || []).map(e => {
    const c = e.competitions[0], s = status(e.status, c.status), f = h => { const x = c.competitors.find(k => k.homeAway === h); return { id: x.team.id, abbr: x.team.abbreviation, score: +x.score || 0 }; };
    return { id: e.id, date: e.date, state: s.state, home: f("home"), away: f("away"), ...tagOf(e) };
  });
}

const etS = t => new Date(t).toLocaleDateString("en-CA", { timeZone: "America/New_York" }).replace(/-/g, "");
const evNorm = e => {
  const c = e.competitions[0], s = status(e.status, c.status);
  const f = h => { const x = c.competitors.find(k => k.homeAway === h); return { ...team(x.team), score: +x.score || 0, record: (x.records && x.records[0] && x.records[0].summary) || "" }; };
  return { id: e.id, date: e.date, state: s.state, detail: s.shortDetail, home: f("home"), away: f("away"), ...tagOf(e) };
};
// Live games from yesterday's and today's (Eastern) slates, so games that run past midnight stay visible.
async function live() {
  const all = (await Promise.all([etS(Date.now() - 864e5), etS(Date.now())].map(d => scoreboard(new URLSearchParams({ date: d }))))).flat();
  const seen = new Set();
  return all.filter(g => g.state === "in" && !seen.has(g.id) && seen.add(g.id));
}
// Finished games from the past week (newest first) plus the next few upcoming games.
// One scoreboard request per day (the same call the Scores date picker uses); a day that fails is skipped.
async function recent() {
  const now = Date.now(), ks = [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3];
  const ttl = k => k === 0 ? 15e3 : k === -1 ? 6e4 : k < 0 ? 18e5 : 6e5;
  const res = await Promise.allSettled(ks.map(k => get(`${E}/scoreboard?dates=${etS(now + k * 864e5)}`, ttl(k))));
  if (res.every(r => r.status === "rejected")) throw new Error(res[0].reason && res[0].reason.message || "no data");
  const seen = new Set(), all = [];
  for (const r of res) if (r.status === "fulfilled") for (const e of r.value.events || []) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    try { all.push(evNorm(e)); } catch (_) {}
  }
  const done = all.filter(g => g.state === "post").sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const next = all.filter(g => g.state === "pre").sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  return [...done, ...next];
}

async function moves() {
  const j = await get(`${E}/transactions?limit=100`, 6e5);
  return (j.transactions || []).map(t => {
    const d = t.description || "";
    const kind = /waive|release|cut/i.test(d) ? "Release" : /trade|acquire/i.test(d) ? "Trade" : /sign|agree|claim|extend|contract/i.test(d) ? "Signing" : "Other";
    return { date: t.date || "", text: d, kind, team: team(t.team) || null };
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

const readJson = (file, dflt) => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, file), "utf8")); } catch (_) { return dflt; } };
const decodeXml = t => String(t || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
const HL_DEFAULT = { youtube: [{ name: "NBA", channelId: "UCWJ2lWNubArHWmf3FIHbfcQ" }], x: { accounts: ["NBA", "HouseHighlights", "BleacherReport", "SportsCenter"], posts: [] } };

// Newest uploads from a YouTube channel's public RSS feed (no key needed).
async function ytFeed(ch) {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${ch.channelId}`, c = cache.get(url);
  if (c && Date.now() - c.t < 6e5) return c.v;
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 nba-hub" } });
  if (!r.ok) throw new Error(`${r.status} from YouTube for ${ch.name || ch.channelId}`);
  const xml = await r.text(), author = decodeXml((xml.match(/<author>\s*<name>([^<]*)<\/name>/) || [])[1] || ch.name || "");
  const v = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => {
    const b = m[1], id = (b.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1];
    return id && /^[\w-]{11}$/.test(id) ? { id, title: decodeXml((b.match(/<title>([^<]*)<\/title>/) || [])[1]), time: (b.match(/<published>([^<]+)<\/published>/) || [])[1] || "", channel: author } : null;
  }).filter(Boolean);
  cache.set(url, { t: Date.now(), v });
  return v;
}

async function highlights() {
  const cfg = readJson("highlights.json", HL_DEFAULT);
  const chans = (Array.isArray(cfg.youtube) ? cfg.youtube : HL_DEFAULT.youtube).filter(c => c && /^UC[\w-]{20,}$/.test(String(c.channelId)));
  const res = await Promise.allSettled(chans.map(ytFeed));
  const videos = res.filter(r => r.status === "fulfilled").flatMap(r => r.value).sort((a, b) => String(b.time).localeCompare(String(a.time))).slice(0, 18);
  const errs = res.filter(r => r.status === "rejected").map(r => r.reason && r.reason.message);
  const xc = cfg.x || {};
  const posts = (Array.isArray(xc.posts) ? xc.posts : []).map(u => String(u).match(/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/(\w{1,15})\/status\/(\d{5,25})/i)).filter(Boolean).map(m => ({ id: m[2], handle: m[1] }));
  const accounts = (Array.isArray(xc.accounts) ? xc.accounts : HL_DEFAULT.x.accounts).map(String).filter(a => /^\w{1,15}$/.test(a)).slice(0, 8);
  return { videos, x: { posts, accounts }, feedError: videos.length ? "" : (errs[0] || "") };
}

// Events ESPN's schedule doesn't list (All-Star Saturday contests etc.), kept in events.json so you can edit them.
function eventsList() {
  const a = readJson("events.json", []);
  return (Array.isArray(a) ? a : []).filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(String(x.date)) && typeof x.title === "string").map(x => ({ date: x.date, title: x.title.slice(0, 80), kind: String(x.kind || "Event").slice(0, 20), note: String(x.note || "").slice(0, 120) })).sort((a, b) => a.date.localeCompare(b.date));
}

const routes = { scoreboard: (q) => scoreboard(q), game: (q, a) => game(a), teams: () => teamsList(), roster: (q, a) => roster(a), schedule: (q, a) => schedule(a), standings: () => standings(), news: (q) => news(q), player: (q, a) => player(a), players: () => players(), injuries: () => injuryFeed(), month: (q) => month(q.get("ym")), live: () => live(), recent: () => recent(), moves: () => moves(), version: () => ({ v: APP_V }), highlights: () => highlights(), events: () => eventsList() };

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x"), m = u.pathname.split("/");
  if (m[1] === "api") {
    try {
      const fn = routes[m[2]];
      if (!fn || (["game", "roster", "schedule", "player"].includes(m[2]) && !/^\d+$/.test(m[3] || ""))) { res.writeHead(404); return res.end("{}"); }
      const d = await fn(u.searchParams, m[3]);
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(d));
    } catch (e) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message) }));
    }
    return;
  }
  const f = path.join(__dirname, "public", "index.html");
  fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end("Not found"); } res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); res.end(b); });
}).listen(process.env.PORT || 3000, () => console.log("NBA HUB running on http://localhost:" + (process.env.PORT || 3000)));
