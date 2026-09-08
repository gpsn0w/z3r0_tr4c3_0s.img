// Future module: WebUSB Fastboot transport for supported z3r0_tr4c3 devices.
// Safety rule: never expose bootloader relock until the exact device profile
// has been verified as supporting the z3r0_tr4c3 trust model.
export async function installFastboot() {
  throw new Error("Fastboot installer backend is not enabled yet.");
}
