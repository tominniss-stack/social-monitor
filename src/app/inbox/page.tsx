import { Navbar } from '@/components/Navbar';
import { InboxView } from '@/components/InboxView';

export default function InboxPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors">
      <Navbar />
      <InboxView />
    </div>
  );
}
