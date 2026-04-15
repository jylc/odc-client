const { contextBridge, ipcRenderer } = require('electron');

const api = {
  ipcInvoke(method, ...args) {
    return ipcRenderer
      .invoke(method, ...args)
      .then((result) => {
        return result;
      });
  },
};

const electronApi = {
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
    loadURL: (url) => ipcRenderer.invoke('tab:loadURL', url),
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
  // Update API
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    getVersion: () => ipcRenderer.invoke('update:get-version'),
    getConfig: () => ipcRenderer.invoke('update:get-config'),
    getReleaseNotes: () => ipcRenderer.invoke('update:get-release-notes'),
    hotfixDownload: () => ipcRenderer.invoke('update:hotfix-download'),
    hotfixStatus: () => ipcRenderer.invoke('update:hotfix-status'),
    downloadStatus: () => ipcRenderer.invoke('update:download-status'),
    restartApp: () => ipcRenderer.invoke('update:restart-app'),
    on: (event, callback) => {
      const listener = (e, data) => callback(data);
      ipcRenderer.on(event, listener);
      return () => ipcRenderer.removeListener(event, listener);
    },
  },
};

// contextBridge requires contextIsolation to be enabled.
// When contextIsolation is false (local content), expose APIs directly on window.
if (contextBridge && process.contextIsolated) {
  contextBridge.exposeInMainWorld('ODCClient', api);
  contextBridge.exposeInMainWorld('electron', electronApi);
} else {
  window.ODCClient = api;
  window.electron = electronApi;
}