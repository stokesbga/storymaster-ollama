'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Ably from 'ably';
import type { PublicGameState } from '@/lib/types';

type View = 'start' | 'lobby' | 'narrating' | 'collecting';

// ─── Timer Ring ──────────────────────────────────────────────────────────────
const CIRC = 2 * Math.PI * 88; // r=88

function TimerRing({ timeLeft, total = 120 }: { timeLeft: number; total?: number }) {
  const pct = Math.max(0, timeLeft / total);
  const offset = CIRC * (1 - pct);
  const stroke = pct > 0.5 ? 'var(--green)' : pct > 0.25 ? 'var(--yellow)' : 'var(--red)';
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;

  return (
    <div style={{ position: 'relative', width: 200, height: 200 }}>
      <svg viewBox="0 0 200 200" width="200" height="200" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="100" cy="100" r="88" fill="none" stroke="var(--surface-2)" strokeWidth="10" />
        <circle
          cx="100" cy="100" r="88" fill="none"
          stroke={stroke} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={CIRC} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '3.2rem', fontWeight: 900, color: 'var(--text)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {mins}:{secs.toString().padStart(2, '0')}
      </div>
    </div>
  );
}

// ─── Player Cards ─────────────────────────────────────────────────────────────
function PlayerCards({ players }: { players: PublicGameState['players'] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
      {players.map(p => (
        <div key={p.clientId} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem',
          padding: '1rem 1.25rem', background: 'var(--surface)',
          border: `2px solid ${p.submitted ? 'var(--green)' : 'var(--surface-2)'}`,
          borderRadius: '0.75rem', minWidth: 110,
          transition: 'border-color 0.3s',
        }}>
          <div style={{ width: 18, height: 18, borderRadius: '50%', background: p.color }} />
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.name}</div>
          <div style={{
            fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em',
            color: p.submitted ? 'var(--green)' : 'var(--muted)',
          }}>
            {p.submitted ? '✓ Ready' : 'Deciding…'}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function HostPage() {
  const [view, setView] = useState<View>('start');
  const [code, setCode] = useState('');
  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [narrative, setNarrative] = useState('');
  const [scene, setScene] = useState('');
  const [toast, setToast] = useState('');
  const [timeLeft, setTimeLeft] = useState(120);
  const [joinUrl, setJoinUrl] = useState('');

  const hostIdRef = useRef('');
  const ablyRef = useRef<Ably.Realtime | null>(null);
  const narrativeAccRef = useRef('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/player`);
    let id = sessionStorage.getItem('chronicle_host_id');
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('chronicle_host_id', id); }
    hostIdRef.current = id;
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  }, []);

  const connectAbly = useCallback((gameCode: string) => {
    ablyRef.current?.close();

    const ably = new Ably.Realtime({
      authUrl: '/api/token',
      authParams: { clientId: `host-${hostIdRef.current}` },
    });
    ablyRef.current = ably;

    const channel = ably.channels.get(`game-${gameCode}`);

    channel.subscribe('state', (msg) => {
      const state = msg.data as PublicGameState;
      setGameState(state);
      setTimeLeft(state.timeLeft);
      if (state.state === 'narrating') setView('narrating');
      else if (state.state === 'collecting') setView('collecting');
      else if (state.state === 'lobby') setView('lobby');
    });

    channel.subscribe('chunk', (msg) => {
      const chunk = msg.data as string;
      if (chunk === '') {
        narrativeAccRef.current = '';
        setNarrative('');
      } else {
        narrativeAccRef.current += chunk;
        setNarrative(narrativeAccRef.current);
      }
    });

    channel.subscribe('tick', (msg) => {
      setTimeLeft(msg.data as number);
    });

    return () => { channel.unsubscribe(); ably.close(); };
  }, []);

  useEffect(() => () => { ablyRef.current?.close(); }, []);

  const createGame = async () => {
    try {
      const res = await fetch('/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: hostIdRef.current }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { code: newCode } = await res.json() as { code: string };
      setCode(newCode);
      setView('lobby');
      connectAbly(newCode);
    } catch (e) {
      showToast((e as Error).message || 'Failed to create game.');
    }
  };

  const startGame = async () => {
    if (!scene.trim()) { showToast('Enter a scene description first.'); return; }
    if (!gameState?.players.length) { showToast('Need at least one player.'); return; }
    try {
      const res = await fetch('/api/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, hostId: hostIdRef.current, scene }),
      });
      if (!res.ok) {
        const body = await res.json() as { error: string };
        showToast(body.error || 'Failed to start.');
      }
    } catch (e) {
      showToast((e as Error).message || 'Failed to start.');
    }
  };

  // ── Start screen ────────────────────────────────────────────────────────────
  if (view === 'start') return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', gap: '1.5rem', textAlign: 'center',
    }}>
      <div className="display">Chronicle</div>
      <div className="subtitle">Brutal Stories. Zero Mercy.</div>
      <div style={{ marginTop: '1rem' }}>
        <button className="btn" onClick={createGame}>Create Game</button>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );

  // ── Lobby screen ────────────────────────────────────────────────────────────
  if (view === 'lobby') return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '1.5rem', height: '100vh', padding: '1.5rem' }}>
      {/* Left: join panel */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <div className="label" style={{ marginBottom: '0.25rem' }}>Join at</div>
          <div style={{ fontSize: '1rem', color: 'var(--text)', wordBreak: 'break-all' }}>{joinUrl}</div>
        </div>
        <div>
          <div className="label" style={{ marginBottom: '0.5rem' }}>Room Code</div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {code.split('').map((ch, i) => (
              <div key={i} style={{
                flex: 1, aspectRatio: '1', background: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '3rem', fontWeight: 900, color: '#fff',
                clipPath: 'polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)',
              }}>{ch}</div>
            ))}
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--surface-2)', paddingTop: '1rem' }}>
          <div className="label" style={{ marginBottom: '0.75rem' }}>
            Players ({gameState?.players.length ?? 0}/8)
          </div>
          {!gameState?.players.length
            ? <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Waiting for players…</div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {gameState.players.map(p => (
                  <div key={p.clientId} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--surface-2)', borderRadius: '0.5rem' }}>
                    <div className="player-dot" style={{ background: p.color }} />
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      </div>

      {/* Right: scene + start */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, letterSpacing: '0.1em', color: 'var(--accent)' }}>Chronicle</div>
          </div>
          <div className="label">Code: {code}</div>
        </div>
        <div className="label">The Setting</div>
        <textarea
          className="input"
          style={{ flex: 1, resize: 'none', lineHeight: 1.7, fontSize: '1.05rem' }}
          placeholder={`Describe the scene or setting…\n\nExamples:\n• A corrupt 1970s Detroit police precinct. You're detectives who just got a tip on the dirty DA.\n• It's 2047. You're aboard a malfunctioning deep-space cargo hauler with one too many stowaways.\n• You're the only four staff left at a failing roadside diner at 3am when something comes through the door.`}
          value={scene}
          onChange={e => setScene(e.target.value)}
        />
        <button className="btn" onClick={startGame} disabled={!gameState?.players.length}>
          Begin the Story
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );

  // ── Narrating screen ─────────────────────────────────────────────────────────
  if (view === 'narrating') return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '1rem 2rem', borderBottom: '1px solid var(--surface-2)', flexShrink: 0,
      }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 900, letterSpacing: '0.15em', color: 'var(--accent)' }}>
          Chronicle
        </div>
        <div className="label pulse" style={{ color: 'var(--accent)' }}>● The Narrator Speaks</div>
        <div className="label">Round {(gameState?.round ?? 0) + 1} · {code}</div>
      </div>

      {/* Narrative */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '3rem', overflow: 'hidden',
      }}>
        <div style={{
          maxWidth: 860, fontSize: 'clamp(1.1rem, 2.2vw, 1.6rem)',
          lineHeight: 1.8, color: 'var(--text)', textAlign: 'center',
          overflowY: 'auto', maxHeight: '100%',
        }}>
          {narrative || <span style={{ color: 'var(--muted)' }}>…</span>}
          <span className="cursor" />
        </div>
      </div>

      {/* Player status bar */}
      <div style={{
        padding: '1rem 2rem', borderTop: '1px solid var(--surface-2)',
        display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap',
      }}>
        {gameState?.players.map(p => (
          <div key={p.clientId} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: 0.5 }}>
            <div className="player-dot" style={{ background: p.color }} />
            <span style={{ fontSize: '0.85rem' }}>{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // ── Collecting screen ────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '1rem 2rem', borderBottom: '1px solid var(--surface-2)', flexShrink: 0,
      }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 900, letterSpacing: '0.15em', color: 'var(--accent)' }}>
          Chronicle
        </div>
        <div style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
          Awaiting Fates
        </div>
        <div className="label">Round {gameState?.round ?? 1} · {code}</div>
      </div>

      {/* Narrative + Timer */}
      <div style={{
        flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: '2.5rem', padding: '2rem 3rem', alignItems: 'center', overflow: 'hidden',
      }}>
        <div style={{
          maxWidth: 720, justifySelf: 'end',
          fontSize: 'clamp(1rem, 1.5vw, 1.3rem)', lineHeight: 1.8,
          color: 'var(--text)', overflowY: 'auto', maxHeight: '100%',
          paddingRight: '0.5rem',
        }}>
          {gameState?.currentNarrative || narrative || (
            <span style={{ color: 'var(--muted)' }}>…</span>
          )}
        </div>
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: '1rem',
        }}>
          <div className="label">Time Remaining</div>
          <TimerRing timeLeft={timeLeft} />
        </div>
      </div>

      {/* Player cards */}
      <div style={{
        padding: '1.5rem 2rem', borderTop: '1px solid var(--surface-2)',
      }}>
        <PlayerCards players={gameState?.players ?? []} />
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
