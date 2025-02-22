import { PlayerCard } from "~/components/PlayerCard";
import { sampleGameState } from "~/data/sampleData";
import { CircleDot, CircleEqual, Beer } from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Game Info */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-4">Brass: Birmingham</h1>
          <div className="flex justify-center gap-8">
            <div>
              <span className="font-medium">Era:</span> {sampleGameState.era}
            </div>
            <div>
              <span className="font-medium">Round:</span> {sampleGameState.round}
            </div>
          </div>
        </div>

        {/* Resources */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Market & Resources</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-black/20 p-4 rounded-lg">
              <h3 className="font-medium mb-2">Coal Market</h3>
              <div className="flex gap-2">
                {sampleGameState.coalMarket.map((price, i) => (
                  <div key={i} className="w-8 h-8 bg-gray-800 rounded flex items-center justify-center">
                    £{price}
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-black/20 p-4 rounded-lg">
              <h3 className="font-medium mb-2">Iron Market</h3>
              <div className="flex gap-2">
                {sampleGameState.ironMarket.map((price, i) => (
                  <div key={i} className="w-8 h-8 bg-gray-800 rounded flex items-center justify-center">
                    £{price}
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-black/20 p-4 rounded-lg">
              <h3 className="font-medium mb-2">Available Resources</h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="font-medium flex items-center justify-center gap-1">
                    <CircleDot className="h-4 w-4" />
                    Coal
                  </div>
                  <div>{sampleGameState.availableResources.coal}</div>
                </div>
                <div>
                  <div className="font-medium flex items-center justify-center gap-1">
                    <CircleEqual className="h-4 w-4" />
                    Iron
                  </div>
                  <div>{sampleGameState.availableResources.iron}</div>
                </div>
                <div>
                  <div className="font-medium flex items-center justify-center gap-1">
                    <Beer className="h-4 w-4" />
                    Beer
                  </div>
                  <div>{sampleGameState.availableResources.beer}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Players */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Players</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sampleGameState.turnOrder.map((player, index) => (
              <PlayerCard
                key={player.name}
                player={player}
                isCurrentPlayer={index === sampleGameState.currentPlayer}
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
