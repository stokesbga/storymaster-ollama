import { type NextRequest, NextResponse } from 'next/server';
import { createTokenRequest } from '@/lib/ably-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const clientId = req.nextUrl.searchParams.get('clientId') || 'anonymous';
  try {
    const token = await createTokenRequest(clientId);
    return NextResponse.json(token);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
