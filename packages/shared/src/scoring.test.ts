// Unit tests for the v1 knock-score function.
// Module: shared.

import { describe, expect, it } from 'vitest'
import { scoreParcel, type ParcelInputs } from './scoring'

const baseline: ParcelInputs = {
  ownerOccupied: true,
  estAnnualKwh: 9000, // mid-range → 10 of 20
  roofOrientation: 'S',
  hasExistingSolar: false,
  assessedValue: 350_000,
  yearBuilt: 2000,
  neighborPermitCount: 0,
  recentRateHike: false,
  recentlySold: false,
}

describe('scoreParcel', () => {
  it('hard-excludes parcels with existing solar', () => {
    const result = scoreParcel({ ...baseline, hasExistingSolar: true })
    expect(result.score).toBeNull()
    expect(result.excludedReason).toBe('existing_solar')
  })

  it('produces the expected baseline score', () => {
    // 25 (owner) + 10 (kWh) + 15 (S) + 10 (value) + 5 (year) + 0 + 0 + 0 = 65
    expect(scoreParcel(baseline).score).toBe(65)
  })

  it('caps the score at 100 when every factor is maxed', () => {
    const result = scoreParcel({
      ownerOccupied: true,
      estAnnualKwh: 14000,
      roofOrientation: 'S',
      hasExistingSolar: false,
      assessedValue: 350_000,
      yearBuilt: 2000,
      neighborPermitCount: 5,
      recentRateHike: true,
      recentlySold: true,
    })
    expect(result.score).toBe(100)
  })

  it('floors the score at 0 when no factor contributes', () => {
    const result = scoreParcel({
      ownerOccupied: false,
      estAnnualKwh: 0,
      roofOrientation: 'N',
      hasExistingSolar: false,
      assessedValue: 50_000,
      yearBuilt: 1900,
      neighborPermitCount: 0,
      recentRateHike: false,
      recentlySold: false,
    })
    expect(result.score).toBe(2) // year_built fallback contributes 2
  })

  it('gives 12 for unknown owner-occupancy', () => {
    expect(scoreParcel({ ...baseline, ownerOccupied: null }).factors.ownerOccupied).toBe(12)
  })

  it('weights neighbor permits 0/5/10/15', () => {
    expect(scoreParcel({ ...baseline, neighborPermitCount: 0 }).factors.neighborPermits).toBe(0)
    expect(scoreParcel({ ...baseline, neighborPermitCount: 1 }).factors.neighborPermits).toBe(5)
    expect(scoreParcel({ ...baseline, neighborPermitCount: 2 }).factors.neighborPermits).toBe(10)
    expect(scoreParcel({ ...baseline, neighborPermitCount: 9 }).factors.neighborPermits).toBe(15)
  })

  it('rewards south-facing roofs the most', () => {
    const south = scoreParcel({ ...baseline, roofOrientation: 'S' }).factors.roofOrientation ?? 0
    const east = scoreParcel({ ...baseline, roofOrientation: 'E' }).factors.roofOrientation ?? 0
    const north = scoreParcel({ ...baseline, roofOrientation: 'N' }).factors.roofOrientation ?? 0
    expect(south).toBeGreaterThan(east)
    expect(east).toBeGreaterThan(north)
  })

  it('zeros out value-bracket score for very low or very high homes', () => {
    expect(scoreParcel({ ...baseline, assessedValue: 75_000 }).factors.valueBracket).toBe(0)
    expect(scoreParcel({ ...baseline, assessedValue: 2_000_000 }).factors.valueBracket).toBe(0)
  })
})
