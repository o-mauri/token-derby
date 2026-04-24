import type { GetRaceResponse, HorseView } from '@token-derby/shared';

const CONFETTI_COLORS = ['#ffd166', '#7bed9f', '#a68bd8', '#ff6b6b', '#4db8ff', '#ffffff'];
const CONFETTI_COUNT = 40;

export function renderFinishedOverlay(raceEl: HTMLElement, race: GetRaceResponse): void {
  if (raceEl.querySelector('.podium')) return;

  raceEl.classList.add('finished');
  raceEl.appendChild(buildConfetti(raceEl.ownerDocument));
  raceEl.appendChild(buildPodium(raceEl.ownerDocument, race));
}

function buildConfetti(doc: Document): HTMLElement {
  const wrap = doc.createElement('div');
  wrap.className = 'confetti';
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const piece = doc.createElement('span');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.backgroundColor = CONFETTI_COLORS[i % CONFETTI_COLORS.length]!;
    piece.style.animationDelay = `${(Math.random() * 2).toFixed(2)}s`;
    piece.style.transform = `rotate(${Math.floor(Math.random() * 360)}deg)`;
    wrap.appendChild(piece);
  }
  return wrap;
}

function buildPodium(doc: Document, race: GetRaceResponse): HTMLElement {
  const sorted = [...race.horses].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const top: HorseView[] = sorted.slice(0, 3);

  const overlay = doc.createElement('div');
  overlay.className = 'podium';
  overlay.innerHTML = `
    <h2>🏆 Final Standings</h2>
    <ol>
      ${top.map((h, i) => `
        <li>
          <span class="place">${['🥇', '🥈', '🥉'][i]}</span>
          <span class="name">${escapeHtml(h.name)}</span>
          <span class="tokens">${(h.final_tokens ?? h.current_tokens).toLocaleString()} tokens</span>
        </li>
      `).join('')}
    </ol>
    <button class="dismiss" type="button">Dismiss</button>
  `;
  overlay.querySelector<HTMLButtonElement>('.dismiss')!.addEventListener('click', () => {
    overlay.remove();
  });
  return overlay;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
