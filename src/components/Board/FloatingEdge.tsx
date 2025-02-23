import { getBezierPath, useInternalNode } from '@xyflow/react';
import { getEdgeParams } from './edgeUtils';
import type { Player } from '../../store/gameStore';
import type { CityId } from '../../data/board';
import type { InternalNode } from './edgeUtils';

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
        <g transform={`translate(${midX - (builtLinks.length * 6) / 2}, ${midY - 3})`}>
          {builtLinks.map((link, i) => (
            <circle
              key={i}
              cx={i * 6 + 3}
              cy={3}
              r={10}
              className={link.type === 'canal' ? 'fill-blue-500' : 'fill-orange-500'}
            >
              <title>{`${link.player.name}'s ${link.type} link`}</title>
            </circle>
          ))}
        </g>
      )}
    </>
  );
}