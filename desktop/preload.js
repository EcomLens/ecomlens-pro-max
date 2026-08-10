const {contextBridge, ipcRenderer} = require("electron")

contextBridge.exposeInMainWorld("ipc", {
    loginIPC : (username, password) => ipcRenderer.invoke('login', username, password),
    signupIPC : (username, password, firstName) => ipcRenderer.invoke('signup', username, password, firstName),
    activateLicenseIPC : (key) => ipcRenderer.invoke('activate-license', key),
    getActivationStatusIPC : () => ipcRenderer.invoke('get-activation-status'),
    saveVideoFileIPC : (arrayBuffer, filename, barcode, recording_date, user_id) =>
        ipcRenderer.invoke('save-video-file', arrayBuffer, filename, barcode, recording_date, user_id),
    getAllDataIPC : (user_id, limit) => ipcRenderer.invoke('get-all-data', user_id, limit),
    getTotalCountIPC : (user_id, date) => ipcRenderer.invoke('get-total-count', user_id, date),
    openFileInExplorerIPC : (filePath, action) => ipcRenderer.invoke('open-file-in-explorer', filePath, action),
    getVideoDirIPC : () => ipcRenderer.invoke('get-video-dir'),
    quitAppIPC : () => ipcRenderer.invoke('quit-app'),
    openExternalIPC : (url) => ipcRenderer.invoke('open-external', url),
    getAppVersionIPC : () => ipcRenderer.invoke('get-app-version'),
    selectVideoDirIPC : () => ipcRenderer.invoke('select-video-dir'),
    resetVideoDirIPC : () => ipcRenderer.invoke('reset-video-dir')
})