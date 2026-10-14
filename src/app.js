const $ = (s) => document.querySelector(s);
// log só p/ terminal (via main) + devtools — nada na interface
const tlog = (m) => { try { console.log('[broll:ui]', m); window.broll.debugLog(m); } catch {} };

const state = {
  query: '', pagePex: 1, pagePix: 1, perPage: 12, loading: false,
  hasMore: { pex: true, pix: true },
  items: new Map(), // id -> {data, status: 'remote'|'downloading'|'ready', filePath, pct}
};
let epoch = 0; // invalida buscas antigas quando uma nova pesquisa começa

async function refreshConfigUI() {
  const cfg = await window.broll.getConfig();
  $('#inPexels').value = cfg.pexelsKey || '';
  $('#inPixabay').value = cfg.pixabayKey || '';
  $('#selQuality').value = String(cfg.maxQuality || 1080);
  $('#qualityBadge').textContent = `max ${cfg.maxQuality || 1080}p`;
  const noPixabay = !cfg.pixabayKey;
  $('#keyWarn').classList.toggle('hidden', !noPixabay);
  $('#btnConfig').classList.toggle('attention', noPixabay);
  const info = await window.broll.cacheInfo();
  $('#cacheInfo').textContent = `${info.count} arquivos · ${(info.bytes / 1048576).toFixed(1)} MB · ${info.dir}`;
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
  const finished = !state.hasMore.pex && !state.hasMore.pix && state.items.size > 0;
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

function cardEl(item) {
  const card = document.createElement('div');
  card.className = 'card'; card.dataset.id = item.id;
  card.innerHTML = `
    <video muted loop playsinline preload="none" poster="${item.thumb || ''}"></video>
    <span class="dur">${item.duration ? item.duration + 's' : ''} · ${item.q || item.height}p</span>
    <span class="stat hidden"></span>
    <div class="prog hidden">0%</div>
    <div class="meta"><span class="src">${item.source}</span><span class="au" title="${item.author}">${item.author}</span></div>`;
  const video = card.querySelector('video');

  // hover = stream remoto, sem baixar
  card.addEventListener('mouseenter', () => {
    if (!video.src) video.src = item.previewUrl;
    video.play().catch(() => {});
  });
  card.addEventListener('mouseleave', () => { video.pause(); });

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
    state.pagePex = 1; state.pagePix = 1;
    state.hasMore = { pex: true, pix: true };
    state.items.clear();
    $('#grid').innerHTML = ''; $('#empty').classList.add('hidden');
  }
  if (!state.hasMore.pex && !state.hasMore.pix) { tlog(`search skip reset=${reset}: fontes esgotadas`); return; }
  if (!reset && state.loading) { tlog('search skip: já carregando'); return; }
  const my = ++epoch; // toda chamada aceita vira dona; a anterior vira obsoleta sem travar o loading
  state.loading = true;
  tlog(`search start reset=${reset} pex:${state.hasMore.pex ? state.pagePex : 0} pix:${state.hasMore.pix ? state.pagePix : 0}`);
  try {
    updateTail(!reset);
    const pages = { pex: state.hasMore.pex ? state.pagePex : 0, pix: state.hasMore.pix ? state.pagePix : 0 };
    const { items, errors, hasMore, fetched, pexelsMode, hasPixabay } = await window.broll.search({ query: q, pages, perPage: state.perPage });
    if (my !== epoch) { tlog('search descartada (obsoleta)'); return; } // pesquisa antiga: descarta
    if (reset) {
      notice(errors);
      $('#credit').innerHTML = `Fontes: <span>Pexels (${pexelsMode === 'api' ? 'API oficial' : 'web sem chave'})</span>${hasPixabay ? ' · <span>Pixabay (API)</span>' : ''} — crédito ao autor em cada card.`;
    } else if (errors.length) noticeAppend(errors);
    if (reset && !items.length) $('#empty').classList.remove('hidden');
    state.hasMore = hasMore;
    items.forEach((it, i) => renderItem(it, i));
    // marca os já em cache como prontos (sem re-baixar) + thumb local p/ o fantasma do arrasto
    for (const it of items) {
      window.broll.prefetchThumb({ id: it.id, thumbUrl: it.thumb });
      const p = await window.broll.localPath({ item: it, query: q });
      if (p) markReady(it.id, p);
    }
    if (fetched.pex && state.hasMore.pex) state.pagePex += 1;
    if (fetched.pix && state.hasMore.pix) state.pagePix += 1;
    tlog(`search done: +${items.length} novos, ${state.items.size} cards, prox pex:${state.pagePex}/pix:${state.pagePix} hasMore=${state.hasMore.pex}/${state.hasMore.pix} docH=${document.documentElement.scrollHeight} winH=${window.innerHeight}`);
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
  st.status = 'downloading'; st.pct = pct;
  const card = document.querySelector(`.card[data-id="${id}"]`); if (!card) return;
  const prog = card.querySelector('.prog'); prog.classList.remove('hidden'); prog.textContent = pct >= 100 ? 'pronto' : `baixando ${pct}%`;
}

function markReady(id, filePath) {
  const st = state.items.get(id); if (!st) return;
  st.status = 'ready'; st.filePath = filePath;
  const card = document.querySelector(`.card[data-id="${id}"]`); if (!card) return;
  card.classList.add('ready'); card.setAttribute('draggable', 'true');
  card.querySelector('.prog').classList.add('hidden');
  const stat = card.querySelector('.stat'); stat.classList.remove('hidden'); stat.textContent = 'pronto p/ arrastar';
  // depois de pronto, o preview passa a ser o arquivo local
  const video = card.querySelector('video'); video.src = `file://${filePath}`;
}

async function downloadItem(id) {
  const st = state.items.get(id); if (!st || st.status === 'downloading' || st.status === 'ready') return;
  markDownloading(id, 0);
  window.broll.prefetchThumb({ id, thumbUrl: st.data.thumb }); // background, p/ virar o fantasma do arrasto
  const r = await window.broll.download({ item: st.data, query: state.query });
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
  tlog(`observer: visível=${hit} loading=${state.loading} hasMore=${state.hasMore.pex}/${state.hasMore.pix} cards=${state.items.size} sentinelY=${Math.round(r.top)} winH=${window.innerHeight}`);
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
    maxQuality: Number($('#selQuality').value)
  });
  $('#logs').textContent += '\nConfig salva.';
  await refreshConfigUI();
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
$('#btnClear').addEventListener('click', async () => {
  await window.broll.cacheClear();
  document.querySelectorAll('.card.ready').forEach(c => { c.classList.remove('ready'); c.removeAttribute('draggable'); c.querySelector('.stat').classList.add('hidden'); });
  for (const [, st] of state.items) { st.status = 'remote'; st.filePath = null; }
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
