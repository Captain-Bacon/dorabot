import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, watch } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { homedir } from 'node:os';
import MiniSearch from 'minisearch';

const LIBRARIES_DIR = join(homedir(), '.dorabot', 'libraries');
const LIBRARIES_MANIFEST_PATH = join(LIBRARIES_DIR, 'manifest.json');

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

  const indexPath = join(LIBRARIES_DIR, `${library.id}.index.json`);
  writeFileSync(indexPath, JSON.stringify(miniSearch.toJSON()));

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

    return { content: [{ type: 'text', text: `Library "${args.name}" added and indexed. ID: ${id}` }] };
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

    const text = libraries.map(lib =>
      `**${lib.name}** (${lib.id})\n` +
      `  Path: ${lib.path}\n` +
      `  Domains: ${lib.domains.join(', ')}\n` +
      `  Trust: ${lib.trustLevel} | Updates: ${lib.updateFrequency}\n` +
      `  File types: ${lib.fileTypes.join(', ')}`
    ).join('\n\n');

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
      writeFileSync(indexPath, '');
    }

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

    const allResults: SearchResult[] = [];

    for (const library of libraries) {
      const index = await ensureIndexed(library);
      const results = index.search(args.query, { prefix: true, fuzzy: 0.2 });

      results.forEach(result => {
        allResults.push({
          libraryId: library.id,
          libraryName: library.name,
          filePath: result.filePath,
          chunk: result.chunk,
          score: result.score,
          metadata: result.metadata,
        });
      });
    }

    allResults.sort((a, b) => b.score - a.score);

    const topResults = allResults.slice(0, args.limit);

    if (topResults.length === 0) {
      return { content: [{ type: 'text', text: `No results found for query: "${args.query}"` }] };
    }

    const text = topResults.map((result, idx) =>
      `**[${idx + 1}] ${result.libraryName}** (score: ${result.score.toFixed(2)})\n` +
      `Source: ${result.filePath}\n\n` +
      `${result.chunk}\n` +
      `---`
    ).join('\n\n');

    return { content: [{ type: 'text', text }] };
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

    return { content: [{ type: 'text', text: `Library "${library.name}" re-indexed successfully` }] };
  }
);

export const libraryTools = [
  libraryAddTool,
  libraryListTool,
  libraryRemoveTool,
  librarySearchTool,
  libraryReindexTool,
];
