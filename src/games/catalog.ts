/** Games shown on the Games page. Add an entry here, plus a route in App.tsx, to publish a new game. */
export interface GameInfo {
  id: string;
  title: string;
  description: string;
  players: string;
  to: string;
  available: boolean;
}

export const GAMES: GameInfo[] = [
  {
    id: 'rummy',
    title: 'Indian Rummy',
    description: '13-card Points Rummy. Make a pure sequence and a second sequence, group the rest, and declare before your friends do.',
    players: '3 to 6 players · online',
    to: '/games/rummy',
    available: true,
  },
];
