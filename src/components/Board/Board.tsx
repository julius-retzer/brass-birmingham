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
  connections,
} from '../../data/board'
import { Card } from '../ui/card'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect } from 'react'
import { cn } from '../../lib/utils'
import { type Player } from '../../store/gameStore'
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
    width: 100,
    height: 70,
  },
  regular: {
    width: 90,
    height: 60,
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
            ? 'bg-secondary border-secondary/50'
            : 'bg-primary border-primary/50',
          data.isSelected && 'ring-2 ring-yellow-400 ring-offset-2',
          data.isSelectable && 'hover:scale-105 hover:shadow-md',
          !data.isSelectable && !isMerchant && 'opacity-70 cursor-not-allowed',
        )}
        style={{ width: size.width, height: size.height }}
        onClick={data.isSelectable ? data.onSelect : undefined}
      >
        <span className="text-xs font-medium text-center text-background mb-1">
          {data.label}
        </span>

        {/* Industry buildings */}
        {industriesInCity.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-center">
            {industriesInCity.slice(0, 4).map((industry, index) => (
              <div
                key={index}
                className="w-3 h-3 rounded-sm border border-white/50 text-xs flex items-center justify-center"
                style={{
                  backgroundColor: getIndustryColor(industry.type),
                  borderColor: industry.playerColor,
                }}
                title={`${industry.type} L${industry.level} ${industry.flipped ? '(Flipped)' : ''}`}
              >
                <span className="text-white font-bold text-[8px]">
                  {industry.level}
                </span>
              </div>
            ))}
            {industriesInCity.length > 4 && (
              <div className="w-3 h-3 rounded-sm bg-gray-400 border border-white/50 text-xs flex items-center justify-center">
                <span className="text-white font-bold text-[6px]">
                  +{industriesInCity.length - 4}
                </span>
              </div>
            )}
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
          ),
          style: { ...baseStyle, transform: 'translate(-3px, -3px)' },
        },
        {
          ...commonEdgeProps,
          id: `${connection.from}-${connection.to}-rail`,
          className: cn(
            '[&>path]:stroke-orange-600',
            isSelected && '[&>path]:stroke-[4px]',
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
        ),
      },
    ]
  })
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
}: BoardProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)

  // Update nodes when props change
  useEffect(() => {
    setNodes((prevNodes) =>
      prevNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isSelected: selectedCity === node.id,
          isSelectable: isBuilding && node.data.type === 'city',
          onSelect: () => onCitySelect?.(node.id as CityId),
          players,
        },
      })),
    )
  }, [selectedCity, isBuilding, players, onCitySelect, setNodes])

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

  return (
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
  )
}

// Approximate positions based on the actual game board layout
const cityPositions: Record<CityId, { x: number; y: number }> = {
  // Central Cities
  birmingham: { x: 50, y: 50 },
  coventry: { x: 70, y: 50 },
  dudley: { x: 35, y: 50 },
  wolverhampton: { x: 30, y: 35 },
  walsall: { x: 40, y: 35 },

  // Northern Cities
  stone: { x: 45, y: 15 },
  stafford: { x: 40, y: 25 },
  stoke: { x: 45, y: 5 },
  leek: { x: 55, y: 5 },
  uttoxeter: { x: 55, y: 20 },
  burton: { x: 60, y: 30 },
  derby: { x: 65, y: 20 },
  belper: { x: 75, y: 15 },

  // Southern Cities
  redditch: { x: 45, y: 65 },
  worcester: { x: 30, y: 75 },
  kidderminster: { x: 25, y: 60 },
  cannock: { x: 35, y: 30 },
  tamworth: { x: 55, y: 40 },
  nuneaton: { x: 65, y: 45 },
  coalbrookdale: { x: 15, y: 45 },

  // Merchants (External)
  warrington: { x: 45, y: -5 },
  gloucester: { x: 25, y: 85 },
  oxford: { x: 85, y: 60 },
  nottingham: { x: 85, y: 10 },
  shrewsbury: { x: 5, y: 45 },
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
