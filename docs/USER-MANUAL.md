# Dorabot User Manual

A complete guide to understanding and using dorabot: what it does, when it does it, and how to control it.

---

## Table of Contents

1. [How It Actually Works](#how-it-actually-works)
2. [The Pulse (Autonomous Background Agent)](#the-pulse)
3. [Memory System](#memory-system)
4. [Goals and Tasks](#goals-and-tasks)
5. [Scheduling and Calendar](#scheduling-and-calendar)
6. [Channels (Desktop, Telegram, WhatsApp)](#channels)
7. [Research System](#research-system)
8. [Library System](#library-system)
9. [Browser Automation](#browser-automation)
10. [Skills](#skills)
11. [Agents and Sub-Agents](#agents-and-sub-agents)
12. [Permissions and Security](#permissions-and-security)
13. [Configuration Reference](#configuration-reference)
14. [File Paths Reference](#file-paths-reference)
15. [Commands Reference](#commands-reference)

---

## How It Actually Works

This is the section you won't find in the README. Here's what dorabot is actually doing.

### Everything is an agent run

There is no "programmatic response" path. Every interaction, whether you type in the desktop app, send a Telegram message, or a scheduled task fires, goes through the same flow:

```
Trigger (you, a channel message, a schedule, the pulse)
  |
  v
handleAgentRun()
  |
  v
streamAgent()  <-- Full Claude LLM call with tools
  |
  v
Agent decides which tools to call
  |
  v
Tools execute (database writes, file ops, messages, browser actions)
  |
  v
Agent synthesizes a response
```

Every single interaction costs tokens. There are no "free" operations at the agent level.

### When agents run (without you doing anything)

You might think agents only run when you open the chat. Here's the full list:

| Trigger | When | What Happens |
|---------|------|--------------|
| **You type in desktop** | When you send a message | Agent runs, responds in chat |
| **Telegram/WhatsApp message** | When someone messages the bot | Agent runs, responds in channel |
| **The Pulse** | On a schedule (default: 30m working, 2h off-peak, 6h overnight) | Agent wakes up, checks goals/tasks, advances work, may message you |
| **Scheduled tasks** | At the time you set | Agent runs with the task's message as its prompt |
| **Reminders** | At the time you set | Agent runs, then auto-deletes the reminder |

The pulse is the big one. If you're in autonomous mode, there's an agent running on a schedule (every 30 minutes during working hours, less frequently at other times) that can create goals, update tasks, do research, browse the web, and message you. It's not a cron job that checks a flag. It's a full LLM agent run.

### What survives between sessions

Agent sessions are ephemeral. When context fills up or you run `/clear`, the conversation is gone. What persists:

- **MEMORY.md**: Curated facts, preferences, decisions (loaded every session)
- **USER.md**: Your profile (loaded every session)
- **SOUL.md**: Agent personality (loaded every session)
- **Daily journals**: Detailed logs at `~/.dorabot/workspace/memories/YYYY-MM-DD/MEMORY.md`
- **Handoffs**: Context snapshots in `~/.dorabot/workspace/handoffs/`
- **SQLite database**: All messages, goals, tasks, research, calendar items
- **Browser profile**: Logged-in sessions at `~/.dorabot/browser/profile/`

The pulse agent relies entirely on memory files for continuity. It starts fresh every run and reads the journal to know what it did last time.

### Session keys

Every conversation has a session key that determines context continuity:

```
desktop:dm:default           -- Your desktop chat
telegram:dm:123456789        -- A Telegram DM
telegram:group:987654321     -- A Telegram group
whatsapp:dm:1234@s.whatsapp.net  -- A WhatsApp DM
calendar:dm:autonomy-pulse-{ts}  -- A pulse run (new each time)
```

Messages within the same session key share context. Different keys are isolated. The pulse gets a fresh session every run.

---

## The Pulse

The pulse is an autonomous agent that runs on a schedule. It's the reason dorabot "works while you sleep."

### What it does

Every pulse, the agent:

1. **Reads today's journal** to see what it's already done
2. **Checks goals and tasks** via the goals/tasks tools
3. **Advances in-progress work** (executes next steps, updates task status)
4. **Acts on monitored things** (checks websites, APIs, whatever it's been told to watch)
5. **Follows up with you** if you answered previous questions
6. **Handles blockers** by messaging you or finding workarounds
7. **Does research** and stores findings
8. **Proposes new goals/tasks** if it notices something worth doing
9. **Creates momentum** by breaking large tasks into smaller ones
10. **Logs everything** to today's journal

After acting, it may message you on Telegram/WhatsApp if something important happened.

### Configuration

The pulse operates in three modes, each with its own interval and priority level. The active mode is determined by the current time and your configured schedule slots.

| Mode | Default Hours | Default Interval | Priority | Description |
|------|---------------|------------------|----------|-------------|
| **working** | 9:00 - 18:00 | 30m | full | Execute tasks, verify work, propose ideas, message you |
| **off-peak** | 18:00 - 23:00 | 2h | reduced | Advance approved tasks, verification only, no new proposals |
| **overnight** | 23:00 - 9:00 | 6h | minimal | Light maintenance, no messaging, no proposals |

Each mode can be customized with:
- **Interval**: How often the pulse fires (`15m`, `30m`, `1h`, `2h`, `4h`, `6h`)
- **Priority level**: What the pulse is allowed to do (`full`, `reduced`, `minimal`)
- **Custom prompt**: Additional instructions for that mode
- **Schedule slots**: Which hours each mode covers (timezone-aware, DST handled)

| Setting | Options | Default |
|---------|---------|---------|
| Autonomy mode | `supervised`, `autonomous` | `supervised` |

In **supervised** mode, the pulse still runs but asks permission before external actions.
In **autonomous** mode, it acts freely (except for truly destructive operations).

**One task per pulse**: Each pulse run executes at most one task, one verification step, or one goal check. This prevents context window blowouts and keeps each run focused.

### Controlling the pulse

- **Desktop**: Settings > Autonomy section (mode toggle), Automations tab (schedule slots, intervals, custom prompts)
- **Config**: Set `autonomy` to `supervised` or `autonomous` in `~/.dorabot/config.json`
- **Disable entirely**: Set autonomy to `supervised` and disable the pulse schedule in the Automations tab

### macOS notifications

The pulse sends native notifications:
- "Checking in... 👀" when it starts
- "Sent you a message 👀" if it messaged you
- "All caught up ✓" if there was nothing to do

---

## Memory System

Dorabot has layered memory. Understanding what lives where is key to getting the most out of it.

### The layers

```
~/.dorabot/workspace/
  SOUL.md          -- Personality. How the agent speaks and thinks.
  USER.md          -- Your profile. Who you are, your goals, context.
  MEMORY.md        -- Working knowledge. Preferences, decisions, active context.
  AGENTS.md        -- Agent-specific instructions (optional).
  memories/
    2026-02-27/
      MEMORY.md    -- Today's journal. Detailed timestamped log.
    2026-02-26/
      MEMORY.md    -- Yesterday's journal.
  handoffs/
    2026-02-27-1915.md  -- Context snapshot from a previous session.
```

### What each file does

**SOUL.md** defines the agent's personality and tone. Edit this to change how it communicates. If you want it blunt, make it blunt. If you want it formal, make it formal.

**USER.md** is your profile. The agent updates it when it learns something about you (with your permission in supervised mode). Contains your name, timezone, family, work context, goals.

**MEMORY.md** is the working memory. Capped at 500 lines. Contains active context, preferences, decisions, technical notes. The agent is supposed to keep this curated: adding important things, pruning stale ones. This is loaded into every session's system prompt, so it's always available.

**Daily journals** are detailed logs. Every action the agent takes gets a timestamped entry. The last 3 days of journals are loaded into the system prompt, giving the agent recent context. Older journals are searchable but not auto-loaded.

**Handoffs** are context snapshots written before clearing a session. When a conversation gets too long (context window filling up), the agent writes a handoff document capturing what was happening, what decisions were made, and what to do next. The next session reads the handoff and picks up where things left off.

### Memory search

All messages (yours and the agent's) are stored in SQLite with full-text search. You can search by:

- **Query**: Any text, exact phrases in quotes
- **Channel**: desktop, telegram, whatsapp
- **Origin**: pulse, scheduled_task, desktop_user, telegram_user, whatsapp_user
- **Time range**: before/after dates
- **Type**: user messages, assistant messages, tool results

### Session idle timeout

If you don't message for 4 hours, the session resets. Next message starts a fresh context (but memory files are still loaded).

---

## Goals and Tasks

The goals/tasks system is a structured pipeline for getting work done. The agent proposes work, you approve it, the agent executes it.

### The pipeline

```
1. Agent creates a goal (or you ask for one)
2. Agent creates tasks under that goal (status: draft)
3. Agent writes a plan for each task
4. Agent sets task to "reviewed" (appears in Needs Approval)
5. You review and approve (or deny) in the Goals tab
6. Agent picks up the approved task, sets to "running"
7. Agent works, then hands off with tasks_done (status: checking)
8. Verification runs (agent or human), then task moves to done
```

### Goal statuses (modes of attention)

- **holding**: You're still thinking about this. Agent hands off entirely.
- **developing**: Idea needs fleshing out. Agent can research, suggest, propose tasks, but does not execute.
- **active**: Has approved tasks, ready for execution. Normal workflow.
- **checking**: Work is done, needs verification against original intent. A different agent reviews.
- **done**: Completed and verified.

### Task statuses

- **draft**: Agent is still writing the plan
- **reviewed**: Plan written and reviewed, waiting for your approval
- **approved**: You approved the plan, agent can start work
- **running**: Actively being worked on
- **checking**: Work complete, being verified (see [Task Verification Pipeline](#task-verification-pipeline))
- **done**: Completed with results
- **blocked**: Stuck on something (orthogonal, can happen at any stage)
- **cancelled**: Abandoned (orthogonal)

### Approval flow

This is important: **the agent cannot start work on a task without your approval.** The flow is:

1. Agent writes a plan (stored at `~/.dorabot/plans/tasks/{id}/PLAN.md`)
2. Task appears in "Needs Approval" section of the Goals tab
3. You read the plan and click Approve or Deny
4. If approved, the agent can start it (it will ask first or you can start it from the Goals tab)
5. If denied, the agent revises the plan or drops the task

### Task verification pipeline

When an agent finishes a task, it doesn't mark it "done" directly. Instead, it hands off the work for verification:

1. **Agent A (executor)** completes the work and calls `tasks_done` with a result summary and handoff notes. Status moves to `checking`.
2. **Pulse 1 (code verification)**: The next pulse run checks the work functionally: do files exist? Does the build pass? Are there errors? Logs `CODE_VERIFY: PASS/FAIL`.
3. **Pulse 2 (fit verification)**: The following pulse checks plan compliance and goal alignment. Does the delivery match the plan? Does it advance the goal? Logs `FIT_VERIFY: PASS/FAIL`.
4. **If both pass**: The task's `verificationType` determines what happens next:
   - `agent-verified`: Pulse marks the task done automatically. Use for objectively testable work (config, backend, tests).
   - `human-verified`: Pulse adds a verification summary and waits for you to confirm. Use for UI, qualitative work, architectural decisions.
5. **If either fails**: Task moves back to `approved` with a failure reason. A fresh agent picks it up.

Each verification step runs in a separate pulse session. No shared context between executor and verifiers.

### Who creates goals and tasks?

Both you and the agent. You can ask "create a goal for X" in chat. The pulse agent also creates them autonomously when it notices something worth doing. In autonomous mode, you might open the Goals tab and find new tasks you didn't ask for. That's the pulse doing its job.

### Where to manage them

- **Desktop**: Goals tab (primary interface)
- **Chat**: Ask the agent to create/update/view goals and tasks
- **Telegram/WhatsApp**: Same as chat, just in that channel

---

## Scheduling and Calendar

Dorabot has a built-in calendar system that can trigger agent runs at specific times.

### Item types

- **Event**: Runs at a scheduled time (can recur)
- **Todo**: Has a due date
- **Reminder**: Runs once, then auto-deletes

### How it works

When a calendar item's time arrives, dorabot spawns a full agent run with the item's `message` field as the prompt. The agent can do anything: check websites, send messages, update tasks, write files.

The scheduler ticks every 60 seconds (configurable) and checks for items whose `nextRunAt` has passed.

### RRULE support

Recurrence uses the iCal RRULE standard (RFC 5545). Examples:

```
Daily at 9am London time:
  dtstart: "2026-03-01T09:00:00"
  rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0"
  timezone: "Europe/London"

Every Monday and Friday at 10am:
  rrule: "FREQ=WEEKLY;BYDAY=MO,FR;BYHOUR=10;BYMINUTE=0"

Every 2 hours:
  rrule: "FREQ=HOURLY;INTERVAL=2"

One-shot (no rrule, just dtstart):
  dtstart: "2026-03-15T14:00:00"
  deleteAfterRun: true
```

When `timezone` is set, BYHOUR/BYMINUTE are wall-clock time in that timezone. DST is handled automatically.

### Managing schedules

- **Desktop**: Automations tab
- **Chat**: "Schedule a reminder for..." or use the schedule tool directly
- **Telegram/WhatsApp**: Same as chat

### Apple Calendar sync

Scheduled items use the iCal standard, so they can sync with Apple Calendar, showing on your Mac, Watch, and iPhone.

---

## Channels

Dorabot runs on multiple channels simultaneously. The same agent, same memory, same tools.

### Desktop

The primary interface. Multi-pane chat with split views (Cmd+D), streaming responses, image attachments (drag and drop), and all management tabs (Goals, Research, Settings, etc.).

### Telegram

Connect a Telegram bot. The agent responds to DMs and (optionally) group messages.

**Setup**: Create a bot via @BotFather, add the token in the Channels tab.

**Commands available in Telegram**:
- `/new` or `/clear` or `/reset`: Start a fresh conversation
- `/status`: Show session info
- `/handoff`: Write a handoff document and clear context

**Approval**: When the agent needs permission for something, it sends inline keyboard buttons (Allow / Deny).

**Voice messages**: Supported. Transcribed automatically, then processed as text.

**Media**: Send photos, documents, audio. The agent can see them.

### WhatsApp

Connect via QR code (Baileys library). Same capabilities as Telegram.

**Commands**: Same as Telegram (`/new`, `/clear`, `/reset`, `/status`, `/handoff`).

**Approval**: Text-based. Reply with `1`/`allow`/`yes` or `2`/`deny`/`no`.

### Channel policies

Each channel can be configured independently:

```json
{
  "channels": {
    "telegram": {
      "dmPolicy": "open",
      "groupPolicy": "allowlist",
      "allowFrom": ["123456789"],
      "tools": {
        "allow": ["message", "Read"],
        "deny": ["Bash"]
      },
      "allowedPaths": ["~/Desktop"],
      "deniedPaths": ["~/Private"]
    }
  }
}
```

- **dmPolicy**: `open` (anyone can DM) or `allowlist` (only `allowFrom` IDs)
- **groupPolicy**: `open`, `allowlist`, or `disabled`
- **tools**: Allow/deny specific tools per channel
- **paths**: Restrict file access per channel

### Differences between channels

| Feature | Desktop | Telegram | WhatsApp |
|---------|---------|----------|----------|
| Management tabs | Yes | No | No |
| Split panes | Yes | No | No |
| Voice messages | No | Yes | Yes |
| Media send/receive | Images only | Full | Full |
| Edit/delete messages | No | Yes | Yes |
| Reactions | No | Yes | Yes |
| Groups | No | Yes | Yes |
| Approval UI | Dialog | Inline buttons | Text reply |

---

## Research System

The agent can create and maintain research documents on topics you care about.

### How it works

Research items are markdown files with YAML frontmatter, stored at `~/.dorabot/research/{topic}/{title}.md`. Each has a status (active, completed, archived), optional tags, and source links.

### When research gets created

- You ask: "Research X for me"
- The pulse agent decides something needs investigating
- A scheduled task triggers research
- During a goal/task, the agent stores findings as research

### Managing research

- **Desktop**: Research tab (browse, filter by status/topic, view full content)
- **Chat**: "Show me my research on X" or use research tools directly
- **Search**: Memory search covers research content too

### Research format

```markdown
---
title: "Multi-Agent Systems Overview"
topic: "AI Agents"
status: active
tags: [agents, orchestration]
sources:
  - https://example.com/paper
---

Content here...
```

---

## Library System

Libraries let you index collections of documents (markdown, text, PDF) so the agent can search them with keyword matching (BM25). Think of it as a personal knowledge base the agent can reference.

### How it works

A library points at a directory of files. When you add a library, dorabot indexes every matching file. The agent can then search across all libraries (or specific ones) to find relevant passages.

### Managing libraries

- **Desktop**: Libraries tab (add, browse, search, reindex)
- **Chat**: "Search my libraries for X" or use library tools directly

### Library tools

| Tool | What it does |
|------|-------------|
| `library_add` | Register a new library (name, path, domains, file types) |
| `library_list` | List all libraries with metadata |
| `library_remove` | Remove a library and its index |
| `library_search` | Search across libraries using BM25 keyword search |
| `library_reindex` | Force re-index after manual file changes |

### Library properties

| Property | Description |
|----------|-------------|
| **name** | Display name for the library |
| **path** | Directory containing the documents |
| **domains** | Subject tags (e.g. `["music", "production"]`) |
| **fileTypes** | Extensions to index (default: `.md`, `.txt`, `.pdf`) |
| **trustLevel** | `authoritative`, `experimental`, or `external` |
| **updateFrequency** | `live`, `daily`, or `static` |

### Example

```json
{
  "name": "Worship Music Notes",
  "path": "/Users/me/Documents/worship",
  "domains": ["music", "worship"],
  "fileTypes": [".md", ".txt"],
  "trustLevel": "authoritative",
  "updateFrequency": "static"
}
```

---

## Browser Automation

Dorabot can control a real Chrome browser with your existing login sessions.

### Key points

- **Persistent profile**: Uses `~/.dorabot/browser/profile/`. You're already logged into everything.
- **90+ actions**: Navigate, click, fill forms, take screenshots, read network requests, evaluate JavaScript.
- **No credentials**: The agent never asks for or fills in login credentials. If it hits a login page, it asks you to log in manually.

### Common uses

- Checking websites for updates
- Filling out forms
- Taking screenshots
- Extracting data from pages
- Monitoring dashboards

### Configuration

```json
{
  "browser": {
    "enabled": true,
    "headless": false,
    "cdpPort": 19222,
    "profileDir": "~/.dorabot/browser/profile/"
  }
}
```

Set `headless: true` if you don't want to see the browser window.

---

## Skills

Skills are packaged instructions that teach the agent how to do specific things.

### Built-in skills

| Skill | What it does |
|-------|-------------|
| **github** | GitHub operations via `gh` CLI (issues, PRs, CI, API) |
| **macos** | macOS control via AppleScript (windows, apps, system, Spotify) |
| **meme** | Generate memes via memegen.link API |
| **onboard** | Interview you to build USER.md and SOUL.md |
| **review-pr** | Structured GitHub PR review |
| **remotion** | Video creation in React |
| **himalaya** | Email via himalaya CLI |
| **polymarket** | Polymarket integration |
| **orchestrating-swarms** | Multi-agent coordination with teams and task queues |

### How skills work

When you send a message, dorabot checks if any skill matches your request (by name or keywords). If it matches, the skill's instructions are loaded and guide the agent's behavior.

### Community skills

Browse 56,000+ community skills via the Extensions tab. Install them to `~/.dorabot/skills/`.

### MCP servers

Connect external tool servers (7,300+ available via Smithery). Configure in:

```json
{
  "mcpServers": {
    "server-name": {
      "type": "stdio",
      "command": "/path/to/server",
      "args": ["--flag"]
    }
  }
}
```

---

## Agents and Sub-Agents

When the agent needs to do parallel or specialized work, it spawns sub-agents.

### Built-in agent types

| Agent | Purpose | Model |
|-------|---------|-------|
| code-review | Code quality, security, best practices | sonnet |
| researcher | Web search and summarization | haiku |
| file-organizer | File and directory restructuring | sonnet |
| test-writer | Writing tests | sonnet |
| doc-writer | Documentation generation | haiku |
| refactor | Code refactoring | sonnet |
| debugger | Issue debugging | sonnet |
| planner | Implementation planning | sonnet |
| librarian | Semantic search across user libraries | haiku |
| strategic-partner | Deep reasoning, planning, problem-solving | opus |

### Custom agents

Define your own in config:

```json
{
  "agents": {
    "my-agent": {
      "description": "What it does",
      "tools": ["Read", "Write", "Bash"],
      "prompt": "You are a specialist in...",
      "model": "sonnet"
    }
  }
}
```

### Disabling agents

```json
{
  "disabledAgents": ["researcher", "doc-writer"]
}
```

Built-in agents can be disabled but not deleted. Custom agents can be both.

---

## Permissions and Security

### Permission modes

Two settings control what requires approval:

**`config.permissionMode`** (Claude Code SDK level):

| Mode | Behavior |
|------|----------|
| `default` | Normal permission checking |
| `acceptEdits` | Auto-approve file edits, ask for other sensitive ops |
| `bypassPermissions` | Skip all permission checks |
| `plan` | Plan mode (read-only, no writes) |
| `dontAsk` | Don't ask, deny if not auto-allowed |
| `delegate` | Delegate permission decisions |

**`config.security.approvalMode`** (dorabot layer):

| Mode | Behavior |
|------|----------|
| `approve-sensitive` (default) | Ask before destructive operations |
| `autonomous` | Auto-approve all tools |
| `lockdown` | Ask before almost everything |

These work together: `permissionMode` controls SDK-level permissions, `approvalMode` controls dorabot's own approval layer on top. Setting autonomy to `autonomous` in the UI syncs both: `approvalMode` to `autonomous` and `permissionMode` to `bypassPermissions`.

### What requires approval (in approve-sensitive mode)

- **File writes**: Write, Edit tools
- **Destructive bash**: `rm`, `sudo`, `git push`, `mv`, fork bombs, etc.
- **Messaging**: Sending to WhatsApp/Telegram (unless channel policy allows)
- **Browser**: All browser actions
- **Scheduling**: Creating/modifying scheduled tasks

### What never requires approval

- Reading files
- Searching (Grep, Glob)
- Viewing goals, tasks, research
- Listing schedules
- Memory search

### Always-blocked paths

These paths are blocked regardless of any config:

- `~/.ssh`
- `~/.gnupg`
- `~/.aws`
- `~/.dorabot/whatsapp/auth`
- `~/.dorabot/gateway-token`
- `~/.dorabot/gateway.sock`

### Channel-specific permissions

Each channel can have its own tool allow/deny lists and path restrictions. See [Channels](#channels) above.

### Approval timeout

When the agent requests approval (in any channel), you have 10 minutes to respond (configurable via `questionTimeoutMs` in config). After that, the request is auto-denied.

---

## Configuration Reference

All configuration lives in `~/.dorabot/config.json`.

### Core settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `model` | string | `claude-sonnet-4-5-20250929` | Default LLM model |
| `autonomy` | `supervised` \| `autonomous` | `supervised` | Autonomy mode |
| `permissionMode` | string | `default` | Permission checking mode |
| `maxTurns` | number | -- | Max agent turns per run |
| `maxBudgetUsd` | number | -- | Budget cap in USD |
| `userName` | string | -- | Your name |
| `userTimezone` | string | -- | IANA timezone (e.g. `Europe/London`) |

### Provider settings

| Key | Type | Description |
|-----|------|-------------|
| `provider.name` | `claude` \| `codex` \| `minimax` | AI provider |
| `reasoningEffort` | `minimal` \| `low` \| `medium` \| `high` \| `max` | Thinking depth |
| `thinking` | `adaptive` \| `disabled` \| object | Extended thinking config |

### Security settings

| Key | Type | Description |
|-----|------|-------------|
| `security.approvalMode` | `approve-sensitive` \| `autonomous` \| `lockdown` | Tool approval mode |
| `security.tools.allow` | string[] | Globally allowed tools |
| `security.tools.deny` | string[] | Globally denied tools |
| `questionTimeoutMs` | number (default: 600000) | Approval/question timeout in ms (10 minutes) |

### Sandbox settings

| Key | Type | Description |
|-----|------|-------------|
| `sandbox.enabled` | boolean | Enable sandboxing |
| `sandbox.mode` | `off` \| `non-main` \| `all` | Which channels to sandbox |
| `sandbox.workspaceAccess` | `none` \| `ro` \| `rw` | Sandbox workspace access |

### Channel settings

| Key | Type | Description |
|-----|------|-------------|
| `channels.telegram.enabled` | boolean | Enable Telegram |
| `channels.telegram.botToken` | string | Bot token from @BotFather |
| `channels.telegram.accountId` | string | Your Telegram user ID |
| `channels.telegram.dmPolicy` | `open` \| `allowlist` | Who can DM the bot |
| `channels.telegram.groupPolicy` | `open` \| `allowlist` \| `disabled` | Group access |
| `channels.telegram.allowFrom` | string[] | Allowed user IDs |
| `channels.telegram.tools` | object | Tool allow/deny lists |
| `channels.whatsapp.*` | -- | Same structure as Telegram |

### Browser settings

| Key | Type | Description |
|-----|------|-------------|
| `browser.enabled` | boolean | Enable browser |
| `browser.headless` | boolean | Hide browser window |
| `browser.cdpPort` | number | Chrome DevTools port (default: 19222) |

### Calendar settings

| Key | Type | Description |
|-----|------|-------------|
| `calendar.enabled` | boolean | Enable scheduler |
| `calendar.tickIntervalMs` | number | Check interval in ms (default: 60000) |

### Gateway settings

| Key | Type | Description |
|-----|------|-------------|
| `gateway.port` | number | Gateway server port |
| `gateway.host` | string | Gateway bind address |
| `gateway.allowedPaths` | string[] | Allowed file paths |
| `gateway.deniedPaths` | string[] | Denied file paths |

---

## File Paths Reference

### Workspace files (loaded every session)

| Path | Purpose |
|------|---------|
| `~/.dorabot/workspace/SOUL.md` | Agent personality |
| `~/.dorabot/workspace/USER.md` | Your profile |
| `~/.dorabot/workspace/MEMORY.md` | Working knowledge (max 500 lines) |
| `~/.dorabot/workspace/AGENTS.md` | Agent-specific instructions |

### Data storage

| Path | Purpose |
|------|---------|
| `~/.dorabot/config.json` | All configuration |
| `~/.dorabot/dorabot.db` | SQLite database (messages, goals, tasks, research, calendar) |
| `~/.dorabot/workspace/memories/YYYY-MM-DD/MEMORY.md` | Daily journals |
| `~/.dorabot/workspace/handoffs/*.md` | Session handoff documents |
| `~/.dorabot/plans/tasks/{id}/PLAN.md` | Task plan documents |
| `~/.dorabot/research/{topic}/{title}.md` | Research documents |

### System files

| Path | Purpose |
|------|---------|
| `~/.dorabot/gateway-token` | Gateway authentication token |
| `~/.dorabot/gateway.sock` | Gateway Unix socket |
| `~/.dorabot/browser/profile/` | Chrome browser profile |
| `~/.dorabot/whatsapp/auth/` | WhatsApp auth data |
| `~/.dorabot/telegram/token` | Telegram bot token |
| `~/.dorabot/media/telegram/` | Downloaded Telegram media |
| `~/.dorabot/skills/` | Custom/community skills |
| `~/.dorabot/sessions/` | Session data |

---

## Commands Reference

### Chat commands (Telegram and WhatsApp)

| Command | What it does |
|---------|-------------|
| `/new` | Start a fresh conversation (clears context) |
| `/clear` | Same as `/new` |
| `/reset` | Same as `/new` |
| `/status` | Show current session info |
| `/handoff` | Write a handoff document, then clear context |

### Desktop keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+D | Split pane |
| Cmd+W | Close pane |
| Cmd+T | New chat tab |
| Cmd+, | Settings |

### Things you can ask the agent

These aren't commands with specific syntax. Just talk naturally:

- "Create a goal for improving the API performance"
- "Show me my active tasks"
- "Schedule a reminder for tomorrow at 9am to check the deployment"
- "Research best practices for X"
- "Take a screenshot of the current screen"
- "Check what's on [website]"
- "Send Jonathan a message on Telegram saying..."
- "What did the pulse do today?"
- "Search my memory for conversations about X"

---

## Glossary

| Term | Meaning |
|------|---------|
| **Pulse** | The autonomous background agent that runs on a schedule |
| **Handoff** | A context snapshot written before clearing a session |
| **Session key** | Unique identifier for a conversation (e.g. `telegram:dm:123`) |
| **MCP** | Model Context Protocol. Standard for connecting external tool servers. |
| **RRULE** | iCal recurrence rule standard (RFC 5545) |
| **Sub-agent** | An agent spawned by the main agent for specialized work |
| **Approval mode** | Controls which tools require human approval |
| **Context window** | The LLM's working memory for the current conversation (resets on /clear) |

---

*This manual covers dorabot as of March 2026. The codebase evolves, so some details may drift. When in doubt, check the source or ask the agent.*
