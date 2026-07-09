'use client'

import { useEffect, useRef } from 'react'
import { ScrollArea } from '~/components/ui/scroll-area'
import { cn } from '~/lib/utils'
import { type LogEntry } from '~/store/gameStore'

const TYPE_STYLE: Record<LogEntry['type'], string> = {
  system: 'text-blue-600 dark:text-blue-400 font-medium',
  action: 'text-foreground',
  info: 'text-muted-foreground',
  error: 'text-red-600 dark:text-red-400',
}

export function GameLog({ logs }: { logs: LogEntry[] }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  return (
    <ScrollArea className="h-40 rounded border p-2">
      <div className="space-y-0.5 text-xs">
        {logs.map((log, i) => (
          <div key={i} className={cn(TYPE_STYLE[log.type])}>
            {log.message}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  )
}
