import { cities, connections, type CityId, type City, type ConnectionType } from '../data/board';
import { Card } from './ui/card';
import { ReactFlow, Background, type Node, type Edge, Handle, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

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

// Convert our city positions to ReactFlow format
const nodes: Node[] = Object.entries(cities).map(([id, city]) => ({
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
}));

// Helper function to check connection types
function hasConnectionType(types: readonly ConnectionType[], type: ConnectionType): boolean {
  return types.includes(type);
}

// Convert our connections to ReactFlow edges
const edges: Edge[] = [...connections].map((connection) => {
  const hasCanal = hasConnectionType(connection.types, 'canal');
  const hasRail = hasConnectionType(connection.types, 'rail');

  let style: React.CSSProperties = {
    strokeWidth: 3,
  };

  let className = '';

  if (hasCanal && hasRail) {
    // Both canal and rail - dashed purple line
    className = '[&>path]:stroke-purple-500';
    style = {
      ...style,
      strokeDasharray: '8,4',
    };
  } else if (hasCanal) {
    // Canal only - solid blue line
    className = '[&>path]:stroke-blue-600';
  } else {
    // Rail only - solid orange line
    className = '[&>path]:stroke-orange-600';
  }

  return {
    id: `${connection.from}-${connection.to}`,
    source: connection.from,
    target: connection.to,
    type: 'default',
    className,
    style,
  };
});

// Node types configuration
const nodeTypes = {
  cityNode: CityNode,
};

export function Board() {
  return (
    <Card className="relative w-full aspect-square">
      <div className="absolute inset-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          panOnScroll
          selectionOnDrag={false}
          panOnDrag={false}
          className="bg-background"
        >
          <Background />
        </ReactFlow>
      </div>
    </Card>
  );
}