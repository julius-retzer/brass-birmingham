import { cities, connections, type CityId, type City, type ConnectionType } from '../data/board';
import { Card } from './ui/card';
import { ReactFlow, Background, type Node, type Edge, Handle, Position, useNodesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback } from 'react';

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

// Convert our connections to ReactFlow edges
const edges: Edge[] = [...connections].flatMap((connection) => {
  const hasCanal = hasConnectionType(connection.types, 'canal');
  const hasRail = hasConnectionType(connection.types, 'rail');

  const baseStyle: React.CSSProperties = {
    strokeWidth: 3,
  };

  if (hasCanal && hasRail) {
    // Create two parallel edges for canal and rail
    return [
      {
        id: `${connection.from}-${connection.to}-canal`,
        source: connection.from,
        target: connection.to,
        type: 'default',
        className: '[&>path]:stroke-blue-600',
        style: {
          ...baseStyle,
          transform: 'translateY(-2px)',
        },
      },
      {
        id: `${connection.from}-${connection.to}-rail`,
        source: connection.from,
        target: connection.to,
        type: 'default',
        className: '[&>path]:stroke-orange-600',
        style: {
          ...baseStyle,
          transform: 'translateY(2px)',
        },
      },
    ];
  } else if (hasCanal) {
    // Canal only - solid blue line
    return [{
      id: `${connection.from}-${connection.to}`,
      source: connection.from,
      target: connection.to,
      type: 'default',
      className: '[&>path]:stroke-blue-600',
      style: baseStyle,
    }];
  } else {
    // Rail only - solid orange line
    return [{
      id: `${connection.from}-${connection.to}`,
      source: connection.from,
      target: connection.to,
      type: 'default',
      className: '[&>path]:stroke-orange-600',
      style: baseStyle,
    }];
  }
});

// Node types configuration
const nodeTypes = {
  cityNode: CityNode,
};

export function Board() {
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

  return (
    <Card className="relative w-full aspect-square">
      <div className="absolute inset-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDrag={onNodeDrag}
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