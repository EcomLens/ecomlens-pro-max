/*
NOTE ON RE-INITIALIZATION:
The tab-navigation system (navigation.utils.js) rebuilds this page's HTML from
scratch every time the user switches back to this tab, but this script itself
is only ever loaded/executed once per app session. So all DOM element
references and event listeners are re-established inside initRecordScan(),
which runs both on first load (called directly below) and on every
subsequent visit (dispatched via window.initRecordScan). Camera/scanner
state, the active MediaStream, and the MediaRecorder itself are kept at
module scope so they survive across tab switches instead of being torn down
and rebuilt each time.
*/

import { notify } from "../utils/notification.utils.js";
import { tabNavigate } from "../utils/navigation.utils.js";
import { getCurrentUser, escapeHtml, formatDate } from "../utils/dom.utils.js";

// ---- Persistent state (survives across tab switches) ----
let recorder;
let stream;
let chunks = [];
let isRecording = false;
let isCameraSupported = null;
let activeBarcode = null;   // barcode for *current* recording
let activeStartTs = null;   // timestamp captured when recording starts
let queuedBarcode = null;   // barcode scanned while recording
let cameraConfirmed = false;
let scannerConfirmed = false;
let hasAnnouncedConnectionPassed = false;
let hasGreeted = false;
let scanBuffer = "";
let cameraInitInProgress = false;

const TEST_BARCODE_VALUE = "ECOMLENSTEST01";
const ignoredKeys = [
    "Shift", "Control", "Alt", "Meta",
    "CapsLock", "Tab", "Escape", "Backspace", "Delete",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "Home", "End", "PageUp", "PageDown", "Insert",
    "Enter", "ContextMenu", "ScrollLock", "Pause", "PrintScreen",

    "F1", "F2", "F3", "F4", "F5", "F6",
    "F7", "F8", "F9", "F10", "F11", "F12",

    "", "~", "!", "@", "#", "$", "%", "^", "&", "*",
    "(", ")", "-", "_", "=", "+", "[", "]", "{", "}",
    "\\", "|", ";", ":", "'", "\"", ",", ".", "/", "<", ">", "?"
]

// ---- DOM refs, re-queried every time initRecordScan() runs ----
let video, packagImage, barcodeInput;

function speak(text) {
    try {
        if (!("speechSynthesis" in window)) return;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        window.speechSynthesis.speak(utterance);
    } catch (err) {
        console.warn("Speech synthesis failed:", err);
    }
}

function showGreeting() {
    const user = getCurrentUser();
    const firstName = user?.first_name?.trim();
    if (!firstName) return; // older account with no name on file - skip quietly

    const greetingEl = document.getElementById("user-greeting");
    const nameEl = document.getElementById("greeting-name");
    if (!greetingEl || !nameEl) return;

    nameEl.textContent = firstName;
    greetingEl.classList.remove("hidden");
    greetingEl.classList.add("ecom-fade-in");

    speak(`Hello ${firstName}`);

    setTimeout(() => {
        greetingEl.classList.add("ecom-exiting");
        setTimeout(() => greetingEl.classList.add("hidden"), 300);
    }, 3500);
}

function updateConnectionStatus(startingRecording = false) {
    const cameraDot = document.getElementById("camera-status-dot");
    const cameraText = document.getElementById("camera-status-text");
    const scannerDot = document.getElementById("scanner-status-dot");
    const scannerText = document.getElementById("scanner-status-text");
    const testPrompt = document.getElementById("scanner-test-prompt");
    const passedBanner = document.getElementById("connection-passed-banner");
    const passedMsg = document.getElementById("connection-passed-msg");
    if (!cameraDot) return; // panel not in DOM (different tab active)

    cameraText.textContent = cameraConfirmed ? "Camera: Connected" : "Camera: Not connected";
    cameraDot.className = `h-2 w-2 rounded-full shrink-0 ${cameraConfirmed ? "bg-green-500" : "bg-text-dim"}`;

    scannerText.textContent = scannerConfirmed ? "Scanner: Connected" : "Scanner: Not confirmed";
    scannerDot.className = `h-2 w-2 rounded-full shrink-0 ${scannerConfirmed ? "bg-green-500" : "bg-text-dim"}`;

    testPrompt.classList.toggle("hidden", scannerConfirmed);

    if (cameraConfirmed && scannerConfirmed) {
        passedBanner.classList.remove("hidden");
        passedBanner.classList.add("flex");
        if (!hasAnnouncedConnectionPassed) {
            hasAnnouncedConnectionPassed = true;
            // A real barcode scan confirms the scanner AND starts recording in
            // the same instant - saying "start scanning now" would talk over a
            // recording that's already running. Reflect what actually happened.
            if (startingRecording) {
                passedMsg.textContent = "Connection Passed — Recording started";
                speak("Connection passed. Recording started.");
            } else {
                passedMsg.textContent = "Connection Passed — Start scanning now";
                speak("Connection passed. Start scanning now.");
            }
        }
    } else {
        passedBanner.classList.add("hidden");
        passedBanner.classList.remove("flex");
    }
}

function markCameraConfirmed(connected) {
    if (cameraConfirmed === connected) return;
    cameraConfirmed = connected;
    updateConnectionStatus();
}

function markScannerConfirmed(startingRecording = false) {
    if (scannerConfirmed) return;
    scannerConfirmed = true;
    updateConnectionStatus(startingRecording);
}

function recordingStatusUI(mode) {
  let blinkOuterCircle = document.getElementById("blink-outer-circle")
  const blink = document.getElementById("blink-svg")
  const blinkWrapper = document.getElementById("blink-wrapper")
  const timer = document.getElementById("timer")

  let interval = 0
  let minutes = '00';
  let seconds = '00';
  let setIntervalObject;
  if(mode === 'show'){
        timer.innerText = `00:00`
        setIntervalObject = setInterval(()=> {
        interval++;
            minutes = `${Math.floor(interval/60).toString().length == 1 ? `0${Math.floor(interval/60)}` : `${Math.floor(interval/60)}`}`
            seconds = `${(interval%60).toString().length == 1 ? `0${interval%60}` : `${interval%60}`}`
            timer.innerText = `${minutes}:${seconds}`
    }, 1000)
    timer.style.display = "block"
    blinkWrapper.style.display = "flex"
    blink.classList.add("recording")
    blinkOuterCircle.setAttribute("fill" , "#e06155")

    return setIntervalObject

  }
  else if(mode === 'hide'){
    interval = 0
    minutes = '00'
    seconds = '00'
    clearInterval(setIntervalObject)
    blinkWrapper.style.display = "none"
    blink.classList.remove("recording")
    blinkOuterCircle.setAttribute("fill" , "#767676")
    timer.style.display = "none"
  }
}

// -----------------------------------Timestamp Function--------------------------------------

function tsString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}-${String(d.getMinutes()).padStart(2,'0')}`
}

// -----------------------------------/Timestamp Function--------------------------------------

function handleBarcodeFocusIn(event) {
    event.target.classList.add("scanning")
    let scanInfo = document.getElementById("scan-info")
    scanInfo.textContent = "Scanning..."
    scanInfo.style.color = "green"
    scanInfo.style.fontWeight = 800
    event.target.style.color = "#0D058f"
}

function handleBarcodeFocusOut(event) {
    event.target.classList.remove("scanning")
    let scanInfo = document.getElementById("scan-info")
    scanInfo.textContent = "Click inside the above input box to scan barcode & recording"
    scanInfo.style.color = "#555555"
}

async function initCamera() {
    let intervalObject = null

    const preferredCameraId = localStorage.getItem("preferredCameraId")
    try {
        const videoConstraint = preferredCameraId ? { deviceId: { exact: preferredCameraId } } : true
        stream = await navigator.mediaDevices.getUserMedia({video: videoConstraint, audio: false})
    } catch (err) {
        if (preferredCameraId) {
            console.warn("Preferred camera unavailable, falling back to default:", err)
            stream = await navigator.mediaDevices.getUserMedia({video: true, audio: false})
        } else {
            throw err
        }
    }
    video.srcObject = stream;

    let options = {videoBitsPerSecond:2_500_000}
    const preferredMimeType = "video/mp4;codecs=avc1.42E01E,mp4a.40.2"
    if(MediaRecorder.isTypeSupported(preferredMimeType)) {
        options.mimeType = preferredMimeType
    }
    recorder = new MediaRecorder(stream, options)

    recorder.onstart = (e) => {
        intervalObject = recordingStatusUI('show')
        isRecording = true
        chunks = [];
        let lastPkgBtn = document.getElementById("last-pkg-btn")
        lastPkgBtn.classList.remove('cursor-not-allowed')
        lastPkgBtn.classList.add('cursor-pointer')
        lastPkgBtn.disabled = false
        lastPkgBtn.style.backgroundColor = "#fe8412ff"
        console.log("[Recorder] started for")
    }

    recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
        console.log({chunk : e.data })
    };

    recorder.onstop = async () => {
        clearInterval(intervalObject)
        recordingStatusUI('hide')

        isRecording = false;
        console.log("[Recorder] stopped. chunks:", chunks.length);

        const lastPkgBtn = document.getElementById("last-pkg-btn")
        if (lastPkgBtn) {
            lastPkgBtn.classList.add('cursor-not-allowed')
            lastPkgBtn.classList.remove('cursor-pointer')
            lastPkgBtn.disabled = true
            lastPkgBtn.style.backgroundColor = ""
        }

        if (chunks.length > 0 && activeBarcode) {
            const blob = new Blob(chunks, { type: 'video/mp4' });
            const arrayBuffer = await blob.arrayBuffer()
            const safe = sanitize(activeBarcode);
            const fname = `${safe}_${activeStartTs}`;
            const user = getCurrentUser();
            const videoFile = await window.ipc.saveVideoFileIPC(arrayBuffer, fname, safe, activeStartTs, user?.id);
            if (videoFile?.success && videoFile.dbSaved === false) {
                notify(`Saved ${fname}.mp4, but it won't appear in the Recordings Library (metadata save failed)`, "error");
            } else {
                notify(videoFile?.success ? `Saved: ${fname}.mp4` : `Failed to save: ${videoFile?.msg || 'unknown error'}`, videoFile?.success ? "success" : "error");
            }
            loadRecentRecords();
            loadTodayCount();
        }

        // clear current session
        activeBarcode = null;
        activeStartTs = null;
        chunks = [];

        // Was another barcode scanned while we were recording? Start that now.
        if (queuedBarcode) {
            const next = queuedBarcode;
            queuedBarcode = null;
            startRecordingForBarcode(next);
        }
  };

}

function stopRecording() {
    if(isRecording) {
        recorder.stop()
        return
    }
    notify("Recording not yet started!", "error")
}

function startRecording() {
    if(!isRecording) {
        recorder.start()
        return
    }
    notify("Already recording!", "error")
}

async function tryInitCamera() {
    // getUserMedia'ing the same physical camera twice concurrently (e.g. the
    // initial load racing with an early ondevicechange event) can hang
    // indefinitely on Windows instead of erroring, so hard-guard against
    // overlapping attempts.
    if (cameraInitInProgress) return
    cameraInitInProgress = true
    try {
        await initCamera()
        console.log("Camera ready")
        isCameraSupported = true
        packagImage.classList.add("hidden")
        video.classList.remove("hidden")
        video.classList.add("ecom-fade-in")
        markCameraConfirmed(true)
    } catch (err) {
        console.error("Camera Initialization Failed :", err)
        isCameraSupported = false;
        video.classList.add("hidden")
        packagImage.classList.remove("hidden")
        markCameraConfirmed(false)
    } finally {
        cameraInitInProgress = false
    }
}

// Detect a camera being plugged in after page load and automatically pick it up.
navigator.mediaDevices.ondevicechange = async () => {
    if (isCameraSupported || cameraInitInProgress) return
    try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const hasCamera = devices.some(d => d.kind === "videoinput")
        if (hasCamera) {
            await tryInitCamera()
        }
    } catch (err) {
        console.warn("Device change check failed:", err)
    }
}

// -------------------sanitize-----------------------------------

function sanitize(name) {
  return String(name).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
}

// -------------------/sanitize-----------------------------------

// --------------------Start Recording For Barcode--------------------------------

function startRecordingForBarcode(barcode) {
    if (!recorder) return;
    activeBarcode = barcode;
    activeStartTs = tsString();
    startRecording()
    notify(`Recording: ${barcode}`);
}

// --------------------/Start Recording For Barcode--------------------------------

// -----------------finalizeScan-----------------------------------------------

function finalizeScan(scan) {

  if (!scan) return;

  if (!recorder) {
    notify("Camera not ready — cannot start recording yet", "error");
    return;
  }

  // show in input
  barcodeInput.value = scan;
  barcodeInput.classList.remove("ecom-scan-flash");
  void barcodeInput.offsetWidth; // restart the CSS animation
  barcodeInput.classList.add("ecom-scan-flash");

  // main control logic
  if (isRecording) {
    // queue next and stop current
    queuedBarcode = scan;
    stopRecording();
  } else {
    startRecordingForBarcode(scan);
  }
}
// -----------------------/Finalize Scan------------------------------
// -----------------------Key Handler---------------------------------

function keyHandler(e) {
    if(e.key === "Enter") {
        console.log({scannedBarcode : scanBuffer })
        let trimmedScanBuffer = scanBuffer.trim()

        // Any completed scan (real product or the on-screen test barcode)
        // proves a working scanner is connected. A real product barcode also
        // starts a recording in the same instant - pass that along so the
        // confirmation message doesn't claim scanning hasn't started yet.
        const willStartRecording = trimmedScanBuffer
            && trimmedScanBuffer !== TEST_BARCODE_VALUE
            && trimmedScanBuffer !== 'END'
            && trimmedScanBuffer !== 'LAST';

        if(trimmedScanBuffer) {
            markScannerConfirmed(willStartRecording);
        }

        if(trimmedScanBuffer === TEST_BARCODE_VALUE) {
            notify("Test barcode scanned — scanner confirmed", "success");
        }
        else if(trimmedScanBuffer === 'END' || trimmedScanBuffer === 'LAST') {
            console.log("Recording Session End!")
        }
        else if(trimmedScanBuffer) {
            console.log("Product scanned continue recording packaging")
            finalizeScan(trimmedScanBuffer);
        }
        scanBuffer = ""
    }
    else if(!ignoredKeys.includes(e.key) && e.key.length === 1) {
        scanBuffer += e.key
    }
}

// -----------------------/Key Handler--------------------------------------

// ---------------------- Recent Records panel ----------------------

async function loadRecentRecords() {
    const listEl = document.getElementById("recent-records-list");
    if (!listEl) return;
    try {
        const user = getCurrentUser();
        const response = await window.ipc.getAllDataIPC(user?.id, 5);
        const records = response?.data || [];
        if (records.length === 0) {
            listEl.innerHTML = `<p class="text-sm text-white/60 px-1">No recordings yet.</p>`;
            return;
        }
        listEl.innerHTML = records.map(r => `
            <div class="flex items-center justify-between gap-2 py-2 px-1 border-b border-white/10 last:border-0">
                <div class="min-w-0">
                    <p class="font-mono text-sm text-white truncate">${escapeHtml(r.barcode)}</p>
                    <p class="text-xs text-white/50">${escapeHtml(formatDate(r.recording_date))}</p>
                </div>
                <button data-path="${escapeHtml(r.path)}" class="recent-play-btn text-gold text-xs font-semibold hover:underline cursor-pointer shrink-0">Play</button>
            </div>
        `).join("");
        listEl.querySelectorAll(".recent-play-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                window.ipc.openFileInExplorerIPC(btn.getAttribute("data-path"), "play-video");
            });
        });
    } catch (err) {
        console.error("Failed to load recent records:", err);
        listEl.innerHTML = `<p class="text-sm text-white/60 px-1">Unable to load recordings.</p>`;
    }
}

function todaysDateString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

async function loadTodayCount() {
    const badge = document.getElementById("today-count-badge");
    if (!badge) return;
    try {
        const user = getCurrentUser();
        const response = await window.ipc.getTotalCountIPC(user?.id, todaysDateString());
        badge.textContent = `Today: ${response?.data?.total ?? 0}`;
    } catch (err) {
        console.error("Failed to load today's count:", err);
    }
}

// ---------------------- Init / Destroy (re-run every time this tab is shown) ----------------------

function initRecordScan(){
    console.log("Init method of record-scan.renderer.js")

    // Re-query DOM elements fresh - this tab's HTML is rebuilt from scratch every visit
    video = document.getElementById("video")
    packagImage = document.getElementById("package-image")
    barcodeInput = document.getElementById("barcode-input")

    // Re-attach listeners to the fresh elements
    barcodeInput.addEventListener("focusin", handleBarcodeFocusIn)
    barcodeInput.addEventListener("focusout", handleBarcodeFocusOut)
    barcodeInput.addEventListener("keydown", keyHandler)
    document.getElementById("stop-recording-btn").addEventListener("click", stopRecording)
    document.getElementById("last-pkg-btn").addEventListener("click", stopRecording)
    document.getElementById("view-library-btn")?.addEventListener("click", () => tabNavigate("recordings-lib"))

    if (stream && recorder) {
        // Camera was already set up on a previous visit - just rebind the
        // still-live stream to the freshly created <video> element instead
        // of requesting the camera all over again.
        video.srcObject = stream
        packagImage.classList.add("hidden")
        video.classList.remove("hidden")
    } else if (!cameraInitInProgress) {
        tryInitCamera()
    }

    updateConnectionStatus()

    if (!hasGreeted) {
        hasGreeted = true
        showGreeting()
    }

    loadRecentRecords()
    loadTodayCount()
}

function destroyRecordScan(){
    console.log("destroy method of record-scan.renderer.js")
    if (isRecording && recorder) {
        console.log("Auto-stopping and saving recording due to tab switch")
        recorder.stop()
    }
}

// First load: run directly (the dispatch call in navigation.utils.js races
// ahead of this module script's own execution on the very first visit).
initRecordScan()

// Subsequent visits: navigation.utils.js dispatches through these.
window.initRecordScan = initRecordScan
window.destroyRecordScan = destroyRecordScan
