const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('broll', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  testKeys: () => ipcRenderer.invoke('keys:test'),
  search: (args) => ipcRenderer.invoke('search:videos', args),
  download: (args) => ipcRenderer.invoke('video:download', args),
  localPath: (args) => ipcRenderer.invoke('video:local-path', args),
  onProgress: (cb) => ipcRenderer.on('video:progress', (_e, v) => cb(v)),
  startDrag: (args) => ipcRenderer.send('drag:start', args),
  debugLog: (msg) => ipcRenderer.send('debug:log', msg),
  prefetchThumb: (args) => ipcRenderer.invoke('thumb:prefetch', args),
  cacheInfo: () => ipcRenderer.invoke('cache:info'),
  cacheOpen: () => ipcRenderer.invoke('cache:open'),
  cacheClear: () => ipcRenderer.invoke('cache:clear'),
  openExternal: (url) => shell.openExternal(url)
});
