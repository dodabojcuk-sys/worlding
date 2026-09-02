# Tianyan memory and model capability boundaries R0

This document freezes ownership boundaries for the R0.5 → R0.6 transition. It is an architecture contract, not a second product specification and not a deployed memory backend.

## Authority boundary

Canon, Events, Characters, Relations, WorldState, Story Units and source documents remain authoritative business data in their established owners. Agent memory stores references, evidence and task continuity; it is never a shadow copy or alternate writer for those owners. Agents may propose a memory update or a Canon candidate, but only the established review and author-confirmation chain may accept it.

## Seven memory layers

1. Working memory: bounded material for the current reasoning step.
2. Short-term/session memory: messages, receipts and stopping points for one Session.
3. Episodic memory: traceable author/Agent interactions and outcomes.
4. Semantic memory: derived facts and concepts whose provenance remains resolvable.
5. Procedural memory: approved skills, workflows and operating constraints.
6. Prospective memory: future intentions, reminders and pending author decisions.
7. Raw evidence store: original, byte-faithful source material and stable anchors.

Every memory record or retrieval scope must be able to bind the applicable subset of `userId`, `agentId`, `projectId`, `workVersionId`, `eventLine/branchId`, `storyTime/asOfEvent`, `sessionId` and `objectId`. Project, version, branch and story-time filtering is default-deny when required scope is unavailable.

Original evidence is preserved verbatim. Summaries, extracted entities, embeddings and rerank scores are derived indexes and cannot replace or rewrite the original. Retrieval must support a hybrid of vector similarity, keywords, entity relations, time and branch filters, with stable references back to evidence.

## Model ownership

| Capability | Owner/configuration boundary |
| --- | --- |
| Dialogue and reasoning model | Agent configuration through the existing Provider boundary |
| Embedding model | Global configuration supplies only the default for future indexes; every dataset remains bound to its immutable index-generation manifest, and an incompatible change requires a new generation or full rebuild |
| Reranker | Retrieval service configuration |
| Image generation and visual understanding | Tool capabilities, never implicit character or Canon writers |
| API credentials | System Provider configuration only |

Generated images are project assets with provenance: source object, model, prompt, generation version and asset revision. R0.5 makes no model, embedding or image-generation call and stores no credential.

Milvus, pgvector, Qdrant and ChromaDB remain candidates behind a future `VectorStoreBackend`; R0.5 does not select or install one. MemPalace is an architecture reference or replaceable backend candidate only and can never become Tianyan's Canon, Event, Character or source owner.

## R0.6 evaluation gate

R0.6 must define the original-evidence store, stable chunks and references, embedding evaluation, hybrid retrieval, story-time and event-line isolation, backend comparison, and retrieval-specific tests before any runtime backend is selected.
