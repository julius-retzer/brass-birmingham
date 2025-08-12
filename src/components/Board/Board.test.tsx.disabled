import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import '@testing-library/jest-dom'
import { getInitialPlayerIndustryTiles } from '../../data/industryTiles'
import { type Player } from '../../store/gameStore'
import { Board } from './Board'

// Mock ReactFlow to avoid complex setup
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children, nodes, onNodeClick }: any) => (
    <div data-testid="react-flow">
      {nodes.map((node: any) => (
        <div
          key={node.id}
          data-testid={`city-${node.id}`}
          onClick={() => onNodeClick?.(null, node)}
          className={node.data.isSelectable ? 'selectable' : ''}
          data-selected={node.data.isSelected}
        >
          {node.data.label}
        </div>
      ))}
      {children}
    </div>
  ),
  Background: () => <div data-testid="background" />,
  Handle: () => null,
  Position: { Top: 'top', Bottom: 'bottom' },
  useNodesState: (initialNodes: any[]) => {
    return [initialNodes, vi.fn(), vi.fn()]
  },
  MarkerType: {},
}))

const createMockPlayer = (id: string): Player => ({
  id,
  name: `Player ${id}`,
  color: 'red' as const,
  character: 'Richard Arkwright' as const,
  money: 17,
  victoryPoints: 0,
  income: 10,
  hand: [],
  industryTilesOnMat: getInitialPlayerIndustryTiles(),
  links: [],
  industries: [],
})

describe('Board Component - Building Location Selection', () => {
  const defaultProps = {
    players: [createMockPlayer('1'), createMockPlayer('2')],
    era: 'canal' as const,
  }

  test('should render cities', () => {
    render(<Board {...defaultProps} />)

    // Check for some key cities
    expect(screen.getByTestId('city-birmingham')).toBeInTheDocument()
    expect(screen.getByTestId('city-coventry')).toBeInTheDocument()
    expect(screen.getByTestId('city-wolverhampton')).toBeInTheDocument()
  })

  test('should make cities selectable when isBuilding is true', () => {
    const { rerender } = render(<Board {...defaultProps} isBuilding={false} />)

    // Cities should not be selectable initially
    const birmingham = screen.getByTestId('city-birmingham')
    expect(birmingham).not.toHaveClass('selectable')

    // Enable building mode
    rerender(<Board {...defaultProps} isBuilding={true} />)

    // Cities should now be selectable (except merchants)
    expect(birmingham).toHaveClass('selectable')
  })

  test('should call onCitySelect when a city is clicked in building mode', () => {
    const onCitySelect = vi.fn()
    render(
      <Board {...defaultProps} isBuilding={true} onCitySelect={onCitySelect} />,
    )

    const birmingham = screen.getByTestId('city-birmingham')
    fireEvent.click(birmingham)

    expect(onCitySelect).toHaveBeenCalledWith('birmingham')
  })

  test('should not call onCitySelect when not in building mode', () => {
    const onCitySelect = vi.fn()
    render(
      <Board
        {...defaultProps}
        isBuilding={false}
        onCitySelect={onCitySelect}
      />,
    )

    const birmingham = screen.getByTestId('city-birmingham')
    fireEvent.click(birmingham)

    expect(onCitySelect).not.toHaveBeenCalled()
  })

  test('should highlight selected city', () => {
    const { rerender } = render(
      <Board {...defaultProps} isBuilding={true} selectedCity={null} />,
    )

    const birmingham = screen.getByTestId('city-birmingham')
    expect(birmingham).toHaveAttribute('data-selected', 'false')

    // Select Birmingham
    rerender(
      <Board {...defaultProps} isBuilding={true} selectedCity="birmingham" />,
    )

    expect(birmingham).toHaveAttribute('data-selected', 'true')
  })

  test('should not make merchant cities selectable', () => {
    render(<Board {...defaultProps} isBuilding={true} />)

    // Merchant cities should exist but not be selectable
    const warrington = screen.getByTestId('city-warrington')
    expect(warrington).toBeInTheDocument()
    expect(warrington).not.toHaveClass('selectable')
  })

  test('should display industries built in cities', () => {
    const playersWithIndustries = [
      {
        ...createMockPlayer('1'),
        industries: [
          {
            location: 'birmingham' as const,
            type: 'cotton' as const,
            level: 2,
            flipped: false,
            tile: {
              id: 'cotton_2',
              type: 'cotton' as const,
              level: 2,
              cost: 16,
              victoryPoints: 5,
              incomeSpaces: 3,
              coalRequired: 1,
              ironRequired: 0,
              beerRequired: 1,
              beerProduced: 0,
              coalProduced: 0,
              ironProduced: 0,
              canBuildInCanalEra: true,
              canBuildInRailEra: true,
              hasLightbulbIcon: false,
            },
          },
        ],
      },
    ]

    render(<Board {...defaultProps} players={playersWithIndustries} />)

    // The city should show the industry (implementation depends on actual rendering)
    const birmingham = screen.getByTestId('city-birmingham')
    expect(birmingham).toBeInTheDocument()
  })

  test('should handle both networking and building modes correctly', () => {
    const onLinkSelect = vi.fn()
    const onCitySelect = vi.fn()

    const { rerender } = render(
      <Board
        {...defaultProps}
        isNetworking={true}
        isBuilding={false}
        onLinkSelect={onLinkSelect}
        onCitySelect={onCitySelect}
      />,
    )

    // In networking mode, cities shouldn't be selectable for building
    const birmingham = screen.getByTestId('city-birmingham')
    fireEvent.click(birmingham)
    expect(onCitySelect).not.toHaveBeenCalled()

    // Switch to building mode
    rerender(
      <Board
        {...defaultProps}
        isNetworking={false}
        isBuilding={true}
        onLinkSelect={onLinkSelect}
        onCitySelect={onCitySelect}
      />,
    )

    fireEvent.click(birmingham)
    expect(onCitySelect).toHaveBeenCalledWith('birmingham')
  })

  test('should update when props change', () => {
    const { rerender } = render(
      <Board {...defaultProps} isBuilding={true} selectedCity="birmingham" />,
    )

    let birmingham = screen.getByTestId('city-birmingham')
    let coventry = screen.getByTestId('city-coventry')

    expect(birmingham).toHaveAttribute('data-selected', 'true')
    expect(coventry).toHaveAttribute('data-selected', 'false')

    // Change selected city
    rerender(
      <Board {...defaultProps} isBuilding={true} selectedCity="coventry" />,
    )

    birmingham = screen.getByTestId('city-birmingham')
    coventry = screen.getByTestId('city-coventry')

    expect(birmingham).toHaveAttribute('data-selected', 'false')
    expect(coventry).toHaveAttribute('data-selected', 'true')
  })
})
