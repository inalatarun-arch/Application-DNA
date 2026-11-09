import { Trophy } from 'lucide-react';
import { leaveRoom } from '../store';
import type { GameView } from '../engine';
import type { Session } from '../session';
import PlayingCard from './PlayingCard';

/** Round summary (with every player's final cards) and, after the last round, the final standings. */
export default function Results({ session, view }: { session: Session; view: GameView }) {
  const last = view.results[view.results.length - 1];
  if (!last) return null;
  const over = view.phase === 'game-over';
  const standings = view.players.slice().sort((a, b) => a.total - b.total);
  const champion = standings[0];
  const tied = standings.filter((p) => p.total === champion.total);

  return (
    <section className="card space-y-4" aria-label={over ? 'Final results' : `Round ${last.round} results`}>
      {over && (
        <div className="flex items-center gap-3 rounded-lg bg-primary-container p-4">
          <Trophy className="text-primary" size={28} aria-hidden />
          <div>
            <p className="font-display text-headline-md">
              {tied.length > 1 ? `Tie between ${tied.map((p) => p.name).join(' and ')}` : `${champion.name} wins the game!`}
            </p>
            <p className="text-body-md text-on-surface-variant">Lowest total with {champion.total} points.</p>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-headline-md">Round {last.round} result</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-body-md">
            <thead>
              <tr className="border-b border-outline-variant text-label-md text-on-surface-variant">
                <th className="py-2 pr-3 font-medium">Player</th><th className="py-2 pr-3 font-medium">Result</th>
                <th className="py-2 pr-3 text-right font-medium">Round</th><th className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {last.scores.map((s) => {
                const p = view.players.find((x) => x.id === s.id);
                return (
                  <tr key={s.id} className="border-b border-outline-variant align-top last:border-0">
                    <td className="py-2 pr-3 font-medium">{s.name}{s.id === view.you ? ' (you)' : ''}{s.id === last.winnerId && ' 🏆'}</td>
                    <td className="py-2 pr-3 text-on-surface-variant">{s.reason}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{s.points}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{p?.total ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <details>
        <summary className="cursor-pointer text-body-md font-medium">Show everyone's cards</summary>
        <div className="mt-3 space-y-4">
          {last.scores.map((s) => (
            <div key={s.id}>
              <p className="mb-1 text-label-md text-on-surface-variant">{s.name}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {s.groups.map((g, i) => (
                  <div key={i} className="flex -space-x-7">
                    {g.map((c) => <PlayingCard key={c.id} card={c} wild={c.rank === view.wildRank} className="!h-14 !w-10 sm:!h-16 sm:!w-11" />)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        {!over && session.isHost && (
          <button type="button" className="btn btn-primary" onClick={() => session.act({ a: 'next' })}>Start round {view.round + 1}</button>
        )}
        {!over && !session.isHost && <p className="text-body-md text-on-surface-variant">Waiting for the host to start round {view.round + 1}…</p>}
        {over && <button type="button" className="btn btn-primary" onClick={leaveRoom}>Back to Rummy</button>}
      </div>
    </section>
  );
}
