import { Link } from 'react-router-dom';
import { Gamepad2, Spade, Users } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { GAMES } from '@/games/catalog';

export default function GamesPage() {
  return (
    <div>
      <PageHeader title="Games" description="Play with friends in your browser. No sign-up: open a room, share the code, and play." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GAMES.map((g) => {
          const body = (
            <>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-container text-primary">
                {g.id === 'rummy' ? <Spade size={20} aria-hidden /> : <Gamepad2 size={20} aria-hidden />}
              </span>
              <h2 className="mt-4 font-display text-headline-md font-medium">{g.title}</h2>
              <p className="mt-1 flex-1 text-body-md text-on-surface-variant">{g.description}</p>
              <p className="mt-4 flex items-center gap-1.5 text-label-md text-on-surface-variant">
                <Users size={14} aria-hidden /> {g.players}
                {!g.available && <span className="ml-auto rounded border border-outline-variant px-1.5 py-0.5">Coming soon</span>}
              </p>
            </>
          );
          return g.available ? (
            <Link key={g.id} to={g.to} className="card card-interactive flex flex-col">{body}</Link>
          ) : (
            <div key={g.id} className="card flex flex-col opacity-60" aria-disabled="true">{body}</div>
          );
        })}
      </div>
    </div>
  );
}
