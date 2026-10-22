const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('captain', {
  state: () => ipcRenderer.invoke('training:state'),
  connect: () => ipcRenderer.invoke('training:connect'),
  check: () => ipcRenderer.invoke('training:check'),
  reset: () => ipcRenderer.invoke('training:reset'),
  write: data => ipcRenderer.invoke('terminal:input', data),
  resize: (cols, rows) => ipcRenderer.invoke('terminal:resize', cols, rows),
  onData: callback => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('terminal:data', listener);
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },
  onExit: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('terminal:exit', listener);
    return () => ipcRenderer.removeListener('terminal:exit', listener);
  },
});
