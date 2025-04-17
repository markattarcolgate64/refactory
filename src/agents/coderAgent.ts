#!/usr/bin/env node
import axios from 'axios';
import { OpenAI } from 'openai';
import * as fs from 'fs';
import * as path from 'path';

const API_URL = process.env.REF_API_URL || 'http://localhost:3000';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AGENT_NAME = process.env.AGENT_NAME || 'coder1';

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function fetchAssignedTasks() {
  const resp = await axios.get(`${API_URL}/tasks`, {
    params: { agent: AGENT_NAME, state: 'assigned' },
  });
  return resp.data;
}

function buildPrompt(task: any): string {
  const files = fs.readdirSync(process.cwd()).join(', ');
  return `You are an AI coding agent using OpenAI code-davinci-002.
Repository files: ${files}

Task title: ${task.title}
Task detail: ${task.detail}

Please generate a unified diff (patch) to implement the above task.
Only output the diff without any additional text.`;
}

async function applyPatch(patch: string) {
  const tmpPatch = path.join(process.cwd(), `${AGENT_NAME}_patch.diff`);
  fs.writeFileSync(tmpPatch, patch);
  const { execSync } = require('child_process');
  try {
    execSync(`patch -p1 < ${tmpPatch}`, { stdio: 'inherit' });
  } catch (e) {
    console.error('Error applying patch:', e);
  } finally {
    fs.unlinkSync(tmpPatch);
  }
}

async function reportTask(task: any, prUrl: string) {
  await axios.post(`${API_URL}/agents/${AGENT_NAME}/prs`, {
    task_id: task.id,
    pr_url: prUrl,
    status: 'completed',
  });
}

async function run() {
  const tasks = await fetchAssignedTasks();
  if (!tasks.length) {
    console.log('No tasks to process');
    return;
  }
  for (const task of tasks) {
    console.log(`Processing task ${task.id}: ${task.title}`);
    const prompt = buildPrompt(task);
    const response = await openai.completions.create({
      model: 'code-davinci-002',
      prompt,
      temperature: 0,
      max_tokens: 1500,
    });
    const patch = response.choices?.[0]?.text || '';
    console.log('Patch generated:');
    console.log(patch);
    applyPatch(patch);
    // TODO: commit, push branch, open PR; using mock PR URL for now
    const prUrl = `https://example.com/pr/${task.id}`;
    await reportTask(task, prUrl);
    console.log(`Task ${task.id} reported as completed, PR: ${prUrl}`);
  }
}

run().catch((e) => {
  console.error('Agent error:', e);
  process.exit(1);
});