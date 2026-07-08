import { describe, expect, it } from 'vitest'
import { aggregateAdvanceStatus, isValidLayout } from './advance'

describe('aggregateAdvanceStatus [C §6.6]', () => {
  it('gol → not_started (fără icon)', () => {
    expect(aggregateAdvanceStatus([])).toBe('not_started')
  })
  it('toate not_started → not_started', () => {
    expect(aggregateAdvanceStatus(['not_started', 'not_started'])).toBe(
      'not_started',
    )
  })
  it('unul în lucru → in_progress (pie)', () => {
    expect(aggregateAdvanceStatus(['not_started', 'in_progress'])).toBe(
      'in_progress',
    )
  })
  it('unele done, restul nu → in_progress (pie), NU done', () => {
    expect(aggregateAdvanceStatus(['done', 'not_started'])).toBe('in_progress')
  })
  it('TOATE done → done (check)', () => {
    expect(aggregateAdvanceStatus(['done', 'done'])).toBe('done')
  })
})

describe('isValidLayout', () => {
  it('acceptă cele 3 tipuri de itemi (field/title/schedule_row)', () => {
    expect(
      isValidLayout([
        { type: 'field', key: 'production.dimensions' },
        { type: 'title', title: 'Audio', description: 'PA specs' },
        { type: 'schedule_row', schedule_item_id: 'abc' },
      ]),
    ).toBe(true)
  })
  it('respinge itemi necunoscuți sau malformați', () => {
    expect(isValidLayout([{ type: 'field' }])).toBe(false)
    expect(isValidLayout([{ type: 'hack', x: 1 }])).toBe(false)
    expect(isValidLayout('nu-e-array')).toBe(false)
    expect(isValidLayout([null])).toBe(false)
  })
})
