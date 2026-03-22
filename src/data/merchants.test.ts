import { describe, it, expect } from 'vitest'
import { merchants, getMerchantsForPlayerCount } from './merchants'

describe('merchant definitions', () => {
  describe('getMerchantsForPlayerCount', () => {
    it('2-player game excludes warrington and nottingham', () => {
      const result = getMerchantsForPlayerCount(2)
      expect(result.warrington).toBeUndefined()
      expect(result.nottingham).toBeUndefined()
    })

    it('2-player game includes shrewsbury, gloucester, oxford', () => {
      const result = getMerchantsForPlayerCount(2)
      expect(result.shrewsbury).toBeDefined()
      expect(result.gloucester).toBeDefined()
      expect(result.oxford).toBeDefined()
    })

    it('3-player game excludes nottingham but includes warrington', () => {
      const result = getMerchantsForPlayerCount(3)
      expect(result.nottingham).toBeUndefined()
      expect(result.warrington).toBeDefined()
    })

    it('4-player game includes all 5 merchants', () => {
      const result = getMerchantsForPlayerCount(4)
      expect(Object.keys(result)).toHaveLength(5)
      expect(result.warrington).toBeDefined()
      expect(result.gloucester).toBeDefined()
      expect(result.oxford).toBeDefined()
      expect(result.nottingham).toBeDefined()
      expect(result.shrewsbury).toBeDefined()
    })
  })

  describe('merchant industries', () => {
    it('all merchants accept cotton, manufacturer, and pottery', () => {
      for (const [, merchant] of Object.entries(merchants)) {
        expect(merchant.industries).toContain('cotton')
        expect(merchant.industries).toContain('manufacturer')
        expect(merchant.industries).toContain('pottery')
      }
    })
  })
})
