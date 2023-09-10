import json
import numpy as np
from PIL import Image

# 0 ~ 5
obj_list = []
# obj_list.append('20230503225234')
# obj_list.append('20230505175240')
obj_list.append('20230505164332')
# obj_list.append('20230506133355')
# obj_list.append('20230507172452')
# obj_list.append('20230508164013')
# obj_list.append('20230511085916')
# obj_list.append('20230513092954')
# obj_list.append('20230513095916')
# obj_list.append('20230524092434')
# obj_list.append('20230510170242')
# obj_list.append('20230508220213')
# obj_list.append('20230507175928')
# obj_list.append('20230511201612')
# obj_list.append('20230624160816')
obj_list.append('20230627122904')
# obj_list.append('20230520132429')
# obj_list.append('20230626151618')
# obj_list.append('20230505093556')
# obj_list.append('20230504125349')
# obj_list.append('20230510153843')
# obj_list.append('20230626140105')
# obj_list.append('20230624144604')

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
    vertices = data['vertices']
    normals  = data['normals']
    uvs      = data['uvs']
    faces    = data['faces']

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

layer = 10
shape = { 'w': 810, 'h': 789, 'd': 1 }
clip = { 'x': 0, 'y': 0, 'z': layer - 5, 'w': 8096, 'h': 7888, 'd': 5 + 5 }

bounding_box = {}
bounding_box['min'] = np.array([clip['x'], clip['y'], clip['z']])
bounding_box['max'] = np.array([clip['x'] + clip['w'], clip['y'] + clip['h'], clip['z'] + clip['d']])

# cropping each segmentation (only remain the regoin in bounding box)
for name in obj_list:
    filename = 'segment/' + name + '.obj'
    data = parse_obj(filename)

    # faces recalculation (tricky)
    inbox_verties = np.all((bounding_box['min'] <= data['vertices']) & (data['vertices'] <= bounding_box['max']), axis=1)
    inbox_faces = np.any(inbox_vertices[data['faces'][:, :, 0].astype(int) - 1], axis=1)

    flatten = data['faces'][inbox_faces].astype(int)[:, :, 0].reshape(-1)
    inbox_vertices[np.array(flatten, dtype=int) - 1] = True

    p_data = {}
    p_data['vertices'] = data['vertices'][inbox_vertices]
    p_data['normals'] = data['normals'][inbox_vertices]
    p_data['uvs'] = data['uvs'][inbox_vertices]

    face_mapping = np.where(inbox_vertices, np.cumsum(inbox_vertices).astype(str), '')
    p_data['faces'] = data['faces'][inbox_faces]
    p_data['faces'] = face_mapping[p_data['faces'].astype(int) - 1]

    # resizing into -0.5 ~ 0.5 region
    s = 1 / max(shape['w'], shape['h'], shape['d'])
    p_data['vertices'][:, 0] = shape['w'] * s * ((p_data['vertices'][:, 0] - clip['x']) / clip['w'] - 0.5)
    p_data['vertices'][:, 1] = shape['h'] * s * ((p_data['vertices'][:, 1] - clip['y']) / clip['h'] - 0.5)
    p_data['vertices'][:, 2] = shape['d'] * s * ((p_data['vertices'][:, 2] - clip['z']) / clip['d'] - 0.5)

    p_data['vertices'][:, 0] = np.round(p_data['vertices'][:, 0], 8)
    p_data['vertices'][:, 1] = np.round(p_data['vertices'][:, 1], 8)
    p_data['vertices'][:, 2] = np.round(p_data['vertices'][:, 2], 8)

    save_obj(name + '-layer-' + str(layer) + '.obj', p_data)

image = Image.open('00010.tif')
image.save('00010.png')

w, h = image.size
left = w * 0.45
top = h * 0.45
right = w * 0.55
bottom = h * 0.55
cropped_image = image.crop((left, top, right, bottom))
cropped_image.save('tile.png')
