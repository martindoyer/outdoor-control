/* ---------- Local settings (client-side, non-secret) ---------- */
const SETTINGS_KEY = 'outdoor-control-settings';

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
  catch { return {}; }
}
function saveSettings(patch) {
  const current = loadSettings();
  const next = { ...current, ...patch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

let settings = loadSettings();
let supabase = null;

function initSupabase() {
  if (settings.supabaseUrl && settings.supabaseKey && window.supabase) {
    supabase = window.supabase.createClient(settings.supabaseUrl, settings.supabaseKey);
  }
}
initSupabase();

/* ---------- Settings modal ---------- */
const modal = document.getElementById('settingsModal');
document.getElementById('settingsBtn').addEventListener('click', () => {
  document.getElementById('spotifyClientId').value = settings.spotifyClientId || '';
  document.getElementById('supabaseUrl').value = settings.supabaseUrl || '';
  document.getElementById('supabaseKey').value = settings.supabaseKey || '';
  document.getElementById('redirectUriHint').textContent = window.location.origin + '/';
  modal.classList.add('is-open');
});
document.getElementById('closeSettings').addEventListener('click', () => modal.classList.remove('is-open'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('is-open'); });

document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
  settings = saveSettings({
    spotifyClientId: document.getElementById('spotifyClientId').value.trim(),
    supabaseUrl: document.getElementById('supabaseUrl').value.trim(),
    supabaseKey: document.getElementById('supabaseKey').value.trim(),
  });
  initSupabase();

  // Save any renamed devices
  const rows = document.querySelectorAll('#deviceNameList .device-name-row');
  for (const row of rows) {
    const uuid = row.dataset.uuid;
    const name = row.querySelector('input').value.trim();
    if (uuid && name && supabase) {
      await supabase.from('outdoor_devices').upsert({ uuid, custom_name: name });
    }
  }
  modal.classList.remove('is-open');
  loadLights();
});

document.getElementById('refreshDevicesBtn').addEventListener('click', loadLights);

/* ---------- Meross lights ---------- */
const lightsGrid = document.getElementById('lightsGrid');
const lightsEmpty = document.getElementById('lightsEmpty');

function bulbIcon(isOn) {
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.45 1 1.15 1 1.9V16h5v-.2c0-.75.4-1.45 1-1.9A6 6 0 0 0 12 3Z"/>
  </svg>`;
}

async function loadLights() {
  let nameOverrides = {};
  if (supabase) {
    const { data } = await supabase.from('outdoor_devices').select('uuid, custom_name');
    (data || []).forEach(d => { nameOverrides[d.uuid] = d.custom_name; });
  }

  let devices = [];
  try {
    const res = await fetch('/.netlify/functions/meross-devices');
    if (!res.ok) throw new Error(await res.text());
    devices = await res.json();
  } catch (err) {
    lightsEmpty.textContent = 'Could not reach Meross — check the server-side credentials (see README).';
    lightsEmpty.style.display = 'block';
    console.error(err);
    return;
  }

  if (!devices.length) {
    lightsEmpty.style.display = 'block';
    return;
  }
  lightsEmpty.style.display = 'none';

  lightsGrid.innerHTML = '';
  const nameListEl = document.getElementById('deviceNameList');
  nameListEl.innerHTML = '';

  devices.forEach(dev => {
    const card = document.createElement('button');
    card.className = 'light-card' + (dev.isOn ? ' is-on' : '');
    card.innerHTML = `
      <div class="light-card__bulb">${bulbIcon(dev.isOn)}</div>
      <div>
        <div class="light-card__name">${nameOverrides[dev.uuid] || dev.name}</div>
        <div class="light-card__state">${dev.isOn ? 'On' : 'Off'}</div>
      </div>
      ${dev.dimmable ? `<input type="range" min="1" max="100" value="${dev.brightness || 100}" class="light-card__slider" data-uuid="${dev.uuid}" />` : ''}
    `;
    card.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      toggleLight(dev.uuid, !dev.isOn);
    });
    const slider = card.querySelector('.light-card__slider');
    if (slider) {
      slider.addEventListener('click', e => e.stopPropagation());
      slider.addEventListener('change', () => setBrightness(dev.uuid, Number(slider.value)));
    }
    lightsGrid.appendChild(card);

    const row = document.createElement('div');
    row.className = 'device-name-row';
    row.dataset.uuid = dev.uuid;
    row.innerHTML = `<span>${dev.name}</span><input type="text" value="${nameOverrides[dev.uuid] || dev.name}" />`;
    nameListEl.appendChild(row);
  });
}

async function toggleLight(uuid, on) {
  await fetch('/.netlify/functions/meross-control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uuid, action: 'toggle', on }),
  });
  loadLights();
}

async function setBrightness(uuid, brightness) {
  await fetch('/.netlify/functions/meross-control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uuid, action: 'brightness', brightness }),
  });
}

loadLights();

/* ---------- Spotify (PKCE + Web Playback SDK) ---------- */
const SPOTIFY_TOKEN_KEY = 'outdoor-spotify-tokens';

function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function pkceChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64url(digest);
}
function randomString(len = 64) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return base64url(arr).slice(0, len);
}

document.getElementById('spotifyConnectBtn').addEventListener('click', async () => {
  if (!settings.spotifyClientId) {
    alert('Add your Spotify Client ID in Settings first.');
    modal.classList.add('is-open');
    return;
  }
  const verifier = randomString(64);
  sessionStorage.setItem('spotify_verifier', verifier);
  const challenge = await pkceChallenge(verifier);

  const params = new URLSearchParams({
    client_id: settings.spotifyClientId,
    response_type: 'code',
    redirect_uri: window.location.origin + '/',
    scope: 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state',
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  window.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
});

async function exchangeCodeForToken(code) {
  const verifier = sessionStorage.getItem('spotify_verifier');
  const body = new URLSearchParams({
    client_id: settings.spotifyClientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: window.location.origin + '/',
    code_verifier: verifier,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (json.access_token) {
    localStorage.setItem(SPOTIFY_TOKEN_KEY, JSON.stringify({ ...json, obtained: Date.now() }));
  }
  return json;
}

async function getValidSpotifyToken() {
  const raw = localStorage.getItem(SPOTIFY_TOKEN_KEY);
  if (!raw) return null;
  const tok = JSON.parse(raw);
  const age = (Date.now() - tok.obtained) / 1000;
  if (age < tok.expires_in - 60) return tok.access_token;

  // refresh
  const body = new URLSearchParams({
    client_id: settings.spotifyClientId,
    grant_type: 'refresh_token',
    refresh_token: tok.refresh_token,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (json.access_token) {
    const merged = { ...tok, ...json, obtained: Date.now() };
    localStorage.setItem(SPOTIFY_TOKEN_KEY, JSON.stringify(merged));
    return merged.access_token;
  }
  return null;
}

let player, deviceId;

function loadSpotifySDK() {
  return new Promise((resolve) => {
    if (window.Spotify) return resolve();
    window.onSpotifyWebPlaybackSDKReady = resolve;
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    document.body.appendChild(s);
  });
}

async function initSpotifyPlayer() {
  const token = await getValidSpotifyToken();
  if (!token) return;

  document.getElementById('spotifyConnectBtn').textContent = 'Connected';
  await loadSpotifySDK();

  player = new Spotify.Player({
    name: 'Patio Speaker',
    getOAuthToken: cb => cb(token),
    volume: 0.6,
  });

  player.addListener('ready', ({ device_id }) => { deviceId = device_id; });
  player.addListener('player_state_changed', (state) => {
    if (!state) return;
    const track = state.track_window.current_track;
    document.getElementById('trackName').textContent = track.name;
    document.getElementById('trackArtist').textContent = track.artists.map(a => a.name).join(', ');
    document.getElementById('trackArt').src = track.album.images[0]?.url || '';
    document.getElementById('playIcon').innerHTML = state.paused
      ? '<path d="M8 5v14l11-7z"/>'
      : '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';
  });

  await player.connect();
}

document.getElementById('playBtn').addEventListener('click', () => player && player.togglePlay());
document.getElementById('nextBtn').addEventListener('click', () => player && player.nextTrack());
document.getElementById('prevBtn').addEventListener('click', () => player && player.previousTrack());

(async function bootSpotify() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  if (code) {
    await exchangeCodeForToken(code);
    window.history.replaceState({}, '', window.location.origin + '/');
  }
  initSpotifyPlayer();
})();

/* ---------- Ambient sky: shift with real local time ---------- */
(function ambientSky() {
  const hour = new Date().getHours();
  const sky = document.getElementById('sky');
  // brighten slightly during golden hour, darken late night
  if (hour >= 18 && hour <= 20) sky.style.filter = 'brightness(1.15) saturate(1.1)';
  else if (hour >= 21 || hour <= 5) sky.style.filter = 'brightness(0.85)';
})();
