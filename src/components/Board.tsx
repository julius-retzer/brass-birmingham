import { cities, connections, type CityId, type City, type ConnectionType } from '../data/board';
import { Card } from './ui/card';
import { ReactFlow, Background, type Node, type Edge, Handle, Position, useNodesState, BaseEdge, EdgeLabelRenderer } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback } from 'react';
import { type Player, type Link } from '../store/gameStore';

// Custom node component for cities
function CityNode({ data }: { data: { label: string; type: City['type'] } }) {
  const size = data.type === 'merchant' ? 55 : 50;

  return (
    <>
      <Handle type="target" position={Position.Top} />

      <div
        className={`flex items-center justify-center rounded-full border-2 transition-colors ${
          data.type === 'merchant'
            ? 'bg-secondary/20 border-secondary hover:bg-secondary/30'
            : 'bg-primary/20 border-primary hover:bg-primary/30'
        }`}
        style={{
          width: size,
          height: size,
        }}
      >
        <span className="text-xs font-medium text-center">
          {data.label}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </>
  );
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
};

// Initial positions based on the actual game board layout
const initialNodes: Node[] = Object.entries(cities).map(([id, city]) => ({
  id,
  type: 'cityNode',
  position: {
    x: cityPositions[id as CityId].x * 10,
    y: cityPositions[id as CityId].y * 10
  },
  data: {
    label: city.name,
    type: city.type
  },
  draggable: true,
}));

// Helper function to check connection types
function hasConnectionType(types: readonly ConnectionType[], type: ConnectionType): boolean {
  return types.includes(type);
}

interface BoardProps {
  isNetworking: boolean;
  era: 'canal' | 'rail';
  onLinkSelect?: (from: CityId, to: CityId) => void;
  selectedLink: { from: CityId; to: CityId } | null;
  players: Player[];
}

// Helper function to find built links on a connection
function findBuiltLinks(connection: typeof connections[number], players: Player[]): Array<Link & { player: Player }> {
  return players.flatMap(player =>
    connection.types.map(type => {
      const linkType = type === 'canal' ? ('canal' as const) : ('rail' as const);
      return {
        playerId: player.id,
        from: connection.from,
        to: connection.to,
        type: linkType,
        player
      };
    })
  );
}

interface LinkEdgeData {
  connection: typeof connections[number];
  builtLinks: Array<Link & { player: Player }>;
}

interface LinkEdgeProps {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  style?: React.CSSProperties;
  markerEnd?: string;
  data: LinkEdgeData;
}

// Custom edge component for links
function LinkEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  markerEnd,
  data
}: LinkEdgeProps) {
  const { connection, builtLinks } = data;
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;

  return (
    <>
      <BaseEdge
        id={id}
        path={`M ${sourceX} ${sourceY} L ${targetX} ${targetY}`}
        style={{
          ...style,
          strokeWidth: style.strokeWidth ?? 2,
          stroke: style.stroke ?? 'currentColor',
        }}
        markerEnd={markerEnd}
      />
      {builtLinks.length > 0 && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${midX}px,${midY}px)`,
              pointerEvents: 'all',
              backgroundColor: 'var(--background)',
              padding: '2px 4px',
              borderRadius: '4px',
              opacity: 0.9,
            }}
            className="nodrag nopan flex gap-1"
          >
            {builtLinks.map((link, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full ${
                  link.type === 'canal' ? 'bg-blue-500' : 'bg-orange-500'
                }`}
                title={`${link.player.name}'s ${link.type} link`}
              />
            ))}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// Node types and edge types configuration
const nodeTypes = {
  cityNode: CityNode,
};

const edgeTypes = {
  linkEdge: LinkEdge,
};

// Convert our connections to ReactFlow edges
function getEdges(
  isNetworking: boolean,
  era: 'canal' | 'rail',
  selectedLink: { from: CityId; to: CityId } | null,
  players: Player[]
): Edge[] {
  return connections.map((connection) => {
    const builtLinks = findBuiltLinks(connection, players);
    const isSelected = selectedLink
      ? (selectedLink.from === connection.from && selectedLink.to === connection.to) ||
        (selectedLink.from === connection.to && selectedLink.to === connection.from)
      : false;

    const isAvailable = isNetworking && (connection.types as readonly string[]).includes(era);

    const hasCanal = hasConnectionType(connection.types, 'canal');
    const hasRail = hasConnectionType(connection.types, 'rail');

    // Determine the edge style based on the connection type
    const edgeStyle: React.CSSProperties = {
      strokeWidth: isSelected ? 4 : 2,
      stroke: hasCanal && hasRail
        ? era === 'canal' ? '#3b82f6' : '#f97316'  // blue for canal, orange for rail
        : hasCanal ? '#3b82f6' : '#f97316',
      opacity: isAvailable ? 1 : 0.3,
    };

    return {
      id: `${connection.from}-${connection.to}`,
      source: connection.from,
      target: connection.to,
      type: 'linkEdge',
      data: {
        connection,
        builtLinks,
      },
      style: edgeStyle,
      className: isSelected ? 'selected' : isAvailable ? 'available' : undefined,
    };
  });
}

export function Board({ isNetworking, era, onLinkSelect, selectedLink, players }: BoardProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);

  const onNodeDrag = useCallback(() => {
    // Log the new positions to help with updating the initial positions
    const newPositions = nodes.reduce((acc, node) => {
      acc[node.id] = {
        x: Math.round(node.position.x / 10),
        y: Math.round(node.position.y / 10)
      };
      return acc;
    }, {} as Record<string, { x: number; y: number }>);

    console.log('New positions:', JSON.stringify(newPositions, null, 2));
  }, [nodes]);

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    if (!isNetworking || !onLinkSelect) return;

    const connection = (edge.data as { connection: typeof connections[number] }).connection;
    onLinkSelect(connection.from, connection.to);
  }, [isNetworking, onLinkSelect]);

  const edges = getEdges(isNetworking, era, selectedLink, players);

  return (
    <Card className="relative w-full aspect-square">
      <div className="absolute inset-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
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
  );
}