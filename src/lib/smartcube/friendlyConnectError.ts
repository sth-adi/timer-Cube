/**
 * The connectSmartCube() failures this app actually sees come straight out
 * of the underlying protocol drivers (GAN/GiiKER/QiYi/MoYu) and Web
 * Bluetooth itself, worded for their own debugging, not for someone who
 * just wants their cube connected — "Can't find target BLE services -
 * wrong or unsupported cube device model" reads like a crash report.
 * Recognizes the handful of messages that actually occur and rewords them
 * into something actionable; anything unrecognized is passed through
 * unchanged rather than guessed at.
 */
export function friendlyConnectError(message: string): string {
  if (/timed out waiting for cube data/i.test(message)) {
    return "The cube didn't answer with that Bluetooth address — check it's the right one (letters and numbers, six pairs) and try again.";
  }
  if (/mac address/i.test(message)) {
    return "Couldn't identify this cube's Bluetooth address — move it closer and try again, or forget and re-pair it in your OS Bluetooth settings.";
  }
  if (/unsupported cube device model|doesn't match any registered smartcube protocol|no smartcube protocols registered/i.test(message)) {
    return "This doesn't look like a supported smart cube (GAN, GiiKER, GoCube, QiYi, or MoYu) — check you picked the right device in the pairing list.";
  }
  if (/gatt connection timeout|gatt unavailable/i.test(message)) {
    return "Couldn't establish a stable Bluetooth connection — make sure the cube is awake (give it a turn) and try again.";
  }
  if (/cannot find required characteristic|can't find target ble services/i.test(message)) {
    return "Connected, but this cube didn't respond the way its protocol expects — try reconnecting, or check for a firmware update if that keeps happening.";
  }
  return message;
}
