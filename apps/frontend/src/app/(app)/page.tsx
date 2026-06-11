export const dynamic = 'force-dynamic';
import { redirect } from 'next/navigation';

/** Root redirect — goes directly to the Swarm Manager */
export default function RootPage() {
  redirect('/swarm');
}
