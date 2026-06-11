import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderLogin } from '../src/render/login.js';

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});

async function flush() { await Promise.resolve(); await Promise.resolve(); }

describe('renderLogin', () => {
  it('renders username + password fields and a submit button', () => {
    renderLogin(root, { login: vi.fn(), onSuccess: vi.fn() });
    expect(root.querySelector('input[name="username"]')).toBeTruthy();
    expect(root.querySelector('input[name="password"]')).toBeTruthy();
    expect(root.querySelector('button')).toBeTruthy();
  });

  it('calls login then onSuccess with the token on success', async () => {
    const login = vi.fn(async () => ({ token: 'tok.tok', expires_at: 'x' }));
    const onSuccess = vi.fn();
    renderLogin(root, { login, onSuccess });

    (root.querySelector('input[name="username"]') as HTMLInputElement).value = 'omar';
    (root.querySelector('input[name="password"]') as HTMLInputElement).value = 'pw';
    root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect(login).toHaveBeenCalledWith('omar', 'pw');
    expect(onSuccess).toHaveBeenCalledWith('tok.tok');
  });

  it('shows an error message and does not call onSuccess on failure', async () => {
    const login = vi.fn(async () => { throw new Error('bad creds'); });
    const onSuccess = vi.fn();
    renderLogin(root, { login, onSuccess });

    root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect(onSuccess).not.toHaveBeenCalled();
    expect(root.querySelector('.err')!.textContent).toContain('Invalid');
  });
});
