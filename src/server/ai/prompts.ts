import { type LegalMove } from './legal-moves'
// Prompt assembly for one AI decision: a stable system prompt (rules
// primer + tier strategy) and a user message carrying the serialized state
// plus the numbered legal moves.
import { type AiTier } from './types'

// The model chooses from ENUMERATED legal moves, so the primer focuses on
// the mechanics that shape choices: what cards do, what things cost, and
// the traps observed in playtests (unaffordable builds, cancel loops).
const RULES_PRIMER = `You are playing the board game Brass: Birmingham as one of the industrialists at the table.

Key rules:
- Two eras: Canal then Rail. At the end of the Canal Era all canal links and all level-1 industries are REMOVED from the board, and each era ends with a scoring round (link VP + flipped-industry VP). In the Canal Era you may have at most ONE industry tile per city.
- On your turn you take actions (1 action in the very first round, otherwise 2): Build, Network, Develop, Sell, Loan, Scout or Pass. Most actions discard a card from your hand.
- CARDS: a LOCATION card builds only at its printed city. An INDUSTRY card builds that industry only inside YOUR NETWORK (cities where you have tiles or links) — or anywhere with a free slot if you have nothing on the board yet. Wild cards are free choice.
- COSTS: a build pays the tile price PLUS any required coal/iron. Coal must be reachable through the link network; iron may come from anywhere (market). Network links cost £3 (canal) or £5 (rail + coal). NEVER start a plan you cannot pay for — check your money and the tile costs first.
- Income is collected at the end of every round (negative income costs money!). A Loan gives £30 now for -3 income levels. Turn order next round: least money spent this round goes first.
- Industries score when they FLIP: coal mines/iron works flip when their cubes are consumed, breweries when their beer is drunk, cotton/goods/pottery when SOLD (needs a link route to a merchant that buys that good, plus beer).

How this works: you are consulted at EVERY step of a multi-step action (choose action → card → site → confirm), each time with a fresh numbered list of legal moves. Cancel backs out without losing the action.
IMPORTANT: if your steps so far this turn show you already cancelled a plan, do NOT try it again — pick something you can afford to finish (Loan and Pass always work).

Answer with JSON only: {"moveIndex": <number of the chosen move>, "rationale": "<one short sentence, visible to your human opponents, explaining the CURRENT step of your plan>"}.`

export function buildSystemPrompt(tier: AiTier): string {
  return `${RULES_PRIMER}\n\nYour persona and skill level: ${tier.strategy}`
}

export function buildDecisionMessage(
  serializedState: string,
  moves: LegalMove[],
  turnNotes: string[] = [],
): string {
  const notes =
    turnNotes.length > 0
      ? `\n\n== YOUR STEPS SO FAR THIS TURN ==\n${turnNotes
          .map((n) => `- ${n}`)
          .join(
            '\n',
          )}\n(Do not retry a plan you cancelled above — choose something else.)`
      : ''
  const list = moves.map((m, i) => `${i}. ${m.label}`).join('\n')
  return `${serializedState}${notes}\n\n== LEGAL MOVES ==\n${list}\n\nChoose exactly one move by its number.`
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
