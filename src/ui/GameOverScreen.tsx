import { useEffect, useState, type FormEvent } from 'react';
import type { LeaderboardEntry } from '../../shared/leaderboard-contract.ts';
import { INITIALS_LENGTH } from '../../shared/initials.ts';
import { LeaderboardError, type RunResult } from '../application/ports.ts';
import { InitialsInput } from './InitialsInput.tsx';
import { Leaderboard } from './Leaderboard.tsx';
import { formatScore } from './LeaderboardTable.tsx';
import type { AppServices } from './services.ts';
import { useHotkeys } from './useHotkeys.ts';

interface GameOverScreenProps {
  services: AppServices;
  result: RunResult;
  /** Resolves to the id the score must be saved with, or null when the leaderboard was unreachable. */
  session: Promise<string | null>;
  onPlayAgain: () => void;
  onExit: () => void;
}

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; entry: LeaderboardEntry }
  | { status: 'failed'; message: string };

function describeSaveError(error: unknown): string {
  if (!(error instanceof LeaderboardError)) return 'The score could not be saved.';
  switch (error.code) {
    case 'network':
      return 'The leaderboard cannot be reached. Check your connection and try again.';
    case 'session_already_used':
      return 'This score was already saved.';
    case 'implausible_score':
      return 'The leaderboard could not accept this score.';
    default:
      return 'The score could not be saved.';
  }
}

/** The session id once it is known: undefined while pending, null when there is none. */
function useSessionId(session: Promise<string | null>): string | null | undefined {
  const [resolved, setResolved] = useState<{ session: Promise<string | null>; id: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void session.then((id) => {
      if (!cancelled) setResolved({ session, id });
    });
    return () => {
      cancelled = true;
    };
  }, [session]);
  return resolved?.session === session ? resolved.id : undefined;
}

export function GameOverScreen({ services, result, session, onPlayAgain, onExit }: GameOverScreenProps) {
  const { score } = result;
  const sessionId = useSessionId(session);
  const [initials, setInitials] = useState(() => services.preferences.loadInitials());
  const [save, setSave] = useState<SaveState>({ status: 'idle' });

  const isFormShown = score > 0 && typeof sessionId === 'string' && save.status !== 'saved';
  // While the form is open, Enter belongs to it.
  useHotkeys(isFormShown ? {} : { Enter: onPlayAgain });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (typeof sessionId !== 'string' || initials.length !== INITIALS_LENGTH || save.status === 'saving') return;

    setSave({ status: 'saving' });
    try {
      const entry = await services.leaderboard.submitScore({ sessionId, initials, run: result });
      services.preferences.saveInitials(initials);
      setSave({ status: 'saved', entry });
    } catch (error) {
      setSave({ status: 'failed', message: describeSaveError(error) });
    }
  }

  return (
    <main className="screen gameover">
      <h1 className="logo logo--small">Game over</h1>
      <p className="final-score">
        Score <strong>{formatScore(score)}</strong>
      </p>

      {score === 0 && <p className="muted">Fly a little farther to make the board.</p>}
      {score > 0 && sessionId === undefined && (
        <p className="muted" role="status">
          Contacting the leaderboard…
        </p>
      )}
      {score > 0 && sessionId === null && (
        <p className="muted" role="status">
          The leaderboard is offline, so this score cannot be saved.
        </p>
      )}

      {isFormShown && (
        <form className="panel save" onSubmit={handleSubmit}>
          <label htmlFor="initials">Enter your initials</label>
          <InitialsInput value={initials} onChange={setInitials} disabled={save.status === 'saving'} />
          <button
            type="submit"
            className="button button--primary"
            disabled={initials.length !== INITIALS_LENGTH || save.status === 'saving'}
          >
            {save.status === 'saving' ? 'Saving…' : 'Save score'}
          </button>
          {save.status === 'failed' && (
            <p role="alert" className="error">
              {save.message}
            </p>
          )}
        </form>
      )}

      {save.status === 'saved' && (
        <section className="panel">
          <p role="status" className="rank">
            You placed #{save.entry.rank}!
          </p>
          <Leaderboard leaderboard={services.leaderboard} highlight={save.entry} />
        </section>
      )}

      <div className="actions">
        <button type="button" className="button button--primary" onClick={onPlayAgain}>
          Play again
        </button>
        <button type="button" className="button" onClick={onExit}>
          Title screen
        </button>
      </div>
    </main>
  );
}
