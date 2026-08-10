const BACKGROUNDS = {
  info: "linear-gradient(to right,#16233A,#2B4570)",
  success: "linear-gradient(to right,#2B4570,#D9A900)",
  error: "linear-gradient(to right,#3A1414,#7A1F1F)"
}

export function notify(text="Notification", type="info") {
  Toastify({
    text,
    duration: 2500,
    gravity: "top",
    position: "right",
    background: BACKGROUNDS[type] || BACKGROUNDS.info
  }).showToast();
}
