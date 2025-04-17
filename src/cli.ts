#!/usr/bin/env node
import { Command } from 'commander';
import axios from 'axios';

const program = new Command();
const API_URL = process.env.REF_API_URL || 'http://localhost:3000';

program
  .command('request:create')
  .description('Create a new request')
  .requiredOption('-t, --title <title>', 'Title')
  .requiredOption('-d, --description <description>', 'Description')
  .action(async (opts) => {
    try {
      const resp = await axios.post(`${API_URL}/requests`, {
        title: opts.title,
        description: opts.description,
      });
      console.log('Created request:', resp.data);
    } catch (err: any) {
      console.error(err.response?.data || err.message);
    }
  });

program
  .command('plan:create <requestId>')
  .description('Create a plan for a request')
  .action(async (requestId) => {
    try {
      const resp = await axios.post(`${API_URL}/requests/${requestId}/plans`);
      console.log('Plan created:', resp.data);
    } catch (err: any) {
      console.error(err.response?.data || err.message);
    }
  });

program
  .command('plan:status <planId>')
  .description('Get status of a plan')
  .action(async (planId) => {
    try {
      const resp = await axios.get(`${API_URL}/plans/${planId}`);
      console.log(resp.data);
    } catch (err: any) {
      console.error(err.response?.data || err.message);
    }
  });

program
  .command('orchestrate <planId>')
  .description('Orchestrate tasks for a plan')
  .option('-a, --agents <number>', 'Number of coder agents', '2')
  .option('-t, --target-branch <branch>', 'Target branch', 'main')
  .option('--dry-run', 'Dry run')
  .action(async (planId, opts) => {
    try {
      const resp = await axios.post(`${API_URL}/plans/${planId}/orchestrate`, {
        agents: parseInt(opts.agents, 10),
        targetBranch: opts.targetBranch,
        dryRun: !!opts.dryRun,
      });
      console.log('Orchestration started:', resp.data);
    } catch (err: any) {
      console.error(err.response?.data || err.message);
    }
  });

program
  .command('tasks:list')
  .description('List tasks for a plan')
  .requiredOption('-p, --plan-id <planId>', 'Plan ID')
  .option('-s, --state <state>', 'Filter by state')
  .action(async (opts) => {
    try {
      const resp = await axios.get(`${API_URL}/tasks`, {
        params: { planId: opts.planId, state: opts.state },
      });
      console.log(resp.data);
    } catch (err: any) {
      console.error(err.response?.data || err.message);
    }
  });

program
  .command('task:inspect <taskId>')
  .description('Inspect a task')
  .action(async (taskId) => {
    try {
      const resp = await axios.get(`${API_URL}/tasks/${taskId}`);
      console.log(resp.data);
    } catch (err: any) {
      console.error(err.response?.data || err.message);
    }
  });

program.parse(process.argv);