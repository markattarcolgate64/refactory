export interface Request {
  id: number;
  title: string;
  description: string;
  createdAt: string;
  state: 'created' | 'planned' | 'orchestrating' | 'completed';
}

export interface Task {
  id: number;
  planId: number;
  title: string;
  detail: string;
  agent?: string;
  state: 'unassigned' | 'assigned' | 'in-progress' | 'completed';
  prUrl?: string;
}

export interface Plan {
  id: number;
  requestId: number;
  designDoc: string;
  tasks: Task[];
}

export interface Orchestration {
  id: number;
  planId: number;
  agents: string[];
  targetBranch: string;
  dryRun: boolean;
  tasks: { taskId: number; agent: string }[];
  state: 'assigned' | 'conflict' | 'merged';
}

// Request bodies
export interface CreateRequestBody {
  title: string;
  description: string;
}

export interface OrchestrateRequestBody {
  agents: number;
  targetBranch?: string;
  dryRun?: boolean;
}