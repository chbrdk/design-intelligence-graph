# Production Roadmap

The Mac mini target uses a local Ollama-compatible endpoint (`http://127.0.0.1:11434/v1`) with configurable model `gemma4`. The provider remains disabled until capacity, model tag and output policy are validated.

1. Gemma analysis adapter: prompts, JSON validation, budgets, redaction, provenance, evaluation fixtures.
2. Storage adapters: SQLite/Postgres, object storage, graph/vector projections.
3. Remote MCP: authentication, multi-index registry, pagination, rate limits and audit.
4. Renderer: resolve DIG-008 specs into a chosen component system with visual regression.
5. Corpus/evaluation: permissioned real-site fixtures, golden outputs and drift dashboards.
6. **Platform before multi-tenant agent APIs:** DIG as Plexon Collection capability (`dig`) with auth + binding — see `docs/DIG-013-plexon-app.md` and `knowledge/runtime-open-topics-challenge.md`. Live CHECKION peer: `https://checkion-v3.projects-a.plygrnd.tech/`.
7. **Agent value before Flow runtime:** DIG-012 DesignReference emit (dummy OK) → Collection-scoped `dig_reference_*` after auth → DIG-008 look_conditioned; DIG-011 last — see `knowledge/dig-011-challenge.md` and `docs/DIG-012-design-reference.md`.
