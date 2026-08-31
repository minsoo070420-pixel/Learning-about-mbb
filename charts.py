import html

WIDTH, HEIGHT = 560, 300
PAD_LEFT, PAD_RIGHT, PAD_TOP, PAD_BOTTOM = 56, 20, 44, 46
PLOT_W = WIDTH - PAD_LEFT - PAD_RIGHT
PLOT_H = HEIGHT - PAD_TOP - PAD_BOTTOM

SERIES_COLORS = ["#1f3a5f", "#b7791f"]


def _esc(s):
    return html.escape(str(s), quote=True)


def _nice_bounds(all_values):
    lo, hi = min(all_values), max(all_values)
    if lo == hi:
        lo, hi = lo - 1, hi + 1
    span = hi - lo
    pad = span * 0.15
    return lo - pad, hi + pad


def _y_ticks(lo, hi, n=4):
    step = (hi - lo) / n
    return [round(lo + step * i, 1) for i in range(n + 1)]


def _fmt(v, unit):
    v = round(v, 1) if abs(v - round(v)) > 0.05 else int(round(v))
    if unit == "$":
        return f"${v}"
    if unit == "$M":
        return f"${v}M"
    if unit == "%":
        return f"{v}%"
    return str(v)


def render_exhibit_svg(exhibit):
    labels = exhibit["labels"]
    series = exhibit["series"]
    unit = exhibit.get("unit", "")
    title = exhibit.get("title", "")
    chart_type = exhibit.get("type", "bar")

    all_values = [v for s in series for v in s["values"]]
    lo, hi = _nice_bounds(all_values)
    ticks = _y_ticks(lo, hi)

    def y_pos(v):
        return PAD_TOP + PLOT_H - (v - lo) / (hi - lo) * PLOT_H

    parts = [
        f'<svg viewBox="0 0 {WIDTH} {HEIGHT}" xmlns="http://www.w3.org/2000/svg" '
        f'role="img" aria-label="{_esc(title)}" class="exhibit-svg">',
        f'<text x="{WIDTH/2}" y="20" text-anchor="middle" class="exhibit-title">{_esc(title)}</text>',
    ]

    # gridlines + y-axis labels
    for t in ticks:
        y = y_pos(t)
        parts.append(f'<line x1="{PAD_LEFT}" y1="{y:.1f}" x2="{WIDTH-PAD_RIGHT}" y2="{y:.1f}" class="exhibit-gridline"/>')
        parts.append(f'<text x="{PAD_LEFT-8}" y="{y+4:.1f}" text-anchor="end" class="exhibit-axis-label">{_fmt(t, unit)}</text>')

    n = len(labels)
    slot_w = PLOT_W / n

    if chart_type == "bar":
        n_series = len(series)
        group_pad = slot_w * 0.2
        bar_w = (slot_w - group_pad * 2) / n_series
        for si, s in enumerate(series):
            color = SERIES_COLORS[si % len(SERIES_COLORS)]
            for i, v in enumerate(s["values"]):
                x = PAD_LEFT + i * slot_w + group_pad + si * bar_w
                y = y_pos(v)
                bar_h = (PAD_TOP + PLOT_H) - y
                parts.append(
                    f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_w*0.86:.1f}" height="{max(bar_h,0):.1f}" '
                    f'fill="{color}" rx="3"/>'
                )
                parts.append(
                    f'<text x="{x+bar_w*0.43:.1f}" y="{y-6:.1f}" text-anchor="middle" '
                    f'class="exhibit-value-label">{_fmt(v, unit)}</text>'
                )
    else:  # line
        for si, s in enumerate(series):
            color = SERIES_COLORS[si % len(SERIES_COLORS)]
            points = []
            for i, v in enumerate(s["values"]):
                x = PAD_LEFT + slot_w * (i + 0.5)
                y = y_pos(v)
                points.append((x, y))
            path = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
            parts.append(f'<polyline points="{path}" fill="none" stroke="{color}" stroke-width="2.5"/>')
            for x, y in points:
                parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.5" fill="{color}"/>')
            last_x, last_y = points[-1]
            parts.append(
                f'<text x="{last_x:.1f}" y="{last_y-10:.1f}" text-anchor="middle" '
                f'class="exhibit-value-label" fill="{color}">{_fmt(s["values"][-1], unit)}</text>'
            )

    # x-axis labels
    for i, label in enumerate(labels):
        x = PAD_LEFT + slot_w * (i + 0.5)
        parts.append(f'<text x="{x:.1f}" y="{HEIGHT-PAD_BOTTOM+18:.1f}" text-anchor="middle" class="exhibit-axis-label">{_esc(label)}</text>')

    # legend, only if more than one series
    if len(series) > 1:
        lx = PAD_LEFT
        ly = HEIGHT - 10
        for si, s in enumerate(series):
            color = SERIES_COLORS[si % len(SERIES_COLORS)]
            parts.append(f'<rect x="{lx:.1f}" y="{ly-9:.1f}" width="10" height="10" fill="{color}" rx="2"/>')
            parts.append(f'<text x="{lx+14:.1f}" y="{ly:.1f}" class="exhibit-legend-label">{_esc(s["name"])}</text>')
            lx += 18 + len(s["name"]) * 6.2

    parts.append("</svg>")
    return "".join(parts)
