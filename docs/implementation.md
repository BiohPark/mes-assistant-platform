# MES Agent Hub implementation ledger

Approved specification: agent gallery → independent agent-owned work → selective immutable context handoff → SR intake mapped to one designated URS assistant.

## Tasks
- Core normalized model/reducer, permission selectors, seed, acceptance tests.
- Gallery/agent administration/shared API profiles and filtered work board.
- Workspace chat, context search/selection/preview, handoff/detach and immutable snapshots.
- SR intake, requester projection, explicit result sharing, notifications and reports.
- Integration, browser validation, build and documentation.

Ruling: create an independent npm project in `agent-hub-demo/` within the current repository, with new localStorage/IndexedDB names. No automatic import or modification of old demo data.
Ruling: local demo roles enforce UI/reducer projection only; production authentication and multi-device synchronization are outside this frontend scope.
Ruling: preserve existing assistant logic; configured Chat Completions model/assistant IDs select the real integration. External-link agents export context manually.
