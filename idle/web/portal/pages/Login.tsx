import { useState } from 'react';
import { useAuth } from '../AuthProvider';
import { Link, navigate, safeReturn, useRoute } from '../router';
import { Panel } from '../PortalShell';
import { Field, useAccountForm } from './Register';
export default function Login() {
  const auth = useAuth(); const { search } = useRoute(); const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const form = useAccountForm('/api/auth/login', account => { auth.accept(account); navigate(safeReturn(new URLSearchParams(search).get('return')), true); });
  return <><h1>Entrar na conta</h1><div className="portal-form-layout"><Panel title="Bem-vindo de volta"><form noValidate onSubmit={event => void form.send(event, { username, password }, { username: /^[A-Za-z0-9_]{3,24}$/.test(username) ? '' : 'Informe seu usuário.', password: password ? '' : 'Informe sua senha.' })}>
    <p>Sua aventura está esperando por você.</p>{form.error && <p role="alert" className="portal-feedback">{form.error}</p>}
    <Field name="username" label="Usuário" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} error={form.fields.username} />
    <Field name="password" label="Senha" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} error={form.fields.password} />
    <button className="portal-primary" disabled={form.busy}>{form.busy ? 'Entrando…' : 'Entrar'}</button>
  </form></Panel><Panel title="Primeira visita?"><p>Crie sua conta para ter um personagem e progresso próprios.</p><Link className="portal-button" href="/registro">Criar conta</Link><p>As contas deste portal são próprias do Idle.</p></Panel></div></>;
}
