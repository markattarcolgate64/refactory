import express from 'express';
import bodyParser from 'body-parser';
import {
  createRequest,
  listRequests,
  getRequest,
  createPlan,
  createPlanWithDefinition,
  getPlan,
  createOrchestration,
  getOrchestration,
  listTasks,
  getTask,
  updateTaskStatus,
} from './storage';
import { CreateRequestBody, OrchestrateRequestBody } from './models';

const app = express();
app.use(bodyParser.json());

// POST /requests
app.post('/requests', (req, res) => {
  try {
    const body = req.body as CreateRequestBody;
    const data = createRequest(body.title, body.description);
    res.status(201).json(data);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /requests
app.get('/requests', (_req, res) => {
  res.json(listRequests());
});

// GET /requests/:id
app.get('/requests/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const data = getRequest(id);
  if (!data) return res.status(404).json({ error: 'Request not found' });
  res.json(data);
});

// POST /requests/:id/plans
// If a body with designDoc and tasks is provided, use it; otherwise fallback to static stub
app.post('/requests/:id/plans', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { designDoc, tasks: tasksDef } = req.body as {
    designDoc?: string;
    tasks?: { title: string; detail: string }[];
  };
  try {
    let plan;
    if (designDoc && Array.isArray(tasksDef)) {
      plan = createPlanWithDefinition(id, designDoc, tasksDef);
    } else {
      plan = createPlan(id);
    }
    res.status(202).json({ planId: plan.id, estimatedTasks: plan.tasks.length });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// GET /plans/:id
app.get('/plans/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const plan = getPlan(id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  res.json(plan);
});

// POST /plans/:id/orchestrate
app.post('/plans/:id/orchestrate', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const body = req.body as OrchestrateRequestBody;
  try {
    const orch = createOrchestration(id, body.agents, body.targetBranch || 'main', body.dryRun || false);
    res.status(202).json({ orchestrationId: orch.id });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// GET /orchestrations/:id
app.get('/orchestrations/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const orch = getOrchestration(id);
  if (!orch) return res.status(404).json({ error: 'Orchestration not found' });
  res.json(orch);
});

// GET /tasks
// GET /tasks (optionally filter by planId, state, agent)
app.get('/tasks', (req, res) => {
  const planId = req.query.planId ? parseInt(req.query.planId as string, 10) : undefined;
  const state = req.query.state as any;
  const agent = req.query.agent as string | undefined;
  let result = listTasks(planId, state);
  if (agent) {
    result = result.filter((t) => t.agent === agent);
  }
  res.json(result);
});

// GET /tasks/:id
app.get('/tasks/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const task = getTask(id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

// POST /agents/:agentName/prs (agent reports task completion with PR URL)
app.post('/agents/:agentName/prs', (req, res) => {
  const agentName = req.params.agentName;
  const { task_id, pr_url, status } = req.body as { task_id: number; pr_url?: string; status: string };
  try {
    const task = updateTaskStatus(task_id, status as any, pr_url);
    res.json({ ok: true, task });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Refactory API server running on http://localhost:${port}`);
});