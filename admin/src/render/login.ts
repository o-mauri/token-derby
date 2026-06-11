import type { AdminLoginResponse } from '@token-derby/shared';

export type LoginDeps = {
  login: (username: string, password: string) => Promise<AdminLoginResponse>;
  onSuccess: (token: string) => void;
};

export function renderLogin(root: HTMLElement, deps: LoginDeps): void {
  root.innerHTML = `
    <section class="login">
      <h1>🏇 Token Derby — Admin</h1>
      <form novalidate>
        <input name="username" placeholder="username" autocomplete="username" autofocus>
        <input name="password" type="password" placeholder="password" autocomplete="current-password">
        <button type="submit">Sign in</button>
        <div class="err" role="alert"></div>
      </form>
    </section>
  `;

  const form = root.querySelector('form')!;
  const errEl = root.querySelector('.err')!;
  const button = root.querySelector('button')!;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.textContent = '';
    const username = (root.querySelector('input[name="username"]') as HTMLInputElement).value.trim();
    const password = (root.querySelector('input[name="password"]') as HTMLInputElement).value;
    button.setAttribute('disabled', 'true');
    try {
      const res = await deps.login(username, password);
      deps.onSuccess(res.token);
    } catch {
      errEl.textContent = 'Invalid username or password';
    } finally {
      button.removeAttribute('disabled');
    }
  });
}
