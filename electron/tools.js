// broll — electron/tools.js
// Detecção e execução de binários externos (ffmpeg, ImageMagick).
//
// Por que existe: o crédito das imagens do Commons e o imagem → vídeo
// precisam de ferramentas locais. No macOS, o app aberto pelo Finder NÃO
// herda o PATH do shell — por isso procuramos também em /opt/homebrew/bin,
// /usr/local/bin e num eventual bin/ embutido, além do PATH e de um caminho
// customizado configurado pelo usuário.
//
// Descoberta do spike (2026-11-20): o ffmpeg do Homebrew NÃO tem drawtext
// (sem freetype). Por isso o crédito em vídeo será aplicado via overlay de
// PNG (gerado com magick ou canvas) com o filtro `overlay` — sempre
// disponível — em vez de depender de drawtext.
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

function appBase() {
  try {
    const { app } = require('electron');
    // empacotado: <resources>/bin ; dev: <repo>/bin
    if (app && app.isPackaged) return process.resourcesPath;
    return path.join(__dirname, '..');
  } catch {
    return path.join(__dirname, '..');
  }
}

const EXTRA_MAC_PATHS = ['/opt/homebrew/bin', '/usr/local/bin'];

function isExec(p) {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return fs.statSync(p).isFile();
  } catch { return false; }
}

function searchDirs() {
  const dirs = [path.join(appBase(), 'bin'), ...EXTRA_MAC_PATHS];
  const penv = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const d of penv) if (!dirs.includes(d)) dirs.push(d);
  return dirs;
}

// procura o primeiro nome executável existente nas pastas candidatas
function findBinary(names) {
  for (const d of searchDirs()) {
    for (const n of names) {
      const p = path.join(d, n);
      if (isExec(p)) return p;
    }
  }
  return null;
}

const PLAT_SUB = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';

// binário embutido: <base>/bin/<win|mac|linux>/ (CI baixa por plataforma)
// + fallback legado <base>/bin/
function bundledBin(name) {
  for (const d of [path.join(appBase(), 'bin', PLAT_SUB), path.join(appBase(), 'bin')]) {
    const p = path.join(d, name);
    if (isExec(p)) return p;
  }
  return null;
}

function resolveFfmpeg(custom) {
  if (custom && isExec(custom)) return custom;
  const hit = bundledBin(process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (hit) return hit;
  return findBinary(process.platform === 'win32' ? ['ffmpeg.exe', 'ffmpeg'] : ['ffmpeg']);
}

function resolveMagick(custom) {
  if (custom && isExec(custom)) return custom;
  const hit = bundledBin(process.platform === 'win32' ? 'magick.exe' : 'magick');
  if (hit) return hit;
  // ImageMagick 7 = `magick`, ImageMagick 6 = `convert`
  return findBinary(process.platform === 'win32' ? ['magick.exe', 'magick'] : ['magick', 'convert']);
}

function runBin(bin, args, timeoutMs = 30000) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, error: String((err && err.message) || err), stdout: String(stdout || ''), stderr: String(stderr || '').slice(0, 2000) });
      else resolve({ ok: true, stdout: String(stdout || ''), stderr: String(stderr || '').slice(0, 2000) });
    });
  });
}

async function binVersion(bin, versionArgs) {
  const r = await runBin(bin, versionArgs, 10000);
  if (!r.ok) return '';
  const first = (r.stdout || '').split('\n')[0].trim();
  return first.slice(0, 120);
}

async function ffmpegHasDrawtext(ffmpegPath) {
  if (!ffmpegPath) return false;
  const r = await runBin(ffmpegPath, ['-hide_banner', '-filters'], 15000);
  if (!r.ok) return false;
  return /(^|\s)drawtext(\s|$)/m.test(r.stdout || '');
}

// caminho da fonte Poppins embutida (OFL) — usada no crédito
function poppinsPath() {
  const cands = [
    path.join(appBase(), 'assets', 'fonts', 'Poppins-Regular.ttf'),
    path.join(__dirname, '..', 'assets', 'fonts', 'Poppins-Regular.ttf')
  ];
  for (const p of cands) {
    try { if (fs.existsSync(p) && fs.statSync(p).size > 0) return p; } catch {}
  }
  return null;
}

async function getToolsStatus(custom = {}) {
  const ffmpeg = resolveFfmpeg(custom.ffmpegPath);
  const magick = resolveMagick(custom.magickPath);
  const [ffmpegVersion, magickVersion, drawtext] = await Promise.all([
    ffmpeg ? binVersion(ffmpeg, ['-version']) : Promise.resolve(''),
    magick ? binVersion(magick, (path.basename(magick).startsWith('convert') ? ['-version'] : ['-version'])) : Promise.resolve(''),
    ffmpegHasDrawtext(ffmpeg)
  ]);
  return {
    ffmpeg: { found: Boolean(ffmpeg), path: ffmpeg || null, version: ffmpegVersion, drawtext },
    magick: { found: Boolean(magick), path: magick || null, version: magickVersion },
    poppins: poppinsPath(),
    // crédito em vídeo NÃO exige drawtext: usamos overlay de PNG
    videoCreditOk: Boolean(ffmpeg && magick)
  };
}

module.exports = { resolveFfmpeg, resolveMagick, runBin, binVersion, ffmpegHasDrawtext, poppinsPath, getToolsStatus };
