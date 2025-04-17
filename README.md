# Refactory Orchestrator
Refactory is a hybrid Command‑Line Interface (CLI) and HTTP API for orchestrating AI‑driven coding agents. It automates the lifecycle from a raw user request, through planning, task assignment, code generation, and finally reconciliation of generated code into a single codebase.

## Architecture Overview
1. **Planner Agent** (stubbed MVP) generates a design document and a list of scoped tasks for a given request.
2. **Orchestration Layer** assigns tasks to N Coder Agents (round‑robin) and tracks task state.
3. **Coder Agents** (e.g. `coder1`, `coder2`) use OpenAI’s `code‑davinci‑002` model to generate code patches for their tasks, apply the patches locally, and report completion via the API.
4. **Reconciliation** (future) will merge all task PRs into a final branch and open a consolidated pull request.

This MVP uses an in‑memory store. You can extend it with persistent storage, real Git operations, CI checks, and RBAC.

+-------------+
|  User Input |
+-------------+
       |
       v
+----------------+
| Planner Agent  |
+----------------+
       |
       v
+----------------------+
| Orchestrator Agent  |
+----------------------+
      /        \
     v          v
+----------+ +----------+
| Coder 1  | | Coder 2  |
+----------+ +----------+
     |            |
     v            v
+----------+ +----------+
| Tester 1 | | Tester 2 |
+----------+ +----------+
      \        /
       v      v
+----------------------+
| Orchestrator Agent  |
+----------------------+
       |
       v
+---------------+
| Review Agent  |
+---------------+
       |
       v
+---------------+
| Launch Agent  |
+---------------+


Install dependencies:
   ```bash
   npm install
   ```

Configure environment variables:
   ```bash
   export REF_API_URL=http://localhost:3000   # (optional, default)
   export OPENAI_API_KEY=<your_openai_api_key>
   export AGENT_NAME=coder1                   # for the coder agent process
   ```

## Running the API Server

Start the Express server in development mode:
```bash
npm run dev:server
```
The API will listen on port 3000 by default.

## CLI Usage

The `src/cli.ts` wraps HTTP calls to the API. Run via:
```bash
npm run start:cli -- <command> [options]
```

### Commands
- `request:create` – Create a new user request
  ```bash
  npm run start:cli -- request:create \
    --title "Add metrics dashboard" \
    --description "Generate UI and API for metrics"
  ```
- `plan:create <requestId>` – Generate a plan (tasks) for a request
  ```bash
  npm run start:cli -- plan:create 1
  ```
- `plan:status <planId>` – View the plan and task list
  ```bash
  npm run start:cli -- plan:status 1
  ```
- `orchestrate <planId>` – Assign tasks to coder agents
  ```bash
  npm run start:cli -- orchestrate 1 --agents 2 --target-branch main
  ```
- `tasks:list` – List tasks for a plan
  ```bash
  npm run start:cli -- tasks:list --plan-id 1 --state assigned
  ```
- `task:inspect <taskId>` – Inspect a single task
  ```bash
  npm run start:cli -- task:inspect 2
  ```

## Coder Agent

Each Coder Agent polls the API for its assigned tasks, generates code diffs via OpenAI, applies patches, and reports completion.

Start a coder agent process:
```bash
npm run start:coder-agent
```

It will:
1. `GET /tasks?agent=<AGENT_NAME>&state=assigned`
2. Build a prompt for `code‑davinci‑002` including:
   - Repository file list
   - Task title & detail
3. Request a patch, apply it via `patch -p1`
4. `POST /agents/<AGENT_NAME>/prs` to report task completion and PR URL

## API Reference

- `POST /requests` – create a user request
- `GET /requests` – list all requests
- `GET /requests/{id}` – get a specific request
- `POST /requests/{id}/plans` – generate a plan
- `GET /plans/{id}` – view plan & tasks
- `POST /plans/{id}/orchestrate` – assign tasks to coder agents
- `GET /orchestrations/{id}` – view orchestration details
- `GET /tasks` – list tasks (filter by `planId`, `state`, `agent`)
- `GET /tasks/{id}` – inspect a task
- `POST /agents/{agentName}/prs` – record task completion and PR URL

## Extensibility & Next Steps

- Swap the in‑memory store for a database (PostgreSQL, MongoDB)
- Implement real Git operations: branch creation, commit, push, PR creation via GitHub/GitLab APIs
- Add a persistent Planner Agent (LLM‑driven or templated)
- Build a reconciliation pipeline to merge task PRs and run CI
- Enhance security: authentication, RBAC, audit logs
  
Enjoy building with Refactory! 🚀
