const fs = require("fs")
function validateDir(dir) {   //run this in every utility that operate on filesystem
    try {
        if (!fs.existsSync(dir)) {
            console.log(`Directory '${dir}' does not exist! attempting to create it.`)
            fs.mkdirSync(dir, { recursive: true });
            return {
                status : true,
                msg : `Directory '${dir}' created successfully`
            }
        }
        else {
            console.log(`Directory '${dir}' already exists.`)
            return {
                status : true,
                msg : `Directory '${dir}' already exists`
            }
        }

    }
    catch(err) {
        console.log(`Error validating directory ${dir}`, err)
        return {
            status: false,
            msg : 'Some error occured validating directory'
        }

    }       
    
}

module.exports = {validateDir};