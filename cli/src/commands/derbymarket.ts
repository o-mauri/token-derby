import { openWeb, type Deps } from './open-web.js';

export async function derbymarketCommand(deps: Deps = {}): Promise<number> {
  return openWeb('/derbymarket', 'Derbymarket', deps);
}
