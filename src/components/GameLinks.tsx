'use client'

import { useState } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Copy, Check } from 'lucide-react'

interface GameLinksProps {
  gameId: string
}

export function GameLinks({ gameId }: GameLinksProps) {
  const [copiedPlayer1, setCopiedPlayer1] = useState(false)
  const [copiedPlayer2, setCopiedPlayer2] = useState(false)
  
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const player1Link = `${baseUrl}/game/${gameId}?player=1&name=Player1`
  const player2Link = `${baseUrl}/game/${gameId}?player=2`
  
  const copyToClipboard = async (text: string, player: 1 | 2) => {
    try {
      await navigator.clipboard.writeText(text)
      if (player === 1) {
        setCopiedPlayer1(true)
        setTimeout(() => setCopiedPlayer1(false), 2000)
      } else {
        setCopiedPlayer2(true)
        setTimeout(() => setCopiedPlayer2(false), 2000)
      }
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-green-600">Your Game Link (Player 1)</CardTitle>
          <CardDescription>
            This is your link to join the game as Player 1
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex space-x-2">
            <Input 
              value={player1Link} 
              readOnly 
              className="text-sm"
            />
            <Button
              onClick={() => copyToClipboard(player1Link, 1)}
              variant="outline"
              size="sm"
              className="shrink-0"
            >
              {copiedPlayer1 ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <Button asChild className="w-full">
            <a href={player1Link}>Join as Player 1</a>
          </Button>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-blue-600">Opponent Link (Player 2)</CardTitle>
          <CardDescription>
            Share this link with your opponent
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex space-x-2">
            <Input 
              value={player2Link} 
              readOnly 
              className="text-sm"
            />
            <Button
              onClick={() => copyToClipboard(player2Link, 2)}
              variant="outline"
              size="sm"
              className="shrink-0"
            >
              {copiedPlayer2 ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Send this link to your opponent so they can join the game
          </p>
        </CardContent>
      </Card>
    </div>
  )
}