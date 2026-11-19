"""Render the Cociboard app icons into frontend/public/.

Run from the repository root (no install needed, Pillow comes from uv):

    uv run --with pillow python frontend/scripts/render_icons.py

The artwork (a plate with a fork and a knife on the primary colour) is described once as
shapes in a 100x100 coordinate system. The same shapes are written to ``icon.svg`` and drawn
with Pillow into the PNGs, so the favicon and the installed icons always match.
Keep ``PRIMARY`` in sync with ``--color-primary`` in src/styles/tokens.css.
"""

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw

PRIMARY = "#b9461f"
CREAM = "#ffffff"
TINT = "#fbe3d8"
SUPERSAMPLE = 4
OUT = Path(__file__).resolve().parent.parent / "public"


@dataclass(frozen=True)
class Rect:
    x: float
    y: float
    w: float
    h: float
    r: float
    fill: str


@dataclass(frozen=True)
class Circle:
    cx: float
    cy: float
    r: float
    fill: str | None = None
    stroke: str | None = None
    stroke_width: float = 0


Shape = Rect | Circle

FORK_X = 17.0
KNIFE_X = 83.0


def artwork() -> list[Shape]:
    shapes: list[Shape] = [
        Circle(50, 50, 21, fill=CREAM),
        Circle(50, 50, 14, stroke=TINT, stroke_width=1.8),
    ]
    # Fork: three tines, a bridge and a handle.
    for dx in (-4.5, 0.0, 4.5):
        shapes.append(Rect(FORK_X + dx - 1.1, 24, 2.2, 20, 1.1, CREAM))
    shapes.append(Rect(FORK_X - 6.4, 38, 12.8, 6, 3, CREAM))
    shapes.append(Rect(FORK_X - 2.2, 42, 4.4, 34, 2.2, CREAM))
    # Knife: a blade and a handle.
    shapes.append(Rect(KNIFE_X - 3.2, 24, 6.4, 30, 3.2, CREAM))
    shapes.append(Rect(KNIFE_X - 2.2, 50, 4.4, 26, 2.2, CREAM))
    return shapes


def write_svg(path: Path) -> None:
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
        f'  <rect width="100" height="100" fill="{PRIMARY}"/>',
    ]
    for s in artwork():
        if isinstance(s, Rect):
            parts.append(
                f'  <rect x="{s.x:g}" y="{s.y:g}" width="{s.w:g}" height="{s.h:g}" '
                f'rx="{s.r:g}" fill="{s.fill}"/>'
            )
        else:
            fill = s.fill or "none"
            stroke = f' stroke="{s.stroke}" stroke-width="{s.stroke_width:g}"' if s.stroke else ""
            parts.append(f'  <circle cx="{s.cx:g}" cy="{s.cy:g}" r="{s.r:g}" fill="{fill}"{stroke}/>')
    parts.append("</svg>")
    path.write_text("\n".join(parts) + "\n")


def render(size: int, scale: float) -> Image.Image:
    """Draw the artwork on a full-bleed background; ``scale`` shrinks it towards the centre."""
    big = size * SUPERSAMPLE
    image = Image.new("RGB", (big, big), PRIMARY)
    draw = ImageDraw.Draw(image)
    unit = big / 100

    def tx(v: float) -> float:
        return (50 + (v - 50) * scale) * unit

    def ts(v: float) -> float:
        return v * scale * unit

    for s in artwork():
        if isinstance(s, Rect):
            draw.rounded_rectangle(
                (tx(s.x), tx(s.y), tx(s.x + s.w), tx(s.y + s.h)), radius=ts(s.r), fill=s.fill
            )
        else:
            box = (tx(s.cx - s.r), tx(s.cy - s.r), tx(s.cx + s.r), tx(s.cy + s.r))
            if s.stroke:
                draw.ellipse(box, outline=s.stroke, width=round(ts(s.stroke_width)))
            else:
                draw.ellipse(box, fill=s.fill)
    return image.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    write_svg(OUT / "icon.svg")
    render(192, 1.0).save(OUT / "icon-192.png", optimize=True)
    render(512, 1.0).save(OUT / "icon-512.png", optimize=True)
    # Maskable: launchers crop to a circle of 80% of the width, so keep the art well inside it.
    render(512, 0.85).save(OUT / "icon-maskable-512.png", optimize=True)
    render(180, 1.0).save(OUT / "apple-touch-icon.png", optimize=True)


if __name__ == "__main__":
    main()
