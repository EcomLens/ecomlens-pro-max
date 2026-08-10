import { rendererInitBinding, rendererDestroyBinding } from "./tabBindings.js";

export function invokeRendererFunctionByName(type, name) {
    if(!name){
        console.log("Wrong name provided...!", name)
        return
    }

    if(type === 'destroy') {
        const fnName = rendererDestroyBinding[name]
        try {
            window[fnName]?.()
        } catch(err) {
            console.error(`Error invoking destroy function "${fnName}" for "${name}":`, err)
        }
    }
    else if(type === 'init'){
        const fnName = rendererInitBinding[name]
        try {
            window[fnName]?.()
        } catch(err) {
            console.error(`Error invoking init function "${fnName}" for "${name}":`, err)
        }
    }
    else{
        console.log("Invoke Renderer Argument Type not registered "+ type)
    }
}
