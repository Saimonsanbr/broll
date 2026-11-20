// broll — electron/images.js
// Backend de busca de IMAGENS (Fase 3). Módulo Node puro (sem Electron),
// para poder ser testado com `node` direto.
//
// Fontes:
// - Pexels fotos: API oficial (se houver chave) ou endpoint web interno
//   (mesmo esquema dos vídeos; a Pexels pausou a emissão de novas chaves).
// - Pixabay imagens: mesma chave dos vídeos (`image_type=photo`).
// - Wikimedia Commons: API pública, sem chave, com metadados de licença.
//
// Regras de licença (Commons): allowlist CC0/PD/CC BY/CC BY-SA/FAL.
// NC, ND, fair use, "all rights reserved" ou licença desconhecida = ignora.
// Pexels e Pixabay são licenças livres sem atribuição: nunca geram crédito.
const axios = require('axios');

const COMMONS_UA = 'broll/0.2 (https://github.com/Saimonsanbr/broll)';
// garante o UA descritivo mesmo quando este módulo é usado fora do main
// (upload.wikimedia.org retorna 403 sem User-Agent)
if (!axios.defaults.headers.common['User-Agent']) {
  axios.defaults.headers.common['User-Agent'] = COMMONS_UA;
}

// faixa de tamanho aceita (menor lado >= 480; maior lado <= 6000;
// menor lado <= 4000) — decisão I7/I8
const MIN_SIDE = 480;
const MAX_MIN_SIDE = 4000;
const MAX_MAX_SIDE = 6000;

function fitsSize(w, h) {
  if (!w || !h) return false;
  const mn = Math.min(w, h), mx = Math.max(w, h);
  return mn >= MIN_SIDE && mn <= 12000 && mx <= 12000;
}

// largura alvo do download: cabe na caixa 4000x6000 sem upscale
function targetWidth(w, h) {
  const s = Math.min(1, MAX_MIN_SIDE / Math.min(w, h), MAX_MAX_SIDE / Math.max(w, h));
  return Math.max(480, Math.round(w * s));
}

function cleanHtml(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCharCode(Number(n)); } catch { return ''; }
    })
    .replace(/\s+/g, ' ').trim();
}

// ---- Pexels fotos: API oficial ----
async function searchPexelsPhotosApi(query, page, perPage, key) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`;
  const res = await axios.get(url, { headers: { Authorization: key }, timeout: 15000 });
  return res.data;
}

function normalizePexelsPhotoApi(p) {
  const w = p.width, h = p.height;
  if (!fitsSize(w, h)) return null;
  const src = p.src || {};
  // original se couber na caixa, senão large2x/large
  const dl = (w <= MAX_MAX_SIDE && h <= MAX_MAX_SIDE && Math.min(w, h) <= MAX_MIN_SIDE && src.original)
    ? src.original : (src.large2x || src.large || src.original);
  if (!dl) return null;
  const user = p.photographer || 'Pexels';
  return {
    id: `pexels-img-${p.id}`, kind: 'image', source: 'pexels',
    width: w, height: h,
    thumb: src.medium || src.small, previewUrl: src.large || src.medium,
    downloadUrl: dl,
    author: user, pageUrl: p.url || `https://www.pexels.com/photo/${p.id}/`,
    license: { shortName: 'Pexels', attributionRequired: false, shareAlike: false }
  };
}

// ---- Pexels fotos: endpoint web interno (sem chave) ----
const PEXELS_WEB_ID = '4faffa81915014bbd90c420f22898950';
const PEXELS_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';

async function searchPexelsPhotosWeb(query, page, perPage) {
  const url = `https://www.pexels.com/api/v3/search/photos?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}&seo_tags=true`;
  const res = await axios.get(url, {
    headers: {
      accept: 'application/json',
      'pexels-client-id': PEXELS_WEB_ID,
      'x-client-type': 'react',
      referer: `https://www.pexels.com/search/photos/${encodeURIComponent(query)}/`,
      'user-agent': PEXELS_UA
    },
    timeout: 15000
  });
  return res.data;
}

function pexelsWebSizedUrl(img, id, w, h) {
  // CDN do Pexels aceita w= arbitrário; troca o w= da URL large
  try {
    if (img && img.large && img.large.includes('images.pexels.com')) {
      const u = new URL(img.large);
      u.searchParams.set('w', String(targetWidth(w, h)));
      return u.toString();
    }
  } catch {}
  if (img && img.download_link) return img.download_link;
  return (img && (img.large || img.medium)) || null;
}

function normalizePexelsPhotoWeb(v) {
  const a = v.attributes || {};
  const w = a.width, h = a.height;
  if (!fitsSize(w, h)) return null;
  const img = a.image || {};
  const dl = pexelsWebSizedUrl(img, a.id, w, h);
  if (!dl) return null;
  const user = a.user || {};
  const author = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Pexels';
  return {
    id: `pexels-img-${a.id}`, kind: 'image', source: 'pexels-web',
    width: w, height: h,
    thumb: img.medium || img.small, previewUrl: img.large || img.medium,
    downloadUrl: dl,
    author, pageUrl: `https://www.pexels.com/photo/${a.id}/`,
    license: { shortName: 'Pexels', attributionRequired: false, shareAlike: false }
  };
}

// ---- Pixabay imagens ----
async function searchPixabayImages(query, page, perPage, key) {
  const url = `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&image_type=photo&page=${page}&per_page=${perPage}&safesearch=true`;
  const res = await axios.get(url, { timeout: 15000 });
  return res.data;
}

function normalizePixabayImage(h) {
  const w = h.imageWidth, ht = h.imageHeight;
  if (!fitsSize(w, ht)) return null;
  const dl = h.largeImageURL || h.webformatURL;
  if (!dl) return null;
  return {
    id: `pixabay-img-${h.id}`, kind: 'image', source: 'pixabay',
    width: w, height: ht,
    thumb: h.previewURL || h.webformatURL, previewUrl: h.webformatURL || h.largeImageURL,
    downloadUrl: dl,
    author: h.user || 'Pixabay', pageUrl: h.pageURL,
    license: { shortName: 'Pixabay', attributionRequired: false, shareAlike: false }
  };
}

// ---- Wikimedia Commons ----
const IMG_EXT_RE = /\.(jpe?g|png|webp)$/i;

function parseCommonsLicense(ext) {
  const short = cleanHtml(ext.LicenseShortName && ext.LicenseShortName.value);
  const url = cleanHtml(ext.LicenseUrl && ext.LicenseUrl.value);
  const licId = cleanHtml(ext.License && ext.License.value);
  const attrReq = cleanHtml(ext.AttributionRequired && ext.AttributionRequired.value) === 'true';
  const hay = `${short} ${licId}`;
  // nega primeiro (fail closed)
  if (/non[\s-]?commercial|\bNC\b|no[\s-]?deriv|\bND\b|fair.use|all.rights.reserved/i.test(hay)) {
    return { allowed: false };
  }
  let m = null;
  if (/cc-?0|public.domain|\bpd\b|pd-old|pd-us|pd-self/i.test(hay)) m = { attribution: false, shareAlike: false };
  else if (/cc[-\s]?by[-\s]?sa|by-sa/i.test(hay)) m = { attribution: true, shareAlike: true };
  else if (/cc[-\s]?by\b/i.test(hay)) m = { attribution: true, shareAlike: false };
  else if (/free.art|art.libre|\bFAL\b/i.test(hay)) m = { attribution: true, shareAlike: true };
  else return { allowed: false };
  if (attrReq) m.attribution = true;
  return { allowed: true, shortName: short || licId || 'Commons', url, ...m };
}

function commonsArtist(ext) {
  const a = cleanHtml(ext.Artist && ext.Artist.value);
  if (a && !/^unknown/i.test(a)) return a.slice(0, 120);
  const c = cleanHtml(ext.Credit && ext.Credit.value);
  if (c && !/^own work$/i.test(c)) return c.slice(0, 120);
  return 'Wikimedia Commons';
}

function normalizeCommonsHit(pageid, title, ii) {
  if (!IMG_EXT_RE.test(title || '')) return null;
  const w = ii.width, h = ii.height;
  if (!fitsSize(w, h)) return null;
  const ext = ii.extmetadata || {};
  const lic = parseCommonsLicense(ext);
  if (!lic.allowed) return null;
  const artist = commonsArtist(ext);
  const short = lic.shortName || 'Commons';
  return {
    id: `commons-${pageid}`, kind: 'image', source: 'wikimedia',
    width: w, height: h,
    thumb: ii.thumburl, previewUrl: ii.thumburl,
    // download em alta resolvido na hora de baixar (getCommonsFileUrl)
    downloadWidth: Math.min(2560, targetWidth(w, h)),
    fileTitle: title,
    author: artist, pageUrl: ii.descriptionurl,
    license: { shortName: short, url: lic.url, attributionRequired: lic.attribution, shareAlike: lic.shareAlike },
    attribution: lic.attribution ? { text: `${artist} · Wikimedia Commons · ${short}` } : null
  };
}

async function searchCommonsImages(query, offset, perPage) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search',
    gsrsearch: `filetype:bitmap ${query}`, gsrnamespace: '6',
    gsrlimit: String(perPage), gsroffset: String(offset),
    prop: 'imageinfo', iiprop: 'url|size|extmetadata',
    iiurlwidth: '640'
  });
  const res = await axios.get(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
    headers: { 'User-Agent': COMMONS_UA }, timeout: 20000
  });
  const data = res.data || {};
  const pages = (data.query && data.query.pages) || {};
  const items = [];
  let skippedLicense = 0, skippedSize = 0;
  for (const [pageid, p] of Object.entries(pages)) {
    const ii = (p.imageinfo && p.imageinfo[0]) || null;
    if (!ii || !ii.thumburl) { skippedSize++; continue; }
    const it = normalizeCommonsHit(pageid, p.title, ii);
    if (!it) {
      if (!IMG_EXT_RE.test(p.title || '') || !(ii.width >= MIN_SIDE && ii.height >= MIN_SIDE)) skippedSize++;
      else skippedLicense++;
      continue;
    }
    items.push(it);
  }
  const nextOffset = data.continue && data.continue.gsroffset;
  return { items, skippedLicense, skippedSize, nextOffset: nextOffset != null ? Number(nextOffset) : null };
}

// URL do arquivo em alta para download (chamado na hora de baixar)
async function getCommonsFileUrl(fileTitle, width) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', titles: fileTitle,
    prop: 'imageinfo', iiprop: 'url|size', iiurlwidth: String(width || 2560)
  });
  const res = await axios.get(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
    headers: { 'User-Agent': COMMONS_UA }, timeout: 20000
  });
  const pages = ((res.data || {}).query || {}).pages || {};
  const first = Object.values(pages)[0] || {};
  const ii = (first.imageinfo && first.imageinfo[0]) || {};
  return ii.thumburl || ii.url || null;
}

module.exports = {
  MIN_SIDE, MAX_MIN_SIDE, MAX_MAX_SIDE,
  fitsSize, targetWidth, cleanHtml, parseCommonsLicense,
  searchPexelsPhotosApi, normalizePexelsPhotoApi,
  searchPexelsPhotosWeb, normalizePexelsPhotoWeb,
  searchPixabayImages, normalizePixabayImage,
  searchCommonsImages, normalizeCommonsHit, getCommonsFileUrl
};
