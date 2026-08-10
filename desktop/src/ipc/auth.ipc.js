const { dbAPI } = require("../models/db.js");

const loginIPC = async(event, username, password) => {
    try {
        let loginResponse = await dbAPI.auth.login(username, password.toString())
        return loginResponse;
    }
    catch (err) {
        console.log("Login Auth Error : ", err)
        return {
            status: false,
            data : null,
            msg : 'Unable to login'
        }
    }
}



const singnupIPC = async(event, username, password, firstName) => {
    try {
        let signupResponse = await dbAPI.auth.signup(username, password, firstName)
        return signupResponse
    }
    catch(err) {
        return {
            status: false,
            data : null,
            msg : 'Unable to process request'
        }
    }
}

exports.loginIPC = loginIPC;
exports.singnupIPC = singnupIPC;