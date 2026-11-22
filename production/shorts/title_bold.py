"""Series title card in Comfortaa at weight 700 (the variable font renders Light by default on Windows):
   python -I title_bold.py <title_overlay.py> <Comfortaa.ttf> "<title>" <cover.png|W,H> <out.png>"""
import sys, os, runpy
from PIL import ImageFont
kit, font, *args = sys.argv[1:]
real = ImageFont.truetype
def bold(*a, **k):
    f = real(*a, **k)
    f.set_variation_by_axes([700])
    return f
ImageFont.truetype = bold
os.environ['FLOW_TITLE_FONT'] = font
sys.argv = [kit, *args]
runpy.run_path(kit, run_name='__main__')
