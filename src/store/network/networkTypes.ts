import type { CityId } from '../../data/board'

export interface NetworkLink {
  from: CityId
  to: CityId
  era: 'canal' | 'rail'
  playerId: string
}

export interface NetworkValidationResult {
  isValid: boolean
  errorMessage?: string
}
