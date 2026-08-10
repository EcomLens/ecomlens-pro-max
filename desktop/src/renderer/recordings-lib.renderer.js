// NOTE ON RE-INITIALIZATION: see record-scan.renderer.js for the full
// explanation. In short: this tab's HTML is rebuilt from scratch every time
// the user navigates back to it, but this script only ever loads once per
// app session, so DOM refs + listeners must be re-established every time
// initRecordingsLib() runs, not just once at module load.

import { getCurrentUser, escapeHtml, formatDate } from "../utils/dom.utils.js";

let tbody, noRecordsMsg, videoDirPathEl, openFolderBtn, searchInput, searchModeSelect, dateFromInput, dateToInput, searchBtn, clearSearchBtn;

let allRecords = [];

function formatDayHeader(day) {
    const d = new Date(day);
    if (isNaN(d.getTime())) return day;
    return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// Groups already-sorted (recording_date DESC) records by calendar day.
// Since the input is pre-sorted, each day's records stay contiguous and
// days come out newest-first with no re-sort needed.
function groupByDay(records) {
    const groups = new Map();
    for (const record of records) {
        const day = String(record.recording_date || "").slice(0, 10) || "Unknown";
        if (!groups.has(day)) groups.set(day, []);
        groups.get(day).push(record);
    }
    return groups;
}

function renderRecords(records) {
    tbody.innerHTML = "";
    if (!records || records.length === 0) {
        noRecordsMsg.classList.remove("hidden");
        return;
    }
    noRecordsMsg.classList.add("hidden");

    for (const [day, dayRecords] of groupByDay(records)) {
        const headerRow = document.createElement("tr");
        headerRow.className = "bg-navy/5";
        headerRow.innerHTML = `<td colspan="5" class="py-2 px-3 font-semibold text-navy text-sm">${escapeHtml(formatDayHeader(day))} — ${dayRecords.length} recording${dayRecords.length === 1 ? '' : 's'}</td>`;
        tbody.appendChild(headerRow);

        dayRecords.forEach(record => {
            const tr = document.createElement("tr");
            tr.className = "border-b border-cream-dark hover:bg-cream transition-colors duration-150";
            tr.innerHTML = `
                <td class="py-2 px-3 font-mono">${escapeHtml(record.barcode)}</td>
                <td class="py-2 px-3">${escapeHtml(record.filename)}.mp4</td>
                <td class="py-2 px-3">${escapeHtml(formatDate(record.recording_date))}</td>
                <td class="py-2 px-3">${escapeHtml(record.size)}</td>
                <td class="py-2 px-3 flex gap-3">
                    <button data-action="play" data-path="${escapeHtml(record.path)}" class="text-navy hover:underline cursor-pointer">Play</button>
                    <button data-action="open-in-folder" data-path="${escapeHtml(record.path)}" class="text-text-dim hover:underline cursor-pointer">Show in Folder</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

async function loadAllRecords() {
    try {
        const user = getCurrentUser();
        const response = await window.ipc.getAllDataIPC(user?.id, 1000);
        allRecords = response?.data || [];
        applyFilters();
    } catch (err) {
        console.error("Failed to load recordings:", err);
        allRecords = [];
        renderRecords([]);
    }
}

function applyFilters() {
    const barcodeQuery = searchInput.value.trim().toLowerCase();
    const mode = searchModeSelect.value;
    const dateFrom = dateFromInput.value; // "YYYY-MM-DD" or ""
    const dateTo = dateToInput.value;

    let filtered = allRecords;

    if (barcodeQuery) {
        filtered = filtered.filter(r => {
            const barcode = String(r.barcode || "").toLowerCase();
            if (mode === "startsWith") return barcode.startsWith(barcodeQuery);
            if (mode === "endsWith") return barcode.endsWith(barcodeQuery);
            if (mode === "exact") return barcode === barcodeQuery;
            return barcode.includes(barcodeQuery); // contains
        });
    }

    // recording_date is stored as "YYYY-MM-DD_HH-MM", which sorts/compares
    // correctly as a plain string against an <input type="date"> value.
    if (dateFrom) {
        filtered = filtered.filter(r => String(r.recording_date || "").slice(0, 10) >= dateFrom);
    }
    if (dateTo) {
        filtered = filtered.filter(r => String(r.recording_date || "").slice(0, 10) <= dateTo);
    }

    renderRecords(filtered);
    clearSearchBtn.classList.toggle("hidden", !(barcodeQuery || dateFrom || dateTo));
}

function handleTbodyClick(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const filePath = btn.getAttribute("data-path");
    const action = btn.getAttribute("data-action");
    window.ipc.openFileInExplorerIPC(filePath, action === "play" ? "play-video" : "open-in-folder");
}

function handleSearchKeydown(e) {
    if (e.key === "Enter") applyFilters();
}

function handleSearchModeChange() {
    if (searchInput.value.trim()) applyFilters();
}

function handleClearSearch() {
    searchInput.value = "";
    searchModeSelect.value = "contains";
    dateFromInput.value = "";
    dateToInput.value = "";
    clearSearchBtn.classList.add("hidden");
    renderRecords(allRecords);
}

async function loadVideoDir() {
    try {
        const dir = await window.ipc.getVideoDirIPC();
        videoDirPathEl.textContent = dir;
        openFolderBtn.addEventListener("click", () => {
            window.ipc.openFileInExplorerIPC(dir, "open-directory");
        });
    } catch (err) {
        console.error("Failed to load video directory:", err);
        videoDirPathEl.textContent = "Unavailable";
    }
}

function initRecordingsLib(){
    console.log("Init method of recordings-lib.renderer.js")

    tbody = document.getElementById("records-tbody");
    noRecordsMsg = document.getElementById("no-records-msg");
    videoDirPathEl = document.getElementById("video-dir-path");
    openFolderBtn = document.getElementById("open-folder-btn");
    searchInput = document.getElementById("search-barcode");
    searchModeSelect = document.getElementById("search-mode");
    dateFromInput = document.getElementById("search-date-from");
    dateToInput = document.getElementById("search-date-to");
    searchBtn = document.getElementById("search-btn");
    clearSearchBtn = document.getElementById("clear-search-btn");

    tbody.addEventListener("click", handleTbodyClick);
    searchBtn.addEventListener("click", applyFilters);
    searchInput.addEventListener("keydown", handleSearchKeydown);
    dateFromInput.addEventListener("change", applyFilters);
    dateToInput.addEventListener("change", applyFilters);
    searchModeSelect.addEventListener("change", handleSearchModeChange);
    clearSearchBtn.addEventListener("click", handleClearSearch);

    loadVideoDir();
    loadAllRecords();
}

function destroyRecordingsLib(){
    console.log("destroy method of recordings-lib.renderer.js")
}

initRecordingsLib()

window.initRecordingsLib = initRecordingsLib
window.destroyRecordingsLib = destroyRecordingsLib
