const { dbAPI } = require("../models/db")
const {saveVideoFile} = require("../utils/coreUtils/video.coreutils.js")

exports.saveVideoIPC = async (event, arrayBuffer, filename, barcode, recording_date, user_id) => {
    const fileSizeMB = (arrayBuffer.byteLength / (1024*1024)).toFixed(2)
    console.log("IPC 'save-video-file' : ", {filename: filename, size : fileSizeMB})
    const result = await saveVideoFile(arrayBuffer, filename)
    if(result.success) {
        const recordData = {
            barcode, filename, path: result.data.path, recording_date, size: fileSizeMB, user_id
        }
        console.log("Record data payload : ", recordData)
        try {
            const dbResponse = await dbAPI.record.insert(recordData)
            if(dbResponse.status) {
                console.log("Successfully inserted record data in db : ", dbResponse);
                result.dbSaved = true
            }
        }
        catch(err) {
            console.error("Failed to save record metadata to database : ", err)
            result.dbSaved = false
        }
    }
    return result;
}