(function(){
"use strict";

/* ---------------- Constants ---------------- */
const STORAGE_KEY = "fortnight-wta-state-v1";
const ROUND_ORDER = ["R128","R64","R32","R16","QF","SF","F"];
const ROUND_LABELS = {R128:"R128", R64:"R64", R32:"R32", R16:"R16", QF:"QF", SF:"SF", F:"F", Q1:"Q1", Q2:"Q2", Q3:"Q3"};
const FRIENDLY_ROUND_NAMES = {R128:"Round of 128", R64:"Round of 64", R32:"Round of 32", R16:"Round of 16", QF:"Quarterfinals", SF:"Semifinals", F:"Final"};
const LEVEL_LABELS = {GRAND_SLAM:"Grand Slam", WTA1000:"WATP 1000", WTA500:"WATP 500", WTA250:"WATP 250"};
const POINTS_TABLE = {
  GRAND_SLAM: {R128:10, R64:45,  R32:90, R16:180, QF:360, SF:720, F:1200, W:2000},
  WTA1000:    {R128:5,  R64:10,  R32:45,  R16:90, QF:180, SF:360, F:600,  W:1000},
  WTA500:     {R128:0,  R64:0,   R32:5,   R16:45,  QF:90, SF:180, F:300,  W:500},
  WTA250:     {R128:0,  R64:0,   R32:1,   R16:20,  QF:45,  SF:90,  F:150,  W:250}
};
// Points for coming through qualifying: 0 for early-round exits, a small
// consolation for going out in the last qualifying round, and a bonus for
// qualifying into the main draw outright (on top of whatever they then do there).
const QUALIFYING_POINTS_BASE = {GRAND_SLAM:25, WTA1000:16, WTA500:8, WTA250:5};
const QUALIFIER_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const QUAL_ROUND_OPTIONS = [1, 2, 3];

// Common tennis-broadcast 3-letter codes -> ISO 3166-1 alpha-2 (for flag emoji).
// 2-letter codes are assumed to already be ISO alpha-2 and used directly.
const COUNTRY_CODE_MAP = {
  USA:"US", GBR:"GB", ESP:"ES", FRA:"FR", GER:"DE", ITA:"IT", RUS:"RU", CHN:"CN",
  JPN:"JP", AUS:"AU", CAN:"CA", BRA:"BR", ARG:"AR", MEX:"MX", POL:"PL", CZE:"CZ",
  SVK:"SK", SUI:"CH", SWE:"SE", NOR:"NO", DEN:"DK", FIN:"FI", NED:"NL", BEL:"BE",
  AUT:"AT", GRE:"GR", POR:"PT", ROU:"RO", SRB:"RS", CRO:"HR", UKR:"UA", BLR:"BY",
  KAZ:"KZ", IND:"IN", KOR:"KR", THA:"TH", INA:"ID", PHI:"PH", VIE:"VN", TPE:"TW",
  HKG:"HK", SGP:"SG", MAS:"MY", NZL:"NZ", RSA:"ZA", EGY:"EG", MAR:"MA", TUN:"TN",
  ALG:"DZ", NGR:"NG", KEN:"KE", ETH:"ET", GHA:"GH", ISR:"IL", TUR:"TR", UAE:"AE",
  KSA:"SA", QAT:"QA", IRI:"IR", PAK:"PK", BAN:"BD", SRI:"LK", COL:"CO", CHI:"CL",
  PER:"PE", VEN:"VE", ECU:"EC", URU:"UY", PAR:"PY", BOL:"BO", CUB:"CU", DOM:"DO",
  JAM:"JM", PUR:"PR", CRC:"CR", PAN:"PA", GUA:"GT", HON:"HN", ISL:"IS", IRL:"IE",
  LTU:"LT", LAT:"LV", LVA:"LV", EST:"EE", SLO:"SI", SVN:"SI", BUL:"BG", HUN:"HU",
  MDA:"MD", ARM:"AM", GEO:"GE", AZE:"AZ", UZB:"UZ", MGL:"MN", LUX:"LU", MON:"MC",
  AND:"AD", CYP:"CY", MLT:"MT", ALB:"AL", MKD:"MK", BIH:"BA", MNE:"ME", KOS:"XK"
};

function countryToISO2(code){
  if(!code) return null;
  const c = code.trim().toUpperCase();
  if(c.length === 2) return c;
  if(c.length === 3 && COUNTRY_CODE_MAP[c]) return COUNTRY_CODE_MAP[c];
  return null;
}
// Image-based flag instead of an emoji character — flag emoji rely on the OS
// having flag glyphs in its system font, and most Windows browsers don't
// (you just see the letter code or a blank box there). An actual image looks
// identical on every platform. flagcdn.com is free, keyless, and widely used.
function flagImgHTML(code){
  const iso2 = countryToISO2(code);
  if(!iso2) return "";
  return '<img class="flag-img" src="https://flagcdn.com/' + iso2.toLowerCase() + '.svg" alt="' + iso2 + '" loading="lazy" onerror="this.style.display=\'none\'">';
}
// Flag + code, for standalone country display (tables, cards).
function countryDisplayHTML(code){
  if(!code) return "—";
  return flagImgHTML(code) + escapeHtml(code.toUpperCase());
}
// Flag + name, for use in front of a player's name anywhere it appears.
function playerNameHTML(player){
  if(!player) return "";
  return flagImgHTML(player.country) + escapeHtml(player.name);
}
// Same, but wrapped so clicking it opens that player's profile anywhere it's used —
// works via the existing document-level [data-open-player] click delegation.
function playerLinkHTML(player){
  if(!player) return "";
  return '<span class="name-link" data-open-player="' + player.id + '">' + playerNameHTML(player) + '</span>';
}

/* ---------------- Storage ---------------- */
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return {players:[], tournaments:[], matches:[], byeWeeks:[]};
    const parsed = JSON.parse(raw);
    return {
      players: parsed.players || [],
      tournaments: parsed.tournaments || [],
      matches: parsed.matches || [],
      byeWeeks: parsed.byeWeeks || []
    };
  }catch(e){
    console.error("Failed to load state, starting fresh.", e);
    return {players:[], tournaments:[], matches:[], byeWeeks:[]};
  }
}
function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }catch(e){
    console.error("Failed to save state", e);
    alert("Couldn't save — your browser storage may be full or blocked.");
  }
}

let state = loadState();

function uid(prefix){
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}

/* ---------------- Derived data helpers ---------------- */

function playerById(id){ return state.players.find(p => p.id === id); }
function tournamentById(id){ return state.tournaments.find(t => t.id === id); }
function matchesForTournament(tid){ return state.matches.filter(m => m.tournamentId === tid); }
function matchesForMainDraw(tid){ return state.matches.filter(m => m.tournamentId === tid && (m.bracket || "main") === "main"); }
function matchesForQualifying(tid){ return state.matches.filter(m => m.tournamentId === tid && m.bracket === "qual"); }
function matchesForPlayer(pid){ return state.matches.filter(m => m.playerAId === pid || m.playerBId === pid); }

// Furthest-round result per player for a tournament: 'W', or a round code meaning "lost in that round".
// Returns Map<playerId, {code, isChampion}>
function computeTournamentResults(tid){
  const matches = matchesForMainDraw(tid);
  const furthest = new Map(); // playerId -> {roundIdx, match}
  matches.forEach(m => {
    const idx = ROUND_ORDER.indexOf(m.round);
    [m.playerAId, m.playerBId].forEach(pid => {
      const cur = furthest.get(pid);
      if(!cur || idx > cur.roundIdx){
        furthest.set(pid, {roundIdx: idx, match: m});
      }
    });
  });
  const results = new Map();
  furthest.forEach((info, pid) => {
    const m = info.match;
    const won = m.winnerId === pid;
    if(won && m.round === "F"){
      results.set(pid, {code: "W", label: "Champion"});
    } else if(!won){
      results.set(pid, {code: m.round, label: "Lost " + ROUND_LABELS[m.round]});
    }
    // won but not final -> still active, no result yet
  });
  return results;
}

function pointsForResult(level, code){
  const table = POINTS_TABLE[level];
  if(!table) return 0;
  return table[code] || 0;
}

// --- Qualifying ---
function qualRoundNames(numRounds){
  const names = [];
  for(let i = 1; i <= numRounds; i++) names.push("Q" + i);
  return names;
}
function ensureQualifyingEntries(t){
  if(!t.qualifying) t.qualifying = {enabled:false, numQualifiers:8, numRounds:2, entrants:[], bracketEntries:[]};
  const q = t.qualifying;
  if(!QUALIFIER_OPTIONS.includes(q.numQualifiers)) q.numQualifiers = 8;
  if(!QUAL_ROUND_OPTIONS.includes(q.numRounds)) q.numRounds = 2;
  if(!Array.isArray(q.entrants)) q.entrants = [];
  const cap = q.numQualifiers * Math.pow(2, q.numRounds);
  if(!Array.isArray(q.bracketEntries) || q.bracketEntries.length !== cap){
    q.bracketEntries = new Array(cap).fill(0).map(() => ({type:"empty"}));
  }
}

function computeQualifyingBracket(t){
  ensureQualifyingEntries(t);
  const q = t.qualifying;
  const roundNames = qualRoundNames(q.numRounds);
  let currentSlots = q.bracketEntries.map(s => ({...s}));
  const rounds = [];
  for(let r = 0; r < roundNames.length; r++){
    const roundName = roundNames[r];
    const numMatches = currentSlots.length / 2;
    const matches = [];
    const nextSlots = [];
    for(let i = 0; i < numMatches; i++){
      const slotA = currentSlots[i*2], slotB = currentSlots[i*2+1];
      const existingMatch = state.matches.find(m => m.tournamentId === t.id && m.bracket === "qual" && m.round === roundName && m.slot === i);
      let status, winnerSlot = null;
      if(slotA.type === "empty" || slotB.type === "empty"){
        status = "incomplete";
      } else if(existingMatch){
        status = "played";
        winnerSlot = existingMatch.winnerId === slotA.playerId ? slotA : slotB;
      } else {
        status = "ready";
      }
      matches.push({round: roundName, slotIndex: i, slotA, slotB, existingMatch, status, winnerSlot});
      nextSlots.push(winnerSlot ? {type:"player", playerId: winnerSlot.playerId} : {type:"empty"});
    }
    rounds.push({round: roundName, matches});
    currentSlots = nextSlots;
  }
  return rounds;
}

function deleteQualCascade(t, roundIdx, matchIndex){
  const roundNames = qualRoundNames(t.qualifying.numRounds);
  if(roundIdx < 0 || roundIdx >= roundNames.length) return;
  const roundName = roundNames[roundIdx];
  const idx = state.matches.findIndex(m => m.tournamentId === t.id && m.bracket === "qual" && m.round === roundName && m.slot === matchIndex);
  if(idx !== -1){
    state.matches.splice(idx, 1);
    deleteQualCascade(t, roundIdx + 1, Math.floor(matchIndex / 2));
  }
}

function generateQualifyingDraw(t){
  ensureQualifyingEntries(t);
  const q = t.qualifying;
  const cap = q.numQualifiers * Math.pow(2, q.numRounds);
  const shuffled = shuffleArray(q.entrants || []);
  q.bracketEntries = new Array(cap).fill(0).map((_, i) =>
    i < shuffled.length ? {type:"player", playerId: shuffled[i]} : {type:"empty"}
  );
  state.matches = state.matches.filter(m => !(m.tournamentId === t.id && m.bracket === "qual"));
}

// Returns Map<playerId, {code, label}> — code is "Q1".."Qn" (eliminated in that
// round) or "QUALIFIED" (won the last qualifying round, advances to the main draw).
function computeQualifyingResults(t){
  ensureQualifyingEntries(t);
  if(!t.qualifying.enabled) return new Map();
  const roundNames = qualRoundNames(t.qualifying.numRounds);
  const matches = matchesForQualifying(t.id);
  const furthest = new Map();
  matches.forEach(m => {
    const idx = roundNames.indexOf(m.round);
    [m.playerAId, m.playerBId].forEach(pid => {
      const cur = furthest.get(pid);
      if(!cur || idx > cur.roundIdx) furthest.set(pid, {roundIdx: idx, match: m});
    });
  });
  const results = new Map();
  furthest.forEach((info, pid) => {
    const m = info.match;
    const won = m.winnerId === pid;
    if(won && info.roundIdx === roundNames.length - 1){
      results.set(pid, {code: "QUALIFIED", label: "Qualified"});
    } else if(!won){
      results.set(pid, {code: m.round, label: "Lost " + m.round});
    }
  });
  return results;
}

function qualifyingPointsForResult(level, code, numRounds){
  const base = QUALIFYING_POINTS_BASE[level] || 5;
  if(code === "QUALIFIED") return base;
  const roundNum = Number(String(code).slice(1));
  if(roundNum === numRounds) return Math.round(base / 2);
  return 0;
}

// Rankings for a given year (or null = all-time)
function computeRankings(year){
  const totals = new Map(); // playerId -> {points, titles}
  state.players.forEach(p => totals.set(p.id, {points:0, titles:0}));
  state.tournaments.forEach(t => {
    if(year && t.year !== year) return;
    const results = computeTournamentResults(t.id);
    results.forEach((res, pid) => {
      const entry = totals.get(pid);
      if(!entry) return;
      entry.points += pointsForResult(t.level, res.code);
      if(res.code === "W") entry.titles += 1;
    });
    if(t.qualifying && t.qualifying.enabled){
      const qresults = computeQualifyingResults(t);
      qresults.forEach((res, pid) => {
        const entry = totals.get(pid);
        if(!entry) return;
        entry.points += qualifyingPointsForResult(t.level, res.code, t.qualifying.numRounds);
      });
    }
  });
  return totals;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
function tournamentDateMs(t){
  if(t.startDate){
    const d = new Date(t.startDate + "T00:00:00");
    if(!isNaN(d.getTime())) return d.getTime();
  }
  return new Date(t.year || 2000, 0, 1).getTime();
}

// Real tours only count a capped number of a player's best results toward
// their ranking, except the top-tier events, which count no matter what if
// the player entered them — this mirrors that rule.
const MAX_COUNTED_RESULTS = 18;
const MANDATORY_LEVELS = new Set(["GRAND_SLAM", "WTA1000"]);

// Real tours publish rankings weekly as a rolling 52-week points total.
// This mirrors that: sum results from tournaments whose date falls in the
// 364 days up to and including asOfMs, then apply the best-18-plus-mandatory
// counting rule per player.
function computeRankingsAsOf(asOfMs){
  const windowStart = asOfMs - 364 * MS_PER_DAY;
  const totals = new Map();
  const perPlayerResults = new Map(); // playerId -> [{points, mandatory}]
  state.players.forEach(p => {
    totals.set(p.id, {points:0, titles:0});
    perPlayerResults.set(p.id, []);
  });

  state.tournaments.forEach(t => {
    const d = tournamentDateMs(t);
    if(d > asOfMs || d < windowStart) return;
    const mandatory = MANDATORY_LEVELS.has(t.level);

    const results = computeTournamentResults(t.id);
    results.forEach((res, pid) => {
      const entry = totals.get(pid);
      if(!entry) return;
      if(res.code === "W") entry.titles += 1;
      perPlayerResults.get(pid).push({points: pointsForResult(t.level, res.code), mandatory});
    });

    if(t.qualifying && t.qualifying.enabled){
      const qresults = computeQualifyingResults(t);
      qresults.forEach((res, pid) => {
        if(!perPlayerResults.has(pid)) return;
        const pts = qualifyingPointsForResult(t.level, res.code, t.qualifying.numRounds);
        if(pts > 0) perPlayerResults.get(pid).push({points: pts, mandatory: false});
      });
    }
  });

  perPlayerResults.forEach((results, pid) => {
    const entry = totals.get(pid);
    if(!entry) return;
    entry.points = sumCountedResults(results);
  });

  return totals;
}

// A real tournament seeds off the actual published rankings, and "weeks at
// No. 1" is a record of what was truly published — not a live feed. This is
// the official one-week-behind version of computeRankingsAsOf, for anywhere
// that needs the historically-accurate published ranking rather than a
// real-time snapshot.
function officialRankingsAsOf(mondayW){
  return computeRankingsAsOf(mondayW - 7 * MS_PER_DAY);
}

// The actual counting rule: every mandatory result counts no matter how
// many there are, then the best remaining (non-mandatory) results fill out
// the rest of the cap.
function sumCountedResults(results){
  const mandatory = results.filter(r => r.mandatory);
  const optional = results.filter(r => !r.mandatory).sort((a,b) => b.points - a.points);
  const mandatorySum = mandatory.reduce((s, r) => s + r.points, 0);
  const remainingSlots = Math.max(0, MAX_COUNTED_RESULTS - mandatory.length);
  const optionalSum = optional.slice(0, remainingSlots).reduce((s, r) => s + r.points, 0);
  return mandatorySum + optionalSum;
}

// The most recent date with any recorded result — stands in for "today" on the tour calendar.
function byeWeekDateMs(bw){
  const d = new Date(bw.date + "T00:00:00");
  return isNaN(d.getTime()) ? Date.now() : d.getTime();
}
function getLatestActiveDate(){
  let max = null;
  state.tournaments.forEach(t => {
    if(matchesForTournament(t.id).length > 0){
      const d = tournamentDateMs(t);
      if(max === null || d > max) max = d;
    }
  });
  // A bye week still marks a real point on the calendar even though nothing
  // was played — it should still be able to push "current" forward.
  (state.byeWeeks || []).forEach(bw => {
    const d = byeWeekDateMs(bw);
    if(max === null || d > max) max = d;
  });
  return max !== null ? max : Date.now();
}

// Real tours publish rankings on Mondays. Snap any date to the Monday of its own week.
function mondayOf(dateMs){
  const d = new Date(dateMs);
  const day = d.getDay(); // 0 = Sun .. 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday.getTime();
}
function formatWeekDate(ms){
  return new Date(ms).toLocaleDateString(undefined, {year:"numeric", month:"short", day:"numeric"});
}

// Chronological list of distinct tournament dates with at least one result,
// used as the "weeks" for a player's ranking-history chart.
function getRankingSnapshotDates(){
  const dates = new Set();
  state.tournaments.forEach(t => {
    if(matchesForTournament(t.id).length > 0) dates.add(tournamentDateMs(t));
  });
  return Array.from(dates).sort((a,b) => a - b);
}

// Selectable ranking weeks (Mondays) for the Rankings page and seeding/entry
// pickers — one per tournament week that has results, PLUS any week
// explicitly marked as a bye week (rankings still "come out" that week —
// nothing new counts, but the rolling window still moves forward, and it's
// still a valid date to seed a future draw against).
function getRankingWeeks(){
  const weeks = new Set();
  state.tournaments.forEach(t => {
    if(matchesForTournament(t.id).length > 0) weeks.add(mondayOf(tournamentDateMs(t)));
  });
  (state.byeWeeks || []).forEach(bw => weeks.add(mondayOf(byeWeekDateMs(bw))));
  weeks.add(mondayOf(getLatestActiveDate()));
  return Array.from(weeks).sort((a,b) => b - a);
}


function ranksFromTotals(totals){
  const rows = state.players
    .map(p => ({id: p.id, points: (totals.get(p.id) || {points:0}).points}))
    .filter(r => r.points > 0)
    .sort((a,b) => b.points - a.points);
  const map = {};
  rows.forEach((r, i) => { map[r.id] = i + 1; });
  return map;
}

function getSeasons(){
  const years = new Set(state.tournaments.map(t => t.year));
  return Array.from(years).sort((a,b) => b - a);
}

/* ---------------- DOM helpers ---------------- */
function $(sel, root){ return (root||document).querySelector(sel); }
function $all(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }
function el(tag, attrs, children){
  const node = document.createElement(tag);
  if(attrs) Object.keys(attrs).forEach(k => {
    if(k === "class") node.className = attrs[k];
    else if(k === "html") node.innerHTML = attrs[k];
    else node.setAttribute(k, attrs[k]);
  });
  (children||[]).forEach(c => { if(c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
  return node;
}
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
// Strips accents/diacritics so "Safarova" matches "Šafářová".
function normalizeSearch(str){
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
function matchesSearch(name, query){
  if(!query || !query.trim()) return true;
  return normalizeSearch(name).includes(normalizeSearch(query));
}

/* ---------------- Scoreboard rendering ---------------- */
function renderScoreboardHTML(match){
  if(match.walkover){
    return '<div class="scoreboard walkover">W/O</div>';
  }
  const winnerIsA = match.winnerId === match.playerAId;
  const sets = match.sets || [];
  if(sets.length === 0) return '<div class="scoreboard walkover">—</div>';
  const cells = sets.map(s => {
    const top = winnerIsA ? s.a : s.b;
    const bottom = winnerIsA ? s.b : s.a;
    const tb = s.tb ? '<span class="sb-tb">' + escapeHtml(s.tb) + '</span>' : '';
    return '<div class="sb-set">' +
      '<span class="sb-num won">' + escapeHtml(top) + '</span>' +
      '<span class="sb-num">' + escapeHtml(bottom) + '</span>' +
      tb +
      '</div>';
  }).join("");
  return '<div class="scoreboard">' + cells + '</div>';
}

// Per-player inline score, attached directly to that player's own row in the
// bracket (rather than a shared winner-on-top chip) so the score always sits
// next to the name it belongs to, regardless of which slot they're drawn in.
function slotScoreHTML(match, playerId){
  if(!match) return "";
  if(match.walkover){
    return playerId === match.winnerId ? "" : '<span class="score-inline wo-tag">W/O</span>';
  }
  const sets = match.sets || [];
  if(sets.length === 0) return "";
  const cells = sets.map(s => {
    const mine = match.playerAId === playerId ? s.a : s.b;
    const opp = match.playerAId === playerId ? s.b : s.a;
    const tb = s.tb && mine < opp ? '<sup class="sb-tb-inline">' + escapeHtml(s.tb) + '</sup>' : "";
    return '<span class="set-num' + (mine > opp ? ' won' : '') + '">' + escapeHtml(mine) + tb + '</span>';
  }).join("");
  return '<span class="score-inline">' + cells + '</span>';
}

/* ---------------- Rankings view ---------------- */
function populateRankingsYearSelect(){
  const sel = $("#rankings-year");
  const current = sel.value;
  const seasons = getSeasons();
  const weeks = getRankingWeeks();
  const weekOptions = weeks.map((w,i) => '<option value="week:' + w + '">Week of ' + formatWeekDate(w) + (i===0 ? " (latest)" : "") + '</option>').join("");
  sel.innerHTML =
    '<option value="current">Current (Rolling 52-Week)</option>' +
    '<option value="all">All-time</option>' +
    (weeks.length ? '<optgroup label="By Week">' + weekOptions + '</optgroup>' : "") +
    (seasons.length ? '<optgroup label="By Season">' + seasons.map(y => '<option value="year:' + y + '">' + y + ' Season</option>').join("") + '</optgroup>' : "");
  const validWeek = current && current.startsWith("week:") && weeks.includes(Number(current.slice(5)));
  const validYear = current && current.startsWith("year:") && seasons.includes(Number(current.slice(5)));
  if(current === "current" || current === "all" || validWeek || validYear){
    sel.value = current;
  } else {
    sel.value = "current";
  }
}

// Which of a player's counted-window results actually count under the
// best-18-plus-mandatory rule, kept per-tournament so we can show a real
// breakdown (not just the final total).
function computePlayerResultBreakdown(playerId, asOfMs){
  const windowStart = asOfMs - 364 * MS_PER_DAY;
  const entries = [];
  state.tournaments.forEach(t => {
    const d = tournamentDateMs(t);
    if(d > asOfMs || d < windowStart) return;
    const mandatory = MANDATORY_LEVELS.has(t.level);

    const res = computeTournamentResults(t.id).get(playerId);
    if(res){
      entries.push({
        tournamentId: t.id, tournamentName: t.name, level: t.level, date: d,
        code: res.code, label: res.label, points: pointsForResult(t.level, res.code),
        mandatory, isQualifying: false
      });
    }
    if(t.qualifying && t.qualifying.enabled){
      const qres = computeQualifyingResults(t).get(playerId);
      if(qres){
        const pts = qualifyingPointsForResult(t.level, qres.code, t.qualifying.numRounds);
        entries.push({
          tournamentId: t.id, tournamentName: t.name + " (Q)", level: t.level, date: d,
          code: qres.code, label: qres.label, points: pts,
          mandatory: false, isQualifying: true
        });
      }
    }
  });
  entries.sort((a,b) => a.date - b.date);

  const mandatoryEntries = entries.filter(e => e.mandatory);
  const optionalEntries = entries.filter(e => !e.mandatory);
  const optionalSortedDesc = optionalEntries.slice().sort((a,b) => b.points - a.points);
  const remainingSlots = Math.max(0, MAX_COUNTED_RESULTS - mandatoryEntries.length);
  const countedOptional = new Set(optionalSortedDesc.slice(0, remainingSlots));
  entries.forEach(e => { e.counted = e.mandatory || countedOptional.has(e); });

  const totalPoints = entries.filter(e => e.counted).reduce((s, e) => s + e.points, 0);
  return {entries, totalPoints, tournamentsPlayed: entries.length};
}

// "Palmwood Open" -> "PO", "Wimbledon" -> "WIM" — short column headers,
// same spirit as AO/FO/W/USO on a real ranking breakdown table.
function abbreviateTournamentName(name){
  const words = name.trim().split(/\s+/).filter(Boolean);
  if(words.length >= 2) return words.map(w => w[0]).join("").toUpperCase().slice(0, 4);
  return (words[0] || "").slice(0, 3).toUpperCase();
}

function resultColorClass(entry){
  if(entry.isQualifying) return "res-qual";
  if(entry.code === "W") return "res-win";
  if(entry.code === "F") return "res-final";
  if(entry.code === "SF") return "res-semi";
  if(entry.code === "QF") return "res-quarter";
  return "res-early";
}

function renderBreakdownTableHTML(playerId, asOfMs){
  const {entries, totalPoints} = computePlayerResultBreakdown(playerId, asOfMs);
  if(entries.length === 0){
    return '<p class="picker-empty-note">No results in this window yet.</p>';
  }
  const levels = ["GRAND_SLAM", "WTA1000", "WTA500", "WTA250"];
  const byLevel = {};
  levels.forEach(l => { byLevel[l] = entries.filter(e => e.level === l); });

  let headTop = "", headSub = "";
  levels.forEach(l => {
    const list = byLevel[l];
    if(list.length === 0) return;
    headTop += '<th colspan="' + list.length + '" class="breakdown-group-head">' + LEVEL_LABELS[l] + '</th>';
    list.forEach(e => {
      headSub += '<th title="' + escapeHtml(e.tournamentName) + '">' + escapeHtml(abbreviateTournamentName(e.tournamentName)) + '</th>';
    });
  });

  let bodyCells = "";
  levels.forEach(l => {
    byLevel[l].forEach(e => {
      const roundLabel = e.code === "W" ? "W" : (e.isQualifying ? e.code : e.code);
      const cls = "breakdown-cell " + resultColorClass(e) + (e.counted ? "" : " not-counted");
      const titleAttr = e.counted ? "Counts toward ranking" : "Didn't count — outside the best " + MAX_COUNTED_RESULTS;
      bodyCells += '<td class="' + cls + '" title="' + titleAttr + '">' + escapeHtml(roundLabel) + '<span class="breakdown-pts">' + e.points + '</span></td>';
    });
  });

  return '<div class="breakdown-scroll"><table class="breakdown-table"><thead>' +
    '<tr>' + headTop + '<th rowspan="2">Total</th><th rowspan="2">Tours</th></tr>' +
    '<tr>' + headSub + '</tr>' +
    '</thead><tbody><tr>' + bodyCells +
    '<td class="breakdown-total">' + totalPoints.toLocaleString() + '</td>' +
    '<td class="breakdown-total">' + entries.length + '</td>' +
    '</tr></tbody></table></div>';
}

let expandedRankingRow = null;
let rankingsMode = "live"; // "live" | "official"

function renderRankings(){
  populateRankingsYearSelect();
  const val = $("#rankings-year").value || "current";

  let totals, movement = null;
  const isRolling = val === "current" || val.startsWith("week:");
  let effectiveAsOf = null;
  if(isRolling){
    const nominalAsOf = val === "current" ? mondayOf(getLatestActiveDate()) : Number(val.slice(5));
    // Official rankings publish a week behind: a tournament played the week
    // of the 4th doesn't count until the 11th's rankings, so official mode
    // just evaluates everything one week earlier than the selected week.
    effectiveAsOf = rankingsMode === "official" ? nominalAsOf - 7 * MS_PER_DAY : nominalAsOf;
    totals = computeRankingsAsOf(effectiveAsOf);
    const prevTotals = computeRankingsAsOf(effectiveAsOf - 7 * MS_PER_DAY);
    movement = {cur: ranksFromTotals(totals), prev: ranksFromTotals(prevTotals)};
  } else if(val === "all"){
    totals = computeRankings(null);
  } else if(val.startsWith("year:")){
    totals = computeRankings(Number(val.slice(5)));
  } else {
    totals = computeRankings(null);
  }

  $all("[data-rankings-mode]").forEach(btn => btn.classList.toggle("active", btn.dataset.rankingsMode === rankingsMode));
  $("#rankings-mode-toggle").classList.toggle("hidden", !isRolling);

  $("#rankings-rule-note").textContent = isRolling
    ? (rankingsMode === "official"
        ? "Official rankings run a week behind — a tournament only counts once next Monday's rankings publish. Only a player's best " + MAX_COUNTED_RESULTS + " results count, except Grand Slam and WATP 1000 results, which always count if played."
        : "Live — reflects results as soon as they're entered, including tournaments still in progress this week. Only a player's best " + MAX_COUNTED_RESULTS + " results count, except Grand Slam and WATP 1000 results, which always count if played.")
    : "";

  const rows = state.players
    .map(p => ({p, stats: totals.get(p.id) || {points:0, titles:0}}))
    .filter(r => r.stats.points > 0)
    .sort((a,b) => b.stats.points - a.stats.points || a.p.name.localeCompare(b.p.name))
    .map((r, i) => ({...r, rank: i + 1}));

  const body = $("#rankings-body");
  const table = $("#rankings-table");
  const empty = $("#rankings-empty");
  const searchEmpty = $("#rankings-search-empty");

  if(rows.length === 0){
    table.classList.add("hidden");
    searchEmpty.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const query = $("#rankings-search").value;
  const displayRows = query.trim() ? rows.filter(r => matchesSearch(r.p.name, query)) : rows;

  if(displayRows.length === 0){
    table.classList.add("hidden");
    searchEmpty.classList.remove("hidden");
    return;
  }
  table.classList.remove("hidden");
  searchEmpty.classList.add("hidden");

  body.innerHTML = displayRows.map((r) => {
    const rank = r.rank;
    const rankClass = rank <= 3 ? "rank-num top3" : "rank-num";
    let moveCell = "<td></td>";
    if(movement){
      const prevRank = movement.prev[r.p.id];
      let moveHTML;
      if(prevRank === undefined){
        moveHTML = '<span class="rank-move new">NEW</span>';
      } else if(prevRank === rank){
        moveHTML = '<span class="rank-move flat">–</span>';
      } else if(prevRank > rank){
        moveHTML = '<span class="rank-move up">&#9650;' + (prevRank - rank) + '</span>';
      } else {
        moveHTML = '<span class="rank-move down">&#9660;' + (rank - prevRank) + '</span>';
      }
      moveCell = '<td>' + moveHTML + '</td>';
    }
    const isExpanded = isRolling && expandedRankingRow === r.p.id;
    const toggleBtn = isRolling
      ? '<button class="rank-toggle' + (isExpanded ? ' open' : '') + '" data-toggle-breakdown="' + r.p.id + '" title="Show results breakdown">&#9656;</button>'
      : "";
    let breakdownRow = "";
    if(isExpanded){
      breakdownRow = '<tr class="breakdown-row"><td colspan="6">' + renderBreakdownTableHTML(r.p.id, effectiveAsOf) + '</td></tr>';
    }
    return '<tr>' +
      '<td class="rank-col">' + toggleBtn + '<span class="' + rankClass + '">' + rank + '</span></td>' +
      moveCell +
      '<td><button class="player-link" data-open-player="' + r.p.id + '">' + flagImgHTML(r.p.country) + escapeHtml(r.p.name) + '</button></td>' +
      '<td class="country-chip">' + (r.p.country ? escapeHtml(r.p.country.toUpperCase()) : "—") + '</td>' +
      '<td>' + r.stats.titles + '</td>' +
      '<td class="points-cell">' + r.stats.points.toLocaleString() + '</td>' +
      '</tr>' + breakdownRow;
  }).join("");
}

/* ---------------- Players view ---------------- */
function renderPlayers(){
  const grid = $("#players-grid");
  const empty = $("#players-empty");
  if(state.players.length === 0){
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  const totals = computeRankingsAsOf(getLatestActiveDate());
  const sorted = [...state.players].sort((a,b) => a.name.localeCompare(b.name));
  grid.innerHTML = "";
  sorted.forEach(p => {
    const stats = totals.get(p.id) || {points:0, titles:0};
    const card = el("div", {class:"player-card", "data-open-player": p.id}, [
      el("div", {class:"pc-name", html: playerNameHTML(p)}),
      el("div", {class:"pc-meta"}, [
        el("span", {}, [(p.country ? p.country.toUpperCase() : "—")]),
        el("span", {}, [stats.points.toLocaleString() + " pts"])
      ]),
      el("button", {class:"btn btn-small btn-ghost pc-edit-btn", "data-edit-player": p.id}, ["Edit"])
    ]);
    grid.appendChild(card);
  });
}

function renderPlayerProfile(playerId){
  const p = playerById(playerId);
  if(!p) return;
  const matches = matchesForPlayer(playerId).sort((a,b) => {
    const ta = tournamentById(a.tournamentId), tb = tournamentById(b.tournamentId);
    return (tb ? tournamentDateMs(tb) : 0) - (ta ? tournamentDateMs(ta) : 0) || ROUND_ORDER.indexOf(b.round) - ROUND_ORDER.indexOf(a.round);
  });
  const wins = matches.filter(m => m.winnerId === playerId).length;
  const losses = matches.length - wins;
  const latest = getLatestActiveDate();
  const totals = computeRankingsAsOf(latest);
  const stats = totals.get(playerId) || {points:0, titles:0};
  const careerStats = computeRankings(null).get(playerId) || {points:0, titles:0};
  const currentRank = ranksFromTotals(totals)[playerId] || null;

  // surface breakdown
  const surfaceStats = {hard:{w:0,l:0}, clay:{w:0,l:0}, grass:{w:0,l:0}};
  matches.forEach(m => {
    const t = tournamentById(m.tournamentId);
    if(!t || !surfaceStats[t.surface]) return;
    if(m.winnerId === playerId) surfaceStats[t.surface].w++; else surfaceStats[t.surface].l++;
  });

  // rank history across every recorded tour "week"
  const snapshotDates = getRankingSnapshotDates();
  const history = [];
  snapshotDates.forEach(d => {
    const rankMap = ranksFromTotals(officialRankingsAsOf(d));
    if(rankMap[playerId]) history.push({date: d, rank: rankMap[playerId]});
  });
  const peakRank = history.length ? Math.min(...history.map(h => h.rank)) : null;

  // tournament results (bracket history)
  const tResults = state.tournaments
    .filter(t => matchesForTournament(t.id).some(m => m.playerAId === playerId || m.playerBId === playerId))
    .sort((a,b) => tournamentDateMs(b) - tournamentDateMs(a))
    .map(t => {
      const res = computeTournamentResults(t.id).get(playerId);
      return {t, res};
    });

  const modal = $("#player-modal");
  modal.innerHTML = "";
  modal.appendChild(el("div", {class:"profile-head"}, [
    el("div", {}, [
      el("div", {class:"profile-name", html: playerNameHTML(p)}),
      el("div", {class:"profile-meta"}, [
        (p.country ? p.country.toUpperCase() : "—") + " · " + (p.hand === "L" ? "Left-handed" : "Right-handed")
      ])
    ]),
    el("button", {class:"btn btn-small btn-ghost", "data-edit-player": p.id}, ["Edit"])
  ]));

  const bioItems = [];
  if(currentRank) bioItems.push(["Current Rank", "No. " + currentRank]);
  if(peakRank) bioItems.push(["Peak Rank", "No. " + peakRank]);
  if(p.turnedPro) bioItems.push(["Turned Pro", String(p.turnedPro)]);
  if(p.height) bioItems.push(["Height", p.height + " cm"]);
  if(bioItems.length){
    modal.appendChild(el("div", {class:"bio-grid"}, bioItems.map(([label, value]) =>
      el("div", {class:"bio-item"}, [
        el("div", {class:"bio-label"}, [label]),
        el("div", {class:"bio-value"}, [value])
      ])
    )));
  }

  const statsBox = el("div", {class:"profile-stats"}, [
    el("div", {class:"stat-box"}, [el("div", {class:"stat-num"}, [String(stats.points.toLocaleString())]), el("div", {class:"stat-label"}, ["Points"])]),
    el("div", {class:"stat-box"}, [el("div", {class:"stat-num"}, [String(careerStats.titles)]), el("div", {class:"stat-label"}, ["Career Titles"])]),
    el("div", {class:"stat-box"}, [el("div", {class:"stat-num"}, [wins + "-" + losses]), el("div", {class:"stat-label"}, ["Win-Loss"])])
  ]);
  modal.appendChild(statsBox);

  const surfaceRow = el("div", {class:"profile-stats"}, ["hard","clay","grass"].map(s =>
    el("div", {class:"stat-box"}, [
      el("div", {class:"stat-num"}, [surfaceStats[s].w + "-" + surfaceStats[s].l]),
      el("div", {class:"stat-label"}, [s])
    ])
  ));
  modal.appendChild(surfaceRow);

  modal.appendChild(el("div", {class:"profile-section-title"}, ["Ranking History"]));
  if(history.length < 2){
    modal.appendChild(el("p", {}, ["Not enough tournaments played yet to chart a trend."]));
  } else {
    modal.appendChild(el("div", {class:"rank-chart", html: renderRankHistorySVG(history)}));
  }

  modal.appendChild(el("div", {class:"profile-section-title"}, ["Tournament Results"]));
  if(tResults.length === 0){
    modal.appendChild(el("p", {}, ["No tournaments played yet."]));
  } else {
    tResults.forEach(({t, res}) => {
      const bracketBtn = el("button", {class:"btn btn-small btn-ghost", "data-open-bracket": t.id}, ["Bracket"]);
      const row = el("div", {class:"tourney-row"}, [
        el("span", {class:"level-tag"}, [LEVEL_LABELS[t.level] || t.level]),
        el("span", {class:"surface-tag surface-" + t.surface}, [t.surface]),
        el("span", {class:"tourney-name"}, [t.name + " '" + String(t.year).slice(-2)]),
        el("span", {class:"tourney-champ"}, [res ? res.label : "In progress"]),
        bracketBtn
      ]);
      modal.appendChild(row);
    });
  }

  modal.appendChild(el("div", {class:"profile-section-title"}, ["Recent Matches"]));
  if(matches.length === 0){
    modal.appendChild(el("p", {}, ["No matches recorded yet."]));
  } else {
    matches.slice(0, 15).forEach(m => {
      const t = tournamentById(m.tournamentId);
      const a = playerById(m.playerAId), b = playerById(m.playerBId);
      const row = el("div", {class:"match-row"}, [
        el("span", {class:"match-round"}, [ROUND_LABELS[m.round]]),
        el("span", {class:"match-players", html:
          (m.winnerId === a.id ? '<span class="winner">' + playerLinkHTML(a) + '</span>' : playerLinkHTML(a)) +
          ' def. ' +
          (m.winnerId === b.id ? '<span class="winner">' + playerLinkHTML(b) + '</span>' : playerLinkHTML(b))
        }),
        el("span", {html: renderScoreboardHTML(m)}),
        el("span", {class:"match-tourney"}, [t ? (t.name + " '" + String(t.year).slice(-2)) : ""])
      ]);
      modal.appendChild(row);
    });
  }

  modal.appendChild(el("div", {class:"modal-close-row"}, [
    el("button", {class:"btn btn-ghost", id:"profile-close"}, ["Close"])
  ]));

  $("#player-modal-backdrop").classList.remove("hidden");
  $("#profile-close").addEventListener("click", closePlayerModal);
}

// Small inline SVG line chart: rank on the y-axis (inverted — No.1 at top), chronological on x.
function renderRankHistorySVG(history){
  const w = 560, h = 150, padL = 34, padR = 12, padT = 12, padB = 20;
  const maxRank = Math.max(...history.map(h => h.rank), 5);
  const minRank = 1;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const xFor = (i) => padL + (history.length === 1 ? innerW / 2 : (i / (history.length - 1)) * innerW);
  const yFor = (rank) => padT + ((rank - minRank) / Math.max(1, (maxRank - minRank))) * innerH;

  const points = history.map((pt, i) => xFor(i) + "," + yFor(pt.rank)).join(" ");
  const dots = history.map((pt, i) =>
    '<circle cx="' + xFor(i) + '" cy="' + yFor(pt.rank) + '" r="3" fill="var(--ink)"></circle>'
  ).join("");

  const gridLines = [minRank, Math.round((minRank+maxRank)/2), maxRank].map(r =>
    '<line x1="' + padL + '" y1="' + yFor(r) + '" x2="' + (w-padR) + '" y2="' + yFor(r) + '" stroke="var(--line)" stroke-width="1"></line>' +
    '<text x="2" y="' + (yFor(r)+4) + '" font-family="JetBrains Mono, monospace" font-size="10" fill="var(--ink-soft)">' + r + '</text>'
  ).join("");

  return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
    gridLines +
    '<polyline points="' + points + '" fill="none" stroke="var(--ink)" stroke-width="2"></polyline>' +
    dots +
    '</svg>';
}

function closePlayerModal(){
  $("#player-modal-backdrop").classList.add("hidden");
}

/* ---------------- Tournaments view ---------------- */
// Groups a tournament's results into who reached each stage — used by the
// season calendar view (champion / runner-up / semifinalists / quarterfinalists).
function getTournamentResultsByRound(t){
  const results = computeTournamentResults(t.id);
  const champion = [], runnerUp = [], semifinalists = [], quarterfinalists = [];
  results.forEach((res, pid) => {
    const p = playerById(pid);
    if(!p) return;
    if(res.code === "W") champion.push(p);
    else if(res.code === "F") runnerUp.push(p);
    else if(res.code === "SF") semifinalists.push(p);
    else if(res.code === "QF") quarterfinalists.push(p);
  });
  return {champion, runnerUp, semifinalists, quarterfinalists};
}

function playersListHTML(players){
  if(!players || players.length === 0) return "—";
  return players.map(p => '<div class="cal-player">' + playerLinkHTML(p) + '</div>').join("");
}

function tournamentCellHTML(t){
  return '<div class="cal-tourney-name">' + escapeHtml(t.name) + '</div>' +
    (t.location ? '<div class="cal-tourney-location">' + escapeHtml(t.location) + '</div>' : "") +
    '<div class="cal-tourney-tags">' +
      '<span class="level-tag">' + escapeHtml(LEVEL_LABELS[t.level] || t.level) + '</span>' +
      '<span class="surface-tag surface-' + t.surface + '">' + t.surface + '</span>' +
    '</div>' +
    '<div class="cal-tourney-meta">Draw of ' + t.drawSize + '</div>' +
    '<div class="cal-tourney-actions">' +
      '<button class="btn btn-small btn-primary" data-open-bracket="' + t.id + '">Bracket</button>' +
      '<button class="btn btn-small btn-ghost" data-edit-tournament="' + t.id + '">Edit</button>' +
      '<button class="btn btn-small btn-danger" data-delete-tournament="' + t.id + '">Delete</button>' +
    '</div>';
}

function renderTournaments(){
  const list = $("#tournaments-list");
  const empty = $("#tournaments-empty");
  const byeWeeks = state.byeWeeks || [];
  if(state.tournaments.length === 0 && byeWeeks.length === 0){
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const byWeek = new Map();
  state.tournaments.forEach(t => {
    const wk = mondayOf(tournamentDateMs(t));
    if(!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk).push({kind:"tournament", data:t});
  });
  byeWeeks.forEach(bw => {
    const wk = mondayOf(byeWeekDateMs(bw));
    if(!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk).push({kind:"bye", data:bw});
  });
  const weeks = Array.from(byWeek.keys()).sort((a,b) => b - a);

  let html = '<div class="calendar-scroll"><table class="calendar-table"><thead><tr>' +
    '<th>Week</th><th>Tournament</th><th>Champion</th><th>Runner-up</th><th>Semifinalists</th><th>Quarterfinalists</th>' +
    '</tr></thead><tbody>';

  weeks.forEach(wk => {
    const items = byWeek.get(wk).sort((a,b) => {
      if(a.kind !== b.kind) return a.kind === "bye" ? 1 : -1;
      const nameA = a.kind === "tournament" ? a.data.name : "";
      const nameB = b.kind === "tournament" ? b.data.name : "";
      return nameA.localeCompare(nameB);
    });
    items.forEach((item, idx) => {
      html += '<tr class="' + (idx === 0 ? "cal-week-start" : "") + '">';
      if(idx === 0){
        html += '<td class="cal-week" rowspan="' + items.length + '">' + formatWeekDate(wk) + '</td>';
      }
      if(item.kind === "bye"){
        const bw = item.data;
        html += '<td class="cal-tourney-cell">' +
          '<div class="cal-tourney-name cal-bye-name">Bye Week</div>' +
          (bw.note ? '<div class="cal-tourney-location">' + escapeHtml(bw.note) + '</div>' : "") +
          '<div class="cal-tourney-actions">' +
            '<button class="btn btn-small btn-danger" data-delete-byeweek="' + bw.id + '">Delete</button>' +
          '</div>' +
        '</td>';
        html += '<td colspan="4"><span class="cal-inprogress">No tournament this week</span></td>';
      } else {
        const t = item.data;
        const {champion, runnerUp, semifinalists, quarterfinalists} = getTournamentResultsByRound(t);
        const played = matchesForTournament(t.id).length > 0;
        html += '<td class="cal-tourney-cell">' + tournamentCellHTML(t) + '</td>';
        html += '<td>' + (champion.length ? playersListHTML(champion) : (played ? '<span class="cal-inprogress">In progress</span>' : "—")) + '</td>';
        html += '<td>' + playersListHTML(runnerUp) + '</td>';
        html += '<td>' + playersListHTML(semifinalists) + '</td>';
        html += '<td>' + playersListHTML(quarterfinalists) + '</td>';
      }
      html += '</tr>';
    });
  });

  html += '</tbody></table></div>';
  list.innerHTML = html;
}

/* ---------------- Bracket engine ---------------- */
const ROUND_NAME_BY_SIZE = {128:"R128", 64:"R64", 32:"R32", 16:"R16", 8:"QF", 4:"SF"};
const DRAW_SIZE_OPTIONS = [28, 30, 32, 48, 56, 64, 96, 128];
let currentBracketTournamentId = null;

function nextPowerOf2(n){
  let p = 1;
  while(p < n) p *= 2;
  return p;
}
// The actual number of physical bracket slots — always a power of 2.
// A 28-player draw plays inside a 32-slot bracket with 4 byes, etc.
function capacityOf(drawSize){ return nextPowerOf2(drawSize); }
function numByesFor(drawSize){ return capacityOf(drawSize) - drawSize; }
// Standard tour convention: seeds = capacity / 4 (8 seeds in a 32 draw, 16 in a 64, 32 in a 128).
function numSeedsFor(drawSize){ return Math.max(2, capacityOf(drawSize) / 4); }

function bracketRoundNames(capacity){
  const names = [];
  let s = capacity;
  while(s >= 2){
    names.push(s === 2 ? "F" : ROUND_NAME_BY_SIZE[s]);
    s = s / 2;
  }
  return names;
}

function ensureBracketEntries(t){
  if(!t.drawSize || !DRAW_SIZE_OPTIONS.includes(t.drawSize)) t.drawSize = 32;
  const cap = capacityOf(t.drawSize);
  if(!Array.isArray(t.bracketEntries) || t.bracketEntries.length !== cap){
    t.bracketEntries = new Array(cap).fill(0).map(() => ({type:"empty"}));
  }
  const nSeeds = numSeedsFor(t.drawSize);
  if(!Array.isArray(t.seeds) || t.seeds.length !== nSeeds){
    const old = Array.isArray(t.seeds) ? t.seeds : [];
    t.seeds = new Array(nSeeds).fill(null).map((_, i) => old[i] || null);
  }
  if(!Array.isArray(t.unseededEntrants)) t.unseededEntrants = [];
  if(!Array.isArray(t.qualifierIds)) t.qualifierIds = [];
  if(!Array.isArray(t.entryList)) t.entryList = [];
}

// Seed number (1-indexed) for a player in this tournament's main draw, or null.
function seedNumberForPlayer(t, playerId){
  const idx = (t.seeds || []).indexOf(playerId);
  return idx >= 0 ? idx + 1 : null;
}
function isMainDrawQualifier(t, playerId){
  return (t.qualifierIds || []).includes(playerId);
}
// Wild-card status comes from the entry list, independent of where the
// player actually ended up (seeded or not) — real draws can and do have a
// seeded wild card, so this always stacks alongside a seed badge rather than
// replacing it.
function isMainDrawWildCard(t, playerId){
  return (t.entryList || []).some(e => e.playerId === playerId && e.wildcard === "main");
}
function isQualifyingWildCard(t, playerId){
  return (t.entryList || []).some(e => e.playerId === playerId && e.wildcard === "qual");
}

function shuffleArray(arr){
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Rebuilding a bracket round can shrink or grow the page a lot (a tall
// score-entry card collapses to a compact result once saved). Without this,
// the browser clamps scroll position when the document shrinks, which reads
// as the page "jumping to the top" even though nothing actually navigated.
function withScrollPreserved(fn){
  const y = window.scrollY;
  fn();
  window.scrollTo(0, y);
}

// Single save path for both the main draw and qualifying, used by both the
// auto-detected-from-score flow and the click-to-award-walkover flow.
function persistMatchResult(t, m, winnerPlayerId, sets, walkover, bracketType){
  state.matches.push({
    id: uid("m"),
    tournamentId: t.id,
    bracket: bracketType,
    round: m.round,
    slot: m.slotIndex,
    playerAId: m.slotA.playerId,
    playerBId: m.slotB.playerId,
    winnerId: winnerPlayerId,
    walkover,
    sets,
    createdAt: Date.now()
  });
  saveState();
  withScrollPreserved(() => {
    if(bracketType === "qual") renderQualBracketRounds(t);
    else renderBracketRounds(t);
  });
  renderRankings();
}

// Classic single-elimination seeding order: result[i] is the seed rank that
// structurally belongs in slot i, guaranteeing seed 1 and 2 can only meet in
// the final, seeds 1-4 can't meet before the semis, and so on.
// Real draw sheets anchor seeds at recursive boundary points: seed 1 at the
// very top, seed 2 at the very bottom, seeds 3-4 straddling the halfway
// line, seeds 5-8 straddling the quarter lines, seeds 9-16 the eighth
// lines, and so on — verified against a real published draw sheet.
// Returns {potIndex: [1-indexed positions in that pot]}.
function seedBoundaryPots(cap, nSeeds){
  const pots = {0:[1], 1:[cap]};
  let assigned = 2, level = 1;
  while(assigned < nSeeds){
    const denom = Math.pow(2, level);
    const positions = [];
    for(let k = 1; k < denom; k += 2){
      const b = cap * k / denom;
      positions.push(b, b + 1);
    }
    pots[level + 1] = positions;
    assigned += positions.length;
    level++;
  }
  return pots;
}

// Pot groupings: seed 1 alone, seed 2 alone, seeds 3-4, seeds 5-8, seeds 9-16, seeds 17-32...
function potIndexForRank(rank){
  return rank === 1 ? 0 : Math.ceil(Math.log2(rank));
}

// Runs an actual seeded draw: places seed 1 and 2 at opposite ends, randomly
// distributes the rest of each pot among its structural slots, hands byes to
// the top seeds, and randomly scatters unseeded entrants into what's left.
function generateDraw(t){
  ensureBracketEntries(t);
  const cap = capacityOf(t.drawSize);
  const nSeeds = numSeedsFor(t.drawSize);
  const nByes = numByesFor(t.drawSize);
  const slots = new Array(cap).fill(null);
  const rankToSlot = {};

  const potGroups = seedBoundaryPots(cap, nSeeds);
  Object.keys(potGroups).forEach(pot => {
    const slotIdxs = shuffleArray(potGroups[pot].map(p => p - 1)); // 1-indexed -> 0-indexed
    const ranksInPot = [];
    for(let r = 1; r <= nSeeds; r++){ if(potIndexForRank(r) === Number(pot)) ranksInPot.push(r); }
    ranksInPot.forEach((r, i) => {
      const slotIdx = slotIdxs[i];
      rankToSlot[r] = slotIdx;
      const playerId = t.seeds[r-1];
      slots[slotIdx] = playerId ? {type:"player", playerId} : {type:"empty"};
    });
  });

  // Byes go to the sibling slot of the top-ranked seeds first.
  const byeSlots = new Set();
  for(let r = 1; r <= nSeeds && byeSlots.size < nByes; r++){
    const slotIdx = rankToSlot[r];
    if(slotIdx === undefined) continue;
    const sibling = slotIdx % 2 === 0 ? slotIdx + 1 : slotIdx - 1;
    if(slots[sibling] === null){
      slots[sibling] = {type:"bye"};
      byeSlots.add(sibling);
    }
  }
  let remainingByes = nByes - byeSlots.size;
  if(remainingByes > 0){
    for(let i = 0; i < cap && remainingByes > 0; i++){
      if(slots[i] === null){ slots[i] = {type:"bye"}; remainingByes--; }
    }
  }

  // Everything left over is filled by a blind draw of the unseeded entrants.
  const unseeded = shuffleArray(t.unseededEntrants || []);
  let ui = 0;
  for(let i = 0; i < cap; i++){
    if(slots[i] === null){
      slots[i] = ui < unseeded.length ? {type:"player", playerId: unseeded[ui++]} : {type:"empty"};
    }
  }

  t.bracketEntries = slots;
  // Clear old MAIN DRAW results only — they referred to the previous draw's
  // slots. Qualifying results are a separate bracket and must not be touched
  // by regenerating the main draw.
  state.matches = state.matches.filter(m => !(m.tournamentId === t.id && (m.bracket || "main") === "main"));
}

// Resolves the full bracket: which player occupies every slot in every round,
// whether that slot's match has been played, and who advances.
function computeBracket(t){
  ensureBracketEntries(t);
  const roundNames = bracketRoundNames(capacityOf(t.drawSize));
  let currentSlots = t.bracketEntries.map(s => ({...s}));
  const rounds = [];
  for(let r = 0; r < roundNames.length; r++){
    const roundName = roundNames[r];
    const numMatches = currentSlots.length / 2;
    const matches = [];
    const nextSlots = [];
    for(let i = 0; i < numMatches; i++){
      const slotA = currentSlots[i*2];
      const slotB = currentSlots[i*2+1];
      const existingMatch = state.matches.find(m => m.tournamentId === t.id && (m.bracket||"main") === "main" && m.round === roundName && m.slot === i);
      let status, winnerSlot = null;
      if(slotA.type === "empty" || slotB.type === "empty"){
        status = "incomplete";
      } else if(slotA.type === "bye" && slotB.type === "bye"){
        status = "double-bye";
      } else if(slotA.type === "bye"){
        status = "bye"; winnerSlot = slotB;
      } else if(slotB.type === "bye"){
        status = "bye"; winnerSlot = slotA;
      } else if(existingMatch){
        status = "played";
        winnerSlot = existingMatch.winnerId === slotA.playerId ? slotA : slotB;
      } else {
        status = "ready";
      }
      matches.push({round: roundName, slotIndex: i, slotA, slotB, existingMatch, status, winnerSlot});
      nextSlots.push(winnerSlot ? {type:"player", playerId: winnerSlot.playerId} : {type:"empty"});
    }
    rounds.push({round: roundName, matches});
    currentSlots = nextSlots;
  }
  return rounds;
}

// Deletes the recorded match at (roundIdx, matchIndex) and cascades forward,
// since anything downstream was built on a result that no longer holds.
function deleteCascade(t, roundIdx, matchIndex){
  const roundNames = bracketRoundNames(capacityOf(t.drawSize));
  if(roundIdx < 0 || roundIdx >= roundNames.length) return;
  const roundName = roundNames[roundIdx];
  const idx = state.matches.findIndex(m => m.tournamentId === t.id && (m.bracket||"main") === "main" && m.round === roundName && m.slot === matchIndex);
  if(idx !== -1){
    state.matches.splice(idx, 1);
    deleteCascade(t, roundIdx + 1, Math.floor(matchIndex / 2));
  }
}

function openBracket(tournamentId){
  currentBracketTournamentId = tournamentId;
  closePlayerModal();
  $all(".tab").forEach(tab => tab.classList.remove("active"));
  $all(".view").forEach(v => v.classList.add("hidden"));
  $("#view-bracket").classList.remove("hidden");
  switchBracketSubTab("draw");
  renderBracketPage();
}
function closeBracket(){
  currentBracketTournamentId = null;
  switchView("tournaments");
}

let bracketSubTab = "draw";
function switchBracketSubTab(tab){
  bracketSubTab = tab;
  $all(".subtab").forEach(btn => btn.classList.toggle("active", btn.dataset.bracketTab === tab));
  $all(".bracket-subpage").forEach(page => page.classList.toggle("hidden", page.id !== "bracket-subpage-" + tab));

  // Bracket layout measures each card's real rendered height to position
  // everything — that only works while its page is actually visible (a
  // hidden/display:none subtree always measures 0px). Any render that
  // happened while this page was hidden (e.g. generating the draw from the
  // Entry List tab) needs a fresh pass now that it's on-screen.
  const t = tournamentById(currentBracketTournamentId);
  if(!t) return;
  if(tab === "draw"){
    renderBracketRounds(t);
  } else if(tab === "qual" && t.qualifying && t.qualifying.enabled){
    renderQualBracketRounds(t);
  }
}

function renderBracketPage(){
  const t = tournamentById(currentBracketTournamentId);
  if(!t){ closeBracket(); return; }
  ensureBracketEntries(t);
  ensureQualifyingEntries(t);
  const cap = capacityOf(t.drawSize);
  const nByes = numByesFor(t.drawSize);

  const head = $("#bracket-head");
  head.innerHTML = "";
  head.appendChild(el("div", {}, [
    el("h2", {}, [t.name]),
    el("div", {class:"profile-meta"}, [
      (t.location ? t.location + " · " : "") +
      (LEVEL_LABELS[t.level] || t.level) + " · " + t.surface + " · " + (t.startDate || t.year) +
      " · Draw of " + t.drawSize + (nByes ? " (" + cap + "-slot bracket, " + nByes + " bye" + (nByes===1?"":"s") + ")" : "")
    ])
  ]));
  const controls = el("div", {class:"controls"});
  const sizeLabel = el("label", {}, ["Draw size"]);
  const sizeSelect = el("select");
  DRAW_SIZE_OPTIONS.forEach(n => {
    const opt = el("option", {value:n}, [String(n)]);
    if(n === t.drawSize) opt.setAttribute("selected", "selected");
    sizeSelect.appendChild(opt);
  });
  sizeSelect.addEventListener("change", () => {
    const newSize = Number(sizeSelect.value);
    if(newSize === t.drawSize) return;
    if(!confirm("Changing draw size clears this tournament's main-draw seeds, entrants, and results. Qualifying is untouched. Continue?")){
      sizeSelect.value = String(t.drawSize);
      return;
    }
    t.drawSize = newSize;
    t.bracketEntries = new Array(capacityOf(newSize)).fill(0).map(() => ({type:"empty"}));
    t.seeds = new Array(numSeedsFor(newSize)).fill(null);
    t.unseededEntrants = [];
    state.matches = state.matches.filter(m => !(m.tournamentId === t.id && (m.bracket || "main") === "main"));
    saveState();
    renderBracketPage();
    renderRankings();
  });
  sizeLabel.appendChild(sizeSelect);
  controls.appendChild(sizeLabel);

  const clearBtn = el("button", {class:"btn btn-small btn-danger"}, ["Clear All Results"]);
  clearBtn.addEventListener("click", () => {
    const count = matchesForTournament(t.id).length;
    if(count === 0) return;
    if(confirm("Clear all " + count + " recorded result" + (count===1?"":"s") + " for " + t.name + " (main draw and qualifying)? The seeded draws stay intact. This can't be undone.")){
      state.matches = state.matches.filter(m => m.tournamentId !== t.id);
      saveState();
      withScrollPreserved(() => {
        renderBracketRounds(t);
        renderQualBracketRounds(t);
      });
      renderRankings();
    }
  });
  controls.appendChild(clearBtn);
  head.appendChild(controls);

  populateBracketDateSelects(t);
  renderQualifyingConfig(t);
  renderEntryListBody(t);

  $("#bracket-numseeds-label").textContent = numSeedsFor(t.drawSize);
  renderBracketSeedsList(t);
  renderBracketUnseededList(t);
  renderBracketSeedGrid(t);
  renderBracketRounds(t);
}

function populateBracketDateSelects(t){
  const weeks = getRankingWeeks();
  const optionsHTML = '<option value="current">Current (Rolling 52-Week)</option>' +
    weeks.map(w => '<option value="' + w + '">Week of ' + formatWeekDate(w) + '</option>').join("");
  ["#bracket-entry-date", "#bracket-seed-date"].forEach(sel => {
    const el2 = $(sel);
    const prev = el2.value;
    el2.innerHTML = optionsHTML;
    if(prev && (prev === "current" || weeks.includes(Number(prev)))) el2.value = prev;
  });
}
function rankingDateFromSelectValue(val){
  return val === "current" ? mondayOf(getLatestActiveDate()) : Number(val);
}

function renderQualifyingConfig(t){
  const q = t.qualifying;
  $("#qual-enabled").checked = q.enabled;
  $("#qual-numqualifiers").value = String(q.numQualifiers);
  $("#qual-numrounds").value = String(q.numRounds);
  $("#qual-body").classList.toggle("hidden", !q.enabled);
  $("#bracket-subnav-qual").classList.toggle("hidden", !q.enabled);
  // If qualifying just got disabled while its sub-tab was open, fall back to the Draw tab.
  if(!q.enabled && bracketSubTab === "qual") switchBracketSubTab("draw");
  if(q.enabled){
    renderQualEntrantsList(t);
    renderQualBracketRounds(t);
  }
}

function renderBracketSeedsList(t){
  const list = $("#bracket-seeds-list");
  list.innerHTML = "";
  const nSeeds = numSeedsFor(t.drawSize);
  for(let i = 0; i < nSeeds; i++){
    const assignedPlayer = t.seeds[i] ? playerById(t.seeds[i]) : null;
    const wrap = el("div", {class:"bracket-seed-slot"});
    wrap.appendChild(el("span", {class:"slot-num"}, ["#" + (i+1)]));
    const pickerWrap = el("div", {class:"picker-wrap"});
    const input = el("input", {type:"text", class:"picker-input", "data-seed-rank": i, autocomplete:"off", placeholder:"Search player…"});
    input.value = assignedPlayer ? assignedPlayer.name : "";
    pickerWrap.appendChild(input);
    if(assignedPlayer){
      pickerWrap.appendChild(el("button", {type:"button", class:"picker-clear", "data-seed-clear-rank": i}, ["\u00d7"]));
    }
    pickerWrap.appendChild(el("div", {class:"picker-suggestions hidden", "data-seed-suggestions": i}));
    wrap.appendChild(pickerWrap);
    list.appendChild(wrap);
  }
  updateBracketFillStatus(t);
}

function handleSeedSearchInput(e){
  if(!e.target.matches(".picker-input[data-seed-rank]")) return;
  const t = tournamentById(currentBracketTournamentId);
  if(!t) return;
  const rank = Number(e.target.dataset.seedRank);
  const query = e.target.value;
  const suggestionsEl = $('.picker-suggestions[data-seed-suggestions="' + rank + '"]');
  if(!query.trim()){ suggestionsEl.classList.add("hidden"); suggestionsEl.innerHTML = ""; return; }
  const usedElsewhere = new Set((t.seeds || []).filter((id, idx) => id && idx !== rank));
  const results = state.players
    .filter(p => !usedElsewhere.has(p.id))
    .filter(p => matchesSearch(p.name, query))
    .slice(0, 8);
  suggestionsEl.innerHTML = results.length
    ? results.map(p => '<button type="button" class="picker-option" data-seed-pick="' + rank + '" data-player-id="' + p.id + '">' + playerNameHTML(p) + '</button>').join("")
    : '<div class="picker-empty">No match</div>';
  suggestionsEl.classList.remove("hidden");
}

function handleSeedsListClick(e){
  const t = tournamentById(currentBracketTournamentId);
  if(!t) return;
  const pickBtn = e.target.closest("[data-seed-pick]");
  if(pickBtn){
    const rank = Number(pickBtn.dataset.seedPick);
    const pid = pickBtn.dataset.playerId;
    t.seeds[rank] = pid;
    t.unseededEntrants = (t.unseededEntrants || []).filter(id => id !== pid);
    saveState();
    renderBracketSeedsList(t);
    renderBracketUnseededList(t);
    return;
  }
  const clearBtn = e.target.closest("[data-seed-clear-rank]");
  if(clearBtn){
    const rank = Number(clearBtn.dataset.seedClearRank);
    t.seeds[rank] = null;
    saveState();
    renderBracketSeedsList(t);
    renderBracketUnseededList(t);
  }
}

function renderBracketUnseededList(t){
  const container = $("#bracket-unseeded-list");
  container.innerHTML = "";
  const pickerWrap = el("div", {class:"picker-wrap"});
  pickerWrap.appendChild(el("input", {type:"text", class:"picker-input", "data-entrant-search":"1", autocomplete:"off", placeholder:"Search player to add…"}));
  pickerWrap.appendChild(el("div", {class:"picker-suggestions hidden", "data-entrant-suggestions":"1"}));
  container.appendChild(pickerWrap);

  const chipsWrap = el("div", {class:"entrant-chips"});
  const entrants = (t.unseededEntrants || []).map(id => playerById(id)).filter(Boolean).sort((a,b) => a.name.localeCompare(b.name));
  if(entrants.length === 0){
    chipsWrap.appendChild(el("p", {class:"picker-empty-note"}, ["No unseeded entrants added yet — search above to add them."]));
  } else {
    entrants.forEach(p => {
      const chip = el("span", {class:"entrant-chip", html: playerNameHTML(p)});
      chip.appendChild(el("button", {type:"button", class:"entrant-chip-remove", "data-entrant-remove": p.id}, ["\u00d7"]));
      chipsWrap.appendChild(chip);
    });
  }
  container.appendChild(chipsWrap);
  updateBracketFillStatus(t);
}

// "X / Y in the main draw field" — Y accounts for slots reserved for qualifiers.
function updateBracketFillStatus(t){
  const statusEl = $("#bracket-fill-status");
  if(!statusEl) return;
  const directSlots = Math.max(0, t.drawSize - (t.qualifying && t.qualifying.enabled ? t.qualifying.numQualifiers : 0));
  const filled = t.seeds.filter(Boolean).length + (t.unseededEntrants || []).length;
  const complete = filled >= directSlots;
  statusEl.textContent = filled + " / " + directSlots + " in the main draw field" +
    (complete ? " — field complete" : " — " + (directSlots - filled) + " more needed");
  statusEl.classList.toggle("complete", complete);
}

function handleEntrantSearchInput(e){
  if(!e.target.matches("[data-entrant-search]")) return;
  const t = tournamentById(currentBracketTournamentId);
  if(!t) return;
  const query = e.target.value;
  const suggestionsEl = $('[data-entrant-suggestions]');
  if(!query.trim()){ suggestionsEl.classList.add("hidden"); suggestionsEl.innerHTML = ""; return; }
  const seededIds = new Set((t.seeds || []).filter(Boolean));
  const existingIds = new Set(t.unseededEntrants || []);
  const results = state.players
    .filter(p => !seededIds.has(p.id) && !existingIds.has(p.id))
    .filter(p => matchesSearch(p.name, query))
    .slice(0, 8);
  suggestionsEl.innerHTML = results.length
    ? results.map(p => '<button type="button" class="picker-option" data-entrant-pick="' + p.id + '">' + playerNameHTML(p) + '</button>').join("")
    : '<div class="picker-empty">No match</div>';
  suggestionsEl.classList.remove("hidden");
}

function handleUnseededListClick(e){
  const t = tournamentById(currentBracketTournamentId);
  if(!t) return;
  const pickBtn = e.target.closest("[data-entrant-pick]");
  if(pickBtn){
    const pid = pickBtn.dataset.entrantPick;
    const set = new Set(t.unseededEntrants || []);
    set.add(pid);
    t.unseededEntrants = Array.from(set);
    saveState();
    renderBracketUnseededList(t);
    return;
  }
  const rmBtn = e.target.closest("[data-entrant-remove]");
  if(rmBtn){
    const pid = rmBtn.dataset.entrantRemove;
    t.unseededEntrants = (t.unseededEntrants || []).filter(id => id !== pid);
    t.qualifierIds = (t.qualifierIds || []).filter(id => id !== pid);
    saveState();
    renderBracketUnseededList(t);
  }
}

function handleGenerateDraw(){
  const t = tournamentById(currentBracketTournamentId);
  if(!t) return;
  const msg = $("#bracket-generate-msg");
  const filledSeeds = t.seeds.filter(Boolean).length;
  const totalEntrants = filledSeeds + (t.unseededEntrants || []).length;
  if(totalEntrants === 0){
    msg.textContent = "Assign at least a few seeds or entrants first.";
    msg.className = "form-msg";
    return;
  }
  if(state.matches.some(m => m.tournamentId === t.id && (m.bracket||"main")==="main") &&
     !confirm("This tournament already has recorded results. Generating a new draw clears them. Continue?")){
    return;
  }
  generateDraw(t);
  saveState();
  msg.textContent = "Draw generated.";
  msg.className = "form-msg ok";
  renderBracketSeedGrid(t);
  renderBracketRounds(t);
  renderRankings();
}

/* ---------------- Qualifying UI ---------------- */
function renderQualEntrantsList(t){
  const container = $("#qual-entrants-list");
  container.innerHTML = "";
  const pickerWrap = el("div", {class:"picker-wrap"});
  pickerWrap.appendChild(el("input", {type:"text", class:"picker-input", "data-qual-entrant-search":"1", autocomplete:"off", placeholder:"Search player to add…"}));
  pickerWrap.appendChild(el("div", {class:"picker-suggestions hidden", "data-qual-entrant-suggestions":"1"}));
  container.appendChild(pickerWrap);

  const chipsWrap = el("div", {class:"entrant-chips"});
  const entrants = (t.qualifying.entrants || []).map(id => playerById(id)).filter(Boolean).sort((a,b) => a.name.localeCompare(b.name));
  if(entrants.length === 0){
    chipsWrap.appendChild(el("p", {class:"picker-empty-note"}, ["No qualifying entrants added yet — search above to add them."]));
  } else {
    entrants.forEach(p => {
      const chip = el("span", {class:"entrant-chip", html: playerNameHTML(p)});
      chip.appendChild(el("button", {type:"button", class:"entrant-chip-remove", "data-qual-entrant-remove": p.id}, ["\u00d7"]));
      chipsWrap.appendChild(chip);
    });
  }
  container.appendChild(chipsWrap);
  updateQualFillStatus(t);
}

// "X / Y in the qualifying field" — Y is the full qualifying bracket capacity.
function updateQualFillStatus(t){
  const statusEl = $("#qual-fill-status");
  if(!statusEl) return;
  const cap = t.qualifying.numQualifiers * Math.pow(2, t.qualifying.numRounds);
  const filled = (t.qualifying.entrants || []).length;
  const complete = filled >= cap;
  statusEl.textContent = filled + " / " + cap + " in the qualifying field" +
    (complete ? " — field complete" : " — " + (cap - filled) + " more needed");
  statusEl.classList.toggle("complete", complete);
}

function handleQualEntrantSearchInput(e){
  if(!e.target.matches("[data-qual-entrant-search]")) return;
  const t = tournamentById(currentBracketTournamentId);
  if(!t) return;
  const query = e.target.value;
  const suggestionsEl = $('[data-qual-entrant-suggestions]');
  if(!query.trim()){ suggestionsEl.classList.add("hidden"); suggestionsEl.innerHTML = ""; return; }
  const existingIds = new Set(t.qualifying.entrants || []);
  const results = state.players
    .filter(p => !existingIds.has(p.id))
    .filter(p => matchesSearch(p.name, query))
    .slice(0, 8);
  suggestionsEl.innerHTML = results.length
    ? results.map(p => '<button type="button" class="picker-option" data-qual-entrant-pick="' + p.id + '">' + playerNameHTML(p) + '</button>').join("")
    : '<div class="picker-empty">No match</div>';
  suggestionsEl.classList.remove("hidden");
}

function handleQualEntrantsListClick(e){
  const t = tournamentById(currentBracketTournamentId);
  if(!t) return;
  const pickBtn = e.target.closest("[data-qual-entrant-pick]");
  if(pickBtn){
    const pid = pickBtn.dataset.qualEntrantPick;
    const set = new Set(t.qualifying.entrants || []);
    set.add(pid);
    t.qualifying.entrants = Array.from(set);
    saveState();
    renderQualEntrantsList(t);
    return;
  }
  const rmBtn = e.target.closest("[data-qual-entrant-remove]");
  if(rmBtn){
    const pid = rmBtn.dataset.qualEntrantRemove;
    t.qualifying.entrants = (t.qualifying.entrants || []).filter(id => id !== pid);
    saveState();
    renderQualEntrantsList(t);
  }
}

function handleQualConfigChange(){
  const t = tournamentById(currentBracketTournamentId);
  if(!t) return;
  const enabled = $("#qual-enabled").checked;
  const numQualifiers = Number($("#qual-numqualifiers").value) || 8;
  const numRounds = Number($("#qual-numrounds").value) || 2;
  const sizeChanged = numQualifiers !== t.qualifying.numQualifiers || numRounds !== t.qualifying.numRounds;
  const hasResults = matchesForQualifying(t.id).length > 0;
  if(sizeChanged && hasResults && !confirm("Changing the qualifying format clears its entrants and recorded results. Continue?")){
    renderQualifyingConfig(t);
    return;
  }
  t.qualifying.enabled = enabled;
  if(sizeChanged){
    t.qualifying.numQualifiers = numQualifiers;
    t.qualifying.numRounds = numRounds;
    t.qualifying.entrants = [];
    state.matches = state.matches.filter(m => !(m.tournamentId === t.id && m.bracket === "qual"));
  }
  ensureQualifyingEntries(t);
  saveState();
  renderQualifyingConfig(t);
  renderRankings();
}

function handleGenerateQualifyingDraw(){
  const t = tournamentById(currentBracketTournamentId);
  if(!t) return;
  const msg = $("#qual-generate-msg");
  const entrantCount = (t.qualifying.entrants || []).length;
  const cap = t.qualifying.numQualifiers * Math.pow(2, t.qualifying.numRounds);
  if(entrantCount === 0){
    msg.textContent = "Add at least a few qualifying entrants first.";
    msg.className = "form-msg";
    return;
  }
  if(entrantCount > cap){
    msg.textContent = "You've added " + entrantCount + " entrants but the qualifying draw only holds " + cap + " — extras won't be placed.";
    msg.className = "form-msg";
  }
  if(matchesForQualifying(t.id).length > 0 &&
     !confirm("This qualifying draw already has recorded results. Generating a new draw clears them. Continue?")){
    return;
  }
  generateQualifyingDraw(t);
  saveState();
  if(!msg.textContent || msg.className === "form-msg ok"){
    msg.textContent = "Qualifying draw generated.";
    msg.className = "form-msg ok";
  }
  renderQualBracketRounds(t);
  renderRankings();
}

function handleAddQualifiersToMain(){
  const t = tournamentById(currentBracketTournamentId);
  if(!t) return;
  const msg = $("#qual-add-msg");
  const results = computeQualifyingResults(t);
  const qualifiedIds = [];
  results.forEach((res, pid) => { if(res.code === "QUALIFIED") qualifiedIds.push(pid); });
  if(qualifiedIds.length === 0){
    msg.textContent = "No qualifiers yet — finish the qualifying draw first.";
    msg.className = "form-msg";
    return;
  }
  const seededIds = new Set((t.seeds || []).filter(Boolean));
  const existing = new Set(t.unseededEntrants || []);
  const qualifierSet = new Set(t.qualifierIds || []);
  let added = 0;
  qualifiedIds.forEach(pid => {
    qualifierSet.add(pid);
    if(!seededIds.has(pid) && !existing.has(pid)){ existing.add(pid); added++; }
  });
  t.unseededEntrants = Array.from(existing);
  t.qualifierIds = Array.from(qualifierSet);
  saveState();
  msg.textContent = added > 0
    ? "Added " + added + " qualifier" + (added===1?"":"s") + " to the main draw's unseeded entrants (marked with a Q)."
    : "All qualifiers are already in the main draw field.";
  msg.className = "form-msg ok";
  renderBracketUnseededList(t);
  renderBracketRounds(t);
}

const BRACKET_TITLE_OFFSET = 22;
const BRACKET_ROW_GAP = 5;
const SECTION_SIZE = 8; // matches per section (16 players) in the first round
const SECTION_LABEL_H = 24;

// Lays out a bracket by actually measuring each card's real rendered height
// (instead of assuming a uniform row height), so a round full of short
// "played" or "TBD" cards collapses down like a normal results table, and
// only whichever round is actively being played takes up real space for its
// score-entry form. Later rounds are centered on the midpoint of their two
// feeders' *measured* centers, computed round by round left to right.
function layoutBracketColumns(wrap, rounds, cardBuilder, titleFor){
  wrap.innerHTML = "";
  let prevCenters = null;
  let maxBottom = 0;
  const cols = [];

  rounds.forEach((roundObj, r) => {
    const col = el("div", {class:"bracket-round"});
    col.appendChild(el("div", {class:"bracket-round-title"}, [titleFor(roundObj)]));
    wrap.appendChild(col);
    cols.push(col);

    const cardEls = roundObj.matches.map(m => {
      const card = cardBuilder(m);
      card.style.position = "absolute";
      card.style.left = "0";
      card.style.right = "0";
      card.style.top = "0px";
      card.style.margin = "0";
      col.appendChild(card);
      return card;
    });
    const heights = cardEls.map(c => c.offsetHeight);
    const centers = [];

    if(r === 0){
      // A first round with more than one section's worth of matches gets a
      // "Section N" label every 16 players (8 matches), purely as a visual
      // wayfinding aid — the underlying centering math is untouched, later
      // rounds just follow whatever centers this produces, same as always.
      const showSections = roundObj.matches.length > SECTION_SIZE;
      let cum = BRACKET_TITLE_OFFSET;
      let sectionNum = 0;
      heights.forEach((h, i) => {
        if(showSections && i % SECTION_SIZE === 0){
          sectionNum++;
          const label = el("div", {class:"bracket-section-label"}, ["Section " + sectionNum]);
          label.style.position = "absolute";
          label.style.top = cum + "px";
          label.style.left = "0";
          label.style.right = "0";
          col.appendChild(label);
          cum += SECTION_LABEL_H;
        }
        cardEls[i].style.top = cum + "px";
        centers.push(cum + h / 2);
        cum += h + BRACKET_ROW_GAP;
      });
      maxBottom = Math.max(maxBottom, cum - BRACKET_ROW_GAP);
    } else {
      heights.forEach((h, i) => {
        const c = (prevCenters[i*2] + prevCenters[i*2+1]) / 2;
        cardEls[i].style.top = (c - h / 2) + "px";
        centers.push(c);
        maxBottom = Math.max(maxBottom, c + h / 2);
      });
    }
    prevCenters = centers;
  });

  cols.forEach(col => { col.style.height = maxBottom + "px"; });
}

function renderQualBracketRounds(t){
  const wrap = $("#qual-bracket-wrap");
  const rounds = computeQualifyingBracket(t);
  layoutBracketColumns(wrap, rounds, (m) => buildQualMatchCard(t, m), (roundObj) => roundObj.round);
}

function buildQualSlotRow(t, slot, m){
  let nameHTML, extraClass = "";
  if(slot.type === "player"){
    const p = playerById(slot.playerId);
    const isWC = isQualifyingWildCard(t, slot.playerId);
    const badges = isWC ? '<span class="wc-badge">WC</span>' : "";
    nameHTML = badges + (p ? (m.status === "ready" ? playerNameHTML(p) : playerLinkHTML(p)) : "(removed player)");
  } else {
    nameHTML = "TBD"; extraClass = " slot-empty";
  }
  const isWinner = m.status !== "ready" && m.winnerSlot && slot.type === "player" && m.winnerSlot.playerId === slot.playerId;
  const isWalkoverClickable = m.status === "ready" && slot.type === "player";
  const row = el("div", {class: "bracket-slot" + (isWinner ? " slot-winner" : "") + extraClass + (isWalkoverClickable ? " slot-walkover-target" : "")});
  row.appendChild(el("span", {class:"slot-name", html: nameHTML}));
  if(m.status === "played" && m.existingMatch && slot.type === "player"){
    row.appendChild(el("span", {html: slotScoreHTML(m.existingMatch, slot.playerId)}));
  }
  if(isWalkoverClickable){
    const p = playerById(slot.playerId);
    row.title = "Click to award " + (p ? p.name : "this player") + " the win by walkover";
    row.addEventListener("click", () => {
      if(p && confirm("Award the win to " + p.name + " by walkover?")){
        persistMatchResult(t, m, p.id, [], true, "qual");
      }
    });
  }
  return row;
}

function buildQualMatchCard(t, m){
  const card = el("div", {class:"bracket-match status-" + m.status});
  card.appendChild(buildQualSlotRow(t, m.slotA, m));
  card.appendChild(buildQualSlotRow(t, m.slotB, m));

  if(m.status === "ready"){
    card.appendChild(buildQualEntryForm(t, m));
  } else if(m.status === "played"){
    const clearX = el("button", {type:"button", class:"clear-x", title:"Clear result"}, ["\u00d7"]);
    clearX.addEventListener("click", (e) => {
      e.stopPropagation();
      if(confirm("Clear this result? Later qualifying rounds built on it will be cleared too.")){
        deleteQualCascade(t, qualRoundNames(t.qualifying.numRounds).indexOf(m.round), m.slotIndex);
        saveState();
        withScrollPreserved(() => renderQualBracketRounds(t));
        renderRankings();
      }
    });
    card.appendChild(clearX);
  }
  return card;
}

function buildQualEntryForm(t, m){
  const form = el("div", {class:"bracket-match-form"});
  const setRow = el("div", {class:"bracket-sets-row"});
  const setInputs = [];
  for(let i = 1; i <= 3; i++){
    const box = el("div", {class:"set-box"});
    box.appendChild(el("span", {}, ["S" + i]));
    const inner = el("div", {style:"display:flex;gap:2px;"});
    const a = el("input", {type:"number", min:"0", max:"30"});
    const b = el("input", {type:"number", min:"0", max:"30"});
    inner.appendChild(a); inner.appendChild(b);
    box.appendChild(inner);
    setRow.appendChild(box);
    setInputs.push({a, b});
  }
  form.appendChild(setRow);

  const errMsg = el("div", {class:"form-msg"}, []);
  form.appendChild(errMsg);

  // No submit button — the winner is read off as soon as someone has taken
  // 2 of the (up to) 3 sets entered. Click either name above for a walkover.
  function evaluateAndMaybeSave(){
    errMsg.textContent = "";
    let sets = [];
    for(const pair of setInputs){
      const av = pair.a.value, bv = pair.b.value;
      if(av === "" && bv === "") continue;
      if(av === "" || bv === "") return;
      const an = Number(av), bn = Number(bv);
      if(an === bn){ errMsg.textContent = "A set can't end in a tie."; return; }
      sets.push({a: an, b: bn});
    }
    if(sets.length === 0) return;
    let aSets = 0, bSets = 0;
    sets.forEach(s => { if(s.a > s.b) aSets++; else bSets++; });
    if(aSets < 2 && bSets < 2) return;
    persistMatchResult(t, m, aSets > bSets ? m.slotA.playerId : m.slotB.playerId, sets, false, "qual");
  }

  setInputs.forEach(pair => {
    pair.a.addEventListener("input", evaluateAndMaybeSave);
    pair.b.addEventListener("input", evaluateAndMaybeSave);
  });

  return form;
}

/* ---------------- Auto-fill from rankings ---------------- */
function handleAutofillMain(){
  const t = tournamentById(currentBracketTournamentId);
  if(!t) return;
  const msg = $("#bracket-autofill-msg");
  const entryDate = rankingDateFromSelectValue($("#bracket-entry-date").value);
  const seedDate = rankingDateFromSelectValue($("#bracket-seed-date").value);
  const numSeeds = numSeedsFor(t.drawSize);
  const qualSlots = t.qualifying.enabled ? t.qualifying.numQualifiers : 0;
  const directSlots = Math.max(0, t.drawSize - qualSlots);

  const entryRanks = ranksFromTotals(officialRankingsAsOf(entryDate));
  const alreadyUsed = new Set([...(t.seeds || []).filter(Boolean), ...(t.unseededEntrants || [])]);
  const fieldCandidates = state.players
    .filter(p => !alreadyUsed.has(p.id))
    .sort((a,b) => (entryRanks[a.id] || 99999) - (entryRanks[b.id] || 99999) || a.name.localeCompare(b.name));

  const openSeedSlots = [];
  t.seeds.forEach((s, i) => { if(!s) openSeedSlots.push(i); });
  const openUnseededCount = Math.max(0, directSlots - t.seeds.filter(Boolean).length - (t.unseededEntrants||[]).length);

  const field = fieldCandidates.slice(0, openSeedSlots.length + openUnseededCount);
  const seedRanks = ranksFromTotals(officialRankingsAsOf(seedDate));
  const reranked = field.slice().sort((a,b) => (seedRanks[a.id] || 99999) - (seedRanks[b.id] || 99999) || a.name.localeCompare(b.name));

  let filled = 0;
  const toSeed = reranked.slice(0, openSeedSlots.length);
  const toUnseeded = reranked.slice(openSeedSlots.length);
  toSeed.forEach((p, i) => { t.seeds[openSeedSlots[i]] = p.id; filled++; });
  const unseededSet = new Set(t.unseededEntrants || []);
  toUnseeded.forEach(p => { unseededSet.add(p.id); filled++; });
  t.unseededEntrants = Array.from(unseededSet);

  saveState();
  msg.textContent = filled > 0 ? "Filled " + filled + " open spot" + (filled===1?"":"s") + " in the main draw." : "No open seed or entrant spots to fill.";
  msg.className = "form-msg ok";
  renderBracketSeedsList(t);
  renderBracketUnseededList(t);
  $("#bracket-numseeds-label").textContent = numSeeds;
}

function handleAutofillQual(){
  const t = tournamentById(currentBracketTournamentId);
  if(!t || !t.qualifying.enabled) return;
  const msg = $("#bracket-autofill-msg");
  const entryDate = rankingDateFromSelectValue($("#bracket-entry-date").value);
  const numSeeds = numSeedsFor(t.drawSize);
  const qualSlots = t.qualifying.numQualifiers * Math.pow(2, t.qualifying.numRounds);
  const directSlots = Math.max(0, t.drawSize - t.qualifying.numQualifiers);

  const entryRanks = ranksFromTotals(officialRankingsAsOf(entryDate));
  const usedInMain = new Set([...(t.seeds || []).filter(Boolean), ...(t.unseededEntrants || [])]);
  const usedInQual = new Set(t.qualifying.entrants || []);
  const candidates = state.players
    .filter(p => !usedInMain.has(p.id) && !usedInQual.has(p.id))
    .sort((a,b) => (entryRanks[a.id] || 99999) - (entryRanks[b.id] || 99999) || a.name.localeCompare(b.name));

  const openSlots = Math.max(0, qualSlots - usedInQual.size);
  const toAdd = candidates.slice(0, openSlots);
  const set = new Set(t.qualifying.entrants || []);
  toAdd.forEach(p => set.add(p.id));
  t.qualifying.entrants = Array.from(set);

  saveState();
  msg.textContent = toAdd.length > 0 ? "Added " + toAdd.length + " qualifying entrant" + (toAdd.length===1?"":"s") + "." : "No open qualifying spots to fill.";
  msg.className = "form-msg ok";
  renderQualEntrantsList(t);
}

/* ---------------- Entry List (with wild cards) ---------------- */
function renderEntryListBody(t){
  const container = $("#entry-list-body");
  container.innerHTML = "";

  const pickerWrap = el("div", {class:"picker-wrap"});
  pickerWrap.appendChild(el("input", {type:"text", class:"picker-input", "data-entrylist-search":"1", autocomplete:"off", placeholder:"Search player to add to entry list…"}));
  pickerWrap.appendChild(el("div", {class:"picker-suggestions hidden", "data-entrylist-suggestions":"1"}));
  container.appendChild(pickerWrap);

  const listWrap = el("div", {style:"margin-top:12px;"});
  if((t.entryList || []).length === 0){
    listWrap.appendChild(el("p", {class:"picker-empty-note"}, ["No one on the entry list yet — search above to add players."]));
  } else {
    t.entryList
      .map(entry => ({entry, p: playerById(entry.playerId)}))
      .filter(x => x.p)
      .sort((a,b) => a.p.name.localeCompare(b.p.name))
      .forEach(({entry, p}) => {
        const row = el("div", {class:"entry-list-row"});
        row.appendChild(el("span", {class:"entry-list-name", html: playerNameHTML(p)}));
        const wcGroup = el("div", {class:"entry-list-wc-group"});
        [["none","Entry"], ["main","Main WC"], ["qual","Q WC"]].forEach(([val, label]) => {
          const btn = el("button", {
            type:"button",
            class:"entry-list-wc-btn" + (entry.wildcard === val ? " active-" + val : ""),
            "data-entrylist-wc-player": entry.playerId,
            "data-entrylist-wc-value": val
          }, [label]);
          wcGroup.appendChild(btn);
        });
        row.appendChild(wcGroup);
        row.appendChild(el("button", {type:"button", class:"entry-list-remove", "data-entrylist-remove": entry.playerId}, ["\u00d7"]));
        listWrap.appendChild(row);
      });
  }
  container.appendChild(listWrap);
}

function handleEntryListSearchInput(e){
  if(!e.target.matches("[data-entrylist-search]")) return;
  const t = tournamentById(currentBracketTournamentId);
  if(!t) return;
  const query = e.target.value;
  const suggestionsEl = $('[data-entrylist-suggestions]');
  if(!query.trim()){ suggestionsEl.classList.add("hidden"); suggestionsEl.innerHTML = ""; return; }
  const existingIds = new Set((t.entryList || []).map(e2 => e2.playerId));
  const results = state.players
    .filter(p => !existingIds.has(p.id))
    .filter(p => matchesSearch(p.name, query))
    .slice(0, 8);
  suggestionsEl.innerHTML = results.length
    ? results.map(p => '<button type="button" class="picker-option" data-entrylist-pick="' + p.id + '">' + playerNameHTML(p) + '</button>').join("")
    : '<div class="picker-empty">No match</div>';
  suggestionsEl.classList.remove("hidden");
}

function handleEntryListClick(e){
  const t = tournamentById(currentBracketTournamentId);
  if(!t) return;
  const pickBtn = e.target.closest("[data-entrylist-pick]");
  if(pickBtn){
    const pid = pickBtn.dataset.entrylistPick;
    if(!t.entryList.some(e2 => e2.playerId === pid)){
      t.entryList.push({playerId: pid, wildcard: "none"});
      saveState();
      renderEntryListBody(t);
    }
    return;
  }
  const wcBtn = e.target.closest("[data-entrylist-wc-player]");
  if(wcBtn){
    const pid = wcBtn.dataset.entrylistWcPlayer;
    const val = wcBtn.dataset.entrylistWcValue;
    const entry = t.entryList.find(e2 => e2.playerId === pid);
    if(entry){
      entry.wildcard = val;
      saveState();
      renderEntryListBody(t);
    }
    return;
  }
  const rmBtn = e.target.closest("[data-entrylist-remove]");
  if(rmBtn){
    const pid = rmBtn.dataset.entrylistRemove;
    t.entryList = t.entryList.filter(e2 => e2.playerId !== pid);
    saveState();
    renderEntryListBody(t);
  }
}

// Splits the entry list into main-draw seeds/unseeded and qualifying
// entrants: wild cards get a guaranteed spot first, then the rest of the
// direct-acceptance and qualifying cutoffs are set by rank (entry-list
// date), and finally the main-draw field is seeded using the seeding date.
function handleProcessEntryList(){
  const t = tournamentById(currentBracketTournamentId);
  if(!t) return;
  const msg = $("#entry-list-msg");
  msg.className = "form-msg";

  const entryDate = rankingDateFromSelectValue($("#bracket-entry-date").value);
  const seedDate = rankingDateFromSelectValue($("#bracket-seed-date").value);
  const numSeeds = numSeedsFor(t.drawSize);
  const qualEnabled = t.qualifying.enabled;
  const qualCap = qualEnabled ? t.qualifying.numQualifiers * Math.pow(2, t.qualifying.numRounds) : 0;
  const directSlots = Math.max(0, t.drawSize - (qualEnabled ? t.qualifying.numQualifiers : 0));

  const mainWCs = t.entryList.filter(e => e.wildcard === "main").map(e => e.playerId);
  const qualWCs = t.entryList.filter(e => e.wildcard === "qual").map(e => e.playerId);
  const regular = t.entryList.filter(e => e.wildcard === "none").map(e => e.playerId);

  if(mainWCs.length > directSlots){
    msg.textContent = "Too many main-draw wild cards (" + mainWCs.length + ") for " + directSlots + " direct slot" + (directSlots===1?"":"s") + ". Remove a few and try again.";
    return;
  }
  if(qualEnabled && qualWCs.length > qualCap){
    msg.textContent = "Too many qualifying wild cards (" + qualWCs.length + ") for " + qualCap + " qualifying slot" + (qualCap===1?"":"s") + ". Remove a few and try again.";
    return;
  }

  const entryRanks = ranksFromTotals(officialRankingsAsOf(entryDate));
  const regularSorted = regular.slice().sort((a,b) =>
    (entryRanks[a] || 999999) - (entryRanks[b] || 999999) ||
    (playerById(a) ? playerById(a).name : "").localeCompare(playerById(b) ? playerById(b).name : ""));

  const mainDirectCount = Math.max(0, directSlots - mainWCs.length);
  const mainDirect = regularSorted.slice(0, mainDirectCount);
  const leftover = regularSorted.slice(mainDirectCount);

  const qualDirectCount = qualEnabled ? Math.max(0, qualCap - qualWCs.length) : 0;
  const qualDirect = qualEnabled ? leftover.slice(0, qualDirectCount) : [];
  const alternates = qualEnabled ? leftover.slice(qualDirectCount) : leftover;

  const mainField = [...mainWCs, ...mainDirect];
  const qualField = [...qualWCs, ...qualDirect];

  const seedRanks = ranksFromTotals(officialRankingsAsOf(seedDate));
  const mainSorted = mainField.slice().sort((a,b) =>
    (seedRanks[a] || 999999) - (seedRanks[b] || 999999) ||
    (playerById(a) ? playerById(a).name : "").localeCompare(playerById(b) ? playerById(b).name : ""));

  const newSeeds = mainSorted.slice(0, numSeeds);
  const newUnseeded = mainSorted.slice(numSeeds);

  t.seeds = new Array(numSeeds).fill(null).map((_, i) => newSeeds[i] || null);
  t.unseededEntrants = Array.from(new Set(newUnseeded));
  if(qualEnabled) t.qualifying.entrants = Array.from(new Set(qualField));

  saveState();
  msg.className = "form-msg ok";
  msg.textContent = mainWCs.length + " main WC, " + (qualEnabled ? qualWCs.length + " qualifying WC, " : "") +
    mainDirect.length + " direct into the main draw" + (qualEnabled ? ", " + qualDirect.length + " into qualifying" : "") +
    (alternates.length ? ", " + alternates.length + " on the entry list didn't make the cut." : ".");

  renderBracketSeedsList(t);
  renderBracketUnseededList(t);
  if(qualEnabled) renderQualEntrantsList(t);
  $("#bracket-numseeds-label").textContent = numSeeds;
}

function renderBracketSeedGrid(t){
  const grid = $("#bracket-seed-grid");
  grid.innerHTML = "";
  const cap = capacityOf(t.drawSize);
  const playersSorted = [...state.players].sort((a,b) => a.name.localeCompare(b.name));
  for(let i = 0; i < cap; i++){
    const entry = t.bracketEntries[i] || {type:"empty"};
    const wrap = el("div", {class:"bracket-seed-slot"});
    wrap.appendChild(el("span", {class:"slot-num"}, [String(i+1)]));
    const sel = el("select", {"data-seed-slot": i});
    sel.appendChild(el("option", {value:"empty"}, ["— Empty —"]));
    sel.appendChild(el("option", {value:"bye"}, ["Bye"]));
    playersSorted.forEach(p => sel.appendChild(el("option", {value:"player:" + p.id}, [p.name])));
    sel.value = entry.type === "player" ? "player:" + entry.playerId : entry.type;
    wrap.appendChild(sel);
    grid.appendChild(wrap);
  }
}

function handleSeedSelectChange(e){
  if(!e.target.matches("select[data-seed-slot]")) return;
  const t = tournamentById(currentBracketTournamentId);
  if(!t) return;
  const i = Number(e.target.dataset.seedSlot);
  const val = e.target.value;
  let entry;
  if(val === "empty") entry = {type:"empty"};
  else if(val === "bye") entry = {type:"bye"};
  else entry = {type:"player", playerId: val.slice(7)};
  t.bracketEntries[i] = entry;
  deleteCascade(t, 0, Math.floor(i / 2));
  saveState();
  withScrollPreserved(() => renderBracketRounds(t));
  renderRankings();
}

// Vertical rhythm: every round-0 match occupies one row of this height.
// Later rounds are centered exactly on the midpoint of their two feeder
// matches, based on each card's real measured height (see
// layoutBracketColumns), so the bracket is only as tall as it needs to be.
// A 16-player group always resolves to one winner in exactly 4 rounds
// (log2(16) = 4) — that's what makes "sections" work at any draw size.
const SECTION_INTERNAL_ROUNDS = 4;

// Vertical rhythm: every round-0 match occupies one row of this height.
// Later rounds are centered exactly on the midpoint of their two feeder
// matches, based on each card's real measured height (see
// layoutBracketColumns), so the bracket is only as tall as it needs to be.
//
// Draws bigger than 32 get split the way a real published draw sheet does:
// each 16-player group ("Section") plays out its own first/second/third
// round and quarterfinal-equivalent independently, and a separate "Finals"
// block up top re-shows that same last round alongside the semis and final
// as the unified business end — rather than one enormous continuous row of
// columns.
function renderBracketRounds(t){
  const container = $("#bracket-draw-container");
  container.innerHTML = "";
  const rounds = computeBracket(t);
  const round0Count = rounds[0].matches.length;
  const cap = capacityOf(t.drawSize);
  const cardBuilder = (m) => buildBracketMatchCard(t, m);

  // Sectioning only kicks in for draws bigger than 32 — a 32-draw (16
  // first-round matches, 2 sections) stays as one simple continuous view.
  if(cap <= 32){
    container.appendChild(el("div", {class:"bracket-section-title"}, [el("h3", {}, ["Draw"])]));
    const wrap = el("div", {class:"bracket-wrap"});
    container.appendChild(wrap);
    layoutBracketColumns(wrap, rounds, cardBuilder, (roundObj) => ROUND_LABELS[roundObj.round] || roundObj.round);
    renderSeedIndex(t);
    return;
  }

  const numSections = round0Count / SECTION_SIZE;

  // "Finals" — the combined view from the section-final round onward.
  const combinedRounds = rounds.slice(SECTION_INTERNAL_ROUNDS - 1);
  container.appendChild(el("div", {class:"bracket-section-title"}, [el("h3", {}, ["Finals"])]));
  const finalsWrap = el("div", {class:"bracket-wrap"});
  container.appendChild(finalsWrap);
  layoutBracketColumns(finalsWrap, combinedRounds, cardBuilder, (roundObj) => FRIENDLY_ROUND_NAMES[roundObj.round] || roundObj.round);

  // Sections, grouped into "Top half" / "Bottom half" once there are enough
  // of them that the grouping actually helps (4+ sections, i.e. 64+ draws).
  const groupIntoHalves = numSections >= 4;
  const sectionsPerHalf = groupIntoHalves ? numSections / 2 : numSections;
  const halfLabels = ["Top half", "Bottom half"];

  for(let half = 0; half < (groupIntoHalves ? 2 : 1); half++){
    if(groupIntoHalves){
      container.appendChild(el("h2", {class:"bracket-half-heading"}, [halfLabels[half]]));
    }
    for(let localSec = 0; localSec < sectionsPerHalf; localSec++){
      const sectionIndex = half * sectionsPerHalf + localSec;
      const sectionRoundsData = [];
      for(let r = 0; r < SECTION_INTERNAL_ROUNDS; r++){
        const matchesPerSection = SECTION_SIZE / Math.pow(2, r);
        const start = sectionIndex * matchesPerSection;
        sectionRoundsData.push({
          round: rounds[r].round,
          matches: rounds[r].matches.slice(start, start + matchesPerSection)
        });
      }
      container.appendChild(el("div", {class:"bracket-section-title"}, [el("h3", {}, ["Section " + (sectionIndex + 1)])]));
      const sectionWrap = el("div", {class:"bracket-wrap"});
      container.appendChild(sectionWrap);
      layoutBracketColumns(sectionWrap, sectionRoundsData, cardBuilder, (roundObj, idx) => {
        const posInSection = sectionRoundsData.indexOf(roundObj);
        if(posInSection < 3) return ["First Round", "Second Round", "Third Round"][posInSection];
        return FRIENDLY_ROUND_NAMES[roundObj.round] || roundObj.round;
      });
    }
  }

  renderSeedIndex(t);
}

// A two-column seed sheet above the draw (seeds 1..N/2 on the left, the rest
// on the right — CSS multi-column layout does this split automatically since
// every row is the same height). Each seed fades out once they're eliminated.
function renderSeedIndex(t){
  const container = $("#seed-index");
  if(!container) return;
  const numSeeds = numSeedsFor(t.drawSize);
  const results = computeTournamentResults(t.id);
  let html = "";
  for(let i = 0; i < numSeeds; i++){
    const pid = t.seeds[i];
    const p = pid ? playerById(pid) : null;
    let statusHTML = "", eliminated = false;
    if(p){
      const res = results.get(pid);
      if(res){
        if(res.code === "W"){ statusHTML = '<span class="seed-status champ">champion</span>'; }
        else { statusHTML = '<span class="seed-status">lost ' + (ROUND_LABELS[res.code] || res.code) + '</span>'; eliminated = true; }
      }
    }
    html += '<div class="seed-index-row' + (eliminated ? " seed-eliminated" : "") + '">' +
      '<span class="seed-index-num">' + (i + 1) + '.</span>' +
      '<span class="seed-index-name">' + (p ? playerLinkHTML(p) : '<span class="seed-index-empty">—</span>') + '</span>' +
      (statusHTML ? '<span class="seed-index-status">' + statusHTML + '</span>' : "") +
      '</div>';
  }
  container.innerHTML = html || '<p class="picker-empty-note">No seeds assigned yet.</p>';
}

function buildSlotRow(slot, m, which, t){
  let nameHTML, extraClass = "";
  if(slot.type === "player"){
    const p = playerById(slot.playerId);
    const seedNum = t ? seedNumberForPlayer(t, slot.playerId) : null;
    const isWC = t ? isMainDrawWildCard(t, slot.playerId) : false;
    const isQ = t ? isMainDrawQualifier(t, slot.playerId) : false;
    const badges = (seedNum ? '<span class="seed-badge">' + seedNum + '</span>' : "") +
      (isWC ? '<span class="wc-badge">WC</span>' : "") +
      (isQ ? '<span class="qual-badge">Q</span>' : "");
    // Ready matches: clicking a name awards that player the win by walkover.
    // Everything else: clicking a name opens their profile.
    nameHTML = badges + (p ? (m.status === "ready" ? playerNameHTML(p) : playerLinkHTML(p)) : "(removed player)");
  } else if(slot.type === "bye"){
    // A blank (not simply hidden) placeholder — same padding/line-height as
    // a real row, so the card's measured height (and therefore every round
    // after it) doesn't shift at all, it just doesn't show the word "Bye".
    nameHTML = "&nbsp;"; extraClass = " slot-bye";
  } else {
    nameHTML = "TBD"; extraClass = " slot-empty";
  }
  const isWinner = m.status !== "ready" && m.winnerSlot && slot.type === "player" && m.winnerSlot.playerId === slot.playerId;
  const isWalkoverClickable = m.status === "ready" && slot.type === "player";
  const row = el("div", {class: "bracket-slot" + (isWinner ? " slot-winner" : "") + extraClass + (isWalkoverClickable ? " slot-walkover-target" : "")});
  row.appendChild(el("span", {class:"slot-name", html: nameHTML}));
  if(m.status === "played" && m.existingMatch && slot.type === "player"){
    row.appendChild(el("span", {html: slotScoreHTML(m.existingMatch, slot.playerId)}));
  }
  if(isWalkoverClickable){
    const p = playerById(slot.playerId);
    row.title = "Click to award " + (p ? p.name : "this player") + " the win by walkover";
    row.addEventListener("click", () => {
      if(p && confirm("Award the win to " + p.name + " by walkover?")){
        persistMatchResult(t, m, p.id, [], true, "main");
      }
    });
  }
  return row;
}

function buildBracketMatchCard(t, m){
  const card = el("div", {class:"bracket-match status-" + m.status});
  card.appendChild(buildSlotRow(m.slotA, m, "A", t));
  card.appendChild(buildSlotRow(m.slotB, m, "B", t));

  if(m.status === "ready"){
    card.appendChild(buildBracketEntryForm(t, m));
  } else if(m.status === "played"){
    const clearX = el("button", {type:"button", class:"clear-x", title:"Clear result"}, ["\u00d7"]);
    clearX.addEventListener("click", (e) => {
      e.stopPropagation();
      if(confirm("Clear this result? Later rounds built on it will be cleared too.")){
        deleteCascade(t, bracketRoundNames(capacityOf(t.drawSize)).indexOf(m.round), m.slotIndex);
        saveState();
        withScrollPreserved(() => renderBracketRounds(t));
        renderRankings();
      }
    });
    card.appendChild(clearX);
  }
  return card;
}

function buildBracketEntryForm(t, m){
  const form = el("div", {class:"bracket-match-form"});
  const setRow = el("div", {class:"bracket-sets-row"});
  const setInputs = [];
  for(let i = 1; i <= 3; i++){
    const box = el("div", {class:"set-box"});
    box.appendChild(el("span", {}, ["S" + i]));
    const inner = el("div", {style:"display:flex;gap:2px;"});
    const a = el("input", {type:"number", min:"0", max:"30"});
    const b = el("input", {type:"number", min:"0", max:"30"});
    inner.appendChild(a); inner.appendChild(b);
    box.appendChild(inner);
    setRow.appendChild(box);
    setInputs.push({a, b});
  }
  form.appendChild(setRow);

  const errMsg = el("div", {class:"form-msg"}, []);
  form.appendChild(errMsg);

  // No submit button — the winner is read off as soon as someone has taken
  // 2 of the (up to) 3 sets entered. Click either name above for a walkover.
  function evaluateAndMaybeSave(){
    errMsg.textContent = "";
    let sets = [];
    for(const pair of setInputs){
      const av = pair.a.value, bv = pair.b.value;
      if(av === "" && bv === "") continue;
      if(av === "" || bv === "") return; // still mid-entry, wait quietly
      const an = Number(av), bn = Number(bv);
      if(an === bn){ errMsg.textContent = "A set can't end in a tie."; return; }
      sets.push({a: an, b: bn});
    }
    if(sets.length === 0) return;
    let aSets = 0, bSets = 0;
    sets.forEach(s => { if(s.a > s.b) aSets++; else bSets++; });
    if(aSets < 2 && bSets < 2) return; // not decided yet
    persistMatchResult(t, m, aSets > bSets ? m.slotA.playerId : m.slotB.playerId, sets, false, "main");
  }

  setInputs.forEach(pair => {
    pair.a.addEventListener("input", evaluateAndMaybeSave);
    pair.b.addEventListener("input", evaluateAndMaybeSave);
  });

  return form;
}

/* ---------------- Records ---------------- */

// Every Monday from the first tournament's week through the most recent
// active week — this mirrors how many "ranking weeks" have actually elapsed,
// including weeks where nothing was played but old results rolled off the
// 52-week window and standings shifted anyway.
function getAllWeeklySeries(){
  const allDates = [
    ...state.tournaments.map(t => tournamentDateMs(t)),
    ...(state.byeWeeks || []).map(bw => byeWeekDateMs(bw))
  ];
  if(allDates.length === 0) return [];
  const startMonday = mondayOf(Math.min(...allDates));
  const endMonday = mondayOf(getLatestActiveDate());
  const weeks = [];
  for(let cur = startMonday; cur <= endMonday; cur += 7 * MS_PER_DAY){
    weeks.push(cur);
  }
  return weeks;
}

function computeHistoryRecords(){
  const weeks = getAllWeeklySeries();
  const weeksAtNo1 = new Map();
  const weeksInTop10 = new Map();
  state.players.forEach(p => { weeksAtNo1.set(p.id, 0); weeksInTop10.set(p.id, 0); });
  weeks.forEach(w => {
    const ranks = ranksFromTotals(officialRankingsAsOf(w));
    Object.keys(ranks).forEach(pid => {
      const r = ranks[pid];
      if(r === 1) weeksAtNo1.set(pid, (weeksAtNo1.get(pid) || 0) + 1);
      if(r <= 10) weeksInTop10.set(pid, (weeksInTop10.get(pid) || 0) + 1);
    });
  });
  return {weeksAtNo1, weeksInTop10};
}

function computeTitlesByLevel(){
  const byLevel = {};
  Object.keys(LEVEL_LABELS).forEach(lvl => { byLevel[lvl] = new Map(); });
  state.tournaments.forEach(t => {
    const results = computeTournamentResults(t.id);
    results.forEach((res, pid) => {
      if(res.code === "W" && byLevel[t.level]){
        byLevel[t.level].set(pid, (byLevel[t.level].get(pid) || 0) + 1);
      }
    });
  });
  return byLevel;
}

function renderRecordListInto(container, map, unitLabel){
  container.innerHTML = "";
  const rows = Array.from(map.entries())
    .map(([pid, count]) => ({p: playerById(pid), count}))
    .filter(r => r.p && r.count > 0)
    .sort((a,b) => b.count - a.count || a.p.name.localeCompare(b.p.name))
    .slice(0, 10);
  if(rows.length === 0){
    container.appendChild(el("p", {class:"picker-empty-note"}, ["No data yet."]));
    return;
  }
  rows.forEach((r, i) => {
    container.appendChild(el("div", {class:"record-row"}, [
      el("span", {class:"record-rank"}, [String(i+1)]),
      el("span", {class:"record-name", html: playerLinkHTML(r.p)}),
      el("span", {class:"record-count"}, [String(r.count) + " " + unitLabel])
    ]));
  });
}

function renderRecords(){
  const empty = $("#records-empty");
  const body = $("#records-body");
  if(state.tournaments.length === 0 || state.matches.length === 0){
    empty.classList.remove("hidden");
    body.classList.add("hidden");
    return;
  }
  empty.classList.add("hidden");
  body.classList.remove("hidden");

  const {weeksAtNo1, weeksInTop10} = computeHistoryRecords();
  const careerTotals = computeRankings(null);
  const titlesOverall = new Map();
  careerTotals.forEach((v, pid) => titlesOverall.set(pid, v.titles));

  renderRecordListInto($("#record-weeks-no1 .record-list"), weeksAtNo1, "wks");
  renderRecordListInto($("#record-weeks-top10 .record-list"), weeksInTop10, "wks");
  renderRecordListInto($("#record-titles-overall .record-list"), titlesOverall, "titles");

  const byLevel = computeTitlesByLevel();
  const levelContainer = $("#record-titles-by-level");
  levelContainer.innerHTML = "";
  Object.keys(LEVEL_LABELS).forEach(lvl => {
    const panel = el("div", {class:"record-panel"});
    panel.appendChild(el("h3", {}, [LEVEL_LABELS[lvl]]));
    const list = el("div", {class:"record-list"});
    panel.appendChild(list);
    levelContainer.appendChild(panel);
    renderRecordListInto(list, byLevel[lvl], "titles");
  });
}

/* ---------------- History view ---------------- */
/* ---------------- Grand Slam History ---------------- */
function computeGrandSlamCareerStats(){
  const stats = new Map();
  state.players.forEach(p => stats.set(p.id, {QF:0, SF:0, F:0, W:0}));
  const idxQF = ROUND_ORDER.indexOf("QF");
  const idxSF = ROUND_ORDER.indexOf("SF");
  const idxF = ROUND_ORDER.indexOf("F");

  state.tournaments.filter(t => t.level === "GRAND_SLAM").forEach(t => {
    const results = computeTournamentResults(t.id);
    results.forEach((res, pid) => {
      const s = stats.get(pid);
      if(!s) return;
      if(res.code === "W"){
        s.QF++; s.SF++; s.F++; s.W++;
      } else {
        const idx = ROUND_ORDER.indexOf(res.code);
        if(idx >= idxQF) s.QF++;
        if(idx >= idxSF) s.SF++;
        if(idx >= idxF) s.F++;
      }
    });
  });
  return stats;
}

function renderGrandSlamHistory(){
  const stats = computeGrandSlamCareerStats();
  const rows = state.players
    .map(p => ({p, s: stats.get(p.id)}))
    .filter(r => r.s.QF > 0)
    .sort((a,b) =>
      b.s.W - a.s.W || b.s.F - a.s.F || b.s.SF - a.s.SF || b.s.QF - a.s.QF || a.p.name.localeCompare(b.p.name));

  const table = $("#slams-table");
  const empty = $("#slams-empty");
  if(rows.length === 0){
    table.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }
  table.classList.remove("hidden");
  empty.classList.add("hidden");

  $("#slams-body").innerHTML = rows.map(r => (
    '<tr>' +
    '<td><button class="player-link" data-open-player="' + r.p.id + '">' + flagImgHTML(r.p.country) + escapeHtml(r.p.name) + '</button></td>' +
    '<td class="country-chip">' + (r.p.country ? escapeHtml(r.p.country.toUpperCase()) : "—") + '</td>' +
    '<td>' + r.s.QF + '</td>' +
    '<td>' + r.s.SF + '</td>' +
    '<td>' + r.s.F + '</td>' +
    '<td class="points-cell">' + r.s.W + '</td>' +
    '</tr>'
  )).join("");
}

// Same cumulative-appearance idea as computeGrandSlamCareerStats, but scoped
// to a single metric and broken out per named major (all editions of a
// tournament with the same name are treated as "the same Slam" across years).
let slamMetric = "QF";
function computeGrandSlamBreakdownByName(metric){
  const slamNames = Array.from(new Set(state.tournaments.filter(t => t.level === "GRAND_SLAM").map(t => t.name))).sort();
  const idxQF = ROUND_ORDER.indexOf("QF"), idxSF = ROUND_ORDER.indexOf("SF"), idxF = ROUND_ORDER.indexOf("F");
  const target = metric === "QF" ? idxQF : metric === "SF" ? idxSF : metric === "F" ? idxF : null;

  const counts = new Map();
  state.players.forEach(p => {
    const row = {};
    slamNames.forEach(n => { row[n] = 0; });
    counts.set(p.id, row);
  });

  state.tournaments.filter(t => t.level === "GRAND_SLAM").forEach(t => {
    const results = computeTournamentResults(t.id);
    results.forEach((res, pid) => {
      const row = counts.get(pid);
      if(!row) return;
      let reached;
      if(metric === "W") reached = res.code === "W";
      else reached = res.code === "W" || ROUND_ORDER.indexOf(res.code) >= target;
      if(reached) row[t.name] = (row[t.name] || 0) + 1;
    });
  });

  return {slamNames, counts};
}

function renderGrandSlamBreakdown(){
  $all("[data-slam-metric]").forEach(btn => btn.classList.toggle("active", btn.dataset.slamMetric === slamMetric));

  const {slamNames, counts} = computeGrandSlamBreakdownByName(slamMetric);
  const table = $("#slam-breakdown-table");
  const empty = $("#slam-breakdown-empty");
  if(slamNames.length === 0){
    table.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }
  table.classList.remove("hidden");
  empty.classList.add("hidden");

  $("#slam-breakdown-head").innerHTML = "<th>Player</th>" +
    slamNames.map(n => '<th title="' + escapeHtml(n) + '">' + escapeHtml(abbreviateTournamentName(n)) + "</th>").join("") +
    "<th>Total</th>";

  const rows = state.players
    .map(p => {
      const row = counts.get(p.id) || {};
      const total = slamNames.reduce((s, n) => s + (row[n] || 0), 0);
      return {p, row, total};
    })
    .filter(r => r.total > 0)
    .sort((a,b) => b.total - a.total || a.p.name.localeCompare(b.p.name));

  $("#slam-breakdown-body").innerHTML = rows.map(r => (
    '<tr><td><button class="player-link" data-open-player="' + r.p.id + '">' + flagImgHTML(r.p.country) + escapeHtml(r.p.name) + '</button></td>' +
    slamNames.map(n => '<td>' + (r.row[n] || 0) + '</td>').join("") +
    '<td class="points-cell">' + r.total + '</td></tr>'
  )).join("");
}

/* ---------------- Head to Head ---------------- */
let h2hPlayerA = null, h2hPlayerB = null;

function buildH2HPicker(side){
  const wrap = $("#h2h-picker-" + side.toLowerCase());
  wrap.innerHTML = "";
  const id = side === "A" ? h2hPlayerA : h2hPlayerB;
  const p = id ? playerById(id) : null;
  const input = el("input", {type:"text", class:"picker-input", autocomplete:"off", placeholder:"Search player…", "data-h2h-search": side});
  input.value = p ? p.name : "";
  wrap.appendChild(input);
  if(p){
    wrap.appendChild(el("button", {type:"button", class:"picker-clear", "data-h2h-clear": side}, ["\u00d7"]));
  }
  wrap.appendChild(el("div", {class:"picker-suggestions hidden", "data-h2h-suggestions": side}));
}

function handleH2HSearchInput(e){
  const side = e.target.dataset.h2hSearch;
  if(!side) return;
  const query = e.target.value;
  const suggestionsEl = document.querySelector('[data-h2h-suggestions="' + side + '"]');
  if(!query.trim()){ suggestionsEl.classList.add("hidden"); suggestionsEl.innerHTML = ""; return; }
  const otherSide = side === "A" ? h2hPlayerB : h2hPlayerA;
  const results = state.players
    .filter(p => p.id !== otherSide)
    .filter(p => matchesSearch(p.name, query))
    .slice(0, 8);
  suggestionsEl.innerHTML = results.length
    ? results.map(p => '<button type="button" class="picker-option" data-h2h-pick="' + side + '" data-player-id="' + p.id + '">' + playerNameHTML(p) + '</button>').join("")
    : '<div class="picker-empty">No match</div>';
  suggestionsEl.classList.remove("hidden");
}

function handleH2HClick(e){
  const pickBtn = e.target.closest("[data-h2h-pick]");
  if(pickBtn){
    const side = pickBtn.dataset.h2hPick;
    const pid = pickBtn.dataset.playerId;
    if(side === "A") h2hPlayerA = pid; else h2hPlayerB = pid;
    renderHeadToHead();
    return;
  }
  const clearBtn = e.target.closest("[data-h2h-clear]");
  if(clearBtn){
    const side = clearBtn.dataset.h2hClear;
    if(side === "A") h2hPlayerA = null; else h2hPlayerB = null;
    renderHeadToHead();
  }
}

function computeHeadToHead(idA, idB){
  const matches = state.matches.filter(m =>
    (m.playerAId === idA && m.playerBId === idB) || (m.playerAId === idB && m.playerBId === idA)
  );
  matches.sort((a,b) => {
    const ta = tournamentById(a.tournamentId), tb = tournamentById(b.tournamentId);
    return (tb ? tournamentDateMs(tb) : 0) - (ta ? tournamentDateMs(ta) : 0);
  });
  let winsA = 0, winsB = 0;
  const surfaceStats = {hard:{a:0,b:0}, clay:{a:0,b:0}, grass:{a:0,b:0}};
  matches.forEach(m => {
    const t = tournamentById(m.tournamentId);
    if(m.winnerId === idA) winsA++;
    else if(m.winnerId === idB) winsB++;
    if(t && surfaceStats[t.surface]){
      if(m.winnerId === idA) surfaceStats[t.surface].a++;
      else if(m.winnerId === idB) surfaceStats[t.surface].b++;
    }
  });
  return {matches, winsA, winsB, surfaceStats};
}

function renderHeadToHead(){
  buildH2HPicker("A");
  buildH2HPicker("B");
  const idA = h2hPlayerA;
  const idB = h2hPlayerB;
  const empty = $("#h2h-empty");
  const body = $("#h2h-body");

  const pA = idA ? playerById(idA) : null;
  const pB = idB ? playerById(idB) : null;

  if(!pA || !pB || idA === idB){
    body.classList.add("hidden");
    empty.classList.remove("hidden");
    empty.querySelector("p").textContent = (idA && idA === idB)
      ? "Choose two different players."
      : "Pick two players to see their head-to-head record.";
    return;
  }
  empty.classList.add("hidden");
  body.classList.remove("hidden");

  const {matches, winsA, winsB, surfaceStats} = computeHeadToHead(idA, idB);

  body.innerHTML = "";
  body.appendChild(el("div", {class:"h2h-header"}, [
    el("div", {class:"h2h-name", html: playerLinkHTML(pA)}),
    el("div", {class:"h2h-score"}, [winsA + " – " + winsB]),
    el("div", {class:"h2h-name", html: playerLinkHTML(pB)})
  ]));

  if(matches.length > 0){
    const surfaceRow = el("div", {class:"profile-stats"}, ["hard","clay","grass"].map(s =>
      el("div", {class:"stat-box"}, [
        el("div", {class:"stat-num"}, [surfaceStats[s].a + "-" + surfaceStats[s].b]),
        el("div", {class:"stat-label"}, [s])
      ])
    ));
    body.appendChild(surfaceRow);
  }

  body.appendChild(el("div", {class:"profile-section-title"}, ["All Meetings"]));
  if(matches.length === 0){
    body.appendChild(el("p", {}, ["These two haven't played each other yet."]));
  } else {
    matches.forEach(m => {
      const t = tournamentById(m.tournamentId);
      const a = playerById(m.playerAId), b = playerById(m.playerBId);
      if(!a || !b) return;
      body.appendChild(el("div", {class:"match-row"}, [
        el("span", {class:"match-round"}, [ROUND_LABELS[m.round] || m.round]),
        el("span", {class:"match-players", html:
          (m.winnerId === a.id ? '<span class="winner">' + playerLinkHTML(a) + '</span>' : playerLinkHTML(a)) +
          ' def. ' +
          (m.winnerId === b.id ? '<span class="winner">' + playerLinkHTML(b) + '</span>' : playerLinkHTML(b))
        }),
        el("span", {html: renderScoreboardHTML(m)}),
        el("span", {class:"match-tourney"}, [t ? (t.name + " '" + String(t.year).slice(-2)) : "—"])
      ]));
    });
  }
}

/* ---------------- Modals: add player / bulk add / add tournament ---------------- */
function openAddPlayer(){ $("#add-player-backdrop").classList.remove("hidden"); $("#ap-name").focus(); updateFlagPreview(); }
function closeAddPlayer(){ $("#add-player-backdrop").classList.add("hidden"); $("#add-player-form").reset(); updateFlagPreview(); }
function updateFlagPreview(){
  const code = $("#ap-country").value;
  const flag = flagImgHTML(code);
  $("#ap-flag-preview").innerHTML = flag ? flag + " " + escapeHtml(code.toUpperCase()) : (code ? "No flag found for that code" : "");
}

function openBulkAdd(){ $("#bulk-add-backdrop").classList.remove("hidden"); $("#ba-textarea").focus(); }
function closeBulkAdd(){ $("#bulk-add-backdrop").classList.add("hidden"); $("#ba-textarea").value = ""; $("#ba-msg").textContent = ""; }

function handleBulkAdd(ev){
  ev.preventDefault();
  const raw = $("#ba-textarea").value;
  const msg = $("#ba-msg");
  const lines = raw.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  if(lines.length === 0){
    msg.textContent = "Paste at least one player first.";
    msg.className = "form-msg";
    return;
  }

  const existingNames = new Set(state.players.map(p => p.name.trim().toLowerCase()));
  let added = 0, skippedDup = 0;

  lines.forEach(line => {
    const parts = line.split(",");
    const name = parts[0].trim();
    const country = parts.length > 1 ? parts[1].trim().toUpperCase().slice(0,3) : "";
    if(!name) return;
    const key = name.toLowerCase();
    if(existingNames.has(key)){ skippedDup++; return; }
    existingNames.add(key);
    state.players.push({id: uid("p"), name, country, hand: "R", createdAt: Date.now()});
    added++;
  });

  if(added > 0) saveState();

  let text = added === 1 ? "Added 1 player." : "Added " + added + " players.";
  if(skippedDup > 0) text += " Skipped " + skippedDup + " already on the roster.";
  msg.textContent = text;
  msg.className = "form-msg ok";
  $("#ba-textarea").value = "";

  renderPlayers();
  renderRankings();
}

function openAddTournament(){ $("#add-tournament-backdrop").classList.remove("hidden"); $("#at-name").focus(); }
function closeAddTournament(){ $("#add-tournament-backdrop").classList.add("hidden"); $("#add-tournament-form").reset(); }

function handleAddPlayer(ev){
  ev.preventDefault();
  const name = $("#ap-name").value.trim();
  if(!name) return;
  const country = $("#ap-country").value.trim().toUpperCase();
  const hand = $("#ap-hand").value;
  const turnedPro = $("#ap-turnedpro").value ? Number($("#ap-turnedpro").value) : null;
  const height = $("#ap-height").value ? Number($("#ap-height").value) : null;
  state.players.push({id: uid("p"), name, country, hand, turnedPro, height, createdAt: Date.now()});
  saveState();
  closeAddPlayer();
  renderPlayers();
  renderRankings();
}

function openEditPlayer(id){
  const p = playerById(id);
  if(!p) return;
  $("#ep-id").value = p.id;
  $("#ep-name").value = p.name;
  $("#ep-country").value = p.country || "";
  $("#ep-hand").value = p.hand || "R";
  $("#ep-turnedpro").value = p.turnedPro || "";
  $("#ep-height").value = p.height || "";
  updateEditFlagPreview();
  $("#edit-player-backdrop").classList.remove("hidden");
}
function closeEditPlayer(){
  $("#edit-player-backdrop").classList.add("hidden");
}
function updateEditFlagPreview(){
  const code = $("#ep-country").value;
  const flag = flagImgHTML(code);
  $("#ep-flag-preview").innerHTML = flag ? flag + " " + escapeHtml(code.toUpperCase()) : (code ? "No flag found for that code" : "");
}
function handleEditPlayer(ev){
  ev.preventDefault();
  const id = $("#ep-id").value;
  const p = playerById(id);
  if(!p) return;
  const name = $("#ep-name").value.trim();
  if(!name) return;
  p.name = name;
  p.country = $("#ep-country").value.trim().toUpperCase();
  p.hand = $("#ep-hand").value;
  p.turnedPro = $("#ep-turnedpro").value ? Number($("#ep-turnedpro").value) : null;
  p.height = $("#ep-height").value ? Number($("#ep-height").value) : null;
  saveState();
  closeEditPlayer();
  renderPlayers();
  renderRankings();
  if(!$("#player-modal-backdrop").classList.contains("hidden")){
    renderPlayerProfile(id);
  }
  if(currentBracketTournamentId){
    renderBracketPage();
  }
}

function openAddByeWeek(){ $("#add-byeweek-backdrop").classList.remove("hidden"); $("#bw-date").focus(); }
function closeAddByeWeek(){ $("#add-byeweek-backdrop").classList.add("hidden"); $("#add-byeweek-form").reset(); }
function handleAddByeWeek(ev){
  ev.preventDefault();
  const date = $("#bw-date").value;
  if(!date) return;
  const note = $("#bw-note").value.trim();
  if(!state.byeWeeks) state.byeWeeks = [];
  state.byeWeeks.push({id: uid("bw"), date, note, createdAt: Date.now()});
  saveState();
  closeAddByeWeek();
  renderTournaments();
}
function handleDeleteByeWeek(id){
  if(!confirm("Delete this bye week?")) return;
  state.byeWeeks = (state.byeWeeks || []).filter(bw => bw.id !== id);
  saveState();
  renderTournaments();
}

function handleAddTournament(ev){
  ev.preventDefault();
  const name = $("#at-name").value.trim();
  const startDate = $("#at-date").value;
  if(!name || !startDate) return;
  const location = $("#at-location").value.trim();
  const year = new Date(startDate + "T00:00:00").getFullYear();
  const level = $("#at-level").value;
  const surface = $("#at-surface").value;
  const drawSize = Number($("#at-drawsize").value) || 32;
  const qualEnabled = $("#at-qual-enabled").checked;
  const qualNum = Number($("#at-qual-numqualifiers").value) || 8;
  const qualRounds = Number($("#at-qual-numrounds").value) || 2;
  state.tournaments.push({
    id: uid("t"), name, location, level, surface, year, startDate, drawSize,
    bracketEntries: new Array(capacityOf(drawSize)).fill(0).map(() => ({type:"empty"})),
    seeds: new Array(numSeedsFor(drawSize)).fill(null),
    unseededEntrants: [],
    qualifying: {
      enabled: qualEnabled,
      numQualifiers: qualNum,
      numRounds: qualRounds,
      entrants: [],
      bracketEntries: new Array(qualNum * Math.pow(2, qualRounds)).fill(0).map(() => ({type:"empty"}))
    },
    createdAt: Date.now()
  });
  saveState();
  closeAddTournament();
  renderTournaments();
}

function openEditTournament(id){
  const t = tournamentById(id);
  if(!t) return;
  $("#et-id").value = t.id;
  $("#et-name").value = t.name;
  $("#et-location").value = t.location || "";
  $("#et-level").value = t.level;
  $("#et-surface").value = t.surface;
  $("#et-date").value = t.startDate || "";
  $("#edit-tournament-backdrop").classList.remove("hidden");
}
function closeEditTournament(){
  $("#edit-tournament-backdrop").classList.add("hidden");
}
function handleEditTournament(ev){
  ev.preventDefault();
  const id = $("#et-id").value;
  const t = tournamentById(id);
  if(!t) return;
  const name = $("#et-name").value.trim();
  const startDate = $("#et-date").value;
  if(!name || !startDate) return;
  t.name = name;
  t.location = $("#et-location").value.trim();
  t.level = $("#et-level").value;
  t.surface = $("#et-surface").value;
  t.startDate = startDate;
  t.year = new Date(startDate + "T00:00:00").getFullYear();
  saveState();
  closeEditTournament();
  renderTournaments();
  renderRankings();
  if(currentBracketTournamentId === id) renderBracketPage();
}

function handleDeleteTournament(id){
  const t = tournamentById(id);
  if(!t) return;
  const matchCount = matchesForTournament(id).length;
  const warning = matchCount > 0
    ? "Delete \"" + t.name + "\"? This also removes its " + matchCount + " recorded result" + (matchCount===1?"":"s") + ". This can't be undone."
    : "Delete \"" + t.name + "\"? This can't be undone.";
  if(!confirm(warning)) return;
  state.tournaments = state.tournaments.filter(x => x.id !== id);
  state.matches = state.matches.filter(m => m.tournamentId !== id);
  saveState();
  if(currentBracketTournamentId === id) closeBracket();
  renderTournaments();
  renderRankings();
}

/* ---------------- Tab / view switching ---------------- */
function switchView(view){
  $all(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === view));
  $all(".view").forEach(v => v.classList.toggle("hidden", v.id !== "view-" + view));
  if(view === "rankings") renderRankings();
  if(view === "players") renderPlayers();
  if(view === "tournaments") renderTournaments();
  if(view === "records") renderRecords();
  if(view === "slams"){ renderGrandSlamHistory(); renderGrandSlamBreakdown(); }
  if(view === "h2h") renderHeadToHead();
}

/* ---------------- Backup: export / import ---------------- */
function handleExportData(){
  const payload = {
    app: "fortnight-watp-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: state
  };
  const dataStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([dataStr], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateStamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = "fortnight-watp-backup-" + dateStamp + ".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function handleImportFileSelected(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    let parsed;
    try{
      parsed = JSON.parse(ev.target.result);
    }catch(err){
      alert("Couldn't read that file — make sure it's a valid JSON backup exported from this app.");
      e.target.value = "";
      return;
    }
    // Accept either the wrapped export format or a raw {players,tournaments,matches} object.
    const payload = (parsed && parsed.data && typeof parsed.data === "object") ? parsed.data : parsed;
    if(!payload || !Array.isArray(payload.players) || !Array.isArray(payload.tournaments) || !Array.isArray(payload.matches)){
      alert("That doesn't look like a valid Fortnight backup file.");
      e.target.value = "";
      return;
    }
    const summary = payload.players.length + " players, " + payload.tournaments.length +
      " tournaments, and " + payload.matches.length + " results";
    if(!confirm("Import this backup (" + summary + ")? This replaces everything currently in your browser. This can't be undone.")){
      e.target.value = "";
      return;
    }
    state = {
      players: payload.players,
      tournaments: payload.tournaments,
      matches: payload.matches
    };
    saveState();
    location.reload();
  };
  reader.readAsText(file);
}

/* ---------------- Wire up events ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  $all(".tab").forEach(tab => tab.addEventListener("click", () => switchView(tab.dataset.view)));

  $("#rankings-year").addEventListener("change", renderRankings);

  $("#open-add-player").addEventListener("click", openAddPlayer);
  $("#ap-cancel").addEventListener("click", closeAddPlayer);
  $("#add-player-form").addEventListener("submit", handleAddPlayer);
  $("#add-player-backdrop").addEventListener("click", (e) => { if(e.target.id === "add-player-backdrop") closeAddPlayer(); });
  $("#ap-country").addEventListener("input", updateFlagPreview);

  $("#ep-cancel").addEventListener("click", closeEditPlayer);
  $("#edit-player-form").addEventListener("submit", handleEditPlayer);
  $("#edit-player-backdrop").addEventListener("click", (e) => { if(e.target.id === "edit-player-backdrop") closeEditPlayer(); });
  $("#ep-country").addEventListener("input", updateEditFlagPreview);

  $("#open-bulk-add").addEventListener("click", openBulkAdd);
  $("#ba-cancel").addEventListener("click", closeBulkAdd);
  $("#bulk-add-form").addEventListener("submit", handleBulkAdd);
  $("#bulk-add-backdrop").addEventListener("click", (e) => { if(e.target.id === "bulk-add-backdrop") closeBulkAdd(); });

  $("#open-add-tournament").addEventListener("click", openAddTournament);
  $("#at-cancel").addEventListener("click", closeAddTournament);
  $("#add-tournament-form").addEventListener("submit", handleAddTournament);
  $("#add-tournament-backdrop").addEventListener("click", (e) => { if(e.target.id === "add-tournament-backdrop") closeAddTournament(); });
  $("#at-qual-enabled").addEventListener("change", (e) => {
    $("#at-qual-fields").classList.toggle("hidden", !e.target.checked);
  });

  $("#open-add-bye-week").addEventListener("click", openAddByeWeek);
  $("#bw-cancel").addEventListener("click", closeAddByeWeek);
  $("#add-byeweek-form").addEventListener("submit", handleAddByeWeek);
  $("#add-byeweek-backdrop").addEventListener("click", (e) => { if(e.target.id === "add-byeweek-backdrop") closeAddByeWeek(); });

  $("#et-cancel").addEventListener("click", closeEditTournament);
  $("#edit-tournament-form").addEventListener("submit", handleEditTournament);
  $("#edit-tournament-backdrop").addEventListener("click", (e) => { if(e.target.id === "edit-tournament-backdrop") closeEditTournament(); });

  $("#bracket-back").addEventListener("click", closeBracket);
  $("#bracket-subnav").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-bracket-tab]");
    if(!btn || btn.classList.contains("hidden")) return;
    switchBracketSubTab(btn.dataset.bracketTab);
  });
  $("#bracket-toggle-seed").addEventListener("click", () => $("#bracket-seed-grid").classList.toggle("hidden"));
  $("#bracket-seed-grid").addEventListener("change", handleSeedSelectChange);
  $("#bracket-seeds-list").addEventListener("input", handleSeedSearchInput);
  $("#bracket-seeds-list").addEventListener("click", handleSeedsListClick);
  $("#bracket-unseeded-list").addEventListener("input", handleEntrantSearchInput);
  $("#bracket-unseeded-list").addEventListener("click", handleUnseededListClick);
  $("#bracket-generate-draw").addEventListener("click", handleGenerateDraw);

  $("#qual-enabled").addEventListener("change", handleQualConfigChange);
  $("#qual-numqualifiers").addEventListener("change", handleQualConfigChange);
  $("#qual-numrounds").addEventListener("change", handleQualConfigChange);
  $("#qual-entrants-list").addEventListener("input", handleQualEntrantSearchInput);
  $("#qual-entrants-list").addEventListener("click", handleQualEntrantsListClick);
  $("#qual-generate-draw").addEventListener("click", handleGenerateQualifyingDraw);
  $("#qual-add-to-main").addEventListener("click", handleAddQualifiersToMain);

  $("#bracket-autofill-main").addEventListener("click", handleAutofillMain);
  $("#bracket-autofill-qual").addEventListener("click", handleAutofillQual);
  $("#entry-list-body").addEventListener("input", handleEntryListSearchInput);
  $("#entry-list-body").addEventListener("click", handleEntryListClick);
  $("#entry-list-process").addEventListener("click", handleProcessEntryList);

  document.addEventListener("click", (e) => {
    if(!e.target.closest(".picker-wrap")){
      $all(".picker-suggestions").forEach(s => s.classList.add("hidden"));
    }
  });

  $("#rankings-search").addEventListener("input", renderRankings);
  $("#rankings-mode-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-rankings-mode]");
    if(!btn) return;
    rankingsMode = btn.dataset.rankingsMode;
    renderRankings();
  });

  $("#view-h2h").addEventListener("input", handleH2HSearchInput);
  $("#view-h2h").addEventListener("click", handleH2HClick);
  $("#slam-metric-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-slam-metric]");
    if(!btn) return;
    slamMetric = btn.dataset.slamMetric;
    renderGrandSlamBreakdown();
  });

  $("#player-modal-backdrop").addEventListener("click", (e) => { if(e.target.id === "player-modal-backdrop") closePlayerModal(); });

  document.addEventListener("click", (e) => {
    const toggleBtn = e.target.closest("[data-toggle-breakdown]");
    if(toggleBtn){
      const pid = toggleBtn.dataset.toggleBreakdown;
      expandedRankingRow = expandedRankingRow === pid ? null : pid;
      renderRankings();
      return;
    }
    const editBtn = e.target.closest("[data-edit-player]");
    if(editBtn){ openEditPlayer(editBtn.dataset.editPlayer); return; }
    const openBtn = e.target.closest("[data-open-player]");
    if(openBtn){ renderPlayerProfile(openBtn.dataset.openPlayer); return; }
    const bracketBtn = e.target.closest("[data-open-bracket]");
    if(bracketBtn){ openBracket(bracketBtn.dataset.openBracket); return; }
    const editTBtn = e.target.closest("[data-edit-tournament]");
    if(editTBtn){ openEditTournament(editTBtn.dataset.editTournament); return; }
    const delTBtn = e.target.closest("[data-delete-tournament]");
    if(delTBtn){ handleDeleteTournament(delTBtn.dataset.deleteTournament); return; }
    const delBwBtn = e.target.closest("[data-delete-byeweek]");
    if(delBwBtn){ handleDeleteByeWeek(delBwBtn.dataset.deleteByeweek); return; }
  });

  $("#export-data").addEventListener("click", handleExportData);
  $("#import-data-trigger").addEventListener("click", () => $("#import-data-input").click());
  $("#import-data-input").addEventListener("change", handleImportFileSelected);

  $("#reset-all-data").addEventListener("click", () => {
    const summary = state.players.length + " players, " + state.tournaments.length +
      " tournaments, and " + state.matches.length + " results";
    if(confirm("This permanently deletes everything — " + summary + ". This can't be undone. Continue?")){
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    }
  });

  renderRankings();
});

})();
