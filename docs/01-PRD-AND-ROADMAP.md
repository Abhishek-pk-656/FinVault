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
