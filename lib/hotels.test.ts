import { describe, expect, it } from 'vitest'
import { extendStayCopy, pickLinkedFields } from './hotels'

describe('pickLinkedFields — ce se propagă pe grupul de stay [C §6.8]', () => {
  it('păstrează câmpurile de hotel, aruncă identitatea rândului', () => {
    const patch = {
      name: 'Hotel Beta',
      notes: 'late checkout',
      check_in_time: '15:00',
      facilities: { rate: '100 EUR' },
      // NU trebuie să treacă:
      id: 'x',
      day_id: 'y',
      sort_order: 5,
      stay_group_id: 'z',
      created_at: 'now',
      deleted_at: null,
    }
    expect(pickLinkedFields(patch)).toEqual({
      name: 'Hotel Beta',
      notes: 'late checkout',
      check_in_time: '15:00',
      facilities: { rate: '100 EUR' },
    })
  })
})

describe('extendStayCopy — copia pentru ziua următoare', () => {
  it('copiază câmpurile de hotel + setează day_id și stay_group_id', () => {
    const source = {
      id: 'h1',
      day_id: 'd1',
      sort_order: 3,
      stay_group_id: null,
      name: 'Hotel Beta',
      city: 'Cluj',
      urls: ['https://beta.ro'],
      check_in_date: '2026-07-19',
      check_out_date: '2026-07-22',
    }
    expect(extendStayCopy(source, 'd2', 'group-1')).toEqual({
      name: 'Hotel Beta',
      city: 'Cluj',
      urls: ['https://beta.ro'],
      check_in_date: '2026-07-19',
      check_out_date: '2026-07-22',
      day_id: 'd2',
      stay_group_id: 'group-1',
    })
  })
})
