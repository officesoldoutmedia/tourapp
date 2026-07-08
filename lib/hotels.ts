/**
 * Extend stay / unlink (blueprint §6.8 [C]): hotelurile dintr-un
 * stay_group_id sunt LINKED — un edit pe unul se propagă pe toate.
 * Unlink = stay_group_id null → record independent.
 *
 * [D→DECISIONS] Room list-ul se COPIAZĂ la extend (cu tot cu câmpuri),
 * dar edițiile ulterioare pe room list sunt per-zi (blueprint leagă
 * explicit doar recordurile de hotel).
 */

/** Câmpurile care se propagă pe grupul de stay (nu day_id/sort_order/id). */
export const HOTEL_LINKED_FIELDS = [
  'name',
  'address_line1',
  'address_line2',
  'city',
  'state',
  'postal_code',
  'country',
  'lat',
  'lng',
  'phones',
  'emails',
  'urls',
  'google_place_id',
  'source',
  'party',
  'check_in_time',
  'check_out_time',
  'check_in_date',
  'check_out_date',
  'notes',
  'facilities',
] as const

export type HotelLinkedField = (typeof HOTEL_LINKED_FIELDS)[number]

/** Reține din patch doar câmpurile care au voie să se propage pe grup. */
export function pickLinkedFields(
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = new Set<string>(HOTEL_LINKED_FIELDS)
  return Object.fromEntries(
    Object.entries(patch).filter(([key]) => allowed.has(key)),
  )
}

/** Payload-ul de copiere la extend stay (recordul sursă → zi nouă). */
export function extendStayCopy(
  source: Record<string, unknown>,
  targetDayId: string,
  stayGroupId: string,
): Record<string, unknown> {
  const copy = pickLinkedFields(source)
  return { ...copy, day_id: targetDayId, stay_group_id: stayGroupId }
}
