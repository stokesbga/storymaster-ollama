import { type NextRequest, NextResponse } from 'next/server';
import { getGame, addPlayer, toPublicState } from '@/lib/game-store';
import { publish } from '@/lib/ably-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { code, clientId, name } = await req.json() as {
    code: string; clientId: string; name: string;
  };

  const game = getGame(code);
  if (!game) return NextResponse.json({ error: 'Room not found.' }, { status: 404 });
  if (game.state !== 'lobby') return NextResponse.json({ error: 'Game already started.' }, { status: 409 });
  if (game.players.size >= 8) return NextResponse.json({ error: 'Room is full.' }, { status: 409 });

  const trimmed = name.trim().slice(0, 20);
  if (!trimmed) return NextResponse.json({ error: 'Name cannot be empty.' }, { status: 400 });

  const nameTaken = [...game.players.values()].some(
    p => p.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (nameTaken) return NextResponse.json({ error: 'That name is taken.' }, { status: 409 });

  const player = addPlayer(game, clientId, trimmed);
  await publish(`game-${game.code}`, 'state', toPublicState(game));

  return NextResponse.json({ ok: true, player: { name: player.name, color: player.color } });
}
