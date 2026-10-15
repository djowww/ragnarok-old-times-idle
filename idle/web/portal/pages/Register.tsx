import { useEffect, useRef, useState, type FormEvent, type InputHTMLAttributes } from 'react';
import type { AccountView } from '../../../shared/portal-types';
import { ApiFailure, request } from '../../http';
import { useAuth } from '../AuthProvider';
import { Link, navigate } from '../router';
import { Panel } from '../PortalShell';

export function Field({ label, error, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { name: string; label: string; error?: string; hint?: string }) {
  return <div className="portal-field"><label htmlFor={`field-${props.name}`}>{label}</label><input {...props} id={`field-${props.name}`} aria-invalid={!!error} aria-describedby={error || hint ? `help-${props.name}` : undefined} /><small id={`help-${props.name}`} className={error ? 'portal-field-error' : ''}>{error ?? hint}</small></div>;
}
export function validatePassword(value: string) { return [...value].length < 10 || [...value].length > 128 || new TextEncoder().encode(value).length > 512 ? 'Use 10 a 128 caracteres, até 512 bytes.' : ''; }
export function useAccountForm(path: string, success: (account: AccountView) => void, identity?: Pick<AccountView, 'accountId' | 'profileId'>) {
  const auth = useAuth(); const locked = useRef(false); const mounted = useRef(false); const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [fields, setFields] = useState<Record<string, string>>({});
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  async function send(event: FormEvent, body: unknown, validation: Record<string, string> = {}) {
    event.preventDefault(); if (locked.current) return;
    setError(''); setFields(validation); if (Object.values(validation).some(Boolean)) { setError('Confira os campos informados.'); return; }
    locked.current = true; setBusy(true); const abort = new AbortController(); controller.current = abort;
    try {
      const account = await request<AccountView>(path, { method: 'POST', body, identity, signal: abort.signal });
      if (mounted.current && !abort.signal.aborted) success(account);
    } catch (failure) {
      if (!mounted.current || abort.signal.aborted) return;
      if (failure instanceof ApiFailure && failure.code === 'AUTH_REQUIRED') auth.invalidate();
      else { setError((failure as Error).message); setFields(failure instanceof ApiFailure ? failure.fields ?? {} : {}); }
    }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  return { busy, error, fields, send };
}
export default function Register() {
  const auth = useAuth(); const [values, setValues] = useState({ username: '', characterName: '', gender: 'male', password: '', confirmation: '' });
  const form = useAccountForm('/api/auth/register', account => { auth.accept(account); navigate('/painel', true); });
  const change = (name: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues(previous => ({ ...previous, [name]: event.target.value }));
  function submit(event: FormEvent) {
    const name = values.characterName.trim().normalize('NFC');
    void form.send(event, { ...values, characterName: name }, {
      username: /^[A-Za-z0-9_]{3,24}$/.test(values.username) ? '' : 'Use 3 a 24 letras, números ou _.',
      characterName: [...name].length >= 2 && [...name].length <= 24 && /^[\p{L}\p{N} _-]+$/u.test(name) && name.toLowerCase() !== 'djow' ? '' : 'Use 2 a 24 letras, números, espaços, _ ou -. O nome djow é reservado.',
      password: validatePassword(values.password), confirmation: values.password === values.confirmation ? '' : 'As senhas precisam corresponder.',
    });
  }
  return <><h1>Criar conta</h1><div className="portal-form-layout"><Panel title="Sua jornada começa aqui"><form onSubmit={submit} noValidate>
    <p>Crie sua conta do Idle e escolha o nome do seu personagem.</p>
    {form.error && <p role="alert" className="portal-feedback">{form.error}</p>}
    <Field name="username" label="Usuário" hint="3 a 24 letras, números ou _." autoComplete="username" value={values.username} onChange={change('username')} error={form.fields.username} />
    <Field name="characterName" label="Nome do personagem" hint="2 a 24 caracteres. Este nome aparece no jogo e no ranking." value={values.characterName} onChange={change('characterName')} error={form.fields.characterName} />
    <div className="portal-field"><label htmlFor="gender">Aparência</label><select id="gender" name="gender" value={values.gender} onChange={change('gender')}><option value="male">Masculina</option><option value="female">Feminina</option></select></div>
    <Field name="password" label="Senha" type="password" autoComplete="new-password" hint="10 a 128 caracteres. Espaços fazem parte da senha." value={values.password} onChange={change('password')} error={form.fields.password} />
    <Field name="confirmation" label="Confirmar senha" type="password" autoComplete="new-password" value={values.confirmation} onChange={change('confirmation')} error={form.fields.confirmation} />
    <button className="portal-primary" disabled={form.busy}>{form.busy ? 'Criando conta…' : 'Criar minha conta'}</button><p>Já tem uma conta? <Link href="/login">Entrar</Link></p>
  </form></Panel><Panel title="Antes de partir"><p>Uma conta, um personagem e seu próprio progresso.</p><p>Comece como Aprendiz, explore as áreas e encontre sua próxima classe.</p><p>A caça continua enquanto você está fora, dentro do limite de 12 horas.</p><Link href="/noticias">Leia os primeiros passos</Link></Panel></div></>;
}
