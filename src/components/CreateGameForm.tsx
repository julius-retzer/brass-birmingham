'use client'

import { createGameAction } from '~/app/actions'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'

export function CreateGameForm() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New Game</CardTitle>
        <CardDescription>
          Enter your name to create a new multiplayer game
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={createGameAction} className="space-y-4">
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
            Create Game
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}