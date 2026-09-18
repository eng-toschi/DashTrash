/**
 * Entrada por link mágico (Fase 6 — spec §3, §11).
 *
 * Sem senha: a pessoa digita o e-mail, recebe um link, toca nele e volta pro
 * app já com sessão. Esta tela não bloqueia nada do app local — quem nunca
 * abrir ela continua lançando despesa offline como sempre (§17 "não peça
 * login antes de entregar valor").
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/state/auth';
import { Button, Card, Row, Text } from '@/ui/components';
import { IconCheck, IconUser } from '@/ui/icons';
import { useTheme } from '@/ui/theme';
import { FONT, MIN_TOUCH, RADIUS, SPACING } from '@/ui/tokens';

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/u;

export default function LoginScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { session, loading, signInWithEmail, signOut } = useAuth();

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const validEmail = EMAIL_RE.test(email.trim());

  const send = (): void => {
    if (!validEmail) return;
    setStatus('sending');
    void signInWithEmail(email.trim()).then((result) => {
      if (result.ok) {
        setStatus('sent');
      } else {
        setStatus('error');
        setErrorMessage(result.message);
      }
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View
        style={{
          paddingTop: insets.top + SPACING.lg,
          paddingHorizontal: SPACING.xl,
          paddingBottom: insets.bottom + SPACING.xl,
          flex: 1,
          justifyContent: 'center',
          gap: SPACING.xl,
        }}
      >
        <Row style={{ justifyContent: 'flex-end', position: 'absolute', top: insets.top + SPACING.lg, right: SPACING.xl }}>
          <Pressable accessibilityRole="button" onPress={() => { router.back(); }} hitSlop={10}>
            <Text variant="label" tone="muted">
              Fechar
            </Text>
          </Pressable>
        </Row>

        {loading ? (
          <ActivityIndicator color={t.textFaint} />
        ) : session !== null ? (
          <View style={{ alignItems: 'center', gap: SPACING.lg }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: RADIUS.pill,
                backgroundColor: t.positiveSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconCheck size={28} color={t.positive} />
            </View>
            <View style={{ alignItems: 'center', gap: 4 }}>
              <Text variant="title">Conectado</Text>
              <Text variant="caption" tone="muted">
                {session.user.email}
              </Text>
            </View>
            <Button
              label="Sair da conta"
              variant="secondary"
              onPress={() => { void signOut(); }}
            />
          </View>
        ) : (
          <>
            <View style={{ alignItems: 'center', gap: SPACING.md }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: RADIUS.pill,
                  backgroundColor: t.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <IconUser size={28} color={t.accent} />
              </View>
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Text variant="title">Entrar</Text>
                <Text variant="caption" tone="muted" style={{ textAlign: 'center', maxWidth: 280 }}>
                  Só é preciso para convidar alguém pra viagem, ou aceitar um convite. Sem
                  isso, o app continua funcionando 100% no aparelho.
                </Text>
              </View>
            </View>

            {status === 'sent' ? (
              <Card>
                <View style={{ alignItems: 'center', gap: SPACING.sm }}>
                  <IconCheck size={22} color={t.positive} />
                  <Text variant="body" strong style={{ textAlign: 'center' }}>
                    Verifique seu e-mail
                  </Text>
                  <Text variant="caption" tone="muted" style={{ textAlign: 'center' }}>
                    Mandamos um link para {email.trim()}. Toque nele neste mesmo aparelho
                    para voltar já conectado.
                  </Text>
                  <Pressable accessibilityRole="button" onPress={() => { setStatus('idle'); }} hitSlop={8}>
                    <Text variant="caption" tone="accent">
                      Usar outro e-mail
                    </Text>
                  </Pressable>
                </View>
              </Card>
            ) : (
              <View style={{ gap: SPACING.sm }}>
                <Card style={{ paddingVertical: SPACING.md }}>
                  <TextInput
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      if (status === 'error') setStatus('idle');
                    }}
                    placeholder="seu@email.com"
                    placeholderTextColor={t.textFaint}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    accessibilityLabel="E-mail"
                    style={{ fontSize: 16, fontFamily: FONT.semi, color: t.text, minHeight: MIN_TOUCH - 12 }}
                  />
                </Card>

                {status === 'error' ? (
                  <Text variant="caption" tone="negative">
                    Não consegui enviar o link: {errorMessage}
                  </Text>
                ) : null}

                <Button
                  label={status === 'sending' ? 'Enviando…' : 'Enviar link mágico'}
                  onPress={send}
                  disabled={!validEmail || status === 'sending'}
                />
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}
