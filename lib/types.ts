export interface PublicPlayer {
  clientId: string;
  name: string;
  color: string;
  submitted: boolean;
}

export interface PublicGameState {
  code: string;
  state: 'lobby' | 'narrating' | 'collecting';
  scene: string;
  players: PublicPlayer[];
  currentNarrative: string;
  timeLeft: number;
  round: number;
}

export interface Player extends PublicPlayer {
  action: string;
}

export interface OllamaMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Game {
  code: string;
  hostId: string;
  state: 'lobby' | 'narrating' | 'collecting';
  scene: string;
  players: Map<string, Player>;
  messages: OllamaMessage[];
  currentNarrative: string;
  timer: ReturnType<typeof setInterval> | null;
  timeLeft: number;
  round: number;
}
