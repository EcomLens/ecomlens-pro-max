import { invokeRendererFunctionByName } from "./services.utils.js";
let currentTab = null

//switch navigate
export async function tabNavigate(page){
    const view = document.getElementById("view")
    try {
        if(currentTab === page) {
            return console.log("Already on the same tab...!")
        }
        console.log("Tab Navigation --> " + `" ${page} "`)

        if(currentTab) {
            invokeRendererFunctionByName('destroy', currentTab)
        }

        view.classList.add("ecom-view-hidden")
        await new Promise(resolve => setTimeout(resolve, 120))

        const res = await fetch(`./${page}.html`);
        const html = await res.text();
        view.innerHTML = html;
        view.classList.remove("ecom-view-hidden")

        //check if the renderer preloaded
        let preScriptCheck = document.getElementById(`${page}-renderer-js`)
        if(preScriptCheck){
            console.log("Renderer script already exist no need to load")
        }else {
            //load renderer script for the pages/tabs
            console.log("Loading "+`${page}-renderer-js`+" renderer script")
            let script = document.createElement('script')
            script.id = `${page}-renderer-js`
            script.type = "module"
            script.src = `../renderer/${page}.renderer.js`
            document.body.appendChild(script)
        }
        invokeRendererFunctionByName('init', page)  //page route name is registered in constants and bind to init and destroy of that page
        currentTab = page;


    } catch (err) {
        currentTab = null
        view.classList.remove("ecom-view-hidden")
        view.innerHTML = "<p class='text-red-500'>Page not found</p>";
    }
}

export function pageNavigate(page) {
    console.log("Page Navigate to "+page)

    let a = document.createElement('a')
    a.href=`./${page}.html`
    a.click();
}
