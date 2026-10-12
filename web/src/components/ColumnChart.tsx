import { useState } from "react";

/** 單一數列的直條圖：細長條、頂端 4px 圓角、底部方角，hover 顯示數值 */
export function ColumnChart({ data, unit, label }: { data: { x: string; y: number }[]; unit: string; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 180;
  const pad = { top: 12, right: 8, bottom: 22, left: 32 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const max = niceMax(Math.max(1, ...data.map((d) => d.y)));
  const band = innerW / data.length;
  const barW = Math.min(24, band * 0.6);
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(data.length / 7);
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;

  return (
    <div className="chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} />
            <text className="axis-text" x={pad.left - 6} y={y(t) + 4} textAnchor="end">
              {compact(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.left + band * i + band / 2;
          const h = (d.y / max) * innerH;
          return (
            <g key={d.x}>
              {h > 0 && (
                <path
                  className={`bar ${hover !== null && hover !== i ? "dim" : ""}`}
                  d={roundedTop(cx - barW / 2, pad.top + innerH - h, barW, h, Math.min(4, h, barW / 2))}
                />
              )}
              {i % labelEvery === 0 && (
                <text className="axis-text" x={cx} y={H - 6} textAnchor="middle">
                  {d.x.slice(5).replace("-", "/")}
                </text>
              )}
              {/* 比長條大的 hover 區 */}
              <rect
                x={pad.left + band * i}
                y={pad.top}
                width={band}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(i)}
              />
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="tip"
          style={{
            left: `${((pad.left + band * hover + band / 2) / W) * 100}%`,
            top: `${(Math.min(y(data[hover].y), pad.top + innerH - 8) / H) * 100}%`,
          }}
        >
          {data[hover].x.slice(5).replace("-", "/")}　<b>{data[hover].y}</b> {unit}
        </div>
      )}
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function niceMax(v: number) {
  const steps = [1, 2, 4, 5, 10];
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const s of steps) if (s * mag >= v) return s * mag;
  return 10 * mag;
}

function compact(v: number) {
  return v >= 1000 ? `${+(v / 1000).toFixed(1)}K` : String(+v.toFixed(1));
}
