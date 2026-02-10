"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, MessageSquare, Pencil, Trash2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { QuorumThread } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

interface QuorumThreadSidebarProps {
  activeThreadId: string | null;
}

export function QuorumThreadSidebar({
  activeThreadId,
}: QuorumThreadSidebarProps) {
  const router = useRouter();
  const [threads, setThreads] = useState<QuorumThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch threads on mount and after changes
  const fetchThreads = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/quorum/threads");
      if (res.ok) {
        const data = await res.json();
        setThreads(data);
      }
    } catch (err) {
      console.error("Failed to fetch threads:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThreads();
  }, []);

  // Refresh when active thread changes
  useEffect(() => {
    if (activeThreadId) {
      fetchThreads();
    }
  }, [activeThreadId]);

  const handleThreadSelect = (threadId: string) => {
    document.cookie = `quorum-active-thread=${threadId}; path=/; max-age=31536000`;
    router.push(`/quorum`);
    router.refresh();
  };

  const handleNewThread = async () => {
    try {
      const res = await fetch("/api/quorum/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Conversation" }),
      });
      if (res.ok) {
        const thread = await res.json();
        document.cookie = `quorum-active-thread=${thread.threadId}; path=/; max-age=31536000`;
        router.push(`/quorum`);
        router.refresh();
      }
    } catch (err) {
      console.error("Failed to create thread:", err);
    }
  };

  const handleRename = async (threadId: string, newTitle: string) => {
    try {
      const res = await fetch(`/api/quorum/threads/${threadId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      if (res.ok) {
        setEditingId(null);
        fetchThreads();
      }
    } catch (err) {
      console.error("Failed to rename thread:", err);
    }
  };

  const handleDelete = async (threadId: string) => {
    if (threadId === "default") return;
    try {
      const res = await fetch(`/api/quorum/threads/${threadId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        if (activeThreadId === threadId) {
          handleThreadSelect("default");
        }
        fetchThreads();
      }
    } catch (err) {
      console.error("Failed to delete thread:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const startEditing = (thread: QuorumThread) => {
    setEditingId(thread.thread_id);
    setEditTitle(thread.title);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditTitle("");
  };

  const saveEditing = (threadId: string) => {
    if (editTitle.trim()) {
      handleRename(threadId, editTitle.trim());
    }
  };

  return (
    <div className="w-64 border-r border-zinc-800 bg-zinc-950 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-100">Conversations</h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleNewThread}
            className="h-7 px-2 text-zinc-400 hover:text-zinc-100"
            title="New conversation"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Thread List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading ? (
            <div className="text-center text-zinc-500 text-xs py-4">Loading...</div>
          ) : threads.length === 0 ? (
            <div className="text-center text-zinc-500 text-xs py-4">
              No conversations yet
            </div>
          ) : (
            threads.map((thread) => {
              const isActive = activeThreadId === thread.thread_id;
              const isEditing = editingId === thread.thread_id;

              return (
                <div
                  key={thread.thread_id}
                  className={`group relative rounded-md transition-colors ${
                    isActive
                      ? "bg-zinc-800"
                      : "hover:bg-zinc-900"
                  }`}
                >
                  {isEditing ? (
                    <div className="p-2">
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEditing(thread.thread_id);
                          if (e.key === "Escape") cancelEditing();
                        }}
                        className="h-7 text-sm bg-zinc-900 border-zinc-700 text-zinc-100"
                        autoFocus
                      />
                      <div className="flex gap-1 mt-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => saveEditing(thread.thread_id)}
                          className="h-6 px-2 text-green-400 hover:text-green-300"
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={cancelEditing}
                          className="h-6 px-2 text-zinc-400 hover:text-zinc-300"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleThreadSelect(thread.thread_id)}
                      className="w-full p-2 text-left flex items-start gap-2"
                    >
                      <MessageSquare className={`h-4 w-4 mt-0.5 shrink-0 ${
                        isActive ? "text-blue-400" : "text-zinc-500"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className={`text-sm font-medium truncate ${
                            isActive ? "text-zinc-100" : "text-zinc-300"
                          }`}>
                            {thread.title}
                          </span>
                          <Badge variant="outline" className="text-xs bg-zinc-800 text-zinc-400 border-zinc-700 px-1.5 py-0 h-4">
                            {thread.message_count}
                          </Badge>
                        </div>
                        <span className="text-xs text-zinc-500 block mt-0.5">
                          {timeAgo(new Date(thread.updated_at))}
                        </span>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 shrink-0">
                        {thread.thread_id !== "default" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditing(thread);
                              }}
                              className="h-6 px-1 text-zinc-500 hover:text-zinc-300"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingId(thread.thread_id);
                              }}
                              disabled={deletingId === thread.thread_id}
                              className="h-6 px-1 text-zinc-500 hover:text-red-400"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                      {deletingId === thread.thread_id && (
                        <div className="absolute inset-0 bg-zinc-900/95 rounded-md flex items-center justify-center gap-2 p-2 z-10">
                          <span className="text-xs text-zinc-300">Delete?</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(thread.thread_id);
                            }}
                            className="h-6 px-2 text-red-400 hover:text-red-300 text-xs"
                          >
                            Yes
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingId(null);
                            }}
                            className="h-6 px-2 text-zinc-400 hover:text-zinc-300 text-xs"
                          >
                            No
                          </Button>
                        </div>
                      )}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
