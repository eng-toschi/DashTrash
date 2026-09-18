/**
 * Config do backend compartilhado (Fase 6 — spec §3, §5.4).
 *
 * A chave aqui é a `publishable` (formato novo do Supabase, equivalente à
 * antiga `anon key`): pensada para ir no código do app. Ela não abre porta
 * nenhuma sozinha — quem barra o acesso é o RLS em `supabase/schema.sql`.
 * A chave que NUNCA pode aparecer aqui é a `secret` (antiga `service_role`):
 * essa ignora RLS inteiro e só existe atrás de um servidor.
 */
export const SUPABASE_URL = 'https://wqoubxpidrfnitttkqej.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_q9D9fx85rVSqUD6NEPMCnQ_3UNe5aJb';
