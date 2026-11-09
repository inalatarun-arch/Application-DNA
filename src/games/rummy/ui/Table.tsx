import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, Flag, Layers, LogOut, Scissors, Trash2, Wifi, WifiOff } from 'lucide-react';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { cn } from '@/lib/cn';
import { evaluateHand, rankName, type GameView, type GroupKind } from '../engine';
import { autoSort, groupSelected, moveToGroup, reconcile, sortWithinGroups, toIds, ungroup } from '../hand';
import type { Session } from '../session';
import PlayingCard, { cardLabel } from './PlayingCard';
import Results from './Results';

const KIND_LABEL: Record<GroupKind, string> = { pure: 'Pure sequence', sequence: 'Sequence', set: 'Set', invalid: 'Not a set or sequence' };
const KIND_STYLE: Record<GroupKind, string> = {
  pure: 'border-success text-success',
  sequence: 'border-primary text-primary',
  set: 'border-warning text-warning',
  invalid: 'border-outline-variant text-on-surface-variant',
};

export default function Table({ session, view }: { session: Session; view: GameView }) {
  const me = view.players.find((p) => p.id === view.you);
  const current = view.players.find((p) => p.id === view.turn);
  const myTurn = view.phase === 'playing' && view.turn === view.you && !me?.out;
  const canDraw = myTurn && view.step === 'draw';
  const canDiscard = myTurn && view.step === 'discard';

  const [groups, setGroups] = useState(() => autoSort(view.myGroups));
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirm, setConfirm] = useState<'drop' | 'declare' | null>(null);

  // Keep my own layout stable when the host's view changes (a draw, a discard, someone else's move).
  const lastRound = useRef(view.round);
  useEffect(() => {
    if (lastRound.current !== view.round) {
      lastRound.current = view.round;
      const fresh = autoSort(view.myGroups);
      setGroups(fresh);
      setSelected(new Set());
      session.act({ a: 'arrange', groups: toIds(fresh) });
      return;
    }
    setGroups((g) => reconcile(g, view.myGroups));
    setSelected((s) => {
      const ids = new Set(view.myGroups.flat().map((c) => c.id));
      const next = new Set([...s].filter((id) => ids.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [view.myGroups, view.round, session]);

  // First deal: tell the host about the sorted layout too, so a drop or a rejoin is scored on it.
  const announced = useRef(false);
  useEffect(() => {
    if (announced.current) return;
    announced.current = true;
    session.act({ a: 'arrange', groups: toIds(groups) });
  }, [session, groups]);

  const update = (next: typeof groups) => {
    setGroups(next);
    session.act({ a: 'arrange', groups: toIds(next) });
  };

  const evaluation = useMemo(() => evaluateHand(groups, view.wildRank), [groups, view.wildRank]);
  const selectedCount = selected.size;

  const finishGroups = useMemo(() => {
    if (selectedCount !== 1) return null;
    return groups.map((g) => g.filter((c) => !selected.has(c.id))).filter((g) => g.length);
  }, [groups, selected, selectedCount]);
  const declareReady = finishGroups ? evaluateHand(finishGroups, view.wildRank).complete : false;

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const discardSelected = () => {
    const [id] = [...selected];
    setSelected(new Set());
    session.act({ a: 'discard', card: id });
  };
  const declare = () => {
    if (!finishGroups) return;
    const [card] = [...selected];
    setSelected(new Set());
    session.act({ a: 'declare', card, groups: toIds(finishGroups) });
  };

  const topDiscard = view.discardTop[view.discardTop.length - 1];
  const status = view.phase !== 'playing'
    ? ''
    : me?.out
      ? 'You are out of this round. Watch the others finish.'
      : myTurn
        ? view.step === 'draw' ? 'Your turn: draw from the stock or take the top discard.' : 'Select a card to discard, or one finishing card to declare.'
        : `Waiting for ${current?.name ?? 'the next player'}${current && !current.connected ? ' (disconnected)' : ''}…`;

  const absentTurn = session.isHost && view.phase === 'playing' && current && !current.connected;

  return (
    <div className="space-y-4">
      {/* Scoreboard */}
      <div className="flex flex-wrap items-center gap-2" aria-label="Players">
        {view.players.map((p) => (
          <div
            key={p.id}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-1.5',
              p.id === view.turn && view.phase === 'playing' ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-lowest',
              p.out && 'opacity-60',
            )}
          >
            {p.connected ? <Wifi size={13} className="text-success" aria-label="Connected" /> : <WifiOff size={13} className="text-error" aria-label="Disconnected" />}
            <span className="max-w-[8rem] truncate font-medium">{p.name}{p.id === view.you ? ' (you)' : ''}</span>
            <span className="text-label-md text-on-surface-variant">
              {p.out ? (p.outReason === 'wrong-declare' ? 'wrong declare' : 'dropped') : `${p.cards} cards`} · {p.total} pts
            </span>
          </div>
        ))}
        <span className="ml-auto text-label-md text-on-surface-variant">Round {view.round} of {view.totalRounds}</span>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-outline-variant bg-primary-container/60 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-center gap-6 sm:gap-10">
          <div className="text-center">
            <p className="eyebrow mb-2">Wild joker</p>
            {view.wildCard && <PlayingCard card={view.wildCard} wild />}
            <p className="mt-1 text-label-md text-on-surface-variant">All {rankName(view.wildRank)}s</p>
          </div>
          <div className="text-center">
            <p className="eyebrow mb-2">Stock · {view.stockCount}</p>
            <PlayingCard onClick={canDraw ? () => session.act({ a: 'draw' }) : undefined} label="Draw from the stock" className={cn(canDraw && 'ring-2 ring-accent')} />
          </div>
          <div className="text-center">
            <p className="eyebrow mb-2">Discard · {view.discardCount}</p>
            {topDiscard ? (
              <PlayingCard card={topDiscard} wild={topDiscard.rank === view.wildRank} onClick={canDraw ? () => session.act({ a: 'take' }) : undefined} label={`Take ${cardLabel(topDiscard)} from the discard pile`} className={cn(canDraw && 'ring-2 ring-accent')} />
            ) : (
              <div className="h-[4.5rem] w-12 rounded-lg border-2 border-dashed border-outline sm:h-24 sm:w-16" aria-label="Empty discard pile" />
            )}
          </div>
        </div>
        <p role="status" aria-live="polite" className={cn('mt-4 text-center text-body-md font-medium', myTurn ? 'text-primary' : 'text-on-surface-variant')}>{status}</p>
        {absentTurn && (
          <p className="mt-2 text-center">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => session.act({ a: 'dropAbsent' })}>
              Skip {current?.name} now
            </button>
          </p>
        )}
      </div>

      {/* My hand */}
      {me && !me.out && view.phase !== 'game-over' && (
        <section aria-label="Your hand" className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-headline-md">Your hand</h2>
            <span className="text-label-md text-on-surface-variant">
              {evaluation.complete ? 'All groups valid' : `${evaluation.points} points if the round ended now`}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-4">
            {groups.map((g, i) => {
              const kind = g.length >= 3 ? evaluation.kinds[i] : null;
              return (
                <div key={g.map((c) => c.id).join('-')} className="min-w-0">
                  <div className="mb-1 flex h-5 items-center gap-1">
                    {kind && <span className={cn('rounded border px-1.5 text-label-md', KIND_STYLE[kind])}>{KIND_LABEL[kind]}</span>}
                    {selectedCount > 0 && !g.every((c) => selected.has(c.id)) && (
                      <button type="button" className="rounded border border-dashed border-outline px-1.5 text-label-md text-on-surface-variant hover:bg-surface-container" onClick={() => { update(moveToGroup(groups, selected, g[0].id)); setSelected(new Set()); }}>
                        + add here
                      </button>
                    )}
                  </div>
                  <div className="flex -space-x-5 pl-0 sm:-space-x-6">
                    {g.map((c) => (
                      <PlayingCard key={c.id} card={c} wild={c.rank === view.wildRank} selected={selected.has(c.id)} onClick={() => toggle(c.id)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-outline-variant pt-3">
            <button type="button" className="btn btn-secondary btn-sm" disabled={selectedCount < 2} onClick={() => { update(groupSelected(groups, selected)); setSelected(new Set()); }}>
              <Layers size={14} aria-hidden /> Group selected
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { update(ungroup(groups, selected)); setSelected(new Set()); }}>
              <Scissors size={14} aria-hidden /> {selectedCount ? 'Ungroup selected' : 'Ungroup all'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => update(selectedCount ? sortWithinGroups(groups) : autoSort(groups))}>
              <ArrowDownUp size={14} aria-hidden /> {selectedCount ? 'Sort groups' : 'Sort by suit'}
            </button>
            <span className="mx-1 hidden h-5 w-px bg-outline-variant sm:block" />
            <button type="button" className="btn btn-primary btn-sm" disabled={!canDiscard || selectedCount !== 1} onClick={discardSelected}>
              <Trash2 size={14} aria-hidden /> Discard
            </button>
            <button
              type="button" className="btn btn-sm border-success bg-success text-on-primary hover:opacity-90"
              disabled={!canDiscard || selectedCount !== 1}
              onClick={() => (declareReady ? declare() : setConfirm('declare'))}
              title="Select one finishing card, with the other 13 grouped"
            >
              <Flag size={14} aria-hidden /> Declare{canDiscard && selectedCount === 1 ? (declareReady ? ' — hand is valid' : '') : ''}
            </button>
            <button type="button" className="btn btn-ghost ml-auto" disabled={!canDraw} onClick={() => setConfirm('drop')}>
              <LogOut size={14} aria-hidden /> Drop
            </button>
          </div>
        </section>
      )}

      {/* Log */}
      {view.log.length > 0 && view.phase === 'playing' && (
        <ul className="space-y-0.5 text-label-md text-on-surface-variant" aria-label="Recent events">
          {view.log.slice(-4).map((l, i) => <li key={`${i}-${l}`}>{l}</li>)}
        </ul>
      )}

      {view.phase !== 'playing' && <Results session={session} view={view} />}

      <ConfirmModal
        open={confirm === 'drop'}
        title="Drop this round?"
        confirmLabel="Drop"
        message={<>You leave this round and score <strong>{view.iHaveDrawn ? 40 : 20}</strong> points. Nobody can undo it.</>}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { setConfirm(null); session.act({ a: 'drop' }); }}
      />
      <ConfirmModal
        open={confirm === 'declare'}
        title="This hand is not valid yet"
        confirmLabel="Declare anyway (80 points)"
        message="You need at least two sequences, one of them pure (no joker), and every other group must be a set or sequence. A wrong declaration costs 80 points and puts you out of the round."
        onCancel={() => setConfirm(null)}
        onConfirm={() => { setConfirm(null); declare(); }}
      />
    </div>
  );
}
