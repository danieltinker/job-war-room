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
import { handleWaCommand } from "@/services/waCommands";
import { ingestGroupMessage } from "@/services/waJobs";
import { prisma } from "@/lib/db";

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

  // Inbound handling:
  //  - commands ("/"-prefixed) from the configured number's chat
  //  - job-post capture from monitored groups (משרות בהייטק etc.)
  s.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const target = (await getSetting(SETTING_KEYS.waTarget))?.replace(/[^0-9]/g, "");
    for (const m of messages) {
      const jid = m.key.remoteJid ?? "";
      const text = (
        m.message?.conversation ??
        m.message?.extendedTextMessage?.text ??
        m.message?.imageMessage?.caption ??
        ""
      ).trim();
      if (!text) continue;

      // Phone commands
      if (target && jid === `${target}@s.whatsapp.net` && text.startsWith("/")) {
        try {
          const reply = await handleWaCommand(text);
          await sendWhatsappText(reply);
        } catch (e) {
          console.log(`[whatsapp] command failed: ${e instanceof Error ? e.message : e}`);
          await sendWhatsappText("Something went wrong handling that command — try again.").catch(
            () => {}
          );
        }
        continue;
      }

      // Monitored group job capture
      if (jid.endsWith("@g.us")) {
        try {
          const monitoredRaw = await getSetting(SETTING_KEYS.waJobGroups);
          const monitored: string[] = monitoredRaw ? JSON.parse(monitoredRaw) : [];
          if (!monitored.includes(jid)) continue;
          const groupsRaw = await getSetting(SETTING_KEYS.waGroups);
          const groups: { jid: string; name: string }[] = groupsRaw ? JSON.parse(groupsRaw) : [];
          const groupName = groups.find((g) => g.jid === jid)?.name ?? "job group";
          const jobId = await ingestGroupMessage(text, groupName);
          if (!jobId) continue;
          console.log(`[whatsapp] captured job post from "${groupName}"`);
          // Instant heads-up when a community lead matches a profile
          const match = await prisma.match.findFirst({
            where: { jobId, status: "SUGGESTED" },
            include: { job: true },
            orderBy: { score: "desc" },
          });
          const notify = await getSetting(SETTING_KEYS.waNotifyMatches);
          if (match && notify === "true") {
            await sendWhatsappText(
              `🔥 Referral lead from "${groupName}" matches your profile (${match.score}%):\n${match.job.title}\n${match.job.url || "(no link — check the group post)"}`
            ).catch(() => {});
          }
        } catch (e) {
          console.log(`[whatsapp] group capture failed: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  });

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
      // Refresh the account's group list so the dashboard can offer them
      // for job monitoring.
      try {
        const groups = await s.groupFetchAllParticipating();
        const list = Object.values(groups)
          .map((g) => ({ jid: g.id, name: g.subject ?? g.id }))
          .slice(0, 500);
        await setSetting(SETTING_KEYS.waGroups, JSON.stringify(list));
        console.log(`[whatsapp] group list refreshed (${list.length} groups)`);
      } catch (e) {
        console.log(`[whatsapp] group fetch failed: ${e instanceof Error ? e.message : e}`);
      }
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
