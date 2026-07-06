/**
 * BackgroundEffects — pure-CSS GPU orbs
 *
 * PERFORMANCE:  Previously used framer-motion JS animation loops with
 * filter:blur(80px) on 800–900px divs — a permanent main-thread animation
 * that caused jank on every device, especially mobile.
 *
 * NOW: Pure CSS @keyframes using only `transform: translate` (GPU-composited,
 * runs on the compositor thread — zero JS main-thread cost). The blur is
 * applied once on a parent wrapper using a lower value (60px vs 80px) which
 * is imperceptible visually but much cheaper to render.
 *
 * GPU Promotion Strategy:
 *  - will-change: transform  → browser allocates a GPU layer upfront
 *  - contain: strict          → tells browser this subtree doesn't affect layout
 *  - transform: translateZ(0) → force composite layer on older browsers
 */
export const BackgroundEffects = () => {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: -1,
        overflow: 'hidden',
        background: '#05050A',
        // Contain layout+paint so the browser skips full-page recalc for this subtree
        contain: 'strict',
      }}
    >
      {/* Single blur wrapper — apply blur once, not per-orb */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          filter: 'blur(60px)',
          // Force GPU layer — critical for mobile
          transform: 'translateZ(0)',
          willChange: 'transform',
        }}
      >
        {/* Orb 1 — Cyan, bottom-left */}
        <div className="bg-orb bg-orb-1" />
        {/* Orb 2 — Violet, top-right */}
        <div className="bg-orb bg-orb-2" />
        {/* Orb 3 — Amber, center */}
        <div className="bg-orb bg-orb-3" />
      </div>
    </div>
  );
};
