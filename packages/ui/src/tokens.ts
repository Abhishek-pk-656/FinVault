/**
 * Venzer Botanical Minimalist Design Tokens (ADR-007, Milestone 4)
 * Authoritative color palette, border radii, and motion constraints.
 */
export const TOKENS = {
  colors: {
    // Primary Venzer Botanical Palette
    obsidianCarbon: '#040A0A', // Background, high contrast base
    softMint: '#DEEEDA',       // Primary surface, card background, light foreground
    mossCeladon: '#C7E0BA',    // Secondary accents, borders, chips
    oliveLeaf: '#7AAA4A',      // Primary action, success, balanced indicator
    sageSlate: '#90A999',      // Muted text, secondary icons, timestamps
    slateBase: '#38424C',      // High contrast text on light surface, dividers
    alert: '#E06A55',          // Ledger imbalance, debts, critical warnings

    // Semantic Aliases for backward compatibility
    obsidian: '#040A0A',
    sagePistachio: '#C7E0BA',
    botanicalGreen: '#7AAA4A',
    mutedSage: '#90A999',
    charcoalSlate: '#38424C',
    imbalance: '#E06A55',
  },
  layout: {
    maxVisualGroups: 3,         // Max 3 visual component groups per viewport
    maxRowAttributes: 3,        // Max 3 data attributes per list row
    containerRadius: '24px',    // rounded-3xl for cards/containers
    controlRadius: '12px',      // rounded-xl for interactive buttons/inputs
    borderRadius: '24px',       // backward compatibility alias
    transitionDurationMs: 150,  // strictly <= 180ms ease-out
    timingFunction: 'cubic-bezier(0, 0, 0.2, 1)',
  },
} as const;

export type VenzerColor = keyof typeof TOKENS.colors;
