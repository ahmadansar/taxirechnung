import { describe, expect, it } from 'vitest'
import { levelTitle, nextLevel, overdueByUrgency, proposeReminderText, reminderDue } from '../reminder'
import type { Invoice } from '../types'

const TODAY = '2026-11-02'
const inv = (p: Partial<Invoice>): Invoice =>
  ({
    id: Math.random().toString(36),
    kind: 'invoice',
    status: 'issued',
    paid: false,
    payment_method: 'on_account',
    number: 'RE-2026-0001',
    issue_date: '2026-10-01',
    due_date: '2026-10-15',
    totals: { gross: 5000, net: 4673, vat: 327, lines: [] },
    customer: { company_name: 'Hotel Krone', name: 'Frau Berg', street: 'A 1', zip: '73728', city: 'Esslingen', email: '', vat_id: '' },
    seller: { name: 'Taxi Muster', owner_name: 'Max Muster' },
    reminder_count: 0,
    last_reminder_at: null,
    ...p,
  }) as unknown as Invoice

describe('overdue list', () => {
  it('sorts by days overdue, then amount; skips paid, cash and not yet due', () => {
    const a = inv({ due_date: '2026-10-20' })
    const b = inv({ due_date: '2026-10-01' })
    const c = inv({ due_date: '2026-10-20', totals: { gross: 9000, net: 0, vat: 0, lines: [] } })
    const paid = inv({ paid: true })
    const cash = inv({ payment_method: 'cash' })
    const future = inv({ due_date: '2026-11-10' })
    expect(overdueByUrgency([a, b, c, paid, cash, future], TODAY)).toEqual([b, c, a])
  })
})

describe('reminder proposals', () => {
  it('proposes after the due date, pauses 7 days, stops after 3', () => {
    expect(reminderDue(inv({}), TODAY)).toBe(true)
    expect(reminderDue(inv({ reminder_count: 1, last_reminder_at: '2026-10-30' }), TODAY)).toBe(false)
    expect(reminderDue(inv({ reminder_count: 1, last_reminder_at: '2026-10-26' }), TODAY)).toBe(true)
    expect(reminderDue(inv({ reminder_count: 3, last_reminder_at: '2026-10-01' }), TODAY)).toBe(false)
    expect(reminderDue(inv({ status: 'cancelled' }), TODAY)).toBe(false)
  })
  it('escalates politely', () => {
    expect(levelTitle(nextLevel(inv({})))).toBe('Zahlungserinnerung')
    expect(levelTitle(nextLevel(inv({ reminder_count: 1 })))).toBe('1. Mahnung')
    expect(levelTitle(nextLevel(inv({ reminder_count: 2 })))).toBe('2. Mahnung')
    const text = proposeReminderText(inv({}), 1, '2026-11-09')
    expect(text).toContain('Guten Tag Frau Berg')
    expect(text).toContain('RE-2026-0001')
    expect(text).toContain('09.11.2026')
    expect(text).toMatch(/50,00\s€/)
    const reception = proposeReminderText(inv({ customer: { company_name: 'Hotel Krone', name: 'Rezeption', street: '', zip: '', city: '', email: '', vat_id: '' } }), 1, '2026-11-09')
    expect(reception).toContain('Sehr geehrte Damen und Herren')
  })
})
