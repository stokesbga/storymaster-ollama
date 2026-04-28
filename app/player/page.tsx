'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Ably from 'ably';
import type { PublicGameState } from '@/lib/types';

type View = 'join' | 'lobby' | 'narrating' | 'collecting' | 'submitted';

export default function PlayerPage() {
  const [view, setView] = useState<View>('join');
  const [inputCode, setInputCode] = useState('');
  const [inputName, setInputName] = useState('');
  const [code, setCode] = useState('');
  const [myName, setMyName] = useState('');
  const [myColor, setMyColor] = useState('');
  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [narrative, setNarrative] = useState('');
  const [action, setAction] = useState('');
  const [timeLeft, setTimeLeft] = useState(120);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(false);

  const clientIdRef = useRef('');
  const ablyRef = useRef<Ably.Realtime | null>(null);
  const narrativeAccRef = useRef('');
  const narrativeBoxRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let id = sessionStorage.getItem('chronicle_client_id');
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('chronicle_client_id', id); }
    clientIdRef.current = id;

    // Pre-fill code from URL param ?code=XXXX
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get('code');
    if (urlCode) setInputCode(urlCode.toUpperCase());
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  }, []);

  const connectAbly = useCallback((gameCode: string, playerName: string) => {
    ablyRef.current?.close();

    const ably = new Ably.Realtime({
      authUrl: '/api/token',
      authParams: { clientId: clientIdRef.current },
    });
    ablyRef.current = ably;

    const channel = ably.channels.get(`game-${gameCode}`);

    channel.subscribe('state', (msg) => {
      const state = msg.data as PublicGameState;
      setGameState(state);
      setTimeLeft(state.timeLeft);

      if (state.state === 'lobby') {
        setView('lobby');
      } else if (state.state === 'narrating') {
        setView('narrating');
      } else if (state.state === 'collecting') {
        const me = state.players.find(p => p.name === playerName);
        setView(me?.submitted ? 'submitted' : 'collecting');
        setAction('');
      }
    });

    channel.subscribe('chunk', (msg) => {
      const chunk = msg.data as string;
      if (chunk === '') {
        narrativeAccRef.current = '';
        setNarrative('');
      } else {
        narrativeAccRef.current += chunk;
        setNarrative(narrativeAccRef.current);
        // Auto-scroll narrative box
        requestAnimationFrame(() => {
          if (narrativeBoxRef.current) {
            narrativeBoxRef.current.scrollTop = narrativeBoxRef.current.scrollHeight;
          }
        });
      }
    });

    channel.subscribe('tick', (msg) => {
      setTimeLeft(msg.data as number);
    });
  }, []);

  useEffect(() => () => { ablyRef.current?.close(); }, []);

  const joinGame = async () => {
    const code = inputCode.trim().toUpperCase();
    const name = inputName.trim();
    if (code.length !== 4) { showToast('Enter a 4-character room code.'); return; }
    if (!name) { showToast('Enter your name.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, clientId: clientIdRef.current, name }),
      });
      const body = await res.json() as { error?: string; player?: { name: string; color: string } };
      if (!res.ok) { showToast(body.error || 'Failed to join.'); return; }

      setCode(code);
      setMyName(name);
      setMyColor(body.player?.color ?? '#888');
      setView('lobby');
      connectAbly(code, name);
    } catch {
      showToast('Connection error. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

  const submitAction = async () => {
    try {
      const res = await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, clientId: clientIdRef.current, action }),
      });
      if (!res.ok) {
        const body = await res.json() as { error: string };
        showToast(body.error || 'Failed to submit.');
        return;
      }
      setView('submitted');
    } catch {
      showToast('Failed to submit. Try again.');
    }
  };

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  const timerColor = timeLeft > 60 ? 'var(--green)' : timeLeft > 30 ? 'var(--yellow)' : 'var(--red)';

  // ── Join ──────────────────────────────────────────────────────────────────────
  if (view === 'join') return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100dvh', padding: '2rem', gap: '1.75rem',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3.5rem', fontWeight: 900, letterSpacing: '0.15em', color: 'var(--accent)', textShadow: '0 0 40px rgba(255,60,0,0.3)' }}>
          Chronicle
        </div>
        <div className="subtitle" style={{ marginTop: '0.25rem' }}>Brutal Stories. Zero Mercy.</div>
      </div>

      <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <div className="label" style={{ marginBottom: '0.35rem' }}>Room Code</div>
          <input
            className="input"
            type="text"
            maxLength={4}
            placeholder="XXXX"
            value={inputCode}
            onChange={e => setInputCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && joinGame()}
            style={{ textTransform: 'uppercase', letterSpacing: '0.3em', fontSize: '1.3rem', fontWeight: 700, textAlign: 'center' }}
          />
        </div>
        <div>
          <div className="label" style={{ marginBottom: '0.35rem' }}>Your Name</div>
          <input
            className="input"
            type="text"
            maxLength={20}
            placeholder="Enter your name"
            value={inputName}
            onChange={e => setInputName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && joinGame()}
          />
        </div>
        <button className="btn" onClick={joinGame} disabled={loading} style={{ width: '100%', clipPath: 'none', borderRadius: '0.5rem' }}>
          {loading ? 'Joining…' : 'Join Game'}
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );

  // ── Lobby ─────────────────────────────────────────────────────────────────────
  if (view === 'lobby') return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100dvh', padding: '2rem', gap: '1.5rem', textAlign: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <div style={{ width: 18, height: 18, borderRadius: '50%', background: myColor }} />
        <span style={{ fontSize: '1.4rem', fontWeight: 700 }}>{myName}</span>
      </div>
      <div style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
        You&apos;re in room <strong style={{ color: 'var(--text)' }}>{code}</strong>.<br />
        Waiting for the host to start the story.
      </div>

      {gameState?.players && gameState.players.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', maxWidth: 320 }}>
          {gameState.players.map(p => (
            <div key={p.clientId} style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              background: 'var(--surface)', padding: '0.4rem 0.75rem',
              borderRadius: '2rem', fontSize: '0.85rem', fontWeight: 600,
            }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color }} />
              {p.name}
            </div>
          ))}
        </div>
      )}

      <div className="label pulse" style={{ color: 'var(--accent)' }}>● Brace yourself.</div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );

  // ── Narrating ─────────────────────────────────────────────────────────────────
  if (view === 'narrating') return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', padding: '1.25rem', gap: '1rem' }}>
      <div className="label pulse" style={{ color: 'var(--accent)' }}>⚠ The Narrator Speaks</div>
      <div
        ref={narrativeBoxRef}
        style={{
          flex: 1, overflowY: 'auto', background: 'var(--surface)',
          border: '1px solid var(--surface-2)', borderRadius: '0.75rem',
          padding: '1rem 1.25rem', fontSize: '1.05rem', lineHeight: 1.8,
          color: 'var(--text)',
        }}
      >
        {narrative || <span style={{ color: 'var(--muted)' }}>…</span>}
        <span className="cursor" />
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );

  // ── Collecting ────────────────────────────────────────────────────────────────
  if (view === 'collecting') return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', padding: '1.25rem', gap: '0.75rem' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: myColor }} />
          <span className="label">{myName}</span>
        </div>
        <div style={{ fontSize: '1.5rem', fontWeight: 900, color: timerColor, fontVariantNumeric: 'tabular-nums' }}>
          {fmtTime(timeLeft)}
        </div>
      </div>

      {/* Context: full narration from last segment */}
      {gameState?.currentNarrative && (
        <div style={{
          fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.65,
          background: 'var(--surface)', borderRadius: '0.5rem',
          padding: '0.85rem 1rem', maxHeight: '40vh', overflowY: 'auto',
          borderLeft: '3px solid var(--accent)', whiteSpace: 'pre-wrap',
        }}>
          {gameState.currentNarrative}
        </div>
      )}

      <div className="label">What do you do?</div>

      <textarea
        className="input"
        style={{ flex: 1, resize: 'none', lineHeight: 1.7, minHeight: 140 }}
        placeholder="Describe your action…"
        maxLength={400}
        value={action}
        onChange={e => setAction(e.target.value)}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <span className="label">{action.length}/400</span>
      </div>

      <button
        className="btn"
        onClick={submitAction}
        style={{ width: '100%', clipPath: 'none', borderRadius: '0.5rem', padding: '1rem' }}
      >
        Submit Action
      </button>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );

  // ── Submitted ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100dvh', padding: '2rem', gap: '1.25rem', textAlign: 'center',
    }}>
      <div style={{ fontSize: '4rem' }}>⚡</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>Action Received.</div>
      <div style={{ color: 'var(--muted)', lineHeight: 1.6, fontSize: '0.9rem' }}>
        Your fate has been sealed.<br />Await the consequences.
      </div>

      <div style={{
        fontSize: '2.5rem', fontWeight: 900, color: timerColor,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {fmtTime(timeLeft)}
      </div>

      <div style={{ marginTop: '1rem', width: '100%', maxWidth: 320 }}>
        <div className="label" style={{ marginBottom: '0.75rem' }}>Players</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {gameState?.players.map(p => (
            <div key={p.clientId} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.5rem 0.75rem', background: 'var(--surface)', borderRadius: '0.5rem',
              fontSize: '0.9rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color }} />
                {p.name}
              </div>
              <span style={{ color: p.submitted ? 'var(--green)' : 'var(--muted)', fontSize: '0.75rem' }}>
                {p.submitted ? '✓' : '…'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
