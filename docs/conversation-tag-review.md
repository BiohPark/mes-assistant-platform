# Whole-branch review package

Historical review brief. Review completed and fixes committed/pushed in `f99be7c`; the instructions below describe that review, not a new pending review request. See [HANDOFF.md](../HANDOFF.md) for current implementation boundaries, verification evidence and remaining work.

Base: `fba4a52` (main/root integration). Review HEAD plus current working changes and new files on `codex/conversation-tag-hub`. Do not include the archived FlowMES implementation. Read-only review; no edits, git mutations, or further reviewers.

## Product contract
- Agent cards open a focused composer, with no title/work form. No persisted task until the first message or attachment is saved. Failed preparation must leave no blank task. One conversation is one work item.
- fictional examples only; users register their own assistants, owners, URLs, classifications and model mappings. No supplied reference content may be committed or pushed.
- Large cards/whole-board toggle, shared filters (Lv1/Lv2 multi OR within, AND across). Board columns are agents in SO shared order, cards recent activity (stable tie), status menus, owner/tag/archive filters, column jump/hide empty/collapse. Persist view preferences per user.
- SO alone edits shared order via handles or accessible movement buttons, save/cancel, full catalog only; stale revision preserves draft. Card body in edit mode opens settings. New agents append.
- Explicit SR/keyword tag types; Unicode normalization, trim, leading # removal, whitespace collapse, case insensitive dedup; preserve hyphens/leading zeroes. One canonical tag per kind+key and one task/tag membership, including concurrent commands.
- Neutral keyword colors and deterministic persisted muted SR colors. First attached SR drives card accent. Many SR tags allowed.
- Discovery uses current original materials plus original owners directly sharing a tag. Dedup per artifact version. A–B–C is not transitive; B referencing a C file must not redistribute C as B-owned.
- Discovery is not AI transmission. Checkbox selects input version, optional star designates main input; unstar keeps selection, uncheck drops main. Upload alone never selects. Selected files survive tag removal/source archive/new versions. Request snapshots never reinject old removed raw contexts.
- Unified material library filters name/source agent/input-output/matching tag. Group by source agent, output first. Previous versions collapsed, newer version notification, no replacement without selection. Preview/download/source metadata. Explicit answer save is Output; selected user/discussion text is Input. Source message IDs preserved. Summary/memo can be saved as Markdown. No new context-bundle handoff UI.
- Existing manual work/checklists/notes/status completion lock and reasoned reopen, request lease/cancel/retry/provenance, images, reports/helper/exports remain.
- SR intake starts without a title form. Explicit submit creates number/tag/notifications/list. Existing SR number registration is a tag, not submission. SR follow-up creates/continues an agent conversation with inherited tag, no automatic file selection. SR state independent of task.
- Auxiliary AI title request isolated from assistant messages; failure does not block submission; delayed title cannot overwrite a manual title. Requester or SO may edit title.
- Requester sees only own intake and explicitly shared results. Matching SR/tag is not a permission grant. Private internal messages, artifacts and notes remain excluded.
- v3 IndexedDB atomically copies existing v2 state/blobs and keeps old DB untouched. Before-conversion backup notice/download. Split old multi-conversation work minimally, shared file provenance retained without guessing output ownership. Original historical handoffs/completions remain exportable; no elaborate historical UI. Full backup includes new entities and blobs, validates and restores transactionally with epoch guard.
- Frontend demo only: role selector is not real auth; no cross-PC sync/SSO/backend. API keys memory only. Actual internal API not available; tests use intercepted requests. Preserve assistant skills/knowledge/question flow.

## Evidence so far
- 62 unit/integration tests passed and production build passed after switching to fictional bootstrap data and adding the file/checklist integration.
- browser-hub passed delayed creation, URS→SR→FDS, checkbox/star request payload, model override, remove tag/selection, shared order save/cancel, 13+ columns/collapse/reload.
- browser-smoke passed two-tab append, tab-local role, slow API, remove selected input mid-request, model provenance, failure/retry/cancel, requester privacy/reload, backup download.
- browser-lifecycle passed SR/share/completion/reopen/backup restore after synchronizing role-switch navigation.
- Independent read-only review completed. Its three important findings and one minor backup race are fixed with regression tests or a restore guard.

## Review focus
Find actionable bugs, data loss/privacy leaks, contract gaps, and meaningful missing edge tests. Especially audit v2→v3 migration and backup conversion, selected materials surviving source/tag changes, new SR title service/manual race, atomic first persistence and request startup, and UI flows not covered by happy paths. Existing demo limitations are intentional, not production-auth requirements.

## Decisions
- In-place checkout and named branch follow user's requested path; no extra nested worktree.
- WorkItem/Conversation storage retained behind a v3 1:1 invariant to reuse audited request/completion services.
- Tasks 2–5 share screen boundaries and are validated/committed together as one integrated UI slice after the data foundation implementation; this avoids committing broken intermediate navigation.

Return Critical/Important/Minor findings with file:line and reproduction. Include every considered-but-declined concern and an overall verdict. Do not modify files or spawn agents.
