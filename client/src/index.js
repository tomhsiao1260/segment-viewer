import * as THREE from 'three'
import { MOUSE, TOUCH } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import textureViridis from './textures/cm_viridis.png'
import { GenerateSDFMaterial } from './GenerateSDFMaterial'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { MapControls } from 'three/addons/controls/MapControls.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min'

const sizes = {
  width: window.innerWidth,
  height: window.innerHeight
}

const obj_list = [ '20230505164332', '20230627122904' ]
const canvas = document.querySelector('canvas.webgl')
const scene = new THREE.Scene()
const renderer = new THREE.WebGLRenderer({ canvas })
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

let card, cardS, clipGeometry, focusGeometry, bvhh

const loading1 = new OBJLoader().loadAsync('20230505164332-layer-10.obj')
const loading2 = new OBJLoader().loadAsync('20230627122904-layer-10.obj')

const cmTexture = new THREE.TextureLoader().load(textureViridis)
const tifTexture = new THREE.TextureLoader().load('volume/00000.png', tick)
cmTexture.minFilter = THREE.NearestFilter
cmTexture.magFilter = THREE.NearestFilter
tifTexture.magFilter = THREE.NearestFilter
tifTexture.minFilter = THREE.LinearFilter

Promise.all([ loading1, loading2 ]).then((res) => {
  const sdfGeometry0 = res[0].children[0].geometry
  const sdfGeometry1 = res[1].children[0].geometry

  const c_positions = []
  const c_normals = []
  const c_uvs = []
  const chunkList = []

  res.forEach((group, i) => {
    const positions = group.children[0].geometry.getAttribute('position').array
    const normals = group.children[0].geometry.getAttribute('normal').array
    const uvs = group.children[0].geometry.getAttribute('uv').array

    c_positions.push(...positions)
    c_uvs.push(...uvs)
    c_normals.push(...normals)

    chunkList.push({ id: obj_list[i], maxIndex: c_positions.length / 3 })
  })

  clipGeometry = new THREE.BufferGeometry()
  clipGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(c_positions), 3))
  // clipGeometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(c_uvs), 2))
  // clipGeometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(c_normals), 3))
  clipGeometry.userData.chunkList = chunkList
  // clipGeometry.userData.id = id

  const [ sdfTex, bvh ] = sdfTexGenerate(clipGeometry)
  bvhh = bvh

  const geometry = new THREE.PlaneGeometry(2, 2, 1, 1)
  const material = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.BackSide,

    uniforms: {
      uAlpha : { value: 1 },
      volumeAspect : { value: 810 / 789 },
      screenAspect : { value: 2 / 2 },
      utifTexture : { value: tifTexture },
      cmdata : { value: cmTexture },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = vec2(uv.x, 1.0 - uv.y);
        // gl_Position = vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float volumeAspect;
      uniform float screenAspect;
      uniform sampler2D utifTexture;
      uniform sampler2D cmdata;

      vec4 apply_colormap(float val) {
        val = (val - 0.5) / (0.9 - 0.5);
        return texture2D(cmdata, vec2(val, 0.5));
      }

      void main() {
        float r = screenAspect / volumeAspect;
        float aspect = r;

        vec2 uv = vec2((vUv.x - 0.5), (vUv.y - 0.5) / aspect) + vec2(0.5);
        if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) return;

        float intensity = texture2D(utifTexture, uv).r;
        gl_FragColor = apply_colormap(intensity);

        #include <colorspace_fragment>
      }
    `,
  })

  card = new THREE.Mesh(geometry, material)
  card.userData = { w: 2, h: 2, vw: 810, vh: 789, center: new THREE.Vector3() }
  scene.add(card)

  const geometryS = new THREE.PlaneGeometry(2, 2, 1, 1)
  const materialS = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.BackSide,

    uniforms: {
      surface : { value: 0.001 },
      sdfTex : { value: sdfTex.texture },
      sdfTexFocus : { value: null },
      volumeAspect : { value: 810 / 789 },
      screenAspect : { value: 2 / 2 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = vec2(uv.x, 1.0 - uv.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float surface;
      uniform float volumeAspect;
      uniform float screenAspect;
      uniform sampler2D sdfTex;
      uniform sampler2D sdfTexFocus;

      void main() {
        float r = screenAspect / volumeAspect;
        float aspect = r;

        vec2 uv = vec2((vUv.x - 0.5), (vUv.y - 0.5) / aspect) + vec2(0.5);
        if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) return;

        gl_FragColor = vec4(0.0);

        float dist = texture2D(sdfTex, vec2(uv.x, 1.0 - uv.y)).r - surface;
        bool s = dist < 0.0 && dist > -surface;
        if (s) gl_FragColor = vec4(0, 0, 0, 1.0);

        float f_dist = texture(sdfTexFocus, vec2(uv.x, 1.0 - uv.y)).r - surface;
        if (f_dist > -surface + 1e-6 && f_dist < 0.0 && dist < 0.0) gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
      }
    `,
  })

  cardS = new THREE.Mesh(geometryS, materialS)
  cardS.position.set(0, 0, -0.7)
  scene.add(cardS)

  tick()
})

const geometryP = new THREE.PlaneGeometry(2 * (809/8096), 2 * (788/8096), 1, 1)
const meta = fetch('volume/meta.json').then((res) => res.json())

const gui = new GUI()
gui.add({ enhance: generateTile }, 'enhance')

function generateTile() {
  const mouse = new THREE.Vector2()
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(mouse, camera)
  const intersects = raycaster.intersectObjects([ card ])

  if (!intersects.length) return

  const p = intersects[0].point
  const c = intersects[0].object.userData

  // 0~9
  const idx = Math.floor(10 * (p.x - c.center.x + 1) / 2)
  const idy = Math.floor(10 * (p.y - c.center.y + 1) / 2)
  const tifPTexture = new THREE.TextureLoader().loadAsync(`volume/00000/cell_yxz_00${idy}_00${idx}_00000.png`)

  Promise.all([ meta, tifPTexture ]).then((res) => {
    const [ meta, texture ] = res
    const { id, clip, subclip } = meta.volume[0]

    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.LinearFilter

    const x = c.center.x - c.w / 2 * 1.0 + (idx + 0.5) * geometryP.parameters.width
    const y = c.center.y - c.h / 2 * (c.vh / c.vw) + (idy + 0.5) * geometryP.parameters.height

    const materialP  = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,

      uniforms: {
        utifPTexture : { value: null },
        cmdata : { value: cmTexture },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = vec2(uv.x, 1.0 - uv.y);
          // gl_Position = vec4(position, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D utifPTexture;
        uniform sampler2D cmdata;

        vec4 apply_colormap(float val) {
          val = (val - 0.5) / (0.9 - 0.5);
          return texture2D(cmdata, vec2(val, 0.5));
        }

        void main() {
          float intensity = texture2D(utifPTexture, vUv).r;
          vec4 color = apply_colormap(intensity);
          // color.a = 0.5;

          gl_FragColor = color;
          #include <colorspace_fragment>
        }
      `
    })
    const cardP = new THREE.Mesh(geometryP, materialP)
    cardP.position.set(x, y, -0.5)
    scene.add(cardP)

    cardP.material.uniforms.utifPTexture.value = texture
    tick()
  })
}

function updateFocusGeometry(clickID) {
  const q = { start: 0, end: 0, sID: null, vID: null }
  const { chunkList } = clipGeometry.userData
  for (let i = 0; i < chunkList.length; i += 1) {
    const { id: sID } = chunkList[i]
    if (sID === clickID) {
      q.sID = sID
      // q.vID = this.params.layers.select
      q.end = chunkList[i].maxIndex
      q.start = (i === 0) ? 0 : chunkList[i - 1].maxIndex
      break
    }
  }

  if (!q.end && !focusGeometry) return
  if (!q.end) { focusGeometry.dispose(); focusGeometry = null; return }
  // return if current focus geometry already exist
  const f = focusGeometry
  // if (f && f.userData.sID === q.sID && f.userData.vID === q.vID) return
  if (f && f.userData.sID === q.sID) return

  const f_positions = clipGeometry.getAttribute('position').array.slice(q.start * 3, q.end * 3)
  // const f_normals = clipGeometry.getAttribute('normal').array.slice(q.start * 3, q.end * 3)
  // const f_uvs = clipGeometry.getAttribute('uv').array.slice(q.start * 2, q.end * 2)

  const focusGeometry_ = new THREE.BufferGeometry()
  focusGeometry_.setAttribute('position', new THREE.BufferAttribute(new Float32Array(f_positions), 3))
  // focusGeometry_.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(f_uvs), 2))
  // focusGeometry_.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(f_normals), 3))
  focusGeometry_.userData = q

  return focusGeometry_
}

window.addEventListener('resize', () => {
  // Update sizes
  sizes.width = window.innerWidth
  sizes.height = window.innerHeight

  // Update camera
  // camera.aspect = sizes.width / sizes.height
  camera.left = -1 * sizes.width / sizes.height
  camera.right = 1 * sizes.width / sizes.height
  camera.top = 1
  camera.bottom = -1

  camera.updateProjectionMatrix()

  // Update renderer
  renderer.setSize(sizes.width, sizes.height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  tick()
})

// const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.01, 100)
const camera = new THREE.OrthographicCamera(-1 * sizes.width / sizes.height, 1 * sizes.width / sizes.height, 1, -1, 0.01, 100)
camera.up.set(0, -1, 0)
camera.position.z = -1.3
scene.add(camera)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = false
controls.screenSpacePanning = true // pan orthogonal to world-space direction camera.up
controls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }
controls.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }

controls.addEventListener('change', tick)

function tick() {
  renderer.render(scene, camera)
}

function sdfTexGenerate(geometry) {
  const nrrd = { w: 810, h: 789, d: 1 }
  const s = 1 / Math.max(nrrd.w, nrrd.h, nrrd.d)

  const matrix = new THREE.Matrix4()
  const center = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const scaling = new THREE.Vector3()

  scaling.set(nrrd.w * s, nrrd.h * s, nrrd.d * s)
  matrix.compose(center, quat, scaling)

  const bvh = new MeshBVH(geometry, { maxLeafTris: 1 })
  const generateSdfPass = new FullScreenQuad(new GenerateSDFMaterial())
  generateSdfPass.material.uniforms.bvh.value.updateFrom(bvh)
  generateSdfPass.material.uniforms.matrix.value.copy(matrix)
  generateSdfPass.material.uniforms.zValue.value = 0.5

  const sdfTex = new THREE.WebGLRenderTarget(nrrd.w, nrrd.h)
  sdfTex.texture.format = THREE.RedFormat
  sdfTex.texture.type = THREE.FloatType
  sdfTex.texture.minFilter = THREE.LinearFilter
  sdfTex.texture.magFilter = THREE.LinearFilter
  renderer.setRenderTarget(sdfTex)
  generateSdfPass.render(renderer)
  renderer.setRenderTarget(null)

  return [ sdfTex, bvh ]
}

function getLabel(mouse) {
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(mouse, camera)
  const intersects = raycaster.intersectObjects([ card ])

  if (!intersects.length) return

  const p = intersects[0].point
  const c = intersects[0].object.userData

  const point = new THREE.Vector3()
  point.x = (p.x - c.center.x) / (c.w / 2) / 2
  point.y = (p.y - c.center.y) / (c.h / 2) / 2
  point.z = 0

  const target = bvhh.closestPointToPoint(point, {}, 0, 0.02)
  if (!target) return

  const { chunkList } = bvhh.geometry.userData
  const hitIndex = bvhh.geometry.index.array[target.faceIndex * 3]

  for (let i = 0; i < chunkList.length; i ++) {
    const { id: sID, maxIndex } = chunkList[i]
    if (maxIndex > hitIndex) {
      return { id: sID }
    }
  }
}

// segment labeling
function labeling() {
  const mouse = new THREE.Vector2()
  const labelDiv = document.createElement('div')
  labelDiv.id = 'label'
  document.body.appendChild(labelDiv)

  window.addEventListener('mousedown', (e) => {
    if (!(e.target instanceof HTMLCanvasElement)) return
    mouse.x = e.clientX / window.innerWidth * 2 - 1
    mouse.y = - (e.clientY / window.innerHeight) * 2 + 1

    // const { mode } = viewer.params
    labelDiv.style.display = 'none'

    // const loadingDiv = document.querySelector('#loading')
    // if (loadingDiv.style.display === 'inline') return

    if (true) {
      // only this line is important
      const sTarget = getLabel(mouse)
      if (!sTarget) { return }

      const { id, clip } = sTarget
      labelDiv.style.display = 'inline'
      labelDiv.style.left = (e.clientX + 20) + 'px'
      labelDiv.style.top = (e.clientY + 20) + 'px'
      labelDiv.innerHTML = `${id}`
      // as well as this line
      updateViewer(id)
    }
  })
}

labeling()

function updateViewer(clickID) {
  const focusGeometry = updateFocusGeometry(clickID)
  if (!focusGeometry) return
  const [ sdfTexFocus, _ ] = sdfTexGenerate(focusGeometry)
  cardS.material.uniforms.sdfTexFocus.value = sdfTexFocus.texture

  tick()
}
