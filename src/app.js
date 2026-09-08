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
  if (line) line.style.height = `${progress}%`;
}

function vendorHex(id) {
  return id.toString(16).padStart(4, "0").toLowerCase();
}

function checkBrowser() {
  if (!window.isSecureContext) {
    setBadge("HTTPS required", "red");
    $("connectBtn").disabled = true;
    setPanelState("Open the installer over HTTPS.", "red");
    log("WebUSB requires a secure context (HTTPS). GitHub Pages is suitable.");
    return;
  }
  if (!("usb" in navigator)) {
    setBadge("WebUSB unavailable", "red");
    $("connectBtn").disabled = true;
    setPanelState("Use desktop Chrome or Edge.", "red");
    log("WebUSB is not available in this browser. Use desktop Chrome or Edge.");
    return;
  }
  setBadge("WebUSB ready", "green");
  setPanelState("Connect your phone.");
  log("WebUSB API available.");
}

async function connectDevice() {
  try {
    $("connectBtn").textContent = "Waiting for device…";
    const filters = Object.keys(cfg.supportedDevices).map(v => ({ vendorId: parseInt(v, 16) }));
    const device = await navigator.usb.requestDevice({ filters });
    state.usbDevice = device;

    const vid = vendorHex(device.vendorId);
    const profile = cfg.supportedDevices[vid] || null;
    state.deviceProfile = profile;

    if (!profile) {
      $("deviceStatus").textContent = `USB device VID:${vid} detected, but it is not supported.`;
      $("securityState").textContent = "UNSUPPORTED";
      setPanelState("Unsupported device.", "red");
      log(`unsupported device selected: VID:${vid}`);
      return;
    }

    $("deviceStatus").innerHTML = `<strong>${profile.vendor} ${profile.model}</strong><br>codename: ${profile.codename} · backend: ${profile.backend}`;
    $("securityState").textContent = "DEVICE DETECTED";
    $("connectBtn").textContent = "Device connected";
    setPanelState(`${profile.model} detected.`, "green");
    setStep(2);
    log(`device detected: ${profile.vendor} ${profile.model} (${profile.codename})`);
    log(`USB VID:${vid} PID:${device.productId.toString(16).padStart(4, "0")}`);

    if (state.manifest) pickCompatibleBuild();
  } catch (err) {
    if (err.name === "NotFoundError") {
      log("device chooser closed without selecting a device.");
      return;
    }
    log(`USB error: ${err.message}`);
    $("deviceStatus").textContent = `USB error: ${err.message}`;
    setPanelState("USB connection failed.", "red");
  } finally {
    if (!state.usbDevice) $("connectBtn").textContent = "Connect phone";
  }
}

async function loadLatestRelease() {
  const owner = cfg.githubOwner;
  const repo = cfg.githubRepo;
  if (!owner || !repo || owner.startsWith("YOUR_")) {
    $("releaseStatus").textContent = "Configure GitHub repo first";
    setPanelState("GitHub repository is not configured.", "red");
    log("GitHub repository is not configured in config.js.");
    return;
  }

  try {
    $("releaseBtn").disabled = true;
    $("releaseBtn").textContent = "Loading…";
    $("releaseStatus").textContent = "Checking GitHub Releases…";
    const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`;
    const res = await fetch(api, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);

    const release = await res.json();
    state.release = release;
    const manifestAsset = release.assets.find(a => a.name === cfg.manifestAssetName);
    if (!manifestAsset) throw new Error(`${cfg.manifestAssetName} not found in release assets`);

    const manifestRes = await fetch(manifestAsset.browser_download_url, { cache: "no-store" });
    if (!manifestRes.ok) throw new Error(`manifest download ${manifestRes.status}`);
    state.manifest = await manifestRes.json();

    $("releaseStatus").textContent = `${release.tag_name} · ${state.manifest.builds?.length || 0} build(s)`;
    setStep(state.deviceProfile ? 3 : 2);
    setPanelState("Latest release loaded.", "green");
    log(`release loaded: ${release.tag_name}`);
    pickCompatibleBuild();
  } catch (err) {
    $("releaseStatus").textContent = `Release error: ${err.message}`;
    setPanelState("Release check failed.", "red");
    log(`release error: ${err.message}`);
  } finally {
    $("releaseBtn").disabled = false;
    $("releaseBtn").textContent = "Load";
  }
}

function pickCompatibleBuild() {
  if (!state.manifest || !state.deviceProfile) return;
  const build = (state.manifest.builds || []).find(b => b.codename === state.deviceProfile.codename);
  state.build = build || null;

  if (!build) {
    $("verifyStatus").textContent = `No build for ${state.deviceProfile.codename}`;
    $("verifyBtn").disabled = true;
    setPanelState("No compatible build in this release.", "red");
    log(`no compatible build found for ${state.deviceProfile.codename}`);
    return;
  }

  $("verifyStatus").textContent = `${build.file} · SHA-256 ready`;
  $("verifyBtn").disabled = false;
  setStep(3);
  setPanelState("Compatible build found.", "green");
  log(`compatible build selected: ${build.file}`);
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
    $("verifyStatus").textContent = `Missing ${build.file}`;
    setPanelState("Release asset is missing.", "red");
    log(`missing release asset: ${build.file}`);
    return;
  }

  try {
    $("verifyBtn").disabled = true;
    $("verifyBtn").textContent = "Verifying…";
    $("verifyStatus").textContent = "Downloading and hashing package…";
    setPanelState("Verifying package…");
    log(`downloading ${build.file} for verification…`);

    const res = await fetch(asset.browser_download_url, { cache: "no-store" });
    if (!res.ok) throw new Error(`package download ${res.status}`);
    const bytes = await res.arrayBuffer();
    const actual = await sha256Hex(bytes);
    const expected = String(build.sha256 || "").toLowerCase();

    if (!expected || actual !== expected) {
      state.packageBytes = null;
      $("verifyStatus").textContent = "FAILED · SHA-256 mismatch";
      $("securityState").textContent = "VERIFY FAILED";
      setPanelState("Package verification failed.", "red");
      log(`SHA-256 FAILED. expected ${expected || "<missing>"}, got ${actual}`);
      return;
    }

    state.packageBytes = bytes;
    $("verifyStatus").textContent = `VERIFIED · ${actual.slice(0, 16)}…`;
    $("securityState").textContent = "PACKAGE VERIFIED";
    setPanelState("Package verified.", "green");
    setStep(4);
    log(`SHA-256 verified: ${actual}`);
    log("install backend remains disabled in this prototype.");
  } catch (err) {
    $("verifyStatus").textContent = `Verification error: ${err.message}`;
    setPanelState("Verification error.", "red");
    log(`verification error: ${err.message}`);
  } finally {
    $("verifyBtn").disabled = false;
    $("verifyBtn").textContent = "Verify";
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

function setupOrbParallax() {
  const wrap = $("orbWrap");
  if (!wrap || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const hero = wrap.closest(".hero-visual");
  hero.addEventListener("pointermove", (event) => {
    const r = hero.getBoundingClientRect();
    const x = (event.clientX - r.left) / r.width - .5;
    const y = (event.clientY - r.top) / r.height - .5;
    wrap.style.transform = `rotateY(${x * 8}deg) rotateX(${y * -8}deg) translate3d(${x * 10}px, ${y * 10}px, 0)`;
  });
  hero.addEventListener("pointerleave", () => { wrap.style.transform = ""; });
}

$("connectBtn").addEventListener("click", connectDevice);
$("releaseBtn").addEventListener("click", loadLatestRelease);
$("verifyBtn").addEventListener("click", verifyBuild);

if ("usb" in navigator) {
  navigator.usb.addEventListener("disconnect", (event) => {
    if (state.usbDevice && event.device === state.usbDevice) {
      state.usbDevice = null;
      state.deviceProfile = null;
      $("deviceStatus").textContent = "Device disconnected.";
      $("securityState").textContent = "NOT CONNECTED";
      $("connectBtn").textContent = "Connect phone";
      setPanelState("Device disconnected.", "red");
      setStep(1);
      log("device disconnected.");
    }
  });
}

setupRevealAnimations();
setupOrbParallax();
setStep(1);
checkBrowser();
