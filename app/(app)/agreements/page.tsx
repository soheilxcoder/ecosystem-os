/** `/agreements` lands on the active-agreements screen (Module 04, screen 1). */

import { redirect } from 'next/navigation';

export default function AgreementsIndexPage() {
  redirect('/agreements/active');
}
