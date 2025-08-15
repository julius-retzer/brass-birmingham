import {
  Background,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  Position,
  ReactFlow,
  useNodesState,
} from '@xyflow/react'
import {
  type City,
  type CityId,
  type ConnectionType,
  cities,
  cityIndustrySlots,
  connections,
} from '../../data/board'
import { Card } from '../ui/card'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect } from 'react'
import { cn } from '../../lib/utils'
import { type Player, type GameState } from '../../store/gameStore'
import { canCityAccommodateIndustryType } from '../../store/shared/gameUtils'
import { SelectionFeedback } from '../game/SelectionFeedback'
import { FloatingEdge } from './FloatingEdge'

// Types
interface BoardProps {
  isNetworking?: boolean
  isBuilding?: boolean
  era?: 'canal' | 'rail'
  onLinkSelect?: (from: CityId, to: CityId) => void
  onCitySelect?: (cityId: CityId) => void
  selectedLink?: { from: CityId; to: CityId } | null
  selectedCity?: CityId | null
  players: Player[]
  currentPlayerIndex?: number
  selectedIndustryType?: string | null
  selectedCard?: { id: string, type: 'location' | 'industry' | 'wild_location' | 'wild_industry', location?: CityId } | null
  gameContext?: GameState
  showSelectionFeedback?: boolean
}

interface CityNodeProps {
  data: {
    label: string
    type: City['type']
    id: string
    isSelected: boolean
    isSelectable: boolean
    onSelect?: () => void
    players: Player[]
    isInCurrentPlayerNetwork?: boolean
    isConnectedToCurrentPlayer?: boolean
    currentPlayerIndex?: number
  }
}

interface LinkEdgeData extends Record<string, unknown> {
  connection: (typeof connections)[number]
  builtLinks: Array<{
    type: 'canal' | 'rail'
    player: Player
    from: CityId
    to: CityId
  }>
}

// Constants
const CITY_SIZES = {
  merchant: {
    width: 120,
    height: 80,
  },
  regular: {
    width: 110,
    height: 85, // Increased height to accommodate larger industry slots
  },
} as const

// Components
function CityNode({ data }: CityNodeProps) {
  const size =
    data.type === 'merchant' ? CITY_SIZES.merchant : CITY_SIZES.regular
  const isMerchant = data.type === 'merchant'

  // Find industries built in this city
  const industriesInCity =
    data.players?.flatMap((player) =>
      player.industries
        .filter((industry) => industry.location === data.id)
        .map((industry) => ({ ...industry, playerColor: player.color })),
    ) || []

  // Get current player's industries in this city
  const currentPlayerIndustries =
    data.currentPlayerIndex !== undefined
      ? data.players[data.currentPlayerIndex]?.industries.filter(
          (industry) => industry.location === data.id,
        ) || []
      : []

  const getIndustryColor = (type: string) => {
    const colors = {
      cotton: '#ec4899', // pink
      coal: '#6b7280', // gray
      iron: '#f97316', // orange
      manufacturer: '#3b82f6', // blue
      pottery: '#eab308', // yellow
      brewery: '#22c55e', // green
    }
    return colors[type as keyof typeof colors] || '#6b7280'
  }

  // Get available industry slots for this city (now each slot can have multiple industry options)
  const availableSlots = cityIndustrySlots[data.id as CityId] || []

  // Always show slots if they exist - we'll handle occupied vs available in the rendering
  const showIndustrySlots = true

  return (
    <>
      <Handle
        type="source"
        position={Position.Top}
        id={`${data.id}-handle`}
        style={{ visibility: 'hidden' }}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id={`${data.id}-handle`}
        style={{ visibility: 'hidden' }}
      />
      <div
        className={cn(
          'relative flex flex-col items-center justify-center rounded-md border-2 shadow-sm transition-all cursor-pointer',
          isMerchant
            ? 'bg-secondary border-secondary'
            : 'bg-primary border-primary',
          data.isSelected && 'ring-2 ring-yellow-400 ring-offset-2',
          data.isSelectable &&
            'hover:scale-105 hover:shadow-md hover:ring-2 hover:ring-blue-300 hover:ring-offset-1',
          !data.isSelectable && !isMerchant && 'cursor-not-allowed',
          // Network highlighting
          data.isInCurrentPlayerNetwork &&
            !isMerchant &&
            'ring-2 ring-blue-400 ring-offset-1',
          data.isConnectedToCurrentPlayer &&
            !isMerchant &&
            'border-blue-400 bg-blue-100',
          // Current player industries highlighting
          currentPlayerIndustries.length > 0 &&
            'ring-2 ring-green-400 ring-offset-1',
          // Network restrictions - show cities outside network as faded
          !data.isInCurrentPlayerNetwork &&
            !isMerchant &&
            data.isSelectable === false &&
            'bg-gray-300 border-gray-400',
          // Enhanced feedback for invalid selections
          !data.isSelectable &&
            data.isSelected &&
            'ring-2 ring-red-400 ring-offset-2',
        )}
        style={{ width: size.width, height: size.height }}
        onClick={data.isSelectable ? data.onSelect : undefined}
        title={
          data.isSelectable
            ? `Click to select ${data.label}`
            : !isMerchant
              ? !data.isInCurrentPlayerNetwork
                ? `${data.label} - Not in your network (need industry or link connection)`
                : `${data.label} - Not available for current action`
              : data.label
        }
      >
        <span className="text-xs font-medium text-center text-background mb-1">
          {data.label}
        </span>

        {/* Industry slots - showing both occupied and available */}
        {availableSlots.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5 justify-items-center mb-2 px-1 max-w-[100px]">
            {availableSlots.map((slotOptions, slotIndex) => {
              // Find if this slot is occupied using the same logic as canCityAccommodateIndustryType
              const occupiedIndustry = (() => {
                // Create a mapping of which slot each industry occupies
                // We assign industries to slots in the order they were built,
                // choosing the first compatible available slot
                const slotAssignments = new Map<number, typeof industriesInCity[0]>()
                
                for (const industry of industriesInCity) {
                  // Find the first available slot that can accommodate this industry
                  for (let i = 0; i < availableSlots.length; i++) {
                    if (slotAssignments.has(i)) {
                      continue // This slot is already occupied
                    }
                    
                    const options = availableSlots[i]
                    if (options && options.includes(industry.type as any)) {
                      slotAssignments.set(i, industry)
                      break
                    }
                  }
                }
                
                // Return the industry assigned to this specific slot
                return slotAssignments.get(slotIndex) || null
              })()

              return (
                <div key={`slot-${slotIndex}`} className="relative">
                  {occupiedIndustry ? (
                    // Slot is occupied - show the built industry
                    <div
                      className="w-9 h-7 rounded-sm border-2 border-solid flex items-center justify-center shadow-lg"
                      style={{
                        borderColor: occupiedIndustry.playerColor,
                        backgroundColor: getIndustryColor(
                          occupiedIndustry.type,
                        ),
                      }}
                      title={`${occupiedIndustry.type} Level ${occupiedIndustry.level} ${occupiedIndustry.flipped ? '(Flipped)' : ''}`}
                    >
                      <span className="text-[10px] font-bold text-white drop-shadow-md">
                        {occupiedIndustry.level}
                      </span>
                    </div>
                  ) : // Slot is empty - show available options (always visible)
                  slotOptions.length === 1 && slotOptions[0] ? (
                    // Single industry option
                    <div
                      className={cn(
                        'w-9 h-7 rounded-sm border-2 flex items-center justify-center shadow-sm bg-white',
                        data.isSelectable ? 'border-solid' : 'border-dashed opacity-75',
                      )}
                      style={{
                        borderColor: getIndustryColor(slotOptions[0]),
                      }}
                      title={`Available ${slotOptions[0]} slot`}
                    >
                      <span 
                        className="text-[9px] font-bold drop-shadow-sm"
                        style={{
                          color: getIndustryColor(slotOptions[0]),
                        }}
                      >
                        {slotOptions[0] === 'manufacturer'
                          ? 'MFG'
                          : slotOptions[0] === 'brewery'
                            ? 'BRE'
                            : slotOptions[0] === 'pottery'
                              ? 'POT'
                              : slotOptions[0] === 'cotton'
                                ? 'COT'
                                : slotOptions[0].toUpperCase().slice(0, 3)}
                      </span>
                    </div>
                  ) : slotOptions.length > 1 ? (
                    // Multiple industry options - split the slot visually
                    <div
                      className={cn(
                        'w-9 h-7 rounded-sm border-2 border-gray-500 flex shadow-sm overflow-hidden bg-white',
                        data.isSelectable ? 'border-solid' : 'border-dashed opacity-75',
                      )}
                      title={`Available slot: ${slotOptions.join(' or ')}`}
                    >
                      {slotOptions.map((industryType, optionIndex) => (
                        <div
                          key={`${industryType}-${optionIndex}`}
                          className="flex-1 flex items-center justify-center border-r last:border-r-0 border-gray-300"
                        >
                          <span 
                            className="text-[7px] font-bold drop-shadow-sm"
                            style={{
                              color: getIndustryColor(industryType),
                            }}
                          >
                            {industryType === 'manufacturer'
                              ? 'M'
                              : industryType === 'brewery'
                                ? 'B'
                                : industryType === 'pottery'
                                  ? 'P'
                                  : industryType === 'cotton'
                                    ? 'C'
                                    : industryType === 'coal'
                                      ? 'CO'
                                      : industryType === 'iron'
                                        ? 'I'
                                        : industryType.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}

        {/* Overflow indicator for extra industries beyond available slots */}
        {industriesInCity.length > availableSlots.length && (
          <div className="flex justify-center mt-1">
            <div className="w-6 h-4 rounded-sm bg-gray-400 border border-white text-xs flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-[6px]">
                +{industriesInCity.length - availableSlots.length}
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// Helpers
function hasConnectionType(
  types: readonly ConnectionType[],
  type: ConnectionType,
): boolean {
  return types.includes(type)
}

function findBuiltLinks(
  connection: (typeof connections)[number],
  players: Player[],
) {
  return players.flatMap((player) =>
    player.links
      .filter(
        (link) =>
          (link.from === connection.from && link.to === connection.to) ||
          (link.from === connection.to && link.to === connection.from),
      )
      .map((link) => ({ ...link, player })),
  )
}

function getEdges({
  isNetworking,
  era,
  selectedLink,
  players,
}: BoardProps): Edge[] {
  const baseStyle: React.CSSProperties = {
    strokeWidth: 3,
    cursor: isNetworking ? 'pointer' : 'default',
  }

  const hoverStyle = isNetworking
    ? ' hover:opacity-80 hover:[&>path]:stroke-[6px] transition-all'
    : ''

  return connections.flatMap((connection) => {
    const hasCanal = hasConnectionType(connection.types, 'canal')
    const hasRail = hasConnectionType(connection.types, 'rail')
    const isSelected =
      selectedLink?.from === connection.from &&
      selectedLink?.to === connection.to
    const builtLinks = findBuiltLinks(connection, players)

    if (isNetworking && era) {
      if ((era === 'canal' && !hasCanal) || (era === 'rail' && !hasRail)) {
        return []
      }
    }

    const commonEdgeProps = {
      source: connection.from,
      target: connection.to,
      type: 'floating' as const,
      style: baseStyle,
      data: { connection, builtLinks },
      sourceHandle: `${connection.from}-handle`,
      targetHandle: `${connection.to}-handle`,
    }

    if (hasCanal && hasRail) {
      return [
        {
          ...commonEdgeProps,
          id: `${connection.from}-${connection.to}-canal`,
          className: cn(
            '[&>path]:stroke-blue-600',
            isSelected && '[&>path]:stroke-[4px]',
            hoverStyle,
          ),
          style: { ...baseStyle, transform: 'translate(-3px, -3px)' },
        },
        {
          ...commonEdgeProps,
          id: `${connection.from}-${connection.to}-rail`,
          className: cn(
            '[&>path]:stroke-orange-600',
            isSelected && '[&>path]:stroke-[4px]',
            hoverStyle,
          ),
          style: { ...baseStyle, transform: 'translate(3px, 3px)' },
        },
      ]
    }

    return [
      {
        ...commonEdgeProps,
        id: `${connection.from}-${connection.to}`,
        className: cn(
          hasCanal ? '[&>path]:stroke-blue-600' : '[&>path]:stroke-orange-600',
          isSelected && '[&>path]:stroke-[4px]',
          hoverStyle,
        ),
      },
    ]
  })
}

// Helper function to check if a city can accommodate the selected industry type
function canCityAccommodateIndustry(
  cityId: CityId,
  industryType: string,
  players: Player[],
): boolean {
  const availableSlots = cityIndustrySlots[cityId] || []

  // Find industries built in this city
  const industriesInCity = players.flatMap((player) =>
    player.industries.filter((industry) => industry.location === cityId),
  )

  // Create a mapping of which slot each industry occupies
  // We assign industries to slots in the order they were built, 
  // choosing the first compatible available slot
  const occupiedSlots = new Set<number>()
  
  for (const industry of industriesInCity) {
    // Find the first available slot that can accommodate this industry
    for (let slotIndex = 0; slotIndex < availableSlots.length; slotIndex++) {
      if (occupiedSlots.has(slotIndex)) {
        continue // This slot is already occupied
      }
      
      const slotOptions = availableSlots[slotIndex]
      if (slotOptions && slotOptions.includes(industry.type as any)) {
        occupiedSlots.add(slotIndex)
        break
      }
    }
  }
  
  // Now check if the requested industry type can find an available slot
  for (let slotIndex = 0; slotIndex < availableSlots.length; slotIndex++) {
    if (occupiedSlots.has(slotIndex)) {
      continue // This slot is already occupied
    }
    
    const slotOptions = availableSlots[slotIndex]
    if (slotOptions && slotOptions.includes(industryType)) {
      return true // Found an available compatible slot
    }
  }
  
  return false // No available slots can accommodate this industry type
}

// Helper function to determine if a city is in the current player's network
function getCityNetworkInfo(
  cityId: CityId,
  currentPlayerIndex: number,
  players: Player[],
) {
  if (currentPlayerIndex < 0 || currentPlayerIndex >= players.length) {
    return { isInNetwork: false, isConnected: false }
  }

  const currentPlayer = players[currentPlayerIndex]
  if (!currentPlayer) {
    return { isInNetwork: false, isConnected: false }
  }

  // Exception: If player has no tiles on board, can build anywhere (game rules)
  if (currentPlayer.industries.length === 0 && currentPlayer.links.length === 0) {
    return { isInNetwork: true, isConnected: true }
  }

  // A location is part of your network if:
  // 1. It contains one or more of your industry tiles
  const hasPlayerIndustry = currentPlayer.industries.some(
    (industry) => industry.location === cityId,
  )

  // 2. It is adjacent to one or more of your link tiles
  const playerLocations = new Set<CityId>()

  // Add locations with player's industries
  currentPlayer.industries.forEach((industry) => {
    playerLocations.add(industry.location)
  })

  // Add locations adjacent to player's links
  currentPlayer.links.forEach((link) => {
    playerLocations.add(link.from)
    playerLocations.add(link.to)
  })

  const isInNetwork = playerLocations.has(cityId)
  const isConnected = hasPlayerIndustry || isInNetwork

  return { isInNetwork, isConnected }
}

// Main component
export function Board({
  isNetworking = false,
  isBuilding = false,
  era,
  onLinkSelect,
  onCitySelect,
  selectedLink,
  selectedCity,
  players,
  currentPlayerIndex = 0,
  selectedIndustryType = null,
  selectedCard = null,
  gameContext,
  showSelectionFeedback = false,
}: BoardProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)

  // Update nodes when props change
  useEffect(() => {
    setNodes((prevNodes) =>
      prevNodes.map((node) => {
        const networkInfo = getCityNetworkInfo(
          node.id as CityId,
          currentPlayerIndex,
          players,
        )

        // Determine if city is selectable for building
        let isSelectable = false
        if (isBuilding && node.data.type === 'city') {
          // First check if city can accommodate the industry type (if selected)
          let canAccommodateIndustry = true
          if (selectedIndustryType && gameContext) {
            canAccommodateIndustry = canCityAccommodateIndustryType(
              gameContext,
              node.id as CityId,
              selectedIndustryType as any
            )
          } else if (selectedIndustryType) {
            // Fallback to old function if no gameContext
            canAccommodateIndustry = canCityAccommodateIndustry(node.id as CityId, selectedIndustryType, players)
          }

          // Then check network restrictions based on card type
          let isInValidNetwork = true
          if (selectedCard) {
            if (selectedCard.type === 'location') {
              // Location cards can build anywhere, even outside network
              isInValidNetwork = selectedCard.location === node.id
            } else if (selectedCard.type === 'wild_location') {
              // Wild location cards can build anywhere
              isInValidNetwork = true
            } else if (selectedCard.type === 'industry' || selectedCard.type === 'wild_industry') {
              // Industry cards must build in player's network
              isInValidNetwork = networkInfo.isInNetwork
            }
          } else {
            // No card selected yet - show all valid cities in network
            isInValidNetwork = networkInfo.isInNetwork
          }

          isSelectable = canAccommodateIndustry && isInValidNetwork
        }

        return {
          ...node,
          data: {
            ...node.data,
            isSelected: selectedCity === node.id,
            isSelectable,
            isInCurrentPlayerNetwork: networkInfo.isInNetwork,
            isConnectedToCurrentPlayer: networkInfo.isConnected,
            currentPlayerIndex,
            onSelect: () => onCitySelect?.(node.id as CityId),
            players,
          },
        }
      }),
    )
  }, [
    selectedCity,
    isBuilding,
    selectedIndustryType,
    selectedCard,
    gameContext,
    players,
    currentPlayerIndex,
    onCitySelect,
    setNodes,
  ])

  const onNodeDrag = useCallback(() => {
    if (process.env.NODE_ENV === 'development') {
      const newPositions = nodes.reduce(
        (acc, node) => ({
          ...acc,
          [node.id]: {
            x: Math.round(node.position.x / 10),
            y: Math.round(node.position.y / 10),
          },
        }),
        {} as Record<string, { x: number; y: number }>,
      )
      console.log('New positions:', JSON.stringify(newPositions, null, 2))
    }
  }, [nodes])

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      if (!isNetworking || !onLinkSelect || !edge.data) return
      const data = edge.data as LinkEdgeData
      onLinkSelect(data.connection.from, data.connection.to)
    },
    [isNetworking, onLinkSelect],
  )

  // Get selection feedback information
  const getSelectionFeedback = () => {
    if (!showSelectionFeedback) return null

    if (isBuilding && selectedIndustryType) {
      const validCities = Object.keys(cities).filter((cityId) =>
        canCityAccommodateIndustry(
          cityId as CityId,
          selectedIndustryType,
          players,
        ),
      )

      if (selectedCity) {
        const isValid = canCityAccommodateIndustry(
          selectedCity,
          selectedIndustryType,
          players,
        )
        return {
          selectionType: 'city' as const,
          isValid,
          message: isValid
            ? `Building ${selectedIndustryType} at ${cities[selectedCity]?.name}`
            : `Cannot build ${selectedIndustryType} here`,
          hint: isValid
            ? 'Click to confirm location'
            : 'This location has no available slots for this industry type',
        }
      } else {
        return {
          selectionType: 'city' as const,
          isValid: true,
          message: `Select location for ${selectedIndustryType}`,
          selectedCount: 0,
          requiredCount: 1,
          hint: `${validCities.length} cities available for ${selectedIndustryType}`,
        }
      }
    }

    if (isNetworking && era) {
      const availableConnections = connections.filter(
        (conn) =>
          (era === 'canal' && hasConnectionType(conn.types, 'canal')) ||
          (era === 'rail' && hasConnectionType(conn.types, 'rail')),
      )

      if (selectedLink) {
        const connectionExists = availableConnections.some(
          (conn) =>
            (conn.from === selectedLink.from && conn.to === selectedLink.to) ||
            (conn.from === selectedLink.to && conn.to === selectedLink.from),
        )

        return {
          selectionType: 'link' as const,
          isValid: connectionExists,
          message: connectionExists
            ? `Building ${era} link: ${cities[selectedLink.from]?.name} ↔ ${cities[selectedLink.to]?.name}`
            : 'Invalid connection',
          hint: connectionExists
            ? `Cost: £${era === 'canal' ? '3' : '5'}${era === 'rail' ? ' + coal' : ''}`
            : 'This connection is not available in the current era',
        }
      } else {
        return {
          selectionType: 'link' as const,
          isValid: true,
          message: `Select ${era} connection to build`,
          selectedCount: 0,
          requiredCount: 1,
          hint: `${availableConnections.length} connections available`,
        }
      }
    }

    return null
  }

  const selectionFeedback = getSelectionFeedback()

  return (
    <div className="space-y-4">
      {/* Selection Feedback */}
      {selectionFeedback && <SelectionFeedback {...selectionFeedback} />}

      {/* Game Board */}
      <Card className="relative w-full aspect-square">
        <div className="absolute inset-0">
          <ReactFlow
            nodes={nodes}
            edges={getEdges({ isNetworking, era, selectedLink, players })}
            nodeTypes={{ cityNode: CityNode }}
            edgeTypes={{ floating: FloatingEdge }}
            onNodesChange={onNodesChange}
            onNodeDrag={onNodeDrag}
            onEdgeClick={onEdgeClick}
            fitView
            panOnScroll
            panOnDrag
            className="bg-background"
          >
            <Background />
          </ReactFlow>
        </div>
      </Card>
    </div>
  )
}

// Adjusted positions with more spacing to accommodate larger city tiles
const cityPositions: Record<CityId, { x: number; y: number }> = {
  // Central Cities - more spread out
  birmingham: { x: 50, y: 50 },
  coventry: { x: 80, y: 55 },
  dudley: { x: 30, y: 55 },
  wolverhampton: { x: 25, y: 30 },
  walsall: { x: 45, y: 32 },

  // Northern Cities - increased vertical and horizontal spacing
  stone: { x: 40, y: 10 },
  stafford: { x: 35, y: 20 },
  stoke: { x: 45, y: 0 },
  leek: { x: 60, y: 0 },
  uttoxeter: { x: 60, y: 18 },
  burton: { x: 70, y: 28 },
  derby: { x: 75, y: 15 },
  belper: { x: 90, y: 10 },

  // Southern Cities - more spread out
  redditch: { x: 45, y: 75 },
  worcester: { x: 25, y: 85 },
  kidderminster: { x: 18, y: 65 },
  cannock: { x: 35, y: 25 },
  tamworth: { x: 65, y: 40 },
  nuneaton: { x: 75, y: 48 },
  coalbrookdale: { x: 10, y: 40 },

  // Merchants (External) - pushed further out
  warrington: { x: 45, y: -10 },
  gloucester: { x: 20, y: 95 },
  oxford: { x: 95, y: 65 },
  nottingham: { x: 95, y: 5 },
  shrewsbury: { x: 0, y: 40 },
}

// Initial positions based on the actual game board layout
const initialNodes: Node[] = Object.entries(cities).map(([id, city]) => ({
  id,
  type: 'cityNode',
  position: {
    x: cityPositions[id as CityId].x * 10,
    y: cityPositions[id as CityId].y * 10,
  },
  data: {
    label: city.name,
    type: city.type,
    id,
    isSelected: false,
    isSelectable: false,
    onSelect: undefined,
    players: [],
  },
  draggable: true,
}))
