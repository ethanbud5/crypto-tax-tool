"use client";

import { useCallback, useRef, useState } from "react";

interface CsvUploadProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export function CsvUpload({ file, onFileChange }: CsvUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    (f: File) => {
      if (f.type === "text/csv" || f.name.endsWith(".csv")) {
        onFileChange(f);
      }
    },
    [onFileChange],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`
        relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all
        ${
          isDragging
            ? "border-accent bg-accent/5 scale-[1.01]"
            : file
              ? "border-gain/40 bg-gain/5"
              : "border-card-border hover:border-muted bg-card/30"
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
        className="hidden"
      />

      {file ? (
        <div className="space-y-2">
          <div className="w-10 h-10 mx-auto rounded-lg bg-gain/10 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-gain"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <p className="font-medium text-sm">{file.name}</p>
          <p className="text-xs text-muted">
            {(file.size / 1024).toFixed(1)} KB
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFileChange(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="text-xs text-loss hover:text-loss/80 underline underline-offset-2"
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="w-10 h-10 mx-auto rounded-lg bg-card flex items-center justify-center">
            <svg
              className="w-5 h-5 text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
          <p className="text-sm font-medium">
            Drop your CSV file here or{" "}
            <span className="text-accent">browse</span>
          </p>
          <p className="text-xs text-muted">CSV files only</p>
        </div>
      )}
    </div>
  );
}
