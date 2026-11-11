---
trigger: model_decision
description: Enforces the Propose-Approve-Propagate protocol whenever changes to architecture, tech stack, requirements, or design are introduced.
---

# Rule: Living Plan & Propose-Approve-Propagate Protocol

When the user requests an architectural change, library swap, new feature scope, or design adjustment:
1. **Propose:** Explicitly state the proposed modification, its advantages, disadvantages, and impact on existing components.
2. **Approve:** Wait for explicit user confirmation before writing code or modifying documentation.
3. **Propagate:** Once approved, update all affected documentation files (`docs/01` through `docs/11`), `TASKS.md`, and this repository.
4. **Record:** Create or update an Architecture Decision Record in `docs/10-ADR.md` and log the entry in `CHANGELOG.md`.
