/**
 * Home Page
 * Redireciona para a tela principal (Saldo Diário)
 */

import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/saldo-diario');
}
