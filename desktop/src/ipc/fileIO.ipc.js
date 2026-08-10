const { shell } = require("electron")
const {existsSync} = require("fs")
exports.openFileInExplorerIPC = async (event, filePath, action='open-in-folder') => {
    try {
        if(!existsSync(filePath)){
            return {success: false, error: 'File does not exist!'}
        }
        if(action === 'open-in-folder') {
            return await shell.showItemInFolder(filePath)
        }
        if(action === 'play-video' || action === 'open-directory') {
            return await shell.openPath(filePath)
        }
    }
    catch(err) {
        return {success : false, err: err.message}
    }
}