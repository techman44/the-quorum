"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DOC_TYPES = ["note", "file", "report", "reflection"] as const;

type UploadStep = "idle" | "uploading" | "storing" | "embedding" | "done" | "error";

export function UploadDialog() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("file");
  const [customType, setCustomType] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [step, setStep] = useState<UploadStep>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  function reset() {
    setTitle("");
    setDocType("file");
    setCustomType("");
    setTagsInput("");
    setStep("idle");
    setErrorMsg("");
    setSelectedFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const nameWithoutExt = file.name.replace(/\.[^.]+$/, "");
    if (!title) setTitle(nameWithoutExt);

    setSelectedFile(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) return;

    const finalType = docType === "custom" ? customType : docType;
    if (!finalType) return;

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    setStep("uploading");

    try {
      setStep("storing");

      // Use FormData for file upload - this allows the server to parse PDFs
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("title", title);
      formData.append("doc_type", finalType);
      formData.append("tags", JSON.stringify(tags));

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        // Don't set Content-Type header - let the browser set it with the correct boundary
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Upload failed");
      }

      setStep("embedding");
      // The API already handled embedding synchronously; brief visual step
      await new Promise((r) => setTimeout(r, 500));

      setStep("done");
      setTimeout(() => {
        setOpen(false);
        reset();
        router.refresh();
      }, 800);
    } catch (err) {
      setStep("error");
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
    }
  }

  const stepLabels: Record<UploadStep, string> = {
    idle: "",
    uploading: "Reading file...",
    storing: "Storing document...",
    embedding: "Generating embedding...",
    done: "Done!",
    error: errorMsg,
  };

  // Get file extension for display
  const getFileExtension = (filename: string) => {
    const parts = filename.toLowerCase().split(".");
    return parts.length > 1 ? parts[parts.length - 1] : "";
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mr-2"
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload Document
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">File</label>
            <Input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.md,.markdown,.json,.csv,.xml,.html,.htm,.css,.js,.ts,.tsx,.jsx,.py,.sh,.yml,.yaml,.toml,.ini,.cfg,.conf,.log,.sql,.env,.dockerfile,.rs,.go,.java,.c,.cpp,.h,.hpp,.rb,.php,.swift,.kt,.scala,.r"
              onChange={handleFileChange}
              className="bg-zinc-900 border-zinc-700 text-zinc-300 file:text-zinc-400 file:border-0 file:bg-zinc-800 file:mr-3 file:px-3 file:py-1 file:rounded"
            />
            {selectedFile && (
              <p className="text-xs text-zinc-500">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                {getFileExtension(selectedFile.name) === "pdf" && (
                  <span className="ml-2 text-blue-400">PDF text will be extracted</span>
                )}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title"
              required
              className="bg-zinc-900 border-zinc-700 text-zinc-100"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">
              Document Type
            </label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                {DOC_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="text-zinc-100">
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </SelectItem>
                ))}
                <SelectItem value="custom" className="text-zinc-100">
                  Custom...
                </SelectItem>
              </SelectContent>
            </Select>
            {docType === "custom" && (
              <Input
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                placeholder="Enter custom type"
                required
                className="bg-zinc-900 border-zinc-700 text-zinc-100"
              />
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">
              Tags (comma-separated)
            </label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="tag1, tag2, tag3"
              className="bg-zinc-900 border-zinc-700 text-zinc-100"
            />
          </div>

          {step !== "idle" && (
            <div
              className={`rounded-md px-3 py-2 text-sm ${
                step === "error"
                  ? "bg-red-950/50 text-red-400 border border-red-800"
                  : step === "done"
                    ? "bg-green-950/50 text-green-400 border border-green-800"
                    : "bg-zinc-900 text-zinc-400 border border-zinc-800"
              }`}
            >
              {step === "error" ? (
                errorMsg
              ) : (
                <span className="flex items-center gap-2">
                  {step !== "done" && (
                    <svg
                      className="h-4 w-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        className="opacity-25"
                      />
                      <path
                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                        fill="currentColor"
                        className="opacity-75"
                      />
                    </svg>
                  )}
                  {stepLabels[step]}
                </span>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              className="text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!selectedFile || !title || step !== "idle"}
            >
              Upload
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
