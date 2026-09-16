# Model-routing contract

Project work refers to logical responsibilities only:

| Responsibility | Owner | Fallback rule |
| --- | --- | --- |
| Research/context | the workflow tool research task | Escalate to the configured alternate provider |
| Planning | the workflow tool planning task | Escalate to the configured alternate provider |
| Implementation | the workflow tool execution task | Escalate to the configured alternate provider |
| Review/verification | the workflow tool review and validation tasks | Escalate to the configured alternate provider |

The actual provider/model map is user-scoped global configuration. No API key,
provider secret, or hardcoded model requirement belongs in the repository.
