const State = {
  SCAN_1: "SCAN_1",
  SCAN_2: "SCAN_2",
  RESULT: "RESULT",
};

let state = State.SCAN_1;
let mode = "enkel";
let firstValue = null;
let secondValue = null;
let acceptingInput = true;
let audioCtx = null;

// Camera / QR
let qr = null;
let scanningActive = false;
let scanIndex = 1;

// Duplicate guard (prevents same QR firing many times while camera stays on it)
let lastDecoded = "";
let lastDecodedAt = 0;
const DUPLICATE_WINDOW_MS = 1200;

let UI = {};
let buffer = "";

function initApp() {
  UI = {
    status: document.getElementById("status"),
    resultScreen: document.getElementById("resultScreen"),
    resultText: document.getElementById("resultText"),
    firstValue: document.getElementById("firstScannedValue"),
    secondValue: document.getElementById("secondScannedValue"),
    firstLabel: document.getElementById("firstLabel"),
    secondLabel: document.getElementById("secondLabel"),
    resetBtn: document.getElementById("resetBtn"),
    modeEnkelBtn: document.getElementById("modeEnkel"),
    modeMeerdereBtn: document.getElementById("modeMeerdere"),
    cameraBtn: document.getElementById("cameraBtn"),
    stopCameraBtn: document.getElementById("stopCameraBtn"),
    qrReader: document.getElementById("qrReader"),
  };

  UI.resetBtn.addEventListener("click", resetApp);
  UI.modeEnkelBtn.addEventListener("click", () => setMode("enkel"));
  UI.modeMeerdereBtn.addEventListener("click", () => setMode("meerdere"));
  UI.cameraBtn.addEventListener("click", startCameraScan);
  UI.stopCameraBtn.addEventListener("click", stopCameraScan);

  resetApp();
  setMode("enkel");
}

// MODE SWITCH
function setMode(newMode) {
  mode = newMode;
  UI.modeEnkelBtn.classList.remove("active", "enkel", "meerdere");
  UI.modeMeerdereBtn.classList.remove("active", "enkel", "meerdere");

  if (mode === "enkel") {
    UI.modeEnkelBtn.classList.add("active", "enkel");
  } else {
    UI.modeMeerdereBtn.classList.add("active", "meerdere");
  }

  resetApp();
}

// RESET
function resetApp() {
  state = State.SCAN_1;
  firstValue = null;
  secondValue = null;
  buffer = "" ;
  acceptingInput = true;

  scanIndex = 1;
  UI.resultScreen.classList.remove("ok", "no");
  hideElement(UI.resultScreen);
  clearResultDisplay();

  updateStatus("Start scannen");
  UI.resetBtn.classList.remove("danger");

  updateScanLabels();
  // allow same code again after reset
  lastDecoded = "";
  lastDecodedAt = 0;
}

function updateScanLabels() {
  if (mode === "meerdere") {
    UI.firstLabel.textContent = "1e";
    UI.secondLabel.textContent = `${scanIndex}e`;
  } else {
    UI.firstLabel.textContent = "1e";
    UI.secondLabel.textContent = "2e";
  }
}

// SCAN FLOW (unchanged logic)
function handleScan(raw) {
  const value = normalize(raw);
  buffer = "";

  if (state === State.SCAN_1) {
    firstValue = value;
    UI.resultScreen.classList.remove("ok", "no");
    updateScanLabels();

    // show first scan immediately
    UI.firstValue.textContent = firstValue;
    UI.secondValue.textContent = "";
    UI.resultText.textContent = "";
    UI.resultText.className = "result-text";
    showElement(UI.resultScreen);

    state = State.SCAN_2;
    updateStatus(mode === "meerdere" ? `Scan ${scanIndex + 1}e QR` : "Scan tweede QR");

  } else if (state === State.SCAN_2) {
    secondValue = value;
    acceptingInput = false;
    state = State.RESULT;

    showResult(secondValue === firstValue);
  }
}

// SHOW RESULT (mostly unchanged)
function showResult(ok) {
  UI.resultText.textContent = ok ? "GOED" : "FOUT - Klik Reset";
  UI.resultText.className = "result-text " + (ok ? "ok" : "no");

  UI.resultScreen.classList.remove("ok", "no");
  UI.resultScreen.classList.add(ok ? "ok" : "no");
  UI.firstValue.textContent = firstValue || "";
  UI.secondValue.textContent = secondValue || "";
  showElement(UI.resultScreen);

  playSound(ok);
  vibrate(ok);

  if (mode === "meerdere") {
    if (ok) {
      scanIndex += 1;
      firstValue = secondValue;
      secondValue = null;
      // Keep firstValue; continue scanning multiple second QR's

      state = State.SCAN_2;
      acceptingInput = true;
      updateScanLabels();
      updateStatus(`Scan ${scanIndex + 1}e QR`);
    } else {
      acceptingInput = false;
      updateStatus("");
    }
  } else {
    if (ok) {
      // Go back to scanning a fresh first QR
      state = State.SCAN_1;
      firstValue = null;
      secondValue = null;
      acceptingInput = true;
      updateStatus("Scan nieuwe 1e QR");
      updateScanLabels();
    } else {
      acceptingInput = false;
      updateStatus("");
    }
  }

  if (!ok) UI.resetBtn.classList.add("danger");
  else UI.resetBtn.classList.remove("danger");
}

// CAMERA SCANNING
async function startCameraScan() {
  if (scanningActive) return;

  // html5-qrcode must be loaded
  if (typeof Html5Qrcode === "undefined") {
    alert("html5-qrcode library not loaded. Add <script src=\"https://unpkg.com/html5-qrcode\"></script>");
    return;
  }

  showElement(UI.qrReader);
  hideElement(UI.cameraBtn);
  showElement(UI.stopCameraBtn);

  try {
    if (!qr) qr = new Html5Qrcode("qrReader");

    scanningActive = true;
    updateStatus("Camera aan — richt op QR");

    await qr.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 250 },
      onDecoded,
      () => {} // ignore decode errors (normal when no QR in view)
    );
  } catch (e) {
    scanningActive = false;
    showElement(UI.cameraBtn);
    hideElement(UI.stopCameraBtn);
    hideElement(UI.qrReader);
    alert("Kon camera niet starten: " + (e?.message || e));
  }
}

async function stopCameraScan() {
  if (!qr || !scanningActive) {
    scanningActive = false;
    showElement(UI.cameraBtn);
    hideElement(UI.stopCameraBtn);
    hideElement(UI.qrReader);
    return;
  }

  scanningActive = false;

  try {
    await qr.stop();
    await qr.clear();
  } catch {}

  showElement(UI.cameraBtn);
  hideElement(UI.stopCameraBtn);
  hideElement(UI.qrReader);

  updateStatus("Camera uit");
}

// Called by camera library when QR is decoded
function onDecoded(decodedText) {
  const now = Date.now();
  const value = normalize(decodedText);

  // prevent rapid repeat of same QR while still in camera view
  if (value === lastDecoded && now - lastDecodedAt < DUPLICATE_WINDOW_MS) return;
  lastDecoded = value;
  lastDecodedAt = now;

  // if locked (wrong result), give feedback like before
  if (!acceptingInput && state === State.RESULT) {
    playSound(false);
    vibrate(false);
    return;
  }

  if (!acceptingInput) return;

  handleScan(value);
}

// HELPERS
function updateStatus(text) {
  UI.status.textContent = text;
}
function showElement(el) {
  if (!el) {
    console.error("Tried to show a null element!");
    console.trace();
    return;
  }
  el.classList.remove("hidden");
}
function hideElement(el) {
  if (!el) {
    console.error("Tried to hide a null element!");
    console.trace();
    return;
  }
  el.classList.add("hidden");
}
function clearResultDisplay() {
  UI.resultText.textContent = "";
  UI.firstValue.textContent = "";
  UI.secondValue.textContent = "";
}
function normalize(s) {
  return (s || "").normalize("NFC").trim();
}

// FEEDBACK (unchanged)
function playSound(ok) {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    const now = audioCtx.currentTime;

    if (ok) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.value = 1200;

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.3, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

      osc.start(now);
      osc.stop(now + 0.25);
    } else {
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();

      osc1.type = "square";
      osc1.frequency.value = 300;

      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);

      gain1.gain.setValueAtTime(0.3, now);
      osc1.start(now);
      osc1.stop(now + 0.2);

      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();

      osc2.type = "square";
      osc2.frequency.value = 180;

      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);

      gain2.gain.setValueAtTime(0.3, now + 0.3);
      osc2.start(now + 0.3);
      osc2.stop(now + 0.6);
    }
  } catch (e) {
    console.warn("Geluid kon niet worden afgespeeld:", e);
  }
}

function vibrate(ok) {
  if (navigator.vibrate) {
    navigator.vibrate(ok ? 80 : [120, 60, 120]);
  }
}

document.addEventListener("DOMContentLoaded", initApp);
