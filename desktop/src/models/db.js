
// Changed: sqlite3 to better-sqlite3
const Database = require('better-sqlite3');
const crypto = require('crypto');

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    const [salt, hash] = stored.split(':');
    if(!salt || !hash) return false;
    const hashBuffer = Buffer.from(hash, 'hex');
    const suppliedBuffer = crypto.scryptSync(password, salt, 64);
    if(hashBuffer.length !== suppliedBuffer.length) return false;
    return crypto.timingSafeEqual(hashBuffer, suppliedBuffer);
}

const {CONSTANTS} = require("../utils/coreUtils/constants.coreutils.js")
// const {utils} = require("../utils/utils.js")
const {validateDir} = require("../utils/coreUtils/validateDir.coreutils.js")
const path = require('path');
const fs = require('fs');

//db.run for insert update delete create
//db.get for one select
//db.all for all select
//table (id, barcode, filename, path, recording_date, size)

let db = null;
let isDbInitialised = false;

function INITIALIZEDBTABLES(db) {   //database record tables initialisation on every app usage opens
    return new Promise((resolve, reject)=> {
        const userSql = `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            first_name TEXT
        )`
        
        const recordSql = `CREATE TABLE IF NOT EXISTS record (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            barcode TEXT NOT NULL,
            filename TEXT NOT NULL,
            path TEXT NOT NULL,
            recording_date TEXT NOT NULL,
            size TEXT NOT NULL,
            user_id INT,
            FOREIGN KEY (user_id) REFERENCES users(id)
            
        )`
      

        if(!db) {
            console.error("Cannot initialize database table - SQLite is not connected!")
            reject(new Error("Cannot initialize database table - SQLite is not connected!"))
            return;
        }
        
        try {
            // Changed: No callback, direct execution
            db.exec(userSql)
            console.log("Successfully Initialized Users Database Tables");

            // Migration for databases created before first_name existed.
            // CREATE TABLE IF NOT EXISTS above is a no-op on an existing table,
            // so older installs need this column added explicitly.
            try {
                db.exec(`ALTER TABLE users ADD COLUMN first_name TEXT`);
                console.log("Migrated users table: added first_name column");
            } catch(err) {
                if (!String(err.message).includes("duplicate column name")) {
                    console.error("Error migrating users.first_name column:", err);
                }
            }

            db.exec(recordSql);
            console.log("Successfully Initialized Record Database Tables");
            
            // Changed: Direct execution for indexes
            try {
                db.exec(`CREATE INDEX IF NOT EXISTS idx_barcode ON record(barcode)`);
            } catch(err) {
                console.error("Error creating barcode index ", err);
            }
            
            try {
                db.exec(`CREATE INDEX IF NOT EXISTS idx_recording_date ON record(recording_date)`);
            } catch(err) {
                console.error("Error creating recording_date index ", err);
            }
            
            resolve();
        } catch(err) {
            console.log("Initialisation of record and users database tables (schema) failed !")
            reject(err);
        }
    });
}

// Database initialization function
async function initializeDatabase() {
    if(isDbInitialised && db) {
        console.log("Database already initialised.");
        return db;
    }

    console.log("Initializing database.... at: ", CONSTANTS.dbFile);
    
    try {
        const dbDirectory = path.dirname(CONSTANTS.dbFile);
        const validate = validateDir(dbDirectory)

        if(!validate.status) {
            throw new Error(`Directory validation failed: ${validate.msg}`);
        }

        console.log(validate.msg)
        
        // Changed: Synchronous connection, no callback
        db = new Database(CONSTANTS.dbFile);
        console.log('Connected to SQLite database successfully at:', CONSTANTS.dbFile)

        // Initialize tables
        await INITIALIZEDBTABLES(db)
        isDbInitialised = true;
        return db;
    }
    catch(err){
        console.error("Database initialization failed:", err)
        db = null;
        isDbInitialised = false;
        throw err
    }
}

function getDatabase(){
    if(!isDbInitialised || !db){
        throw(new Error("Database not initialized. Call initializeDatabase() first."))
    }
    return db;
}

function INSERTDATA(sql, params = []) {
    return new Promise((resolve, reject) => {
        try{
            const database = getDatabase();
            // Changed: Synchronous execution with prepare/run
            const stmt = database.prepare(sql);
            const result = stmt.run(params);
            
            resolve({
                status: true,
                id: result.lastInsertRowid,
                changes: result.changes
            })
        }
        catch(err) {
            console.error("Insert Error : ", err )
            reject(err);
        }
    })
}

function GETDATA(sql, params = [] ) {
    return new Promise((resolve, reject) => {
        try {
            const database = getDatabase()
            // Changed: Synchronous execution
            console.log("GETDATA SQL :", sql, params)
            const stmt = database.prepare(sql);
            const row = stmt.get(params);
            
            console.log("Retrieved Data :", row)
            resolve(row)
        } catch(err) {
            console.error("Get Data Error : ", err)
            reject(err);
        }
    })
}

function GETALLDATA(sql, params = [] ){
    return new Promise((resolve, reject)=> {
        try {
            const database = getDatabase()
            // Changed: Synchronous execution
            const stmt = database.prepare(sql);
            const rows = stmt.all(params);
            
            console.log("Retrieved Data :", rows)
            resolve({
                status:true,
                data: rows
            })
        }
        catch(err) {
            console.error("Get All Data Error : ", err)
            reject({
                status:false,
                data: null
            })
        }
    })
}

function closeDatabase() {
    return new Promise((resolve, reject) => {
        if(db) {
            try {
                // Changed: Synchronous close, no callback
                db.close();
                console.log("Database connection closed")
                db = null;
                isDbInitialised = false;
                resolve();
            } catch(err) {
                console.error("Error closing database :", err);
                db = null;
                isDbInitialised = false;
                resolve(); // Still resolve to not break the flow
            }
        }
        else {
            resolve();
        }
    })
}

const recordAPI = {
    insert: async function(recordData){
        const { barcode, filename, path, recording_date, size, user_id } = recordData;
        console.log("record Data : ", recordData)
        const sql = `
            INSERT INTO record(barcode, filename, path, recording_date, size, user_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `
        return await INSERTDATA(sql, [barcode, filename, path, recording_date, size, user_id]);
    },

    getAllDataByUserID : async function(user_id, limit){
        const sql = `SELECT r.* , u.username FROM record r JOIN users u ON r.user_id = u.id WHERE u.id = ? ORDER BY r.recording_date DESC LIMIT ?`
        return await GETALLDATA(sql, [user_id, limit])
    },

    // getTotalCount(user_id, date) - date is a "YYYY-MM-DD" prefix match against
    // recording_date (stored as "YYYY-MM-DD_HH-MM"), so passing today's date
    // gives a same-day count. Pass either/both as null for a broader total.
    getTotalCount : async function(user_id = null, date = null){
        let sql, params;
        if (user_id && date) {
            sql = `SELECT COUNT(*) AS total FROM record WHERE user_id = ? AND recording_date LIKE ?`
            params = [user_id, `${date}%`]
        } else if (user_id) {
            sql = `SELECT COUNT(*) AS total FROM record WHERE user_id = ?`
            params = [user_id]
        } else if (date) {
            sql = `SELECT COUNT(*) AS total FROM record WHERE recording_date LIKE ?`
            params = [`${date}%`]
        } else {
            sql = `SELECT COUNT(*) AS total FROM record`
            params = []
        }
        return await GETDATA(sql, params)
    },
}

const authAPI = {
    login : async function(username, password) {
        const sql = `SELECT * FROM users WHERE username = ?`
        const userdata =  await GETDATA(sql, [username])
        if(!userdata){
            return {
                status: false,
                data: null,
                msg : `There is no user named : ${username}. signup first!`
            }
        }
        if(verifyPassword(password, userdata.password)) {
            const { password: _omit, ...safeUserData } = userdata;
            return {
                status: true,
                data: safeUserData,
                msg: 'Loggedin successfully'
            }
        }
        else {
            return {
                status: false,
                data : null,
                msg : 'Wrong password'
            }
        }
    },

    signup : async function(username, password, firstName) {
        const sql = `INSERT INTO users (username, password, first_name) VALUES (?, ?, ?)`
        const signupInsert =  await INSERTDATA(sql, [username, hashPassword(password), firstName || null])
        if(signupInsert.status){
            return {
                status: true,
                data : signupInsert,
                msg : `User ${username} signed up successfully.`
            }
        }
        else {
            return {
                status: false,
                data : null,
                msg : `Unable to signup`
            }
        }
    }
}

exports.dbAPI = {
    initializeDatabase,
    getDatabase,
    closeDatabase,

    INSERTDATA,
    GETDATA,
    GETALLDATA,

    record : recordAPI,
    auth : authAPI,
    isDbInitialised : () => isDbInitialised,
}
