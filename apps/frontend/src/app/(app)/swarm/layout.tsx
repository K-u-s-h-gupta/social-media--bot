import { ReactNode } from 'react';
import { Toaster } from '@gitroom/react/toaster/toaster';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Prospektlab Swarm Manager',
  description: 'Autonomous agent swarm for social media operations',
};

export default function SwarmLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Toaster />
      {children}
    </>
  );
}
