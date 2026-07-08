/**
 * SURSA UNICĂ DE ADEVĂR pentru permisiuni (blueprint §4).
 *
 * Orice verificare din UI, server actions sau route handlers trece prin
 * `can()`. Politicile RLS folosesc oglinda SQL din schema `private`
 * (migrația 00002) — ierarhia de aici și `private.permission_rank()`
 * trebuie ținute identice.
 *
 * Celulele marcate [D] în §4.2 (accounting nu editează conținut de tur;
 * manager poate crea tururi) sunt implementate ca în tabel și se
 * ajustează AICI dacă trialul Eventric le infirmă.
 */

export type OrgPermission =
  | 'administrator'
  | 'accounting'
  | 'manager'
  | 'gl_manage_all'
  | 'gl_view_all_submit'
  | 'gl_submit'
  | 'mobile_access'

export type UserTier = 'free' | 'pro'

export type Capability =
  | 'view_itinerary'
  | 'bypass_visibility'
  | 'edit_tour_content'
  | 'view_accounting'
  | 'edit_accounting'
  | 'manage_users'
  | 'gl_submit_request'
  | 'gl_view_all'
  | 'gl_manage'
  | 'gl_override_cutoff'
  | 'manage_tours'
  | 'send_push'

export interface PermissionContext {
  tier: UserTier
  /** Permisiunea în organizația curentă; null = nu e membru. */
  permission: OrgPermission | null
}

/** Rank mic = putere mare. Oglinda exactă a private.permission_rank(). */
export const PERMISSION_RANK: Record<OrgPermission, number> = {
  administrator: 1,
  accounting: 2,
  manager: 3,
  gl_manage_all: 4,
  gl_view_all_submit: 5,
  gl_submit: 6,
  mobile_access: 7,
}

/** true dacă `permission` e cel puțin la fel de puternică precum `min`. */
export function hasMinPermission(
  permission: OrgPermission | null,
  min: OrgPermission,
): boolean {
  if (permission === null) return false
  return PERMISSION_RANK[permission] <= PERMISSION_RANK[min]
}

type Grant = boolean | 'pro' // 'pro' = ✔* în §4.2 (cere user_tier 'pro')

/** Matricea §4.2, transcrisă literal. */
const CAPABILITY_MATRIX: Record<
  Capability,
  Partial<Record<OrgPermission, Grant>>
> = {
  // Toți membrii văd itinerariul (filtrat de visibility).
  view_itinerary: {
    administrator: true,
    accounting: true,
    manager: true,
    gl_manage_all: true,
    gl_view_all_submit: true,
    gl_submit: true,
    mobile_access: true,
  },
  // [C] doar admin/accounting/manager văd itemii restricționați.
  bypass_visibility: { administrator: true, accounting: true, manager: true },
  // [D] accounting NU editează conținut de tur.
  edit_tour_content: { administrator: 'pro', manager: 'pro' },
  // [C] manager NU vede Accounting.
  view_accounting: { administrator: true, accounting: true },
  edit_accounting: { administrator: 'pro', accounting: 'pro' },
  // [C] doar administrator gestionează Users.
  manage_users: { administrator: true },
  gl_submit_request: {
    administrator: true,
    accounting: true,
    manager: true,
    gl_manage_all: true,
    gl_view_all_submit: true,
    gl_submit: true,
  },
  // [C] gl_submit vede DOAR requesturile proprii.
  gl_view_all: {
    administrator: true,
    accounting: true,
    manager: true,
    gl_manage_all: true,
    gl_view_all_submit: true,
  },
  gl_manage: {
    administrator: true,
    accounting: true,
    manager: true,
    gl_manage_all: true,
  },
  // [C] submit după cutoff/lock/allotment atins.
  gl_override_cutoff: {
    administrator: true,
    accounting: true,
    manager: true,
    gl_manage_all: true,
  },
  // [D] manager poate crea/șterge tururi.
  manage_tours: { administrator: 'pro', manager: 'pro' },
  // [C] Professional users trimit push.
  send_push: { administrator: 'pro', accounting: 'pro', manager: 'pro' },
}

export function can(ctx: PermissionContext, capability: Capability): boolean {
  if (ctx.permission === null) return false
  const grant = CAPABILITY_MATRIX[capability][ctx.permission]
  if (grant === undefined || grant === false) return false
  if (grant === 'pro') return ctx.tier === 'pro'
  return true
}
