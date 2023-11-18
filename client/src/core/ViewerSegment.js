import * as THREE from 'three'
import Loader from '../Loader'
import { MOUSE, TOUCH } from 'three'
import { ArcballControls } from 'three/addons/controls/ArcballControls.js'
import { TextureLoader } from 'three'
import { FragmentShader } from './FragmentShader'
import { TIFFLoader } from 'three/addons/loaders/TIFFLoader.js'

export default class ViewerSegment {
  constructor({ params, renderer, canvas }) {
    this.loading = false
    this.scene = null
    this.camera = null
    this.controlDOM = null
    this.subVolumeMeta = null
    this.subSegmentMeta = null

    this.canvas = canvas
    this.renderer = renderer
    this.render = this.render.bind(this)
    this.meshList = []

    this.params = {}
    this.params.mode = 'segment'
    this.params.segmentLayers = params.segmentLayers
    this.params.flatten = 1.0
    this.params.inklabels = true

    for (let i = 0; i < 15; i++) { this.params[i + 1] = true }

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

    this.controlDOM = document.createElement('div')
    this.controlDOM.classList.add(this.params.mode)
    this.controlDOM.style.position = 'absolute'
    this.controlDOM.style.width = '100%'
    this.controlDOM.style.height = '100%'
    this.controlDOM.style.margin = '0'
    this.controlDOM.style.padding = '0'
    document.body.appendChild(this.controlDOM)

    this.controls = new ArcballControls(this.camera, this.controlDOM, this.scene)
    this.controls.enableDamping = false
    this.controls.screenSpacePanning = true
    this.controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }
    this.controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }
    this.controls.addEventListener('change', this.render)

    const url = new URLSearchParams(window.location.search)
    if (url.get('segment')) this.params.segmentLayers.select = this.params.segmentLayers.options[ url.get('segment') ]
    if(!this.params.segmentLayers.select) this.params.segmentLayers.select = 0
  }

  async updateSegment() {
    const select = this.params.segmentLayers.select
    const sTarget = this.params.segmentLayers.segmentLayerMeta.segment[select]
    const { id, clip, area, inklabels, texture, chunk } = sTarget
    chunk.forEach((v, i) => { this.params[i + 1] = true })

    const loadingList = []
    const surfaceTexture = await new TextureLoader().loadAsync(`segment-layer/${id}/${texture}`)
    const maskTexture = await new TextureLoader().loadAsync(`segment-layer/${id}/${inklabels}`)

    const s = 1 / ((clip.w + clip.h + clip.d) / 3)
    const center = new THREE.Vector3(clip.x + clip.w/2, clip.y + clip.h/2, clip.z + clip.d/2)

    this.normalMaterial = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide })
    this.inkMaterial = new FragmentShader()
    this.inkMaterial.uniforms.tDiffuse.value = surfaceTexture
    this.inkMaterial.uniforms.uMask.value = maskTexture
    this.inkMaterial.uniforms.uArea.value = area
    this.inkMaterial.uniforms.opacity.value = 1.0
    this.inkMaterial.uniforms.uCenter.value = center
    this.inkMaterial.uniforms.uFlatten.value = this.params.flatten

    chunk.forEach((sID_Layer, i) => {
      const loading = Loader.getSegmentLayerData(`${id}/${sID_Layer}.obj`)
      loading.then((object) => {
        const index = i + 1
        const geometry = object.children[0].geometry                       
        const mesh = new THREE.Mesh(geometry, this.inkMaterial)
        mesh.name = id

        mesh.scale.set(s, s, s)
        mesh.userData = { index }
        // mesh.userData = sTarget
        mesh.position.copy(center.clone().multiplyScalar(-s))

        this.meshList.push(mesh)
        this.scene.add(mesh)
      })
      loadingList.push(loading)
    })
    await Promise.all(loadingList)

    // update url parameters
    const url = new URL(window.location.href)
    const searchParams = url.searchParams
    searchParams.set('mode', 'segment')
    searchParams.set('segment', id)
    url.search = searchParams.toString()
    window.history.replaceState(undefined, undefined, url.href)
  }

  getLabel(mouse) {
    const select = this.params.segmentLayers.select
    const sTarget = this.params.segmentLayers.segmentLayerMeta.segment[select]
    const { id, clip } = sTarget

    if (!mouse) { return { id, clip } }

    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, this.camera)
    const intersects = raycaster.intersectObjects(this.meshList)
    if (!intersects.length) return

    return { id, clip }
  }

  render() {
    if (!this.renderer || this.controlDOM.style.display  !== 'inline') return

    this.scene.children.forEach((mesh) => {
      const index = mesh.userData.index
      if (!index) return
      mesh.visible = this.params[index]
      this.inkMaterial.uniforms.uFlatten.value = this.params.flatten
      mesh.material = this.params.inklabels ? this.inkMaterial : this.normalMaterial
    })

    this.renderer.render(this.scene, this.camera)
  }

  clear() {
    this.meshList.forEach((mesh) => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      mesh.geometry = null
      mesh.material = null
      this.scene.remove(mesh)
    })

    this.meshList = []
  }
}