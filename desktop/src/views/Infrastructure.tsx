import { useState, useEffect, useCallback } from 'react';
import type { useGateway } from '../hooks/useGateway';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Bot, Copy, Trash2, Plus, ChevronRight, ChevronDown,
  Wrench, Brain, Pencil, Check, AlertTriangle, Network,
} from 'lucide-react';
import { SystemDiagrams } from './infrastructure/SystemDiagrams';

type AgentSummary = {
  name: string;
  description: string;
  model: string;
  tools: string[];
  isBuiltIn: boolean;
  enabled: boolean;
};

type AgentDetail = AgentSummary & {
  prompt: string;
};

type Props = {
  gateway: ReturnType<typeof useGateway>;
};

type Section = 'agents' | 'system';

export function InfrastructureView({ gateway }: Props) {
  const [section, setSection] = useState<Section>('agents');
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [agentDetail, setAgentDetail] = useState<AgentDetail | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editAgent, setEditAgent] = useState<AgentDetail | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const connected = gateway.connectionState === 'connected';

  const loadAgents = useCallback(async () => {
    if (!connected) return;
    try {
      const result = await gateway.rpc('agents.list') as AgentSummary[];
      setAgents(result);
    } catch (err) {
      console.error('failed to load agents:', err);
    }
  }, [gateway, connected]);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  const loadDetail = useCallback(async (name: string) => {
    try {
      const result = await gateway.rpc('agents.get', { name }) as AgentDetail;
      setAgentDetail(result);
    } catch (err) {
      console.error('failed to load agent detail:', err);
    }
  }, [gateway]);

  const handleExpand = useCallback((name: string) => {
    if (expandedAgent === name) {
      setExpandedAgent(null);
      setAgentDetail(null);
    } else {
      setExpandedAgent(name);
      loadDetail(name);
    }
  }, [expandedAgent, loadDetail]);

  const handleToggle = useCallback(async (name: string) => {
    try {
      await gateway.rpc('agents.toggle', { name });
      await loadAgents();
      if (agentDetail?.name === name) loadDetail(name);
    } catch (err) {
      console.error('failed to toggle agent:', err);
    }
  }, [gateway, loadAgents, agentDetail, loadDetail]);

  const handleDuplicate = useCallback(async (name: string) => {
    try {
      const result = await gateway.rpc('agents.duplicate', { name }) as AgentSummary;
      await loadAgents();
      setExpandedAgent(result.name);
      loadDetail(result.name);
    } catch (err) {
      console.error('failed to duplicate agent:', err);
    }
  }, [gateway, loadAgents, loadDetail]);

  const handleDelete = useCallback(async (name: string) => {
    try {
      await gateway.rpc('agents.delete', { name });
      setDeleteConfirm(null);
      if (expandedAgent === name) {
        setExpandedAgent(null);
        setAgentDetail(null);
      }
      await loadAgents();
    } catch (err) {
      console.error('failed to delete agent:', err);
    }
  }, [gateway, expandedAgent, loadAgents]);

  const handleSaveNew = useCallback(async (data: { name: string; description: string; prompt: string; model: string; tools: string[] }) => {
    try {
      await gateway.rpc('agents.create', data);
      setShowBuilder(false);
      await loadAgents();
    } catch (err) {
      console.error('failed to create agent:', err);
    }
  }, [gateway, loadAgents]);

  const handleSaveEdit = useCallback(async (data: { name: string; description: string; prompt: string; model: string; tools: string[] }) => {
    try {
      await gateway.rpc('agents.update', data);
      setEditAgent(null);
      await loadAgents();
      if (expandedAgent === data.name) loadDetail(data.name);
    } catch (err) {
      console.error('failed to update agent:', err);
    }
  }, [gateway, loadAgents, expandedAgent, loadDetail]);

  const builtIn = agents.filter(a => a.isBuiltIn);
  const custom = agents.filter(a => !a.isBuiltIn);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* top-level section tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border shrink-0">
        <button
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] transition-colors ${
            section === 'agents' ? 'bg-secondary text-foreground font-semibold' : 'text-muted-foreground hover:bg-secondary/50'
          }`}
          onClick={() => setSection('agents')}
        >
          <Bot className="w-3 h-3" />
          Agents
        </button>
        <button
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] transition-colors ${
            section === 'system' ? 'bg-secondary text-foreground font-semibold' : 'text-muted-foreground hover:bg-secondary/50'
          }`}
          onClick={() => setSection('system')}
        >
          <Network className="w-3 h-3" />
          System
        </button>
        {!connected && <Badge variant="destructive" className="text-[9px] h-4 ml-auto">disconnected</Badge>}
        {section === 'agents' && (
          <>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] gap-1"
              onClick={() => { setShowBuilder(true); setEditAgent(null); }}
              disabled={!connected}
            >
              <Plus className="w-3 h-3" />
              New Agent
            </Button>
          </>
        )}
      </div>

      {/* Section content */}
      {section === 'system' ? (
        <SystemDiagrams />
      ) : (
        <>
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-4 space-y-4 max-w-2xl">

              {/* built-in agents */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Built-in Agents ({builtIn.length})
                </div>
                <div className="space-y-1">
                  {builtIn.map(agent => (
                    <AgentCard
                      key={agent.name}
                      agent={agent}
                      expanded={expandedAgent === agent.name}
                      detail={expandedAgent === agent.name ? agentDetail : null}
                      onExpand={() => handleExpand(agent.name)}
                      onToggle={() => handleToggle(agent.name)}
                      onDuplicate={() => handleDuplicate(agent.name)}
                      onDelete={null}
                      onEdit={null}
                    />
                  ))}
                </div>
              </div>

              {/* custom agents */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Custom Agents ({custom.length})
                </div>
                {custom.length === 0 ? (
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-xs text-muted-foreground">
                        No custom agents yet. Create one or duplicate a built-in agent to get started.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-1">
                    {custom.map(agent => (
                      <AgentCard
                        key={agent.name}
                        agent={agent}
                        expanded={expandedAgent === agent.name}
                        detail={expandedAgent === agent.name ? agentDetail : null}
                        onExpand={() => handleExpand(agent.name)}
                        onToggle={() => handleToggle(agent.name)}
                        onDuplicate={() => handleDuplicate(agent.name)}
                        onDelete={() => setDeleteConfirm(agent.name)}
                        onEdit={() => {
                          if (agentDetail?.name === agent.name) {
                            setEditAgent(agentDetail);
                          } else {
                            gateway.rpc('agents.get', { name: agent.name }).then((r: any) => setEditAgent(r));
                          }
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          {/* Builder dialog */}
          {(showBuilder || editAgent) && (
            <AgentBuilderDialog
              initial={editAgent}
              onSave={editAgent ? handleSaveEdit : handleSaveNew}
              onClose={() => { setShowBuilder(false); setEditAgent(null); }}
            />
          )}

          {/* Delete confirmation */}
          <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-sm">Delete Agent</DialogTitle>
                <DialogDescription className="text-xs">
                  Are you sure you want to delete <span className="font-semibold">{deleteConfirm}</span>? This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)} className="text-[11px] h-7">
                  Cancel
                </Button>
                <Button size="sm" variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)} className="text-[11px] h-7">
                  Delete
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

// ── Agent Card ────────────────────────────────────────────

const MODEL_COLORS: Record<string, string> = {
  opus: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  sonnet: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  haiku: 'bg-green-500/10 text-green-400 border-green-500/20',
  inherit: 'bg-secondary text-muted-foreground border-border',
};

function AgentCard({
  agent,
  expanded,
  detail,
  onExpand,
  onToggle,
  onDuplicate,
  onDelete,
  onEdit,
}: {
  agent: AgentSummary;
  expanded: boolean;
  detail: AgentDetail | null;
  onExpand: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onDelete: (() => void) | null;
  onEdit: (() => void) | null;
}) {
  return (
    <Card className={!agent.enabled ? 'opacity-50' : ''}>
      <CardContent className="p-0">
        {/* header row */}
        <button
          className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-secondary/30 transition-colors rounded-t-lg"
          onClick={onExpand}
        >
          {expanded ? <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />}
          <Bot className="w-3.5 h-3.5 shrink-0 text-primary" />
          <span className="text-xs font-medium truncate">{agent.name}</span>
          <Badge variant="outline" className={`text-[9px] h-4 border ${MODEL_COLORS[agent.model] || MODEL_COLORS.inherit}`}>
            {agent.model}
          </Badge>
          {agent.isBuiltIn && (
            <Badge variant="secondary" className="text-[9px] h-4">built-in</Badge>
          )}
          <span className="text-[10px] text-muted-foreground truncate flex-1">{agent.description}</span>
          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            <Switch size="sm" checked={agent.enabled} onCheckedChange={onToggle} />
          </div>
        </button>

        {/* expanded detail */}
        {expanded && detail && (
          <div className="px-3 pb-3 border-t border-border/50 pt-2 space-y-2">
            {/* tools */}
            <div>
              <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                <Wrench className="w-3 h-3" /> Tools ({detail.tools.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {detail.tools.length > 0 ? detail.tools.map(t => (
                  <Badge key={t} variant="outline" className="text-[9px] h-4">{t}</Badge>
                )) : (
                  <span className="text-[10px] text-muted-foreground italic">all tools available</span>
                )}
              </div>
            </div>

            {/* prompt */}
            <div>
              <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                <Brain className="w-3 h-3" /> System Prompt
              </div>
              <pre className="text-[10px] bg-secondary/50 rounded p-2 whitespace-pre-wrap max-h-40 overflow-auto font-mono leading-relaxed">
                {detail.prompt}
              </pre>
            </div>

            {/* actions */}
            <div className="flex items-center gap-1 pt-1">
              <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={onDuplicate}>
                <Copy className="w-3 h-3" /> Duplicate
              </Button>
              {onEdit && (
                <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={onEdit}>
                  <Pencil className="w-3 h-3" /> Edit
                </Button>
              )}
              {onDelete && (
                <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 text-destructive hover:text-destructive" onClick={onDelete}>
                  <Trash2 className="w-3 h-3" /> Delete
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Agent Builder Dialog ──────────────────────────────────

const AVAILABLE_TOOLS = [
  'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash',
  'WebFetch', 'WebSearch', 'Task', 'NotebookEdit',
];

function AgentBuilderDialog({
  initial,
  onSave,
  onClose,
}: {
  initial: AgentDetail | null;
  onSave: (data: { name: string; description: string; prompt: string; model: string; tools: string[] }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [prompt, setPrompt] = useState(initial?.prompt || '');
  const [model, setModel] = useState(initial?.model || 'inherit');
  const [tools, setTools] = useState<string[]>(initial?.tools || []);
  const [error, setError] = useState('');
  const isEdit = !!initial;

  const handleToggleTool = (tool: string) => {
    setTools(prev => prev.includes(tool) ? prev.filter(t => t !== tool) : [...prev, tool]);
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Name is required'); return; }
    if (!prompt.trim()) { setError('Prompt is required'); return; }
    if (/[^a-z0-9-]/.test(trimmedName)) { setError('Name must be lowercase letters, numbers, and hyphens only'); return; }
    setError('');
    onSave({ name: trimmedName, description: description.trim(), prompt: prompt.trim(), model, tools });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">{isEdit ? 'Edit Agent' : 'New Agent'}</DialogTitle>
          <DialogDescription className="text-xs">
            {isEdit ? `Editing ${initial.name}` : 'Create a custom agent with its own tools and system prompt'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          <div className="space-y-4 py-2">
            {/* name */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Name</label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="my-agent"
                className="h-7 text-xs mt-1"
                disabled={isEdit}
              />
            </div>

            {/* description */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Description</label>
              <Input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What this agent does"
                className="h-7 text-xs mt-1"
              />
            </div>

            {/* model */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Model</label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="h-7 text-[11px] mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit" className="text-[11px]">Inherit (use parent model)</SelectItem>
                  <SelectItem value="haiku" className="text-[11px]">Haiku (fast, cheap)</SelectItem>
                  <SelectItem value="sonnet" className="text-[11px]">Sonnet (balanced)</SelectItem>
                  <SelectItem value="opus" className="text-[11px]">Opus (powerful)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* tools */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Tools {tools.length > 0 ? `(${tools.length} selected)` : '(none = all available)'}
              </label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {AVAILABLE_TOOLS.map(tool => (
                  <button
                    key={tool}
                    onClick={() => handleToggleTool(tool)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors ${
                      tools.includes(tool)
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'bg-secondary/50 text-muted-foreground border-border hover:border-primary/30'
                    }`}
                  >
                    {tools.includes(tool) && <Check className="w-2.5 h-2.5" />}
                    {tool}
                  </button>
                ))}
              </div>
            </div>

            {/* prompt */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">System Prompt</label>
              <Textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="You are a specialized agent that..."
                className="text-xs mt-1 min-h-[120px] font-mono"
                rows={8}
              />
            </div>
          </div>
        </ScrollArea>

        {error && (
          <div className="flex items-center gap-1.5 text-[10px] text-destructive">
            <AlertTriangle className="w-3 h-3" />
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={onClose} className="text-[11px] h-7">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} className="text-[11px] h-7">
            {isEdit ? 'Save Changes' : 'Create Agent'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
