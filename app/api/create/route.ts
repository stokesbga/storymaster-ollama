import { type NextRequest, NextResponse } from 'next/server';
import { createGame, toPublicState } from '@/lib/game-store';
import { publish } from '@/lib/ably-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { hostId } = await req.json() as { hostId: string };
  if (!hostId) return NextResponse.json({ error: 'hostId required' }, { status: 400 });

  const game = createGame(hostId);
  await publish(`game-${game.code}`, 'state', toPublicState(game));

  return NextResponse.json({ code: game.code });
}
