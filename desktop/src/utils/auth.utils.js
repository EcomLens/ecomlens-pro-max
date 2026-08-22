import { pageNavigate } from "./navigation.utils.js"
import { notify } from "./notification.utils.js"

function setButtonLoading(btn, isLoading, loadingText) {
    if(isLoading){
        btn.dataset.originalText = btn.innerHTML
        btn.disabled = true
        btn.classList.add("opacity-80", "cursor-not-allowed")
        btn.innerHTML = `<span class="ecom-spinner"></span> <span class="ml-2">${loadingText}</span>`
    }
    else {
        btn.disabled = false
        btn.classList.remove("opacity-80", "cursor-not-allowed")
        if(btn.dataset.originalText) btn.innerHTML = btn.dataset.originalText
    }
}

export async function checkActivationAndShowPanel(){
    const status = await window.ipc.getActivationStatusIPC()
    document.getElementById("activationPanel")?.classList.toggle("hidden", status.activated)
    document.getElementById("authPanel")?.classList.toggle("hidden", !status.activated)
}

export async function activate(){
    const email = document.getElementById("activation-email").value.trim()
    const password = document.getElementById("activation-password").value
    const btn = document.getElementById("activate-btn")

    if(!email || !password){
        notify("Enter your email and password", "error")
        return
    }

    setButtonLoading(btn, true, "Activating...")
    const response = await window.ipc.deviceLoginIPC(email, password)
    setButtonLoading(btn, false)

    if(response.status){
        notify("EcomLens Pro Max activated", "success")
        checkActivationAndShowPanel()
    }
    else {
        notify(response.msg || "Activation failed", "error")
    }
}

export async function login(){
    const username = document.getElementById("login-username").value.trim()
    const password = document.getElementById("login-password").value
    const btn = document.getElementById("login-btn")

    setButtonLoading(btn, true, "Logging in...")
    const response = await window.ipc.loginIPC(username, password)
    setButtonLoading(btn, false)

    if(response.status){
        localStorage.setItem("user", JSON.stringify(response.data))
        notify(response.msg || "Logged in", "success")
        document.getElementById("auth-card")?.classList.add("ecom-exiting")
        setTimeout(() => pageNavigate('dashboard'), 250)
    }
    else {
        notify(response.msg || "Login failed", "error")
    }
}

export async function signup(){
    const firstName = document.getElementById("signup-first-name").value.trim()
    const username = document.getElementById("signup-username").value.trim()
    const password = document.getElementById("signup-password").value
    const btn = document.getElementById("signup-btn")

    setButtonLoading(btn, true, "Signing up...")
    const response = await window.ipc.signupIPC(username, password, firstName)
    setButtonLoading(btn, false)

    notify(response.msg, response.status ? "success" : "error")
    if(response.status){
        document.getElementById("backToLogin").click()
    }
}
