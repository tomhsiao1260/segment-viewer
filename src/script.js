import * as THREE from 'three'
import textureViridis from './textures/cm_viridis.png'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
}

const cmTexture = new THREE.TextureLoader().load(textureViridis)
const tifTexture = new THREE.TextureLoader().load('00000.png', tick)
const scene = new THREE.Scene()

tifTexture.minFilter = THREE.LinearFilter
tifTexture.magFilter = THREE.LinearFilter

const geometry = new THREE.PlaneGeometry(2, 2, 1, 1)
const material = new THREE.ShaderMaterial({
  uniforms: {
    uAlpha: { value: 1 },
    volumeAspect : { value: 810 / 789 },
    screenAspect : { value: sizes.width / sizes.height },
    utifTexture : { value: tifTexture },
    cmdata : { value: cmTexture },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      gl_Position = vec4(position, 1.0);
      vUv = uv;
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

      vec2 vUv_;
      vUv_ = vUv;
      // vUv_.x = 0.2 * vUv.x + 0.4;
      // vUv_.y = 0.2 * vUv.y + 0.4;

      vec2 uv = vec2((vUv_.x - 0.5) * aspect, (vUv_.y - 0.5)) + vec2(0.5);
      if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) return;

      float intensity = texture2D(utifTexture, uv).r;
      gl_FragColor = apply_colormap(intensity);
      #include <colorspace_fragment>
    }
  `,
})
scene.add(new THREE.Mesh(geometry, material))

const canvas = document.querySelector('canvas.webgl')

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
})

const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100)
camera.position.z = 3
scene.add(camera)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true

const renderer = new THREE.WebGLRenderer({ canvas })
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

function tick() {
  renderer.render(scene, camera)

  // const imgData = renderer.domElement.toDataURL('image/png')
  // const link = document.createElement('a')
  // link.href = imgData
  // link.download = 'example'
  // link.click()
}

