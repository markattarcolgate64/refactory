#!/usr/bin/env node
import axios from 'axios';
import { OpenAI } from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as fileTools from './tools/fileTools';

const API_URL = process.env.REF_API_URL || 'http://localhost:3000';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AGENT_NAME = process.env.AGENT_NAME || 'coder1';
const REPO_PATH = process.env.REF_TARGET_REPO_PATH || "/Users/markattar/Desktop/GitHub/refactory-test-repo";

function safeResolve(targetPath: string): string {
  const absPath = path.resolve(REPO_PATH, targetPath);
  if (!absPath.startsWith(REPO_PATH)) {
    throw new Error('Attempted to access a path outside the target repository!');
  }
  return absPath;
}

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

You have access to the following tools for file and directory operations within the project repository:
- writeFile(relativePath, content): Write or overwrite a file at relativePath with the given content.
- deleteFile(relativePath): Delete the file at relativePath.
- createDirectory(relativePath): Create a directory at relativePath (including parent directories).
- deleteDirectory(relativePath): Delete the directory at relativePath and all its contents.

All paths must be relative to the project root. Do not attempt to access files or directories outside the project root. To update a file, simply use writeFile (it will overwrite any existing file). Output a list of tool calls in valid JSON.

Example:
[
  {"tool": "writeFile", "args": ["src/api/todo.ts", "// file content"]},
  {"tool": "deleteFile", "args": ["oldfile.js"]},
  {"tool": "createDirectory", "args": ["src/utils"]},
  {"tool": "deleteDirectory", "args": ["src/old"] }
]

Please generate a list of tool calls to implement the above task.
Only output the JSON array of tool calls without any additional text.`;
}

async function applyPatch(patch: string) {
  const tmpPatch = path.join(REPO_PATH, `${AGENT_NAME}_patch.diff`);
  try {
    const { execSync } = require('child_process');
    execSync(`patch -p1 < ${tmpPatch}`, { stdio: 'inherit', cwd: REPO_PATH });
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

export async function run() {
  const tasks = await fetchAssignedTasks();
  if (!tasks.length) {
    console.log('No tasks to process');
    return;
  }
  for (const task of tasks) {
    console.log(`Processing task ${task.id}: ${task.title}`);
    // Update: instruct agent to use tool calls for file/directory operations
    const toolPrompt = `You have access to the following tools for file and directory operations within the project repository:\n\n- writeFile(relativePath, content): Write or overwrite a file at relativePath with the given content.\n- deleteFile(relativePath): Delete the file at relativePath.\n- createDirectory(relativePath): Create a directory at relativePath (including parent directories).\n- deleteDirectory(relativePath): Delete the directory at relativePath and all its contents.\n\nAll paths must be relative to the project root. Do not attempt to access files or directories outside the project root. To update a file, simply use writeFile (it will overwrite any existing file). Output a list of tool calls in valid JSON.\n\nExample:\n[\n  {"tool": "writeFile", "args": ["src/api/todo.ts", "// file content"]},\n  {"tool": "deleteFile", "args": ["oldfile.js"]},\n  {"tool": "createDirectory", "args": ["src/utils"]},\n  {"tool": "deleteDirectory", "args": ["src/old"] }\n]\n\nTask: ${buildPrompt(task)}`;
    const response = await openai.responses.create({
      model: 'gpt-4.1',
      instructions: toolPrompt,
      input: buildPrompt(task),
    });
    const toolCalls = JSON.parse(response.output_text);
    for (const call of toolCalls) {
      console.log("Tool xz",call.tool);
      if (typeof fileTools[call.tool as keyof typeof fileTools] === 'function') {
        (fileTools[call.tool as keyof typeof fileTools] as Function)(...call.args);
      } else {
        console.warn(`Unknown tool: ${call.tool}`);
      }
    }
    console.log('Tool calls executed:', toolCalls);
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