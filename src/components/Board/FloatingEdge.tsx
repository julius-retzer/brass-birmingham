import { getBezierPath, useInternalNode } from '@xyflow/react';
import { getEdgeParams } from './edgeUtils';
import type { Player } from '../../store/gameStore';
import type { CityId } from '../../data/board';
import type { InternalNode } from './edgeUtils';
import { cn } from '../../lib/utils';

interface FloatingEdgeProps {
  id: string;
  source: string;
  target: string;
  markerEnd?: string;
  style?: React.CSSProperties;
  data?: {
    builtLinks: Array<{
      type: 'canal' | 'rail';
      player: Player;
      from: CityId;
      to: CityId;
    }>;
  };
}

export function FloatingEdge({ id, source, target, markerEnd, style, data }: FloatingEdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode?.measured?.width || !targetNode?.measured?.width) {
    return null;
  }

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(
    sourceNode as InternalNode,
    targetNode as InternalNode
  );

  const [edgePath] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetPosition: targetPos,
    targetX: tx,
    targetY: ty,
  });

  const midX = (sx + tx) / 2;
  const midY = (sy + ty) / 2;

  const builtLinks = data?.builtLinks ?? [];

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
        style={style}
      />
      {builtLinks.length > 0 && (
        <g transform={`translate(${midX - (builtLinks.length * 16) / 2}, ${midY - 8})`}>
          {builtLinks.map((link, i) => (
            <circle
              key={i}
              cx={i * 16 + 8}
              cy={8}
              r={7}
              className={cn(
                {
                  'fill-red-500': link.player.color === 'red',
                  'fill-blue-500': link.player.color === 'blue',
                  'fill-green-500': link.player.color === 'green',
                  'fill-yellow-400': link.player.color === 'yellow',
                  'fill-purple-500': link.player.color === 'purple',
                  'fill-orange-500': link.player.color === 'orange',
                },
                'stroke-background stroke-2'
              )}
            >
              <title>{`${link.player.name}'s ${link.type} link`}</title>
            </circle>
          ))}
        </g>
      )}
    </>
  );
}