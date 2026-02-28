import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, watch, unlinkSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { homedir } from 'node:os';
import MiniSearch from 'minisearch';

const LIBRARIES_DIR = join(homedir(), '.dorabot', 'libraries');
const LIBRARIES_MANIFEST_PATH = join(LIBRARIES_DIR, 'manifest.json');

// ── Ollama config ────────────────────────────────────────
const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text';
const EMBEDDING_TIMEOUT_MS = 5_000;
const RRF_K = 60; // standard RRF constant
const EMBEDDING_BATCH_LOG_INTERVAL = 10; // log progress every N chunks

let ollamaAvailable: boolean | null = null; // null = not checked yet
let ollamaWarningLogged = false;

function getOllamaUrl(): string {
  try {
    const configPath = join(homedir(), '.dorabot', 'config.json');
    if (existsSync(configPath)) {
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (cfg.libraries?.ollamaUrl) return cfg.libraries.ollamaUrl;
    }
  } catch { /* ignore */ }
  return DEFAULT_OLLAMA_URL;
}

function getEmbeddingModel(): string {
  try {
    const configPath = join(homedir(), '.dorabot', 'config.json');
    if (existsSync(configPath)) {
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (cfg.libraries?.embeddingModel) return cfg.libraries.embeddingModel;
    }
  } catch { /* ignore */ }
  return DEFAULT_EMBEDDING_MODEL;
}

export function configureOllama(url?: string, model?: string) {
  // For backward compat: if caller wants to override, they can set config.json
  // This resets the availability check so next operation re-probes
  ollamaAvailable = null;
  ollamaWarningLogged = false;
}

export type TrustLevel = 'authoritative' | 'experimental' | 'external';
export type UpdateFrequency = 'live' | 'daily' | 'static';

export type Library = {
  id: string;
  name: string;
  path: string;
  domains: string[];
  trustLevel: TrustLevel;
  updateFrequency: UpdateFrequency;
  fileTypes: string[];
  createdAt: number;
  updatedAt: number;
  indexPath?: string;
};

export type LibraryManifest = {
  libraries: Library[];
};

export type SearchResult = {
  libraryId: string;
  libraryName: string;
  filePath: string;
  chunk: string;
  score: number;
  searchType?: 'keyword' | 'semantic' | 'hybrid';
  metadata?: Record<string, any>;
};

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

function ensureLibrariesDir() {
  mkdirSync(LIBRARIES_DIR, { recursive: true });
}

export function loadManifest(): LibraryManifest {
  ensureLibrariesDir();
  if (!existsSync(LIBRARIES_MANIFEST_PATH)) {
    return { libraries: [] };
  }
  const content = readFileSync(LIBRARIES_MANIFEST_PATH, 'utf-8');
  return JSON.parse(content);
}

function saveManifest(manifest: LibraryManifest) {
  ensureLibrariesDir();
  writeFileSync(LIBRARIES_MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
}

function generateId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function chunkText(text: string, chunkSize: number = CHUNK_SIZE, overlap: number = CHUNK_OVERLAP): string[] {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    chunks.push(words.slice(start, end).join(' '));
    start += chunkSize - overlap;
  }

  return chunks;
}

async function extractTextFromPdf(pdfPath: string): Promise<string> {
  const pdfParseModule = await import('pdf-parse');
  const pdfParse = (pdfParseModule as any).default || pdfParseModule;
  const dataBuffer = readFileSync(pdfPath);
  const data = await pdfParse(dataBuffer);
  return data.text;
}

function extractTextFromMarkdown(mdPath: string): string {
  return readFileSync(mdPath, 'utf-8');
}

// ── Ollama Embeddings ────────────────────────────────────

async function checkOllamaAvailable(): Promise<boolean> {
  if (ollamaAvailable !== null) return ollamaAvailable;
  const url = getOllamaUrl();
  const model = getEmbeddingModel();
  try {
    const resp = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) {
      ollamaAvailable = false;
      if (!ollamaWarningLogged) {
        console.warn(`[library] Ollama returned ${resp.status} at ${url}. Semantic search disabled, using BM25 only.`);
        ollamaWarningLogged = true;
      }
      return false;
    }
    const body = await resp.json() as { models?: { name: string }[] };
    const modelFound = body.models?.some(m => m.name === model || m.name.startsWith(`${model}:`)) ?? false;
    if (!modelFound) {
      ollamaAvailable = false;
      if (!ollamaWarningLogged) {
        console.warn(`[library] Ollama model "${model}" not found. Semantic search disabled, using BM25 only.`);
        ollamaWarningLogged = true;
      }
      return false;
    }
    ollamaAvailable = true;
  } catch {
    ollamaAvailable = false;
    if (!ollamaWarningLogged) {
      console.warn(`[library] Ollama not reachable at ${url}. Semantic search disabled, using BM25 only.`);
      ollamaWarningLogged = true;
    }
  }
  return ollamaAvailable;
}

async function embedText(text: string): Promise<number[] | null> {
  if (!(await checkOllamaAvailable())) return null;
  const url = getOllamaUrl();
  const model = getEmbeddingModel();
  try {
    const resp = await fetch(`${url}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { embedding: number[] };
    return data.embedding;
  } catch {
    return null;
  }
}

async function embedBatch(texts: string[], libraryName: string): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = new Array(texts.length).fill(null);
  if (!(await checkOllamaAvailable())) return results;

  const total = texts.length;
  for (let i = 0; i < total; i++) {
    if (i % EMBEDDING_BATCH_LOG_INTERVAL === 0 || i === total - 1) {
      console.log(`[library] Embedding chunk ${i + 1}/${total} for ${libraryName}...`);
    }
    const vec = await embedText(texts[i]);
    if (!vec) {
      // If one embedding fails, Ollama likely went away - abort
      console.warn(`[library] Embedding failed at chunk ${i + 1}/${total} for ${libraryName}, aborting vector index`);
      return results;
    }
    results[i] = vec;
  }
  return results;
}

// ── Vector Storage ───────────────────────────────────────

type VectorEntry = {
  id: string;       // matches IndexDocument.id
  filePath: string;
  chunkIndex: number;
  vector: number[];
};

type VectorStore = {
  model: string;
  dims: number;
  chunkCount: number; // total document chunks at index time (for skip-reembed check)
  entries: VectorEntry[];
};

function vectorStorePath(libraryId: string): string {
  return join(LIBRARIES_DIR, `${libraryId}.vectors.json`);
}

function loadVectorStore(libraryId: string): VectorStore | null {
  const p = vectorStorePath(libraryId);
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, 'utf-8')) as VectorStore;
    // Invalidate if model changed
    if (data.model !== getEmbeddingModel()) return null;
    return data;
  } catch {
    return null;
  }
}

function saveVectorStore(libraryId: string, store: VectorStore) {
  writeFileSync(vectorStorePath(libraryId), JSON.stringify(store));
}

function deleteVectorStore(libraryId: string) {
  const p = vectorStorePath(libraryId);
  if (existsSync(p)) {
    try { unlinkSync(p); } catch { /* ignore */ }
  }
}

// ── Cosine Similarity ────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Reciprocal Rank Fusion ───────────────────────────────

type RankedItem = {
  id: string;
  libraryId: string;
  libraryName: string;
  filePath: string;
  chunk: string;
  metadata?: Record<string, any>;
};

function rrfFuse(
  bm25Results: (RankedItem & { bm25Score: number })[],
  vectorResults: (RankedItem & { vectorScore: number })[],
  limit: number
): (RankedItem & { score: number; searchType: 'keyword' | 'semantic' | 'hybrid' })[] {
  const scores = new Map<string, { item: RankedItem; rrfScore: number; inBm25: boolean; inVector: boolean }>();

  // BM25 contributions
  bm25Results.forEach((item, rank) => {
    const existing = scores.get(item.id);
    const contribution = 1 / (RRF_K + rank + 1);
    if (existing) {
      existing.rrfScore += contribution;
      existing.inBm25 = true;
    } else {
      scores.set(item.id, { item, rrfScore: contribution, inBm25: true, inVector: false });
    }
  });

  // Vector contributions
  vectorResults.forEach((item, rank) => {
    const existing = scores.get(item.id);
    const contribution = 1 / (RRF_K + rank + 1);
    if (existing) {
      existing.rrfScore += contribution;
      existing.inVector = true;
    } else {
      scores.set(item.id, { item, rrfScore: contribution, inBm25: false, inVector: true });
    }
  });

  // Sort by RRF score descending
  const fused = [...scores.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit)
    .map(entry => ({
      ...entry.item,
      score: entry.rrfScore,
      searchType: (entry.inBm25 && entry.inVector ? 'hybrid' : entry.inBm25 ? 'keyword' : 'semantic') as 'keyword' | 'semantic' | 'hybrid',
    }));

  return fused;
}

// ── Indexing ─────────────────────────────────────────────

type IndexDocument = {
  id: string;
  filePath: string;
  chunk: string;
  chunkIndex: number;
  metadata?: Record<string, any>;
};

async function indexLibrary(library: Library): Promise<MiniSearch<IndexDocument>> {
  const miniSearch = new MiniSearch<IndexDocument>({
    fields: ['chunk'],
    storeFields: ['filePath', 'chunk', 'chunkIndex', 'metadata'],
    searchOptions: {
      boost: { chunk: 2 },
      fuzzy: 0.2,
    },
  });

  const documents: IndexDocument[] = [];
  const path = library.path.replace(/^~/, homedir());

  async function processDirectory(dir: string) {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stats = statSync(fullPath);

      if (stats.isDirectory()) {
        await processDirectory(fullPath);
      } else if (stats.isFile()) {
        const ext = extname(entry).toLowerCase();
        if (!library.fileTypes.includes(ext)) continue;

        try {
          let text = '';
          if (ext === '.pdf') {
            text = await extractTextFromPdf(fullPath);
          } else if (ext === '.md' || ext === '.txt') {
            text = extractTextFromMarkdown(fullPath);
          }

          if (text) {
            const chunks = chunkText(text);
            chunks.forEach((chunk, idx) => {
              documents.push({
                id: `${library.id}-${relative(path, fullPath)}-${idx}`,
                filePath: fullPath,
                chunk,
                chunkIndex: idx,
                metadata: { ext, fileName: entry },
              });
            });
          }
        } catch (err) {
          console.error(`Failed to index ${fullPath}:`, err);
        }
      }
    }
  }

  await processDirectory(path);
  miniSearch.addAll(documents);

  // Save BM25 index
  const indexPath = join(LIBRARIES_DIR, `${library.id}.index.json`);
  writeFileSync(indexPath, JSON.stringify(miniSearch.toJSON()));

  // Generate vector embeddings (non-blocking, best-effort)
  if (documents.length > 0 && await checkOllamaAvailable()) {
    const model = getEmbeddingModel();

    // Skip re-embedding if vectors already exist with same model and chunk count
    const existingStore = loadVectorStore(library.id);
    if (existingStore && existingStore.chunkCount === documents.length && existingStore.model === model) {
      console.log(`[library] Vectors for "${library.name}" already up-to-date (${documents.length} chunks), skipping`);
    } else {
      console.log(`[library] Embedding ${documents.length} chunks for "${library.name}"...`);
      const chunkTexts = documents.map(d => d.chunk);
      const vectors = await embedBatch(chunkTexts, library.name);

      const vectorEntries: VectorEntry[] = [];
      for (let i = 0; i < documents.length; i++) {
        if (vectors[i]) {
          vectorEntries.push({
            id: documents[i].id,
            filePath: documents[i].filePath,
            chunkIndex: documents[i].chunkIndex,
            vector: vectors[i]!,
          });
        }
      }

      if (vectorEntries.length > 0) {
        const store: VectorStore = {
          model,
          dims: vectorEntries[0].vector.length,
          chunkCount: documents.length,
          entries: vectorEntries,
        };
        saveVectorStore(library.id, store);
        console.log(`[library] Embedded ${vectorEntries.length}/${documents.length} chunks for "${library.name}"`);
      }
    }
  }

  return miniSearch;
}

function loadIndex(library: Library): MiniSearch<IndexDocument> | null {
  const indexPath = join(LIBRARIES_DIR, `${library.id}.index.json`);
  if (!existsSync(indexPath)) return null;

  try {
    const indexData = JSON.parse(readFileSync(indexPath, 'utf-8'));
    return MiniSearch.loadJSON<IndexDocument>(indexData, {
      fields: ['chunk'],
      storeFields: ['filePath', 'chunk', 'chunkIndex', 'metadata'],
    });
  } catch {
    return null;
  }
}

async function ensureIndexed(library: Library): Promise<MiniSearch<IndexDocument>> {
  let index = loadIndex(library);
  if (!index) {
    index = await indexLibrary(library);
  }
  return index;
}

function setupWatcher(library: Library, onReindex: () => void) {
  const path = library.path.replace(/^~/, homedir());
  if (!existsSync(path)) return;

  let reindexTimer: NodeJS.Timeout | null = null;
  watch(path, { recursive: true }, () => {
    if (reindexTimer) clearTimeout(reindexTimer);
    reindexTimer = setTimeout(() => {
      console.log(`Re-indexing library ${library.name}...`);
      indexLibrary(library).then(() => {
        console.log(`Re-indexed ${library.name}`);
        onReindex();
      });
    }, 2000);
  });
}

// ── Hybrid Search ────────────────────────────────────────

async function hybridSearch(
  libraries: Library[],
  query: string,
  limit: number,
): Promise<SearchResult[]> {
  // Run BM25 search across all libraries
  const bm25All: (RankedItem & { bm25Score: number })[] = [];
  for (const library of libraries) {
    const index = await ensureIndexed(library);
    const results = index.search(query, { prefix: true, fuzzy: 0.2 });
    results.forEach(result => {
      bm25All.push({
        id: result.id as string,
        libraryId: library.id,
        libraryName: library.name,
        filePath: result.filePath,
        chunk: result.chunk,
        metadata: result.metadata,
        bm25Score: result.score,
      });
    });
  }
  // Sort BM25 by score for rank-based RRF
  bm25All.sort((a, b) => b.bm25Score - a.bm25Score);

  // Run vector search if Ollama available
  const queryVec = await embedText(query);
  const vectorAll: (RankedItem & { vectorScore: number })[] = [];

  if (queryVec) {
    for (const library of libraries) {
      const store = loadVectorStore(library.id);
      if (!store) continue;

      // Load stored fields from BM25 index to get chunk text.
      // MiniSearch serializes storedFields keyed by internal numeric ID,
      // and documentIds maps internal numeric ID -> document string ID.
      // We build a reverse map: docStringId -> stored fields.
      const storedByDocId = new Map<string, { chunk: string; filePath: string; metadata?: Record<string, any> }>();
      const indexPath = join(LIBRARIES_DIR, `${library.id}.index.json`);
      try {
        const parsed = JSON.parse(readFileSync(indexPath, 'utf-8'));
        const rawStoredFields: Record<string, any> = parsed.storedFields || {};
        const documentIds: Record<string, string> = parsed.documentIds || {};
        for (const [internalId, docId] of Object.entries(documentIds)) {
          const stored = rawStoredFields[internalId];
          if (stored) {
            storedByDocId.set(docId, { chunk: stored.chunk || '', filePath: stored.filePath || '', metadata: stored.metadata });
          }
        }
      } catch { /* ignore */ }

      for (const entry of store.entries) {
        const sim = cosineSimilarity(queryVec, entry.vector);
        const stored = storedByDocId.get(entry.id);
        vectorAll.push({
          id: entry.id,
          libraryId: library.id,
          libraryName: library.name,
          filePath: entry.filePath || stored?.filePath || '',
          chunk: stored?.chunk || '',
          metadata: stored?.metadata,
          vectorScore: sim,
        });
      }
    }
    // Sort vector by similarity for rank-based RRF
    vectorAll.sort((a, b) => b.vectorScore - a.vectorScore);
    // Only keep top results for fusion (no point fusing thousands)
    vectorAll.splice(limit * 5);
  }

  // If we have both BM25 and vector results, fuse with RRF
  if (bm25All.length > 0 && vectorAll.length > 0) {
    const fused = rrfFuse(bm25All, vectorAll, limit);
    return fused.map(r => ({
      libraryId: r.libraryId,
      libraryName: r.libraryName,
      filePath: r.filePath,
      chunk: r.chunk,
      score: r.score,
      searchType: r.searchType,
      metadata: r.metadata,
    }));
  }

  // BM25-only fallback
  if (bm25All.length > 0) {
    return bm25All.slice(0, limit).map(r => ({
      libraryId: r.libraryId,
      libraryName: r.libraryName,
      filePath: r.filePath,
      chunk: r.chunk,
      score: r.bm25Score,
      searchType: 'keyword' as const,
      metadata: r.metadata,
    }));
  }

  // Vector-only fallback (rare: BM25 found nothing but vector did)
  if (vectorAll.length > 0) {
    return vectorAll.slice(0, limit).map(r => ({
      libraryId: r.libraryId,
      libraryName: r.libraryName,
      filePath: r.filePath,
      chunk: r.chunk,
      score: r.vectorScore,
      searchType: 'semantic' as const,
      metadata: r.metadata,
    }));
  }

  return [];
}

// ── MCP Tools ────────────────────────────────────────────

export const libraryAddTool = tool(
  'library_add',
  'Add a new library to the manifest and index it',
  {
    name: z.string().describe('Library name'),
    path: z.string().describe('Path to library directory (supports ~ for home)'),
    domains: z.array(z.string()).describe('Knowledge domains this library covers (e.g., ["authentication", "security"])'),
    trustLevel: z.enum(['authoritative', 'experimental', 'external']).default('authoritative').describe('Trust level of sources'),
    updateFrequency: z.enum(['live', 'daily', 'static']).default('static').describe('How often content changes'),
    fileTypes: z.array(z.string()).default(['.md', '.txt', '.pdf']).describe('File extensions to index (e.g., [".md", ".pdf"])'),
  },
  async (args) => {
    const manifest = loadManifest();
    const id = generateId(args.name);

    if (manifest.libraries.find(lib => lib.id === id)) {
      return { content: [{ type: 'text', text: `Error: Library with id "${id}" already exists` }], isError: true };
    }

    const expandedPath = args.path.replace(/^~/, homedir());
    if (!existsSync(expandedPath)) {
      return { content: [{ type: 'text', text: `Error: Path does not exist: ${expandedPath}` }], isError: true };
    }

    const library: Library = {
      id,
      name: args.name,
      path: args.path,
      domains: args.domains,
      trustLevel: args.trustLevel,
      updateFrequency: args.updateFrequency,
      fileTypes: args.fileTypes,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    manifest.libraries.push(library);
    saveManifest(manifest);

    await indexLibrary(library);

    if (library.updateFrequency === 'live') {
      setupWatcher(library, () => {
        library.updatedAt = Date.now();
        saveManifest(manifest);
      });
    }

    const hasVectors = existsSync(vectorStorePath(id));
    const searchMode = hasVectors ? 'hybrid (BM25 + semantic)' : 'keyword only (BM25)';
    return { content: [{ type: 'text', text: `Library "${args.name}" added and indexed. ID: ${id}. Search mode: ${searchMode}` }] };
  }
);

export const libraryListTool = tool(
  'library_list',
  'List all available libraries with their metadata',
  {
    domains: z.array(z.string()).optional().describe('Filter by domains (returns libraries matching any domain)'),
  },
  async (args) => {
    const manifest = loadManifest();
    let libraries = manifest.libraries;

    if (args.domains && args.domains.length > 0) {
      libraries = libraries.filter(lib =>
        lib.domains.some(domain => args.domains!.includes(domain))
      );
    }

    if (libraries.length === 0) {
      return { content: [{ type: 'text', text: 'No libraries found.' }] };
    }

    const text = libraries.map(lib => {
      const hasVectors = existsSync(vectorStorePath(lib.id));
      const searchMode = hasVectors ? 'hybrid' : 'keyword';
      return `**${lib.name}** (${lib.id})\n` +
        `  Path: ${lib.path}\n` +
        `  Domains: ${lib.domains.join(', ')}\n` +
        `  Trust: ${lib.trustLevel} | Updates: ${lib.updateFrequency} | Search: ${searchMode}\n` +
        `  File types: ${lib.fileTypes.join(', ')}`;
    }).join('\n\n');

    return { content: [{ type: 'text', text }] };
  }
);

export const libraryRemoveTool = tool(
  'library_remove',
  'Remove a library from the manifest and delete its index',
  {
    id: z.string().describe('Library ID to remove'),
  },
  async (args) => {
    const manifest = loadManifest();
    const idx = manifest.libraries.findIndex(lib => lib.id === args.id);

    if (idx === -1) {
      return { content: [{ type: 'text', text: `Error: Library with id "${args.id}" not found` }], isError: true };
    }

    const library = manifest.libraries[idx];
    manifest.libraries.splice(idx, 1);
    saveManifest(manifest);

    const indexPath = join(LIBRARIES_DIR, `${args.id}.index.json`);
    if (existsSync(indexPath)) {
      try { unlinkSync(indexPath); } catch { writeFileSync(indexPath, ''); }
    }
    deleteVectorStore(args.id);

    return { content: [{ type: 'text', text: `Library "${library.name}" removed` }] };
  }
);

export const librarySearchTool = tool(
  'library_search',
  'Search across libraries using BM25 keyword search. Returns ranked passages with source citations.',
  {
    query: z.string().describe('Search query'),
    libraryIds: z.array(z.string()).optional().describe('Filter to specific library IDs (searches all if not provided)'),
    limit: z.number().default(10).describe('Maximum results to return'),
  },
  async (args) => {
    const manifest = loadManifest();
    let libraries = manifest.libraries;

    if (args.libraryIds && args.libraryIds.length > 0) {
      libraries = libraries.filter(lib => args.libraryIds!.includes(lib.id));
    }

    if (libraries.length === 0) {
      return { content: [{ type: 'text', text: 'No libraries available to search.' }] };
    }

    const results = await hybridSearch(libraries, args.query, args.limit);

    if (results.length === 0) {
      return { content: [{ type: 'text', text: `No results found for query: "${args.query}"` }] };
    }

    const searchModes = new Set(results.map(r => r.searchType).filter(Boolean));
    const modeLabel = searchModes.size > 0 ? ` [${[...searchModes].join('+')}]` : '';

    const text = results.map((result, idx) =>
      `**[${idx + 1}] ${result.libraryName}** (score: ${result.score.toFixed(4)}${result.searchType ? `, ${result.searchType}` : ''})\n` +
      `Source: ${result.filePath}\n\n` +
      `${result.chunk}\n` +
      `---`
    ).join('\n\n');

    return { content: [{ type: 'text', text: `${text}\n\nSearch mode: ${modeLabel || 'keyword'}` }] };
  }
);

export const libraryReindexTool = tool(
  'library_reindex',
  'Force re-indexing of a library (useful after manual file changes)',
  {
    id: z.string().describe('Library ID to reindex'),
  },
  async (args) => {
    const manifest = loadManifest();
    const library = manifest.libraries.find(lib => lib.id === args.id);

    if (!library) {
      return { content: [{ type: 'text', text: `Error: Library with id "${args.id}" not found` }], isError: true };
    }

    await indexLibrary(library);
    library.updatedAt = Date.now();
    saveManifest(manifest);

    const hasVectors = existsSync(vectorStorePath(args.id));
    return { content: [{ type: 'text', text: `Library "${library.name}" re-indexed successfully. Vectors: ${hasVectors ? 'yes' : 'no'}` }] };
  }
);

export const libraryTools = [
  libraryAddTool,
  libraryListTool,
  libraryRemoveTool,
  librarySearchTool,
  libraryReindexTool,
];

// ── Exported API for RPC handlers ────────────────────────

export async function addLibrary(args: {
  name: string;
  path: string;
  domains: string[];
  trustLevel?: TrustLevel;
  updateFrequency?: UpdateFrequency;
  fileTypes?: string[];
}): Promise<Library> {
  const manifest = loadManifest();
  const id = generateId(args.name);
  if (manifest.libraries.find(lib => lib.id === id)) {
    throw new Error(`Library with id "${id}" already exists`);
  }
  const expandedPath = args.path.replace(/^~/, homedir());
  if (!existsSync(expandedPath)) {
    throw new Error(`Path does not exist: ${expandedPath}`);
  }
  const library: Library = {
    id,
    name: args.name,
    path: args.path,
    domains: args.domains,
    trustLevel: args.trustLevel || 'authoritative',
    updateFrequency: args.updateFrequency || 'static',
    fileTypes: args.fileTypes || ['.md', '.txt', '.pdf'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  manifest.libraries.push(library);
  saveManifest(manifest);
  await indexLibrary(library);
  if (library.updateFrequency === 'live') {
    setupWatcher(library, () => { library.updatedAt = Date.now(); saveManifest(manifest); });
  }
  return library;
}

export function removeLibrary(id: string): void {
  const manifest = loadManifest();
  const idx = manifest.libraries.findIndex(lib => lib.id === id);
  if (idx === -1) throw new Error(`Library with id "${id}" not found`);
  manifest.libraries.splice(idx, 1);
  saveManifest(manifest);
  const indexPath = join(LIBRARIES_DIR, `${id}.index.json`);
  if (existsSync(indexPath)) {
    try { unlinkSync(indexPath); } catch { writeFileSync(indexPath, ''); }
  }
  deleteVectorStore(id);
}

export async function reindexLibraryById(id: string): Promise<void> {
  const manifest = loadManifest();
  const library = manifest.libraries.find(lib => lib.id === id);
  if (!library) throw new Error(`Library with id "${id}" not found`);
  await indexLibrary(library);
  library.updatedAt = Date.now();
  saveManifest(manifest);
}

export async function searchLibraries(query: string, opts?: { libraryIds?: string[]; limit?: number }): Promise<SearchResult[]> {
  const manifest = loadManifest();
  let libraries = manifest.libraries;
  if (opts?.libraryIds?.length) {
    libraries = libraries.filter(lib => opts.libraryIds!.includes(lib.id));
  }
  if (libraries.length === 0) return [];
  return hybridSearch(libraries, query, opts?.limit || 10);
}

export function getLibraryStats(id: string): { fileCount: number; chunkCount: number; indexSizeBytes: number; hasVectors: boolean } | null {
  const indexPath = join(LIBRARIES_DIR, `${id}.index.json`);
  if (!existsSync(indexPath)) return null;
  try {
    const raw = readFileSync(indexPath, 'utf-8');
    const stats = statSync(indexPath);
    const parsed = JSON.parse(raw);
    const chunkCount = parsed.documentCount || 0;
    const docs = parsed.storedFields || {};
    const files = new Set<string>();
    for (const doc of Object.values(docs) as any[]) {
      if (doc.filePath) files.add(doc.filePath);
    }
    const hasVectors = existsSync(vectorStorePath(id));
    return { fileCount: files.size, chunkCount, indexSizeBytes: stats.size, hasVectors };
  } catch {
    return null;
  }
}

export function isOllamaConfigured(): boolean {
  return ollamaAvailable === true;
}

export async function getSearchStatus(): Promise<{ ollamaAvailable: boolean; embeddingModel: string; ollamaUrl: string }> {
  await checkOllamaAvailable();
  return { ollamaAvailable: ollamaAvailable ?? false, embeddingModel: getEmbeddingModel(), ollamaUrl: getOllamaUrl() };
}
