import { useState } from 'react';
import { GameOverScreen } from './GameOverScreen.tsx';
import { GameScreen } from './GameScreen.tsx';
import { TitleScreen } from './TitleScreen.tsx';
import type { AppServices } from './services.ts';

type Screen =
  | { name: 'title' }
  | { name: 'playing'; session: Promise<string | null> }
  | { name: 'gameOver'; score: number; session: Promise<string | null> };

export function App({ services }: { services: AppServices }) {
  const [screen, setScreen] = useState<Screen>({ name: 'title' });

  // The run is registered with the leaderboard as it starts. If that fails the game is still playable, only not rankable.
  const startRun = () =>
    setScreen({ name: 'playing', session: services.leaderboard.startSession().catch(() => null) });

  switch (screen.name) {
    case 'title':
      return <TitleScreen services={services} onStart={startRun} />;
    case 'playing':
      return (
        <GameScreen
          services={services}
          onGameOver={(score) => setScreen({ name: 'gameOver', score, session: screen.session })}
        />
      );
    case 'gameOver':
      return (
        <GameOverScreen
          services={services}
          score={screen.score}
          session={screen.session}
          onPlayAgain={startRun}
          onExit={() => setScreen({ name: 'title' })}
        />
      );
  }
}
