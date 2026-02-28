/**
 * System diagram definitions for the orchestration visualization.
 * Each diagram follows: max 8 nodes, self-contained boxes, Mermaid flowchart TD.
 * Hierarchical: any node with a drillDownId can decompose into its own diagram.
 */

export type Lens = 'structure' | 'time' | 'logic' | 'state';

export type DiagramNode = {
  id: string;
  label: string;
  drillDownId?: string;
};

export type Diagram = {
  id: string;
  lens: Lens;
  title: string;
  parentId?: string;
  mermaid: string;
  nodes: DiagramNode[];
};

// ══════════════════════════════════════════════════════════════════
// STRUCTURE LENS: What are the pieces?
// ══════════════════════════════════════════════════════════════════

const structureL0: Diagram = {
  id: 'structure-l0',
  lens: 'structure',
  title: 'System Overview',
  mermaid: `flowchart TD
    GW["🔌 Gateway<br/>Core Process<br/>Manages sessions, agents, events"]
    CH["📡 Channels<br/>Messaging Bridges<br/>Telegram, WhatsApp, Desktop"]
    AG["🤖 Agents<br/>Claude SDK<br/>Built-in + custom agent definitions"]
    TL["🔧 Tools<br/>MCP + Custom<br/>Messaging, handoff, libraries, search"]
    ST["💾 Storage<br/>SQLite + Files<br/>Sessions, goals, tasks, research"]
    CF["⚙️ Config<br/>JSON + Env<br/>Channels, agents, permissions"]

    CH -->|inbound messages| GW
    GW -->|dispatches to| AG
    AG -->|calls| TL
    GW -->|reads/writes| ST
    GW -->|loads| CF
    TL -->|outbound via| CH`,
  nodes: [
    { id: 'GW', label: 'Gateway', drillDownId: 'structure-gateway' },
    { id: 'CH', label: 'Channels', drillDownId: 'structure-channels' },
    { id: 'AG', label: 'Agents', drillDownId: 'structure-agents' },
    { id: 'TL', label: 'Tools', drillDownId: 'structure-tools' },
    { id: 'ST', label: 'Storage' },
    { id: 'CF', label: 'Config' },
  ],
};

const structureGateway: Diagram = {
  id: 'structure-gateway',
  lens: 'structure',
  title: 'Gateway Internals',
  parentId: 'structure-l0',
  mermaid: `flowchart TD
    SM["🔑 Session Manager<br/>SessionRegistry<br/>Creates, tracks, clears sessions"]
    RPC["📬 RPC Handler<br/>JSON-RPC over WS<br/>Desktop commands + tool results"]
    EB["📢 Event Bus<br/>Broadcaster<br/>Pushes events to all connected clients"]
    AR["🏃 Agent Runner<br/>SDK Orchestrator<br/>Spawns Claude, manages turns + tools"]
    TR["🎯 Tool Registry<br/>Custom + MCP<br/>Registers tools, resolves permissions"]
    CTX["📊 Context Tracker<br/>Usage Maps<br/>Token counting + threshold warnings"]

    RPC -->|creates/queries| SM
    RPC -->|triggers| AR
    AR -->|uses| TR
    AR -->|updates| CTX
    AR -->|emits events to| EB
    SM -->|provides session to| AR`,
  nodes: [
    { id: 'SM', label: 'Session Manager' },
    { id: 'RPC', label: 'RPC Handler' },
    { id: 'EB', label: 'Event Bus' },
    { id: 'AR', label: 'Agent Runner' },
    { id: 'TR', label: 'Tool Registry' },
    { id: 'CTX', label: 'Context Tracker' },
  ],
};

const structureChannels: Diagram = {
  id: 'structure-channels',
  lens: 'structure',
  title: 'Channel Architecture',
  parentId: 'structure-l0',
  mermaid: `flowchart TD
    TG["📱 Telegram Monitor<br/>Bot API<br/>Polls updates, handles commands"]
    WA["💬 WhatsApp Monitor<br/>Baileys Client<br/>Listens for messages + media"]
    DT["🖥️ Desktop WebSocket<br/>Electron Bridge<br/>Direct RPC + event streaming"]
    HR["🔗 Handler Registry<br/>Channel Router<br/>Maps channels to send/receive handlers"]
    RR["↩️ Reply Refs<br/>Cross-Channel Links<br/>Tracks which messages link to which sessions"]

    TG -->|registers handler| HR
    WA -->|registers handler| HR
    DT -->|direct RPC| HR
    HR -->|stores refs| RR
    RR -->|resolves replies to| HR`,
  nodes: [
    { id: 'TG', label: 'Telegram Monitor' },
    { id: 'WA', label: 'WhatsApp Monitor' },
    { id: 'DT', label: 'Desktop WebSocket' },
    { id: 'HR', label: 'Handler Registry' },
    { id: 'RR', label: 'Reply Refs' },
  ],
};

const structureAgents: Diagram = {
  id: 'structure-agents',
  lens: 'structure',
  title: 'Agent System',
  parentId: 'structure-l0',
  mermaid: `flowchart TD
    SDK["🧠 Claude SDK<br/>Anthropic Agent<br/>Manages conversation, tool calls, turns"]
    BI["📦 Built-in Agents<br/>8 Definitions<br/>Explore, Plan, Bash, Librarian, etc."]
    CU["✏️ Custom Agents<br/>User-Created<br/>Stored in config, full CRUD"]
    DA["🚫 Disabled Filter<br/>getAllAgents<br/>Filters out disabled before SDK sees them"]
    SP["💬 System Prompt<br/>Dynamic Builder<br/>Context, memory, goals, usage injected"]

    BI -->|merged with| CU
    CU -->|filtered by| DA
    DA -->|passed to| SDK
    SP -->|injected into| SDK`,
  nodes: [
    { id: 'SDK', label: 'Claude SDK' },
    { id: 'BI', label: 'Built-in Agents' },
    { id: 'CU', label: 'Custom Agents' },
    { id: 'DA', label: 'Disabled Filter' },
    { id: 'SP', label: 'System Prompt' },
  ],
};

const structureTools: Diagram = {
  id: 'structure-tools',
  lens: 'structure',
  title: 'Tool System',
  parentId: 'structure-l0',
  mermaid: `flowchart TD
    MSG["✉️ Messaging Tool<br/>Cross-Channel<br/>Send, edit, delete messages"]
    HO["📋 Handoff Tool<br/>Context Preservation<br/>Writes handoff docs, updates memory"]
    LIB["📚 Library Tools<br/>Knowledge Search<br/>Add, search, reindex, remove libraries"]
    SCH["📅 Scheduler Tools<br/>Calendar/Reminders<br/>Create, list, update, cancel schedules"]
    GT["🎯 Goals + Tasks<br/>Planning Pipeline<br/>CRUD for goals, tasks, research"]
    BR["🌐 Browser Tool<br/>Playwright<br/>Navigation, clicks, screenshots"]

    MSG -->|uses channel registry| LIB
    HO -->|writes to| GT
    SCH -->|triggers agent runs| MSG`,
  nodes: [
    { id: 'MSG', label: 'Messaging Tool' },
    { id: 'HO', label: 'Handoff Tool' },
    { id: 'LIB', label: 'Library Tools' },
    { id: 'SCH', label: 'Scheduler Tools' },
    { id: 'GT', label: 'Goals + Tasks' },
    { id: 'BR', label: 'Browser Tool' },
  ],
};

// ══════════════════════════════════════════════════════════════════
// TIME LENS: Who talks to whom, in what order?
// ══════════════════════════════════════════════════════════════════

const timeL0: Diagram = {
  id: 'time-l0',
  lens: 'time',
  title: 'Message Lifecycle',
  mermaid: `flowchart TD
    U["👤 User<br/>Sends Message<br/>Telegram, WhatsApp, or Desktop"]
    CH["📡 Channel<br/>Receives + Validates<br/>Transcribes voice, checks permissions"]
    GW["🔌 Gateway<br/>Routes Message<br/>Finds or creates session"]
    AG["🤖 Agent<br/>Processes + Responds<br/>Multiple tool-call turns possible"]
    TL["🔧 Tools<br/>Executes Actions<br/>Messages, searches, file ops"]
    RS["💬 Response<br/>Delivered to User<br/>Via same or different channel"]

    U -->|types/speaks| CH
    CH -->|inbound message| GW
    GW -->|dispatches| AG
    AG -->|calls| TL
    TL -->|results back to| AG
    AG -->|final response| RS`,
  nodes: [
    { id: 'U', label: 'User' },
    { id: 'CH', label: 'Channel', drillDownId: 'time-inbound' },
    { id: 'GW', label: 'Gateway', drillDownId: 'time-inbound' },
    { id: 'AG', label: 'Agent', drillDownId: 'time-outbound' },
    { id: 'TL', label: 'Tools' },
    { id: 'RS', label: 'Response', drillDownId: 'time-outbound' },
  ],
};

const timeInbound: Diagram = {
  id: 'time-inbound',
  lens: 'time',
  title: 'Inbound Message Flow',
  parentId: 'time-l0',
  mermaid: `flowchart TD
    RCV["📨 Channel Receives<br/>Raw Message<br/>Text, voice, media, commands"]
    CMD{"🔍 Is Command?<br/>/clear /handoff /reset<br/>Handled immediately, no agent"}
    TR["🎤 Transcription<br/>Voice to Text<br/>Parakeet-MLX or Whisper"]
    SL["🔑 Session Lookup<br/>Find or Create<br/>By channel + chatId + replyRefs"]
    CTX["📝 Context Build<br/>System Prompt<br/>Memory, goals, usage injected"]
    DSP["🚀 Dispatch<br/>Agent Runner<br/>Starts SDK with session context"]

    RCV -->|check| CMD
    CMD -->|yes: handle + return| RCV
    CMD -->|no| TR
    TR -->|transcribed text| SL
    SL -->|session found| CTX
    CTX -->|ready| DSP`,
  nodes: [
    { id: 'RCV', label: 'Channel Receives' },
    { id: 'CMD', label: 'Is Command?' },
    { id: 'TR', label: 'Transcription' },
    { id: 'SL', label: 'Session Lookup' },
    { id: 'CTX', label: 'Context Build' },
    { id: 'DSP', label: 'Dispatch' },
  ],
};

const timeOutbound: Diagram = {
  id: 'time-outbound',
  lens: 'time',
  title: 'Outbound Message Flow',
  parentId: 'time-l0',
  mermaid: `flowchart TD
    AG["🤖 Agent Turn<br/>Processing<br/>Text generation or tool call"]
    TC{"🔧 Tool Call?<br/>Agent wants action<br/>Message, search, file op, etc."}
    EX["⚡ Tool Execute<br/>Runs Action<br/>Result returned to agent"]
    RR["📌 Reply Ref<br/>Registers Link<br/>Maps sent messageId to session"]
    TX["💬 Text Response<br/>Final Output<br/>Streamed to desktop, sent to chat"]
    EV["📢 Events<br/>Broadcast<br/>context.updated, agent.result, etc."]

    AG -->|check| TC
    TC -->|yes| EX
    EX -->|if message sent| RR
    EX -->|result| AG
    TC -->|no: final text| TX
    TX -->|notifies| EV`,
  nodes: [
    { id: 'AG', label: 'Agent Turn' },
    { id: 'TC', label: 'Tool Call?' },
    { id: 'EX', label: 'Tool Execute' },
    { id: 'RR', label: 'Reply Ref' },
    { id: 'TX', label: 'Text Response' },
    { id: 'EV', label: 'Events' },
  ],
};

const timeCrossChannel: Diagram = {
  id: 'time-cross-channel',
  lens: 'time',
  title: 'Cross-Channel Reply Routing',
  parentId: 'time-l0',
  mermaid: `flowchart TD
    DT["🖥️ Desktop Session<br/>User Asks Agent<br/>Agent decides to message via Telegram"]
    MS["✉️ Message Tool<br/>Sends to Telegram<br/>Returns messageId"]
    RR["📌 Reply Ref Created<br/>Links messageId<br/>Maps Telegram msg to desktop session"]
    UR["👤 User Replies<br/>In Telegram<br/>Reply-to the agent's message"]
    LK["🔍 Ref Lookup<br/>resolveLinkedRunSession<br/>Finds original desktop session"]
    INJ["💉 Inject<br/>handle.inject<br/>Reply arrives in desktop session context"]

    DT -->|agent calls| MS
    MS -->|registers| RR
    UR -->|reply detected| LK
    LK -->|found match| INJ
    INJ -->|context continues in| DT`,
  nodes: [
    { id: 'DT', label: 'Desktop Session' },
    { id: 'MS', label: 'Message Tool' },
    { id: 'RR', label: 'Reply Ref Created' },
    { id: 'UR', label: 'User Replies' },
    { id: 'LK', label: 'Ref Lookup' },
    { id: 'INJ', label: 'Inject' },
  ],
};

// ══════════════════════════════════════════════════════════════════
// LOGIC LENS: What are the rules?
// ══════════════════════════════════════════════════════════════════

const logicL0: Diagram = {
  id: 'logic-l0',
  lens: 'logic',
  title: 'Message Routing Decisions',
  mermaid: `flowchart TD
    MSG["📨 Incoming Message<br/>From any channel<br/>Text, voice, or media"]
    CMD{"🔍 Is Command?<br/>/clear /handoff /reset<br/>Direct handling, no agent"}
    SES{"🔑 Session Exists?<br/>Lookup by key<br/>Or create new one"}
    PRM{"🔒 Permissions OK?<br/>Channel policy<br/>Tool allow/deny lists"}
    AGS["🤖 Agent Selection<br/>SDK Routes<br/>Model + tools by agent definition"]
    RUN["🏃 Execute<br/>Agent Run<br/>Turns until complete or error"]

    MSG --> CMD
    CMD -->|yes: handle locally| MSG
    CMD -->|no| SES
    SES -->|found or created| PRM
    PRM -->|denied| MSG
    PRM -->|allowed| AGS
    AGS --> RUN`,
  nodes: [
    { id: 'MSG', label: 'Incoming Message' },
    { id: 'CMD', label: 'Is Command?', drillDownId: 'logic-commands' },
    { id: 'SES', label: 'Session Exists?' },
    { id: 'PRM', label: 'Permissions OK?', drillDownId: 'logic-permissions' },
    { id: 'AGS', label: 'Agent Selection', drillDownId: 'logic-agent-selection' },
    { id: 'RUN', label: 'Execute' },
  ],
};

const logicCommands: Diagram = {
  id: 'logic-commands',
  lens: 'logic',
  title: 'Command Handling',
  parentId: 'logic-l0',
  mermaid: `flowchart TD
    IN["📨 Message Text<br/>First word check<br/>Starts with / ?"]
    CLR{"/clear or /reset<br/>Reset Session<br/>Clears SDK context, keeps DB history"}
    HO{"/handoff<br/>Preserve + Clear<br/>Agent writes handoff doc, then auto-clears"}
    BLK{"🚫 Agent Running?<br/>Blocked<br/>Can't clear during active run"}
    OK["✅ Session Cleared<br/>Fresh Start<br/>sdkSessionId reset, maps cleared"]
    HD["📋 Handoff Pending<br/>Agent Writes Doc<br/>Auto-clear on completion"]

    IN --> CLR
    IN --> HO
    CLR --> BLK
    BLK -->|yes: error msg| IN
    BLK -->|no| OK
    HO --> HD`,
  nodes: [
    { id: 'IN', label: 'Message Text' },
    { id: 'CLR', label: '/clear or /reset' },
    { id: 'HO', label: '/handoff' },
    { id: 'BLK', label: 'Agent Running?' },
    { id: 'OK', label: 'Session Cleared' },
    { id: 'HD', label: 'Handoff Pending' },
  ],
};

const logicPermissions: Diagram = {
  id: 'logic-permissions',
  lens: 'logic',
  title: 'Permission System',
  parentId: 'logic-l0',
  mermaid: `flowchart TD
    TC["🔧 Tool Call<br/>Agent wants to use tool<br/>classifyToolCall() runs"]
    PM{"📋 Permission Mode<br/>acceptEdits?<br/>Auto-allows Write/Edit tools"}
    CP{"📡 Channel Policy<br/>tools.allow list<br/>Does channel explicitly allow this tool?"}
    TP{"🔒 Tool Policy<br/>Default classification<br/>Hardcoded safe/dangerous lists"}
    AA["✅ Auto-Allow<br/>No approval needed<br/>Tool executes immediately"]
    RA["⚠️ Require Approval<br/>Desktop prompt<br/>User must click approve/deny"]

    TC --> PM
    PM -->|write/edit tool| AA
    PM -->|other tool| CP
    CP -->|explicitly allowed| AA
    CP -->|not listed| TP
    TP -->|safe tool| AA
    TP -->|dangerous tool| RA`,
  nodes: [
    { id: 'TC', label: 'Tool Call' },
    { id: 'PM', label: 'Permission Mode' },
    { id: 'CP', label: 'Channel Policy' },
    { id: 'TP', label: 'Tool Policy' },
    { id: 'AA', label: 'Auto-Allow' },
    { id: 'RA', label: 'Require Approval' },
  ],
};

const logicAgentSelection: Diagram = {
  id: 'logic-agent-selection',
  lens: 'logic',
  title: 'Agent Selection & Routing',
  parentId: 'logic-l0',
  mermaid: `flowchart TD
    IN["📨 Message Arrives<br/>With session context<br/>Ready for agent"]
    DEF["📦 Load Definitions<br/>getAllAgents()<br/>Built-in + custom, minus disabled"]
    SDK["🧠 SDK Decision<br/>Claude Chooses<br/>Based on message + available agents"]
    MOD["🎯 Model Assignment<br/>Per Agent<br/>Haiku, Sonnet, Opus, or inherit"]
    TLS["🔧 Tool Scoping<br/>Per Agent<br/>Only tools listed in agent definition"]
    RUN["🏃 Agent Executes<br/>With scoped tools<br/>Multiple turns until complete"]

    IN --> DEF
    DEF --> SDK
    SDK --> MOD
    MOD --> TLS
    TLS --> RUN`,
  nodes: [
    { id: 'IN', label: 'Message Arrives' },
    { id: 'DEF', label: 'Load Definitions' },
    { id: 'SDK', label: 'SDK Decision' },
    { id: 'MOD', label: 'Model Assignment' },
    { id: 'TLS', label: 'Tool Scoping' },
    { id: 'RUN', label: 'Agent Executes' },
  ],
};

// ══════════════════════════════════════════════════════════════════
// STATE LENS: What changes over time?
// ══════════════════════════════════════════════════════════════════

const stateL0: Diagram = {
  id: 'state-l0',
  lens: 'state',
  title: 'Key Entity Lifecycles',
  mermaid: `flowchart TD
    SE["🔑 Session<br/>Conversation Thread<br/>Created -> Active -> Cleared"]
    CX["📊 Context Window<br/>Token Budget<br/>Empty -> Filling -> Warning -> Full"]
    TA["📋 Task<br/>Work Item<br/>Planning -> Planned -> Approved -> Done"]
    GO["🎯 Goal<br/>High-Level Outcome<br/>Active -> Paused -> Done"]
    AG["🤖 Agent Run<br/>Single Execution<br/>Started -> Running -> Complete/Error"]

    SE -->|accumulates| CX
    GO -->|decomposes into| TA
    TA -->|triggers| AG
    AG -->|consumes| CX`,
  nodes: [
    { id: 'SE', label: 'Session', drillDownId: 'state-session' },
    { id: 'CX', label: 'Context Window', drillDownId: 'state-context' },
    { id: 'TA', label: 'Task', drillDownId: 'state-task' },
    { id: 'GO', label: 'Goal', drillDownId: 'state-goal' },
    { id: 'AG', label: 'Agent Run' },
  ],
};

const stateSession: Diagram = {
  id: 'state-session',
  lens: 'state',
  title: 'Session Lifecycle',
  parentId: 'state-l0',
  mermaid: `flowchart TD
    NEW["🆕 Created<br/>First Message<br/>sdkSessionId assigned"]
    ACT["💬 Active<br/>Messages Flowing<br/>Context accumulating each turn"]
    IDLE["😴 Idle<br/>No Recent Activity<br/>Session preserved in registry"]
    HO["📋 Handoff<br/>Context Preserved<br/>Rich doc written to workspace"]
    CLR["🧹 Cleared<br/>Fresh Context<br/>sdkSessionId reset, DB history kept"]
    GONE["💀 Expired<br/>Registry Eviction<br/>Oldest sessions removed at capacity"]

    NEW -->|user sends message| ACT
    ACT -->|time passes| IDLE
    IDLE -->|user returns| ACT
    ACT -->|/handoff command| HO
    HO -->|auto-clear| CLR
    ACT -->|/clear command| CLR
    CLR -->|new message| ACT
    IDLE -->|registry full| GONE`,
  nodes: [
    { id: 'NEW', label: 'Created' },
    { id: 'ACT', label: 'Active' },
    { id: 'IDLE', label: 'Idle' },
    { id: 'HO', label: 'Handoff' },
    { id: 'CLR', label: 'Cleared' },
    { id: 'GONE', label: 'Expired' },
  ],
};

const stateContext: Diagram = {
  id: 'state-context',
  lens: 'state',
  title: 'Context Window States',
  parentId: 'state-l0',
  mermaid: `flowchart TD
    E["🟢 Empty<br/>0%<br/>Fresh session, full budget"]
    L["🔵 Low<br/>1-49%<br/>Normal operation"]
    M["🟡 Medium<br/>50-69%<br/>INFO warnings start"]
    H["🟠 High<br/>70-84%<br/>Consider handoff"]
    C["🔴 Critical<br/>85-94%<br/>Strongly recommend handoff"]
    U["🚨 Urgent<br/>95%+<br/>Handoff immediately or fail"]

    E -->|messages accumulate| L
    L -->|more turns| M
    M -->|more turns| H
    H -->|more turns| C
    C -->|more turns| U
    U -->|/clear or /handoff| E`,
  nodes: [
    { id: 'E', label: 'Empty' },
    { id: 'L', label: 'Low' },
    { id: 'M', label: 'Medium' },
    { id: 'H', label: 'High' },
    { id: 'C', label: 'Critical' },
    { id: 'U', label: 'Urgent' },
  ],
};

const stateTask: Diagram = {
  id: 'state-task',
  lens: 'state',
  title: 'Task Lifecycle',
  parentId: 'state-l0',
  mermaid: `flowchart TD
    PL["📝 Planning<br/>Drafting Plan<br/>Agent researches + writes approach"]
    PD["📋 Planned<br/>Awaiting Review<br/>Plan written, submitted for approval"]
    DN{"👤 Human Decision<br/>Approve or Deny<br/>Reads plan, checks approach"}
    IP["🏃 In Progress<br/>Executing<br/>Agent working on implementation"]
    DO["✅ Done<br/>Complete<br/>Objective met, result recorded"]
    BL["🚫 Blocked<br/>Can't Proceed<br/>Dependency or issue"]

    PL -->|plan written| PD
    PD -->|human reviews| DN
    DN -->|approved| IP
    DN -->|denied with reason| PL
    IP -->|finished| DO
    IP -->|stuck| BL
    BL -->|resolved| IP`,
  nodes: [
    { id: 'PL', label: 'Planning' },
    { id: 'PD', label: 'Planned' },
    { id: 'DN', label: 'Human Decision' },
    { id: 'IP', label: 'In Progress' },
    { id: 'DO', label: 'Done' },
    { id: 'BL', label: 'Blocked' },
  ],
};

const stateGoal: Diagram = {
  id: 'state-goal',
  lens: 'state',
  title: 'Goal Lifecycle',
  parentId: 'state-l0',
  mermaid: `flowchart TD
    CR["🆕 Created<br/>Goal Defined<br/>Title + description set"]
    AC["🎯 Active<br/>Work In Progress<br/>Tasks being planned and executed"]
    PA["⏸️ Paused<br/>Deprioritized<br/>No active work, preserved"]
    DO["✅ Done<br/>Objective Met<br/>All tasks complete"]

    CR -->|work begins| AC
    AC -->|deprioritize| PA
    PA -->|reprioritize| AC
    AC -->|all tasks done| DO
    DO -->|reopened| AC`,
  nodes: [
    { id: 'CR', label: 'Created' },
    { id: 'AC', label: 'Active' },
    { id: 'PA', label: 'Paused' },
    { id: 'DO', label: 'Done' },
  ],
};

// ══════════════════════════════════════════════════════════════════
// Export all diagrams
// ══════════════════════════════════════════════════════════════════

export const ALL_DIAGRAMS: Diagram[] = [
  // Structure
  structureL0,
  structureGateway,
  structureChannels,
  structureAgents,
  structureTools,
  // Time
  timeL0,
  timeInbound,
  timeOutbound,
  timeCrossChannel,
  // Logic
  logicL0,
  logicCommands,
  logicPermissions,
  logicAgentSelection,
  // State
  stateL0,
  stateSession,
  stateContext,
  stateTask,
  stateGoal,
];

/** Root diagram ID for each lens */
export const LENS_ROOTS: Record<Lens, string> = {
  structure: 'structure-l0',
  time: 'time-l0',
  logic: 'logic-l0',
  state: 'state-l0',
};

/** Get diagram by ID */
export function getDiagram(id: string): Diagram | undefined {
  return ALL_DIAGRAMS.find(d => d.id === id);
}

/** Get children of a diagram (diagrams that have this one as parent) */
export function getChildren(parentId: string): Diagram[] {
  return ALL_DIAGRAMS.filter(d => d.parentId === parentId);
}

/** Build breadcrumb trail from root to current diagram */
export function getBreadcrumbs(diagramId: string): Diagram[] {
  const trail: Diagram[] = [];
  let current = getDiagram(diagramId);
  while (current) {
    trail.unshift(current);
    current = current.parentId ? getDiagram(current.parentId) : undefined;
  }
  return trail;
}

/** Lens display names and emoji */
export const LENS_INFO: Record<Lens, { label: string; emoji: string; description: string }> = {
  structure: { label: 'Structure', emoji: '🏗️', description: 'What are the pieces and how do they connect?' },
  time: { label: 'Time', emoji: '⏱️', description: 'Who talks to whom, in what order?' },
  logic: { label: 'Logic', emoji: '🔀', description: 'What are the rules and decisions?' },
  state: { label: 'State', emoji: '🔄', description: 'What changes over time?' },
};
