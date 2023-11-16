import * as THREE from 'three'
import Loader from '../Loader'
import { MOUSE, TOUCH } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
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
    this.segmentTileMeta = params.segmentTileMeta
    this.render = this.render.bind(this)

    this.params = {}
    this.params.mode = 'segment'
    this.params.flatten = 1.0
    this.params.ink = true
    this.params['1'] = false
    this.params['2'] = false
    this.params['3'] = true
    this.params['4'] = true
    this.params['5'] = true
    this.params['6'] = true
    this.params['7'] = true
    this.params['8'] = true
    this.params['9'] = true
    this.params['10'] = true

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

    this.controls = new OrbitControls(this.camera, this.controlDOM)
    this.controls.enableDamping = false
    this.controls.screenSpacePanning = true
    this.controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }
    this.controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }
    this.controls.addEventListener('change', this.render)
  }

  async updateSegment() {
    const sTarget = this.segmentTileMeta.segment[2]
    const sID = sTarget.id
    const sc = sTarget.clip
    const ink = sTarget.ink
    const texture = sTarget.texture

    const createList = []
    createList.push(sTarget)

    const loadingList = []
    const stexture = await new TIFFLoader().load('segment-tile/' + texture)
    const mtexture = await new TextureLoader().load('segment-tile/' + ink)
    this.normalMaterial = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide })
    this.inkMaterial = new FragmentShader()

    this.inkMaterial.uniforms.tDiffuse.value = stexture
    this.inkMaterial.uniforms.uMask.value = mtexture
    this.inkMaterial.uniforms.opacity.value = 1.0
    this.inkMaterial.uniforms.uFlatten.value = this.params.flatten

    createList.forEach((sTarget) => {
      const chunkList = sTarget.chunk

      chunkList.forEach((sIDChunk, i) => {

      const sID = sIDChunk
      // const sID = sTarget.id

      const loading = Loader.getSegmentTileData(`${sID}.obj`)
      loading.then((object) => {
        const geometry = object.children[0].geometry                       
        const mesh = new THREE.Mesh(geometry, this.inkMaterial)
        mesh.userData = sTarget
        mesh.name = sID

        const vc = sTarget.clip
        const s = 1 / ((vc.w + vc.h + vc.d) / 3)
        // const s = 1 / Math.max(vc.w, vc.h, vc.d)
        const center = new THREE.Vector3(- vc.x - vc.w/2, - vc.y - vc.h/2, - vc.z - vc.d/2)

        const index = i + 1
        // const index = parseInt(sID.split('_')[2])

        mesh.scale.set(s, s, s)
        mesh.userData = { index }
        mesh.position.copy(center.clone().multiplyScalar(s))

        this.scene.add(mesh)
      })
      loadingList.push(loading)

      })
    })
    await Promise.all(loadingList)
  }

  render() {
    if (!this.renderer || this.controlDOM.style.display  !== 'inline') return

    this.scene.children.forEach((mesh) => {
      const index = mesh.userData.index
      if (!index) return
      mesh.visible = this.params[index]
      this.inkMaterial.uniforms.uFlatten.value = this.params.flatten
      mesh.material = this.params.ink ? this.inkMaterial : this.normalMaterial
    })

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