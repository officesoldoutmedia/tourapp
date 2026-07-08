import { describe, expect, it } from 'vitest'
import {
  can,
  hasMinPermission,
  PERMISSION_RANK,
  type Capability,
  type OrgPermission,
} from './permissions'

// Transcrierea EXACTĂ a matricei din blueprint §4.2.
// Valoare: true | false | 'pro' (✔* = doar cu user_tier 'pro').
const MATRIX: Record<Capability, Record<OrgPermission, boolean | 'pro'>> = {
  view_itinerary: {
    administrator: true,
    accounting: true,
    manager: true,
    gl_manage_all: true,
    gl_view_all_submit: true,
    gl_submit: true,
    mobile_access: true,
  },
  bypass_visibility: {
    administrator: true,
    accounting: true,
    manager: true,
    gl_manage_all: false,
    gl_view_all_submit: false,
    gl_submit: false,
    mobile_access: false,
  },
  edit_tour_content: {
    administrator: 'pro',
    accounting: false, // [D]
    manager: 'pro',
    gl_manage_all: false,
    gl_view_all_submit: false,
    gl_submit: false,
    mobile_access: false,
  },
  view_accounting: {
    administrator: true,
    accounting: true,
    manager: false, // [C]
    gl_manage_all: false,
    gl_view_all_submit: false,
    gl_submit: false,
    mobile_access: false,
  },
  edit_accounting: {
    administrator: 'pro',
    accounting: 'pro',
    manager: false, // [C]
    gl_manage_all: false,
    gl_view_all_submit: false,
    gl_submit: false,
    mobile_access: false,
  },
  manage_users: {
    administrator: true,
    accounting: false,
    manager: false, // [C]
    gl_manage_all: false,
    gl_view_all_submit: false,
    gl_submit: false,
    mobile_access: false,
  },
  gl_submit_request: {
    administrator: true,
    accounting: true,
    manager: true,
    gl_manage_all: true,
    gl_view_all_submit: true,
    gl_submit: true,
    mobile_access: false,
  },
  gl_view_all: {
    administrator: true,
    accounting: true,
    manager: true,
    gl_manage_all: true,
    gl_view_all_submit: true,
    gl_submit: false, // doar ale lui [C]
    mobile_access: false,
  },
  gl_manage: {
    administrator: true,
    accounting: true,
    manager: true,
    gl_manage_all: true,
    gl_view_all_submit: false,
    gl_submit: false,
    mobile_access: false,
  },
  gl_override_cutoff: {
    administrator: true,
    accounting: true,
    manager: true,
    gl_manage_all: true,
    gl_view_all_submit: false,
    gl_submit: false,
    mobile_access: false,
  },
  manage_tours: {
    administrator: 'pro',
    accounting: false,
    manager: 'pro', // [D]
    gl_manage_all: false,
    gl_view_all_submit: false,
    gl_submit: false,
    mobile_access: false,
  },
  send_push: {
    administrator: 'pro',
    accounting: 'pro',
    manager: 'pro',
    gl_manage_all: false,
    gl_view_all_submit: false,
    gl_submit: false,
    mobile_access: false,
  },
}

const PERMISSIONS = Object.keys(MATRIX.view_itinerary) as OrgPermission[]
const CAPABILITIES = Object.keys(MATRIX) as Capability[]

describe('can() — matricea completă §4.2', () => {
  for (const capability of CAPABILITIES) {
    for (const permission of PERMISSIONS) {
      const cell = MATRIX[capability][permission]
      const expectPro = cell === 'pro' || cell === true
      const expectFree = cell === true

      it(`${capability} / ${permission} / pro → ${expectPro}`, () => {
        expect(can({ tier: 'pro', permission }, capability)).toBe(expectPro)
      })
      it(`${capability} / ${permission} / free → ${expectFree}`, () => {
        expect(can({ tier: 'free', permission }, capability)).toBe(expectFree)
      })
    }
  }

  it('non-membru (permission null) nu poate nimic', () => {
    for (const capability of CAPABILITIES) {
      expect(can({ tier: 'pro', permission: null }, capability)).toBe(false)
    }
  })
})

describe('hasMinPermission — ierarhia §4.2 (oglinda private.has_min_permission)', () => {
  it('ordinea rank-urilor e strict crescătoare', () => {
    const ordered: OrgPermission[] = [
      'administrator',
      'accounting',
      'manager',
      'gl_manage_all',
      'gl_view_all_submit',
      'gl_submit',
      'mobile_access',
    ]
    for (let i = 1; i < ordered.length; i++) {
      expect(PERMISSION_RANK[ordered[i - 1]]).toBeLessThan(
        PERMISSION_RANK[ordered[i]],
      )
    }
  })

  it('administrator ≥ manager; gl_submit < manager; egalitate OK', () => {
    expect(hasMinPermission('administrator', 'manager')).toBe(true)
    expect(hasMinPermission('gl_submit', 'manager')).toBe(false)
    expect(hasMinPermission('manager', 'manager')).toBe(true)
    expect(hasMinPermission(null, 'mobile_access')).toBe(false)
  })
})
