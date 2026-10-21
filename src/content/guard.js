/**
 * QVault click guard for the in-page card.
 *
 * The card lives in the page's DOM, so the page can script it: dispatch fake
 * clicks, hide it under a decoy, or move it under the pointer. An action that
 * fills or saves a credential only runs when:
 * - the click comes from the user (`isTrusted`);
 * - Chrome reports the card as really visible: not covered, transparent or
 *   transformed by the page (IntersectionObserver v2);
 * - the card has been visible long enough for the user to read it.
 *
 * Runs in the content script's isolated world: the page cannot read or patch it.
 */

;(() => {
  const DEFAULT_MIN_VISIBLE_MS = 400

  function watch(target, { minVisibleMs = DEFAULT_MIN_VISIBLE_MS } = {}) {
    let visibleSince = 0
    let observer = null

    try {
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          // isVisible is only set when Chrome can guarantee nothing covers the card.
          if (entry.isVisible === true) {
            if (!visibleSince) visibleSince = Date.now()
          } else {
            visibleSince = 0
          }
        }
      }, { threshold: [1.0], trackVisibility: true, delay: 100 })
      observer.observe(target)
    } catch {
      // Without visibility tracking, every action is refused: fail closed.
      observer = null
    }

    return {
      accepts(event) {
        if (!event || event.isTrusted !== true) return false
        if (!observer || !visibleSince) return false
        return Date.now() - visibleSince >= minVisibleMs
      },
      stop() {
        observer?.disconnect()
        observer = null
        visibleSince = 0
      },
    }
  }

  globalThis.__qvaultGuard = Object.freeze({ watch })
})()
