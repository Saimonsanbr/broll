const $ = (s) => document.querySelector(s);
// log só p/ terminal (via main) + devtools — nada na interface
const tlog = (m) => { try { console.log('[broll:ui]', m); window.broll.debugLog(m); } catch {} };

// libera o decoder/rede do preview ao sair do hover — evita acumular players e travar o scroll
function releasePreview(video) {
  try {
    video.pause();
    video.removeAttribute('src');
    video.load();
  } catch {}
}

const state = {
  query: '', perPage: 12, loading: false,
  vpex: 1, vpix: 1, ipex: 1, ipix: 1, icom: 1,
  hasMoreV: { pex: true, pix: true },
  hasMoreI: { pex: true, pix: true, com: true },
  items: new Map(), // id -> {data, status: 'remote'|'downloading'|'ready', filePath, pct}
};
let epoch = 0; // invalida buscas antigas quando uma nova pesquisa começa

async function refreshConfigUI() {
  const cfg = await window.broll.getConfig();
  $('#inPexels').value = cfg.pexelsKey || '';
  $('#inPixabay').value = cfg.pixabayKey || '';
  $('#inFfmpeg').value = cfg.ffmpegPath || '';
  $('#inMagick').value = cfg.magickPath || '';
  $('#selQuality').value = String(cfg.maxQuality || 1080);
  $('#qualityBadge').textContent = `max ${cfg.maxQuality || 1080}p`;
  const noPixabay = !cfg.pixabayKey;
  $('#keyWarn').classList.toggle('hidden', !noPixabay);
  $('#btnConfig').classList.toggle('attention', noPixabay);
  const info = await window.broll.cacheInfo();
  $('#cacheInfo').textContent = `${info.count} arquivos · ${(info.bytes / 1048576).toFixed(1)} MB · ${info.dir}`;
  $('#originalsInfo').textContent = `originais de segurança: ${info.originalsDir || ''} (preservados no limpar cache)`;
  await refreshToolsUI();
}

async function refreshToolsUI() {
  const el = $('#toolsInfo');
  if (!el) return;
  try {
    const t = await window.broll.getTools();
    if (!t || t.error) { el.textContent = 'não foi possível detectar.'; return; }
    const f = t.ffmpeg, m = t.magick;
    const lines = [
      `ffmpeg: ${f.found ? `ok (${f.version || f.path})` : 'não encontrado — instale ou informe o caminho'}`,
      `magick: ${m.found ? `ok (${m.version || m.path})` : 'não encontrado — instale ou informe o caminho'}`,
      t.videoCreditOk ? 'crédito em vídeo: pronto (overlay, sem drawtext)' : 'crédito em vídeo: indisponível (falta ffmpeg ou magick)'
    ];
    el.textContent = lines.join('\n');
  } catch { el.textContent = 'não foi possível detectar.'; }
}

function openDrawer() { $('#drawer').classList.remove('hidden'); $('#scrim').classList.remove('hidden'); }
function closeDrawer() { $('#drawer').classList.add('hidden'); $('#scrim').classList.add('hidden'); }

function setModeResults(on) {
  $('#home').classList.toggle('hidden', on);
  $('#topbar').classList.toggle('hidden', !on);
  $('#results').classList.toggle('hidden', !on);
}

function notice(msgs) {
  const box = $('#notice'); box.innerHTML = '';
  for (const m of msgs || []) {
    const d = document.createElement('div'); d.className = 'note'; d.textContent = m; box.appendChild(d);
  }
}

function noticeAppend(msgs) {
  const box = $('#notice');
  for (const m of msgs || []) {
    const last = box.lastChild;
    if (last && last.textContent === m) continue; // sem repetir o mesmo aviso
    const d = document.createElement('div'); d.className = 'note'; d.textContent = m; box.appendChild(d);
  }
  while (box.children.length > 3) box.firstChild.remove();
}

function updateTail(showLoader) {
  const el = $('#loadingMore');
  if (!el) return;
  const mV = state.hasMoreV, mI = state.hasMoreI;
  const finished = !mV.pex && !mV.pix && !mI.pex && !mI.pix && !mI.com && state.items.size > 0;
  if (showLoader) {
    el.classList.remove('hidden'); el.classList.remove('done');
    el.innerHTML = '<span class="spin"></span>carregando mais resultados…';
  } else if (finished) {
    el.classList.remove('hidden'); el.classList.add('done');
    el.textContent = 'fim dos resultados';
  } else {
    el.classList.add('hidden'); el.classList.remove('done');
  }
}

// ícone de tipo: só UI, nunca vai para o arquivo exportado
function kindIcon(kind) {
  if (kind === 'image') {
    return '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9.5" cy="10.5" r="1.5" fill="currentColor"/><path d="M5 17l4.5-4.5 3.5 3.5 3-3L20 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  }
  return '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.5 9.5l5 2.5-5 2.5z" fill="currentColor"/></svg>';
}

function cardEl(item) {
  const isImg = item.kind === 'image';
  const card = document.createElement('div');
  card.className = 'card' + (isImg ? ' image' : ''); card.dataset.id = item.id;
  const badge = (item.source === 'wikimedia' && item.license)
    ? `<span class="lic" title="Licença: ${item.license.shortName || ''}">${item.license.shortName || ''}</span>` : '';
  const corner = isImg
    ? `<span class="dur">${item.width}×${item.height}</span>`
    : `<span class="dur">${item.duration ? item.duration + 's' : ''} · ${item.q || item.height}p</span>`;
  card.innerHTML = `
    <span class="kind" title="${isImg ? 'imagem' : 'vídeo'}">${kindIcon(item.kind)}</span>
    ${isImg
      ? `<img draggable="false" loading="lazy" src="${item.thumb || ''}" alt="" />`
      : `<video muted loop playsinline preload="none" draggable="false" poster="${item.thumb || ''}"></video>`}
    ${corner}
    ${badge}
    <div class="prog hidden">0%</div>
    <div class="meta"><span class="src">${item.source}</span><span class="au" title="${item.author}">${item.author}</span></div>`;
  const media = card.querySelector(isImg ? 'img' : 'video');
  let thumbAsked = false;
  if (isImg) {
    // hover = preview maior; pronto = arquivo local (sem swap)
    let swapped = false;
    card.addEventListener('mouseenter', () => {
      if (!thumbAsked) { thumbAsked = true; window.broll.prefetchThumb({ id: item.id, thumbUrl: item.thumb }); }
      const st = state.items.get(item.id);
      if (st && st.status === 'ready') return;
      if (!swapped && item.previewUrl && media.src !== item.previewUrl) {
        media.dataset.thumb = media.src;
        media.src = item.previewUrl;
        swapped = true;
      }
    });
    card.addEventListener('mouseleave', () => {
      if (swapped && media.dataset.thumb) { media.src = media.dataset.thumb; swapped = false; }
    });
  } else {
    const video = media;
    // o <video> é draggable por padrão no Chromium e pode roubar o drag do card
    video.draggable = false;

    // hover = stream remoto, sem baixar
    card.addEventListener('mouseenter', () => {
      // baixa a thumb só do card que o mouse tocou (fantasma do arrasto),
      // em vez de disparar uma requisição para cada resultado da busca
      if (!thumbAsked) { thumbAsked = true; window.broll.prefetchThumb({ id: item.id, thumbUrl: item.thumb }); }
      if (!video.src) video.src = item.previewUrl;
      video.play().catch(() => {});
    });
    // ao sair, libera a mídia; sem isso os players se acumulam e o renderer engasga
    card.addEventListener('mouseleave', () => releasePreview(video));
  }

  // 1 clique = baixa (com overlay %)
  card.addEventListener('click', async (e) => {
    if (e.target.closest('.au')) return; // clique no autor abre página, não baixa
    await downloadItem(item.id);
  });

  // clique no autor = atribuição (abre página original)
  card.querySelector('.au').addEventListener('click', (e) => {
    e.stopPropagation();
    if (item.pageUrl) window.broll.openExternal(item.pageUrl);
  });

  // arrastar SÓ depois de pronto (arquivo local).
  // O preventDefault é obrigatório: sem ele o drag HTML5 assume a sessão
  // do mouse (só a imagem do card, sem arquivo) e o drag nativo morre —
  // visualmente arrasta, mas nenhum app externo aceita o drop.
  card.addEventListener('dragstart', (e) => {
    e.preventDefault();
    const st = state.items.get(item.id);
    if (!st || st.status !== 'ready' || !st.filePath) return;
    window.broll.startDrag({ filePath: st.filePath, id: item.id });
  });
  return card;
}

function renderItem(item, batchIdx = 0) {
  if (state.items.has(item.id)) return;
  state.items.set(item.id, { data: item, status: 'remote', filePath: null, pct: 0 });
  const el = cardEl(item);
  el.style.animationDelay = `${Math.min(batchIdx, 11) * 35}ms`;
  $('#grid').appendChild(el);
}

async function runSearch(reset) {
  const q = state.query.trim();
  if (!q) return;
  if (reset) {
    state.vpex = 1; state.vpix = 1;
    state.ipex = 1; state.ipix = 1; state.icom = 1;
    state.hasMoreV = { pex: true, pix: true };
    state.hasMoreI = { pex: true, pix: true, com: true };
    state.items.clear();
    $('#grid').querySelectorAll('video').forEach(releasePreview);
    $('#grid').innerHTML = ''; $('#empty').classList.add('hidden');
  }
  const mV = state.hasMoreV, mI = state.hasMoreI;
  const wantV = mV.pex || mV.pix, wantI = mI.pex || mI.pix || mI.com;
  if (!wantV && !wantI) { tlog(`search skip reset=${reset}: fontes esgotadas`); return; }
  if (!reset && state.loading) { tlog('search skip: já carregando'); return; }
  const my = ++epoch; // toda chamada aceita vira dona; a anterior vira obsoleta sem travar o loading
  state.loading = true;
  tlog(`search start reset=${reset} vpex:${mV.pex ? state.vpex : 0} vpix:${mV.pix ? state.vpix : 0} ipex:${mI.pex ? state.ipex : 0} ipix:${mI.pix ? state.ipix : 0} icom:${mI.com ? state.icom : 0}`);
  try {
    updateTail(!reset);
    const pagesV = { pex: mV.pex ? state.vpex : 0, pix: mV.pix ? state.vpix : 0 };
    const pagesI = { pex: mI.pex ? state.ipex : 0, pix: mI.pix ? state.ipix : 0, com: mI.com ? state.icom : 0 };
    const [rv, ri] = await Promise.all([
      wantV ? window.broll.search({ query: q, pages: pagesV, perPage: state.perPage })
            : { items: [], errors: [], hasMore: { pex: false, pix: false }, fetched: { pex: false, pix: false }, pexelsMode: 'web', hasPixabay: false },
      wantI ? window.broll.searchImages({ query: q, pages: pagesI, perPage: state.perPage })
            : { items: [], errors: [], hasMore: { pex: false, pix: false, com: false }, fetched: { pex: false, pix: false, com: false } }
    ]);
    if (my !== epoch) { tlog('search descartada (obsoleta)'); return; } // pesquisa antiga: descarta
    const errors = [...(rv.errors || []), ...(ri.errors || [])];
    if (reset) {
      notice(errors);
      $('#credit').innerHTML = `Fontes: <span>Pexels (${rv.pexelsMode === 'api' ? 'API oficial' : 'web sem chave'})</span>${rv.hasPixabay ? ' · <span>Pixabay (API)</span>' : ''} · <span>Wikimedia Commons</span> — crédito ao autor em cada card.`;
    } else if (errors.length) noticeAppend(errors);
    // intercala vídeos e imagens no grid
    const vids = rv.items || [], imgs = ri.items || [];
    const all = [];
    const n = Math.max(vids.length, imgs.length);
    for (let i = 0; i < n; i++) { if (vids[i]) all.push(vids[i]); if (imgs[i]) all.push(imgs[i]); }
    if (reset && !all.length) $('#empty').classList.remove('hidden');
    state.hasMoreV = rv.hasMore; state.hasMoreI = ri.hasMore;
    all.forEach((it, i) => renderItem(it, i));
    // marca os já em cache como prontos (sem re-baixar) + thumb local p/ o fantasma do arrasto
    for (const it of all) {
      const p = it.kind === 'image'
        ? await window.broll.imageLocalPath({ item: it, query: q })
        : await window.broll.localPath({ item: it, query: q });
      if (p) {
        markReady(it.id, p);
        window.broll.prefetchThumb({ id: it.id, thumbUrl: it.thumb });
      }
    }
    if (rv.fetched.pex && state.hasMoreV.pex) state.vpex += 1;
    if (rv.fetched.pix && state.hasMoreV.pix) state.vpix += 1;
    if (ri.fetched.pex && state.hasMoreI.pex) state.ipex += 1;
    if (ri.fetched.pix && state.hasMoreI.pix) state.ipix += 1;
    if (ri.fetched.com && state.hasMoreI.com) state.icom += 1;
    tlog(`search done: +${all.length} novos, ${state.items.size} cards, prox v:${state.vpex}/${state.vpix} i:${state.ipex}/${state.ipix}/${state.icom} hasMoreV=${state.hasMoreV.pex}/${state.hasMoreV.pix} hasMoreI=${state.hasMoreI.pex}/${state.hasMoreI.pix}/${state.hasMoreI.com} docH=${document.documentElement.scrollHeight} winH=${window.innerHeight}`);
  } catch (err) {
    if (my !== epoch) return;
    tlog(`search FALHOU: ${err.message || err}`);
    if (reset) notice([`Falha na busca: ${err.message || err}`]);
    else noticeAppend([`Falha ao carregar mais: ${err.message || err} — role para tentar de novo.`]);
  } finally {
    if (my === epoch) state.loading = false;
    updateTail(false);
  }
}

function markDownloading(id, pct) {
  const st = state.items.get(id); if (!st) return;
  // evento de progresso atrasado não pode rebaixar um card que já está pronto
  if (st.status === 'ready') return;
  st.status = 'downloading'; st.pct = pct;
  const card = document.querySelector(`.card[data-id="${id}"]`); if (!card) return;
  const prog = card.querySelector('.prog');
  prog.classList.remove('hidden');
  prog.textContent = pct >= 100 ? 'finalizando…' : `baixando ${pct}%`;
}

function markReady(id, filePath) {
  const st = state.items.get(id); if (!st) return;
  st.status = 'ready'; st.filePath = filePath; st.pct = 100;
  const card = document.querySelector(`.card[data-id="${id}"]`); if (!card) return;
  card.classList.add('ready'); card.setAttribute('draggable', 'true');
  const prog = card.querySelector('.prog');
  if (prog) { prog.classList.add('hidden'); prog.textContent = ''; }
  // depois de pronto, o preview passa a ser o arquivo local (vídeo)
  // ou continua no thumb remoto (imagem — file:// é bloqueado na página
  // http do dev e não traz benefício visual; o arquivo local serve p/ arrastar)
  const media = card.querySelector('video, img');
  if (media) {
    if (media.tagName === 'VIDEO') {
      try { media.pause(); } catch {}
      media.src = `file://${filePath}`;
    } else {
      try { delete media.dataset.thumb; } catch {}
      if (st.data.thumb) media.src = st.data.thumb;
    }
  }
}

async function downloadItem(id) {
  const st = state.items.get(id); if (!st || st.status === 'downloading' || st.status === 'ready') return;
  markDownloading(id, 0);
  window.broll.prefetchThumb({ id, thumbUrl: st.data.thumb }); // background, p/ virar o fantasma do arrasto
  const r = st.data.kind === 'image'
    ? await window.broll.downloadImage({ item: st.data, query: state.query })
    : await window.broll.download({ item: st.data, query: state.query });
  if (r && r.filePath) markReady(id, r.filePath);
  else {
    const card = document.querySelector(`.card[data-id="${id}"]`); if (card) card.querySelector('.prog').classList.add('hidden');
    st.status = 'remote';
    notice([`Falha ao baixar: ${r?.error || 'erro desconhecido'}`]);
  }
}

// progresso vindo do main
window.broll.onProgress(({ id, pct }) => markDownloading(id, pct));

// infinite scroll
const io = new IntersectionObserver((es) => {
  const hit = es.some(e => e.isIntersecting);
  const r = $('#sentinel').getBoundingClientRect();
  const mV = state.hasMoreV, mI = state.hasMoreI;
  tlog(`observer: visível=${hit} loading=${state.loading} hasMoreV=${mV.pex}/${mV.pix} hasMoreI=${mI.pex}/${mI.pix}/${mI.com} cards=${state.items.size} sentinelY=${Math.round(r.top)} winH=${window.innerHeight}`);
  if (hit) runSearch(false);
}, { rootMargin: '600px' });
io.observe($('#sentinel'));

// backup independente do observer: se ele não disparar, o scroll dispara (edge-trigger, sem spam)
let wasNearBottom = false, scrollTick = false;
window.addEventListener('scroll', () => {
  if (scrollTick) return;
  scrollTick = true;
  requestAnimationFrame(() => {
    scrollTick = false;
    const near = window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 700;
    if (near && !wasNearBottom) {
      wasNearBottom = true;
      tlog(`scroll-fallback: perto do fim (scrollY=${Math.round(window.scrollY)} docH=${document.documentElement.scrollHeight})`);
      runSearch(false);
    } else if (!near) wasNearBottom = false;
  });
}, { passive: true });

// eventos
let debounce;
function submitQuery(q) {
  q = (q || '').trim(); if (!q) return;
  if (q === state.query && state.items.size > 0) return; // já exibindo esse termo
  state.query = q;
  $('#searchTop').value = state.query;
  setModeResults(true);
  runSearch(true);
}
$('#searchHome').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitQuery(e.target.value); });
$('#searchTop').addEventListener('input', (e) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => submitQuery(e.target.value), 600);
});
$('#btnConfig').addEventListener('click', openDrawer);
$('#btnClose').addEventListener('click', closeDrawer);
$('#scrim').addEventListener('click', closeDrawer);
$('#keyWarnBtn').addEventListener('click', openDrawer);
$('#btnSave').addEventListener('click', async () => {
  await window.broll.setConfig({
    pexelsKey: $('#inPexels').value.trim(),
    pixabayKey: $('#inPixabay').value.trim(),
    ffmpegPath: $('#inFfmpeg').value.trim(),
    magickPath: $('#inMagick').value.trim(),
    maxQuality: Number($('#selQuality').value)
  });
  $('#logs').textContent += '\nConfig salva.';
  await refreshConfigUI();
});
$('#btnTools').addEventListener('click', async () => {
  $('#toolsInfo').textContent = 'verificando…';
  await refreshToolsUI();
});
$('#selQuality').addEventListener('change', async (e) => {
  await window.broll.setConfig({ maxQuality: Number(e.target.value) });
  await refreshConfigUI();
});
$('#btnTest').addEventListener('click', async () => {
  $('#logs').textContent = 'testando…';
  const logs = await window.broll.testKeys();
  $('#logs').textContent = logs.join('\n');
  await refreshConfigUI();
});
$('#btnOpen').addEventListener('click', () => window.broll.cacheOpen());
$('#btnOriginals').addEventListener('click', () => window.broll.cacheOpenOriginals());
$('#btnClear').addEventListener('click', async () => {
  await window.broll.cacheClear();
  document.querySelectorAll('.card.ready').forEach(c => {
    c.classList.remove('ready');
    c.removeAttribute('draggable');
    const video = c.querySelector('video');
    if (video) releasePreview(video);
  });
  for (const [, st] of state.items) { st.status = 'remote'; st.filePath = null; st.pct = 0; }
  await refreshConfigUI();
});
$('#btnLogs').addEventListener('click', async () => {
  const box = $('#sessionLogs');
  if (!box.classList.contains('hidden')) { box.classList.add('hidden'); $('#btnLogs').textContent = 'Mostrar logs'; return; }
  const { file, lines } = await window.broll.getLogs();
  $('#logPath').textContent = file;
  box.textContent = lines.length ? lines.join('\n') : 'nada registrado ainda nesta sessão.';
  box.classList.remove('hidden');
  $('#btnLogs').textContent = 'Ocultar logs';
  box.scrollTop = box.scrollHeight;
});

refreshConfigUI();
