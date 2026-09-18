/**
 * Cliente do Supabase — a única porta de saída para o backend compartilhado.
 *
 * Sessão persistida no SecureStore (`secureStorageAdapter`), nunca em
 * AsyncStorage (spec §12). `detectSessionInUrl: false` porque isso é para
 * apps web lendo o hash da URL depois do redirect — no React Native o link
 * do magic link chega por deep link (`state/auth.tsx` entrega a URL à mão).
 * `flowType: 'pkce'` pelo mesmo motivo: é o fluxo pensado para link mágico
 * terminando num deep link de app, não numa aba de navegador.
 */
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/config/supabase';
import { secureStorageAdapter } from './secureStorage';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: secureStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});
