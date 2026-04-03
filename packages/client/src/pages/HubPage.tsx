import { useState, useEffect } from "react";
import { Search, BookOpen } from "lucide-react";
import type { HubItem } from "@loopframe/shared";

const TYPE_COLORS: Record<string, string> = {
  harness: "#22c55e",
  tip:     "#f59e0b",
  pattern: "#a78bfa",
};

const TYPE_LABELS: Record<string, string> = {
  harness: "Harness",
  tip:     "Tip",
  pattern: "Pattern",
};

function HubCard({ item, onClick }: { item: HubItem; onClick: () => void }) {
  const accent = item.color || TYPE_COLORS[item.type] || "#22c55e";

  return (
    <button
      onClick={onClick}
      className="card text-left cursor-pointer hover:-translate-y-0.5 hover:shadow-md
                 transition-all duration-200 overflow-hidden group focus-visible:outline-2
                 focus-visible:outline-offset-2"
      style={{ boxShadow: "none" }}
    >
      <div className="flex h-full">
        {/* Accent bar */}
        <div className="w-[3px] flex-shrink-0 transition-opacity duration-200 group-hover:opacity-100 opacity-70"
             style={{ backgroundColor: accent }} />

        <div className="flex-1 p-4 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-sm font-semibold text-text-primary leading-snug
                           group-hover:text-primary transition-colors duration-200 truncate">
              {item.title}
            </h3>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium flex-shrink-0"
              style={{
                backgroundColor: `${accent}18`,
                color: accent,
              }}
            >
              {TYPE_LABELS[item.type] ?? item.type}
            </span>
          </div>

          <p className="text-xs text-text-muted leading-relaxed mb-3 line-clamp-2">
            {item.description}
          </p>

          <div className="flex flex-wrap gap-1">
            {item.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

function DetailModal({ item, onClose }: { item: HubItem; onClose: () => void }) {
  const accent = item.color || TYPE_COLORS[item.type] || "#22c55e";

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="card max-w-2xl w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-bg-border">
          <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: accent }} />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-text-primary">{item.title}</h2>
            <p className="text-xs text-text-muted mt-0.5">{item.domain}</p>
          </div>
          <button onClick={onClose} className="btn-icon flex-shrink-0" aria-label="Close">
            <span className="text-lg leading-none">×</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-sm text-text-secondary">{item.description}</p>
          <div className="flex flex-wrap gap-1.5">
            {item.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
          </div>
          <div className="bg-bg-base rounded-lg p-4 font-mono text-xs text-text-secondary
                          leading-relaxed whitespace-pre-wrap border border-bg-border">
            {item.content}
          </div>
        </div>
      </div>
    </div>
  );
}

const ALL_TYPES = ["all", "harness", "tip", "pattern"] as const;

export function HubPage() {
  const [items, setItems] = useState<HubItem[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selected, setSelected] = useState<HubItem | null>(null);

  useEffect(() => {
    fetch("/api/hub")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setItems(d.data); });
  }, []);

  const filtered = items.filter((item) => {
    const matchesType = typeFilter === "all" || item.type === typeFilter;
    const q = query.toLowerCase();
    const matchesQuery =
      !q ||
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.tags.some((t) => t.toLowerCase().includes(q));
    return matchesType && matchesQuery;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Search + filter bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-bg-border flex-shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            strokeWidth={2}
          />
          <input
            className="input pl-8"
            placeholder="Search harnesses, tips, patterns…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          {ALL_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors duration-150 cursor-pointer ${
                typeFilter === t
                  ? "bg-primary/10 text-primary"
                  : "text-text-muted hover:text-text-secondary hover:bg-bg-elevated"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Bento grid */}
      <div className="flex-1 overflow-y-auto p-5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-bg-elevated flex items-center justify-center">
              <BookOpen size={18} className="text-text-muted" strokeWidth={2} />
            </div>
            <div>
              <p className="text-sm font-medium text-text-secondary">No items found</p>
              <p className="text-xs text-text-muted mt-1">
                Create harnesses in Forge to populate the Hub
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((item) => (
              <HubCard key={item.id} item={item} onClick={() => setSelected(item)} />
            ))}
          </div>
        )}
      </div>

      {selected && <DetailModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
