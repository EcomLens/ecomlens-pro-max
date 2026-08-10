import { notify } from "../utils/notification.utils.js";
import { getCurrentUser } from "../utils/dom.utils.js";

// NOTE ON RE-INITIALIZATION: see record-scan.renderer.js for the full
// explanation. DOM refs + listeners must be re-established every time
// initSettings() runs (every tab visit), not just once at module load -
// this is what was causing "Logged in as" / "App Version" to show blank
// after the first visit.

let usernameEl, appVersionEl, videoDirEl, changeDirBtn, resetDirBtn, cameraSelect;
let termsOpenBtn, termsModal, termsModalClose;

async function loadAccountInfo() {
    const user = getCurrentUser();
    usernameEl.textContent = user?.username || "Unknown";
    try {
        appVersionEl.textContent = await window.ipc.getAppVersionIPC();
    } catch {
        appVersionEl.textContent = "Unknown";
    }
}

async function loadVideoDir() {
    try {
        videoDirEl.textContent = await window.ipc.getVideoDirIPC();
    } catch {
        videoDirEl.textContent = "Unavailable";
    }
}

async function handleChangeDir() {
    const result = await window.ipc.selectVideoDirIPC();
    if (result?.success) {
        videoDirEl.textContent = result.path;
        notify("Recordings will now save to the new folder", "success");
    } else if (result?.msg) {
        notify(`Could not use that folder: ${result.msg}`, "error");
    }
}

async function handleResetDir() {
    const result = await window.ipc.resetVideoDirIPC();
    videoDirEl.textContent = result.path;
    notify("Storage location reset to default", "success");
}

async function loadCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(d => d.kind === "videoinput");
        cameraSelect.innerHTML = "";
        if (cameras.length === 0) {
            cameraSelect.innerHTML = `<option value="">No camera found</option>`;
            return;
        }
        const preferred = localStorage.getItem("preferredCameraId");
        cameras.forEach((cam, i) => {
            const opt = document.createElement("option");
            opt.value = cam.deviceId;
            opt.textContent = cam.label || `Camera ${i + 1}`;
            if (cam.deviceId === preferred) opt.selected = true;
            cameraSelect.appendChild(opt);
        });
    } catch (err) {
        console.error("Failed to list cameras:", err);
        cameraSelect.innerHTML = `<option value="">Unable to list cameras</option>`;
    }
}

function handleCameraChange() {
    if (cameraSelect.value) {
        localStorage.setItem("preferredCameraId", cameraSelect.value);
        notify("Camera preference saved", "success");
    }
}

function handleTermsOpen() {
    termsModal.classList.remove("hidden");
}

function handleTermsClose() {
    termsModal.classList.add("hidden");
}

function handleTermsBackdropClick(e) {
    if (e.target === termsModal) termsModal.classList.add("hidden");
}

function initSettings(){
    console.log("Init method of settings.renderer.js")

    usernameEl = document.getElementById("settings-username");
    appVersionEl = document.getElementById("settings-app-version");
    videoDirEl = document.getElementById("settings-video-dir");
    changeDirBtn = document.getElementById("settings-change-dir-btn");
    resetDirBtn = document.getElementById("settings-reset-dir-btn");
    cameraSelect = document.getElementById("settings-camera-select");
    termsOpenBtn = document.getElementById("terms-open-btn");
    termsModal = document.getElementById("terms-modal");
    termsModalClose = document.getElementById("terms-modal-close");

    changeDirBtn.addEventListener("click", handleChangeDir);
    resetDirBtn.addEventListener("click", handleResetDir);
    cameraSelect.addEventListener("change", handleCameraChange);
    termsOpenBtn.addEventListener("click", handleTermsOpen);
    termsModalClose.addEventListener("click", handleTermsClose);
    termsModal.addEventListener("click", handleTermsBackdropClick);

    loadAccountInfo();
    loadVideoDir();
    loadCameras();
}

function destroySettings(){
    console.log("destroy method of settings.renderer.js")
}

initSettings()

window.initSettings = initSettings
window.destroySettings = destroySettings
