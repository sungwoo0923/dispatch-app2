import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import Card from "./Card";

// The bordered "icon-badge + title + collapse chevron" panel wrapper used
// throughout the reference guide — one enclosing box per screen holding the
// filter row and result list/table together, instead of separate floating
// cards.
export default function Panel({ icon: Icon, title, actions, children, defaultCollapsed = false }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 overflow-x-auto overscroll-x-contain border-b border-slate-100 px-4 py-3 md:px-5">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex shrink-0 items-center gap-2 text-sm font-semibold text-ink"
        >
          {Icon && (
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary-light text-primary">
              <Icon size={13} />
            </span>
          )}
          {title}
          {collapsed ? <ChevronDown size={15} className="text-muted" /> : <ChevronUp size={15} className="text-muted" />}
        </button>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {!collapsed && <div className="p-4 md:p-5">{children}</div>}
    </Card>
  );
}
