// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { usePoll, type PollState } from '../src/lib/poll.js';

// react-dom's act() warns unless this is set — happy-dom isn't detected by
// its jsdom-specific heuristic even though it behaves the same for our needs.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Minimal renderHook shim — no @testing-library dependency needed for a
// single hook under test. Mounts `callback` in a real React tree (via
// react-dom/client) so effects/state behave exactly as in the app.
function renderHook<T>(callback: () => T) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root;
  const ref: { current: T } = { current: undefined as unknown as T };

  function TestComponent() {
    ref.current = callback();
    return null;
  }

  act(() => {
    root = createRoot(container);
    root.render(React.createElement(TestComponent));
  });

  return {
    get current(): T {
      return ref.current;
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('usePoll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls fn immediately, then again after ms', async () => {
    const fn = vi.fn().mockResolvedValue('snapshot');
    const hook = renderHook(() => usePoll(fn, 1000, true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect((hook.current as PollState<string>).data).toBe('snapshot');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fn).toHaveBeenCalledTimes(2);

    hook.unmount();
  });

  it('never calls fn when enabled is false', async () => {
    const fn = vi.fn().mockResolvedValue('snapshot');
    const hook = renderHook(() => usePoll(fn, 1000, false));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(fn).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('stops polling once unmounted', async () => {
    const fn = vi.fn().mockResolvedValue('snapshot');
    const hook = renderHook(() => usePoll(fn, 1000, true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fn).toHaveBeenCalledTimes(1);

    hook.unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('stops polling once disabled after being enabled', async () => {
    const fn = vi.fn().mockResolvedValue('snapshot');
    let enabled = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root;
    const ref: { current: PollState<string> } = { current: undefined as unknown as PollState<string> };

    function TestComponent() {
      ref.current = usePoll(fn, 1000, enabled);
      return null;
    }

    act(() => {
      root = createRoot(container);
      root.render(React.createElement(TestComponent));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fn).toHaveBeenCalledTimes(1);

    enabled = false;
    act(() => {
      root.render(React.createElement(TestComponent));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fn).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('refresh() triggers an extra fetch outside the interval', async () => {
    const fn = vi.fn().mockResolvedValue('snapshot');
    const hook = renderHook(() => usePoll(fn, 1000, true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fn).toHaveBeenCalledTimes(1);

    await act(async () => {
      (hook.current as PollState<string>).refresh();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fn).toHaveBeenCalledTimes(2);

    hook.unmount();
  });

  it('surfaces a rejected fetch as `error`', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    const hook = renderHook(() => usePoll(fn, 1000, true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect((hook.current as PollState<string>).error).toBeInstanceOf(Error);
    hook.unmount();
  });
});
