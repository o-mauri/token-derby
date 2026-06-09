import { describe, it, expect } from 'vitest';
import { isoWeekdayInTz, localDateInTz, localDateTimeToUtcMs, isValidTimeZone } from '../../src/lib/tz.js';

describe('tz helpers', () => {
  it('isoWeekdayInTz: 2024-07-01 is a Monday in UTC', () => {
    expect(isoWeekdayInTz(new Date('2024-07-01T12:00:00Z'), 'UTC')).toBe(1);
  });

  it('isoWeekdayInTz: respects the zone across midnight', () => {
    // 23:30Z Mon = 08:30 Tue in Tokyo (UTC+9)
    expect(isoWeekdayInTz(new Date('2024-07-01T23:30:00Z'), 'Asia/Tokyo')).toBe(2);
  });

  it('localDateInTz: rolls to the next day east of UTC', () => {
    expect(localDateInTz(new Date('2024-07-01T23:30:00Z'), 'Asia/Tokyo')).toBe('2024-07-02');
    expect(localDateInTz(new Date('2024-07-01T23:30:00Z'), 'UTC')).toBe('2024-07-01');
  });

  it('localDateTimeToUtcMs: UTC is identity', () => {
    expect(localDateTimeToUtcMs('2024-07-01', '09:00', 'UTC')).toBe(Date.parse('2024-07-01T09:00:00Z'));
  });

  it('localDateTimeToUtcMs: London summer is BST (+1)', () => {
    expect(localDateTimeToUtcMs('2024-07-01', '09:00', 'Europe/London')).toBe(Date.parse('2024-07-01T08:00:00Z'));
  });

  it('localDateTimeToUtcMs: London winter is GMT (+0)', () => {
    expect(localDateTimeToUtcMs('2024-01-01', '09:00', 'Europe/London')).toBe(Date.parse('2024-01-01T09:00:00Z'));
  });

  it('isValidTimeZone', () => {
    expect(isValidTimeZone('Europe/London')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
