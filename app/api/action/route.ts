import { type NextRequest, NextResponse } from 'next/server';
import { getGame, recordAction } from '@/lib/game-store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { code, clientId, action } = await req.json() as {
    code: string; clientId: string; action: string;
  };

  const game = getGame(code);
  if (!game) return NextResponse.json({ error: 'Room not found.' }, { status: 404 });
  if (game.state !== 'collecting') return NextResponse.json({ error: 'Not accepting actions right now.' }, { status: 409 });

  await recordAction(game, clientId, action ?? '');
  return NextResponse.json({ ok: true });
}
