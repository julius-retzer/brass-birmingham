'use client'

// The player's chosen display order for their own hand.
//
// PURELY A VIEW CONCERN. The engine's `context.players[].hand` is game state
// (refill/draw order matters there) and is NEVER touched by this module and no
// event is ever sent: everything here is a permutation applied on the way into
// the tray. The permutation is stored per player id in its own lightweight
// localStorage key — deliberately separate from the game save (bb2-save-v1),
// exactly like the panel-collapse flag — with a session-only in-memory
// fallback when storage is unavailable.
//
// Reconciliation rule (see arrangeHand): remembered ids keep their chosen
// places, cards the player has never moved past — and every newly drawn card —
// fall in after them in the engine's own order, and an id that has left the
// hand is simply skipped. So an end-of-turn refill appends and a played card
// cannot corrupt the rest.
import { useCallback, useEffect, useState } from 'react'

export const HAND_ORDER_KEY = 'bb2-hand-order-v1'

/** Chosen card-id order, per player id. */
export type HandOrders = Record<string, string[]>

/**
 * The hand as the player arranged it: remembered ids first (in the stored
 * order, skipping any that have left the hand), then everything else in the
 * engine's order — so drawn cards append instead of scrambling the fan.
 */
export function arrangeHand<T extends { id: string }>(
  hand: T[],
  order: string[] | undefined,
): T[] {
  if (!order || order.length === 0) return hand
  const byId = new Map(hand.map((card) => [card.id, card]))
  const arranged: T[] = []
  const placed = new Set<string>()
  for (const id of order) {
    const card = byId.get(id)
    if (!card || placed.has(id)) continue
    arranged.push(card)
    placed.add(id)
  }
  for (const card of hand) if (!placed.has(card.id)) arranged.push(card)
  return arranged
}

/**
 * Move `cardId` to `toIndex` within `ids`, clamping the target into range.
 * Returns the same array when nothing moves so callers can skip a write.
 */
export function moveCard(
  ids: string[],
  cardId: string,
  toIndex: number,
): string[] {
  const from = ids.indexOf(cardId)
  if (from === -1) return ids
  const to = Math.max(0, Math.min(ids.length - 1, toIndex))
  if (to === from) return ids
  const next = ids.slice()
  next.splice(from, 1)
  next.splice(to, 0, cardId)
  return next
}

/** Defensive parse — any shape we don't recognise reads as "no orders". */
export function parseHandOrders(raw: string | null): HandOrders {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const orders: HandOrders = {}
  for (const [playerId, ids] of Object.entries(parsed as object)) {
    if (Array.isArray(ids) && ids.every((id) => typeof id === 'string'))
      orders[playerId] = ids
  }
  return orders
}

export interface HandOrderApi {
  /** Apply this player's chosen order to the engine's hand. */
  arrange: <T extends { id: string }>(hand: T[]) => T[]
  /** Record a move; `hand` is the engine's hand, `toIndex` a display index. */
  reorder: (hand: { id: string }[], cardId: string, toIndex: number) => void
}

export function useHandOrder(playerId: string): HandOrderApi {
  const [orders, setOrders] = useState<HandOrders>({})

  // Read after mount so SSR/first paint always agree (the shells render
  // client-side behind a boot gate, but keep this honest regardless).
  useEffect(() => {
    try {
      setOrders(parseHandOrders(localStorage.getItem(HAND_ORDER_KEY)))
    } catch {
      // storage unavailable — reordering still works, just for this session
    }
  }, [])

  const order = orders[playerId]

  const arrange = useCallback(
    <T extends { id: string }>(hand: T[]) => arrangeHand(hand, order),
    [order],
  )

  const reorder = useCallback(
    (hand: { id: string }[], cardId: string, toIndex: number) => {
      setOrders((prev) => {
        const ids = arrangeHand(hand, prev[playerId]).map((card) => card.id)
        const moved = moveCard(ids, cardId, toIndex)
        if (moved === ids) return prev
        const next = { ...prev, [playerId]: moved }
        try {
          localStorage.setItem(HAND_ORDER_KEY, JSON.stringify(next))
        } catch {
          // storage full/unavailable — the order still holds this session
        }
        return next
      })
    },
    [playerId],
  )

  return { arrange, reorder }
}
