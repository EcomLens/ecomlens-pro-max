const { dbAPI } = require("../models/db")

const getAllDataIPC = async  (event, user_id, limit) => {
    console.log("IPC 'get-all-data' : ", {user_id, limit} )
    try {
        const data = await dbAPI.record.getAllDataByUserID(user_id, limit);
        return data
    } catch (err) {
        console.log("Error IPC 'get-all-data' : ", err)
        return { status: false, data: null }
    }
}

const getTotalRecordCountIPC = async (event, user_id=null, date=null) => {
    console.log("IPC 'get-total-record-count' :", {user_id, date})

    try{
        const totalRecordCount = await dbAPI.record.getTotalCount(user_id, date)
        return {status: true, data: totalRecordCount}
    }
    catch(err) {
        console.log("Error IPC 'get-total-record-count' : ", err)
        return {status: false, data : null}
    }
}

exports.dbQueryIPC = {
    getAllDataIPC,
    getTotalRecordCountIPC,
}