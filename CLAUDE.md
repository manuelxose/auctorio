# CLAUDE.md - Auctorio Agent Guide

## Project Context
Auctorio is a content generation and publishing platform using Fastify, Prisma, and BullMQ.

## Behavioral Rules
- **Be Concise**: Minimize token usage by being direct and avoiding fluff.
- **Read First**: Always read a file before editing it.
- **No Unnecessary Files**: Only create files that are essential for the task.
- **Root Protection**: Never save working files or tests to the root folder. Use `/src`, `/tests`, or `/apps`.

## Build & Test Commands
- Build: `npm run build`
- Test: `npm test`
- Typecheck: `npm run typecheck`
- Start API: `npm run start:api`

## Role-Specific Missions

### [ARCHITECT]
Focus on DDD and SOLID principles. Maintain boundaries between `apps/` and shared `packages/` (if any) or internal `src/`.

### [DEVELOPER]
Implement business logic and integrations. Ensure high-quality TypeScript code.

### [TESTER]
Maintain test coverage in `tests/`. Focus on reliability and security.

### [UX/UI]
Owner of the `apps/studio-web` aesthetics. Implement premium, high-impact designs.
