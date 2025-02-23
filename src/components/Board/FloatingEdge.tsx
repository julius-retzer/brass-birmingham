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
        <foreignObject
          width={100}
          height={40}
          x={midX - 50}
          y={midY - 20}
          className="edgebutton-foreignobject"
          requiredExtensions="http://www.w3.org/1999/xhtml"
        >
          <div className="flex gap-1 bg-background/80 rounded px-1 py-0.5">
            {builtLinks.map((link, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full ${
                  link.type === 'canal' ? 'bg-blue-500' : 'bg-orange-500'
                }`}
                title={`${link.player.name}'s ${link.type} link`}
              />
            ))}
          </div>
        </foreignObject>
      )}
    </>
  );
}