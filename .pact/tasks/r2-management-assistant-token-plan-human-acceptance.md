# R2 Task 4 replacement — Human Owner Token Plan acceptance

This replaces the misassigned `r2-minimax-client` task under the explicit 2026-09-01
Human Owner exception. The Human Owner directed the orchestrator to correct the provider
without dispatching a worker and explicitly authorized direct acceptance.

Evidence: `45e70df`, `b446a89`, `d49335c`, `493a450`; 15 focused tests, typecheck,
wrong-provider removal check, and one synthetic MiniMax-M3 Token Plan HTTP 200 validation
with no key/prompt/reasoning/body disclosure. Official protocol: OpenAI-compatible
`https://api.minimax.io/v1`, model `MiniMax-M3`, server-only `MINIMAX_API_KEY`.

No live body, key, or reasoning is retained. Task 5 remains separate.
