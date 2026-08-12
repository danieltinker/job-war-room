/**
 * WhatsApp connection (worker-side singleton) via Baileys — links as a
 * companion device to the user's own WhatsApp account, like WhatsApp Web.
 *
 * Pairing flow: the dashboard sets `whatsapp.desired = connected` and the
 * worker starts a socket; the pairing QR is stored (as a data URL) in the
 * Setting table for the dashboard to render; once scanned, credentials are
 * persisted to WHATSAPP_AUTH_DIR and survive restarts.
 */
import type { WASocket, UserFacingSocketConfig } from "baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import QRCode from "qrcode";
import { getSetting, setSetting, deleteSetting, SETTING_KEYS } from "@/lib/settings";

const logger = pino({ level: "warn" });

// baileys ≥7 is ESM-only; load it lazily via dynamic import so this module
// stays usable from the CJS worker build.
type BaileysModule = typeof import("baileys");
let baileysModule: BaileysModule | null = null;
async function baileys(): Promise<BaileysModule> {
  if (!baileysModule) baileysModule = await import("baileys");
  return baileysModule;
}

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
  const {
    default: makeWASocket,
    useMultiFileAuthState: loadAuthState,
    DisconnectReason,
  } = await baileys();
  const { state, saveCreds } = await loadAuthState(authDir());
  const s = makeWASocket({
    auth: state,
    // pino's own types drifted from the version Baileys compiled against
    logger: logger as unknown as UserFacingSocketConfig["logger"],
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
      await deleteSetting(SETTING_KEYS.waError);
    }
    if (connection === "open") {
      await deleteSetting(SETTING_KEYS.waQr);
      await deleteSetting(SETTING_KEYS.waError);
      await setSetting(SETTING_KEYS.waStatus, "connected");
    }
    if (connection === "close") {
      const err = lastDisconnect?.error as Boom | undefined;
      const statusCode = err?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      // 515 is the expected one-time restart right after a successful QR
      // pairing — a normal part of the handshake, not an error worth showing.
      const routineRestart = statusCode === DisconnectReason.restartRequired;
      console.log(
        `[whatsapp] connection closed (status ${statusCode ?? "?"}): ${err?.message ?? "unknown"}`
      );
      sock = null;
      await deleteSetting(SETTING_KEYS.waQr);
      await setSetting(SETTING_KEYS.waStatus, "disconnected");
      if (!routineRestart) {
        await setSetting(
          SETTING_KEYS.waError,
          `Connection closed (status ${statusCode ?? "?"}): ${err?.message ?? "unknown"}`
        );
      }
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
