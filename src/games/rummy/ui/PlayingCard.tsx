import { cn } from '@/lib/cn';
import { rankName, type Card } from '../engine';

const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' } as const;
const RANK_LABEL = (r: number) => (r === 1 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r));

export function cardLabel(card: Card): string {
  if (card.rank === 0 || !card.suit) return 'Joker';
  const suit = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' }[card.suit];
  return `${rankName(card.rank)} of ${suit}`;
}

interface Props {
  /** Omit for a face-down card. */
  card?: Card;
  /** Show the "wild" marker: this card's rank is the round's wild joker. */
  wild?: boolean;
  selected?: boolean;
  onClick?: () => void;
  label?: string;
  className?: string;
}

/** A playing card. Faces stay white in dark mode, like real cards. */
export default function PlayingCard({ card, wild, selected, onClick, label, className }: Props) {
  const size = 'h-[4.5rem] w-12 sm:h-24 sm:w-16';
  const interactive = !!onClick;

  if (!card) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!interactive}
        aria-label={label ?? 'Face-down card'}
        className={cn(
          size, 'shrink-0 rounded-lg border-2 border-white/80 bg-primary shadow-sm transition',
          'bg-[repeating-linear-gradient(45deg,rgb(var(--primary)),rgb(var(--primary))_6px,rgb(var(--primary)/0.75)_6px,rgb(var(--primary)/0.75)_12px)]',
          interactive ? 'cursor-pointer hover:-translate-y-1 hover:shadow-pop' : 'cursor-default', className,
        )}
      />
    );
  }

  const joker = card.rank === 0;
  const red = card.suit === 'H' || card.suit === 'D';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      aria-pressed={interactive ? !!selected : undefined}
      aria-label={label ?? cardLabel(card)}
      className={cn(
        size, 'relative shrink-0 select-none rounded-lg border bg-white text-left shadow-sm transition duration-150',
        selected ? 'z-10 -translate-y-3 border-primary ring-2 ring-primary' : 'border-neutral-300',
        interactive && !selected && 'hover:-translate-y-1',
        interactive ? 'cursor-pointer' : 'cursor-default',
        joker ? 'text-purple-700' : red ? 'text-red-600' : 'text-neutral-900',
        className,
      )}
    >
      {joker ? (
        <span className="flex h-full flex-col items-center justify-center gap-0.5">
          <span className="text-xl sm:text-2xl" aria-hidden>★</span>
          <span className="text-[0.6rem] font-bold tracking-wider sm:text-[0.65rem]">JOKER</span>
        </span>
      ) : (
        <>
          <span className="absolute left-1 top-0.5 flex flex-col items-center leading-none sm:left-1.5 sm:top-1">
            <span className="text-sm font-bold sm:text-base">{RANK_LABEL(card.rank)}</span>
            <span className="text-xs sm:text-sm" aria-hidden>{SUIT_SYMBOL[card.suit!]}</span>
          </span>
          <span className="absolute bottom-1 right-1.5 text-2xl leading-none sm:text-3xl" aria-hidden>{SUIT_SYMBOL[card.suit!]}</span>
        </>
      )}
      {wild && !joker && (
        <span className="absolute bottom-0.5 left-0.5 rounded bg-amber-400 px-1 text-[0.55rem] font-bold uppercase text-neutral-900 sm:text-[0.6rem]">wild</span>
      )}
    </button>
  );
}
