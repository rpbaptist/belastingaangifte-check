"use client";

import { useState } from "react";
import { Icon } from "@/app/Icon";

export function ApiKeyInput({
  value,
  onChange,
  isEnvKey,
}: {
  value: string;
  onChange: (v: string) => void;
  isEnvKey: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (isEnvKey) return null;

  if (value && !editing) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
          padding: "8px 12px",
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: 10,
        }}
      >
        <Icon name="shield" size={14} style={{ color: "var(--pos)", flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, color: "var(--ink-3)", flex: 1 }}>
          API-sleutel ingesteld
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--bronze)",
            background: "none",
            border: 0,
            cursor: "pointer",
            padding: 0,
          }}
        >
          Wijzigen
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>
          Jouw Anthropic API-sleutel
        </label>
        {editing && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            style={{
              fontSize: 12,
              color: "var(--ink-3)",
              background: "none",
              border: 0,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Annuleren
          </button>
        )}
      </div>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        placeholder="sk-ant-…"
        autoComplete="off"
        autoFocus={editing}
        style={{
          width: "100%",
          padding: "9px 12px",
          fontSize: 13,
          fontFamily: "var(--font-geist-mono), monospace",
          border: "1.5px solid var(--line-2)",
          borderRadius: 10,
          background: "var(--paper)",
          color: "var(--ink)",
          outline: "none",
          boxSizing: "border-box",
          transition: "border-color .12s",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--bronze)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--line-2)";
          if (value) setEditing(false);
        }}
      />
    </div>
  );
}
