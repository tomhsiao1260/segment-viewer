import os
import json
import shutil
from PIL import Image

# pip freeze > requirements.txt

if not os.path.exists('config.json'):
    print('config.json not found')
    exit()

# config & path
with open('config.json') as f:
    config = json.load(f)

TIF_INPUT   = config['TIF_INPUT']

TILE_OUTPUT = './output/volume'
TILE_INFO   = './output/volume/meta.json'

image = Image.open('00000.tif')

shutil.rmtree('client/public/volume', ignore_errors=True)
shutil.copytree(TILE_OUTPUT, 'client/public/volume', dirs_exist_ok=True)