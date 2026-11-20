// broll — electron/img2vid.js
// Motor de imagem → vídeo (Fase 6). Gera MP4 1920x1080, 5s, sem áudio.
//
// Pipeline:
//   imagem limpa (re-buscada p/ Commons; arquivo pronto p/ Pexels/Pixabay)
//   → composição 1920x1080 (única com recorte / duplicada com fundo)
//   → animação Ken Burns (zoompan ou crop animado)
//   → filtro (nenhum / vhs / fade)
//   → overlay do crédito (PNG via magick, estático no topo)
//   → H.264 + yuv420p + faststart
//
// Crédito em vídeo NÃO usa drawtext (o ffmpeg do Homebrew não tem):
// usa overlay de PNG, igual ao pipeline validado no spike da Fase 2.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require('axios');
const { resolveFfmpeg, resolveMagick, runBin, poppinsPath } = require('./tools');

const VID_W = 1920, VID_H = 1080, FPS = 30, DUR = 5;
const FRAMES = FPS * DUR;
const UA = 'broll/0.2 (https://github.com/Saimonsanbr/broll)';

const COMPOSITIONS = ['single', 'duo'];
const BACKGROUNDS = ['blur', 'dark', 'blur-dark'];
const ANIMATIONS = ['zoom-in', 'zoom-out', 'pan-down', 'pan-up'];
const FILTERS = ['none', 'vhs', 'fade'];

function sanitize(s) {
  return String(s || 'video').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'video';
}

function outDir(app) {
  let base = null;
  try { base = app.getPath('videos'); } catch {}
  const dir = base ? path.join(base, 'broll-img2vid') : path.join(os.tmpdir(), 'broll-img2vid');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// base 2400x1350 (margem p/ zoom/pan sem serrilhado), depois anima p/ 1920x1080
function composeFilters(composition, background) {
  const PRE = 'scale=2400:1350';
  if (composition === 'duo') {
    let bg = `[0:v]scale=${VID_W}:${VID_H}:force_original_aspect_ratio=increase,crop=${VID_W}:${VID_H}`;
    if (background === 'blur' || background === 'blur-dark') bg += ',gblur=sigma=40';
    if (background === 'dark' || background === 'blur-dark') bg += ',eq=brightness=-0.45';
    bg += '[bg];[0:v]scale=1920:1080:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2';
    return `${bg},${PRE}[c]`;
  }
  return `[0:v]scale=${VID_W}:${VID_H}:force_original_aspect_ratio=increase,crop=${VID_W}:${VID_H},${PRE}[c]`;
}

function animFilter(anim) {
  const zc = `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
  if (anim === 'zoom-out') return `[c]zoompan=z='1.125-0.125*on/${FRAMES}':${zc}:d=${FRAMES}:s=${VID_W}x${VID_H}:fps=${FPS}[a]`;
  if (anim === 'pan-down') return `[c]crop=${VID_W}:${VID_H}:x='(in_w-${VID_W})/2':y='(in_h-${VID_H})*n/${FRAMES}'[a]`;
  if (anim === 'pan-up') return `[c]crop=${VID_W}:${VID_H}:x='(in_w-${VID_W})/2':y='(in_h-${VID_H})*(1-n/${FRAMES})'[a]`;
  return `[c]zoompan=z='1+0.125*on/${FRAMES}':${zc}:d=${FRAMES}:s=${VID_W}x${VID_H}:fps=${FPS}[a]`;
}

function effectFilter(filter) {
  if (filter === 'vhs') return '[a]noise=alls=7:allf=t,eq=saturation=1.3:contrast=1.05[e]';
  if (filter === 'fade') return '[a]fade=t=in:st=0:d=0.5,fade=t=out:st=4.5:d=0.5[e]';
  return '[a]null[e]';
}

// faixa de crédito (mesmo estilo das imagens: caixa justa + respiro, Poppins)
async function makeCreditStrip(magickBin, text, outPath) {
  const safe = String(text || '').replace(/"/g, "'").slice(0, 220);
  const ps = 44, maxW = Math.round(VID_W * 0.7);
  const bx = Math.round(ps * 0.7), by = Math.round(ps * 0.35);
  const font = poppinsPath();
  const raw = outPath.replace(/\.png$/, '-raw.png');
  const r1 = await runBin(magickBin, ['-background', 'none', '-fill', 'rgba(255,255,255,0.8)',
    ...(font ? ['-font', font] : []),
    '-pointsize', String(ps), '-size', `${maxW}x`, '-gravity', 'center',
    `caption:${safe}`, raw], 30000);
  if (!r1.ok) throw new Error(`magick caption: ${r1.error}`);
  const r2 = await runBin(magickBin, [raw, '-trim', '+repage', '-bordercolor', '#00000080', '-border', `${bx}x${by}`, outPath], 30000);
  try { fs.unlinkSync(raw); } catch {}
  if (!r2.ok) throw new Error(`magick box: ${r2.error}`);
  return outPath;
}

async function fetchCleanSource(item, dest, store) {
  if (item.source === 'wikimedia') {
    const IMG = require('./images');
    const url = await IMG.getCommonsFileUrl(item.fileTitle, item.downloadWidth || 2560);
    if (!url) throw new Error('não foi possível re-buscar a imagem limpa no Commons');
    const res = await axios.get(url, { responseType: 'stream', timeout: 60000, headers: { 'User-Agent': UA } });
    await new Promise((res2, rej) => {
      const w = fs.createWriteStream(dest);
      res.data.pipe(w);
      res.data.on('error', rej);
      w.on('error', rej);
      w.on('finish', res2);
    });
    return dest;
  }
  return null; // pexels/pixabay: o arquivo pronto já é limpo
}

function uniqueOut(dir, base) {
  let p = path.join(dir, `${base}.mp4`);
  for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${base}-${i}.mp4`);
  return p;
}

const running = new Map(); // id -> child_process

function cancelGeneration(id) {
  const child = running.get(id);
  if (child) { try { child.kill('SIGKILL'); } catch {} running.delete(id); return true; }
  return false;
}

async function generate(app, store, args, onProgress) {
  const { item, query, filePath, options } = args;
  const composition = COMPOSITIONS.includes(options.composition) ? options.composition : 'single';
  const background = BACKGROUNDS.includes(options.background) ? options.background : 'blur-dark';
  const anim = ANIMATIONS.includes(options.anim) ? options.anim : 'zoom-in';
  const filter = FILTERS.includes(options.filter) ? options.filter : 'none';

  const ffmpeg = resolveFfmpeg(store.get('ffmpegPath', ''));
  if (!ffmpeg) throw new Error('ffmpeg não encontrado — instale ou informe o caminho nas Configurações.');
  // commons re-busca a fonte limpa; pexels/pixabay usam o arquivo pronto
  if (item.source !== 'wikimedia' && (!filePath || !fs.existsSync(filePath))) {
    throw new Error('arquivo da imagem não encontrado; baixe de novo.');
  }

  const needsCredit = Boolean(item.license && item.license.attributionRequired);
  let magickBin = null;
  if (needsCredit) {
    magickBin = resolveMagick(store.get('magickPath', ''));
    if (!magickBin) throw new Error('ImageMagick não encontrado — instale ou informe o caminho nas Configurações.');
  }

  const tmpd = fs.mkdtempSync(path.join(os.tmpdir(), 'broll-img2vid-'));
  try {
    // 1. fonte limpa (sem crédito embutido)
    let src = filePath;
    if (item.source === 'wikimedia') {
      const ext = (filePath && path.extname(filePath)) || '.jpg';
      const tmpSrc = path.join(tmpd, `clean${ext}`);
      await fetchCleanSource(item, tmpSrc, store);
      src = tmpSrc;
    }

    // 2. faixa de crédito (quando exigido)
    let filterComplex = `${composeFilters(composition, background)};${animFilter(anim)};${effectFilter(filter)}`;
    let inputs = ['-loop', '1', '-framerate', String(FPS), '-t', String(DUR), '-i', src];
    if (needsCredit) {
      const strip = await makeCreditStrip(magickBin, item.attribution.text, path.join(tmpd, 'strip.png'));
      inputs = inputs.concat(['-i', strip]);
      filterComplex += `;[e][1:v]overlay=(W-w)/2:24,scale=out_range=limited,format=yuv420p[v]`;
    } else {
      filterComplex += `;[e]scale=out_range=limited,format=yuv420p[v]`;
    }

    // 3. saída única (sem colisão)
    const dir = outDir(app);
    const out = uniqueOut(dir, `${sanitize(query)}-${sanitize(item.id)}-img2vid`);

    await new Promise((resolve, reject) => {
      const crf = filter === 'vhs' ? '26' : '20'; // ruído do vhs não comprime: crf maior
      const ffargs = ['-y', '-hide_banner', '-nostats', '-progress', 'pipe:1',
        ...inputs, '-filter_complex', filterComplex,
        '-map', '[v]', '-r', String(FPS), '-t', String(DUR),
        '-c:v', 'libx264', '-preset', 'medium', '-crf', crf, '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', out];
      const child = spawn(ffmpeg, ffargs, { windowsHide: true });
      running.set(item.id, child);
      let killed = false;
      const timer = setTimeout(() => { killed = true; try { child.kill('SIGKILL'); } catch {} }, 180000);
      child.stdout.on('data', (buf) => {
        const m = /out_time_ms=(\d+)/g;
        let mm, last = null;
        const s = buf.toString();
        while ((mm = m.exec(s))) last = Number(mm[1]);
        if (last != null && onProgress) {
          try { onProgress(Math.min(99, Math.round(last / (DUR * 10000)))); } catch {}
        }
      });
      child.on('error', (e) => { clearTimeout(timer); running.delete(item.id); reject(new Error(`ffmpeg: ${e.message}`)); });
      child.on('close', (code) => {
        clearTimeout(timer); running.delete(item.id);
        if (killed) { try { fs.unlinkSync(out); } catch {} reject(new Error('geração cancelada')); }
        else if (code === 0 && fs.existsSync(out)) { try { onProgress && onProgress(100); } catch {} resolve(out); }
        else { try { fs.unlinkSync(out); } catch {} reject(new Error(`ffmpeg saiu com código ${code}`)); }
      });
    });

    // 4. sidecar quando há atribuição
    if (needsCredit) {
      const lic = item.license || {};
      fs.writeFileSync(out.replace(/\.mp4$/, '.license.txt'),
        `broll — vídeo gerado a partir de imagem do Wikimedia Commons\n` +
        `arquivo original: ${item.fileTitle || item.id}\n` +
        `autor: ${item.author || ''}\n` +
        `página: ${item.pageUrl || ''}\n` +
        `licença: ${lic.shortName || ''}\n` +
        `url da licença: ${lic.url || ''}\n` +
        `share-alike (obra derivada sob a mesma licença): ${lic.shareAlike ? 'sim' : 'não'}\n` +
        `crédito aplicado no vídeo: ${item.attribution ? item.attribution.text : ''}\n` +
        `composição: ${composition}${composition === 'duo' ? ` (fundo ${background})` : ''} · animação: ${anim} · filtro: ${filter}\n` +
        `gerado em: ${new Date().toISOString()}\n`);
    }
    return { filePath: out, dir };
  } finally {
    try { fs.rmSync(tmpd, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { generate, cancelGeneration, outDir, COMPOSITIONS, BACKGROUNDS, ANIMATIONS, FILTERS, VID_W, VID_H, FPS, DUR };
