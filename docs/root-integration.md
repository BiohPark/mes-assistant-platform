# Root entry integration — 2026-09-23

- Agent Hub moved from agent-hub-demo to repository root; original FlowMES retained in legacy/flowmes.
- Port 5180 (strict) and IndexedDB/localStorage identifiers unchanged.
- Root npm ci, 37 tests and production build passed.
- Edge smoke passed. Lifecycle first run hit a navigation timeout immediately after restore/reload; unchanged repeat passed all assertions. Redesign browser suite will synchronize the restore navigation explicitly.
- This integration is independent of conversation/tag redesign.
