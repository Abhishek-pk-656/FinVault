---
trigger: glob("**/{apps/web,apps/mobile,packages/ui}/**")
description: Enforces the FinVault Botanical Minimalist design system, uncluttered layouts, and fast <180ms fluid micro-transitions.
---

# Rule: Frontend & Mobile UI/UX Standards

1. **Color Palette & Tokens:** Use the Botanical Minimalist palette strictly:
   - Obsidian Carbon background: `#040A0A`
   - Soft Mint surface/accent: `#DEEEDA`
   - Sage Pistachio secondary: `#C7E0BA`
   - Botanical Green primary action: `#7AAA4A`
   - Muted Sage borders/text: `#90A999`
   - Charcoal Slate text/headers: `#38424C`
2. **Layout Simplicity & Anti-Clutter:** Keep screens uncluttered. Maximum 3 visual component groups per view, maximum 3 data attributes per row, and consistent `24px` (`rounded-3xl`) container radii.
3. **Transitions & Animations:** Zero heavy animations, bouncy springs, or long loaders. All page transitions and state changes must be fluid, fast, and smooth (`120ms`–`180ms` GPU-composited opacity and transform fades).
