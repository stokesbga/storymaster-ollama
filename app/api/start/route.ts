import { type NextRequest, NextResponse } from 'next/server';
import { getGame, runNarration } from '@/lib/game-store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { code, hostId, scene } = await req.json() as {
    code: string; hostId: string; scene: string;
  };

  const game = getGame(code);
  if (!game) return NextResponse.json({ error: 'Room not found.' }, { status: 404 });
  if (game.hostId !== hostId) return NextResponse.json({ error: 'Not the host.' }, { status: 403 });
  if (game.state !== 'lobby') return NextResponse.json({ error: 'Game already started.' }, { status: 409 });
  if (!scene?.trim()) return NextResponse.json({ error: 'Scene description required.' }, { status: 400 });
  if (game.players.size === 0) return NextResponse.json({ error: 'Need at least one player.' }, { status: 400 });

  game.scene = scene.trim();

  // Fire-and-forget — narration streams to clients via Ably
  void runNarration(game).catch(console.error);

  return NextResponse.json({ ok: true });
}
