// Turn-notification helpers for networked play. Pure functions — the SSE
// stream hands each frame's currentPlayerIndex to didBecomeMyTurn(), and
// the shell decides how to surface it (browser Notification when the tab
// is hidden, title-bar + chime when visible).

/**
 * True exactly when the turn TRANSFERS to `you` between two stream frames.
 * The first frame (prev === null) never notifies: resuming a game where it
 * is already your turn should not buzz you — you just opened the tab.
 */
export function didBecomeMyTurn(
  prev: number | null,
  next: number | null,
  you: number,
): boolean {
  return prev !== null && prev !== you && next === you
}

/** Browser-tab title for the current turn state. */
export function titleForTurn(baseTitle: string, myTurn: boolean): string {
  return myTurn ? `● Your turn — ${baseTitle}` : baseTitle
}

/**
 * A soft two-note chime via WebAudio — no asset, no autoplay issues (mp
 * players have always interacted before a turn can reach them). Failures
 * (no AudioContext, restrictive policy) are silently ignored.
 */
export function playTurnChime(): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    const note = (freq: number, at: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at)
      gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.4)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + at)
      osc.stop(ctx.currentTime + at + 0.45)
    }
    note(660, 0)
    note(880, 0.12)
    setTimeout(() => void ctx.close().catch(() => {}), 1200)
  } catch {
    // sound is a nicety, never an error
  }
}
