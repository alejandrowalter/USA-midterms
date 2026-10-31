/* Midterms EE.UU. 2026. Precios de Polymarket y escrutinio del NYT/AP.
   Nada de cifras inventadas: si no hay votos, se dice. */
"use strict";
const Q = new URLSearchParams(location.search);
const SOURCES = {
  nyt: {
    senate: "https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-senate.json",
    house: "https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-house.json",
    governor: "https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-governor.json"
  },
  clob: "https://clob.polymarket.com/midpoints"
};
const NIGHT_START = Date.parse("2026-11-03T16:00:00-05:00");
const NIGHT_END = Date.parse("2026-11-06T12:00:00-05:00");
const POLLS = Date.parse("2026-11-03T18:00:00-05:00");
const AT_LARGE = new Set(["AK", "DE", "ND", "SD", "VT", "WY"]);
const ST = {
  AL:"Alabama", AK:"Alaska", AZ:"Arizona", AR:"Arkansas", CA:"California", CO:"Colorado",
  CT:"Connecticut", DE:"Delaware", FL:"Florida", GA:"Georgia", HI:"Hawái", ID:"Idaho",
  IL:"Illinois", IN:"Indiana", IA:"Iowa", KS:"Kansas", KY:"Kentucky", LA:"Luisiana",
  ME:"Maine", MD:"Maryland", MA:"Massachusetts", MI:"Míchigan", MN:"Minnesota", MS:"Misisipi",
  MO:"Misuri", MT:"Montana", NE:"Nebraska", NV:"Nevada", NH:"Nuevo Hampshire", NJ:"Nueva Jersey",
  NM:"Nuevo México", NY:"Nueva York", NC:"Carolina del Norte", ND:"Dakota del Norte", OH:"Ohio",
  OK:"Oklahoma", OR:"Oregón", PA:"Pensilvania", RI:"Rhode Island", SC:"Carolina del Sur",
  SD:"Dakota del Sur", TN:"Tennessee", TX:"Texas", UT:"Utah", VT:"Vermont", VA:"Virginia",
  WA:"Washington", WV:"Virginia Occidental", WI:"Wisconsin", WY:"Wyoming"
};
const RATING = {
  tossup:"Empate", "lean-dem":"Inclina dem.", "lean-rep":"Inclina rep.",
  "likely-dem":"Probable dem.", "likely-rep":"Probable rep.",
  "solid-dem":"Sólido dem.", "solid-rep":"Sólido rep."
};
const RATING_ORDER = ["tossup", "lean-dem", "lean-rep", "likely-dem", "likely-rep", "solid-dem", "solid-rep"];
const PARTY_ES = {D:"Demócratas", R:"Republicanos", I:"Independiente", O:"Otro"};
const COL = {D:"#0A47C2", R:"#D0122D", I:"#0E8A3D", O:"#5c6778"};

const VIEW_FROM = {senado:"senate", senate:"senate", camara:"house", cámara:"house", house:"house", gob:"gov", gobernadores:"gov", gov:"gov", batallas:"battles", battles:"battles", clave:"battles"};
const S = {
  page: null, results: null,
  oddsVia: "", resultsVia: "",
  view: VIEW_FROM[(Q.get("v") || "").toLowerCase()] || "senate",
  sel: {senate:null, house:null, gov:null},
  listMode: {senate:"play", house:"battle", gov:"close"},
  houseAll: false, q: "",
  prev: {}, userPicked: false
};
const SOLID = {D:"#0A47C2", R:"#D0122D", I:"#0E8A3D", O:"#5c6778"};
const LEAN = {D:"#3B6FE8", R:"#F03A3A", I:"#1FA85A", O:"#8b95a7"};
const TOSS = {D:"#8FB4F8", R:"#F7A3A3", I:"#8ED9A8", O:"#c5cad3"};
const TINY = ["VT","NH","MA","RI","CT","NJ","DE","MD"];

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const fmtP = (n, d=1) => (n == null || Number.isNaN(n)) ? "–" : Number(n).toLocaleString("es-CO", {minimumFractionDigits:d, maximumFractionDigits:d}) + "%";
const fmtN = n => (n == null) ? "–" : Math.round(n).toLocaleString("es-CO");
function money(n){
  if (n == null) return "–";
  if (n >= 1e9) return "US$ " + (n/1e9).toLocaleString("es-CO", {maximumFractionDigits:1}) + " mil M";
  if (n >= 1e6) return "US$ " + (n/1e6).toLocaleString("es-CO", {maximumFractionDigits:1}) + " M";
  if (n >= 1e3) return "US$ " + (n/1e3).toLocaleString("es-CO", {maximumFractionDigits:0}) + " mil";
  return "US$ " + Math.round(n).toLocaleString("es-CO");
}
function bogota(input){
  if (!input) return "–";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return esc(input) + " (Bogotá)";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone:"America/Bogota", day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit", hour12:false
  }).format(d) + " (Bogotá)";
}
function nightMode(){
  if (Q.get("live") === "1") return true;
  if (Q.get("live") === "0") return false;
  const t = Date.now();
  return t >= NIGHT_START && t <= NIGHT_END;
}
function countdown(){
  const ms = POLLS - Date.now();
  const el = document.getElementById("when");
  if (ms > 0){
    const d = Math.floor(ms/86400000);
    const h = Math.floor((ms%86400000)/3600000);
    const m = Math.floor((ms%3600000)/60000);
    el.className = "pill wait";
    el.textContent = d >= 1 ? `Faltan ${d} d ${h} h` : `Faltan ${h} h ${m} min`;
  } else if (Date.now() < NIGHT_END){
    el.className = "pill live";
    el.textContent = "Noche electoral";
  } else {
    el.className = "pill";
    el.textContent = "3 nov 2026";
  }
}

function normName(s){
  return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/\(write-in\)/g,"").replace(/[^a-z\s]/g," ").replace(/\s+/g," ").trim();
}
function nameParts(s){
  return normName(s).split(" ").filter(w => w && !["jr","sr","ii","iii","iv","sen","rep","gov"].includes(w));
}
function isPartyLabel(name){
  const n = normName(name);
  return ["democratic party","republican party","democratas","republicanos","democrat","republican","democrata"].includes(n);
}
function isWriteIn(name){ return /write-in|write ins|^total write/i.test(name||""); }
function matchCand(name, list, used){
  const parts = nameParts(name);
  if (parts.length < 2) return null;
  const first = parts[0], last = parts[parts.length-1];
  const pool = list.filter(c => !used.has(c.id) && !isWriteIn(c.name));
  const exact = pool.filter(c => normName(c.name) === normName(name));
  if (exact.length === 1) return exact[0];
  const hits = pool.filter(c => {
    const p = nameParts(c.name);
    if (p.length < 2 || p[p.length-1] !== last) return false;
    const f = p[0];
    return f === first || f.startsWith(first) || first.startsWith(f);
  });
  return hits.length === 1 ? hits[0] : null;
}

/* ----- NYT: el mismo recorte que scripts/nyt_results.py ----- */
function partyCode(id){ return id === "DEM" ? "D" : (id === "GOP" || id === "REP") ? "R" : "O"; }
function houseCode(race){
  const parts = (race.nyt_id||"").split("-");
  const st = parts[0];
  if (!st || st === "US") return null;
  let dist = null;
  const i = parts.indexOf("H");
  if (i >= 0 && parts[i+1] && /^\d+$/.test(parts[i+1])) dist = parseInt(parts[i+1], 10);
  if (dist == null && /^\d+$/.test(String(race.seat_number||""))) dist = parseInt(race.seat_number, 10);
  if (dist == null) return null;
  if (AT_LARGE.has(st)) return st + "-AL";
  return st + "-" + String(dist).padStart(2, "0");
}
function assignKeys(races, office){
  const out = [];
  if (office === "house"){
    for (const race of races){
      const code = houseCode(race);
      if (code) out.push(["house:"+code, race]);
    }
    return out;
  }
  const prefix = office === "senate" ? "senate" : "gov";
  const by = {};
  for (const race of races){
    const st = (race.nyt_id||"").split("-")[0];
    if (!st || st === "US") continue;
    (by[st] ||= []).push(race);
  }
  for (const [st, group] of Object.entries(by)){
    if (group.length === 1){ out.push([prefix+":"+st, group[0]]); continue; }
    for (const race of group){
      const special = (race.nyt_id||"").includes("S_W");
      let key = prefix+":"+st+(special?":special":"");
      if (out.some(([k]) => k === key)) key += ":"+(race.seat_number||"x");
      out.push([key, race]);
    }
  }
  return out;
}
function candName(m){
  return [m.first_name, m.last_name].filter(Boolean).join(" ").trim() || m.nyt_id || "";
}
function slimRace(key, race){
  const meta = race.candidate_metadata || {};
  const top = race.top_reporting_unit || {};
  const votes = {}, leaders = new Set();
  for (const c of top.candidates || []){
    votes[c.nyt_id] = (c.votes && typeof c.votes.total === "number") ? c.votes.total : 0;
    if (c.leader) leaders.add(c.nyt_id);
  }
  const total = top.total_votes || 0;
  const outcome = race.outcome || {};
  const won = new Set(outcome.won || []);
  const runoff = new Set(outcome.advanced_to_runoff || []);
  const candidates = [];
  for (const [cid, m] of Object.entries(meta)){
    const name = candName(m);
    const v = votes[cid] || 0;
    if (isWriteIn(name) && v <= 0 && !won.has(cid)) continue;
    candidates.push({
      id: cid, name, party: partyCode(m.party && m.party.nyt_id),
      incumbent: !!m.incumbent, votes: v, leader: leaders.has(cid),
      winner: won.has(cid), runoff: runoff.has(cid)
    });
  }
  candidates.sort((a,b) => b.votes - a.votes || a.name.localeCompare(b.name));
  const eevp = typeof top.eevp === "number" ? top.eevp : 0;
  const winner = candidates.find(c => c.winner);
  const call = race.race_call_status;
  let status = "sin_votos";
  if (winner) status = "llamado";
  else if (["projected","apparent","likely_projected","winner_projected"].includes(call)) status = "proyectado";
  else if (runoff.size) status = "segunda_vuelta";
  else if (total > 0 || eevp > 0) status = "contando";
  return {
    key, nyt_id: race.nyt_id, rating: race.general_rating || race.rating || null,
    call_status: call, status, certified: !!race.certified, eevp,
    total_votes: total, expected_votes: top.total_expected_vote || 0,
    precincts_reporting: top.precincts_reporting || 0, precincts_total: top.precincts_total || 0,
    updated_at: race.updated_at || top.provider_updated_at || null,
    winner: winner ? winner.name : null, winner_party: winner ? winner.party : null,
    called_by: outcome.called_by || [], candidates
  };
}
function slimControl(payload, officeId){
  const results = payload.partyControlData && payload.partyControlData.results || [];
  const office = results[0] && results[0].offices && results[0].offices[officeId];
  if (!office) return null;
  const bal = office.party_balance || {};
  const seats = {}, not_up = {};
  for (const [src, dst] of [["DEM","D"],["GOP","R"],["OTH","O"]]){
    const b = bal[src] || {};
    seats[dst] = b.seats || 0;
    not_up[dst] = b.no_election || 0;
  }
  const beforeRaw = office.current_control || {};
  const to = office.to_win || {};
  let winner = null;
  for (const [src, dst] of [["DEM","D"],["GOP","R"],["OTH","O"]]){
    if (bal[src] && bal[src].winner) winner = dst;
  }
  return {
    total: office.total || 0, open_seats: office.open_seats || 0,
    not_on_ballot: office.no_election_seats || 0, called: office.num_races_called || 0,
    reporting: !!office.is_reporting,
    to_win: {D: to.DEM||0, R: to.GOP||0, O: to.OTH||0},
    seats, not_up,
    before: {D: beforeRaw.DEM||0, R: beforeRaw.GOP||0, O: beforeRaw.OTH||0},
    winner,
    updated_at: payload.resultsMeta && payload.resultsMeta.resultsUpdatedAt || null
  };
}
function houseByState(races){
  const tally = {};
  for (const [key, race] of Object.entries(races)){
    if (!key.startsWith("house:")) continue;
    const st = key.slice(6, 8);
    const rating = race.rating || "none";
    tally[st] ||= {};
    tally[st][rating] = (tally[st][rating] || 0) + 1;
  }
  return tally;
}
function slimPayload(payload, office){
  const id = {senate:"S", house:"H", governor:"G"}[office];
  const races = {};
  for (const [key, race] of assignKeys(payload.races || [], office)) races[key] = slimRace(key, race);
  return {control: slimControl(payload, id), races};
}
function mergeNyt(sen, hou, gov, via){
  const races = Object.assign({}, sen.races, gov.races, hou.races);
  S.results = {
    ok: true, source: "The New York Times (The Associated Press)",
    fetched_at_iso: new Date().toISOString(),
    senate: sen.control, house: hou.control, races,
    house_by_state: houseByState(hou.races)
  };
  S.resultsVia = via;
}

async function fetchJSON(url, ms){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {cache:"no-store", signal: ctrl.signal});
    if (!r.ok) throw new Error(r.status + " " + url);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function loadSnapshotResults(){
  const j = await fetchJSON("data/results.json?t=" + Date.now(), 8000);
  if (!j || !j.ok) throw new Error("results.json sin datos");
  S.results = j;
  S.resultsVia = "copia en GitHub";
}

async function loadDirectResults(){
  const [sen, hou, gov] = await Promise.all([
    fetchJSON(SOURCES.nyt.senate, 12000),
    fetchJSON(SOURCES.nyt.house, 20000),
    fetchJSON(SOURCES.nyt.governor, 12000)
  ]);
  const s = slimPayload(sen, "senate"), h = slimPayload(hou, "house"), g = slimPayload(gov, "governor");
  if (Object.keys(s.races).length < 30 || Object.keys(h.races).length < 400) {
    throw new Error("feed NYT incompleto");
  }
  mergeNyt(s, h, g, "NYT directo");
}

function collectTokens(page){
  const ids = [];
  const push = (list) => { for (const c of list || []) if (c.token) ids.push(c.token); };
  for (const block of Object.values(page.control || {})) if (block) push(block.outcomes);
  for (const race of page.senate || []) push(race.candidates);
  for (const race of page.governor || []) push(race.candidates);
  for (const race of page.house || []) if (passes(race, "comp")) push(race.candidates);
  return [...new Set(ids)];
}
function applyMids(page, mids){
  const price = (c) => {
    if (!c.token || mids[c.token] == null || mids[c.token] === "") return;
    const n = parseFloat(mids[c.token]);
    if (!Number.isNaN(n)) c.price = Math.round(n * 10000) / 10000;
  };
  for (const block of Object.values(page.control || {})) if (block) for (const o of block.outcomes || []) price(o);
  for (const group of ["senate","governor","house"]) for (const race of page[group] || []) for (const c of race.candidates || []) price(c);
}
async function refreshMids(){
  if (!S.page) return;
  const before = capturePrices();
  const ids = collectTokens(S.page);
  const mids = {};
  for (let i = 0; i < ids.length; i += 80){
    const chunk = ids.slice(i, i+80);
    try {
      const r = await fetchJSON_post(SOURCES.clob, chunk.map(token_id => ({token_id})), 8000);
      if (r && typeof r === "object" && !r.error) Object.assign(mids, r);
    } catch (e) { /* el siguiente lote puede funcionar */ }
  }
  if (Object.keys(mids).length < 2) throw new Error("sin midpoints");
  applyMids(S.page, mids);
  S.prev = before;
  S.oddsLiveAt = new Date().toISOString();
  S.oddsVia = "libro de órdenes en vivo";
}
async function fetchJSON_post(url, body, ms){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      method:"POST", cache:"no-store", signal: ctrl.signal,
      headers:{"Content-Type":"application/json"}, body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

function gapOf(cands){
  const ps = (cands||[]).map(c => c.price).filter(p => p != null).sort((a,b)=>b-a);
  return ps.length >= 2 ? ps[0]-ps[1] : 1;
}
function isBattle(rt){ return rt === "tossup" || (rt||"").startsWith("lean-"); }
function isComp(rt){ return isBattle(rt) || (rt||"").startsWith("likely-"); }
function raceRating(key){ return S.results && S.results.races && S.results.races[key] && S.results.races[key].rating; }

function passes(race, mode){
  const rt = raceRating(race.key);
  const gap = gapOf(race.candidates);
  if (mode === "all") return true;
  if (mode === "play") return isComp(rt) || gap <= 0.22;
  if (mode === "close") return isComp(rt) || gap <= 0.40;
  if (mode === "battle") return isBattle(rt) || gap <= 0.12;
  if (mode === "comp") return isComp(rt) || gap <= 0.22;
  return true;
}
function sortRaces(list){
  return list.slice().sort((a,b) => {
    const ra = RATING_ORDER.indexOf(raceRating(a.key));
    const rb = RATING_ORDER.indexOf(raceRating(b.key));
    const ia = ra < 0 ? 40 : ra, ib = rb < 0 ? 40 : rb;
    if (ia !== ib) return ia - ib;
    return gapOf(a.candidates) - gapOf(b.candidates);
  });
}

function deltaHTML(key, price){
  const prev = S.prev[key];
  if (prev == null || price == null) return "";
  const d = (price - prev) * 100;
  if (Math.abs(d) < 0.05) return "";
  const cls = d > 0 ? "up" : "dn";
  return ` <span class="${cls}">${d>0?"▲":"▼"}${fmtP(Math.abs(d), 1)}</span>`;
}
function capturePrices(){
  const next = {};
  for (const [k, block] of Object.entries(S.page && S.page.control || {})){
    for (const o of (block && block.outcomes) || []) next[k+"|"+o.label] = o.price;
  }
  return next;
}

function partyOfLabel(o){
  if (o.party === "D" || o.party === "R" || o.party === "I") return o.party;
  const n = (o.label_en || o.label || "").toLowerCase();
  if (n.includes("democrat")) return "D";
  if (n.includes("republican")) return "R";
  return "O";
}
function seatSort(label){
  const m = String(label).replace("≤","0").match(/\d+/);
  return m ? parseInt(m[0], 10) : 999;
}
function beforeOk(ctrl){
  if (!ctrl || !ctrl.before || !ctrl.total) return false;
  const s = ctrl.before.D + ctrl.before.R + ctrl.before.O;
  return s > 0 && s <= ctrl.total && (ctrl.total - s) <= 5;
}
function seatBar(ctrl){
  if (!ctrl || !ctrl.total) return `<p class="empty">Conteo de escaños no disponible.</p>`;
  const d = ctrl.seats.D||0, r = ctrl.seats.R||0, o = ctrl.seats.O||0;
  const rest = ctrl.total - d - r - o;
  if (rest < 0) return `<p class="note">El desglose del NYT no suma ${ctrl.total} escaños (D ${d} · R ${r} · otros ${o}).</p>`;
  const w = n => (n / ctrl.total * 100);
  const mayoria = ctrl.to_win ? ` Mayoría: ${ctrl.to_win.R} rep. o ${ctrl.to_win.D} dem.` : "";
  const called = ctrl.called || 0;
  let caption = `Conteo NYT: <b>${d} dem.</b> · <b>${r} rep.</b>`;
  if (o) caption += ` · <b>${o} otros</b>`;
  caption += ` · ${rest} sin asignar · ${called} llamados de ${ctrl.open_seats || "–"} en juego.`;
  if (ctrl.not_on_ballot) caption += ` ${ctrl.not_up.D} dem. y ${ctrl.not_up.R} rep. no se renuevan y ya entran en la barra.`;
  caption += mayoria
  let before = "";
  if (called === 0 && beforeOk(ctrl)){
    const b = ctrl.before, gap = ctrl.total - (b.D+b.R+b.O);
    before = `<p class="note">Cámara saliente, según el mismo feed: R ${b.R} · D ${b.D}` + (b.O?` · I ${b.O}`:"") + (gap?` · ${gap} no figuran en el desglose`:"") + `. La barra de arriba es el conteo de esta elección, que todavía no asigna escaños.</p>`;
  }
  const win = ctrl.winner ? `<p class="note">El NYT marca control ${esc(PARTY_ES[ctrl.winner] || ctrl.winner)}.</p>` : "";
  return `<div class="seatbar" role="img" aria-label="Escaños demócratas ${d}, republicanos ${r}, sin asignar ${rest}">
      <i style="width:${w(d)}%;background:${COL.D}"></i>
      <i style="width:${w(r)}%;background:${COL.R}"></i>
      <i style="width:${w(o)}%;background:${COL.I}"></i>
      <i style="width:${w(Math.max(0,rest))}%;background:#d7dbe0"></i>
    </div>
    <p class="note">${caption}</p>${before}${win}`;
}
function niceLabel(s){
  return String(s || "").replace(/^Below\s+/i, "Menos de ").replace(/^Above\s+/i, "Más de ").replace(/\+$/, " o más");
}
function outcomesBars(list, keyPrefix){
  return (list||[]).map(o => {
    const p = partyOfLabel(o);
    const pct = o.price * 100;
    return `<div class="mrow"><span>${esc(niceLabel(o.label))}</span><span class="b"><span style="width:${Math.max(0,Math.min(100,pct))}%;background:${COL[p]}"></span></span><b>${fmtP(pct, 1)}${deltaHTML(keyPrefix+"|"+o.label, o.price)}</b></div>`;
  }).join("");
}
function nytOf(race){
  return race && S.results && S.results.races && S.results.races[race.key];
}
function racesOf(view){
  if (!S.page) return [];
  if (view === "house") return S.page.house || [];
  if (view === "gov") return S.page.governor || [];
  return S.page.senate || [];
}
function tone(party, mode){
  const table = mode === "lean" ? LEAN : mode === "toss" ? TOSS : SOLID;
  return table[party] || "#c5cad3";
}
function shadeOf(gap, rating){
  if (rating === "tossup" || gap < 0.08) return "toss";
  if ((rating || "").startsWith("lean") || gap < 0.18) return "lean";
  return "solid";
}
function leadingParty(race){
  const nyt = nytOf(race);
  if (nyt && nyt.status === "llamado" && nyt.winner_party) return nyt.winner_party;
  if (nyt && nyt.status !== "sin_votos"){
    const v = voteLeader(nyt);
    if (v && v.party && v.party !== "O") return v.party;
  }
  const p = pmLeader(race);
  return p && p.party !== "O" ? p.party : (p ? p.party : null);
}
function holderOf(race){
  if (!race || typeof HOLD === "undefined") return null;
  if ((race.office === "senate") || (race.key || "").startsWith("senate:")) return HOLD.senateUp[race.state] || null;
  if ((race.office === "governor") || (race.key || "").startsWith("gov:")) return HOLD.gov[race.state] || null;
  const nyt = nytOf(race);
  const inc = nyt && (nyt.candidates || []).find(c => c.incumbent && c.party && c.party !== "O");
  return inc ? inc.party : null;
}
function flipInfo(holder, lead){
  if (!holder || !lead || holder === "O" || lead === "O") return null;
  if (holder === lead) return {flip:false, text:"Se mantiene"};
  return {flip:true, text:`Cambio de partido ${holder}→${lead}`};
}
function flipTag(info){
  if (!info) return "";
  if (info.flip) return `<span class="flipb">↻ ${esc(info.text)}</span>`;
  return `<span class="tag t1">${esc(info.text)}</span>`;
}
function sideName(p){
  return p === "D" ? "demócrata" : p === "R" ? "republicano" : p === "I" ? "independiente" : "otro";
}
function noElectionFill(parties){
  const uniq = [...new Set(parties.filter(Boolean))];
  if (uniq.length === 1) return {fill:`url(#hatch${uniq[0]})`, text:`${uniq[0] === "D" ? "Dem." : uniq[0] === "R" ? "Rep." : "Ind."} sin elección`};
  return {fill:"url(#splitDR)", text:"Dividida, sin elección"};
}
function majorityParty(d, r){
  if (d > r) return "D";
  if (r > d) return "R";
  return null;
}
function pmLeader(race){
  const cs = ((race && race.candidates) || []).filter(c => c.price != null);
  return cs.length ? cs.slice().sort((a,b)=>b.price-a.price)[0] : null;
}
function voteLeader(nyt){
  if (!nyt || nyt.status === "sin_votos") return null;
  const cs = (nyt.candidates || []).filter(c => (c.votes || 0) > 0 || c.winner);
  if (!cs.length) return null;
  return cs.slice().sort((a,b) => (b.winner - a.winner) || ((b.votes||0) - (a.votes||0)))[0];
}
function paintState(view, st){
  if (view === "house") return paintHouse(st);
  const race = racesOf(view).find(r => r.state === st);
  const nyt = nytOf(race);
  const holder = view === "senate" ? (HOLD.senateUp[st] || null) : HOLD.gov[st];
  if (!race && !nyt){
    const held = view === "senate" ? noElectionFill(HOLD.senate[st] || []) : noElectionFill([HOLD.gov[st]]);
    return {fill:held.fill, off:false, flip:false, comp:false, text:held.text + " en 2026"};
  }
  const lead = leadingParty(race);
  const info = flipInfo(holder, lead);
  const called = nyt && nyt.status === "llamado";
  const mode = called ? "solid" : shadeOf(gapOf(race.candidates), nyt && nyt.rating);
  return {fill:tone(lead, mode), off:false, flip:!!(info && info.flip), comp:false, text: called ? "Llamado" : (mode === "toss" ? "Empate" : "Va adelante")};
}
function houseProjection(st){
  const races = racesOf("house").filter(r => r.state === st);
  let d = 0, r = 0, comp = 0;
  for (const race of races){
    const nyt = nytOf(race);
    if (passes(race, "battle")) comp++;
    const party = leadingParty(race);
    if (party === "D") d++;
    else if (party === "R") r++;
  }
  const anyVotes = races.some(r => { const n = nytOf(r); return n && n.status && n.status !== "sin_votos"; });
  return {d, r, comp, anyVotes, n: races.length};
}
function paintHouse(st){
  const cur = HOLD.house[st] || {d:0, r:0, i:0, v:0};
  const proj = houseProjection(st);
  const curParty = majorityParty(cur.d, cur.r);
  const useProj = proj.anyVotes || proj.n > 0;
  const d = useProj ? proj.d : cur.d;
  const r = useProj ? proj.r : cur.r;
  let party = majorityParty(d, r) || curParty;
  const margin = Math.abs(d - r);
  const mode = !useProj || margin >= 3 ? "solid" : margin === 0 ? "toss" : "lean";
  if (!party) return {fill:"url(#splitDR)", off:false, flip:false, comp:proj.comp > 0, text:"Delegación empatada"};
  const flip = !!(curParty && party && curParty !== party);
  return {fill:tone(party, mode), off:false, flip, comp:proj.comp > 0, text: flip ? `Mayoría ${party === "D" ? "demócrata" : "republicana"} · cambia` : `Mayoría ${party === "D" ? "demócrata" : "republicana"}`};
}
function controlHTML(view){
  if (view === "gov"){
    return `<section class="card"><h2>Gobernadores <span class="same">2026</span></h2><p class="note">${esc(flipSummary("gov"))}. El borde punteado marca un cambio de partido frente al gobernador actual.</p></section>`;
  }
  const blockKey = view === "house" ? "house" : "senate";
  const block = S.page.control && S.page.control[blockKey];
  const ctrl = S.results && S.results[blockKey];
  if (!block || !(block.outcomes || []).length) return `<section class="card"><h2>Control</h2><p class="empty">Mercado no disponible.</p></section>`;
  const main = block.outcomes.filter(o => partyOfLabel(o)==="D" || partyOfLabel(o)==="R").slice(0, 2);
  const cards = main.map(o => {
    const p = partyOfLabel(o);
    return `<div class="pmc"><div class="who">${esc(o.label)}</div><div class="pc" style="color:${COL[p]}">${fmtP(o.price*100,1)}${deltaHTML(blockKey+"|"+o.label, o.price)}</div></div>`;
  }).join("");
  const seatsKey = blockKey === "senate" ? "senate_seats" : "house_seats";
  const seats = S.page.control[seatsKey];
  const seatRows = ((seats && seats.outcomes) || []).slice().sort((a,b)=>seatSort(a.label)-seatSort(b.label)).filter(o => o.price >= 0.005);
  const title = view === "house" ? "Cámara" : "Senado";
  return `<section class="card"><h2>Control ${esc(title)} <a class="same" href="${esc(block.url)}" target="_blank" rel="noopener">Polymarket ↗</a></h2>
    <div class="pcards">${cards}</div>
    ${ctrl ? seatBar(ctrl) : `<p class="empty">Conteo de escaños no disponible todavía.</p>`}
    <p class="note">${esc(flipSummary(view))}. Volumen ${money(block.volume)} · ${esc(S.oddsVia || "copia")}</p>
    ${seatRows.length ? `<details class="extra"><summary>Cuántos escaños republicanos</summary>${outcomesBars(seatRows, seatsKey)}<p class="note">Polymarket · ${money(seats.volume)}</p></details>` : ""}
    </section>`;
}
function swatch(bg){ return `<i style="background:${bg}"></i>`; }
function legendHTML(view){
  const bits = [
    `<span>${swatch(SOLID.D)}Dem. firme</span>`,
    `<span>${swatch(LEAN.D)}Dem. inclina</span>`,
    `<span>${swatch(TOSS.D)}Dem. reñido</span>`,
    `<span>${swatch(SOLID.R)}Rep. firme</span>`,
    `<span>${swatch(LEAN.R)}Rep. inclina</span>`,
    `<span>${swatch(TOSS.R)}Rep. reñido</span>`,
    `<span><i style="background:#fff;border:2px dashed #111;box-sizing:border-box"></i>Cambio de partido</span>`
  ];
  if (view === "house") bits.push(`<span><i style="background:#fff;border:2px solid #111;box-sizing:border-box"></i>Hay distritos reñidos</span>`);
  else {
    bits.push(`<span>${swatch("repeating-linear-gradient(135deg,#9bb6e4 0 3px,#0A47C2 3px 6px)")}Dem. sin elección</span>`);
    bits.push(`<span>${swatch("repeating-linear-gradient(135deg,#f0b4bc 0 3px,#D0122D 3px 6px)")}Rep. sin elección</span>`);
    bits.push(`<span>${swatch("linear-gradient(90deg,#0A47C2 50%,#D0122D 50%)")}Dividida, sin elección</span>`);
  }
  return `<div class="legend">${bits.join("")}</div>`;
}
function flipSummary(view){
  let rd = 0, dr = 0, hold = 0;
  if (view === "house"){
    for (const st of Object.keys(HOLD.house)){
      const info = paintHouse(st);
      const cur = majorityParty(HOLD.house[st].d, HOLD.house[st].r);
      const proj = houseProjection(st);
      const next = majorityParty(proj.n ? proj.d : HOLD.house[st].d, proj.n ? proj.r : HOLD.house[st].r) || cur;
      if (!cur || !next) continue;
      if (cur === next) hold++;
      else if (cur === "R" && next === "D") rd++;
      else if (cur === "D" && next === "R") dr++;
    }
    return `Cambios de mayoría estatal: R→D ${rd} · D→R ${dr} · se mantiene ${hold}`;
  }
  const races = racesOf(view);
  for (const race of races){
    const info = flipInfo(holderOf(race), leadingParty(race));
    if (!info) continue;
    if (!info.flip) hold++;
    else if (info.text.includes("R→D")) rd++;
    else if (info.text.includes("D→R")) dr++;
  }
  const what = view === "gov" ? "gobernaciones" : "escaños";
  return `Cambios: R→D ${rd} · D→R ${dr} · se mantiene ${hold} ${what}`;
}
function tinyHTML(view){
  return `<div class="tiny" id="tiny">${TINY.map(st => {
    const on = S.sel[view] === st ? " on" : "";
    return `<button type="button" data-st="${st}" class="${on.trim()}">${st}</button>`;
  }).join("")}</div>`;
}
function detailHTML(view){
  const st = S.sel[view];
  if (!st) return `<div id="detail"><p class="empty">Toca un estado para ver la carrera, las probabilidades y el escrutinio.</p></div>`;
  const name = ST[st] || st;
  if (view === "house"){
    const all = racesOf("house").filter(r => r.state === st);
    let show = all.filter(r => passes(r, "comp"));
    const note = show.length ? `${show.length} distrito${show.length===1?"":"s"} competitivo${show.length===1?"":"s"}.` : "Los más ajustados del estado:";
    if (!show.length) show = sortRaces(all).slice(0, 3);
    else show = sortRaces(show);
    const info = paintHouse(st);
    const cur = HOLD.house[st] || {d:0,r:0,i:0,v:0};
    const proj = houseProjection(st);
    const total = cur.d + cur.r + cur.i + cur.v || proj.n || 1;
    const bar = `<div class="seatbar" aria-hidden="true"><i style="width:${cur.d/total*100}%;background:${COL.D}"></i><i style="width:${cur.r/total*100}%;background:${COL.R}"></i><i style="width:${(cur.i+cur.v)/total*100}%;background:#c5cad3"></i></div>`;
    const flip = info.flip ? `<span class="flipb">↻ Cambio de mayoría</span>` : `<span class="tag t1">Se mantiene la mayoría</span>`;
    return `<div id="detail"><h3>${esc(name)} ${flip}</h3>${bar}<p class="note">Ahora: ${cur.d} dem. · ${cur.r} rep.${cur.i?` · ${cur.i} ind.`:""}${cur.v?` · ${cur.v} vacante${cur.v>1?"s":""}`:""}. Proyección: ${proj.d} dem. · ${proj.r} rep. ${esc(note)}</p>${show.map(r => raceCard(r, nytOf(r), (r.district||"")+" · "+placeName(r), r.url)).join("") || `<p class="empty">No hay mercados de estos distritos.</p>`}</div>`;
  }
  const race = racesOf(view).find(r => r.state === st);
  const nyt = nytOf(race);
  if (!race && !nyt){
    if (view === "senate"){
      const pair = HOLD.senate[st] || [];
      return `<div id="detail"><h3>${esc(name)}</h3><p class="note">Sin elección en 2026. Senadores actuales: ${pair.map(sideName).join(" y ")}.</p></div>`;
    }
    return `<div id="detail"><h3>${esc(name)}</h3><p class="note">Sin elección en 2026. Gobernador actual: ${sideName(HOLD.gov[st])}.</p></div>`;
  }
  return `<div id="detail">${raceCard(race, nyt, name + (race && race.key.endsWith(":special") ? " · especial" : ""), race && race.url)}</div>`;
}
function listHTML(view){
  const mode = S.listMode[view];
  if (view === "house" && !S.houseAll){
    const by = (S.results && S.results.house_by_state) || {};
    const rows = Object.entries(by).map(([st, ratings]) => {
      const toss = ratings.tossup||0, lean = (ratings["lean-dem"]||0)+(ratings["lean-rep"]||0), likely = (ratings["likely-dem"]||0)+(ratings["likely-rep"]||0);
      return {st, toss, lean, likely, score: toss*3+lean*2+likely};
    }).filter(r => r.score > 0).sort((a,b)=>b.score-a.score || a.st.localeCompare(b.st));
    const chips = rows.map(r => {
      const bits = [];
      if (r.toss) bits.push(r.toss+" empate"+(r.toss>1?"s":""));
      if (r.lean) bits.push(r.lean+" inclin.");
      if (r.likely && bits.length < 2) bits.push(r.likely+" prob.");
      const on = S.sel.house === r.st ? " on" : "";
      return `<button type="button" data-st="${r.st}" class="${on.trim()}">${esc(ST[r.st]||r.st)} · ${esc(bits.join(" · "))}</button>`;
    }).join("");
    return `<section class="card"><h2>Estados pendulares</h2><div class="chips" id="chips">${chips || `<span class="same">Aparecen cuando carga la clasificación del NYT.</span>`}</div><p class="note" style="margin-top:10px"><button type="button" id="showAll" class="tiny" style="border:1px solid var(--line);background:#fff;border-radius:10px;padding:8px 12px;font:inherit;cursor:pointer">Ver todos los distritos reñidos</button></p></section>`;
  }
  let list = racesOf(view).filter(r => passes(r, mode) && (view === "house" || r.state !== S.sel[view]));
  if (view === "house" && S.q.trim()){
    const q = S.q.trim().toLowerCase();
    list = racesOf(view).filter(r => ((r.district||"")+" "+placeName(r)+" "+(r.candidates||[]).map(c=>c.name).join(" ")).toLowerCase().includes(q));
  }
  list = sortRaces(list);
  const filters = view === "house"
    ? `<div class="tools"><input id="q" type="search" placeholder="Buscar distrito o candidato" aria-label="Buscar distrito" value="${esc(S.q)}"><button type="button" id="hideAll" style="border:1px solid var(--line);background:#fff;border-radius:10px;min-height:40px;padding:8px 12px;font:inherit;cursor:pointer">Volver al mapa</button></div>`
    : `<div class="tools"><div class="toggle" id="raceF">${view==="senate"
        ? `<button type="button" data-m="play" class="${mode==="play"?"on":""}">En juego</button><button type="button" data-m="all" class="${mode==="all"?"on":""}">Todas</button>`
        : `<button type="button" data-m="close" class="${mode==="close"?"on":""}">Reñidas</button><button type="button" data-m="all" class="${mode==="all"?"on":""}">Todas</button>`}</div></div>`;
  const title = view === "house" ? "Distritos reñidos" : view === "gov" ? "Gobernaciones" : "Carreras del Senado";
  return `<section class="card"><h2>${title} <span class="same">${list.length}</span></h2>${filters}<div id="raceList">${list.map(r => raceCard(r, nytOf(r), view==="house" ? (r.district||"")+" · "+placeName(r) : placeName(r), r.url)).join("") || `<p class="empty">No hay carreras con este filtro.</p>`}</div></section>`;
}
function bestParty(race, party){
  const cs = ((race && race.candidates) || []).filter(c => c.party === party && c.price != null);
  return cs.length ? cs.slice().sort((a,b)=>b.price-a.price)[0] : null;
}
function battleScore(race){
  const gap = gapOf(race.candidates);
  const closeness = Math.max(0, 1 - Math.min(1, gap));
  const holder = holderOf(race);
  const lead = leadingParty(race);
  const flips = !!(holder && lead && holder !== lead && lead !== "O" && holder !== "O");
  const key = race.key || "";
  let impact = 1;
  if (key.startsWith("senate")) impact = flips ? 4 : 2.4;
  else if (key.startsWith("house")) impact = flips ? 2 : 1.15;
  else impact = flips ? 1.5 : 1;
  return closeness * impact;
}
function countParties(list){
  const n = {D:0, R:0, I:0};
  for (const p of list) if (n[p] != null) n[p]++;
  return n;
}
function houseNow(){
  const n = {d:0, r:0, i:0, v:0};
  for (const x of Object.values(HOLD.house)){ n.d += x.d; n.r += x.r; n.i += x.i; n.v += x.v; }
  return n;
}
function pathCard(){
  const sen = countParties([].concat(...Object.values(HOLD.senate)));
  const up = countParties(Object.values(HOLD.senateUp));
  const caucus = sen.D + sen.I;
  const nytS = S.results && S.results.senate;
  const nytH = S.results && S.results.house;
  const needD = nytS && nytS.to_win ? nytS.to_win.D : null;
  const needR = nytS && nytS.to_win ? nytS.to_win.R : null;
  const h = houseNow();
  const needH = nytH && nytH.to_win ? nytH.to_win.D : 218;
  const demGain = needH - h.d;
  let senPath = `Hoy el Senado tiene ${sen.R} republicanos, ${sen.D} demócratas y ${sen.I} independientes que votan con los demócratas: un caucus de ${caucus} frente a ${sen.R} (lista de senadores al ${HOLD.asOf}).`;
  if (needD && needR) senPath += ` El feed del NYT marca la mayoría en ${needD} escaños demócratas o ${needR} republicanos. Desde ${caucus}, el caucus demócrata necesita una ganancia neta de ${needD - caucus}. Desde ${sen.R}, los republicanos pueden perder hasta ${sen.R - needR} y seguir en su cifra.`;
  senPath += ` De los escaños que se votan, ${up.R} los ocupa un republicano y ${up.D} un demócrata.`;
  const housePath = `La Cámara tiene 435 escaños; la mayoría es ${needH}. Hoy hay ${h.r} republicanos y ${h.d} demócratas, más ${h.i} independiente y ${h.v} vacantes (The Green Papers). Los demócratas necesitan una ganancia neta de ${demGain} para llegar a ${needH}. Los republicanos están en ${h.r}: una pérdida neta de ${h.r - needH + 1} los deja por debajo.`;
  return `<section class="card"><h2>Batallas clave</h2>
    <p>El orden sale de los datos: qué tan cerca está el precio de Polymarket del empate, y si quien va adelante es de otro partido que quien ocupa el cargo. No es una selección editorial.</p>
    <p>${esc(senPath)}</p>
    <p>${esc(housePath)}</p>
  </section>`;
}
function whyText(race){
  const holder = holderOf(race);
  const lead = leadingParty(race);
  const flip = flipInfo(holder, lead);
  const nyt = nytOf(race);
  const kind = (race.key || "").startsWith("house") ? "distrito" : (race.key || "").startsWith("gov") ? "cargo" : "escaño";
  const bits = [];
  if (holder) bits.push(`Hoy este ${kind} es ${sideName(holder)}.`);
  else bits.push("En la boleta del NYT no figura un titular, así que no se marca cambio de partido.");
  if (flip && flip.flip) bits.push(`Quien va adelante es ${sideName(lead)}: el partido cambiaría.`);
  else if (flip) bits.push("Quien va adelante es del mismo partido que el titular.");
  if (nyt && nyt.status === "llamado" && nyt.winner) bits.push(`El NYT la marca llamada: ${nyt.winner}.`);
  else if (nyt && nyt.status !== "sin_votos" && nyt.total_votes) bits.push(`Hay escrutinio: ${fmtP(nyt.eevp, 0)} del voto esperado.`);
  else bits.push("El feed del NYT todavía no trae votos de esta carrera.");
  return bits.join(" ");
}
function ranked(list, limit){
  return list.map(r => ({r, s: battleScore(r)})).sort((a,b)=>b.s-a.s || gapOf(a.r.candidates)-gapOf(b.r.candidates)).slice(0, limit);
}
function battleBlock(race, n, label){
  const title = (race.key || "").startsWith("house") ? (race.district || "") + " · " + placeName(race) : placeName(race);
  return `<article class="battle"><p class="rank">${n} · ${esc(label)}</p>${raceCard(race, nytOf(race), title, race.url)}<p class="why">${esc(whyText(race))}</p></article>`;
}
function battlesHTML(){
  const senate = racesOf("senate").filter(r => {
    const nyt = nytOf(r);
    const rating = nyt && nyt.rating;
    const gap = gapOf(r.candidates);
    const flip = flipInfo(holderOf(r), leadingParty(r));
    return rating === "tossup" || (rating || "").startsWith("lean") || gap <= 0.22 || (flip && flip.flip);
  });
  const house = racesOf("house").filter(r => passes(r, "battle") || gapOf(r.candidates) <= 0.12);
  const gov = racesOf("gov").filter(r => {
    const nyt = nytOf(r);
    const rating = nyt && nyt.rating;
    return rating === "tossup" || (rating || "").startsWith("lean") || gapOf(r.candidates) <= 0.4;
  });
  const senList = ranked(senate, 12);
  const houList = ranked(house, 8);
  const govList = ranked(gov.length ? gov : racesOf("gov"), 6);
  const byState = {};
  for (const {r, s} of ranked(house, 40)){
    const x = byState[r.state] || (byState[r.state] = {st:r.state, n:0, score:0});
    x.n++; x.score += s;
  }
  const states = Object.values(byState).sort((a,b)=>b.score-a.score).slice(0, 6);
  const stateLine = states.map(x => `${ST[x.st] || x.st} (${x.n})`).join(" · ");
  return `${pathCard()}
    <section class="card"><h2>Senado <span class="same">${senList.length} carreras</span></h2>
      <p class="note">Empates, inclinadas y escaños que cambiarían de partido, ordenados por cercanía del precio e impacto en la mayoría.</p>
      ${senList.map((x,i)=>battleBlock(x.r, i+1, "Senado")).join("") || `<p class="empty">No hay carreras de Senado con precio cargado.</p>`}
    </section>
    <section class="card"><h2>Cámara <span class="same">${houList.length} distritos</span></h2>
      <p class="note">Los distritos más cerrados. Dónde se concentran: ${esc(stateLine || "aún sin mercados")}.</p>
      ${houList.map((x,i)=>battleBlock(x.r, i+1, "Cámara")).join("")}
    </section>
    <section class="card"><h2>Gobernadores <span class="same">${govList.length} carreras</span></h2>
      <p class="note">Las gobernaciones con el precio más cerca del empate.</p>
      ${govList.map((x,i)=>battleBlock(x.r, i+1, "Gobernador")).join("")}
    </section>`;
}
function viewHTML(){
  const view = S.view;
  if (view === "battles") return battlesHTML();
  const mapTitle = view === "house" ? "Mayoría de la delegación" : view === "gov" ? "Gobernadores" : "Senado por estado";
  return `${controlHTML(view)}
    <section class="card"><h2>${mapTitle}</h2>
      <div class="mapwrap"><svg id="map" viewBox="0 0 ${USMAP.w} ${USMAP.h}" role="img" aria-label="Mapa de Estados Unidos"></svg></div>
      ${legendHTML(view)}
      <p class="note">Estados pequeños:</p>
      ${tinyHTML(view)}
      ${detailHTML(view)}
    </section>
    ${view==="senate" ? balanceHTML() : ""}
    ${listHTML(view)}`;
}
function balanceHTML(){
  const b = S.page.control && S.page.control.balance;
  if (!b || !(b.outcomes||[]).length) return "";
  return `<section class="card"><details class="extra"><summary>Quién se queda con cada cámara</summary>${outcomesBars(b.outcomes, "balance")}<p class="note">Polymarket · ${money(b.volume)}</p></details></section>`;
}
function drawMap(){
  const svg = document.getElementById("map");
  if (!svg || typeof USMAP === "undefined") return;
  const view = S.view;
  const defs = `<defs>
    <pattern id="hatchD" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><rect width="7" height="7" fill="#9bb6e4"/><line x1="0" y1="0" x2="0" y2="7" stroke="#0A47C2" stroke-width="3"/></pattern>
    <pattern id="hatchR" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><rect width="7" height="7" fill="#f3c2c8"/><line x1="0" y1="0" x2="0" y2="7" stroke="#D0122D" stroke-width="3"/></pattern>
    <pattern id="hatchI" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><rect width="7" height="7" fill="#b7e4c7"/><line x1="0" y1="0" x2="0" y2="7" stroke="#0E8A3D" stroke-width="3"/></pattern>
    <pattern id="splitDR" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#0A47C2"/><rect x="4" width="4" height="8" fill="#D0122D"/></pattern>
  </defs>`;
  svg.innerHTML = defs + Object.entries(USMAP.d).map(([st, d]) => {
    const info = paintState(view, st);
    const sel = S.sel[view] === st ? " sel" : "";
    const flip = info.flip ? " flip" : "";
    const comp = info.comp ? " comp" : "";
    return `<path class="st${sel}${flip}${comp}" data-st="${st}" d="${d}" fill="${info.fill}"><title>${esc(ST[st]||st)}. ${esc(info.text)}</title></path>`;
  }).join("");
}
function pickState(st){
  S.sel[S.view] = st;
  S.userPicked = true;
  S.houseAll = false;
  S._scrollDetail = true;
  renderAll();
}

function buildRows(pm, nyt){
  const pmCands = (pm && pm.candidates) || [];
  const nytCands = (nyt && nyt.candidates) || [];
  const counting = nyt && nyt.status && nyt.status !== "sin_votos";
  if (pmCands.length && pmCands.every(c => isPartyLabel(c.name))){
    return pmCands.map(p => {
      const group = nytCands.filter(c => c.party === p.party && !isWriteIn(c.name));
      const votes = group.reduce((s,c)=>s+(c.votes||0),0);
      const leader = group.slice().sort((a,b)=>b.votes-a.votes)[0];
      return {name:p.name, party:p.party, price:p.price, votes: counting?votes:null, incumbent:false,
        winner: group.some(c=>c.winner), leader: counting && group.some(c=>c.leader),
        sub: counting && leader ? leader.name : ""};
    });
  }
  const used = new Set();
  const rows = pmCands.map(p => {
    const m = matchCand(p.name, nytCands, used);
    if (m) used.add(m.id);
    return {name:p.name, party: p.party !== "O" ? p.party : (m ? m.party : "O"), price:p.price,
      votes: counting && m ? m.votes : null, incumbent: !!(m && m.incumbent),
      winner: !!(m && m.winner), leader: !!(counting && m && m.leader), sub:""};
  });
  if (counting){
    for (const c of nytCands){
      if (used.has(c.id) || isWriteIn(c.name)) continue;
      if ((c.votes||0) <= 0 && !c.winner) continue;
      rows.push({name:c.name, party:c.party, price:null, votes:c.votes, incumbent:!!c.incumbent, winner:!!c.winner, leader:!!c.leader, sub:""});
    }
  }
  rows.sort((a,b) => counting && (b.votes||0) !== (a.votes||0) ? (b.votes||0)-(a.votes||0) : (b.price||0)-(a.price||0));
  return rows.slice(0, 6);
}
function titular(nyt){
  if (!nyt) return "";
  const inc = (nyt.candidates||[]).filter(c => c.incumbent);
  if (!inc.length) return `<span class="tag t1">sin titular en la boleta</span>`;
  const p = inc[0].party;
  return `<span class="tag ${p==="D"?"d":p==="R"?"r":"t1"}">titular ${esc(inc[0].name.split(" ").slice(-1)[0])} · ${p}</span>`;
}
function resultsBlock(nyt){
  if (!nyt) return `<p class="empty">Resultados no disponibles todavía.</p>`;
  if (nyt.status === "sin_votos") return `<p class="note">Sin votos todavía. El feed del NYT está en línea y esta carrera sigue en cero.</p>`;
  const total = nyt.total_votes || 0;
  const rows = (nyt.candidates||[]).filter(c => (c.votes||0) > 0 || c.winner).slice(0,5);
  const body = rows.map(c => {
    const pct = total ? c.votes / total * 100 : 0;
    return `<div class="cand"><span class="nm"><span class="dot" style="background:${COL[c.party]||COL.O}"></span>${esc(c.name)}</span><span class="b" style="height:8px;background:#eef0f3;border-radius:4px;overflow:hidden"><span style="display:block;height:100%;width:${Math.min(100,pct)}%;background:${COL[c.party]||COL.O}"></span></span><b>${fmtP(pct,1)}</b></div>`;
  }).join("");
  let badge = "";
  if (nyt.status === "llamado" && nyt.winner) badge = `<span class="tag call">${nyt.certified?"Certificado":"Llamado"}: ${esc(nyt.winner)}</span>`;
  else if (nyt.status === "proyectado") badge = `<span class="tag call">Proyectado</span>`;
  else if (nyt.status === "segunda_vuelta") badge = `<span class="tag call">Segunda vuelta</span>`;
  const prec = nyt.precincts_total ? ` · precintos ${fmtN(nyt.precincts_reporting)}/${fmtN(nyt.precincts_total)}` : "";
  return `<div class="subh">Escrutinio ${badge}</div>
    <p class="note">${fmtP(nyt.eevp, nyt.eevp<10?1:0)} del voto esperado · ${fmtN(total)} votos${prec}</p>
    <div class="votes">${body}</div>`;
}
function oddsBlock(rows){
  if (!rows.length) return `<p class="empty">Sin mercado de Polymarket para esta carrera.</p>`;
  const body = rows.map(c => {
    const pct = c.price == null ? null : c.price * 100;
    const sub = c.sub ? ` <span class="same">${esc(c.sub)}</span>` : "";
    const tit = c.incumbent ? ` <span class="same">titular</span>` : "";
    return `<div class="cand"><span class="nm"><span class="dot" style="background:${COL[c.party]||COL.O}"></span>${esc(c.name)}${tit}${sub}</span><span class="b" style="height:8px;background:#eef0f3;border-radius:4px;overflow:hidden"><span style="display:block;height:100%;width:${pct==null?0:Math.min(100,pct)}%;background:${COL[c.party]||COL.O}"></span></span><b>${pct==null?"–":fmtP(pct,1)}</b></div>`;
  }).join("");
  return `<div class="subh">Polymarket</div>${body}`;
}
function raceCard(pm, nyt, title, href){
  const rows = buildRows(pm, nyt);
  const link = href ? ` <a class="same" href="${esc(href)}" target="_blank" rel="noopener">↗</a>` : "";
  const rt = nyt && nyt.rating && RATING[nyt.rating] ? `<span class="tag">${esc(RATING[nyt.rating])}</span>` : "";
  const flip = flipTag(flipInfo(holderOf(pm), leadingParty(pm)));
  return `<article class="race"><h3>${esc(title)} ${rt} ${titular(nyt)} ${flip}${link}</h3>${oddsBlock(rows)}${resultsBlock(nyt)}</article>`;
}
function placeName(race){
  if (race.office === "house" && race.district){
    const st = race.district.slice(0,2), d = race.district.slice(3);
    const name = ST[st] || st;
    return d === "AL" ? `${name} · distrito único` : `${name} ${parseInt(d,10)}`;
  }
  const st = race.state;
  const base = ST[st] || race.name || st;
  return race.key.endsWith(":special") ? base + " · especial" : base;
}

function renderAll(){
  if (!S.page) return;
  const extraOpen = [...document.querySelectorAll("details.extra")].map(d => d.open);
  const y = S._scrollDetail ? null : window.scrollY;
  document.querySelectorAll("#chamber button").forEach(b => b.classList.toggle("on", b.dataset.v === S.view));
  document.getElementById("view").innerHTML = viewHTML();
  drawMap();
  document.querySelectorAll("details.extra").forEach((d, i) => { if (extraOpen[i]) d.open = true; });
  const q2 = document.getElementById("q");
  if (q2){
    q2.oninput = () => { S.q = q2.value; S._focusQ = true; renderAll(); };
    if (S._focusQ){ q2.focus(); const n = q2.value.length; q2.setSelectionRange(n, n); S._focusQ = false; }
  }
  const viaCorta = v => v === "libro de órdenes en vivo" ? "en vivo" : v === "copia en GitHub" ? "copia" : v === "NYT directo" ? "NYT" : (v || "");
  const hm = (input) => {
    const d = new Date(input);
    if (!input || Number.isNaN(d.getTime())) return "–";
    return new Intl.DateTimeFormat("es-CO", {timeZone:"America/Bogota", hour:"2-digit", minute:"2-digit", hour12:false}).format(d);
  };
  document.getElementById("oddsAt").textContent = hm(S.oddsLiveAt || S.page.as_of_iso) + (S.oddsVia ? " · "+viaCorta(S.oddsVia) : "");
  const res = S.results;
  document.getElementById("resAt").textContent = res ? (hm(res.fetched_at_iso) + " · " + viaCorta(S.resultsVia)) : "sin datos";
  const banner = document.getElementById("banner");
  const bits = [];
  if (!nightMode() && Date.now() < POLLS) bits.push("El escrutinio empieza el martes 3 de noviembre. Los mercados ya están en vivo; los votos aparecen cuando los estados empiezan a reportar.");
  if (S.resultsWarn) bits.push(S.resultsWarn);
  if (S.oddsWarn) bits.push(S.oddsWarn);
  if (bits.length){ banner.hidden = false; banner.className = "banner" + (S.resultsWarn && !S.results ? " err" : ""); banner.innerHTML = bits.map(t=>`<div>${esc(t)}</div>`).join(""); }
  else banner.hidden = true;
  if (S._scrollDetail){
    const det = document.getElementById("detail");
    if (det) det.scrollIntoView({behavior:"smooth", block:"nearest"});
    S._scrollDetail = false;
  } else if (y != null) {
    window.scrollTo(0, y);
  }
}

async function bootOdds(){
  try {
    S.page = await fetchJSON("data/page.json?t="+Date.now(), 8000);
  } catch (e) {
    const banner = document.getElementById("banner");
    banner.hidden = false;
    banner.className = "banner err";
    banner.textContent = "No se pudo leer data/page.json.";
    document.getElementById("view").innerHTML = "<p class=\"empty\">No se pudieron cargar los mercados.</p>";
    return;
  }
  S.oddsVia = "copia en GitHub";
  S.oddsWarn = "";
  renderAll();
  try {
    await refreshMids();
    S.oddsWarn = "";
  } catch (e) {
    S.oddsVia = "copia en GitHub";
    S.oddsWarn = "El libro de órdenes de Polymarket no respondió; se muestran los precios de la última copia.";
  }
  renderAll();
}
async function bootResults(){
  S.resultsWarn = "";
  let directOk = false;
  if (Q.get("live") !== "0"){
    try { await loadDirectResults(); directOk = true; }
    catch (e) { /* fallback */ }
  }
  if (!directOk){
    try { await loadSnapshotResults(); }
    catch (e) {
      S.results = null;
      S.resultsWarn = "Resultados no disponibles todavía: ni el NYT ni la copia de este sitio respondieron.";
    }
  }
  if (!directOk && S.results && Q.get("live") !== "0"){
    S.resultsWarn = "El NYT no respondió en el navegador; se muestra la última copia guardada en este sitio.";
  }
  renderAll();
}
async function tickOdds(){
  try {
    const fresh = await fetchJSON("data/page.json?t="+Date.now(), 8000);
    if (fresh && fresh.as_of_iso && (!S.page || fresh.as_of_iso > S.page.as_of_iso)) S.page = fresh;
  } catch (e) { /* sigue el que ya hay */ }
  try { await refreshMids(); S.oddsWarn = ""; }
  catch (e) { S.oddsWarn = "Polymarket no respondió en este ciclo; siguen los últimos precios cargados."; }
  renderAll();
}
async function tickResults(){
  const useDirect = nightMode();
  try {
    if (useDirect) await loadDirectResults();
    else await loadSnapshotResults();
    S.resultsWarn = "";
  } catch (e) {
    if (useDirect){
      try { await loadSnapshotResults(); S.resultsWarn = "NYT directo falló; copia de GitHub."; }
      catch (e2) { S.resultsWarn = "Resultados no disponibles en este ciclo."; }
    }
  }
  renderAll();
}

document.getElementById("chamber").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  S.view = b.dataset.v;
  const params = new URLSearchParams(location.search);
  params.set("v", {house:"camara", gov:"gob", battles:"batallas"}[S.view] || "senado");
  history.replaceState(null, "", "?" + params.toString());
  window.scrollTo(0, 0);
  renderAll();
};
document.getElementById("view").onclick = (e) => {
  const st = e.target.closest("[data-st]");
  if (st && st.dataset.st){ pickState(st.dataset.st); return; }
  const m = e.target.closest("[data-m]");
  if (m){ S.listMode[S.view] = m.dataset.m; renderAll(); return; }
  if (e.target.closest("#showAll")){ S.houseAll = true; S.sel.house = null; renderAll(); return; }
  if (e.target.closest("#hideAll")){ S.houseAll = false; S.q = ""; renderAll(); }
};
countdown();
setInterval(countdown, 30000);
bootOdds();
bootResults();
setInterval(tickOdds, 60000);
setInterval(tickResults, nightMode() ? 120000 : 180000);
document.addEventListener("visibilitychange", () => { if (!document.hidden){ tickOdds(); tickResults(); } });
