"use client";

import { useState } from "react";
import { Icon } from "@/app/Icon";

export function DropZone({
  label,
  hint,
  accept,
  multiple,
  files,
  onFiles,
}: {
  label: string;
  hint: string;
  accept: string;
  multiple: boolean;
  files: File[];
  onFiles: (files: File[]) => void;
}) {
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );
    if (!dropped.length) return;
    onFiles(multiple ? dropped : [dropped[0]]);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (!picked.length) return;
    onFiles(multiple ? picked : [picked[0]]);
    e.target.value = "";
  }

  return (
    <div className="drop-group">
      <label
        className={`drop${dragging ? " dragging" : ""}${files.length ? " filled" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input type="file" accept={accept} multiple={multiple} hidden onChange={handleChange} />
        <div className="dropic">
          <Icon name={files.length ? "check" : "upload"} size={20} />
        </div>
        <div className="dl">{label}</div>
        <div className="dh">{hint}</div>
      </label>

      {files.length > 0 && (
        <ul className="file-list">
          {files.map((f) => (
            <li key={f.name} className="fchip ok">
              <Icon name="file" size={13} /> {f.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
