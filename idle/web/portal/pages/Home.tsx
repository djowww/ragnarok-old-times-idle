import type { NewsSummary, PortalStatus, RankingPage } from '../../../shared/portal-types';
import { useAuth } from '../AuthProvider';
import { formatNumber, LoadState, Panel, usePublicData } from '../PortalShell';
import { Link } from '../router';
import { NewsList } from './News';
export default function Home() {
  const auth = useAuth(); const news = usePublicData<NewsSummary[]>('/api/portal/news'); const status = usePublicData<PortalStatus>('/api/portal/status'); const ranking = usePublicData<RankingPage>('/api/portal/ranking?category=level&class=all&page=1&pageSize=5');
  return <><h1 className="portal-home-title">Bem-vindo a Rune-Midgard</h1><div className="portal-home-grid"><aside>
    <Panel title="Portal do aventureiro"><p>{auth.account ? `Olá, ${auth.account.characterName}. Sua história continua por aqui.` : 'Reencontre o mundo de Ragnarok, no seu próprio ritmo.'}</p><Link className="portal-button portal-primary" href={auth.account ? '/painel' : '/registro'}>{auth.account ? 'Meu personagem' : 'Começar minha aventura'}</Link><Link className="portal-access-link" href={auth.account ? '/jogar' : '/login'}>{auth.account ? 'Entrar no jogo' : 'Já tenho uma conta'}</Link></Panel>
    <Panel title="Informações do servidor">{status.data ? <><p className="portal-online">● Servidor disponível</p><dl className="portal-facts"><dt>Contas</dt><dd>{formatNumber(status.data.accounts)}</dd><dt>Em caça</dt><dd>{formatNumber(status.data.hunting)}</dd><dt>EXP Base</dt><dd>{status.data.rates.baseExp}×</dd><dt>EXP Job</dt><dd>{status.data.rates.jobExp}×</dd><dt>Drop</dt><dd>{status.data.rates.drop}×</dd></dl><p className="portal-muted">Dados consultados às {new Date(status.data.checkedAt).toLocaleTimeString('pt-BR')}.</p></> : <LoadState {...status} />}</Panel>
  </aside><div><Panel title="Últimas notícias">{news.data ? <NewsList entries={news.data.slice(0, 3)} /> : <LoadState {...news} />}<Link className="portal-all" href="/noticias">Ver todos os comunicados →</Link></Panel></div><aside>
    <Panel title="Heróis de Rune-Midgard">{ranking.data ? ranking.data.rows.length ? <ol className="portal-top-ranking">{ranking.data.rows.map(row => <li key={row.rank}><span className="portal-rank">{row.rank}</span><div><strong>{row.characterName}</strong><small>Base {row.baseLevel} / Job {row.jobLevel}{row.reborn ? ' · Renascido' : ''}</small></div></li>)}</ol> : <p>Ainda não há aventureiros classificados.</p> : <LoadState {...ranking} />}<Link className="portal-all" href="/ranking">Ranking completo →</Link></Panel>
    <Panel title="A aventura continua"><p>Escolha sua área de caça no jogo. Seu personagem continua por até 12 horas sem um novo acesso.</p><p>Volte para acompanhar o progresso e preparar o próximo passo.</p><Link href="/noticias">Conheça o Idle →</Link></Panel>
  </aside></div></>;
}
