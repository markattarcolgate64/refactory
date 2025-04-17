import { Request, Plan, Task, Orchestration } from './models';

let requestCounter = 0;
let planCounter = 0;
let taskCounter = 0;
let orchestrationCounter = 0;

const requests = new Map<number, Request>();
const plans = new Map<number, Plan>();
const tasks = new Map<number, Task>();
const orchestrations = new Map<number, Orchestration>();

export function createRequest(title: string, description: string): Request {
  requestCounter += 1;
  const req: Request = {
    id: requestCounter,
    title,
    description,
    createdAt: new Date().toISOString(),
    state: 'created',
  };
  requests.set(req.id, req);
  return req;
}

export function getRequest(id: number): Request | undefined {
  return requests.get(id);
}

export function listRequests(): Request[] {
  return Array.from(requests.values());
}

export function createPlan(requestId: number): Plan {
  const req = requests.get(requestId);
  if (!req) throw new Error('Request not found');
  planCounter += 1;
  // Mock planner: static tasks
  const designDoc = `Design document for request ${requestId}`;
  const taskDefs: Array<[string, string]> = [
    ['Design API', 'Draft API endpoints and data models'],
    ['Implement Feature', 'Write code for the feature'],
    ['Write Tests', 'Add unit tests for the feature'],
  ];
  const planTasks: Task[] = taskDefs.map(([title, detail]) => {
    taskCounter += 1;
    const t: Task = {
      id: taskCounter,
      planId: planCounter,
      title,
      detail,
      state: 'unassigned',
    };
    tasks.set(t.id, t);
    return t;
  });
  const plan: Plan = {
    id: planCounter,
    requestId,
    designDoc,
    tasks: planTasks,
  };
  plans.set(plan.id, plan);
  // update request state
  req.state = 'planned';
  return plan;
}

export function getPlan(id: number): Plan | undefined {
  return plans.get(id);
}

export function listTasks(planId?: number, state?: Task['state']): Task[] {
  let result = Array.from(tasks.values());
  if (planId !== undefined) {
    result = result.filter(t => t.planId === planId);
  }
  if (state !== undefined) {
    result = result.filter(t => t.state === state);
  }
  return result;
}

export function getTask(id: number): Task | undefined {
  return tasks.get(id);
}

export function createOrchestration(
  planId: number,
  agents: number,
  targetBranch: string = 'main',
  dryRun: boolean = false
): Orchestration {
  const plan = plans.get(planId);
  if (!plan) throw new Error('Plan not found');
  orchestrationCounter += 1;
  const agentNames = Array.from({ length: agents }, (_, i) => `coder${i+1}`);
  const assignments = plan.tasks.map((task, idx) => {
    const agent = agentNames[idx % agentNames.length];
    task.agent = agent;
    task.state = 'assigned';
    tasks.set(task.id, task);
    return { taskId: task.id, agent };
  });
  const orch: Orchestration = {
    id: orchestrationCounter,
    planId,
    agents: agentNames,
    targetBranch,
    dryRun,
    tasks: assignments,
    state: 'assigned',
  };
  orchestrations.set(orch.id, orch);
  return orch;
}

export function getOrchestration(id: number): Orchestration | undefined {
  return orchestrations.get(id);
}
// Update a task's status and optionally its PR URL
export function updateTaskStatus(
  taskId: number,
  status: Task['state'],
  prUrl?: string
): Task {
  const task = tasks.get(taskId);
  if (!task) throw new Error('Task not found');
  task.state = status;
  if (prUrl) {
    task.prUrl = prUrl;
  }
  tasks.set(taskId, task);
  return task;
}