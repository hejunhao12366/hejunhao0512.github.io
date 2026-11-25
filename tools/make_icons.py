"""Render PNG app icons from icon-fullbleed.svg (run by GitHub Actions).

Outputs (repo root):
  apple-touch-icon.png  180x180  (iOS home screen; must be PNG, full-bleed)
  icon-192.png          192x192  (manifest)
  icon-512.png          512x512  (manifest)
"""
import cairosvg

for size, name in [(180, "apple-touch-icon.png"), (192, "icon-192.png"), (512, "icon-512.png")]:
    cairosvg.svg2png(url="icon-fullbleed.svg", write_to=name, output_width=size, output_height=size)
    print("wrote", name)
