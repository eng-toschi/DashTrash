import { useLocalSearchParams } from 'expo-router';
import { ExpenseForm } from '@/features/expenses/ExpenseForm';

export default function NewExpenseScreen() {
  const params = useLocalSearchParams();
  const tripId = typeof params.id === 'string' ? params.id : '';
  return <ExpenseForm tripId={tripId} />;
}
