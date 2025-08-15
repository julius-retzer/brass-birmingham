import { CreateGameForm } from '~/components/CreateGameForm'

export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-auto p-6">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Brass Birmingham</h1>
          <p className="text-muted-foreground">Create a new multiplayer game</p>
        </div>
        <CreateGameForm />
      </div>
    </div>
  )
}
