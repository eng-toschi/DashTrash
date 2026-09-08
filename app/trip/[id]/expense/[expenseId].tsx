import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { getExpense } from '@/db/repositories';
import { ExpenseForm, type ExpenseFormInitial } from '@/features/expenses/ExpenseForm';
import { useQuery } from '@/state/database';
import { EmptyState } from '@/ui/components';
import { useTheme } from '@/ui/theme';

export default function EditExpenseScreen() {
  const t = useTheme();
  const params = useLocalSearchParams();
  const tripId = typeof params.id === 'string' ? params.id : '';
  const expenseId = typeof params.expenseId === 'string' ? params.expenseId : '';

  const initial = useQuery<ExpenseFormInitial | undefined>((db) => {
    const found = getExpense(db, expenseId);
    if (found === undefined) return undefined;

    return {
      id: found.expense.id,
      description: found.expense.description,
      category: found.expense.category,
      amountCents: found.expense.amount_cents,
      currency: found.expense.currency,
      fxRatePpm: found.expense.fx_rate_ppm,
      iofPpm: found.expense.iof_ppm,
      paymentMethod: found.expense.payment_method,
      spentOn: found.expense.spent_on,
      paidBy: found.expense.paid_by,
      splitType: found.expense.split_type,
      shares: found.shares.map((s) => ({
        participantId: s.participantId,
        // Em divisão igual não existe valor digitado; a parte calculada serve
        // de ponto de partida se a pessoa trocar para "valor exato".
        inputCents: s.inputCents === 0 ? s.computedCents : s.inputCents,
      })),
    };
  });

  if (initial === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, justifyContent: 'center' }}>
        <EmptyState title="Despesa não encontrada" hint="Ela pode ter sido excluída." />
      </View>
    );
  }

  return <ExpenseForm tripId={tripId} initial={initial} />;
}
