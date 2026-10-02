/** `/budget` lands on the current cycle (Module 05, screen 1). */

import { redirect } from 'next/navigation';

export default function BudgetIndexPage() {
  redirect('/budget/current-cycle');
}
