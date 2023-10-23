import os
import math
import json
import shutil
import numpy as np

if not os.path.exists('config.json'):
    print('config.json not found')
    exit()

# config & path
with open('config.json') as f:
    config = json.load(f)

OBJ_INPUT = config['OBJ_INPUT']

OBJ_OUTPUT = './output/segment'
OBJ_INFO   = './output/segment/meta.json'

def parse_obj(filename):
    vertices = []
    normals = []
    uvs = []
    faces = []

    with open(filename, 'r') as f:
        for line in f:
            if line.startswith('v '):
                vertices.append([float(x) for x in line[2:].split()])
            elif line.startswith('vn '):
                normals.append([float(x) for x in line[3:].split()])
            elif line.startswith('vt '):
                uvs.append([float(x) for x in line[3:].split()])
            elif line.startswith('f '):
                indices = [x.split('/') for x in line.split()[1:]]
                faces.append(indices)

    data = {}
    data['vertices']    = np.array(vertices)
    data['normals']     = np.array(normals)
    data['uvs']         = np.array(uvs)
    data['faces']       = np.array(faces)

    return data

def save_obj(filename, data):
    vertices = data.get('vertices', np.array([]))
    normals  = data.get('normals' , np.array([]))
    uvs      = data.get('uvs'     , np.array([]))
    faces    = data.get('faces'   , np.array([]))

    with open(filename, 'w') as f:

        for i in range(len(vertices)):
            vertex = vertices[i]
            f.write(f"v {' '.join(str(x) for x in vertex)}\n")

        for i in range(len(normals)):
            normal = normals[i]
            f.write(f"vn {' '.join(str(x) for x in normal)}\n")

        for uv in uvs:
            f.write(f"vt {' '.join(str(x) for x in uv)}\n")

        for face in faces:
            indices = ' '.join(['/'.join(map(str, vertex)) for vertex in face])
            f.write(f"f {indices}\n")

def cal_bounding_box(data):
    vertices = data.get('vertices', np.array([]))
    normals  = data.get('normals' , np.array([]))
    uvs      = data.get('uvs'     , np.array([]))
    faces    = data.get('faces'   , np.array([]))

    # calculate bounding box
    mean_vertices = np.mean(vertices, axis=0)
    min_x = np.min(vertices[:, 0])
    min_y = np.min(vertices[:, 1])
    min_z = np.min(vertices[:, 2])
    max_x = np.max(vertices[:, 0])
    max_y = np.max(vertices[:, 1])
    max_z = np.max(vertices[:, 2])

    bounding_box = {}
    bounding_box['min'] = np.array([min_x, min_y, min_z])
    bounding_box['max'] = np.array([max_x, max_y, max_z])

    # translate & rescale
    p_vertices = vertices
    p_normals = normals
    p_uvs = uvs
    p_faces = faces

    p_data = {}
    p_data['vertices']    = p_vertices
    p_data['normals']     = p_normals
    p_data['uvs']         = p_uvs
    p_data['faces']       = p_faces
    p_data['boundingBox'] = bounding_box

    return p_data

def clip_obj(data, layer):
    vertices = data.get('vertices', np.array([]))

    # select
    p_vertices = vertices[(vertices[:, 2] >= (layer-1e-7)) & (vertices[:, 2] <= (layer+1e-7))]

    # vertices number must be a multiple of 3 (three.js bvh issue)
    n = p_vertices.shape[0]
    p_vertices = p_vertices[:(n - (n % 3)), :]

    p_data = {}
    p_data['vertices'] = p_vertices

    return p_data

GAP = 5
INTERVAL = 50
MAX_LAYER = 14370
LAYER_LIST = []

# for i in range(10): LAYER_LIST.append(i * INTERVAL)
for i in range(int(MAX_LAYER / INTERVAL) + 1): LAYER_LIST.append(i * INTERVAL)

# clear .obj output folder & generate layer id list
shutil.rmtree(OBJ_OUTPUT, ignore_errors=True)
os.makedirs(OBJ_OUTPUT)

for LAYER in LAYER_LIST:
    os.makedirs(os.path.join(OBJ_OUTPUT, f'{LAYER:05d}'))

# receive segmentation id list
SEGMENT_LIST = []

if (OBJ_INPUT != ''):
    subfolders = [f.path for f in os.scandir(OBJ_INPUT) if f.is_dir()]

    for subfolder in sorted(subfolders):
        folder_name = os.path.basename(subfolder)
        obj_path = os.path.join(subfolder, folder_name + '.obj')
        obj_points_path = os.path.join(subfolder, folder_name + '_points.obj')

        if os.path.isfile(obj_path) & os.path.isfile(obj_points_path):
            SEGMENT_LIST.append(folder_name)
        # else:
        #     raise RuntimeError(f'No .obj file found in {subfolder}. Please check your .volpkg folder.')

# main meta.json
meta = {}
meta['layer'] = []
meta['segment'] = []

for LAYER in LAYER_LIST: meta['layer'].append(f'{LAYER:05d}')

# each layer meta.json
meta_list = []

for LAYER in LAYER_LIST:
    info = {}
    info['layer'] = f'{LAYER:05d}'
    info['segment'] = []
    meta_list.append(info)


# SEGMENT_LIST = SEGMENT_LIST[:10]

for i, SEGMENT_ID in enumerate(SEGMENT_LIST):
    print(f'processing {SEGMENT_ID} ... {i+1}/{len(SEGMENT_LIST)}')

    filename = os.path.join(os.path.join(OBJ_INPUT, SEGMENT_ID, f'{SEGMENT_ID}_points.obj'))

    data = parse_obj(filename)
    p_data = cal_bounding_box(data)

    c = p_data['boundingBox']['min']
    b = p_data['boundingBox']['max']

    c[c < 0] = 0
    b[b < 0] = 0

    z_start = p_data['vertices'][0, 2]
    z_end   = p_data['vertices'][-1, 2]

    info = {}
    info['id'] = SEGMENT_ID
    info['clip'] = {}
    info['clip']['x'] = int(c[0])
    info['clip']['y'] = int(c[1])
    info['clip']['z'] = int(z_start)
    info['clip']['w'] = int(b[0] - c[0])
    info['clip']['h'] = int(b[1] - c[1])
    info['clip']['d'] = int(z_end - z_start)
    meta['segment'].append(info)

    filename = os.path.join(os.path.join(OBJ_INPUT, SEGMENT_ID, f'{SEGMENT_ID}_points.obj'))
    data = parse_obj(filename)

    for j, LAYER in enumerate(LAYER_LIST):
        if (int(z_start) - GAP >= LAYER or int(z_end) + GAP <= LAYER): continue

        selected_layer = LAYER
        if (int(z_start) > LAYER): selected_layer = int(z_start)
        if (int(z_end) < LAYER): selected_layer = int(z_end)

        p_data = clip_obj(data, selected_layer)
        if (p_data['vertices'].shape[0] < 10): continue

        save_obj(os.path.join(OBJ_OUTPUT, f'{LAYER:05d}', f'{SEGMENT_ID}_{LAYER:05d}_points.obj'), p_data)

        info = {}
        info['id'] = SEGMENT_ID
        info['name'] = f'{SEGMENT_ID}_{LAYER:05d}_points.obj'

        meta_list[j]['segment'].append(info)

# save main meta.json
with open(OBJ_INFO, "w") as outfile:
    json.dump(meta, outfile, indent=4)

# save each layer meta.json
print('processing meta.json ...')
for i, LAYER in enumerate(LAYER_LIST):
    with open(os.path.join(OBJ_OUTPUT, f'{LAYER:05d}', 'meta.json'), "w") as outfile:
        json.dump(meta_list[i], outfile, indent=4)

with open(f'{OBJ_OUTPUT}/.gitkeep', 'w'): pass

shutil.rmtree('client/public/segment', ignore_errors=True)
shutil.copytree(OBJ_OUTPUT, 'client/public/segment', dirs_exist_ok=True)

