import { useState, useEffect, useCallback } from 'react';
import type { useGateway } from '../hooks/useGateway';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Library, Plus, Trash2, RefreshCw, Search, FolderOpen,
  ChevronRight, ChevronDown, FileText, Hash, Shield, Clock,
  X, AlertTriangle, Loader2, Copy,
} from 'lucide-react';

type LibraryInfo = {
  id: string;
  name: string;
  path: string;
  domains: string[];
  trustLevel: string;
  updateFrequency: string;
  fileTypes: string[];
  createdAt: number;
  updatedAt: number;
  fileCount: number;
  chunkCount: number;
  hasVectors: boolean;
};

type SearchResultItem = {
  libraryId: string;
  libraryName: string;
  filePath: string;
  chunk: string;
  score: number;
  searchType?: 'keyword' | 'semantic' | 'hybrid';
};

type Props = {
  gateway: ReturnType<typeof useGateway>;
};

const TRUST_COLORS: Record<string, string> = {
  authoritative: 'bg-green-500/10 text-green-400 border-green-500/20',
  experimental: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  external: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

const FREQ_LABELS: Record<string, string> = {
  live: 'Live (auto-updates)',
  daily: 'Daily',
  static: 'Static',
};

export function LibrariesView({ gateway }: Props) {
  const [libraries, setLibraries] = useState<LibraryInfo[]>([]);
  const [expandedLib, setExpandedLib] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFilterLib, setSearchFilterLib] = useState<string>('all');
  const connected = gateway.connectionState === 'connected';

  const loadLibraries = useCallback(async () => {
    if (!connected) return;
    try {
      const result = await gateway.rpc('libraries.list') as LibraryInfo[];
      setLibraries(result);
    } catch (err) {
      console.error('failed to load libraries:', err);
    }
  }, [gateway, connected]);

  useEffect(() => { loadLibraries(); }, [loadLibraries]);

  const handleAdd = useCallback(async (data: {
    name: string;
    path: string;
    domains: string[];
    trustLevel: string;
    updateFrequency: string;
    fileTypes: string[];
  }) => {
    try {
      await gateway.rpc('libraries.add', data);
      setShowAddDialog(false);
      await loadLibraries();
    } catch (err) {
      console.error('failed to add library:', err);
      throw err;
    }
  }, [gateway, loadLibraries]);

  const handleRemove = useCallback(async (id: string) => {
    try {
      await gateway.rpc('libraries.remove', { id });
      setDeleteConfirm(null);
      if (expandedLib === id) setExpandedLib(null);
      await loadLibraries();
    } catch (err) {
      console.error('failed to remove library:', err);
    }
  }, [gateway, expandedLib, loadLibraries]);

  const handleReindex = useCallback(async (id: string) => {
    setReindexing(id);
    try {
      await gateway.rpc('libraries.reindex', { id });
      await loadLibraries();
    } catch (err) {
      console.error('failed to reindex:', err);
    } finally {
      setReindexing(null);
    }
  }, [gateway, loadLibraries]);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const opts: Record<string, unknown> = { query, limit: 20 };
      if (searchFilterLib !== 'all') opts.libraryIds = [searchFilterLib];
      const results = await gateway.rpc('libraries.search', opts) as SearchResultItem[];
      setSearchResults(results);
    } catch (err) {
      console.error('search failed:', err);
    } finally {
      setSearching(false);
    }
  }, [gateway, searchFilterLib]);

  const handleSearchSubmit = useCallback(() => {
    handleSearch(searchQuery);
  }, [handleSearch, searchQuery]);

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path).catch(() => {});
  }, []);

  const showSearchResults = searchQuery.trim().length > 0 && searchResults.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* header bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <Library className="w-3.5 h-3.5 text-primary" />
        <span className="text-[11px] font-semibold">Libraries</span>
        <span className="text-[10px] text-muted-foreground">({libraries.length})</span>
        {!connected && <Badge variant="destructive" className="text-[9px] h-4 ml-auto">disconnected</Badge>}
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[10px] gap-1"
          onClick={() => setShowAddDialog(true)}
          disabled={!connected}
        >
          <Plus className="w-3 h-3" />
          Add Library
        </Button>
      </div>

      {/* search bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            placeholder="Search across libraries..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearchSubmit(); }}
            className="h-7 text-xs pl-7 pr-7"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setSearchResults([]); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {libraries.length > 1 && (
          <Select value={searchFilterLib} onValueChange={setSearchFilterLib}>
            <SelectTrigger className="h-7 text-[10px] w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[10px]">All libraries</SelectItem>
              {libraries.map(lib => (
                <SelectItem key={lib.id} value={lib.id} className="text-[10px]">{lib.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[10px] gap-1 shrink-0"
          onClick={handleSearchSubmit}
          disabled={!searchQuery.trim() || searching}
        >
          {searching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
          Search
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4 max-w-2xl">

          {/* search results */}
          {showSearchResults && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Search Results ({searchResults.length})
              </div>
              <div className="space-y-2">
                {searchResults.map((result, i) => (
                  <Card key={`${result.filePath}-${i}`}>
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-[9px] h-4">{result.libraryName}</Badge>
                            <span className="text-[9px] text-muted-foreground">score: {result.score.toFixed(4)}</span>
                            {result.searchType && (
                              <Badge variant="secondary" className={`text-[8px] h-3.5 ${
                                result.searchType === 'hybrid' ? 'bg-purple-500/10 text-purple-400' :
                                result.searchType === 'semantic' ? 'bg-blue-500/10 text-blue-400' :
                                'bg-gray-500/10 text-gray-400'
                              }`}>{result.searchType}</Badge>
                            )}
                          </div>
                          <button
                            className="text-[10px] text-primary hover:underline truncate block max-w-full text-left"
                            onClick={() => handleCopyPath(result.filePath)}
                            title="Click to copy path"
                          >
                            {result.filePath}
                          </button>
                          <p className="text-[10px] text-muted-foreground mt-1 line-clamp-3 leading-relaxed">
                            {result.chunk.slice(0, 300)}{result.chunk.length > 300 ? '...' : ''}
                          </p>
                        </div>
                        <button
                          className="shrink-0 p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
                          onClick={() => handleCopyPath(result.filePath)}
                          title="Copy path"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {searching && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground py-4 justify-center">
              <Loader2 className="w-3 h-3 animate-spin" />
              Searching...
            </div>
          )}

          {searchQuery.trim() && !searching && searchResults.length === 0 && (
            <div className="text-center py-4 text-[10px] text-muted-foreground">
              No results for "{searchQuery}"
            </div>
          )}

          {/* library list */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              {showSearchResults ? 'All Libraries' : 'Libraries'}
            </div>

            {libraries.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center space-y-2">
                  <Library className="w-8 h-8 text-muted-foreground mx-auto" />
                  <p className="text-xs text-muted-foreground">
                    No libraries yet. Add a folder to index its contents for search.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-[10px] h-7 gap-1"
                    onClick={() => setShowAddDialog(true)}
                    disabled={!connected}
                  >
                    <Plus className="w-3 h-3" /> Add your first library
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-1">
                {libraries.map(lib => (
                  <LibraryCard
                    key={lib.id}
                    library={lib}
                    expanded={expandedLib === lib.id}
                    reindexing={reindexing === lib.id}
                    onExpand={() => setExpandedLib(expandedLib === lib.id ? null : lib.id)}
                    onReindex={() => handleReindex(lib.id)}
                    onDelete={() => setDeleteConfirm(lib.id)}
                    onCopyPath={handleCopyPath}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Add Library Dialog */}
      {showAddDialog && (
        <AddLibraryDialog
          onAdd={handleAdd}
          onClose={() => setShowAddDialog(false)}
        />
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Remove Library</DialogTitle>
            <DialogDescription className="text-xs">
              Remove <span className="font-semibold">{libraries.find(l => l.id === deleteConfirm)?.name}</span> from the index? Source files are not affected.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)} className="text-[11px] h-7">
              Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={() => deleteConfirm && handleRemove(deleteConfirm)} className="text-[11px] h-7">
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Library Card ──────────────────────────────────────────

function LibraryCard({
  library,
  expanded,
  reindexing,
  onExpand,
  onReindex,
  onDelete,
  onCopyPath,
}: {
  library: LibraryInfo;
  expanded: boolean;
  reindexing: boolean;
  onExpand: () => void;
  onReindex: () => void;
  onDelete: () => void;
  onCopyPath: (path: string) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <button
          className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-secondary/30 transition-colors rounded-t-lg"
          onClick={onExpand}
        >
          {expanded
            ? <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
            : <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />
          }
          <FolderOpen className="w-3.5 h-3.5 shrink-0 text-primary" />
          <span className="text-xs font-medium truncate">{library.name}</span>
          <Badge variant="outline" className={`text-[9px] h-4 border ${TRUST_COLORS[library.trustLevel] || ''}`}>
            {library.trustLevel}
          </Badge>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <FileText className="w-2.5 h-2.5" />
            {library.fileCount} files
          </span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Hash className="w-2.5 h-2.5" />
            {library.chunkCount} chunks
          </span>
          {library.hasVectors ? (
            <Badge variant="secondary" className="text-[8px] h-3.5 bg-purple-500/10 text-purple-400 border-purple-500/20">hybrid</Badge>
          ) : (
            <Badge variant="secondary" className="text-[8px] h-3.5 bg-gray-500/10 text-gray-400">keyword</Badge>
          )}
          <span className="flex-1" />
          {reindexing && <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />}
        </button>

        {expanded && (
          <div className="px-3 pb-3 border-t border-border/50 pt-2 space-y-2">
            {/* path */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Path:</span>
              <button
                className="text-[10px] text-foreground hover:text-primary truncate"
                onClick={() => onCopyPath(library.path)}
                title="Click to copy"
              >
                {library.path}
              </button>
            </div>

            {/* domains */}
            <div>
              <span className="text-[10px] text-muted-foreground">Domains:</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {library.domains.length > 0 ? library.domains.map(d => (
                  <Badge key={d} variant="secondary" className="text-[9px] h-4">{d}</Badge>
                )) : (
                  <span className="text-[9px] text-muted-foreground italic">none</span>
                )}
              </div>
            </div>

            {/* metadata row */}
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Shield className="w-2.5 h-2.5" />
                {library.trustLevel}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                {FREQ_LABELS[library.updateFrequency] || library.updateFrequency}
              </span>
              <span>
                Types: {library.fileTypes.join(', ')}
              </span>
            </div>

            {/* timestamps */}
            <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
              <span>Added: {new Date(library.createdAt).toLocaleDateString()}</span>
              <span>Last indexed: {new Date(library.updatedAt).toLocaleDateString()}</span>
            </div>

            {/* actions */}
            <div className="flex items-center gap-1 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] gap-1"
                onClick={onReindex}
                disabled={reindexing}
              >
                {reindexing
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <RefreshCw className="w-3 h-3" />
                }
                Reindex
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] gap-1 text-destructive hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="w-3 h-3" />
                Remove
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Add Library Dialog ────────────────────────────────────

function AddLibraryDialog({
  onAdd,
  onClose,
}: {
  onAdd: (data: {
    name: string;
    path: string;
    domains: string[];
    trustLevel: string;
    updateFrequency: string;
    fileTypes: string[];
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [domainsStr, setDomainsStr] = useState('');
  const [trustLevel, setTrustLevel] = useState('authoritative');
  const [updateFrequency, setUpdateFrequency] = useState('static');
  const [fileTypesStr, setFileTypesStr] = useState('.md, .txt, .pdf');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const handleBrowse = useCallback(async () => {
    const api = (window as any).electronAPI;
    if (!api?.showOpenDialog) return;
    const result = await api.showOpenDialog({ properties: ['openDirectory'] });
    if (result && !result.canceled && result.filePaths?.[0]) {
      const selected = result.filePaths[0];
      setPath(selected);
      if (!name) {
        const parts = selected.split('/');
        setName(parts[parts.length - 1] || '');
      }
    }
  }, [name]);

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!path.trim()) { setError('Path is required'); return; }

    const domains = domainsStr.split(',').map(d => d.trim()).filter(Boolean);
    const fileTypes = fileTypesStr.split(',').map(t => t.trim()).filter(Boolean);

    setError('');
    setAdding(true);
    try {
      await onAdd({
        name: name.trim(),
        path: path.trim(),
        domains,
        trustLevel,
        updateFrequency,
        fileTypes,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  }, [name, path, domainsStr, trustLevel, updateFrequency, fileTypesStr, onAdd]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Add Library</DialogTitle>
          <DialogDescription className="text-xs">
            Index a folder so you can search its contents. Source files are never modified.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* name */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Music Theory"
              className="h-7 text-xs mt-1"
            />
          </div>

          {/* path */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Path</label>
            <div className="flex gap-1 mt-1">
              <Input
                value={path}
                onChange={e => setPath(e.target.value)}
                placeholder="/Users/you/Documents/notes"
                className="h-7 text-xs flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px] gap-1 shrink-0"
                onClick={handleBrowse}
              >
                <FolderOpen className="w-3 h-3" />
                Browse
              </Button>
            </div>
          </div>

          {/* domains */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Domains <span className="normal-case">(comma-separated)</span>
            </label>
            <Input
              value={domainsStr}
              onChange={e => setDomainsStr(e.target.value)}
              placeholder="music, theory, harmony"
              className="h-7 text-xs mt-1"
            />
          </div>

          {/* trust + frequency */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Trust Level</label>
              <Select value={trustLevel} onValueChange={setTrustLevel}>
                <SelectTrigger className="h-7 text-[10px] mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="authoritative" className="text-[10px]">Authoritative</SelectItem>
                  <SelectItem value="experimental" className="text-[10px]">Experimental</SelectItem>
                  <SelectItem value="external" className="text-[10px]">External</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Update Frequency</label>
              <Select value={updateFrequency} onValueChange={setUpdateFrequency}>
                <SelectTrigger className="h-7 text-[10px] mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="static" className="text-[10px]">Static (index once)</SelectItem>
                  <SelectItem value="daily" className="text-[10px]">Daily</SelectItem>
                  <SelectItem value="live" className="text-[10px]">Live (watch for changes)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* file types */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              File Types <span className="normal-case">(comma-separated extensions)</span>
            </label>
            <Input
              value={fileTypesStr}
              onChange={e => setFileTypesStr(e.target.value)}
              placeholder=".md, .txt, .pdf"
              className="h-7 text-xs mt-1"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-1.5 text-[10px] text-destructive">
            <AlertTriangle className="w-3 h-3" />
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={onClose} className="text-[11px] h-7">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={adding} className="text-[11px] h-7 gap-1">
            {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            {adding ? 'Indexing...' : 'Add & Index'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
