// Operational alerts. A trading program you don't watch all day needs to tell
// you when something important happens: a kill-switch trip, a stalled engine,
// a fill, an auto-applied tune. Alerts are stored (and persisted) in-app, and
// optionally pushed to your phone via a Telegram bot.
//
// Telegram setup (optional): create a bot with @BotFather, get your chat id
// (message the bot, then GET /getUpdates), and set TELEGRAM_BOT_TOKEN and
// TELEGRAM_CHAT_ID in the environment.

import type { Alert, AlertLevel } from "@shared/schema";
import { storage } from "./storage";

export function telegramConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID;
}

async function pushTelegram(level: AlertLevel, title: string, message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const icon = level === "critical" ? "🚨" : level === "warning" ? "⚠️" : "ℹ️";
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `${icon} ${title}\n${message}`,
      }),
    });
  } catch (err) {
    // Never let a notification failure affect trading.
    console.error("telegram push failed:", (err as Error).message);
  }
}

/** Record an alert and (if configured) push it to Telegram. */
export function sendAlert(
  level: AlertLevel,
  title: string,
  message: string,
): Alert {
  const alert = storage.addAlert(level, title, message);
  void pushTelegram(level, title, message);
  return alert;
}
