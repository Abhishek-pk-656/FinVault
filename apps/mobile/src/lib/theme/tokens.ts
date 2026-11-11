/**
 * Venzer Botanical Minimalist Design Tokens (Mobile)
 * 
 * Strict compliance with FinVault Design System & Rule 02:
 * - Palette: Obsidian Carbon (#040A0A), Soft Mint (#DEEEDA), Moss Celadon (#C7E0BA),
 *            Olive Leaf (#7AAA4A), Sage Slate (#90A999), Slate Base (#38424C), Alert Coral (#E06A55)
 * - Container radius: 24px
 * - Control radius: 12px
 * - Motion duration: <= 180ms (150ms default)
 * - Maximum visual groups: 3 per viewport
 * - Maximum row attributes: 3 per list item
 */

export const TOKENS = {
  colors: {
    obsidianCarbon: '#040A0A', // Background base
    softMint: '#DEEEDA',       // Primary surface, card background
    mossCeladon: '#C7E0BA',    // Secondary accents, borders, chips
    oliveLeaf: '#7AAA4A',      // Primary action, success, balanced indicator
    sageSlate: '#90A999',      // Muted text, secondary icons, timestamps
    slateBase: '#38424C',      // High contrast text on light surface, dividers
    alert: '#E06A55',          // Ledger imbalance, debts, critical warnings
    white: '#FFFFFF',
    transparent: 'transparent',
  },
  radii: {
    container: 24,             // 24px container radius
    control: 12,               // 12px control radius for buttons/inputs
    pill: 9999,                // Pill badges
  },
  motion: {
    durationMs: 150,           // strictly <= 180ms ease-out
  },
  layout: {
    maxVisualGroups: 3,        // Maximum 3 visual component groups per view
    maxRowAttributes: 3,       // Maximum 3 data attributes per list row
  },
} as const;

export type ThemeTokens = typeof TOKENS;
