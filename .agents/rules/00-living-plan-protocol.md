# File: .agents/rules/00-living-plan-protocol.md

---

trigger: model_decision
description: Enforces Propose-Approve-Propagate whenever architecture, stack, schema, or scope changes are requested.
---

# Rule: Living Plan Protocol

1. **Propose Concisely:** State the architectural trade-off and list affected files in <150 words[cite: 1].
2. **Approve:** Wait for explicit user confirmation before modifying specs or code[cite: 1].
3. **Propagate Surgically:** Update only the impacted sections in `docs/01`–`docs/11`, `TASKS.md`, `docs/10-ADR.md`, and `CHANGELOG.md` using targeted replacements rather than rewriting entire files[cite: 1].
