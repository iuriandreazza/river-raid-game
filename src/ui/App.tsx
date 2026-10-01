import { useState } from 'react';
import type { RunResult } from '../application/ports.ts';
import { ConsentBanner } from './ConsentBanner.tsx';
import { GameOverScreen } from './GameOverScreen.tsx';
import { GameScreen } from './GameScreen.tsx';
import { TitleScreen } from './TitleScreen.tsx';
import type { AppServices } from './services.ts';
import { useAnalyticsConsent } from './useAnalyticsConsent.ts';

type Screen =
  | { name: 'title' }
  | { name: 'playing'; session: Promise<string | null> }
  | { name: 'gameOver'; result: RunResult; session: Promise<string | null> };

export function App({ services }: { services: AppServices }) {
  const { consent, asking, secondsLeft, answer, reopen } = useAnalyticsConsent(services);

  return (
    <>
      <Screens services={services} onReviewAnalytics={reopen} />
      {asking && <ConsentBanner consent={consent} secondsLeft={secondsLeft} onAnswer={answer} />}
    </>
  );
}

function Screens({ services, onReviewAnalytics }: { services: AppServices; onReviewAnalytics: () => void }) {
  const [screen, setScreen] = useState<Screen>({ name: 'title' });

  // The run is registered with the leaderboard as it starts. If that fails the game is still playable, only not rankable.
  const startRun = () =>
    setScreen({ name: 'playing', session: services.leaderboard.startSession().catch(() => null) });

  switch (screen.name) {
    case 'title':
      return <TitleScreen services={services} onStart={startRun} onReviewAnalytics={onReviewAnalytics} />;
    case 'playing':
      return (
        <GameScreen
          services={services}
          onGameOver={(result) => setScreen({ name: 'gameOver', result, session: screen.session })}
        />
      );
    case 'gameOver':
      return (
        <GameOverScreen
          services={services}
          result={screen.result}
          session={screen.session}
          onPlayAgain={startRun}
          onExit={() => setScreen({ name: 'title' })}
        />
      );
  }
}
