# Model-routing contract

Project work refers to logical responsibilities only:

| Responsibility | Owner | Fallback rule |
| --- | --- | --- |
| Research/context | Research task | Escalate to the configured alternate provider |
| Planning | Planning task | Escalate to the configured alternate provider |
| Implementation | Execution task | Escalate to the configured alternate provider |
| Review/verification | Review and validation tasks | Escalate to the configured alternate provider |

The actual provider/model map is user-scoped global configuration. No API key,
provider secret, or hardcoded model requirement belongs in the repository.
