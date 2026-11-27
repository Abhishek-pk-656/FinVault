# Product Requirements Document (PRD) & Roadmap — FinVault

## 1. Executive Summary & Vision
FinVault is a private, local-first personal finance, lending, bill, and wealth management application. It bridges the gap between manual privacy and automated intelligence, running seamlessly across Web and Android with local-first offline capabilities.

## 2. Target Personas & Use Cases
* **Privacy-First Individual:** Wants complete ownership of their financial ledger without sending banking data to third-party SaaS servers.
* **Active Lender / Group Expense Manager:** Needs a reliable IOU ledger to track who owes what, partial settlements, and split bills.
* **Long-Term Wealth Builder:** Eventually requires AI, RAG search, and portfolio analytics (XIRR, CAGR) to manage investments.

## 3. Phased Roadmap
* **Phase 1 (MVP — Local Use):** Double-Entry Lite ledger, Accounts, Lending/IOU engine, Split bills, Bill & Credit Card cycle tracker, Safe-to-Spend metric, Multi-format exports (CSV, XLSX, PDF), and local `.finvault` snapshots. Styled with the FinVault Botanical Minimalist design system.
* **Phase 2 (Automation & Local Sync):** Android local SMS/notification parser, Bank statement CSV/PDF importer with cryptographic deduplication, and Local Home Wi-Fi / USB sync with desktop PostgreSQL.
* **Phase 3 (AI Wealth Management & RAG):** Multi-asset portfolio tracking (stocks, mutual funds, gold), hybrid SQL + `pgvector` RAG assistant (via local Ollama or cloud LLMs), and ML cash-flow forecasting.

---

## 4. Finalized Phase 1 Daily-Driver App Map

### 4.1 Primary Navigation & Top Utility Bar
* **Bottom / Primary Navigation (4 Tabs + Center `+` Action):**
  1. `Home`: Net worth & liquidity summary, Jar progress overview, due bills/EMIs, and safe-to-spend Free balance.
  2. `Activity`: Searchable, filterable transaction stream with category Doughnut & monthly Income vs. Expense Paired Bar analytics.
  3. `+ Quick Add` (Center Action): Universal 5-mode entry sheet accessible from any tab.
  4. `Wallet`: Bank accounts, cash wallets, credit card liability trackers, Store-Tagged Virtual Jars, and Account & Card Info Vault.
  5. `Contacts`: Unified directory covering People (bilateral IOU ledger), Businesses, and Trips / Group Buckets.
* **Top Utility Bar (Global):**
  * `Privacy Eye Toggle`: Instant global blur/masking of all currency figures across every screen and bottom sheet.
  * `Sync Status Pill`: Live state (`Synced` / `Pending offline (N)`) with manual delta-sync trigger and account status.
  * `Settings`: Primary currency & number formatting, biometric lock, default privacy mode, and export/snapshot controls.

### 4.2 Locked Phase 1 Core Features
1. **Store-Tagged Virtual Jars:**
   * Each virtual Jar is tagged to one or more underlying asset accounts (bank/cash wallets) without moving real money on-chain or between bank accounts.
   * **Drag-to-Reorder Priority Pausing:** Users rank Jars by priority; when a tagged wallet's Jar-adjusted `Free` balance drops below `0`, lower-priority Jars enter a gray/paused slice state until funds recover.
   * **Atomic Auto Top-Up on Overspend:** Spending past a Jar's remaining allocation automatically pulls the deficit from the tagged wallet's `Free` balance in the same atomic transaction, preserving the Jar as a complete spend ledger showing `Saved`, `Topped Up`, `Total Spent`, and `Remaining`.
2. **Credit Card Liability Tracking & `Card Bill Reserve`:**
   * Credit cards operate as `LIABILITY` accounts with cycle, statement, and due-date tracking.
   * When a credit card swipe is funded by a Jar, FinVault automatically tags an equivalent `Card Bill Reserve` inside the designated bank wallet so bill-payment cash stays earmarked without double-counting the expense.
3. **Universal 5-Mode Quick Add (`+ Quick Add`):**
   * `Expense`: Standard/split spend with upcoming due bills pinned to a Quick-Repeat strip.
   * `Income`: Earnings entry with a `Mark as Refund` toggle to credit back an expense category or Jar.
   * `Transfer`: Account-to-account moves with a smart Jar-tag migration prompt when transferring out of a wallet that holds tagged Jars.
   * `People / IOU`: Dedicated `Split | Lend | Borrow | Settle` sub-modes.
   * `EMI`: Dedicated `Pay EMI | New EMI` sub-modes.
   * **Inline `+ Create`:** Every entity picker (accounts, categories, Jars, contacts, bills/EMIs) supports inline creation without abandoning the Quick Add flow.
4. **Unified `Contacts` Directory:**
   * `People`: Chat-style bilateral ledger showing running net balance (`You Owe` / `Owed to You`), partial repayments, one-click contra-clearing, formal write-off, and WhatsApp summary share.
   * `Businesses`: Merchant spend history consolidated with linked recurring bills and active EMIs.
   * `Trips / Group Buckets`: Any-payer group expense splits, simplified minimum-transfer settlement calculations, and optional Jar linkage for personal trip budgeting.
5. **Structured EMI Tracker:**
   * Tracks principal, remaining balance, installment progress, and due dates with 1-tap `Pay EMI` and full/partial `Prepay / Foreclose` workflows.
6. **Client-Side AES-256-GCM Encrypted `Account & Card Info Vault`:**
   * Embedded inside Account details for sensitive banking/card credentials (account numbers, IFSC/routing, card PAN/expiry/CVV, customer IDs).
   * Encrypted client-side via AES-256-GCM before local persistence or sync; masked by default, revealed only after biometric verification, and automatically cleared from the clipboard after 45 seconds.
7. **Switchable Primary Currency & Number Formatting:**
   * Configured in Settings with `INR ₹` and Indian digit grouping (`1,00,000.00`) as default, switchable to `USD`, `EUR`, `GBP`, `AED`, and other ISO 4217 currencies using `BIGINT` minor units throughout.
