import { type IndustryType } from '../../data/cards';
import { cn } from '../../lib/utils';

interface IndustryIconProps {
  type: IndustryType;
  className?: string;
}

export function IndustryIcon({ type, className }: IndustryIconProps) {
  return (
    <div
      className={cn(
        'w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-medium',
        type === 'cotton' && 'bg-blue-500',
        type === 'coal' && 'bg-black',
        type === 'iron' && 'bg-orange-600',
        type === 'manufacturer' && 'bg-yellow-500',
        type === 'pottery' && 'bg-purple-500',
        type === 'brewery' && 'bg-amber-700',
        className
      )}
      title={type.charAt(0).toUpperCase() + type.slice(1)}
    >
      {type.charAt(0).toUpperCase()}
    </div>
  );
}