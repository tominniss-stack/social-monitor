import { redirect } from 'next/navigation';

/** The inbox lives at /inbox (spec §6.1); the root simply forwards there. */
export default function HomePage() {
  redirect('/inbox');
}
