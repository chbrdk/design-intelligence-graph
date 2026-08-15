# Production Roadmap

The Mac mini target uses a local Ollama-compatible endpoint (`http://127.0.0.1:11434/v1`) with configurable model `gemma4`. The provider remains disabled until capacity, model tag and output policy are validated.

1. Gemma analysis adapter: prompts, JSON validation, budgets, redaction, provenance, evaluation fixtures.
2. Storage adapters: SQLite/Postgres, object storage, graph/vector projections.
3. Remote MCP: authentication, multi-index registry, pagination, rate limits and audit.
4. Renderer: resolve DIG-008 specs into a chosen component system with visual regression.
5. Corpus/evaluation: permissioned real-site fixtures, golden outputs and drift dashboards.
