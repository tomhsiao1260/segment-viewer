import * as THREE from 'three'
import { MOUSE, TOUCH } from 'three'
import { DragControls } from 'three/addons/controls/DragControls.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Grid } from './GridMaterial'

export default class ViewerWrapping {
  constructor({ params, renderer, canvas }) {
    this.meshList = []
    this.gridList = []
    this.target = { mesh: null }
    this.mark = null
    this.cameraShift = -0.5

    this.params = {}
    this.params.mode = 'wrapping'
    this.params.wrapping = 0

    this.canvas = canvas
    this.renderer = renderer
    this.render = this.render.bind(this)
    this.updateWrapping = this.updateWrapping.bind(this)

    this.init()
  }

  init() {
    // scene setup
    this.scene = new THREE.Scene()

    // camera setup
    const v = 0.65
    const aspect = window.innerWidth / window.innerHeight
    this.camera = new THREE.OrthographicCamera(-v * aspect, v * aspect, v, -v, 0.01, 100)
    this.camera.position.set(this.cameraShift, -3, 0)
    this.camera.up.set(0, 0, 1)
    this.camera.lookAt(this.cameraShift, 0, 0)

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
    this.controls.target.x = this.camera.position.x
    this.controls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN }
    this.controls.touches = { ONE: TOUCH.PAN, TWO: TOUCH.PAN }
    this.controls.addEventListener('change', this.render)
    this.controls.update()
  }

  setup() {
    let ds = 0
    let wp = 0
    const h = 1
    const st = 0.02

    for (let i = 0; i < 27; i++) {
    // for (let i = 0; i < 53; i++) {
        // this parts need to recaculate in the future
        const w = (160 + (308 - 160) * (i / 52)) / 1576
        ds -= (w + wp) / 2 / h
        wp = w
        this.gridList.push(ds + w / h / 2)

        const gridGeometry = new THREE.PlaneGeometry(1, 1, 1, 1)
        const gridMaterial = new Grid()
        const grid = new THREE.Mesh(gridGeometry, gridMaterial)
        grid.rotation.set(Math.PI / 2, 0, 0)
        grid.position.set(ds, 0, 0)
        grid.scale.set(w / h, 1.0, 1.0)
        this.scene.add(grid)
    }
    this.gridList.push(ds - wp / h / 2)

    const c = 0.006
    this.mark = new THREE.Mesh(new THREE.SphereGeometry(c, 10, 10), new THREE.MeshBasicMaterial({ color: 0x00ff00 }))
    this.mark.position.set(0, 0, 0.5)
    this.scene.add(this.mark)
  }

  updateWrapping() {
    const pos = this.getPosition(this.params.wrapping)
    this.mark.position.x = pos
    this.camera.position.x = pos + this.cameraShift
    this.controls.target.x = this.camera.position.x

    // meshList.forEach((mesh) => {
    //     mesh.material.uniforms.uWrapping.value = params.wrapping
    //     mesh.material.uniforms.uWrapPosition.value = pos

    //     // temporarily fix of a weird shader position out of camera rendering bug
    //     const t = (mesh.userData.originPosX - 0.1) < pos
    //     mesh.position.x = t ? mesh.userData.originPosX : pos + 1.0
    // })

    this.render()
  }

  getPosition(wrapping) {
    if (!this.gridList.length) return 0

    const f = wrapping
    const s = Math.floor(f)
    const w = f - s  
    const pos = (1 - w) * this.gridList[s] + w * this.gridList[s + 1]

    return pos
  }

  setURLParamState() {}

  render() {
    if (!this.renderer || this.controlDOM.style.display  !== 'inline') return

    this.renderer.render(this.scene, this.camera)
  }

  clear() {}
}
