import { horseFaceSvg } from '../horse-face.js';

export function renderPrivacy(root: HTMLElement): void {
  root.innerHTML = `
    <section class="about">
      <h1>${horseFaceSvg()} TOKEN DERBY — Privacy</h1>
      <p>Token Derby is a hobby project that races a horse for every participant,
      where distance comes from the output tokens your AI coding tool produced.</p>

      <h3>What is stored</h3>
      <ul>
        <li>Your display name, so races and leaderboards can show who is who.</li>
        <li>Your email address and Google account id, if you sign in with Google —
        used only to identify your account on return visits.</li>
        <li>Token counts, race results and horse customisations.</li>
      </ul>

      <h3>What is not stored</h3>
      <ul>
        <li>The contents of your prompts, code or conversations. Only counts are sent.</li>
        <li>Payment details. Nothing here is paid for.</li>
      </ul>

      <h3>Sharing</h3>
      <p>Nothing is sold or shared with third parties. Names and results are visible
      to other members of organisations you join, and on race pages you share.</p>

      <h3>Deletion</h3>
      <p>Ask and your account and its data will be removed.</p>

      <p><a class="about-home" href="/">← home</a></p>
    </section>
  `;
}
