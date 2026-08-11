import { openWeb, type Deps } from './open-web.js';

export async function webCommand(deps: Deps = {}): Promise<number> {
  return openWeb('/org-manager', 'org manager', deps);
}
