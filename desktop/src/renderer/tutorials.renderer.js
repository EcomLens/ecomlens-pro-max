// NOTE ON RE-INITIALIZATION: see record-scan.renderer.js for the full
// explanation. DOM refs + listeners must be re-established every time
// initTutorials() runs (every tab visit), not just once at module load.

let videoEl, enBtn, hiBtn;

const ACTIVE_CLASSES = "border-gold text-ink";
const INACTIVE_CLASSES = "border-cream-dark text-text-dim";

function setTutorialLanguage(lang) {
    const src = lang === "hi" ? "../assets/videos/tutorial-hi.mp4" : "../assets/videos/tutorial-en.mp4";

    if (!videoEl.src.endsWith(src.replace("../", ""))) {
        const wasPlaying = !videoEl.paused;
        videoEl.src = src;
        if (wasPlaying) videoEl.play();
    }

    enBtn.className = `px-4 py-1 rounded-md border font-semibold transition-colors duration-200 cursor-pointer ${lang === "en" ? ACTIVE_CLASSES : INACTIVE_CLASSES}`;
    hiBtn.className = `px-4 py-1 rounded-md border font-semibold transition-colors duration-200 cursor-pointer ${lang === "hi" ? ACTIVE_CLASSES : INACTIVE_CLASSES}`;
}

function handleEnClick() {
    setTutorialLanguage("en");
}

function handleHiClick() {
    setTutorialLanguage("hi");
}

function initTutorials(){
    console.log("Init method of tutorials.renderer.js")

    videoEl = document.getElementById("tutorial-video");
    enBtn = document.getElementById("tutorial-lang-en");
    hiBtn = document.getElementById("tutorial-lang-hi");

    enBtn.addEventListener("click", handleEnClick);
    hiBtn.addEventListener("click", handleHiClick);
}

function destroyTutorials(){
    console.log("destroy method of tutorials.renderer.js")
    if (videoEl) videoEl.pause();
}

initTutorials()

window.initTutorials = initTutorials
window.destroyTutorials = destroyTutorials
