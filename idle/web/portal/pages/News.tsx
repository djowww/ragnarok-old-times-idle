import type { NewsSummary } from '../../../shared/portal-types';
import { formatDate, LoadState, Panel, usePublicData } from '../PortalShell';
import { Link } from '../router';
export function NewsList({ entries }: { entries: NewsSummary[] }) {
  return entries.length ? <div className="portal-news-list">{entries.map(entry => <article key={entry.slug}><div className="portal-meta"><span>{entry.category}</span><time dateTime={entry.publishedAt}>{formatDate(entry.publishedAt)}</time></div><h3><Link href={`/noticias/${entry.slug}`}>{entry.title}</Link></h3><p>{entry.summary}</p><Link className="portal-read" href={`/noticias/${entry.slug}`}>Ler comunicado →</Link></article>)}</div> : <p>Nenhum comunicado publicado.</p>;
}
export default function News() { const news = usePublicData<NewsSummary[]>('/api/portal/news'); return <><h1>Notícias</h1><Panel title="Mural de comunicados">{news.data ? <NewsList entries={news.data} /> : <LoadState {...news} />}</Panel></>; }
