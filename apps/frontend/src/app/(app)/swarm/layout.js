import { Toaster } from "../../../../../../libraries/react-shared-libraries/src/toaster/toaster";
export const dynamic = 'force-dynamic';
export const metadata = {
    title: 'Prospektlab Swarm Manager',
    description: 'Autonomous agent swarm for social media operations',
};
export default function SwarmLayout({ children }) {
    return (<>
      <Toaster />
      {children}
    </>);
}
//# sourceMappingURL=layout.js.map