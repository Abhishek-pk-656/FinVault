# File: .agents/rules/02-frontend-mobile-standards.md

---

trigger: glob("{apps/web/**,apps/mobile/**,packages/ui/**}")
description: Enforces FinVault Botanical Minimalist tokens, AST layout density limits, BigInt RSC safety, and <180ms transitions.
---

# Rule: Frontend & Mobile UI/UX Standards

1. **Botanical Minimalist Palette:** Strictly use tokens from `packages/ui`: Obsidian Carbon `#040A0A`, Soft Mint `#DEEEDA`, Sage Pistachio `#C7E0BA`, Botanical Green `#7AAA4A`, Muted Sage `#90A999`, Charcoal Slate `#38424C`[cite: 1, 2].
2. **Anti-Clutter Layout Constraints (AST Tested):** Maximum 3 visual component groups per view, maximum 3 data points per row, `24px` container radius, `12px` control radius[cite: 1, 2].
3. **Motion & Performance SLAs:** GPU-composited opacity/transform transitions strictly between `120ms–180ms` (zero bouncy springs)[cite: 1, 2]. Maintain `<50ms` live `BalanceBadge` validation and lossless string-buffered `BigInt` serialization in `AmountInput` and Next.js Server Components[cite: 2].
