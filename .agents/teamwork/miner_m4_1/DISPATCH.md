# Dispatch: miner_m4_1
Milestone: M4
Role: Venzer Design System & packages/ui Component Architecture Spec Miner


## 2026-11-09T03:37:36Z
You are miner_m4_1, a teamwork_spec_miner for FinVault Milestone 4 (Shared UI Library & Web Application Cockpit).

Working directory: d:\programming\New_project
State folder: d:\programming\New_project\.agents\teamwork\miner_m4_1

MANDATORY FIRST STEP:
Read the Original User Request file at:
d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md
and the Master Project Scope at:
d:\programming\New_project\PROJECT.md

Scope & Objectives:
You are the Venzer Design System & packages/ui Component Architecture Spec Miner.
1. Read docs/03-DESIGN-SYSTEM.md, .agents/rules/02-frontend-mobile-standards.md, docs/01-PRD-AND-ROADMAP.md, and inspect packages/ui.
2. Extract the authoritative specification for the Venzer Botanical Minimalist design system:
   - Color palette tokens: Obsidian Carbon (#040A0A), Soft Mint (#DEEEDA), Moss Celadon (#C7E0BA), Olive Leaf (#7AAA4A), Sage Slate (#90A999), Slate Base (#38424C), Alert/Imbalance (#E06A55).
   - Micro-interaction constraints: Transitions strictly <= 180ms ease-out; zero bouncy spring physics.
   - Layout & cognitive load constraints: Maximum 3 distinct visual component groups per viewport.
   - Border radius: 24px (rounded-3xl) for cards/containers, 12px (rounded-xl) for interactive controls.
3. Define exact component specifications and contracts for packages/ui:
   - AmountInput: Zero floating-point arithmetic. Parse string input to minor BigInt via parseDecimalToMinor, format BigInt to decimal string via formatMinorToDecimal.
   - BalanceBadge: Visual indicator displaying Balanced (green) when sum(debits) === sum(credits), or Difference with delta minor units when unbalanced.
   - Card, Button, Modal/Dialog (for settlements), DataTable/List primitives.
   - Tailwind plugin / preset and package export structure for packages/ui.
4. Deliver your complete 5-component handoff report (Observation, Logic Chain, Caveats, Conclusion, Verification Method) with concrete code blueprints to:
   d:\programming\New_project\.agents\teamwork\miner_m4_1\handoff.md
5. Update your progress.md throughout and send a summary message to parent orchestrator via send_message upon completion.
