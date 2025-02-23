import { useEffect, useRef } from 'react';
import { ScrollArea } from '../components/ui/scroll-area';
import { cn } from '../lib/utils';
import { type LogEntry } from '../store/gameStore';
interface GameLogProps {
  logs: LogEntry[];
}

export function GameLog({ logs }: GameLogProps) {
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <ScrollArea className="h-[400px]">
      <div ref={logContainerRef} className="space-y-2 pr-4">
        {logs.map((log, index) => (
          <div
            key={index}
            className={cn(
              'text-sm rounded p-2',
              log.type === 'system' && 'text-muted-foreground bg-muted/50',
              log.type === 'action' && 'text-primary bg-primary/10',
              log.type === 'info' && 'text-foreground bg-card'
            )}
          >
            <span className="text-xs text-muted-foreground block mb-1">
              {log.timestamp.toLocaleTimeString()}
            </span>
            {log.message}
          </div>
        ))}
        {logs.length === 0 && (
          <div className="text-muted-foreground text-center py-4">
            No actions yet
          </div>
        )}
      </div>
    </ScrollArea>
  );
}