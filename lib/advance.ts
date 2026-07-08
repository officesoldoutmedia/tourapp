/**
 * Advancing (blueprint §6.6). Layout-ul unui advance = listă ordonată de
 * itemi; valorile câmpurilor trăiesc în event_field_values (sync
 * bidirecțional cu Events tab by-design).
 */

export type AdvanceStatus = 'not_started' | 'in_progress' | 'done'

export type AdvanceLayoutItem =
  | { type: 'field'; key: string }
  | { type: 'title'; title: string; description?: string }
  | { type: 'schedule_row'; schedule_item_id: string } // [C-S v1.1]

/**
 * [C §6.6] Statusul agregat al unei zile din statusurile advance-urilor:
 * - nimic (not_started) dacă TOATE sunt not started
 * - pie (in_progress) dacă măcar unul e în lucru sau doar unele done
 * - check (done) dacă TOATE sunt done
 * Se aplică identic pe zi (toate advance-urile zilei) și pe event.
 */
export function aggregateAdvanceStatus(
  statuses: AdvanceStatus[],
): AdvanceStatus {
  if (statuses.length === 0) return 'not_started'
  if (statuses.every((s) => s === 'done')) return 'done'
  if (statuses.every((s) => s === 'not_started')) return 'not_started'
  return 'in_progress'
}

/** Validare minimă a layout-ului la salvare (formă, nu conținut). */
export function isValidLayout(value: unknown): value is AdvanceLayoutItem[] {
  if (!Array.isArray(value)) return false
  return value.every((item) => {
    if (typeof item !== 'object' || item === null) return false
    const it = item as Record<string, unknown>
    switch (it.type) {
      case 'field':
        return typeof it.key === 'string' && it.key.length > 0
      case 'title':
        return typeof it.title === 'string'
      case 'schedule_row':
        return typeof it.schedule_item_id === 'string'
      default:
        return false
    }
  })
}
