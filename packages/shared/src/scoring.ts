// Knock-score v1 — pure scoring function used by the territory module.
// Module: shared. See docs/DESIGN.md §13 for the rationale and weights.

export type RoofOrientation = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'unknown'

export interface ParcelInputs {
  /** True if the owner of record lives at the property. */
  ownerOccupied: boolean | null
  /** Estimated annual solar production at this address, in kWh. */
  estAnnualKwh: number | null
  /** Best-guess primary roof face. */
  roofOrientation: RoofOrientation | null
  /** True if the parcel already has a solar permit / array. Hard exclusion. */
  hasExistingSolar: boolean
  /** Most recent assessed home value, USD. */
  assessedValue: number | null
  /** Year the home was built. */
  yearBuilt: number | null
  /** Count of solar permits within 0.25 mi over the last 24 months. */
  neighborPermitCount: number
  /** True if the local utility filed a rate hike in the last 12 months. */
  recentRateHike: boolean
  /** True if the property changed hands in the last 18 months. */
  recentlySold: boolean
}

export interface ScoreResult {
  /** 0–100 score, or null when the parcel is excluded (existing solar). */
  score: number | null
  /** Per-factor contribution. Empty when excluded. */
  factors: Record<string, number>
  /** Why the parcel was excluded, when applicable. */
  excludedReason?: 'existing_solar'
}

const ORIENTATION_WEIGHTS: Record<RoofOrientation, number> = {
  S: 15,
  SE: 10,
  SW: 10,
  E: 5,
  W: 5,
  N: 0,
  NE: 2,
  NW: 2,
  unknown: 5,
}

function ownerOccupiedScore(value: boolean | null): number {
  if (value === true) return 25
  if (value === false) return 0
  return 12
}

function annualKwhScore(kwh: number | null): number {
  if (kwh === null) return 0
  const min = 4000
  const max = 14000
  if (kwh <= min) return 0
  if (kwh >= max) return 20
  return Math.round(((kwh - min) / (max - min)) * 20)
}

function roofOrientationScore(o: RoofOrientation | null): number {
  if (o === null) return ORIENTATION_WEIGHTS.unknown
  return ORIENTATION_WEIGHTS[o]
}

function valueBracketScore(value: number | null): number {
  if (value === null) return 5
  if (value < 100_000 || value > 1_500_000) return 0
  if (value >= 200_000 && value <= 700_000) return 10
  return 5
}

function yearBuiltScore(year: number | null): number {
  if (year === null) return 2
  return year >= 1985 && year <= 2015 ? 5 : 2
}

function neighborPermitScore(count: number): number {
  if (count <= 0) return 0
  if (count === 1) return 5
  if (count === 2) return 10
  return 15
}

export function scoreParcel(input: ParcelInputs): ScoreResult {
  if (input.hasExistingSolar) {
    return { score: null, factors: {}, excludedReason: 'existing_solar' }
  }

  const factors = {
    ownerOccupied: ownerOccupiedScore(input.ownerOccupied),
    estAnnualKwh: annualKwhScore(input.estAnnualKwh),
    roofOrientation: roofOrientationScore(input.roofOrientation),
    valueBracket: valueBracketScore(input.assessedValue),
    yearBuilt: yearBuiltScore(input.yearBuilt),
    neighborPermits: neighborPermitScore(input.neighborPermitCount),
    rateHike: input.recentRateHike ? 5 : 0,
    recentlySold: input.recentlySold ? 5 : 0,
  }

  const score = Object.values(factors).reduce((sum, n) => sum + n, 0)

  return { score: Math.max(0, Math.min(100, score)), factors }
}
