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
  return `You are a planning agent using OpenAI model o4-mini-high.
Given a user story, generate a high-level design document and a list of scoped tasks.

User Story:
Title: ${request.title}
Description: ${request.description}

Output must be valid JSON with this structure:
{
  "designDoc": "<detailed design document>",
  "tasks": [
    { "title": "<task title>", "detail": "<task detail>" },
    ...
  ]
}

Only output the JSON object.`;
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
    const text = response.choices?.[0]?.text || '';
    console.log('LLM response:', text);
    let planDef;
    try {
      planDef = JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse JSON:', e);
      continue;
    }
    const { designDoc, tasks } = planDef;
    if (!designDoc || !Array.isArray(tasks)) {
      console.error('Invalid plan format');
      continue;
    }
    await submitPlan(req.id, { designDoc, tasks });
    console.log(`Submitted plan for request ${req.id}`);
  }
}

run().catch((e) => {
  console.error('Planner agent error:', e);
  process.exit(1);
});