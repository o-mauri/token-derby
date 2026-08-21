import { describe, it, expect } from 'vitest';
import {
  putDevice, getDeviceByToken, listDevices, deleteDevice, touchDevice, deleteDeviceByToken,
} from '../../src/db/devices.js';

const uid = () => `u-${Math.random().toString(36).slice(2)}`;
const tok = () => `tok-${Math.random().toString(36).slice(2)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('device db layer', () => {
  it('stores a device and finds it by token', async () => {
    const u = uid();
    const token = tok();
    await putDevice({ user_id: u, token, label: 'omars-laptop' });
    const found = await getDeviceByToken(u, token);
    expect(found?.label).toBe('omars-laptop');
  });

  it('returns a DeviceRecord with no token or hash on it', async () => {
    const u = uid();
    const token = tok();
    await putDevice({ user_id: u, token, label: 'omars-laptop' });
    const found = await getDeviceByToken(u, token);
    expect(found).not.toBeNull();
    expect(Object.keys(found!).sort()).toEqual(
      ['created_at', 'device_id', 'label', 'last_seen_at'].sort(),
    );
  });

  it('does not find a device belonging to another user', async () => {
    const a = uid();
    const b = uid();
    const token = tok();
    await putDevice({ user_id: a, token, label: 'a' });
    expect(await getDeviceByToken(b, token)).toBeNull();
    // The row itself must be untouched by the failed cross-user lookup.
    expect(await getDeviceByToken(a, token)).not.toBeNull();
  });

  it('does not find a device by the wrong token for the right user', async () => {
    const u = uid();
    await putDevice({ user_id: u, token: tok(), label: 'a' });
    expect(await getDeviceByToken(u, 'wrong-token')).toBeNull();
  });

  it('lists a user devices and none of another user', async () => {
    const a = uid();
    const b = uid();
    await putDevice({ user_id: a, token: tok(), label: 'one' });
    await putDevice({ user_id: a, token: tok(), label: 'two' });
    await putDevice({ user_id: b, token: tok(), label: 'other-user' });

    const listA = await listDevices(a);
    expect(listA.map((d) => d.label).sort()).toEqual(['one', 'two']);

    const listB = await listDevices(b);
    expect(listB.map((d) => d.label)).toEqual(['other-user']);
  });

  it('lists devices newest first', async () => {
    const u = uid();
    await putDevice({ user_id: u, token: tok(), label: 'first' });
    await sleep(5);
    await putDevice({ user_id: u, token: tok(), label: 'second' });
    await sleep(5);
    await putDevice({ user_id: u, token: tok(), label: 'third' });

    const list = await listDevices(u);
    expect(list.map((d) => d.label)).toEqual(['third', 'second', 'first']);
  });

  it('deletes a device by device_id', async () => {
    const u = uid();
    await putDevice({ user_id: u, token: tok(), label: 'one' });
    await putDevice({ user_id: u, token: tok(), label: 'two' });
    const list = await listDevices(u);
    expect(list).toHaveLength(2);

    const deleted = await deleteDevice(u, list[0]!.device_id);
    expect(deleted).toBe(true);

    const remaining = await listDevices(u);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.device_id).toBe(list[1]!.device_id);
  });

  it('returns false deleting an unknown device_id', async () => {
    const u = uid();
    await putDevice({ user_id: u, token: tok(), label: 'one' });
    expect(await deleteDevice(u, 'nonexistent-device-id')).toBe(false);
    expect(await listDevices(u)).toHaveLength(1);
  });

  it('exactly one caller wins when two deletes race on the same device_id', async () => {
    const u = uid();
    await putDevice({ user_id: u, token: tok(), label: 'one' });
    const [device] = await listDevices(u);
    // Both calls read the row and pass the `!match` check before either
    // delete lands, so this exercises the conditional-delete race, not the
    // early-return path a sequential double-delete would take.
    const [a, b] = await Promise.all([
      deleteDevice(u, device!.device_id),
      deleteDevice(u, device!.device_id),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await listDevices(u)).toHaveLength(0);
  });

  it('cannot delete another user device, and leaves it intact', async () => {
    const a = uid();
    const b = uid();
    const token = tok();
    await putDevice({ user_id: a, token, label: 'a-device' });
    const [aDevice] = await listDevices(a);

    const deleted = await deleteDevice(b, aDevice!.device_id);
    expect(deleted).toBe(false);

    // A's row must still be there, readable and unchanged.
    const stillThere = await getDeviceByToken(a, token);
    expect(stillThere).not.toBeNull();
    expect(stillThere?.device_id).toBe(aDevice!.device_id);
    expect(stillThere?.label).toBe('a-device');
    expect(await listDevices(a)).toHaveLength(1);
    expect(await listDevices(b)).toHaveLength(0);
  });

  it('touches a device, updating last_seen_at but not created_at or device_id', async () => {
    const u = uid();
    const token = tok();
    const original = await putDevice({ user_id: u, token, label: 'a' });
    await sleep(5);
    await touchDevice(u, token);
    const after = await getDeviceByToken(u, token);
    expect(after?.device_id).toBe(original.device_id);
    expect(after?.created_at).toBe(original.created_at);
    expect(after?.last_seen_at).not.toBe(original.last_seen_at);
    expect(new Date(after!.last_seen_at).getTime()).toBeGreaterThan(
      new Date(original.last_seen_at).getTime(),
    );
  });

  it('touching an unknown device is a no-op, not an upsert of a phantom row', async () => {
    const u = uid();
    const token = 'never-registered-token';
    await expect(touchDevice(u, token)).resolves.toBeUndefined();
    // The conditional guard must prevent UpdateCommand from creating a bare
    // pk/sk/last_seen_at row with no device_id or label.
    expect(await getDeviceByToken(u, token)).toBeNull();
    expect(await listDevices(u)).toHaveLength(0);
  });

  it('touching a device does not affect another user device with the same token', async () => {
    const a = uid();
    const b = uid();
    const token = tok();
    const bDevice = await putDevice({ user_id: b, token, label: 'b-device' });
    // Wrong user for this token — must not create or touch anything under `a`.
    await touchDevice(a, token);
    expect(await getDeviceByToken(a, token)).toBeNull();
    const after = await getDeviceByToken(b, token);
    expect(after?.last_seen_at).toBe(bDevice.last_seen_at);
  });

  it('deletes a device by the token that authenticates it', async () => {
    const u = uid();
    const token = tok();
    await putDevice({ user_id: u, token, label: 'to-delete' });

    const deleted = await deleteDeviceByToken(u, token);
    expect(deleted).toBe(true);
    expect(await getDeviceByToken(u, token)).toBeNull();
  });

  it('returns false deleting by a token with no matching device row (legacy credential)', async () => {
    const u = uid();
    expect(await deleteDeviceByToken(u, 'never-registered-token')).toBe(false);
  });

  it('does not delete another user device that happens to share the token', async () => {
    const a = uid();
    const b = uid();
    const token = tok();
    await putDevice({ user_id: b, token, label: 'b-device' });

    expect(await deleteDeviceByToken(a, token)).toBe(false);
    // b's row must be untouched by a's failed delete.
    expect(await getDeviceByToken(b, token)).not.toBeNull();
  });
});
