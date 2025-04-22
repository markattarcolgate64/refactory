#!/usr/bin/env node
import axios from 'axios';
import { OpenAI } from 'openai';

const API_URL = process.env.REF_API_URL || 'http://localhost:3000';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AGENT_NAMES = ['coder1', 'coder2'];

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function fetchPlannedPlans() {
  const resp = await axios.get(`${API_URL}/plans`);
  return (resp.data as any[]).filter((p) => p.state === 'planned');
}

async function fetchAgentStatus(agent: string) {
  // Get tasks assigned to this agent that are not completed
  const resp = await axios.get(`${API_URL}/tasks`, {
    params: { agent, state: 'assigned' }
  });
  return resp.data;
}

async function createTicketsWithLLM(designDoc: string): Promise<{ title: string; detail: string }[]> {
  const prompt = `You are an orchestration agent. Given the following system design and plan, break it down into 1 or 2 separately scoped, actionable engineering tickets for coder agents. Each ticket should have a title and a detailed description, and should be as independent and atomic as possible.\n\nOutput ONLY valid JSON in the following format:\n[\n  { "title": "<ticket title>", "detail": "<ticket detail>" },\n  ...\n]\n\nSystem Design and Plan:\n${designDoc}`;
  const response = await openai.completions.create({
    model: 'o4-mini-high',
    prompt,
    temperature: 0,
    max_tokens: 512,
  });
  const text = response.choices?.[0]?.text || '';
  try {
    const tickets = JSON.parse(text);
    if (Array.isArray(tickets) && tickets.length > 0) {
      return tickets;
    }
    throw new Error('LLM did not return a valid ticket array');
  } catch (e) {
    console.error('Failed to parse LLM tickets:', e, text);
    throw e;
  }
}

async function submitTickets(planId: number, tickets: { title: string; detail: string }[]) {
  // Update the plan with generated tasks (backlog state)
  await axios.post(`${API_URL}/plans/${planId}/tasks`, { tasks: tickets });
}

async function assignTicketToAgent(agent: string, planId: number) {
  // Find a backlog ticket for this plan
  const resp = await axios.get(`${API_URL}/tasks`, { params: { planId, state: 'backlog' } });
  const backlog = resp.data;
  if (!backlog.length) return false;
  const ticket = backlog[0];
  // Assign ticket to agent
  await axios.patch(`${API_URL}/tasks/${ticket.id}`, { agent, state: 'assigned' });
  return true;
}

async function run() {
  const plans = await fetchPlannedPlans();
  if (!plans.length) {
    console.log('No plans to orchestrate');
    return;
  }
  for (const plan of plans) {
    // 1. Generate tickets from LLM if not already present
    const resp = await axios.get(`${API_URL}/tasks`, { params: { planId: plan.id } });
    if (!resp.data.length) {
      const tickets = await createTicketsWithLLM(plan.designDoc);
      await submitTickets(plan.id, tickets);
      console.log(`Created ${tickets.length} tickets for plan ${plan.id}`);
    }
    // 2. Assign tickets to available agents (only if agent has no assigned task)
    for (const agent of AGENT_NAMES) {
      const assigned = await fetchAgentStatus(agent);
      if (assigned.length === 0) {
        const didAssign = await assignTicketToAgent(agent, plan.id);
        if (didAssign) {
          console.log(`Assigned new ticket to agent ${agent} for plan ${plan.id}`);
        }
      }
    }
  }
}

run().catch((e) => {
  console.error('Orchestrator agent error:', e);
  process.exit(1);
});