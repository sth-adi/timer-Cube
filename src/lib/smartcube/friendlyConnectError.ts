/*
 * The connectSmartCube() failures this app actually sees come straight out
 * of the underlying protocol drivers (GAN/GiiKER/QiYi/MoYu) and Web
 * Bluetooth itself, worded for their own debugging, not for someone who
 * just wants their cube connected — "Can't find target BLE services -
 * wrong or unsupported cube device model" reads like a crash report.
 * Recognizes the handful of messages that actually occur and rewords them
 * into something actionable; anything unrecognized is passed through
 * unchanged rather than guessed at. A user backing out of the browser's
 * chooser is not a failure: those messages are always passed through (the
 * store already treats them as no error at all).
 */

/** The browser's chooser being dismissed, or the click that opens it having gone stale — not a failure, so never reworded into one. */
const NOT_A_FAILURE = /cancel+ed|user gesture|abort/i;

/** First match wins, so the more specific wordings come before the broad ones. */
const REWORDINGS: readonly { test: RegExp; message: string }[] = [
  {
    test: /timed out waiting for cube data/i,
    message: "The cube didn't answer with that Bluetooth address, check it's the right one (letters and numbers, six pairs) and try again.",
  },
  {
    test: /mac address/i,
    message: "Couldn't identify this cube's Bluetooth address, move it closer and try again, or forget and re-pair it in your OS Bluetooth settings.",
  },
  {
    test: /unsupported cube device model|doesn't match any registered smartcube protocol|no smartcube protocols registered/i,
    message: "This doesn't look like a supported smart cube (GAN, GiiKER, GoCube, QiYi, or MoYu), check you picked the right device in the pairing list.",
  },
  {
    test: /gatt connection timeout|gatt unavailable/i,
    message: "Couldn't establish a stable Bluetooth connection, make sure the cube is awake (give it a turn) and try again.",
  },
  {
    test: /cannot find required characteristic|can't find target ble services/i,
    message: "Connected, but this cube didn't respond the way its protocol expects, try reconnecting, or check for a firmware update if that keeps happening.",
  },
  {
    test: /bluetooth adapter (is )?(not available|unavailable|off|disabled|powered off)|bluetooth (is )?(turned |switched )?(off|disabled)|adapter (is )?powered off/i,
    message: "Bluetooth is off or unavailable on this device. Turn Bluetooth on, then try again.",
  },
  {
    test: /permission (denied|has been blocked)|denied the browser permission|blocked (by|from).*(bluetooth|permission)|bluetooth.*blocked|disallowed by (the )?permissions? policy|not allowed to access (the )?(bluetooth|service)/i,
    message: "Bluetooth is blocked for this site. Allow Bluetooth for this site in your browser's site settings, then try again.",
  },
  {
    test: /gatt operation failed|gatt server is disconnected|networkerror|connection attempt failed|no longer in range|out of range|device is no longer/i,
    message: "The cube may be asleep or out of range. Turn a face to wake it, then try again.",
  },
];

/**
 * The reworded message, plus the original text when it was reworded (for a
 * "technical details" line); `detail` is null when the message passed through.
 */
export function describeConnectError(message: string): { message: string; detail: string | null } {
  if (NOT_A_FAILURE.test(message)) return { message, detail: null };
  const hit = REWORDINGS.find((r) => r.test.test(message));
  return hit ? { message: hit.message, detail: message } : { message, detail: null };
}

export function friendlyConnectError(message: string): string {
  return describeConnectError(message).message;
}
