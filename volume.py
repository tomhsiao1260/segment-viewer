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

SPLIT = 10
INTERVAL = 50
LAYER_LIST = [ 0, INTERVAL, 2 * INTERVAL ]

# generate volume small image & each layer volume folder
for LAYER in LAYER_LIST:
    image = Image.open(os.path.join(TIF_SMALL_INPUT, f'{LAYER:05d}.tif'))
    image.save(os.path.join(TILE_OUTPUT, f'{LAYER:05d}.png'))
    os.makedirs(os.path.join(TILE_OUTPUT, f'{LAYER:05d}'))

# main meta.json
meta = {}
meta['volume'] = []

for i, LAYER in enumerate(LAYER_LIST):
    print(f'processing {LAYER:05d} ... {i+1}/{len(LAYER_LIST)}')

    info = {}
    info['id'] = f'{LAYER:05d}'
    info['clip'] = { 'x': 0, 'y': 0, 'z': LAYER, 'w': 8096, 'h': 7888, 'd': 1 }

    meta['volume'].append(info)

    image = Image.open(os.path.join(TIF_INPUT, f'{LAYER:05d}.tif'))
    w = image.size[0] // SPLIT
    h = image.size[1] // SPLIT

    layerMeta = {}
    layerMeta['split'] = SPLIT
    layerMeta['layer'] = f'{LAYER:05d}'
    layerMeta['volume'] = []

    for j in range(SPLIT):
        for k in range(SPLIT):
            filename = f'cell_yxz_{k:03d}_{j:03d}_{LAYER:05d}.png'

            left = w * j
            top = h * k
            right = w * (j+1)
            bottom = h * (k+1)

            if (j == SPLIT - 1): right = image.size[0]
            if (k == SPLIT - 1): bottom = image.size[1]

            cropped_image = image.crop((left, top, right, bottom))
            cropped_image.save(os.path.join(TILE_OUTPUT, f'{LAYER:05d}', filename))

            layerInfo = {}
            layerInfo['idx'] = j
            layerInfo['idy'] = k
            layerInfo['name'] = filename
            layerInfo['clip'] = { 'x': left, 'y': top, 'z': LAYER, 'w': (right - left), 'h': (bottom - top), 'd': 1 }

            layerMeta['volume'].append(layerInfo)

    with open(os.path.join(TILE_OUTPUT, f'{LAYER:05d}', 'meta.json'), "w") as outfile:
        json.dump(layerMeta, outfile, indent=4)

with open(TILE_INFO, "w") as outfile:
    json.dump(meta, outfile, indent=4)

with open(f'{TILE_OUTPUT}/.gitkeep', 'w'): pass

shutil.rmtree('client/public/volume', ignore_errors=True)
shutil.copytree(TILE_OUTPUT, 'client/public/volume', dirs_exist_ok=True)

