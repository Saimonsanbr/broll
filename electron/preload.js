const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('broll', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  testKeys: () => ipcRenderer.invoke('keys:test'),
  search: (args) => ipcRenderer.invoke('search:videos', args),
  searchImages: (args) => ipcRenderer.invoke('search:images', args),
  download: (args) => ipcRenderer.invoke('video:download', args),
  downloadImage: (args) => ipcRenderer.invoke('image:download', args),
  localPath: (args) => ipcRenderer.invoke('video:local-path', args),
  imageLocalPath: (args) => ipcRenderer.invoke('image:local-path', args),
  onProgress: (cb) => ipcRenderer.on('video:progress', (_e, v) => cb(v)),
  generateVideo: (args) => ipcRenderer.invoke('img2vid:generate', args),
  cancelVideo: (args) => ipcRenderer.invoke('img2vid:cancel', args),
  onVideoProgress: (cb) => ipcRenderer.on('img2vid:progress', (_e, v) => cb(v)),
  startDrag: (args) => ipcRenderer.send('drag:start', args),
  debugLog: (msg) => ipcRenderer.send('debug:log', msg),
  prefetchThumb: (args) => ipcRenderer.invoke('thumb:prefetch', args),
  cacheInfo: () => ipcRenderer.invoke('cache:info'),
  cacheOpen: () => ipcRenderer.invoke('cache:open'),
  cacheOpenOriginals: () => ipcRenderer.invoke('cache:open-originals'),
  cacheClear: () => ipcRenderer.invoke('cache:clear'),
  getLogs: () => ipcRenderer.invoke('logs:get'),
  getTools: () => ipcRenderer.invoke('tools:status'),
  openExternal: (url) => shell.openExternal(url)
});
