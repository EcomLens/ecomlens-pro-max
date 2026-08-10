const { dialog } = require('electron')
const { validateDir } = require('../utils/coreUtils/validateDir.coreutils.js')
const { getVideoDir, setVideoDir, resetVideoDir } = require('../utils/coreUtils/appConfig.coreutils.js')

// Takes a getMainWindow() getter (rather than the window itself) because these
// handlers are registered before app.on('ready') creates the window - main.js's
// mainWindow variable isn't assigned yet at require/registration time, only by
// the time a user actually triggers one of these.
function registerSettingsIPC(ipcMain, getMainWindow) {
    ipcMain.handle('get-video-dir', () => getVideoDir())

    ipcMain.handle('select-video-dir', async () => {
        const result = await dialog.showOpenDialog(getMainWindow(), { properties: ['openDirectory', 'createDirectory'] })
        if (result.canceled || !result.filePaths[0]) {
            return { success: false }
        }
        const chosenDir = result.filePaths[0]
        const validation = validateDir(chosenDir)
        if (!validation.status) {
            return { success: false, msg: validation.msg }
        }
        setVideoDir(chosenDir)
        return { success: true, path: chosenDir }
    })

    ipcMain.handle('reset-video-dir', () => {
        resetVideoDir()
        return { path: getVideoDir() }
    })
}

exports.registerSettingsIPC = registerSettingsIPC
