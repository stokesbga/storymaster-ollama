export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { checkOllama } = await import('./lib/ollama');
    await checkOllama();

    if (!process.env.ABLY_API_KEY) {
      console.warn('⚠  ABLY_API_KEY is not set. Copy .env.local.example → .env.local and add your key.');
    }
  }
}
