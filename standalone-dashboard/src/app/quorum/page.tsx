import { getQuorumChatHistory, listQuorumThreads } from '@/lib/db';
import { QuorumChatPanel } from '@/components/quorum-chat-panel';
import { QuorumThreadSidebar } from '@/components/quorum-thread-sidebar';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function QuorumPage() {
  const cookieStore = await cookies();
  const activeThreadId = cookieStore.get('quorum-active-thread')?.value || 'default';

  const [threads, history] = await Promise.all([
    listQuorumThreads(),
    getQuorumChatHistory(activeThreadId, 100),
  ]);

  // Find the active thread's title
  const activeThread = threads.find(t => t.thread_id === activeThreadId);
  const threadTitle = activeThread?.title || null;

  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)] md:h-[calc(100vh-1rem)]">
      {/* Thread Sidebar */}
      <QuorumThreadSidebar activeThreadId={activeThreadId} />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-3 border-b border-zinc-800 px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-amber-500 text-sm font-bold text-white">
            Q
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">
              The Quorum
            </h1>
            <p className="text-sm text-zinc-500">
              {threadTitle || 'All 7 agents working together as a council'}
            </p>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <QuorumChatPanel
            initialMessages={history}
            threadId={activeThreadId}
            threadTitle={threadTitle}
          />
        </div>
      </div>
    </div>
  );
}
