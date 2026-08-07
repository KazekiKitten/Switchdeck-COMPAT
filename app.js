const SHEET_ID = '1UrLwRaIZGAL6J7l9QK_DO4MB45KzIUKIfKZIOE4hid4';
const GID = '1002118274';
const GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`;

const FIELD_MAP = ['game', 'model', 'oc', 'ram', 'rating', 'fps', 'tool', 'launch', 'info', 'by'];

// Canonical rating order, used for sorting and to decide chip/stat order.
// Anything not listed here (unexpected sheet values) sorts to the end.
const RATING_ORDER = { Perfect: 0, Playable: 1, Unplayable: 2, Borked: 3 };
function ratingRank(r){
  return Object.prototype.hasOwnProperty.call(RATING_ORDER, r) ? RATING_ORDER[r] : 99;
}

/* ============================================================
   Accent color — user-selectable, persisted per-browser
   ============================================================ */
const ACCENT_STORAGE_KEY = 'switchdeck_accent_color';
const DEFAULT_ACCENT = '#e8934a';
const ACCENT_PRESETS = ['#e8934a', '#5ec9a6', '#4ea1e0', '#b47ee0', '#e2584f', '#e0b84c'];

function hexToRgbString(hex){
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(full.substring(0, 2), 16);
  const g = parseInt(full.substring(2, 4), 16);
  const b = parseInt(full.substring(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return null;
  return `${r},${g},${b}`;
}

function loadStoredAccent(){
  try {
    return localStorage.getItem(ACCENT_STORAGE_KEY) || DEFAULT_ACCENT;
  } catch (e) {
    return DEFAULT_ACCENT;
  }
}

function saveStoredAccent(hex){
  try {
    localStorage.setItem(ACCENT_STORAGE_KEY, hex);
  } catch (e) {
    // storage disabled — color just won't persist across visits
  }
}

function applyAccentColor(hex, persist){
  const rgb = hexToRgbString(hex);
  if (!rgb) return;
  document.documentElement.style.setProperty('--accent', hex);
  document.documentElement.style.setProperty('--accent-rgb', rgb);
  if (persist) saveStoredAccent(hex);
  updateAccentPickerUI(hex);
}

function updateAccentPickerUI(hex){
  document.querySelectorAll('.accent-swatch').forEach(sw => {
    sw.classList.toggle('active', sw.dataset.hex.toLowerCase() === hex.toLowerCase());
  });
  const customInput = document.getElementById('accentCustomInput');
  if (customInput) customInput.value = hex;
}

function initAccentPicker(){
  const container = document.getElementById('accentPicker');
  if (!container) return;
  container.innerHTML = '';

  ACCENT_PRESETS.forEach(hex => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'accent-swatch';
    btn.style.background = hex;
    btn.dataset.hex = hex;
    btn.title = hex;
    btn.addEventListener('click', () => applyAccentColor(hex, true));
    container.appendChild(btn);
  });

  const customWrap = document.createElement('label');
  customWrap.className = 'accent-custom-wrap';
  customWrap.title = 'Custom color';
  customWrap.style.background = 'conic-gradient(from 0deg, red, yellow, lime, cyan, blue, magenta, red)';
  const customInput = document.createElement('input');
  customInput.type = 'color';
  customInput.id = 'accentCustomInput';
  customInput.addEventListener('input', e => applyAccentColor(e.target.value, true));
  customWrap.appendChild(customInput);
  container.appendChild(customWrap);

  applyAccentColor(loadStoredAccent(), false);
}

/* ============================================================
   View mode (list / grid) — persisted per-browser
   ============================================================ */
const VIEW_STORAGE_KEY = 'switchdeck_view_mode';

function loadStoredView(){
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY);
    return (v === 'grid' || v === 'list') ? v : 'list';
  } catch (e) {
    return 'list';
  }
}

function saveStoredView(mode){
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, mode);
  } catch (e) { /* ignore */ }
}

function setViewMode(mode, persist){
  state.view = mode;
  const listEl = document.getElementById('list');
  listEl.classList.toggle('grid-view', mode === 'grid');
  document.getElementById('viewListBtn').classList.toggle('active', mode === 'list');
  document.getElementById('viewGridBtn').classList.toggle('active', mode === 'grid');
  if (persist) saveStoredView(mode);
}

/* ============================================================
   Shareable per-game links
   ============================================================ */
function slugify(str){
  return (str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'game';
}

function assignSlugs(games){
  const used = new Map();
  games.forEach(g => {
    const base = slugify(g.game);
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    g._slug = count === 0 ? base : `${base}-${count + 1}`;
  });
}

function gameLinkFor(g){
  return `${location.origin}${location.pathname}#${g._slug}`;
}

function updateHash(slug){
  const url = slug ? `#${slug}` : location.pathname + location.search;
  history.replaceState(null, '', url);
}

function openFromHash(){
  const slug = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (!slug) return;
  const match = GAMES.find(g => g._slug === slug);
  if (!match) return;
  openKey = match._id;
  render(true);
  requestAnimationFrame(() => {
    const rowEl = document.querySelector(`.row[data-key="${encodeURIComponent(match._id)}"]`);
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      rowEl.classList.add('flash');
      setTimeout(() => rowEl.classList.remove('flash'), 1800);
      loadGameArt(match.game, `art-bg-${match._id}`, `art-fg-${match._id}`, `art-container-${match._id}`);
    }
  });
}

// --- "Recently added" tracking -------------------------------------------
// The sheet has no submission-date column, so there's no ground truth for
// when a row was actually added. Instead we remember, per-browser, which
// games we've already shown this visitor; anything that shows up that
// wasn't in that snapshot gets flagged as new. This is per-browser (not a
// shared "new to everyone" feed — that would need a real backend, which a
// static Google-Sheet-powered page doesn't have) but it answers the
// practical question of "what's changed since I was last here."
const SEEN_STORAGE_KEY = 'switchdeck_seen_games_v1';
const NEW_BADGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // show "NEW" for 7 days

function computeGameKey(g){
  return `${g.game}|||${g.by}|||${g.model}`;
}

function loadSeenMap(){
  try {
    const raw = localStorage.getItem(SEEN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    // Storage disabled/blocked (private browsing, some browser settings) —
    // treat every visit as a first visit; nothing breaks, "NEW" just won't show.
    return null;
  }
}

function saveSeenMap(map){
  try {
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    // ignore — same reasoning as above
  }
}

// Tags each game with _firstSeenAt and _isNew, and persists an updated
// baseline. On a visitor's very first-ever visit, nothing is flagged NEW
// (there's no prior snapshot to compare against) — otherwise every game
// would show NEW the first time anyone opens the page.
let newGamesThisVisit = 0;
function applyRecentlyAddedTracking(){
  const stored = loadSeenMap();
  const isFirstVisit = !stored;
  const map = stored || {};
  const now = Date.now();
  newGamesThisVisit = 0;

  GAMES.forEach(g => {
    const key = computeGameKey(g);
    if (!(key in map)) {
      // Back-date first-visit baseline entries so they never show as NEW;
      // otherwise mark with "now" so they display as new for the next 7 days.
      map[key] = isFirstVisit ? (now - NEW_BADGE_WINDOW_MS - 1) : now;
    }
    g._firstSeenAt = map[key];
    g._isNew = !isFirstVisit && (now - map[key] < NEW_BADGE_WINDOW_MS);
    if (g._isNew) newGamesThisVisit++;
  });

  saveSeenMap(map);
}

let GAMES = [];
const state = { search:'', ratings:new Set(), models:new Set(), sort:'name', newOnly:false, view:'list' };
let openKey = null;

// Tracks which row keys were present in the previous render so we only
// play the entrance animation for rows that are newly appearing
// (first load, or after a search/filter/sort change) — not on every
// click when a row is simply being opened/closed.
let previousRenderKeys = new Set();

// In-memory cache for game artwork so returning to a game is instantaneous
const artworkCache = new Map();

// Queue for fetching artwork: games waiting to have their art fetched
// Prioritized so that the currently-viewed game fetches first
const artFetchQueue = [];
let artFetchInProgress = false;
const MAX_CONCURRENT_ART_FETCHES = 1;
const ART_FETCH_DELAY = 800; // ms delay between each fetch

function tierClass(r){ return 'tier-' + (r||'').toLowerCase(); }

function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function fpsSortValue(fps){
  const m = (fps||'').match(/\d+/);
  return m ? parseInt(m[0],10) : 0;
}

// Generate a deterministic cool fallback gradient based on the game's name
function getStringColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${hash % 360}, 65%, 25%)`;
}

function parseCSV(text) {
  const lines = text.split('\n');
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.replace(/^"|"$/g, ''));
    if (fields[0]) result.push(fields);
  }
  return result;
}

async function fetchSheet(){
  try{
    const res = await fetch(GVIZ_URL);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv = await res.text();
    const rows = parseCSV(csv);

    GAMES = rows
      .filter(r => r[0] && r[0].trim())
      .map((r, index) => {
        const obj = { _id: index.toString() };
        for(let i=0; i<10; i++) obj[FIELD_MAP[i]] = (r[i] || '').trim();
        return obj;
      });

    if(!GAMES.length) throw new Error('No valid game rows parsed');
    assignSlugs(GAMES);
    applyRecentlyAddedTracking();
    initUI();
  }catch(err){
    document.getElementById('list').innerHTML = `
      <div class="empty">Error loading sheet: ${escapeHtml(err.message)}</div>`;
    document.getElementById('kicker').classList.remove('loading');
    document.getElementById('kicker').textContent = 'Error loading data';
  }
}

function animateCounter(element, targetValue) {
  const startValue = 0;
  const duration = 800;
  const startTime = performance.now();

  function updateCounter(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOutQuad = 1 - Math.pow(1 - progress, 2);
    const currentValue = Math.floor(startValue + (targetValue - startValue) * easeOutQuad);
    element.textContent = currentValue;

    if (progress < 1) {
      requestAnimationFrame(updateCounter);
    }
  }

  requestAnimationFrame(updateCounter);
}

function initUI(){
  const total = GAMES.length;
  const perfectCt = GAMES.filter(g=>g.rating==='Perfect').length;
  const playableCt = GAMES.filter(g=>g.rating==='Playable').length;
  const unplayableCt = GAMES.filter(g=>g.rating==='Unplayable').length;
  const borkedCt = GAMES.filter(g=>g.rating==='Borked' || g.rating==='Unsupported').length;
  const contributors = new Set(GAMES.map(g=>g.by)).size;

  const statRail = document.getElementById('statRail');
  statRail.innerHTML = `
    <div class="stat-cell"><div class="pins"><span></span><span></span><span></span></div><div class="val counter" data-target="${total}">—</div><div class="lbl">Games tracked</div></div>
    <div class="stat-cell perfect"><div class="pins"><span></span><span></span><span></span></div><div class="val counter" data-target="${perfectCt}">—</div><div class="lbl">Perfect</div></div>
    <div class="stat-cell playable"><div class="pins"><span></span><span></span><span></span></div><div class="val counter" data-target="${playableCt}">—</div><div class="lbl">Playable</div></div>
    <div class="stat-cell unplayable"><div class="pins"><span></span><span></span><span></span></div><div class="val counter" data-target="${unplayableCt}">—</div><div class="lbl">Unplayable</div></div>
    <div class="stat-cell borked"><div class="pins"><span></span><span></span><span></span></div><div class="val counter" data-target="${borkedCt}">—</div><div class="lbl">Borked</div></div>
    <div class="stat-cell"><div class="pins"><span></span><span></span><span></span></div><div class="val counter" data-target="${contributors}">—</div><div class="lbl">Contributors</div></div>
  `;

  // Animate all counters after a brief delay for visual impact
  setTimeout(() => {
    document.querySelectorAll('.stat-cell .counter').forEach(el => {
      const target = parseInt(el.getAttribute('data-target'), 10);
      animateCounter(el, target);
    });
  }, 200);

  document.getElementById('kicker').classList.remove('loading');
  const newBit = newGamesThisVisit > 0 ? ` · ${newGamesThisVisit} new since your last visit` : '';
  document.getElementById('kicker').innerHTML = `✓ Live sync · ${total} games${newBit}`;

  renderSpotlight();
  document.getElementById('footCount').textContent = `${total} reports · live from sheet`;
  document.getElementById('searchInput').disabled = false;
  document.getElementById('sortSelect').disabled = false;

  const allRatings = [...new Set(GAMES.map(g=>g.rating))].sort((a,b)=>ratingRank(a)-ratingRank(b));
  const allModels = [...new Set(GAMES.map(g=>g.model))].sort();

  const ratingFilters = document.getElementById('ratingFilters');
  ratingFilters.innerHTML = '<span class="flabel">Rating</span>';
  allRatings.forEach(r=>{
    const chip = document.createElement('div');
    chip.className = 'chip ' + tierClass(r);
    chip.textContent = r;
    chip.addEventListener('click', ()=>{
      if(state.ratings.has(r)) state.ratings.delete(r); else state.ratings.add(r);
      chip.classList.toggle('active');
      render(true);
    });
    ratingFilters.appendChild(chip);
  });

  const modelFilters = document.getElementById('modelFilters');
  modelFilters.innerHTML = '<span class="flabel">Model</span>';
  allModels.forEach(m=>{
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.textContent = m.replace('Switch ','');
    chip.addEventListener('click', ()=>{
      if(state.models.has(m)) state.models.delete(m); else state.models.add(m);
      chip.classList.toggle('active');
      render(true);
    });
    modelFilters.appendChild(chip);
  });

  document.getElementById('newOnlyChip').addEventListener('click', (e)=>{
    state.newOnly = !state.newOnly;
    e.target.classList.toggle('active');
    render(true);
  });

  document.getElementById('searchInput').addEventListener('input', e=>{
    state.search = e.target.value.trim().toLowerCase();
    render(true);
  });
  document.getElementById('sortSelect').addEventListener('change', e=>{
    state.sort = e.target.value;
    render(true);
  });

  document.getElementById('viewListBtn').addEventListener('click', () => setViewMode('list', true));
  document.getElementById('viewGridBtn').addEventListener('click', () => setViewMode('grid', true));
  setViewMode(loadStoredView(), false);

  render(true);

  // If the URL arrived with a #game-slug, jump straight to that game's report
  openFromHash();

  // Start background fetching of all game artwork, without blocking UI
  setTimeout(() => {
    GAMES.forEach(g => {
      queueGameArt(g.game, null, null, null, false);
    });
  }, 500);
}

// Apply cached or just-fetched image to DOM elements
function applyGameArt(gameName, bgId, fgId, containerId, imageUrl, appId = null) {
  const imgBg = document.getElementById(bgId);
  const imgFg = document.getElementById(fgId);
  const containerEl = document.getElementById(containerId);
  if (!imgBg || !imgFg || !containerEl) return;

  if (imageUrl === 'fallback') {
    containerEl.innerHTML = '';
    containerEl.style.background = `linear-gradient(135deg, ${getStringColor(gameName)}, var(--bg))`;
    // Store fallback in cache for appId
    if (appId) artworkCache.set(`appId:${gameName}`, appId);
    return;
  }

  imgBg.src = imageUrl;
  imgFg.src = imageUrl;

  // Store appId in cache for Steam link
  if (appId) artworkCache.set(`appId:${gameName}`, appId);

  // Hide skeleton and show images once fg loads
  imgFg.onload = () => {
    const skeleton = containerEl.querySelector('.art-skeleton');
    if (skeleton) skeleton.style.display = 'none';
    imgBg.classList.add('loaded');
    imgFg.classList.add('loaded');
  };

  imgFg.onerror = () => {
    // If image fails to load, show fallback gradient
    containerEl.innerHTML = '';
    containerEl.style.background = `linear-gradient(135deg, ${getStringColor(gameName)}, var(--bg))`;
  };
}

// Shows the single most-recently-added game as a highlighted spotlight
// card below the stat rail. Only appears when there's actually a game
// tagged NEW this visit (see applyRecentlyAddedTracking) — hidden entirely
// on a visitor's first-ever visit, since nothing is flagged new yet.
function renderSpotlight(){
  const spotlightEl = document.getElementById('spotlightCard');
  const newest = GAMES
    .filter(g => g._isNew)
    .sort((a,b) => (b._firstSeenAt||0) - (a._firstSeenAt||0))[0];

  if(!newest){
    spotlightEl.style.display = 'none';
    spotlightEl.innerHTML = '';
    return;
  }

  spotlightEl.style.display = 'flex';
  spotlightEl.innerHTML = `
    <div class="spotlight-tag">Recently added</div>
    <div class="spotlight-body">
      <div class="spotlight-name">${escapeHtml(newest.game)}</div>
      <div class="spotlight-meta">
        <span class="badge ${tierClass(newest.rating)}">${newest.rating}</span>
        <span class="model-tag">${escapeHtml(newest.model.replace('Switch ',''))}</span>
      </div>
    </div>
    <button class="spotlight-view-btn" id="spotlightViewBtn">View report →</button>
  `;

  const goToGame = () => {
    state.search = '';
    state.ratings.clear();
    state.models.clear();
    state.newOnly = false;
    document.getElementById('searchInput').value = '';
    document.querySelectorAll('#ratingFilters .chip, #modelFilters .chip, #newOnlyChip').forEach(c => c.classList.remove('active'));
    openKey = newest._id;
    updateHash(newest._slug);
    render(true);
    requestAnimationFrame(() => {
      const rowEl = document.querySelector(`.row[data-key="${encodeURIComponent(newest._id)}"]`);
      if (rowEl) {
        rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        loadGameArt(newest.game, `art-bg-${newest._id}`, `art-fg-${newest._id}`, `art-container-${newest._id}`);
      }
    });
  };

  spotlightEl.addEventListener('click', goToGame);
}

// Steam's search API blocks direct browser CORS requests, so the search
// lookup must go through a proxy. Public CORS proxies are individually
// unreliable (rate limits, downtime, or blocked by ad/privacy browser
// extensions), so we try a short list in order and use whichever
// responds first with valid data. The header image itself is loaded
// directly from Steam's CDN afterwards — no proxy needed for that part.
const CORS_PROXIES = [
  url => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
];

async function fetchViaProxies(targetUrl) {
  for (const buildProxyUrl of CORS_PROXIES) {
    try {
      const res = await fetch(buildProxyUrl(targetUrl), { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const data = await res.json();
      return data;
    } catch (err) {
      // This proxy failed (blocked, down, rate-limited, or bad response) — try the next one
      continue;
    }
  }
  return null;
}

// Fetch a single game's artwork from Steam
async function fetchSteamArt(gameName) {
  try {
    const steamSearch = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(gameName)}&l=english&cc=US`;
    const data = await fetchViaProxies(steamSearch);

    if (data && data.items && data.items.length > 0) {
      const appId = data.items[0].id;
      const imageUrl = `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/header.jpg`;
      return { imageUrl, appId };
    }
    return { imageUrl: 'fallback', appId: null };
  } catch (err) {
    // Silently fail - will use fallback gradient
    return { imageUrl: 'fallback', appId: null };
  }
}

// Queue a game for artwork fetching. If it's high priority (currently viewed),
// move it to the front; otherwise add to back.
function queueGameArt(gameName, bgId, fgId, containerId, isHighPriority = false) {
  // Don't queue if already cached
  if (artworkCache.has(gameName)) {
    applyGameArt(gameName, bgId, fgId, containerId, artworkCache.get(gameName));
    return;
  }

  // Check if already in queue
  const existing = artFetchQueue.find(item => item.gameName === gameName);
  if (existing) {
    // Update DOM IDs in case they changed, move to priority if needed
    existing.bgId = bgId;
    existing.fgId = fgId;
    existing.containerId = containerId;
    if (isHighPriority && artFetchQueue[0] !== existing) {
      artFetchQueue.splice(artFetchQueue.indexOf(existing), 1);
      artFetchQueue.unshift(existing);
    }
    return;
  }

  const task = { gameName, bgId, fgId, containerId };
  if (isHighPriority) {
    artFetchQueue.unshift(task);
  } else {
    artFetchQueue.push(task);
  }

  processArtQueue();
}

// Process the artwork fetch queue
async function processArtQueue() {
  if (artFetchInProgress || artFetchQueue.length === 0) return;

  artFetchInProgress = true;

  while (artFetchQueue.length > 0) {
    const batch = artFetchQueue.splice(0, MAX_CONCURRENT_ART_FETCHES);
    await Promise.all(batch.map(async task => {
      const { gameName, bgId, fgId, containerId } = task;

      if (artworkCache.has(gameName)) {
        const cachedUrl = artworkCache.get(gameName);
        const appId = artworkCache.get(`appId:${gameName}`);
        applyGameArt(gameName, bgId, fgId, containerId, cachedUrl, appId);
        return;
      }

      const { imageUrl, appId } = await fetchSteamArt(gameName);
      artworkCache.set(gameName, imageUrl);
      applyGameArt(gameName, bgId, fgId, containerId, imageUrl, appId);

      // Add delay before next fetch to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, ART_FETCH_DELAY));
    }));
  }

  artFetchInProgress = false;
}

// High-priority fetch when a user opens a game detail
function loadGameArt(gameName, bgId, fgId, containerId) {
  queueGameArt(gameName, bgId, fgId, containerId, true);
}

// `listChanged` should be true only when the actual set/order of visible
// rows may differ from last time (initial load, search, filter, sort).
// It stays false for a plain open/close toggle, so re-rendering to reflect
// the open row doesn't replay the slide-up entrance animation on every row.
function render(listChanged){
  let items = GAMES.filter(g=>{
    if(state.search && !g.game.toLowerCase().includes(state.search)) return false;
    if(state.ratings.size && !state.ratings.has(g.rating)) return false;
    if(state.models.size && !state.models.has(g.model)) return false;
    if(state.newOnly && !g._isNew) return false;
    return true;
  });

  items.sort((a,b)=>{
    if(state.sort==='name') return a.game.localeCompare(b.game);
    if(state.sort==='rating') return ratingRank(a.rating)-ratingRank(b.rating) || a.game.localeCompare(b.game);
    if(state.sort==='fps') return fpsSortValue(b.fps)-fpsSortValue(a.fps);
    if(state.sort==='submitter') return a.by.localeCompare(b.by) || a.game.localeCompare(b.game);
    if(state.sort==='recent') return (b._firstSeenAt||0)-(a._firstSeenAt||0) || a.game.localeCompare(b.game);
    return 0;
  });

  document.getElementById('resultCount').textContent = items.length + ' / ' + GAMES.length + ' games';

  const listEl = document.getElementById('list');
  if(!items.length){
    listEl.innerHTML = `<div class="empty">No reports match those filters.</div>`;
    previousRenderKeys = new Set();
    return;
  }

  const currentKeys = new Set(items.map(g=>g._id));

  // When list changes (search/filter/sort), queue art for newly visible games
  if (listChanged) {
    items.forEach(g => {
      if (!artworkCache.has(g.game)) {
        queueGameArt(g.game, null, null, null, false);
      }
    });
  }

  listEl.innerHTML = items.map((g, i)=>{
    const key = g._id;
    const isOpen = key === openKey;
    // Only animate rows that weren't visible in the previous render pass,
    // and only when this render was triggered by a real list change.
    const isNew = listChanged && !previousRenderKeys.has(key);
    const delay = isNew ? Math.min(i * 0.04, 0.6) : 0;
    const animClass = isNew ? 'animate-in' : '';
    const animStyle = isNew ? ` style="animation-delay: ${delay}s"` : '';

    // Check if game uses true native Linux runtime (not Proton emulation)
    const isLinuxNative = g.tool && g.tool.toLowerCase().includes('linux') && !g.tool.toLowerCase().includes('proton');
    const linuxBadge = isLinuxNative ? `<span class="linux-native">LINUX NATIVE</span>` : '';
    const newBadge = g._isNew ? `<span class="new-badge">NEW</span>` : '';

    const launchHtml = g.launch
      ? `<div class="launch-block"><div class="k">Launch options</div>
          <div class="launch-row">
            <div class="launch-code">${escapeHtml(g.launch)}</div>
            <button class="copy-btn" data-launch="${encodeURIComponent(g.launch)}">Copy</button>
          </div></div>`
      : '';
    const infoHtml = g.info ? `<div class="info-text">${escapeHtml(g.info)}</div>` : '';

    const steamBtn = `<a class="steam-btn" href="https://store.steampowered.com/search?term=${encodeURIComponent(g.game)}" target="_blank" rel="noopener" onclick="event.stopPropagation()"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.98 0C5.465 0 0 5.466 0 11.985c0 6.52 5.465 11.98 11.98 11.98c6.52 0 11.985-5.46 11.985-11.98C23.965 5.466 18.5 0 11.98 0zm-2.21 15.59c0 .827-.673 1.5-1.5 1.5s-1.5-.673-1.5-1.5v-7.5c0-.827.673-1.5 1.5-1.5s1.5.673 1.5 1.5v7.5zm7.5 0c0 .827-.673 1.5-1.5 1.5s-1.5-.673-1.5-1.5v-7.5c0-.827.673-1.5 1.5-1.5s1.5.673 1.5 1.5v7.5z"/></svg>View on Steam</a>`;

    const linkBtn = `<button class="link-btn" data-slug="${escapeHtml(g._slug)}" title="Copy a link straight to this report" onclick="event.stopPropagation()"><svg viewBox="0 0 24 24" fill="none"><path d="M9 15l6-6M10 6.5l1.3-1.3a3.5 3.5 0 015 5L15 11.5M14 17.5l-1.3 1.3a3.5 3.5 0 01-5-5L9 12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Copy link</button>`;

    return `
    <div class="row ${isOpen?'open':''} ${animClass}" data-key="${encodeURIComponent(key)}" data-name="${escapeHtml(g.game)}"${animStyle}>
      <div class="row-head">
        <span class="chevron">▶</span>
        <div class="row-title">
          <div class="gname">${escapeHtml(g.game)}${newBadge}${linuxBadge}</div>
          <div class="gmeta">${escapeHtml(g.tool)}</div>
        </div>
        <span class="badge ${tierClass(g.rating)}">${g.rating}</span>
        <span class="fps-tag"><b>${escapeHtml(g.fps)}</b> fps</span>
        <span class="model-tag">${escapeHtml(g.model.replace('Switch ',''))}</span>
        <span></span>
      </div>
      <div class="row-body">
        <div class="row-body-inner">
          <div class="row-body-content">
            <div class="spec-col">
              <div class="spec-grid">
                <div class="spec"><div class="k">Switch model</div><div class="v">${escapeHtml(g.model)}</div></div>
                <div class="spec"><div class="k">OC profile</div><div class="v">${escapeHtml(g.oc)}</div></div>
                <div class="spec"><div class="k">RAM OC</div><div class="v">${escapeHtml(g.ram)} MHz</div></div>
                <div class="spec"><div class="k">Compatibility tool</div><div class="v">${escapeHtml(g.tool)}</div></div>
              </div>
              ${launchHtml}
              ${infoHtml}
              <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px;">
                <div class="submitted">Submitted by <b>${escapeHtml(g.by)}</b></div>
                ${steamBtn}
                ${linkBtn}
              </div>
            </div>

            <div class="art-col" id="art-container-${key}">
              <div class="art-skeleton"></div>
              <img id="art-bg-${key}" class="art-img-bg" alt="" aria-hidden="true" />
              <img id="art-fg-${key}" class="art-img-fg" alt="Artwork for ${escapeHtml(g.game)}" />
            </div>

          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  previousRenderKeys = currentKeys;

  listEl.querySelectorAll('.row-head').forEach(head=>{
    head.addEventListener('click', ()=>{
      const row = head.parentElement;
      const key = decodeURIComponent(row.getAttribute('data-key'));
      const gameName = row.getAttribute('data-name');

      openKey = (openKey === key) ? null : key;
      render(false);

      if (openKey === key) {
        const g = GAMES.find(x => x._id === key);
        if (g) updateHash(g._slug);
        loadGameArt(gameName, `art-bg-${key}`, `art-fg-${key}`, `art-container-${key}`);
      } else {
        updateHash(null);
      }
    });
  });

  listEl.querySelectorAll('.copy-btn').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const text = decodeURIComponent(btn.getAttribute('data-launch'));
      navigator.clipboard.writeText(text).then(()=>{
        btn.textContent = 'Copied';
        btn.classList.add('copied');
        setTimeout(()=>{ btn.textContent='Copy'; btn.classList.remove('copied'); }, 1400);
      }).catch(()=>{});
    });
  });

  listEl.querySelectorAll('.link-btn').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const slug = btn.getAttribute('data-slug');
      const g = GAMES.find(x => x._slug === slug);
      if (!g) return;
      const url = gameLinkFor(g);
      const originalHtml = btn.innerHTML;
      navigator.clipboard.writeText(url).then(()=>{
        btn.textContent = 'Link copied ✓';
        btn.classList.add('copied');
        setTimeout(()=>{ btn.innerHTML = originalHtml; btn.classList.remove('copied'); }, 1600);
      }).catch(()=>{});
    });
  });
}

initAccentPicker();
window.addEventListener('hashchange', openFromHash);
fetchSheet();