import type { OpportunityView } from "./view.js";

/**
 * Push notifications for the watch runner (and a dashboard "test alert" button).
 *
 * Zero-dep: everything goes over fetch. Configure any subset via env:
 *   - Telegram: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
 *   - Webhook:  ALERT_WEBHOOK_URL  (Slack/Discord/generic — we post {text, content})
 *
 * Nothing configured → notify() is a no-op, so the watch runner still works.
 */

export interface NotifierStatus {
  telegram: boolean;
  webhook: boolean;
  any: boolean;
}

export function notifierStatus(): NotifierStatus {
  const telegram = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
  const webhook = Boolean(process.env.ALERT_WEBHOOK_URL);
  return { telegram, webhook, any: telegram || webhook };
}

/** Send a plain-text alert to every configured channel. Returns how many sent. */
export async function notify(text: string): Promise<number> {
  const jobs: Promise<boolean>[] = [];
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) jobs.push(sendTelegram(text));
  if (process.env.ALERT_WEBHOOK_URL) jobs.push(sendWebhook(text));
  const results = await Promise.allSettled(jobs);
  return results.filter((r) => r.status === "fulfilled" && r.value).length;
}

/** Format and send an alert for newly-found opportunities. */
export async function notifyOpportunities(
  meta: { source: string; query: string },
  opps: OpportunityView[],
): Promise<number> {
  if (!opps.length) return 0;
  const top = [...opps].sort((a, b) => b.score - a.score).slice(0, 5);
  const lines = top.map(
    (o) => `• ${o.title} — buy $${o.buy} → net $${o.net} (${Math.round(o.marginPct * 100)}%)\n  ${o.url}`,
  );
  const more = opps.length > top.length ? `\n…and ${opps.length - top.length} more` : "";
  const text = `🔔 ${opps.length} new ${meta.source} deal(s) for "${meta.query}"\n\n${lines.join("\n")}${more}`;
  return notify(text);
}

async function sendTelegram(text: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendWebhook(text: string): Promise<boolean> {
  try {
    // {text} suits Slack, {content} suits Discord — send both so either works.
    const res = await fetch(process.env.ALERT_WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, content: text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
