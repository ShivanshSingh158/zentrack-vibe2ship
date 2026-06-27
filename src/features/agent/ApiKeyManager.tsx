import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Key, ChevronDown, ChevronUp, CheckCircle, AlertCircle } from "lucide-react";
import { addRuntimeApiKey, removeRuntimeApiKey, getRuntimeKeysMasked, getActiveKeyPool, allKeys as envKeysStatic } from "../../services/gemini/core";

const ENV_KEY_COUNT = envKeysStatic.length;

export const ApiKeyManager = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputKey, setInputKey] = useState("");
  const [runtimeKeys, setRuntimeKeys] = useState<{ prefix: string; masked: string }[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const refresh = useCallback(() => {
    setRuntimeKeys(getRuntimeKeysMasked());
    setTotalCount(getActiveKeyPool().length);
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("zen-api-keys-changed", handler);
    return () => window.removeEventListener("zen-api-keys-changed", handler);
  }, [refresh]);

  const handleAdd = () => {
    const trimmed = inputKey.trim();
    if (!trimmed) return;
    if (trimmed.length < 10) {
      setFeedback({ type: "error", msg: "Key too short � paste the full key." });
      setTimeout(() => setFeedback(null), 3000);
      return;
    }
    const added = addRuntimeApiKey(trimmed);
    if (added) {
      setInputKey("");
      refresh();
      setFeedback({ type: "success", msg: `Key added! Pool now has ${getActiveKeyPool().length} key(s).` });
    } else {
      setFeedback({ type: "error", msg: "Key already exists or is invalid." });
    }
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleRemove = (prefix: string) => {
    removeRuntimeApiKey(prefix);
    refresh();
    setFeedback({ type: "success", msg: "Key removed from pool." });
    setTimeout(() => setFeedback(null), 2000);
  };

  const statusColor = totalCount >= 5 ? "#34d399" : totalCount >= 2 ? "#f59e0b" : "#f87171";

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: "0.5rem" }}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: "0.5rem",
          background: "none", border: "none", cursor: "pointer",
          padding: "0.75rem 1.25rem", color: "#9ca3af", fontSize: "0.72rem",
          fontFamily: "inherit",
        }}
      >
        <Key size={12} style={{ color: statusColor }} />
        <span style={{ flex: 1, textAlign: "left" }}>
          API Key Pool{" "}
          <span style={{ color: statusColor, fontWeight: 700 }}>
            {totalCount} key{totalCount !== 1 ? "s" : ""}
          </span>
          <span style={{ color: "#4b5563", marginLeft: "0.4rem" }}>
            � {totalCount * 15} RPM
          </span>
        </span>
        {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "0 1.25rem 1rem", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              {ENV_KEY_COUNT > 0 && (
                <div style={{
                  fontSize: "0.68rem", color: "#6b7280",
                  background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.12)",
                  borderRadius: "8px", padding: "0.5rem 0.75rem",
                }}>
                  {ENV_KEY_COUNT} key{ENV_KEY_COUNT !== 1 ? "s" : ""} loaded from .env (hidden)
                </div>
              )}

              {runtimeKeys.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  {runtimeKeys.map((k) => (
                    <div
                      key={k.prefix}
                      style={{
                        display: "flex", alignItems: "center", gap: "0.5rem",
                        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "8px", padding: "0.4rem 0.7rem",
                      }}
                    >
                      <CheckCircle size={11} style={{ color: "#34d399", flexShrink: 0 }} />
                      <span style={{ flex: 1, fontFamily: "monospace", fontSize: "0.68rem", color: "#a1a1aa" }}>
                        {k.masked}
                      </span>
                      <button
                        onClick={() => handleRemove(k.prefix)}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          color: "#6b7280", padding: "2px", display: "flex", alignItems: "center",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "#6b7280")}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="password"
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  placeholder="Paste Gemini API key here..."
                  style={{
                    flex: 1, background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px",
                    padding: "0.5rem 0.75rem", color: "#fff", fontSize: "0.75rem",
                    outline: "none", fontFamily: "monospace",
                  }}
                />
                <button
                  onClick={handleAdd}
                  disabled={!inputKey.trim()}
                  style={{
                    background: inputKey.trim() ? "linear-gradient(135deg,#8b5cf6,#3b82f6)" : "rgba(255,255,255,0.06)",
                    border: "none", borderRadius: "8px", padding: "0 0.75rem",
                    color: inputKey.trim() ? "#fff" : "#4b5563",
                    cursor: inputKey.trim() ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", gap: "0.3rem",
                    fontSize: "0.72rem", fontWeight: 600, fontFamily: "inherit",
                    transition: "all 0.2s", flexShrink: 0,
                  }}
                >
                  <Plus size={13} /> Add
                </button>
              </div>

              <AnimatePresence>
                {feedback && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    style={{
                      fontSize: "0.7rem", padding: "0.4rem 0.7rem", borderRadius: "8px",
                      background: feedback.type === "success" ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)",
                      border: `1px solid ${feedback.type === "success" ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}`,
                      color: feedback.type === "success" ? "#34d399" : "#f87171",
                      display: "flex", alignItems: "center", gap: "0.4rem",
                    }}
                  >
                    {feedback.type === "success" ? <CheckCircle size={11} /> : <AlertCircle size={11} />}
                    {feedback.msg}
                  </motion.div>
                )}
              </AnimatePresence>

              <div style={{ fontSize: "0.63rem", color: "#4b5563", lineHeight: 1.5 }}>
                Get free keys at{" "}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#6366f1" }}
                >
                  aistudio.google.com
                </a>
                . Each key adds +15 RPM. Keys are saved in your browser and load-balanced automatically.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
