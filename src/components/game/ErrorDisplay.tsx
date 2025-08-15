import { AlertTriangle, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Button } from '../ui/button'

interface ErrorDisplayProps {
  error: string | null
  errorContext: 'build' | 'network' | 'develop' | 'sell' | 'scout' | null
  onDismiss: () => void
}

export function ErrorDisplay({ error, errorContext, onDismiss }: ErrorDisplayProps) {
  if (!error) {
    return null
  }

  const getErrorTitle = (context: typeof errorContext) => {
    switch (context) {
      case 'build':
        return 'Build Action Failed'
      case 'network':
        return 'Network Action Failed'
      case 'develop':
        return 'Develop Action Failed'
      case 'sell':
        return 'Sell Action Failed'
      case 'scout':
        return 'Scout Action Failed'
      default:
        return 'Action Failed'
    }
  }

  return (
    <Alert variant="destructive" className="relative">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="pr-8">{getErrorTitle(errorContext)}</AlertTitle>
      <AlertDescription className="mt-2">
        {error}
      </AlertDescription>
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 h-6 w-6 p-0 hover:bg-destructive/20"
        onClick={onDismiss}
      >
        <X className="h-3 w-3" />
        <span className="sr-only">Dismiss error</span>
      </Button>
    </Alert>
  )
}