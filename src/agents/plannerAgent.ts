#!/usr/bin/env node
import axios from 'axios';
import { OpenAI } from 'openai';

const API_URL = process.env.REF_API_URL || 'http://localhost:3000';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AGENT_NAME = process.env.AGENT_NAME || 'planner1';

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Poll for new requests in 'created' state
async function fetchNewRequests() {
  const resp = await axios.get(`${API_URL}/requests`);
  return (resp.data as any[]).filter((r) => r.state === 'created');
}

// Build prompt for the planning agent
function buildPrompt(request: any): string {
  return `You are a planning agent and senior software architect. Take the following user request and flesh it out into a detailed product, system design and project plan, suitable for a team of engineers. Expand on the requirements, clarify any ambiguities, and provide a step-by-step outline of how you would approach building this system.

User Request:
Title: ${request.title}
Description: ${request.description}

Your output should be a clear, organized, and comprehensive plan, including:
- A summary of the product’s purpose, goals, and scope
- Fleshed out system design 
- Key architectural decisions and technology choices
- Major components/modules and their responsibilities
- A step-by-step breakdown of the implementation plan
- Any assumptions, risks, or open questions

Write your response as if you are presenting it to a technical team.`;
}

// Submit plan to the API
async function submitPlan(requestId: number, planDef: any) {
  await axios.post(`${API_URL}/requests/${requestId}/plans`, planDef);
}

async function run() {
  const requests = await fetchNewRequests();
  if (!requests.length) {
    console.log('No new requests to plan');
    return;
  }
  for (const req of requests) {
    console.log(`Planning for request ${req.id}: ${req.title}`);
    const prompt = buildPrompt(req);
    const response = await openai.completions.create({
      model: 'o4-mini-high',
      prompt,
      temperature: 0,
      max_tokens: 1024,
    });
    const enhancedPlan = response.choices?.[0]?.text || '';
    console.log('Enhanced system design and plan:', enhancedPlan);
    await submitPlan(req.id, { designDoc: enhancedPlan });
    console.log(`Submitted enhanced plan for request ${req.id}`);
  }
}

run().catch((e) => {
  console.error('Planner agent error:', e);
  process.exit(1);
});