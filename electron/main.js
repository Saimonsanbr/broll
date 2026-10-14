// broll — main process (Electron, cross-platform: mac/win/linux)
const { app, BrowserWindow, ipcMain, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const Store = require('electron-store');

const store = new Store({ name: 'broll-config' });

const MIN_HEIGHT = 360;
const SEARCH_GAP_MS = 450;   // pausa leve entre buscas (rate-limit)
const DOWNLOAD_GAP_MS = 700; // pausa leve entre downloads em lote
let lastSearchAt = 0;
let downloadQueue = Promise.resolve();

function cacheDir() {
  try {
    const base = app.getPath('videos');
    if (base) return path.join(base, 'BROLL_CACHE');
  } catch {}
  return path.join(app.getPath('userData'), 'BROLL_CACHE');
}

function ensureCache() {
  const dir = cacheDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitize(s) {
  return String(s || 'video').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'video';
}

// qualidade medida pela MENOR dimensão (min w/h): um vertical 1080x1920
// equivale a 1080p, igual um horizontal 1920x1080
const qOf = (f) => Math.min(f.width, f.height);

function pickPexelsFile(videoFiles, maxH) {
  const mp4s = (videoFiles || []).filter(f => (f.file_type || '').includes('mp4') && f.width && f.height && f.link);
  if (!mp4s.length) return null;
  const within = mp4s.filter(f => qOf(f) >= MIN_HEIGHT && qOf(f) <= maxH).sort((a, b) => qOf(b) - qOf(a));
  if (within.length) return within[0];
  const above = mp4s.filter(f => qOf(f) > maxH).sort((a, b) => qOf(a) - qOf(b));
  if (above.length) return above[0];
  return [...mp4s].sort((a, b) => qOf(b) - qOf(a))[0];
}

function pickPixabayRendition(videos, maxH) {
  // videos: { large, medium, small, tiny } cada {url,width,height}
  const order = ['medium', 'small', 'large', 'tiny'];
  const cands = order.map(k => ({ key: k, ...(videos[k] || {}) })).filter(v => v.url && v.width && v.height);
  if (!cands.length) return null;
  const within = cands.filter(v => qOf(v) >= MIN_HEIGHT && qOf(v) <= maxH).sort((a, b) => qOf(b) - qOf(a));
  if (within.length) return within[0];
  const above = cands.filter(v => qOf(v) > maxH).sort((a, b) => qOf(a) - qOf(b));
  if (above.length) return above[0];
  return [...cands].sort((a, b) => qOf(b) - qOf(a))[0];
}

function smallestPreviewPexels(videoFiles) {
  const mp4s = (videoFiles || []).filter(f => (f.file_type || '').includes('mp4') && f.link && f.height);
  if (!mp4s.length) return null;
  return [...mp4s].sort((a, b) => a.height - b.height)[0];
}

async function searchPexels(query, page, perPage, key) {
  const url = `https://api.pexels.com/v1/videos/search?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`;
  const res = await axios.get(url, { headers: { Authorization: key }, timeout: 15000 });
  return res.data;
}

async function searchPixabay(query, page, perPage, key) {
  const url = `https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}&safesearch=true`;
  const res = await axios.get(url, { timeout: 15000 });
  return res.data;
}

// ---- Pexels web (sem chave): endpoint interno do site, headers estáticos, sem sessão ----
const PEXELS_WEB_ID = '4faffa81915014bbd90c420f22898950';
const PEXELS_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
let pexelsWebCooldownUntil = 0;
async function searchPexelsWeb(query, page, perPage) {
  const url = `https://www.pexels.com/api/v3/search/videos?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}&seo_tags=true`;
  const res = await axios.get(url, {
    headers: {
      accept: 'application/json',
      'pexels-client-id': PEXELS_WEB_ID,
      'x-client-type': 'react',
      referer: `https://www.pexels.com/search/videos/${encodeURIComponent(query)}/`,
      'user-agent': PEXELS_UA
    },
    timeout: 15000
  });
  return res.data;
}
function normalizePexelsWeb(v, maxQuality) {
  const a = v.attributes || {};
  const vf = (a.video && a.video.video_files) || [];
  const chosen = pickPexelsFile(vf, maxQuality);
  if (!chosen) return null;
  const user = a.user || {};
  const author = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Pexels';
  const vid = a.id || v.id;
  return {
    id: `pexels-${vid}`,
    source: 'pexels-web',
    width: chosen.width, height: chosen.height,
    q: Math.min(chosen.width, chosen.height),
    duration: a.duration,
    thumb: a.video?.thumbnail?.medium || a.video?.thumbnail?.small,
    previewUrl: a.video?.preview_src || chosen.link,
    downloadUrl: chosen.link,
    author,
    pageUrl: `https://www.pexels.com/video/${vid}/`
  };
}

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1020,
    height: 720,
    minWidth: 820,
    minHeight: 600,
    fullscreenable: false, // sempre em janela, nada de tela cheia
    backgroundColor: '#1c1c1e',
    title: 'broll',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'), // linux/dock
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const dev = !app.isPackaged;
  if (dev) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  ensureCache();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---- IPC: config ----
ipcMain.handle('config:get', () => ({
  pexelsKey: store.get('pexelsKey', ''),
  pixabayKey: store.get('pixabayKey', ''),
  maxQuality: store.get('maxQuality', 1080)
}));
ipcMain.handle('config:set', (_e, patch) => {
  for (const [k, v] of Object.entries(patch || {})) store.set(k, v);
  return true;
});

// ---- IPC: testar chaves (com logs) ----
ipcMain.handle('keys:test', async () => {
  const logs = [];
  const pexelsKey = store.get('pexelsKey', '');
  const pixabayKey = store.get('pixabayKey', '');
  if (pexelsKey) {
    try {
      await searchPexels('nature', 1, 1, pexelsKey);
      logs.push('[pexels] OK — API oficial, chave válida.');
    } catch (err) {
      const s = err?.response?.status;
      logs.push(`[pexels] FALHOU${s ? ` (HTTP ${s})` : ''} — ${s === 401 ? 'chave inválida.' : s === 429 ? 'rate limit (tente de novo em instantes).' : err.message}`);
    }
  } else {
    try {
      await searchPexelsWeb('nature', 1, 1);
      pexelsWebCooldownUntil = 0;
      logs.push('[pexels-web] OK — modo sem chave funcionando.');
    } catch (err) {
      const s = err?.response?.status;
      logs.push(`[pexels-web] FALHOU${s ? ` (HTTP ${s})` : ''} — ${err.message}`);
    }
  }
  if (pixabayKey) {
    try {
      await searchPixabay('nature', 1, 3, pixabayKey);
      logs.push('[pixabay] OK — chave válida.');
    } catch (err) {
      const s = err?.response?.status;
      logs.push(`[pixabay] FALHOU${s ? ` (HTTP ${s})` : ''} — ${s === 429 ? 'rate limit (pausa e tente de novo).' : err.message}`);
    }
  } else logs.push('[pixabay] sem chave configurada.');
  return logs;
});

// ---- ponte de diagnóstico: renderer manda logs só p/ o terminal ----
ipcMain.on('debug:log', (_e, msg) => { try { console.log('[broll:ui]', String(msg).slice(0, 400)); } catch {} });

// ---- IPC: busca unificada (paginação por fonte + pausa anti rate-limit) ----
ipcMain.handle('search:videos', async (_e, { query, pages = { pex: 1, pix: 1 }, perPage = 12 }) => {
  const gap = Date.now() - lastSearchAt;
  if (gap < SEARCH_GAP_MS) await new Promise(r => setTimeout(r, SEARCH_GAP_MS - gap));
  lastSearchAt = Date.now();

  const pexelsKey = store.get('pexelsKey', '');
  const pixabayKey = store.get('pixabayKey', '');
  const maxQuality = Number(store.get('maxQuality', 1080)) || 1080;
  const out = [];
  const errors = [];
  const hasMore = { pex: false, pix: false };
  const fetched = { pex: false, pix: false };
  console.log(`[broll] search:start q="${query}" pages=pex:${pages.pex}/pix:${pages.pix} perPage=${perPage}`);

  if (pexelsKey && pages.pex) {
    try {
      const data = await searchPexels(query, pages.pex, perPage, pexelsKey);
      const total = Number(data.total_results || 0);
      hasMore.pex = total > 0 ? pages.pex * perPage < total : (data.videos || []).length >= perPage;
      fetched.pex = true;
      for (const v of data.videos || []) {
        const chosen = pickPexelsFile(v.video_files, maxQuality);
        const preview = smallestPreviewPexels(v.video_files);
        if (!chosen) continue;
        out.push({
          id: `pexels-${v.id}`,
          source: 'pexels',
          width: chosen.width, height: chosen.height,
          q: Math.min(chosen.width, chosen.height),
          duration: v.duration,
          thumb: v.image,
          previewUrl: (preview && preview.link) || chosen.link,
          downloadUrl: chosen.link,
          author: v.user?.name || 'Pexels',
          pageUrl: v.url
        });
      }
    } catch (err) {
      const s = err?.response?.status;
      errors.push(s === 401 ? 'Pexels: chave inválida.' : s === 429 ? 'Pexels: limite atingido, aguarde e role de novo.' : `Pexels: ${err.message}`);
      hasMore.pex = true; // erro não é fim — tenta de novo no próximo scroll
    }
  } else if (pages.pex && Date.now() < pexelsWebCooldownUntil) {
    hasMore.pex = true;
    errors.push('Pexels web em pausa anti-bloqueio — volta sozinho em instantes, o resto continua funcionando.');
  } else if (pages.pex) {
    try {
      const data = await searchPexelsWeb(query, pages.pex, perPage);
      for (const v of data.data || []) {
        const it = normalizePexelsWeb(v, maxQuality);
        if (it) out.push(it);
      }
      hasMore.pex = (data.data || []).length >= perPage;
      fetched.pex = true;
    } catch (err) {
      const s = err?.response?.status;
      if (s === 429 || s === 403) {
        pexelsWebCooldownUntil = Date.now() + 90000;
        errors.push('Pexels web: limite/bloqueio temporário — pausa de ~90s, o resto continua funcionando.');
      } else errors.push(`Pexels web: ${err.message}`);
      hasMore.pex = true; // erro não é fim — tenta de novo no próximo scroll
    }
  }
  if (pixabayKey && pages.pix) {
    // pequena pausa entre providers
    await new Promise(r => setTimeout(r, 250));
    try {
      const data = await searchPixabay(query, pages.pix, perPage, pixabayKey);
      for (const h of data.hits || []) {
        const chosen = pickPixabayRendition(h.videos || {}, maxQuality);
        if (!chosen) continue;
        out.push({
          id: `pixabay-${h.id}`,
          source: 'pixabay',
          width: chosen.width, height: chosen.height,
          q: Math.min(chosen.width, chosen.height),
          duration: h.duration,
          thumb: chosen.thumbnail || h.videos?.tiny?.thumbnail,
          previewUrl: (h.videos?.tiny?.url || h.videos?.small?.url || chosen.url),
          downloadUrl: chosen.url,
          author: h.user || 'Pixabay',
          pageUrl: h.pageURL
        });
      }
      hasMore.pix = (data.hits || []).length >= perPage;
      fetched.pix = true;
    } catch (err) {
      const s = err?.response?.status;
      errors.push(s === 429 ? 'Pixabay: limite atingido, aguarde e role de novo.' : `Pixabay: ${err.message}`);
      hasMore.pix = true; // erro não é fim — tenta de novo no próximo scroll
    }
  }

  // intercala p/ centralizar as duas fontes no mesmo grid
  const px = out.filter(o => o.source === 'pexels' || o.source === 'pexels-web');
  const pb = out.filter(o => o.source === 'pixabay');
  const merged = [];
  const n = Math.max(px.length, pb.length);
  for (let i = 0; i < n; i++) { if (px[i]) merged.push(px[i]); if (pb[i]) merged.push(pb[i]); }

  console.log(`[broll] search:done q="${query}" → ${merged.length} itens (${px.length}px/${pb.length}pb) hasMore=${hasMore.pex}/${hasMore.pix} fetched=${fetched.pex}/${fetched.pix}${errors.length ? ' ERR: ' + errors.join(' | ') : ''}`);
  return { items: merged, errors, hasMore, fetched, pexelsMode: pexelsKey ? 'api' : 'web', hasPixabay: Boolean(pixabayKey) };
});

// ---- IPC: download (fila com pausa leve + progresso) ----
ipcMain.handle('video:download', (_e, { item, query }) => new Promise((resolve) => {
  downloadQueue = downloadQueue.then(async () => {
    await new Promise(r => setTimeout(r, DOWNLOAD_GAP_MS * 0.4));
    const dir = ensureCache();
    const fname = `${sanitize(query)}-${item.id}-${item.width}x${item.height}.mp4`;
    const filePath = path.join(dir, fname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
      if (win) win.webContents.send('video:progress', { id: item.id, pct: 100 });
      resolve({ filePath }); return;
    }
    try {
      const res = await axios.get(item.downloadUrl, { responseType: 'stream', timeout: 60000 });
      const total = Number(res.headers['content-length'] || 0);
      await new Promise((res2, rej) => {
        const w = fs.createWriteStream(filePath);
        let done = 0;
        res.data.on('data', (c) => {
          done += c.length;
          if (total && win) win.webContents.send('video:progress', { id: item.id, pct: Math.round(done / total * 100) });
        });
        res.data.pipe(w);
        w.on('finish', res2); w.on('error', rej); res.data.on('error', rej);
      });
      if (win) win.webContents.send('video:progress', { id: item.id, pct: 100 });
      resolve({ filePath });
    } catch (err) {
      try { fs.unlinkSync(filePath); } catch {}
      resolve({ error: String(err.message || err) });
    }
  });
}));

ipcMain.handle('video:local-path', (_e, { item, query }) => {
  const dir = ensureCache();
  const p = path.join(dir, `${sanitize(query)}-${item.id}-${item.width}x${item.height}.mp4`);
  return fs.existsSync(p) ? p : null;
});

// ---- drag nativo: renderer faz send('drag:start', {filePath, id}) no ondragstart ----
const DRAG_ICON = path.join(__dirname, '..', 'assets', 'drag-icon.png');
function thumbsDir() {
  const dir = path.join(ensureCache(), '.thumbs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function thumbPathFor(id) {
  return path.join(thumbsDir(), `${sanitize(id)}.jpg`);
}
function dragIconFor(id) {
  // fantasma do arrasto = thumbnail do vídeo; fallback = ícone do app
  try {
    const p = thumbPathFor(id);
    if (fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p).resize({ width: 320 });
      if (!img.isEmpty()) return img;
    }
  } catch {}
  return nativeImage.createFromPath(DRAG_ICON);
}
ipcMain.on('drag:start', (e, { filePath, id }) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      console.error('[broll] drag:start arquivo inexistente:', filePath);
      return;
    }
    e.sender.startDrag({ file: filePath, icon: dragIconFor(id) });
    console.log('[broll] drag nativo iniciado:', filePath);
  } catch (err) {
    console.error('[broll] startDrag falhou:', err);
  }
});

// baixa a thumbnail em background (disparado ao clicar p/ baixar o vídeo),
// pra ela já estar local na hora do arrasto — startDrag precisa ser síncrono
ipcMain.handle('thumb:prefetch', async (_e, { id, thumbUrl }) => {
  try {
    if (!thumbUrl) return false;
    const dest = thumbPathFor(id);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return true;
    const res = await axios.get(thumbUrl, { responseType: 'arraybuffer', timeout: 20000 });
    fs.writeFileSync(dest, Buffer.from(res.data));
    return true;
  } catch { return false; }
});

ipcMain.handle('cache:info', () => {
  const dir = ensureCache();
  let bytes = 0, count = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      try { const st = fs.statSync(path.join(dir, f)); if (st.isFile()) { bytes += st.size; count++; } } catch {}
    }
  } catch {}
  return { dir, bytes, count };
});
ipcMain.handle('cache:open', () => { shell.openPath(ensureCache()); return true; });
ipcMain.handle('cache:clear', () => {
  const dir = ensureCache();
  try { for (const f of fs.readdirSync(dir)) { try { fs.rmSync(path.join(dir, f), { recursive: true, force: true }); } catch {} } } catch {}
  return true;
});
