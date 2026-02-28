import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { messageTool } from './messaging.js';
import { calendarTools } from './calendar.js';
import { screenshotTool } from './screenshot.js';
import { browserTool } from './browser.js';
import { goalsTools } from './goals.js';
import { tasksTools } from './tasks.js';
import { researchTools } from './research.js';
import { memoryTools } from './memory.js';
import { handoffTool } from './handoff.js';
// import { libraryTools } from './library.js';

export { messageTool, registerChannelHandler, getChannelHandler, type ChannelHandler } from './messaging.js';
export { setScheduler, getScheduler } from './calendar.js';
export { screenshotTool } from './screenshot.js';
export { browserTool, setBrowserConfig } from './browser.js';
export { loadGoals, saveGoals, type Goal, type GoalStatus, type GoalsState } from './goals.js';
export {
  loadTasks,
  saveTasks,
  appendTaskLog,
  readTaskLogs,
  getTaskPlanPath,
  ensureTaskPlanDoc,
  readTaskPlanDoc,
  writeTaskPlanDoc,
  getTaskPlanContent,
  type Task,
  type TaskStatus,
  type TasksState,
} from './tasks.js';
export { loadResearch, saveResearch, type Research, type ResearchItem } from './research.js';
// export { libraryTools, type Library, type LibraryManifest, type SearchResult } from './library.js';

// all custom tools for this agent
const customTools = [
  messageTool,
  screenshotTool,
  browserTool,
  handoffTool,
  ...calendarTools,
  ...goalsTools,
  ...tasksTools,
  ...researchTools,
  ...memoryTools,
  // ...libraryTools,
];

export function createAgentMcpServer() {
  return createSdkMcpServer({
    name: 'dorabot-tools',
    version: '1.0.0',
    tools: customTools,
  });
}
