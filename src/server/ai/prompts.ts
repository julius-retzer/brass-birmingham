import { type LegalMove } from './legal-moves'
// Prompt assembly for one AI decision: a stable system prompt (rules
// primer + tier strategy) and a user message carrying the serialized state
// plus the numbered legal moves.
import { type AiTier } from './types'

// Kept deliberately short: the model chooses from ENUMERATED legal moves,
// so it needs strategic context, not a rules encyclopedia.
const RULES_PRIMER = `You are playing the board game Brass: Birmingham as one of the industrialists at the table.

Key facts:
- The game has two eras: Canal then Rail. At the end of the Canal Era, all canal links and all level-1 industries are removed from the board, and each era ends with a scoring round (link VP + flipped-industry VP).
- On your turn you take actions (1 action in the very first round, otherwise 2): Build, Network, Develop, Sell, Loan, Scout or Pass. Most actions discard a card from your hand.
- Income is collected at the end of every round; loans give £30 but cost 3 income levels. Turn order next round: whoever spent the least this round goes first.
- Industries flip (score VP + income) when their resources are consumed: coal mines and iron works flip when emptied, breweries when their beer is drunk, cotton/goods/pottery when SOLD to a merchant (which needs beer and a connected merchant that buys that industry).
- Building requires the card, the tile cost, and any coal/iron — coal must be reachable through your link network, iron may come from anywhere.

You will be given the current game state and a NUMBERED list of the legal moves at this exact decision point. Multi-step actions (e.g. Build = choose action, then card, then site, then confirm) are decided one step at a time; you will be consulted at every step and can Cancel to back out.

Answer with JSON only: {"moveIndex": <number of the chosen move>, "rationale": "<one short sentence, visible to your human opponents, explaining the CURRENT step of your plan>"}.`

export function buildSystemPrompt(tier: AiTier): string {
  return `${RULES_PRIMER}\n\nYour persona and skill level: ${tier.strategy}`
}

export function buildDecisionMessage(
  serializedState: string,
  moves: LegalMove[],
): string {
  const list = moves.map((m, i) => `${i}. ${m.label}`).join('\n')
  return `${serializedState}\n\n== LEGAL MOVES ==\n${list}\n\nChoose exactly one move by its number.`
}

/** JSON Schema forced onto the model via structured outputs. */
export const CHOICE_SCHEMA = {
  type: 'object' as const,
  properties: {
    moveIndex: {
      type: 'integer' as const,
      description: 'The number of the chosen move from the legal moves list',
    },
    rationale: {
      type: 'string' as const,
      description:
        'One short sentence explaining the choice, shown to the human players',
    },
  },
  required: ['moveIndex', 'rationale'],
  additionalProperties: false,
}
