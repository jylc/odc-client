const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ODCClient', {
  ipcInvoke(method, ...args) {
    return ipcRenderer
      .invoke(method, ...args)
      .then((result) => {
        return result;
      });
  },
});

// Expose tab API for the multi-tab system
contextBridge.exposeInMainWorld('electron', {
  tab: {
    create: (url, options) => ipcRenderer.invoke('tab:create', url, options),
    switch: (tabId) => ipcRenderer.invoke('tab:switch', tabId),
    close: (tabId) => ipcRenderer.invoke('tab:close', tabId),
    getAll: () => ipcRenderer.invoke('tab:getAll'),
    getActive: () => ipcRenderer.invoke('tab:getActive'),
    updateBounds: (bounds) => ipcRenderer.invoke('tab:updateBounds', bounds),
    setBarHeight: (height) => ipcRenderer.invoke('tab:setBarHeight', height),
    goBack: () => ipcRenderer.invoke('tab:goBack'),
    goForward: () => ipcRenderer.invoke('tab:goForward'),
    reload: () => ipcRenderer.invoke('tab:reload'),
    stop: () => ipcRenderer.invoke('tab:stop'),
    // Event listeners for tab state changes from main process
    on: (event, callback) => {
      const listener = (e, data) => callback(data);
      ipcRenderer.on(event, listener);
      // Return unsubscribe function
      return () => ipcRenderer.removeListener(event, listener);
    },
    off: (event, callback) => {
      if (callback) {
        ipcRenderer.removeListener(event, callback);
      }
    },
    once: (event, callback) => {
      ipcRenderer.once(event, (e, data) => callback(data));
    },
  },
  // Window control API
  windowControl: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    unmaximize: () => ipcRenderer.invoke('window:unmaximize'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    close: () => ipcRenderer.invoke('window:close'),
    openSettings: () => ipcRenderer.invoke('window:open-settings'),
  },
});