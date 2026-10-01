import { EXTRA_JET_EVERY, POINTS } from '../../shared/game/constants.ts';
import { Leaderboard } from './Leaderboard.tsx';
import { formatScore } from './LeaderboardTable.tsx';
import type { AppServices } from './services.ts';
import { useHotkeys } from './useHotkeys.ts';

interface TitleScreenProps {
  services: AppServices;
  onStart: () => void;
}

const SCORING: ReadonlyArray<readonly [target: string, points: number]> = [
  ['Tanker', POINTS.tanker],
  ['Helicopter', POINTS.helicopter],
  ['Fuel depot', POINTS.fuel],
  ['Jet', POINTS.jet],
  ['Bridge', POINTS.bridge],
];

const CONTROLS: ReadonlyArray<readonly [keys: string[], action: string]> = [
  [['←', '→'], 'Steer (or A and D)'],
  [['↑'], 'Fly faster (or W)'],
  [['↓'], 'Slow down (or S)'],
  [['Space'], 'Fire (or Z, X; hold for rapid fire)'],
  [['P'], 'Pause (or Esc)'],
  [['M'], 'Mute'],
];

export function TitleScreen({ services, onStart }: TitleScreenProps) {
  useHotkeys({ Enter: onStart, Space: onStart });

  return (
    <main className="screen title">
      <header className="title__header">
        <h1 className="logo">River Raid</h1>
        <p className="muted">Fly upstream, blow up the bridges, never run out of fuel.</p>
      </header>

      <section className="panel">
        <button type="button" className="button button--primary" onClick={onStart}>
          Start mission
        </button>
        <p className="hint">or press Enter</p>
        <h2 className="panel__title">Controls</h2>
        <dl className="controls">
          {CONTROLS.map(([keys, action]) => (
            <div key={action} className="controls__row">
              <dt>
                {keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel">
        <h2 className="panel__title">Top pilots</h2>
        <Leaderboard leaderboard={services.leaderboard} />
        <h2 className="panel__title">Scoring</h2>
        <dl className="controls">
          {SCORING.map(([target, points]) => (
            <div key={target} className="controls__row">
              <dt>{target}</dt>
              <dd>{points}</dd>
            </div>
          ))}
        </dl>
        <p className="hint">A spare jet for every {formatScore(EXTRA_JET_EVERY)} points.</p>
      </section>

      <footer className="footer muted">
        A fan-made tribute to the 1982 Atari 2600 game by Carol Shaw. Not affiliated with or endorsed by Activision.
      </footer>
    </main>
  );
}
