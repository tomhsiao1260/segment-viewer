<h1 align="center">Segment Viewer</h1>

<h3 align="center">
A web-based segment viewer for <a href="https://scrollprize.org/" target="_blank">Vesuvius Challenge</a>
<h3/>

<p align="center">
    <img src="https://github.com/tomhsiao1260/volume-viewer/assets/31985811/95c8ce73-065c-4267-a8e9-f2f2274c071d" width="800px"/>
</p>

## Introduction

This is a web-based segment viewer which you can visualize the scroll data from Vesuvius Challenge on the top of [Three.js library](https://threejs.org/).

## Install

Clone this repository
```bash
git clone https://github.com/tomhsiao1260/segment-viewer.git
cd segment-viewer
```

Setup a virtual environment and activate it
```bash
python -m venv env
source env/bin/activate
```

Install the reqired python packages
```bash
pip install -r requirements.txt
```

Download [Node.js](https://nodejs.org/en/download/) and install the required npm packages
```bash
cd client && npm install
```

## Getting Started

We need to give this repo the data you want to see. Open `config.json` file in root directory and write down the corresponding config. `TIF_INPUT` and `TIF_SMALL_INPUT` is the `.tif` files directory. `OBJ_INPUT` is the segmentation `.obj` paths directory.

```python
OBJ_INPUT : "../full-scrolls/Scroll1.volpkg/paths",
TIF_INPUT : "../full-scrolls/Scroll1.volpkg/volumes/20230205180739",
TIF_SMALL_INPUT : "../full-scrolls/Scroll1.volpkg/volumes_small/20230205180739"
```

And `MAX_LAYER` means number of layers in `TIF_INPUT` folder. `WIDTH` and `HEIGHT` are the pixel sizes of each `.tif` image.

```python
MAX_LAYER: 14375
WIDTH: 8096
HEIGHT: 7888
```

There's a file called `volume.py` for converting the `.tif` data into multiple chunks which can be used for rendering via this application. Another file called `segment.py` which can handle segment `.obj` files we need. Let's run these python scripts. It may take a while. Once finished, you will find some `.obj` and `.tif` files generated in `./output/segment` and `./output/volume` folder, respectively.

```python
python segment.py
python volume.py
```

<br />

Now, eveything is set. Let's serve this web application and navigate to http://localhost:5173/. It may take a few seconds to load assets, but hopefully you can see the results. Have fun!

```bash
cd client && npm run dev
```
