'use client'

import { joinGameAction } from '~/app/actions'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'

interface JoinGameFormProps {
  gameId: string
}

export function JoinGameForm({ gameId }: JoinGameFormProps) {
  const joinAction = joinGameAction.bind(null, gameId)
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Join Game</CardTitle>
            <CardDescription>
              Enter your name to join this game as Player 2
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={joinAction} className="space-y-4">
              <div>
                <Label htmlFor="playerName">Your Name</Label>
                <Input 
                  id="playerName"
                  name="playerName" 
                  type="text"
                  placeholder="Enter your name" 
                  required 
                  maxLength={50}
                  className="mt-1"
                />
              </div>
              <Button type="submit" className="w-full">
                Join Game as Player 2
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}