import { useEffect, useEffectEvent } from 'react';

/** Runs an action when its key is pressed anywhere on the page. Keys are `KeyboardEvent.code` values. */
export function useHotkeys(bindings: Readonly<Record<string, () => void>>): void {
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const action = bindings[event.code];
    if (!action || event.repeat) return;
    event.preventDefault();
    action();
  });

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
