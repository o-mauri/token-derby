export type SlackPostResult = { ok: boolean; error?: string };

const DEFAULT_BASE = 'https://slack.com/api';
const DEFAULT_TIMEOUT_MS = 2000;

export type PostSlackMessageOptions = { timeoutMs?: number };

export async function postSlackMessage(
  botToken: string,
  channel: string,
  text: string,
  blocks: unknown[],
  opts: PostSlackMessageOptions = {},
): Promise<SlackPostResult> {
  const base = process.env.SLACK_API_BASE ?? DEFAULT_BASE;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(`${base}/chat.postMessage`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify({ channel, text, blocks }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return { ok: false, error: `http_${res.status}` };
    }

    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (json.ok) return { ok: true };
    return { ok: false, error: json.error ?? 'unknown_slack_error' };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, error: 'timeout' };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
