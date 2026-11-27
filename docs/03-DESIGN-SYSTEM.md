# FinVault Botanical Minimalist Design System

## 1. Color Palette Tokens
* **Obsidian Carbon (Background):** `#040A0A`
* **Soft Mint (Surface / Cards):** `#DEEEDA`
* **Sage Pistachio (Secondary / Borders):** `#C7E0BA`
* **Botanical Green (Primary Action / Success):** `#7AAA4A`
* **Muted Sage (Secondary Text / Muted Icons):** `#90A999`
* **Charcoal Slate (Primary Headings / Text):** `#38424C`
* **Muted Amber (Semantic Warning):** `#D99B26` — Reserved exclusively for negative `Free` balances, jar/budget overspend warnings, and `You Owe` indicators.

## 2. Layout, Typography & Anti-Clutter Rules
* **Max Component Groups:** Maximum 3 distinct visual cards/sections per screen to prevent visual fatigue.
* **Row Density:** Maximum 3 data attributes per list row.
* **Border Radius:** Consistent `24px` soft rounded containers for cards and major surfaces, and `12px` radius for interactive controls, pills, and inputs.
* **Tabular Numerals:** All currency figures, percentages, and ledger amounts must enforce `tabular-nums` (`font-variant-numeric: tabular-nums`) for strict vertical alignment.
* **Dual-Balance Account Row Hierarchy:** Account rows display the **Real Balance** prominently in primary weight/color, with the Jar-adjusted **`Free` balance** positioned beside or below in lighter muted font (`#90A999`, shifting to Muted Amber `#D99B26` if `< 0`).

## 3. Data Visualization & Privacy Standards
* **Chart Standards:**
  * **Doughnut Chart:** Used for Category Breakdown with interactive slice tapping to filter the adjacent transaction list.
  * **Paired Bar Chart:** Used for Monthly Income vs. Expense Trends.
* **Horizontal Stacked Distribution Bar:** Used in the Liquidity Breakdown Sheet to visualize `Free` cash vs. `Jar-Allocated` vs. `Card Bill Reserve` / paused allocations at a glance.
* **Global Privacy Mode:** Top-bar `Eye` toggle blurs/masks all monetary values globally across screens, charts, and sheets without altering layout geometry.

## 4. Motion & Transition Standards
* **Fluid Micro-Transitions:** All state changes, tab switches, and modal reveals must execute within `120ms` to `180ms` (`<180ms`) using GPU-accelerated `opacity` and `transform` compositing. No heavy animations or bouncy springs.

## 5. Visual Design Pipeline & Source of Truth
* **Workflow:** `Google Stitch` (rapid visual exploration) $\rightarrow$ `FigCraft` (`docs/designs/finvault-v1.figcraft` master editable design file) $\rightarrow$ `Antigravity MCP` implementation (`packages/ui`, `apps/web`, `apps/mobile`).
* All screen layouts, spacing tokens, and component variants must reconcile against `docs/designs/finvault-v1.figcraft` before UI implementation begins.
