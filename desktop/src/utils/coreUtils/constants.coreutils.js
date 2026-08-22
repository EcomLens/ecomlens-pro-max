const {app} = require("electron")
const path = require("path")


const baseDir = path.join(app.getPath("documents"), "EcomLens");


const videoDir = path.join(baseDir, "videos");
const dbDir = path.join(baseDir, "database");
const configDir = path.join(baseDir, "config");
const dbFile = path.join(dbDir, "database.db")  //direct access to db.js

const apiBaseUrl = 'https://ecomlens.jynzi.com'

exports.CONSTANTS = {
    baseDir,
    videoDir,
    dbDir,
    configDir,
    dbFile,
    apiBaseUrl,
}
