import * as THREE from 'three'
import { MOUSE, TOUCH } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import textureViridis from './textures/cm_viridis.png'
import { GenerateSDFMaterial } from './GenerateSDFMaterial'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'

const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
}

const canvas = document.querySelector('canvas.webgl')
const scene = new THREE.Scene()
const renderer = new THREE.WebGLRenderer({ canvas })
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

let material

const loading = new OBJLoader().loadAsync('20230627122904-layer-10.obj')
loading.then((object) => {
  const sdfGeometry = object.children[0].geometry
  const [ sdfTex, bvh ] = sdfTexGenerate(sdfGeometry)

  const cmTexture = new THREE.TextureLoader().load(textureViridis)
  const tifTexture = new THREE.TextureLoader().load('00010.png', tick)

  tifTexture.minFilter = THREE.LinearFilter
  tifTexture.magFilter = THREE.LinearFilter

  const geometry = new THREE.PlaneGeometry(2, 2, 1, 1)
  material = new THREE.ShaderMaterial({
    uniforms: {
      uAlpha : { value: 1 },
      surface : { value: 0.001 },
      sdfTex : { value: sdfTex.texture },
      volumeAspect : { value: 810 / 789 },
      screenAspect : { value: 2 / 2 },
      // screenAspect : { value: sizes.width / sizes.height },
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
      uniform float surface;
      uniform float volumeAspect;
      uniform float screenAspect;
      uniform sampler2D sdfTex;
      uniform sampler2D utifTexture;
      uniform sampler2D cmdata;

      vec4 apply_colormap(float val) {
        val = (val - 0.5) / (0.9 - 0.5);
        return texture2D(cmdata, vec2(val, 0.5));
      }

      void main() {
        float r = screenAspect / volumeAspect;
        float aspect = r;

        vec2 vUv_;
        vUv_ = vUv;
        // vUv_.x = 0.2 * vUv.x + 0.4;
        // vUv_.y = 0.2 * vUv.y + 0.4;

        vec2 uv = vec2((vUv_.x - 0.5) * aspect, (vUv_.y - 0.5)) + vec2(0.5);
        if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) return;

        float dist = texture2D(sdfTex, uv).r - surface;
        // To Do: image y-axis & volume y-axis (inverse, but should be consistent)
        float intensity = texture2D(utifTexture, vec2(uv.x, 1.0 - uv.y)).r;

        gl_FragColor = apply_colormap(intensity);

        bool s = dist < 0.0 && dist > -surface;
        if (s) gl_FragColor = vec4(0, 0, 0, 0.0);

        #include <colorspace_fragment>
      }
    `,
  })
  scene.add(new THREE.Mesh(geometry, material))

  tick()
})

window.addEventListener('resize', () => {
  // Update sizes
  sizes.width = window.innerWidth
  sizes.height = window.innerHeight

  // Update camera
  camera.aspect = sizes.width / sizes.height
  camera.updateProjectionMatrix()

  // Update renderer
  renderer.setSize(sizes.width, sizes.height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  tick()
})

const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100)
camera.position.z = 1.3
scene.add(camera)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = false
controls.screenSpacePanning = true // pan orthogonal to world-space direction camera.up
controls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }
controls.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_ROTATE }

controls.addEventListener('change', tick)

function tick() {
  renderer.render(scene, camera)

  // const imgData = renderer.domElement.toDataURL('image/png')
  // const link = document.createElement('a')
  // link.href = imgData
  // link.download = 'example'
  // link.click()
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

