import type { Game, Player, PublicGameState } from './types';
import { publish } from './ably-server';
import { streamNarration } from './ollama';

declare global {
  // eslint-disable-next-line no-var
  var __chronicle_games: Map<string, Game> | undefined;
}

const store: Map<string, Game> = globalThis.__chronicle_games ??
  (globalThis.__chronicle_games = new Map());

const TIMER_SECS = 120;
const PALETTE = ['#ff6b6b', '#4ecdc4', '#ffd93d', '#c77dff', '#f97316', '#06d6a0', '#f72585', '#00b4d8'];

function makeCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  while (code.length < 4) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function createGame(hostId: string): Game {
  let code: string;
  do { code = makeCode(); } while (store.has(code));

  const game: Game = {
    code, hostId,
    state: 'lobby',
    scene: '',
    players: new Map(),
    messages: [],
    currentNarrative: '',
    timer: null,
    timeLeft: TIMER_SECS,
    round: 0,
  };
  store.set(code, game);
  return game;
}

export function getGame(code: string): Game | undefined {
  return store.get(code.toUpperCase());
}

export function deleteGame(code: string): void {
  const game = store.get(code);
  if (game) {
    stopTimer(game);
    store.delete(code);
  }
}

export function addPlayer(game: Game, clientId: string, name: string): Player {
  const color = PALETTE[game.players.size % PALETTE.length];
  const player: Player = { clientId, name, color, submitted: false, action: '' };
  game.players.set(clientId, player);
  return player;
}

export function toPublicState(game: Game): PublicGameState {
  return {
    code: game.code,
    state: game.state,
    scene: game.scene,
    players: [...game.players.values()].map(({ clientId, name, color, submitted }) => ({
      clientId, name, color, submitted,
    })),
    currentNarrative: game.currentNarrative,
    timeLeft: game.timeLeft,
    round: game.round,
  };
}

async function broadcastState(game: Game): Promise<void> {
  await publish(`game-${game.code}`, 'state', toPublicState(game));
}

function stopTimer(game: Game): void {
  if (game.timer) {
    clearInterval(game.timer);
    game.timer = null;
  }
}

function startTimer(game: Game): void {
  stopTimer(game);
  game.timeLeft = TIMER_SECS;
  game.timer = setInterval(async () => {
    game.timeLeft--;
    await publish(`game-${game.code}`, 'tick', game.timeLeft);
    if (game.timeLeft <= 0 && game.state === 'collecting') {
      stopTimer(game);
      void runNarration(game).catch(console.error);
    }
  }, 1000);
}

export async function runNarration(game: Game): Promise<void> {
  if (game.state === 'narrating') return;
  stopTimer(game);

  game.state = 'narrating';
  await broadcastState(game);
  // Empty string signals clients to clear their narrative display
  await publish(`game-${game.code}`, 'chunk', '');

  const playerList = [...game.players.values()];

  const userMsg = game.round === 0
    ? `Setting: ${game.scene}\nPlayers: ${playerList.map(p => p.name).join(', ')}\n\nBegin the story. Set the scene concisely. End by addressing each player by name and asking what they do.`
    : `Player actions this round:\n${playerList.map(p => `${p.name}: ${p.action || '[does nothing]'}`).join('\n')}\n\nContinue the story. Narrate the consequences ruthlessly. Move the plot forward. End by asking each player what they do next.`;

  game.messages.push({ role: 'user', content: userMsg });

  let response = '';
  try {
    for await (const chunk of streamNarration(game.messages)) {
      response += chunk;
      await publish(`game-${game.code}`, 'chunk', chunk);
    }
  } catch (err) {
    console.error('[narration]', err);
    const stub = 'The situation spirals predictably. Nobody is surprised. What do you do?';
    response = stub;
    await publish(`game-${game.code}`, 'chunk', stub);
  }

  game.messages.push({ role: 'assistant', content: response });
  game.currentNarrative = response;
  game.round++;

  for (const player of game.players.values()) {
    player.submitted = false;
    player.action = '';
  }

  game.state = 'collecting';
  await broadcastState(game);
  startTimer(game);
}

export async function recordAction(game: Game, clientId: string, action: string): Promise<void> {
  const player = game.players.get(clientId);
  if (!player || player.submitted || game.state !== 'collecting') return;

  player.action = action.trim().slice(0, 400);
  player.submitted = true;
  await broadcastState(game);

  const allDone = [...game.players.values()].every(p => p.submitted);
  if (allDone) {
    stopTimer(game);
    void runNarration(game).catch(console.error);
  }
}
