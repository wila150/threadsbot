import { useState, type KeyboardEvent } from "react";

/** 標籤式輸入：Enter 或逗號新增 */
export function ListInput({
  value,
  onChange,
  placeholder,
  max,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  max?: number;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const items = draft
      .split(/[,，、\n]/)
      .map((s) => s.trim())
      .filter((s) => s && !value.includes(s));
    if (items.length) onChange([...value, ...items].slice(0, max ?? Infinity));
    setDraft("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return; // 中文輸入法選字中
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const full = max !== undefined && value.length >= max;
  return (
    <div>
      {value.length > 0 && (
        <div className="chips">
          {value.map((v) => (
            <span key={v} className="chip">
              {v}
              <button type="button" aria-label={`移除 ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={draft}
        disabled={full}
        placeholder={full ? `最多 ${max} 個` : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
      />
    </div>
  );
}
