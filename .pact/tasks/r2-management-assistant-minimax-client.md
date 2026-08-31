# R2 Management Assistant — Task 4: prove and isolate MiniMax-M3

Implement only plan Task 4. First install and inspect exactly `ai`, then
`vercel-minimax-ai-provider`; record installed API/version evidence proving MiniMax-M3,
default Anthropic-compatible protocol, structured output, tools, streaming and exact adaptive
thinking option. If any proof is absent, checkpoint as blocked; never substitute provider,
protocol or model.

Then RED -> GREEN the thin fixed `minimax("MiniMax-M3")` adapter and prompt policy: Standard
thinking off, Deep only verified adaptive option, server output bounds, AbortSignal, no reasoning
or prompt/key persistence, strict outcome/citation validation, sanitized partials, error mapping.
Add synthetic non-live smoke script/tests; never run live smoke unless explicit Token Plan
authorization and `MINIMAX_API_KEY` are present. No route/UI/service/source gate/write/Task5+
work. Run only Task 4 focused tests, typecheck and diff check; handoff + checkpoint `r2-minimax-client`.
