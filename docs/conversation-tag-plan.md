# Conversation/tag Hub implementation — 2026-09-23

Binding specification: user's final MES Agent Hub redesign plan in this task.

Root prerequisite completed separately: cd254f5, merged main fba4a52; 37 tests, build, Edge smoke and lifecycle passed (one initial reload/navigation timeout recorded in root-integration.md).

Branch: codex/conversation-tag-hub. Push only after publication sanitization and validation. No redesign merge to main.

## Tasks and acceptance
1. Data: one conversation per task, canonical typed tags, immutable material selections, atomic v2→v3 copy and full backup.
2. Catalog/chat: fictional examples only; users register their own assistants, owners, URLs, classifications and model mappings. No supplied reference content may be committed or pushed.
3. Board: agent columns in catalog order, recent activity, category multi-filters, jump/collapse/user view preferences.
4. Materials: direct-tag original ownership only, no transitive discovery; checkbox use + optional main star; selected immutable versions survive tag removal; Markdown provenance.
5. SR: immediate intake, explicit submit and atomic tag/notification, independent AI title protected from manual edits, follow-up conversations with inherited SR tag.
6. Regression/browser verification, independent whole-branch review, fixes, documentation, commit/push.

Keep existing completion lock/reopen, request snapshots/leases/cancellation, team opinions, API model precedence, requester privacy, files/images and backups. No assistant skill redesign or implicit file sending. New catalog does not overwrite user agents. Existing database remains untouched. API keys stay in memory. Actual internal API is not available for verification.

## Progress
- Root prerequisite complete.
- Tasks 1–5 and the OpenWebUI file adapter/optional AI checklist assessment are implemented. Independent review findings are fixed in the working tree.
- Latest user scope: build the conversation/file-sharing platform only. Actual assistant data is registered by users. Replace reference-derived catalog with three fictional examples and no actual business records or addresses.
- 2026-09-23: 62 tests passed; production build passed; all three Edge browser suites passed using synthetic data and mocked API.
- The fictional conversation/tag foundation was committed as 84a3c71. The unpublished reference-containing commit was removed from this branch ancestry; follow-up integration awaits its final commit/push.
- Before branch push: final staged-file and commit-history scan. Independent review found and the implementation fixed attachment-first text loss, stale checklist evidence, legacy Output classification, and restore during an active assessment.
- Remote historical commits were not rewritten. Sanitizing the current snapshot does not remove information already present in older published commits.

## Implementation decisions
- User explicitly requested in-place root unification and a named branch; retain this checkout instead of creating another nested worktree.
- Retain the existing WorkItem/Conversation storage contracts behind a v3 one-to-one invariant so request/completion audit services remain usable; Tag/TaskTag/TaskInput/CatalogOrder are explicit entities.
