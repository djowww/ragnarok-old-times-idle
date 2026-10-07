import { Panel } from '../PortalShell';
import { Link } from '../router';
export default function NotFound() { return <><h1>Página não encontrada</h1><Panel title="Caminho desconhecido"><p>Este endereço não está no mapa de Rune-Midgard.</p><Link href="/">Voltar ao início</Link></Panel></>; }
