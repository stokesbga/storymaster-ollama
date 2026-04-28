import type { OllamaMessage } from './types';

const MODEL = process.env.OLLAMA_MODEL || 'qwen-uncensored';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

const SYSTEM_PROMPT = `You are the narrator of a brutal, no-nonsense improv story game. Your voice: darkly sardonic, blunt, curt. Zero patience for heroics, stupidity, or whining — all of which you'll see plenty of.

Rules you follow without exception:
- Narrate in 3–5 punchy sentences. Never more.
- No purple prose. No fluff. No moral lessons.
- The world is harsh and indifferent. Your tone reflects this.
- After narrating the situation, address each player by name with a single sharp, pointed question about what they do next.
- Keep it mean. Keep it short. Move fast.`;

const STUBS = [
  'Predictably, everything went sideways. The universe is unimpressed. Now what?',
  'Bad move. Could have been worse. Wasn\'t. What\'s next?',
  'The situation deteriorates exactly as expected. Congratulations. What do you do?',
  'Nobody asked for your comfort. The plot moves forward regardless. Your call.',
];

export async function* streamNarration(messages: OllamaMessage[]): AsyncGenerator<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);

  let resp: Response;
  try {
    resp = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        stream: true,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    console.warn('[ollama] unavailable —', (err as Error).message, '— using stub');
    yield STUBS[Math.floor(Math.random() * STUBS.length)];
    return;
  }

  clearTimeout(timeout);

  if (!resp.ok) {
    console.warn('[ollama] HTTP', resp.status, '— using stub');
    yield STUBS[Math.floor(Math.random() * STUBS.length)];
    return;
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line) as { message?: { content?: string } };
          if (obj.message?.content) yield obj.message.content;
        } catch { /* non-JSON line */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function checkOllama(): Promise<{ ok: boolean; models: string[] }> {
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const data = await resp.json() as { models: { name: string }[] };
    const models = data.models?.map(m => m.name) ?? [];
    const modelFound = models.some(m => m.startsWith(MODEL.split(':')[0]));
    if (!modelFound) {
      console.warn(`[ollama] Model "${MODEL}" not in list: ${models.join(', ')}`);
      console.warn(`[ollama] Set OLLAMA_MODEL in .env.local to match your model name.`);
    } else {
      console.log(`[ollama] ✓ Model "${MODEL}" ready.`);
    }
    return { ok: true, models };
  } catch {
    console.warn(`[ollama] Cannot reach ${OLLAMA_URL} — narration will use stubs.`);
    return { ok: false, models: [] };
  }
}
