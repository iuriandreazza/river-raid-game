import { World } from '../world.ts';

/** How much of the river the golden digest covers: well past the sections that the golden runs fly through. */
export const GOLDEN_WORLD_SECTIONS = 60;

/**
 * A fingerprint of the generated river and of everything that sits in it. The golden runs only reach the first
 * sections, so this is what notices a change to the generator further upstream. It only has to notice change, it
 * is not a security measure.
 */
export async function worldDigest(sections = GOLDEN_WORLD_SECTIONS): Promise<string> {
  const world = new World();
  const parts: string[] = [];
  for (let index = 0; index < sections; index++) {
    const { terrain, rows, spawns } = world.plan(index);
    parts.push(JSON.stringify({ terrain, rows, spawns }));
  }
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.join('\n')));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
