import Ably from 'ably';

let client: Ably.Rest | null = null;

function getClient(): Ably.Rest {
  if (!client) {
    const key = process.env.ABLY_API_KEY;
    if (!key) throw new Error('ABLY_API_KEY env var is not set. Copy .env.local.example to .env.local and add your key.');
    client = new Ably.Rest(key);
  }
  return client;
}

export async function publish(channel: string, event: string, data: unknown): Promise<void> {
  try {
    await getClient().channels.get(channel).publish(event, data);
  } catch (err) {
    console.error('[ably publish]', event, err);
  }
}

export async function createTokenRequest(clientId: string): Promise<Ably.TokenRequest> {
  return getClient().auth.createTokenRequest({ clientId });
}
