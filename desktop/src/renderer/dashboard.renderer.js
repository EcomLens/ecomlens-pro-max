import { tabNavigate, pageNavigate } from "../utils/navigation.utils.js"

// const view = document.getElementById('view')
const dashboardBtn = document.getElementById("dashboard-btn")
const recordingsLibBtn = document.getElementById("recordings-library-btn")
const tutorials = document.getElementById("tutorials-btn")
const settingsBtn = document.getElementById("settings-btn")
const newRecordingsBtn = document.getElementById("new-recordings-btn")
const logoutBtn = document.getElementById("logout-btn")
const exitBtn = document.getElementById("exit-btn")
const helpBtn = document.getElementById("help-btn")
const helpModal = document.getElementById("help-modal")
const helpModalClose = document.getElementById("help-modal-close")
const helpWatchTutorialBtn = document.getElementById("help-watch-tutorial-btn")
const helpEmailLink = document.getElementById("help-email-link")

tabNavigate("record-scan") //load record scan by default
recordingsLibBtn.addEventListener("click", ()=> tabNavigate("recordings-lib"))
dashboardBtn.addEventListener("click", ()=> tabNavigate("record-scan"))
tutorials.addEventListener("click", ()=> tabNavigate("tutorials"))
newRecordingsBtn.addEventListener("click", ()=> tabNavigate("record-scan"))
settingsBtn.addEventListener("click", ()=> tabNavigate("settings"))

logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("user")
    pageNavigate("index")
})

exitBtn.addEventListener("click", () => {
    window.ipc.quitAppIPC()
})

function openHelpModal() {
    helpModal.classList.remove("hidden")
}
function closeHelpModal() {
    helpModal.classList.add("hidden")
}

helpBtn.addEventListener("click", openHelpModal)
helpModalClose.addEventListener("click", closeHelpModal)
helpModal.addEventListener("click", (e) => {
    if (e.target === helpModal) closeHelpModal()
})
helpWatchTutorialBtn.addEventListener("click", () => {
    closeHelpModal()
    tabNavigate("tutorials")
})
helpEmailLink.addEventListener("click", (e) => {
    e.preventDefault()
    window.ipc.openExternalIPC(helpEmailLink.href)
})