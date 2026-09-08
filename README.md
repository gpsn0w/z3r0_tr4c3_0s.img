# z3r0_tr4c3 Web Installer

First safe prototype of the browser-based installer for **z3r0_tr4c3**.

## What works now

- GitHub Pages-ready static site
- WebUSB browser capability check
- USB device chooser filtered for Samsung and OnePlus vendor IDs
- Initial device profile detection
- GitHub Releases latest-release lookup
- `manifest.json` release metadata loading
- Per-device build selection
- SHA-256 verification in the browser
- Installer log / security state UI

## Intentionally disabled

Actual flashing and bootloader relocking are **not enabled** in this prototype. Those functions need model-specific testing first.

Planned backends:

- OnePlus Nord N100 (`billie2`) → WebUSB Fastboot backend
- Samsung Galaxy A5 2017 (`a5y17lte`) → Samsung Download Mode / Heimdall-style backend

## Configure the GitHub repository

Edit `config.js`:

```js
window.Z3R0_CONFIG = {
  githubOwner: "YOUR_GITHUB_USERNAME",
  githubRepo: "z3r0_tr4c3",
  // ...
};
```

## GitHub Release format

Each release should contain at least:

- `manifest.json`
- the device-specific OS build assets named in the manifest

Start from `manifest.example.json`.

Generate SHA-256 on Linux/macOS:

```bash
shasum -a 256 z3r0_tr4c3-*.zip
```

On Windows PowerShell:

```powershell
Get-FileHash .\z3r0_tr4c3-*.zip -Algorithm SHA256
```

## GitHub Pages

1. Create a GitHub repository.
2. Upload the contents of this folder to the repository root.
3. Open **Settings → Pages**.
4. Deploy from the main branch / root folder.
5. Open the HTTPS Pages URL in desktop Chrome or Edge.

WebUSB requires HTTPS, which GitHub Pages provides.

## Security design rule

The installer must never offer bootloader relocking merely because a device can be unlocked. Relocking should only become available after the exact model, firmware prerequisites, z3r0 signing keys, and verified-boot trust model have been tested and certified.
