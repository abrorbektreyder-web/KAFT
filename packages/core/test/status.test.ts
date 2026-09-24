// HR-04: xodim holati kadr hodisalaridan sana bo'yicha avtomatik hisoblanadi (bazasiz, sof mantiq).
import { describe, expect, it } from 'vitest';
import { daysBetween, statusOn, type HrEvent } from '../src/hr-events.ts';

const ev = (type: HrEvent['type'], startsOn: string, endsOn: string | null = null, cancelled = false): HrEvent =>
  ({ type, startsOn, endsOn, cancelledAt: cancelled ? new Date() : null });

describe('statusOn', () => {
  it('hodisa bo‘lmasa — ishda', () => {
    expect(statusOn([], '2026-10-01')).toBe('active');
  });

  it('AC-3: 1-oktabrdan dikret — 30-sentabrda ishda, 1-oktabrda dikretda', () => {
    const events = [ev('maternity', '2026-10-01')];
    expect(statusOn(events, '2026-09-30')).toBe('active');
    expect(statusOn(events, '2026-10-01')).toBe('maternity');
    expect(statusOn(events, '2027-05-01')).toBe('maternity'); // tugash sanasi yo'q — davom etadi
  });

  it('ta‘til faqat o‘z oralig‘ida (chegaralar ichida)', () => {
    const events = [ev('vacation', '2026-07-01', '2026-07-14')];
    expect(statusOn(events, '2026-06-30')).toBe('active');
    expect(statusOn(events, '2026-07-01')).toBe('vacation');
    expect(statusOn(events, '2026-07-14')).toBe('vacation');
    expect(statusOn(events, '2026-07-15')).toBe('active');
  });

  it('kasallik va safar', () => {
    expect(statusOn([ev('sick', '2026-03-02', '2026-03-06')], '2026-03-04')).toBe('sick');
    expect(statusOn([ev('business_trip', '2026-04-10', '2026-04-12')], '2026-04-11')).toBe('trip');
  });

  it('bo‘shagan kundan boshlab — bo‘shagan', () => {
    const events = [ev('termination', '2026-08-31')];
    expect(statusOn(events, '2026-08-30')).toBe('active');
    expect(statusOn(events, '2026-08-31')).toBe('terminated');
  });

  it('kelajakda ishga qabul — hali ishga kirmagan', () => {
    expect(statusOn([ev('hire', '2026-11-01')], '2026-10-15')).toBe('not_hired');
    expect(statusOn([ev('hire', '2026-11-01')], '2026-11-01')).toBe('active');
  });

  it('bekor qilingan hodisa hisobga olinmaydi', () => {
    expect(statusOn([ev('vacation', '2026-07-01', '2026-07-14', true)], '2026-07-05')).toBe('active');
  });

  it('kunlar soni — ikki chegara ham kiradi', () => {
    expect(daysBetween('2026-07-01', '2026-07-14')).toBe(14);
    expect(daysBetween('2026-02-27', '2026-03-02')).toBe(4);
  });
});
