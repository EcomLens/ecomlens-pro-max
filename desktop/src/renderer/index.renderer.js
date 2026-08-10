import { login, signup, activate, checkActivationAndShowPanel } from "../utils/auth.utils.js";
// console.log("hello from index renderer")

const activateBtn = document.getElementById("activate-btn");
const activationBuyLink = document.getElementById("activationBuyLink");

activateBtn.addEventListener("click", activate);
activationBuyLink.addEventListener("click", (e) => {
    e.preventDefault();
    // TODO: update once the jinzy.com purchase page is live.
    window.ipc.openExternalIPC("https://jinzy.com/ecomlens-pro-max");
});

checkActivationAndShowPanel();

const loginTab = document.getElementById("loginTab");
const signupTab = document.getElementById("signupTab");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const backToLogin = document.getElementById("backToLogin");
const backToSignup = document.getElementById("backToSignup");
const loginBtn = document.getElementById("login-btn")
const signupBtn = document.getElementById("signup-btn")

function playFadeIn(el) {
    el.classList.remove("ecom-fade-in");
    void el.offsetWidth; // restart the CSS animation
    el.classList.add("ecom-fade-in");
}

// login - signup tab click handle
loginTab.addEventListener("click", () => {
    loginForm.classList.remove("hidden");
    signupForm.classList.add("hidden");
    playFadeIn(loginForm);
    loginTab.classList.add("border-b-2","border-blue-500","text-blue-600","font-bold"); //"border-b-2 border-blue-500 text-blue-600 font-bold"
    // loginTab.classList.add("border-b-2 border-blue-500 text-blue-600 font-bold bg-red-600")
    signupTab.classList.remove("border-b-2","border-blue-500","text-blue-600", "font-bold");
});

signupTab.addEventListener("click", () => {
    signupForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
    playFadeIn(signupForm);
    signupTab.classList.add("border-b-2","border-blue-500","text-blue-600","font-bold");
    loginTab.classList.remove("border-b-2","border-blue-500","text-blue-600","font-bold");
    loginTab.classList.add("hover:text-blue-600", "text-gray-600")
});

backToLogin.addEventListener("click", (e) => {
    e.preventDefault();
    loginTab.click();
});

backToSignup.addEventListener("click", (e) => {
    e.preventDefault();
    signupTab.click();
});



//login handler
loginBtn.addEventListener('click', login)

//signup handler
signupBtn.addEventListener('click', signup)

