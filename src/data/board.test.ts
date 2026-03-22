import { describe, it, expect } from 'vitest'
import { cities, connections, cityIndustrySlots } from './board'

describe('board data', () => {
  describe('city industry slots', () => {
    it('Birmingham has exactly 4 slots: [cotton,manufacturer], [manufacturer], [iron], [manufacturer]', () => {
      const slots = cityIndustrySlots.birmingham
      expect(slots).toHaveLength(4)
      expect(slots[0]).toEqual(['cotton', 'manufacturer'])
      expect(slots[1]).toEqual(['manufacturer'])
      expect(slots[2]).toEqual(['iron'])
      expect(slots[3]).toEqual(['manufacturer'])
    })

    it('Coventry has exactly 3 slots: [pottery], [manufacturer,coal], [iron,manufacturer]', () => {
      const slots = cityIndustrySlots.coventry
      expect(slots).toHaveLength(3)
      expect(slots[0]).toEqual(['pottery'])
      expect(slots[1]).toEqual(['manufacturer', 'coal'])
      expect(slots[2]).toEqual(['iron', 'manufacturer'])
    })

    it('Dudley has exactly 2 slots: [coal], [iron] (NO brewery slot)', () => {
      const slots = cityIndustrySlots.dudley
      expect(slots).toHaveLength(2)
      expect(slots[0]).toEqual(['coal'])
      expect(slots[1]).toEqual(['iron'])
    })

    it('Wolverhampton has exactly 2 slots: [manufacturer], [manufacturer,coal]', () => {
      const slots = cityIndustrySlots.wolverhampton
      expect(slots).toHaveLength(2)
      expect(slots[0]).toEqual(['manufacturer'])
      expect(slots[1]).toEqual(['manufacturer', 'coal'])
    })

    it('Walsall has exactly 2 slots: [iron,manufacturer], [manufacturer,brewery]', () => {
      const slots = cityIndustrySlots.walsall
      expect(slots).toHaveLength(2)
      expect(slots[0]).toEqual(['iron', 'manufacturer'])
      expect(slots[1]).toEqual(['manufacturer', 'brewery'])
    })

    it('Redditch has exactly 2 slots: [manufacturer,coal], [iron]', () => {
      const slots = cityIndustrySlots.redditch
      expect(slots).toHaveLength(2)
      expect(slots[0]).toEqual(['manufacturer', 'coal'])
      expect(slots[1]).toEqual(['iron'])
    })

    it('Worcester has exactly 2 slots: [cotton], [cotton]', () => {
      const slots = cityIndustrySlots.worcester
      expect(slots).toHaveLength(2)
      expect(slots[0]).toEqual(['cotton'])
      expect(slots[1]).toEqual(['cotton'])
    })

    it('Kidderminster has exactly 2 slots: [cotton,coal], [cotton]', () => {
      const slots = cityIndustrySlots.kidderminster
      expect(slots).toHaveLength(2)
      expect(slots[0]).toEqual(['cotton', 'coal'])
      expect(slots[1]).toEqual(['cotton'])
    })

    it('Cannock has exactly 2 slots: [manufacturer,coal], [coal]', () => {
      const slots = cityIndustrySlots.cannock
      expect(slots).toHaveLength(2)
      expect(slots[0]).toEqual(['manufacturer', 'coal'])
      expect(slots[1]).toEqual(['coal'])
    })

    it('Tamworth has exactly 2 slots: [cotton,coal], [cotton,coal]', () => {
      const slots = cityIndustrySlots.tamworth
      expect(slots).toHaveLength(2)
      expect(slots[0]).toEqual(['cotton', 'coal'])
      expect(slots[1]).toEqual(['cotton', 'coal'])
    })

    it('Nuneaton has exactly 2 slots: [manufacturer,brewery], [cotton,coal]', () => {
      const slots = cityIndustrySlots.nuneaton
      expect(slots).toHaveLength(2)
      expect(slots[0]).toEqual(['manufacturer', 'brewery'])
      expect(slots[1]).toEqual(['cotton', 'coal'])
    })

    it('Coalbrookdale has exactly 3 slots: [iron,brewery], [iron], [coal]', () => {
      const slots = cityIndustrySlots.coalbrookdale
      expect(slots).toHaveLength(3)
      expect(slots[0]).toEqual(['iron', 'brewery'])
      expect(slots[1]).toEqual(['iron'])
      expect(slots[2]).toEqual(['coal'])
    })

    it('Stone has exactly 2 slots: [cotton,brewery], [manufacturer,coal]', () => {
      const slots = cityIndustrySlots.stone
      expect(slots).toHaveLength(2)
      expect(slots[0]).toEqual(['cotton', 'brewery'])
      expect(slots[1]).toEqual(['manufacturer', 'coal'])
    })

    it('Stafford has exactly 2 slots: [manufacturer,brewery], [pottery]', () => {
      const slots = cityIndustrySlots.stafford
      expect(slots).toHaveLength(2)
      expect(slots[0]).toEqual(['manufacturer', 'brewery'])
      expect(slots[1]).toEqual(['pottery'])
    })

    it('Stoke has exactly 3 slots: [cotton,manufacturer], [pottery,iron], [manufacturer]', () => {
      const slots = cityIndustrySlots.stoke
      expect(slots).toHaveLength(3)
      expect(slots[0]).toEqual(['cotton', 'manufacturer'])
      expect(slots[1]).toEqual(['pottery', 'iron'])
      expect(slots[2]).toEqual(['manufacturer'])
    })

    it('Leek has exactly 2 slots: [cotton,manufacturer], [cotton,coal]', () => {
      const slots = cityIndustrySlots.leek
      expect(slots).toHaveLength(2)
      expect(slots[0]).toEqual(['cotton', 'manufacturer'])
      expect(slots[1]).toEqual(['cotton', 'coal'])
    })

    it('Uttoxeter has exactly 2 slots: [manufacturer,brewery], [cotton,brewery]', () => {
      const slots = cityIndustrySlots.uttoxeter
      expect(slots).toHaveLength(2)
      expect(slots[0]).toEqual(['manufacturer', 'brewery'])
      expect(slots[1]).toEqual(['cotton', 'brewery'])
    })

    it('Burton has exactly 2 slots: [manufacturer,coal], [brewery]', () => {
      const slots = cityIndustrySlots.burton
      expect(slots).toHaveLength(2)
      expect(slots[0]).toEqual(['manufacturer', 'coal'])
      expect(slots[1]).toEqual(['brewery'])
    })

    it('Derby has exactly 3 slots: [cotton,brewery], [cotton,manufacturer], [iron]', () => {
      const slots = cityIndustrySlots.derby
      expect(slots).toHaveLength(3)
      expect(slots[0]).toEqual(['cotton', 'brewery'])
      expect(slots[1]).toEqual(['cotton', 'manufacturer'])
      expect(slots[2]).toEqual(['iron'])
    })

    it('Belper has exactly 3 slots: [cotton,manufacturer], [coal], [pottery]', () => {
      const slots = cityIndustrySlots.belper
      expect(slots).toHaveLength(3)
      expect(slots[0]).toEqual(['cotton', 'manufacturer'])
      expect(slots[1]).toEqual(['coal'])
      expect(slots[2]).toEqual(['pottery'])
    })

    it('farmBreweryNorth exists with 1 slot: [brewery]', () => {
      const slots = cityIndustrySlots.farmBreweryNorth
      expect(slots).toBeDefined()
      expect(slots).toHaveLength(1)
      expect(slots[0]).toEqual(['brewery'])
    })

    it('farmBrewerySouth exists with 1 slot: [brewery]', () => {
      const slots = cityIndustrySlots.farmBrewerySouth
      expect(slots).toBeDefined()
      expect(slots).toHaveLength(1)
      expect(slots[0]).toEqual(['brewery'])
    })
  })

  describe('connections', () => {
    function findConnection(from: string, to: string) {
      return connections.find(
        (c) =>
          (c.from === from && c.to === to) ||
          (c.from === to && c.to === from)
      )
    }

    it('Birmingham-Redditch connection is rail only', () => {
      const conn = findConnection('birmingham', 'redditch')
      expect(conn).toBeDefined()
      expect(conn!.types).toEqual(['rail'])
    })

    it('Birmingham-Nuneaton connection is rail only', () => {
      const conn = findConnection('birmingham', 'nuneaton')
      expect(conn).toBeDefined()
      expect(conn!.types).toEqual(['rail'])
    })

    it('Burton-Cannock connection is rail only', () => {
      const conn = findConnection('burton', 'cannock')
      expect(conn).toBeDefined()
      expect(conn!.types).toEqual(['rail'])
    })

    it('Burton-Walsall connection is canal only', () => {
      const conn = findConnection('burton', 'walsall')
      expect(conn).toBeDefined()
      expect(conn!.types).toEqual(['canal'])
    })

    it('Tamworth-Nuneaton connection has both canal and rail', () => {
      const conn = findConnection('tamworth', 'nuneaton')
      expect(conn).toBeDefined()
      expect(conn!.types).toContain('canal')
      expect(conn!.types).toContain('rail')
    })

    it('Tamworth-Walsall connection is rail only', () => {
      const conn = findConnection('tamworth', 'walsall')
      expect(conn).toBeDefined()
      expect(conn!.types).toEqual(['rail'])
    })

    it('Coventry-Nuneaton connection is rail only', () => {
      const conn = findConnection('coventry', 'nuneaton')
      expect(conn).toBeDefined()
      expect(conn!.types).toEqual(['rail'])
    })

    it('Coventry-Oxford connection does NOT exist', () => {
      const conn = findConnection('coventry', 'oxford')
      expect(conn).toBeUndefined()
    })

    it('Belper-Nottingham connection has both canal and rail', () => {
      const conn = findConnection('belper', 'nottingham')
      expect(conn).toBeDefined()
      expect(conn!.types).toContain('canal')
      expect(conn!.types).toContain('rail')
    })

    it('Gloucester-Oxford connection does NOT exist', () => {
      const conn = findConnection('gloucester', 'oxford')
      expect(conn).toBeUndefined()
    })

    it('Redditch-Worcester connection does NOT exist', () => {
      const conn = findConnection('redditch', 'worcester')
      expect(conn).toBeUndefined()
    })

    it('Cannock-Walsall connection has both canal and rail', () => {
      const conn = findConnection('cannock', 'walsall')
      expect(conn).toBeDefined()
      expect(conn!.types).toContain('canal')
      expect(conn!.types).toContain('rail')
    })

    it('farmBreweryNorth connects to Cannock and Walsall', () => {
      const connCannock = findConnection('farmBreweryNorth', 'cannock')
      const connWalsall = findConnection('farmBreweryNorth', 'walsall')
      expect(connCannock).toBeDefined()
      expect(connWalsall).toBeDefined()
    })

    it('farmBrewerySouth connects to Kidderminster and Worcester', () => {
      const connKidder = findConnection('farmBrewerySouth', 'kidderminster')
      const connWorcester = findConnection('farmBrewerySouth', 'worcester')
      expect(connKidder).toBeDefined()
      expect(connWorcester).toBeDefined()
    })
  })

  describe('city counts', () => {
    it('total city count is 22 (20 cities + 2 farm breweries)', () => {
      const cityEntries = Object.entries(cities).filter(
        ([, city]) => city.type === 'city'
      )
      expect(cityEntries).toHaveLength(22)
    })

    it('total merchant count is 5', () => {
      const merchantEntries = Object.entries(cities).filter(
        ([, city]) => city.type === 'merchant'
      )
      expect(merchantEntries).toHaveLength(5)
    })
  })
})
