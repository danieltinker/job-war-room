/**
 * WhatsApp connection (worker-side singleton) via Baileys — links as a
 * companion device to the user's own WhatsApp account, like WhatsApp Web.
 *
 * Pairing flow: the dashboard sets `whatsapp.desired = connected` and the
 * worker starts a socket; the pairing QR is stored (as a data URL) in the
 * Setting table for the dashboard to render; once scanned, credentials are
 * persisted to WHATSAPP_AUTH_DIR and survive restarts.
 */
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState as loadMultiFileAuthState,
  type WASocket,
  type UserFacingSocketConfig,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import QRCode from "qrcode";
import { getSetting, setSetting, deleteSetting, SETTING_KEYS } from "@/lib/settings";

const logger = pino({ level: "warn" });

let sock: WASocket | null = null;
let starting = false;

function authDir(): string {
  return process.env.WHATSAPP_AUTH_DIR ?? "./whatsapp-auth";
}

export function isConnected(): boolean {
  return sock?.user != null;
}

export async function ensureWhatsapp(): Promise<void> {
  const desired = await getSetting(SETTING_KEYS.waDesired);
  if (desired !== "connected") {
    if (sock) await stopWhatsapp();
    return;
  }
  if (sock || starting) return;
  starting = true;
  try {
    await startSocket();
  } finally {
    starting = false;
  }
}

async function startSocket(): Promise<void> {
  const { state, saveCreds } = await loadMultiFileAuthState(authDir());
  const s = makeWASocket({
    auth: state,
    // pino's own types drifted from the version Baileys compiled against
    logger: logger as unknown as UserFacingSocketConfig["logger"],
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });
  sock = s;

  s.ev.on("creds.update", saveCreds);
  s.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
      await setSetting(SETTING_KEYS.waQr, dataUrl);
      await setSetting(SETTING_KEYS.waStatus, "waiting_qr");
    }
    if (connection === "open") {
      await deleteSetting(SETTING_KEYS.waQr);
      await setSetting(SETTING_KEYS.waStatus, "connected");
    }
    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      sock = null;
      await deleteSetting(SETTING_KEYS.waQr);
      await setSetting(SETTING_KEYS.waStatus, "disconnected");
      if (loggedOut) {
        // User unlinked the device — require a fresh pairing.
        await setSetting(SETTING_KEYS.waDesired, "disconnected");
      } else {
        // Transient drop — reconnect on the next tick of the control loop.
        setTimeout(() => ensureWhatsapp().catch(() => {}), 5000);
      }
    }
  });
}

export async function stopWhatsapp(): Promise<void> {
  const s = sock;
  sock = null;
  if (s) {
    try {
      s.end(undefined);
    } catch {
      // already closed
    }
  }
  await deleteSetting(SETTING_KEYS.waQr);
  await setSetting(SETTING_KEYS.waStatus, "disconnected");
}

/** Send a text message to the configured target number. */
export async function sendWhatsappText(text: string): Promise<boolean> {
  if (!sock?.user) return false;
  const target = await getSetting(SETTING_KEYS.waTarget);
  if (!target) return false;
  const number = target.replace(/[^0-9]/g, "");
  if (!number) return false;
  await sock.sendMessage(`${number}@s.whatsapp.net`, { text });
  return true;
}
