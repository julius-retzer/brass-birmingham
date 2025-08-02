import { CheckCircle, MapPin, MousePointer, XCircle } from 'lucide-react'
import { Alert, AlertDescription } from '../ui/alert'
import { Badge } from '../ui/badge'

interface SelectionFeedbackProps {
  selectionType: 'city' | 'link' | 'card' | null
  isValid?: boolean
  message?: string
  selectedCount?: number
  requiredCount?: number
  hint?: string
}

export function SelectionFeedback({
  selectionType,
  isValid = true,
  message,
  selectedCount,
  requiredCount,
  hint,
}: SelectionFeedbackProps) {
  if (!selectionType) return null

  const getIcon = () => {
    if (selectionType === 'city') return <MapPin className="h-4 w-4" />
    if (selectionType === 'link') return <MousePointer className="h-4 w-4" />
    return <MousePointer className="h-4 w-4" />
  }

  const getStatusIcon = () => {
    if (isValid) return <CheckCircle className="h-4 w-4 text-green-500" />
    return <XCircle className="h-4 w-4 text-red-500" />
  }

  const getAlertVariant = () => {
    return isValid ? 'default' : 'destructive'
  }

  return (
    <Alert
      className={`${!isValid ? 'border-red-300 bg-red-50' : 'border-blue-300 bg-blue-50'}`}
    >
      <div className="flex items-center gap-2">
        {getIcon()}
        {getStatusIcon()}
      </div>
      <AlertDescription>
        <div className="space-y-2">
          {/* Main message */}
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {message || `Select ${selectionType}`}
            </span>
            {selectedCount !== undefined && requiredCount !== undefined && (
              <Badge variant="outline" className="text-xs">
                {selectedCount}/{requiredCount}
              </Badge>
            )}
          </div>

          {/* Hint text */}
          {hint && (
            <div className="text-sm text-muted-foreground">💡 {hint}</div>
          )}

          {/* Valid/Invalid feedback */}
          {!isValid && (
            <div className="text-sm text-red-600">
              ❌ This selection is not allowed
            </div>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )
}
