/**
 * Home Page
 * Redireciona para a tela principal (Dashboard)
 */

import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/dashboard');
}
