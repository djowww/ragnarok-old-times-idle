import { useEffect } from 'react';
import type { NewsEntry } from '../../../shared/portal-types';
import { formatDate, LoadState, Panel, usePublicData } from '../PortalShell';
import { Link } from '../router';
export default function NewsDetail({ slug }: { slug: string }) {
  const news = usePublicData<NewsEntry>(`/api/portal/news/${encodeURIComponent(slug)}`);
  useEffect(() => { if (news.data) document.title = `${news.data.title} · Ragnarok Old Times Idle`; }, [news.data]);
  return <><h1>{news.data?.title ?? (news.error?.status === 404 ? 'Notícia não encontrada' : 'Notícia')}</h1><Panel title="Mural de comunicados">{news.data ? <article className="portal-article"><div className="portal-meta"><span>{news.data.category}</span><time dateTime={news.data.publishedAt}>{formatDate(news.data.publishedAt)}</time></div>{news.data.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</article> : <LoadState {...news} />}<Link href="/noticias">← Todas as notícias</Link></Panel></>;
}
