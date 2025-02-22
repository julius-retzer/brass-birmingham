import { useEffect, useRef } from 'react';

export interface LogEntry {
  message: string;
  type: 'action' | 'system' | 'info';
  timestamp: Date;
}

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
    <div
      ref={logContainerRef}
      className="bg-gray-50 rounded-lg p-4 h-64 overflow-y-auto"
    >
      {logs.map((log, index) => (
        <div
          key={index}
          className={`mb-2 text-sm ${
            log.type === 'system'
              ? 'text-gray-500'
              : log.type === 'action'
              ? 'text-blue-600'
              : 'text-gray-700'
          }`}
        >
          <span className="text-gray-400 mr-2">
            {log.timestamp.toLocaleTimeString()}
          </span>
          {log.message}
        </div>
      ))}
      {logs.length === 0 && (
        <div className="text-gray-400 text-center">No actions yet</div>
      )}
    </div>
  );
}