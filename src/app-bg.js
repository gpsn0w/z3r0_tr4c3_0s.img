const cfg = window.Z3R0_CONFIG;

const $ = (id) => document.getElementById(id);
const state = {
  usbDevice: null,
  deviceProfile: null,
  release: null,
  manifest: null,
  build: null,
  packageBytes: null,
  step: 1
};

function log(message) {
  const el = $("log");
  el.textContent += `\n[z3r0] ${message}`;
  el.scrollTop = el.scrollHeight;
}

function setBadge(text, kind = "neutral") {
  const badge = $("browserBadge");
  badge.textContent = text;
  badge.className = `badge ${kind}`;
}

function setPanelState(title, kind = "neutral") {
  $("panelTitle").textContent = title;
  const orb = $("panelStatusOrb");
  orb.className = `status-orb ${kind === "green" ? "good" : kind === "red" ? "bad" : ""}`;
}

function setStep(step) {
  state.step = Math.max(1, Math.min(4, step));
  document.querySelectorAll(".install-step").forEach((el) => {
    const n = Number(el.dataset.step);
    el.classList.toggle("active", n === state.step);
    el.classList.toggle("complete", n < state.step);
  });
  const progress = ((state.step - 1) / 3) * 100;
  const line = $("progressLine");
  if (line) line.style.width = `${progress}%`;
  document.querySelectorAll(".step-line i").forEach((segment, index) => {
    segment.style.width = index < state.step - 1 ? "100%" : "0%";
  });
}

function vendorHex(id) {
  return id.toString(16).padStart(4, "0").toLowerCase();
}

function checkBrowser() {
  if (!window.isSecureContext) {
    setBadge("Изисква се HTTPS", "red");
    $("connectBtn").disabled = true;
    setPanelState("Отвори инсталатора през HTTPS.", "red");
    log("WebUSB изисква защитен HTTPS контекст. GitHub Pages е подходящ.");
    return;
  }
  if (!("usb" in navigator)) {
    setBadge("WebUSB не е наличен", "red");
    $("connectBtn").disabled = true;
    setPanelState("Използвай настолен Chrome или Edge.", "red");
    log("WebUSB is not available in this browser. Използвай настолен Chrome или Edge.");
    return;
  }
  setBadge("WebUSB е готов", "green");
  setPanelState("Свържи телефона си.");
  log("WebUSB API е наличен.");
}

async function connectDevice() {
  try {
    $("connectBtn").textContent = "Изчакване на устройство…";
    const filters = Object.keys(cfg.supportedDevices).map(v => ({ vendorId: parseInt(v, 16) }));
    const device = await navigator.usb.requestDevice({ filters });
    state.usbDevice = device;

    const vid = vendorHex(device.vendorId);
    const profile = cfg.supportedDevices[vid] || null;
    state.deviceProfile = profile;

    if (!profile) {
      $("deviceStatus").textContent = `USB device VID:${vid} е открито, но не се поддържа.`;
      $("securityState").textContent = "НЕПОДДЪРЖАНО";
      setPanelState("Неподдържано устройство.", "red");
      log(`избрано е неподдържано устройство: VID:${vid}`);
      return;
    }

    $("deviceStatus").innerHTML = `<strong>${profile.vendor} ${profile.model}</strong><br>codename: ${profile.codename} · backend: ${profile.backend}`;
    $("securityState").textContent = "УСТРОЙСТВОТО Е ОТКРИТО";
    $("connectBtn").textContent = "Устройството е свързано";
    setPanelState(`${profile.model} е открит.`, "green");
    setStep(2);
    log(`открито устройство: ${profile.vendor} ${profile.model} (${profile.codename})`);
    log(`USB VID:${vid} PID:${device.productId.toString(16).padStart(4, "0")}`);

    if (state.manifest) pickCompatibleBuild();
  } catch (err) {
    if (err.name === "NotFoundError") {
      log("прозорецът за избор беше затворен без избрано устройство.");
      return;
    }
    log(`USB грешка: ${err.message}`);
    $("deviceStatus").textContent = `USB грешка: ${err.message}`;
    setPanelState("USB връзката е неуспешна.", "red");
  } finally {
    if (!state.usbDevice) $("connectBtn").textContent = "Свържи телефон";
  }
}

async function loadLatestRelease() {
  const owner = cfg.githubOwner;
  const repo = cfg.githubRepo;
  if (!owner || !repo || owner.startsWith("YOUR_")) {
    $("releaseStatus").textContent = "Първо настрой GitHub repository";
    setPanelState("GitHub repository не е настроено.", "red");
    log("GitHub repository не е настроено в config.js.");
    return;
  }

  try {
    $("releaseBtn").disabled = true;
    $("releaseBtn").textContent = "Зареждане…";
    $("releaseStatus").textContent = "Проверка на GitHub Releases…";
    const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`;
    const res = await fetch(api, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);

    const release = await res.json();
    state.release = release;
    const manifestAsset = release.assets.find(a => a.name === cfg.manifestAssetName);
    if (!manifestAsset) throw new Error(`${cfg.manifestAssetName} не е намерен сред файловете на release-а`);

    const manifestRes = await fetch(manifestAsset.browser_download_url, { cache: "no-store" });
    if (!manifestRes.ok) throw new Error(`manifest download ${manifestRes.status}`);
    state.manifest = await manifestRes.json();

    $("releaseStatus").textContent = `${release.tag_name} · ${state.manifest.builds?.length || 0} build(s)`;
    setStep(state.deviceProfile ? 3 : 2);
    setPanelState("Последната версия е заредена.", "green");
    log(`зареден release: ${release.tag_name}`);
    pickCompatibleBuild();
  } catch (err) {
    $("releaseStatus").textContent = `Грешка при версията: ${err.message}`;
    setPanelState("Проверката на версията е неуспешна.", "red");
    log(`грешка при release: ${err.message}`);
  } finally {
    $("releaseBtn").disabled = false;
    $("releaseBtn").textContent = "Зареди";
  }
}

function pickCompatibleBuild() {
  if (!state.manifest || !state.deviceProfile) return;
  const build = (state.manifest.builds || []).find(b => b.codename === state.deviceProfile.codename);
  state.build = build || null;

  if (!build) {
    $("verifyStatus").textContent = `Няма build за ${state.deviceProfile.codename}`;
    $("verifyBtn").disabled = true;
    setPanelState("Няма съвместим build в тази версия.", "red");
    log(`няма намерен съвместим build за ${state.deviceProfile.codename}`);
    return;
  }

  $("verifyStatus").textContent = `${build.file} · SHA-256 е готов`;
  $("verifyBtn").disabled = false;
  setStep(3);
  setPanelState("Намерен е съвместим build.", "green");
  log(`избран съвместим build: ${build.file}`);
}

async function sha256Hex(buffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyBuild() {
  const build = state.build;
  if (!build || !state.release) return;

  const asset = state.release.assets.find(a => a.name === build.file);
  if (!asset) {
    $("verifyStatus").textContent = `Липсва ${build.file}`;
    setPanelState("Липсва файл от release-а.", "red");
    log(`липсва release файл: ${build.file}`);
    return;
  }

  try {
    $("verifyBtn").disabled = true;
    $("verifyBtn").textContent = "Проверка…";
    $("verifyStatus").textContent = "Изтегляне и SHA-256 проверка на пакета…";
    setPanelState("Проверка на пакета…");
    log(`изтегляне на ${build.file} за проверка…`);

    const res = await fetch(asset.browser_download_url, { cache: "no-store" });
    if (!res.ok) throw new Error(`package download ${res.status}`);
    const bytes = await res.arrayBuffer();
    const actual = await sha256Hex(bytes);
    const expected = String(build.sha256 || "").toLowerCase();

    if (!expected || actual !== expected) {
      state.packageBytes = null;
      $("verifyStatus").textContent = "НЕУСПЕШНО · SHA-256 не съвпада";
      $("securityState").textContent = "ПРОВЕРКАТА Е НЕУСПЕШНА";
      setPanelState("Проверката на пакета е неуспешна.", "red");
      log(`SHA-256 FAILED. expected ${expected || "<missing>"}, got ${actual}`);
      return;
    }

    state.packageBytes = bytes;
    $("verifyStatus").textContent = `ПРОВЕРЕНО · ${actual.slice(0, 16)}…`;
    $("securityState").textContent = "ПАКЕТЪТ Е ПРОВЕРЕН";
    setPanelState("Пакетът е проверен.", "green");
    setStep(4);
    log(`SHA-256 verified: ${actual}`);
    log("install backend-ът остава изключен в този прототип.");
  } catch (err) {
    $("verifyStatus").textContent = `Грешка при проверката: ${err.message}`;
    setPanelState("Грешка при проверката.", "red");
    log(`грешка при проверката: ${err.message}`);
  } finally {
    $("verifyBtn").disabled = false;
    $("verifyBtn").textContent = "Провери";
  }
}

function setupRevealAnimations() {
  const items = [...document.querySelectorAll(".reveal")];
  items.forEach((el) => {
    const delay = Number(el.dataset.delay || 0);
    el.style.setProperty("--delay", `${delay}ms`);
  });

  if (!("IntersectionObserver" in window)) {
    items.forEach(el => el.classList.add("visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: .14, rootMargin: "0px 0px -60px" });

  items.forEach(el => observer.observe(el));
}

$("connectBtn").addEventListener("click", connectDevice);
$("releaseBtn").addEventListener("click", loadLatestRelease);
$("verifyBtn").addEventListener("click", verifyBuild);

if ("usb" in navigator) {
  navigator.usb.addEventListener("disconnect", (event) => {
    if (state.usbDevice && event.device === state.usbDevice) {
      state.usbDevice = null;
      state.deviceProfile = null;
      $("deviceStatus").textContent = "Устройството е разкачено.";
      $("securityState").textContent = "НЯМА ВРЪЗКА";
      $("connectBtn").textContent = "Свържи телефон";
      setPanelState("Устройството е разкачено.", "red");
      setStep(1);
      log("устройството е разкачено.");
    }
  });
}

setupRevealAnimations();
setStep(1);
checkBrowser();
