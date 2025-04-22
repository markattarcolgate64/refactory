import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import bodyParser from 'body-parser';
import * as coderAgent from './agents/coderAgent'
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
import OpenAI from 'openai';

const app = express();
app.use(bodyParser.json());

// POST /requests
app.post('/requests', (req, res) => {
  try {
    const body = req.body as CreateRequestBody;
    const data = createRequest(body.title, body.description);
    res.status(201).json(data);
  } catch (err: any) {
    console.error('Error creating request:', err);
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
// Orchestration endpoint using modern orchestration logic
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
    console.error('Error updating task status:', err);
    res.status(400).json({ error: err.message });
  }
});


// POST /workflow
// End-to-end workflow: user request → plan (LLM) → tickets (LLM) → ticket assignment
app.post('/workflow', async (req, res) => {
  const { input } = req.body as { input: string };
  if (!input) {
    console.error('Missing input');
    return res.status(400).json({ error: 'Missing input' });
  }
  try {
    // 1. Planning agent (LLM)

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    console.log('OPENAI_API_KEY:', OPENAI_API_KEY);
    if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');
    const client = new OpenAI({ apiKey: OPENAI_API_KEY });
    const planInstructions = `You are a planning agent and senior software architect. Take the following user request and flesh it out into a detailed product, system design and project plan, suitable for a team of engineers. Expand on the requirements, clarify any ambiguities, and provide a step-by-step outline of how you would approach building this system.\n\nYour output should be a clear, organized, and comprehensive plan, including:\n- A summary of the product’s purpose, goals, and scope\n- Fleshed out system design \n- Key architectural decisions and technology choices\n- Major components/modules and their responsibilities\n- A step-by-step breakdown of the implementation plan\n- Any assumptions, risks, or open questions\n\nWrite your response as if you are presenting it to a technical team.`;
    const planResponse = await client.responses.create({
      model: "gpt-4.1",
      instructions: planInstructions,
      input: input,
    });
    const designDoc = planResponse.output_text?.trim() || '';
    if (!designDoc) throw new Error('Planning agent did not return a plan');

    // 2. Create the plan in storage
    const plan = createPlanWithDefinition(
      createRequest(input, input).id,
      designDoc,
      [] // tasks will be added by orchestrator
    );

    // 3. Orchestrator agent (LLM) to generate tickets
    const orchInstructions = `You are an orchestration agent. Given the following system design and plan, break it down into 1 or 2 separately scoped, actionable engineering tickets for coder agents. Each ticket should have a title and a detailed description, and should be as independent and atomic as possible.\n\nOutput ONLY valid JSON in the following format:\n[\n  { "title": "<ticket title>", "detail": "<ticket detail>" },\n  ...\n]`;
    const orchResponse = await client.responses.create({
      model: "gpt-4.1",
      instructions: orchInstructions,
      input: designDoc,
    });
    let tickets;
    try {
      tickets = JSON.parse(orchResponse.output_text || '[]');
    } catch (e) {
      throw new Error('Orchestrator agent did not return valid JSON tickets');
    }
    if (!Array.isArray(tickets) || tickets.length === 0) throw new Error('Orchestrator agent did not return tickets');

    // ... other imports and app setup (not shown above)

    const { tasks } = createPlanWithDefinition(plan.requestId, designDoc, tickets);

    // 5. Assign tickets to coder agents if available (one per agent)
    const agentNames = ['coder1', 'coder2'];
    const assignments = [];
    for (const agent of agentNames) {
      const assigned = tasks.find(t => t.state === 'unassigned');
      if (assigned) {
        assigned.agent = agent;
        assigned.state = 'assigned';
        assignments.push({ ticketId: assigned.id, agent });
      }
    }

    // 6. Run coder agents
    for (const agent of agentNames) {
      await coderAgent.run();
    }

    res.json({
      plan: { id: plan.id, designDoc },
      tickets: tasks.map(t => ({ id: t.id, title: t.title, detail: t.detail, state: t.state, agent: t.agent })),
      assignments,
      status: 'Workflow started. Tickets assigned to agents.'
    });

// Endpoint to run a specific coder agent by name
app.post('/run-coder-agent/:agentName', async (req, res) => {
  const { agentName } = req.params;
  try {
    // Optionally, you can set the agent name dynamically here if your agent supports it
    // For now, just run the agent
    await coderAgent.run();
    res.json({ status: `Coder agent ${agentName} executed.` });
  } catch (e) {
    res.status(500).json({ error: `Failed to run coder agent ${agentName}: ${e}` });
  }
});

// Endpoint to run all coder agents
app.post('/run-all-coder-agents', async (req, res) => {
  try {
    await coderAgent.run();
    res.json({ status: 'All coder agents executed.' });
  } catch (e) {
    res.status(500).json({ error: `Failed to run coder agents: ${e}` });
  }
});
  } catch (err: any) {
    console.error('Workflow error:', err);
    res.status(500).json({ error: err.message });
  }
});

// start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Refactory API server running on http://localhost:${port}`);
});