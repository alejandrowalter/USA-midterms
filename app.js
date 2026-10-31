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
const COL = {D:"#1b3a8a", R:"#c4161c", I:"#1e8a3e", O:"#64748b"};

const S = {
  page: null, results: null,
  oddsVia: "", resultsVia: "",
  senF: "play", govF: "close", houF: "battle", houseState: "ALL", q: "",
  prev: {}
};

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
  const lines = [];
  if (ctrl.to_win){
    for (const n of [ctrl.to_win.R, ctrl.to_win.D]) if (n && !lines.includes(n)) lines.push(n);
  }
  const ticks = lines.map(n => `<b style="left:${w(n)}%" title="${n}"></b>`).join("");
  const mayoria = ctrl.to_win ? ` Mayoría según el NYT: ${ctrl.to_win.R} republicanos · ${ctrl.to_win.D} demócratas.` : "";
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
    <div class="tick">${ticks}</div>
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
function controlCard(id, title, blockKey, ctrlKey, blurb){
  const block = S.page && S.page.control && S.page.control[blockKey];
  const el = document.getElementById(id);
  if (!block || !(block.outcomes||[]).length){
    el.innerHTML = `<h2>${esc(title)}</h2><p class="empty">Mercado no disponible.</p>`;
    return;
  }
  const main = block.outcomes.filter(o => partyOfLabel(o)==="D" || partyOfLabel(o)==="R").slice(0,2);
  const cards = main.map(o => {
    const p = partyOfLabel(o);
    return `<div class="pmc"><div class="who">${esc(o.label)}</div><div class="pc" style="color:${COL[p]}">${fmtP(o.price*100,1)}${deltaHTML(blockKey+"|"+o.label, o.price)}</div></div>`;
  }).join("");
  const ctrl = S.results && S.results[ctrlKey];
  const seats = S.page.control[blockKey === "senate" ? "senate_seats" : "house_seats"];
  const seatRows = ((seats && seats.outcomes) || []).slice().sort((a,b)=>seatSort(a.label)-seatSort(b.label)).filter(o => o.price >= 0.005);
  el.innerHTML = `<h2>${esc(title)} <a class="same" href="${esc(block.url)}" target="_blank" rel="noopener">mercado ↗</a></h2>
    <div class="pcards">${cards}</div>
    ${outcomesBars(block.outcomes, blockKey)}
    <p class="note">${esc(blurb)} Volumen ${money(block.volume)}. ${esc(S.oddsVia || "copia en GitHub")}.</p>
    <h3>Escaños en vivo</h3>
    ${ctrl ? seatBar(ctrl) : `<p class="empty">Resultados no disponibles todavía.</p>`}
    ${seatRows.length ? `<h3>Escaños republicanos · Polymarket</h3>${outcomesBars(seatRows, blockKey === "senate" ? "senate_seats" : "house_seats")}<p class="note">Volumen ${money(seats.volume)}. <a href="${esc(seats.url)}" target="_blank" rel="noopener">mercado ↗</a></p>` : ""}`;
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
  return `<article class="race"><h3>${esc(title)} ${rt} ${titular(nyt)}${link}</h3>${oddsBlock(rows)}${resultsBlock(nyt)}</article>`;
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

function renderLists(){
  const page = S.page;
  if (!page) return;
  const nyt = (S.results && S.results.races) || {};
  const sen = sortRaces((page.senate||[]).filter(r => passes(r, S.senF)));
  document.getElementById("senCount").textContent = sen.length + (S.senF==="all" ? " en la boleta" : " competitivas");
  document.getElementById("senList").innerHTML = sen.map(r => raceCard(r, nyt[r.key], placeName(r), r.url)).join("") || `<p class="empty">No hay carreras con este filtro.</p>`;

  const gov = sortRaces((page.governor||[]).filter(r => passes(r, S.govF)));
  document.getElementById("govCount").textContent = gov.length + (S.govF==="all" ? "" : " en juego");
  document.getElementById("govList").innerHTML = gov.map(r => raceCard(r, nyt[r.key], placeName(r), r.url)).join("") || `<p class="empty">No hay gobernaciones con este filtro.</p>`;

  renderStates();
  const q = S.q.trim().toLowerCase();
  let house = (page.house||[]).filter(r => passes(r, S.houF));
  if (S.houseState !== "ALL") house = house.filter(r => r.state === S.houseState || (r.district||"").startsWith(S.houseState));
  if (q) house = house.filter(r => {
    const blob = (placeName(r)+" "+(r.district||"")+" "+(r.candidates||[]).map(c=>c.name).join(" ")).toLowerCase();
    return blob.includes(q);
  });
  house = sortRaces(house);
  document.getElementById("houCount").textContent = house.length + " distritos";
  document.getElementById("houList").innerHTML = house.map(r => raceCard(r, nyt[r.key], (r.district||"")+" · "+placeName(r), r.url)).join("") || `<p class="empty">No hay distritos con este filtro.</p>`;
}
function renderStates(){
  const by = (S.results && S.results.house_by_state) || {};
  const rows = Object.entries(by).map(([st, ratings]) => {
    const toss = ratings.tossup||0;
    const lean = (ratings["lean-dem"]||0)+(ratings["lean-rep"]||0);
    const likely = (ratings["likely-dem"]||0)+(ratings["likely-rep"]||0);
    return {st, toss, lean, likely, score: toss*3+lean*2+likely};
  }).filter(r => r.toss+r.lean+r.likely > 0).sort((a,b)=>b.score-a.score || a.st.localeCompare(b.st));
  const chips = [`<button type="button" data-st="ALL" class="${S.houseState==="ALL"?"on":""}">Todos</button>`];
  for (const r of rows){
    const bits = [];
    if (r.toss) bits.push(r.toss+" empate"+(r.toss>1?"s":""));
    if (r.lean) bits.push(r.lean+" inclin.");
    if (r.likely) bits.push(r.likely+" prob.");
    chips.push(`<button type="button" data-st="${r.st}" class="${S.houseState===r.st?"on":""}">${esc(ST[r.st]||r.st)} · ${esc(bits.join(" · "))}</button>`);
  }
  const el = document.getElementById("stateChips");
  el.innerHTML = rows.length ? chips.join("") : `<span class="same">La clasificación por estado aparece cuando carga el escrutinio del NYT.</span>`;
}
function renderBalance(){
  const b = S.page && S.page.control && S.page.control.balance;
  const el = document.getElementById("balance");
  if (!b || !(b.outcomes||[]).length){ el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<h2>Control de las dos cámaras <a class="same" href="${esc(b.url)}" target="_blank" rel="noopener">mercado ↗</a></h2>
    ${outcomesBars(b.outcomes, "balance")}
    <p class="note">Volumen ${money(b.volume)}. Quién se queda con el Senado y quién con la Cámara, según Polymarket.</p>`;
}
function renderAll(){
  if (!S.page) return;
  controlCard("card-senate", "Senado", "senate", "senate", "Probabilidad de controlar el Senado.");
  controlCard("card-house", "Cámara de Representantes", "house", "house", "Probabilidad de controlar la Cámara.");
  renderBalance();
  renderLists();
  const viaCorta = v => v === "libro de órdenes en vivo" ? "en vivo" : v === "copia en GitHub" ? "copia" : v === "NYT directo" ? "NYT" : (v || "");
  document.getElementById("oddsAt").textContent = bogota(S.oddsLiveAt || S.page.as_of_iso) + (S.oddsVia ? " · "+viaCorta(S.oddsVia) : "");
  const res = S.results;
  document.getElementById("resAt").textContent = res ? (bogota(res.fetched_at_iso) + " · " + viaCorta(S.resultsVia)) : "sin datos";
  const banner = document.getElementById("banner");
  const bits = [];
  if (!nightMode() && Date.now() < POLLS) bits.push("El escrutinio empieza el martes 3 de noviembre. Los mercados ya están en vivo; los votos aparecen cuando los estados empiezan a reportar.");
  if (S.resultsWarn) bits.push(S.resultsWarn);
  if (S.oddsWarn) bits.push(S.oddsWarn);
  if (bits.length){ banner.hidden = false; banner.className = "banner" + (S.resultsWarn && !S.results ? " err" : ""); banner.innerHTML = bits.map(t=>`<div>${esc(t)}</div>`).join(""); }
  else banner.hidden = true;
}

function wireFilters(){
  const mk = (id, options, key) => {
    const el = document.getElementById(id);
    el.innerHTML = options.map(([v, lab]) => `<button type="button" data-v="${v}" class="${S[key]===v?"on":""}">${lab}</button>`).join("");
    el.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      S[key] = b.dataset.v;
      wireFilters();
      renderLists();
    };
  };
  mk("senF", [["play","En juego"],["all","Todas"]], "senF");
  mk("govF", [["close","Reñidas"],["all","Todas"]], "govF");
  mk("houF", [["battle","Reñidas"],["comp","Competitivas"]], "houF");
  document.getElementById("stateChips").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    S.houseState = b.dataset.st;
    renderLists();
  };
  const q = document.getElementById("q");
  q.oninput = () => { S.q = q.value; renderLists(); };
}

async function bootOdds(){
  try {
    S.page = await fetchJSON("data/page.json?t="+Date.now(), 8000);
  } catch (e) {
    const banner = document.getElementById("banner");
    banner.hidden = false;
    banner.className = "banner err";
    banner.textContent = "No se pudo leer data/page.json.";
    document.getElementById("card-senate").innerHTML = "<h2>Senado</h2><p class=\"empty\">No se pudieron cargar los mercados.</p>";
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

wireFilters();
countdown();
setInterval(countdown, 30000);
bootOdds();
bootResults();
setInterval(tickOdds, 60000);
setInterval(tickResults, nightMode() ? 120000 : 180000);
document.addEventListener("visibilitychange", () => { if (!document.hidden){ tickOdds(); tickResults(); } });
