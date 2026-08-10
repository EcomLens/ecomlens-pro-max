const {ipcMain} = require("electron")
const path = require('path')
const {CONSTANTS} = require("./src/utils/coreUtils/constants.coreutils.js")
const {validateDir} = require("./src/utils/coreUtils/validateDir.coreutils.js")

let mainWindow = null


const {BrowserWindow, app, Menu, shell} = require('electron')
const { dbAPI } = require("./src/models/db.js")
const { saveVideoIPC } = require("./src/ipc/saveVideo.ipc.js")
const { dbQueryIPC } = require("./src/ipc/dbQuery.ipc.js")
const {openFileInExplorerIPC} = require('./src/ipc/fileIO.ipc.js')
const {loginIPC, singnupIPC} = require('./src/ipc/auth.ipc.js')
const {registerSettingsIPC} = require('./src/ipc/settings.ipc.js')
const {activateLicenseIPC, getActivationStatusIPC, revalidateLicenseIfStale} = require('./src/ipc/license.ipc.js')
const {getVideoDir} = require('./src/utils/coreUtils/appConfig.coreutils.js')
const createWindow = function () {
    // macOS relies on the application menu for Cmd+C/Cmd+V/Cmd+Q to work at all,
    // so only strip the default menu bar on platforms where it's purely cosmetic.
    if(process.platform !== 'darwin') {
        Menu.setApplicationMenu(null)
    }
    const win = new BrowserWindow({
        width: 900,
        height: 600,
        minWidth: 760,
        minHeight: 500,
        title: 'EcomLens',
        backgroundColor: '#FFFDF7',
        // alwaysOnTop: true,       
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation : true,
            enableRemoteModule: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    win.loadFile('./src/pages/index.html')
    return win;
}

function initialiseApp() {
    try{
        const videoDirValidation = validateDir(getVideoDir())
        const dbDirValidation = validateDir(CONSTANTS.dbDir)
        const configDirValidation = validateDir(CONSTANTS.configDir)
        console.log("Directory Validation ", {
            database: dbDirValidation.status,
            videos: videoDirValidation.status,
            config: configDirValidation.status,
        })

        dbAPI.initializeDatabase().then(res=> {
            console.log("Database Initialized Successfully ", res)
        }).catch(err=> {
            console.log("Failed To Initialise Database ", err)
        })

        const isDbInitialised = dbAPI.isDbInitialised();
        console.log("Database Status : ", isDbInitialised ? "Ready." : "Not Ready !")

        // Fire-and-forget - doesn't block startup, doesn't punish the user
        // for being offline (see revalidateLicenseIfStale for the logic).
        revalidateLicenseIfStale().catch(err => console.warn("License revalidation error:", err))

        return true;
    }   
    catch(err){
        console.error("❌ Failed to initialize app:", err);
        return false;
    }
}

// ---- Auth ----
ipcMain.handle('login', loginIPC)
ipcMain.handle('signup', singnupIPC)

// ---- Licensing ----
ipcMain.handle('activate-license', activateLicenseIPC)
ipcMain.handle('get-activation-status', getActivationStatusIPC)

// ---- Recording / video ----
ipcMain.handle('save-video-file', saveVideoIPC)
ipcMain.handle('get-all-data', dbQueryIPC.getAllDataIPC)
ipcMain.handle('get-total-count', dbQueryIPC.getTotalRecordCountIPC)

// ---- File system ----
ipcMain.handle('open-file-in-explorer', openFileInExplorerIPC)

// ---- App / settings ----
registerSettingsIPC(ipcMain, () => mainWindow)
ipcMain.handle('get-app-version', () => app.getVersion())
ipcMain.handle('quit-app', () => app.quit())
ipcMain.handle('open-external', (event, url) => shell.openExternal(url))

app.on('ready', async () => {
    const initialised = initialiseApp();
    if(initialised) {
        mainWindow = createWindow()
    }
    else {
        console.error("💥 Failed to initialize app")
        app.quit()
    }
})

app.on("window-all-closed", async ()=> {
    try{
        await dbAPI.closeDatabase();
        console.log("Database connection closed cleanly.")
    }
    catch(err){
        console.error("Error Closing Database :", err)
    }
    if(process.platform !== "darwin") app.quit()
})

app.on("before-quit", async () => {
  try{
    await dbAPI.closeDatabase();
  }
  catch(err) {
    console.error("Error closing database on quit:", err);
  }
})
