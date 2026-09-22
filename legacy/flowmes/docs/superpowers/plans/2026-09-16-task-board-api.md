# Task board and conversational model configuration

## Scope
Preserve existing browser data. Represent work as ordered task instances composed from reusable modules, with stable module IDs independent of labels. List and workflow views share filters. Board cards appear once at the current module; completed work has its own column. Manual mode is per task and can be applied to the entire work.

## Implementation
1. Add `workflow.ts` migration, module instantiation, filtering and model precedence. Extend types without invalidating existing seeds. Test migration and mixed template grouping first.
2. Add `WorkflowBoard.tsx` and module catalog. Integrate shared module/template filters into Dashboard and module selection/default models into StageEditor. Preserve history when editing work.
3. Add `llm.ts` direct browser Chat Completions adapter, endpoint validation, optional participant names, timeout/abort and explicit error handling. Test request shape and errors with mocked fetch.
4. Add connection settings with memory-only key, model discovery/manual model IDs. Add task chat with independent threads, per-thread model, participant-labelled messages and explicit discussion/assistant call. No simulated response fallback for API failure. File content transmission is explicit and limited to readable text; PDF/Office/image parsing remains an adapter integration.
5. Run unit tests and production build. Inspect desktop UI in a separate local origin so user browser records remain untouched. Update architecture and limitations documentation.

## Shared conversation design
Frontend stores thread/message IDs, author, timestamp, source and model. Only an explicit assistant call sends thread history. Participant metadata is context, not authentication. Production needs authenticated author IDs, shared persistence, ordered messages, one generation lock per thread and broadcasts. This demo does not implement multi-device concurrency or certified audit controls.
