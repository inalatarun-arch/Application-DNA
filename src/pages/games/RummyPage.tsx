import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, HelpCircle, LogOut } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Entry from '@/games/rummy/ui/Entry';
import Lobby from '@/games/rummy/ui/Lobby';
import Table from '@/games/rummy/ui/Table';
import { joinRoom, lastRoom, leaveRoom, savedName, useRoom } from '@/games/rummy/store';
import { normalizeCode } from '@/games/rummy/session';

export default function RummyPage() {
  const { session, state, notice } = useRoom();
  const [params, setParams] = useSearchParams();
  const roomParam = normalizeCode(params.get('room') ?? '');

  // After a refresh, quietly return to the room this tab was in (guests only: a host's room lives in their browser).
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current || session) return;
    tried.current = true;
    const code = lastRoom();
    const name = savedName();
    if (code && name) joinRoom(code, name).catch(() => { /* room is gone: show the entry screen */ });
  }, [session]);

  // Once in a room the invite code no longer belongs in the address bar.
  useEffect(() => {
    if (session && params.has('room')) setParams({}, { replace: true });
  }, [session, params, setParams]);

  const inRoom = state && state.status !== 'connecting';

  return (
    <div>
      <PageHeader
        title="Indian Rummy"
        description="13-card Points Rummy for 3 to 6 players. Make two sequences (one pure) and group the rest."
        actions={
          <div className="flex gap-2">
            <Link to="/games" className="btn btn-secondary btn-sm"><ArrowLeft size={14} aria-hidden /> Games</Link>
            {session && state?.status !== 'closed' && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={leaveRoom}>
                <LogOut size={14} aria-hidden /> {session.isHost ? 'Close room' : 'Leave'}
              </button>
            )}
          </div>
        }
      />

      {notice && <p role="alert" className="mb-4 rounded border border-warning/40 bg-warning-container px-3 py-2 text-body-md">{notice}</p>}

      {state?.status === 'closed' && (
        <div className="card mx-auto mb-4 max-w-3xl">
          <p className="font-medium">{state.message}</p>
          <button type="button" className="btn btn-primary mt-3" onClick={leaveRoom}>Back to Rummy</button>
        </div>
      )}

      {!session && <Entry initialCode={roomParam} />}
      {state?.status === 'lobby' && session && <Lobby session={session} code={state.code} lobby={state.lobby} />}
      {state?.status === 'game' && session && <Table session={session} view={state.view} />}
      {inRoom && state.status !== 'closed' && <Rules />}
      {!session && <Rules />}
    </div>
  );
}

function Rules() {
  return (
    <details className="card mx-auto mt-6 max-w-3xl">
      <summary className="flex cursor-pointer items-center gap-2 font-medium"><HelpCircle size={16} aria-hidden /> How to play</summary>
      <div className="mt-3 space-y-2 text-body-md text-on-surface-variant">
        <p>Everyone gets 13 cards. A random card is cut as the <strong className="text-on-surface">wild joker</strong>: every card of that rank, plus the printed jokers, can stand in for any card.</p>
        <p>On your turn, draw one card from the stock or the top of the discard pile, then discard one card.</p>
        <p>To win, arrange all 13 cards into groups and <strong className="text-on-surface">declare</strong>: select one card as your finishing discard, then press Declare. You need at least <strong className="text-on-surface">two sequences</strong>, and at least one must be <strong className="text-on-surface">pure</strong> (no joker). Other groups can be sets (3 or 4 cards of one rank, different suits) or sequences.</p>
        <p>Tap cards to select them, then <em>Group selected</em>. Use <em>+ add here</em> to move selected cards into an existing group. Your groups are labelled so you can see what is valid.</p>
        <p><strong className="text-on-surface">Scoring:</strong> the winner scores 0. Everyone else scores the face value of cards outside valid groups (A, K, Q, J, 10 = 10; jokers = 0), up to 80. No pure sequence means the whole hand counts. Dropping costs 20 before your first draw and 40 after. A wrong declaration costs 80. Lowest total after the last round wins.</p>
        <p>The host&apos;s browser runs the game. If the host closes the page, the game ends. Players who refresh can rejoin.</p>
      </div>
    </details>
  );
}
