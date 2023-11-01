import * as THREE from 'three'
import Loader from '../Loader'
import { MOUSE, TOUCH } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

export default class ViewerSegment {
  constructor({ params, volumeMeta, segmentMeta, renderer, canvas }) {
    this.loading = false
    this.scene = null
    this.camera = null
    this.subVolumeMeta = null
    this.subSegmentMeta = null

    this.canvas = canvas
    this.renderer = renderer
    this.volumeMeta = volumeMeta
    this.segmentMeta = segmentMeta
    this.render = this.render.bind(this)

    this.params = {}
    this.params.mode = 'segment'
    this.params.layers = params.layers
    this.params.segments = params.segments

    this.init()
  }

  init() {
    // scene setup
    this.scene = new THREE.Scene()

    // camera setup
    const aspect = window.innerWidth / window.innerHeight
    this.camera = new THREE.OrthographicCamera(-1 * aspect, 1 * aspect, 1, -1, 0.01, 100)
    this.camera.up.set(0, -1, 0)
    this.camera.position.z = -1.3

    window.addEventListener(
      'resize',
      () => {
        const aspect = window.innerWidth / window.innerHeight
        this.camera.left = -1 * aspect
        this.camera.right = 1 * aspect
        this.camera.top = 1
        this.camera.bottom = -1
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        this.render()
      },
      false
    )

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.enableDamping = false
    this.controls.screenSpacePanning = true
    this.controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }
    this.controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }
    this.controls.addEventListener('change', this.render)
  }

  async updateSegment() {
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshBasicMaterial()
    this.segmentMesh = new THREE.Mesh(geometry, material)
    this.scene.add(this.segmentMesh)
  }

  render() {
    if (!this.renderer) return

    this.renderer.render(this.scene, this.camera)
  }

  clear() {
    if (this.segmentMesh) {
      this.segmentMesh.geometry.dispose()
      this.segmentMesh.material.dispose()
      this.segmentMesh.geometry = null
      this.segmentMesh.material = null
      this.scene.remove(this.segmentMesh)
    }

    this.segmentMesh = null
  }
}