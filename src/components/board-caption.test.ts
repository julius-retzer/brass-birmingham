import { describe, expect, it } from 'vitest'
import type { GameState } from '~/store/gameStore'
import { boardCaption } from './board-caption'

const stateAt = (step: string, context: Partial<GameState> = {}) => ({
  matches: (path: never) => (path as string) === step,
  context: context as GameState,
})

const none = { legalCities: null, legalLinks: null, sourceCities: null }

describe('boardCaption', () => {
  it('narrates the site pick with the tile name and legal count', () => {
    const caption = boardCaption(
      stateAt('playing.action.building.selectingLocation', {
        selectedIndustryTile: { type: 'cotton' } as never,
      }),
      { ...none, legalCities: new Set(['birmingham', 'coventry']) },
    )
    expect(caption).toBe('Choose a site for your cotton — 2 legal cities')
  })

  it('renames manufacturer to goods works and singularizes one city', () => {
    const caption = boardCaption(
      stateAt('playing.action.building.selectingLocation', {
        selectedIndustryTile: { type: 'manufacturer' } as never,
      }),
      { ...none, legalCities: new Set(['birmingham']) },
    )
    expect(caption).toBe('Choose a site for your goods works — 1 legal city')
  })

  it('narrates the route pick with the era and available count', () => {
    const caption = boardCaption(
      stateAt('playing.action.networking.selectingLink', { era: 'canal' }),
      { ...none, legalLinks: new Set(['a|b', 'b|a', 'c|d', 'd|c']) },
    )
    expect(caption).toBe('Choose a canal route — 2 available')
  })

  it('narrates the second rail link as such', () => {
    const caption = boardCaption(
      stateAt('playing.action.networking.selectingSecondLink', {
        era: 'rail',
      }),
      { ...none, legalLinks: new Set(['a|b', 'b|a']) },
    )
    expect(caption).toBe('Choose a second rail route — 1 available')
  })

  it.each([
    ['playing.action.selling.choosingBeerSource', 'beer source'],
    ['playing.action.networking.choosingDoubleLinkBeer', 'beer source'],
    ['playing.action.building.choosingIronSource', 'iron works'],
    ['playing.action.developing.choosingIronSource', 'iron works'],
    ['playing.action.building.choosingCoalSource', 'coal mine'],
    ['playing.action.networking.choosingLinkCoal', 'coal mine'],
    ['playing.action.networking.choosingDoubleLinkCoal', 'coal mine'],
  ])('captions the source step %s', (step, noun) => {
    const caption = boardCaption(stateAt(step), {
      ...none,
      sourceCities: new Set(['stone', 'stafford']),
    })
    expect(caption).toBe(
      `Choose ${noun === 'iron works' ? 'an' : 'a'} ${noun} — 2 lit on the map`,
    )
  })

  it('shows nothing for a source step whose candidates are not on the board', () => {
    // Market-only iron lights no city; a bystander's filtered view is null.
    expect(
      boardCaption(stateAt('playing.action.building.choosingIronSource'), {
        ...none,
        sourceCities: null,
      }),
    ).toBeNull()
  })

  it('shows nothing when the next tap is not on the board', () => {
    for (const step of [
      'playing.action.selectingAction',
      'playing.action.building.confirmingBuild',
      'playing.action.selling.selectingSale',
    ]) {
      expect(boardCaption(stateAt(step), none)).toBeNull()
    }
  })
})
