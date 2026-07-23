import { describe, expect, it } from 'vitest'
import { farmBrewerySpurStyle } from './route-style'

describe('farmBrewerySpurStyle', () => {
  it('paints a built rail link in the rail colour, not canal', () => {
    // Regression: the spur used to hardcode the canal stroke (#4e9c96) whenever
    // the corridor was linked, so a rail-era rail link rendered canal.
    const style = farmBrewerySpurStyle('rail')
    expect(style.stroke).toBe('#c2632f')
    expect(style.stroke).not.toBe('#4e9c96')
    expect(style.strokeDasharray).toBeUndefined()
  })

  it('paints a built canal link in the canal colour', () => {
    const style = farmBrewerySpurStyle('canal')
    expect(style.stroke).toBe('#4e9c96')
    expect(style.strokeDasharray).toBeUndefined()
  })

  it('shows an era-neutral dashed potential hint when unbuilt', () => {
    const style = farmBrewerySpurStyle(null)
    expect(style.stroke).toBe('#7a8b3d')
    // never a real canal / rail link graphic
    expect(style.stroke).not.toBe('#4e9c96')
    expect(style.stroke).not.toBe('#c2632f')
    expect(style.strokeDasharray).toBe('4 5')
  })
})
