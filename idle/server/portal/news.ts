import { readFile } from 'node:fs/promises';
import type { NewsEntry } from '../../shared/portal-types.js';

export async function loadNews(): Promise<NewsEntry[]> {
  // Source and compiled server have different depths; neither depends on cwd.
  for (const path of [new URL('../../content/news.json', import.meta.url), new URL('../../../content/news.json', import.meta.url)]) {
    try {
      const entries = JSON.parse(await readFile(path, 'utf8')) as NewsEntry[];
      return entries.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.slug.localeCompare(b.slug));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  throw new Error('Portal news content missing');
}
