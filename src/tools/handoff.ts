import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { join } from 'node:path';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { WORKSPACE_DIR } from '../workspace.js';

export const handoffTool = tool(
  'session_handoff',
  'Write rich handoff document before clearing context. Use when context 70%+ full and work will continue.',
  {
    summary: z.string().describe('What we were working on (1-2 sentences)'),
    nextSteps: z.string().describe('What to do next, priority order'),
    keyDecisions: z.string().optional().describe('Important decisions that must not be lost'),
    state: z.string().optional().describe('Current state: done/blocked/in-progress'),
    links: z.string().optional().describe('Paths to files, PRs, docs (newline separated)'),
  },
  async (args) => {
    const { summary, nextSteps, keyDecisions, state, links } = args;
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 16).replace('T', '-').replace(/:/g, '');

    // Write handoff doc
    const handoffDir = join(WORKSPACE_DIR, 'handoffs');
    mkdirSync(handoffDir, { recursive: true });
    const handoffPath = join(handoffDir, `${timestamp}.md`);

    const content = [
      `# Handoff: ${timestamp}`,
      '',
      `**Created**: ${now.toLocaleString()}`,
      '',
      '## Summary',
      summary,
      '',
      '## Next Steps',
      nextSteps,
      keyDecisions ? `\n## Key Decisions\n${keyDecisions}` : '',
      state ? `\n## Current State\n${state}` : '',
      links ? `\n## Links\n${links}` : '',
      '',
      '---',
      '*Auto-generated handoff to preserve context before clearing.*'
    ].filter(Boolean).join('\n');

    writeFileSync(handoffPath, content, 'utf-8');

    // Update MEMORY.md with reference (keep max 10)
    const memoryPath = join(WORKSPACE_DIR, 'MEMORY.md');
    const memoryContent = existsSync(memoryPath)
      ? readFileSync(memoryPath, 'utf-8')
      : '# Memory\n';

    const handoffLine = `- [Handoff ${timestamp}](./handoffs/${timestamp}.md) — ${summary.slice(0, 60)}`;

    // Add to Recent Handoffs section or create it
    if (!memoryContent.includes('## Recent Handoffs')) {
      // No handoffs section yet, add it
      const lines = memoryContent.split('\n');
      const updatedContent = lines.join('\n') + `\n\n## Recent Handoffs\n\n${handoffLine}\n`;
      writeFileSync(memoryPath, updatedContent, 'utf-8');
    } else if (!memoryContent.includes(handoffLine.trim())) {
      // Section exists, add this handoff if not already there
      const lines = memoryContent.split('\n');
      const handoffsIdx = lines.findIndex(l => l.trim() === '## Recent Handoffs');

      if (handoffsIdx >= 0) {
        // Find where to insert (after the section header and any existing handoffs)
        let insertIdx = handoffsIdx + 1;
        while (insertIdx < lines.length && (lines[insertIdx].trim() === '' || lines[insertIdx].startsWith('-'))) {
          insertIdx++;
        }

        // Insert the new handoff
        lines.splice(insertIdx, 0, handoffLine);

        // Limit to max 10 handoffs (remove oldest if > 10)
        const handoffLines = lines.filter(l => l.trim().startsWith('- [Handoff'));
        if (handoffLines.length > 10) {
          const toRemove = handoffLines[0]; // oldest
          const removeIdx = lines.indexOf(toRemove);
          if (removeIdx >= 0) lines.splice(removeIdx, 1);
        }

        writeFileSync(memoryPath, lines.join('\n'), 'utf-8');
      }
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: `Handoff document written to ${handoffPath}.\n\nType \`/clear\` when ready to reset context and continue with a fresh session.`
        }
      ],
    };
  }
);
