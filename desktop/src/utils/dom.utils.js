export function getCurrentUser() {
    try {
        return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
        return null;
    }
}

export function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

export function formatDate(isoLike) {
    const d = new Date(isoLike);
    if (isNaN(d.getTime())) return isoLike || "-";
    return d.toLocaleString();
}
