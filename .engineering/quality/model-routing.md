# Model-routing contract

Project work refers to logical responsibilities only:

| Responsibility | Owner | Fallback rule |
| --- | --- | --- |
| Research/context | GSD Pi research task | Escalate to the configured alternate provider |
| Planning | GSD Pi planning task | Escalate to the configured alternate provider |
| Implementation | GSD Pi execution task | Escalate to the configured alternate provider |
| Review/verification | GSD Pi review and validation tasks | Escalate to the configured alternate provider |

The actual provider/model map is user-scoped global configuration. No API key,
provider secret, or hardcoded model requirement belongs in the repository.
