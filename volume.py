import os
import json
import shutil
from PIL import Image

if not os.path.exists('config.json'):
    print('config.json not found')
    exit()

# config & path
with open('config.json') as f:
    config = json.load(f)

TIF_INPUT       = config['TIF_INPUT']
TIF_SMALL_INPUT = config['TIF_SMALL_INPUT']

TILE_OUTPUT     = './output/volume'
TILE_INFO       = './output/volume/meta.json'

# clear .volume output folder
shutil.rmtree(TILE_OUTPUT, ignore_errors=True)
os.makedirs(TILE_OUTPUT)

image = Image.open(os.path.join(TIF_SMALL_INPUT, '00000.tif'))
image.save(os.path.join(TILE_OUTPUT, '00000.png'))

os.makedirs(os.path.join(TILE_OUTPUT, '00000'))
image = Image.open(os.path.join(TIF_INPUT, '00000.tif'))

split = 10
width, height = image.size

w = width // split
h = height // split

info = {}
info['id'] = '00000'
info['clip'] = { 'x': 0, 'y': 0, 'z': 0, 'w': 8096, 'h': 7888, 'd': 1 }
info['subclip'] = { 'w': w, 'h': h }

VOLUME_LIST = []
VOLUME_LIST.append(info)

for i in range(split):
    for j in range(split):
        filename = f'cell_yxz_{j:03d}_{i:03d}_00000'
        cropped_image = image.crop((w * i, h * j, w * (i+1), h * (j+1)))
        cropped_image.save(os.path.join(TILE_OUTPUT, '00000', filename + '.png'))

# save relevant info and copy to client
meta = {}
meta['volume'] = VOLUME_LIST

with open(TILE_INFO, "w") as outfile:
    json.dump(meta, outfile, indent=4)

with open(f'{TILE_OUTPUT}/.gitkeep', 'w'): pass

shutil.rmtree('client/public/volume', ignore_errors=True)
shutil.copytree(TILE_OUTPUT, 'client/public/volume', dirs_exist_ok=True)

