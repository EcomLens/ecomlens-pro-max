const fs = require("fs")
const path = require("path")
const {validateDir} = require("./validateDir.coreutils.js")
const {getVideoDir} = require("./appConfig.coreutils.js")

exports.saveVideoFile = async (arrayBuffer, filename) => {
    try {

        const videoDir = getVideoDir();
        const validate = validateDir(videoDir);
        if(validate.status){
            console.log("Saving ", filename, "at", videoDir);

            // const arrayBuffer = await blob.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const filePath = path.join(videoDir, `${filename}.mp4`);
            fs.writeFileSync(filePath, buffer);
            console.log(`Video saved at: ${filePath}`);
            return {
                success: true,
                data: {
                    path: filePath
                },
                msg :  `Successfully saved video ${filePath}`

            }
        }else {
            console.log("saveVideoFile error!", validate)
            return {
                success: false,
                data: null,
                msg: `Error in validating video save directory!`
            }
        }
        
    }
    catch(err) {
        console.log("ERROR SAVING VIDEO FILE : ", err)
        return {
            success : false,
            msg:  `Error saving video ${filename}: ${err.message}`
        }
    }
 
};
