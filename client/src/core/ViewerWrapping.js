import * as THREE from 'three'
import { MOUSE, TOUCH } from 'three'
import { TIFFLoader } from 'three/addons/loaders/TIFFLoader.js'
import { DragControls } from 'three/addons/controls/DragControls.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { WrappingMaterial } from './WrappingMaterial'
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
    this.params.segment = params.wrapping.wrappingMeta.segment

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

  async setup() {
    // update url parameters
    const url = new URL(window.location.href)
    const searchParams = url.searchParams
    searchParams.set('mode', 'wrapping')
    url.search = searchParams.toString()
    window.history.replaceState(undefined, undefined, url.href)

    // use previous loading assets instead
    if (this.meshList.length) return

    let ds = 0
    let wp = 0
    const h = 1
    const st = 0.02

    // Plane
    const geometry = new THREE.PlaneGeometry(1, 1, 100, 100)
    const positions = geometry.getAttribute('position').array

    for (let i = 0; i < positions.length / 3; i++) {
        const xo = positions[3 * i + 0]
        const yo = positions[3 * i + 1]
        const zo = positions[3 * i + 2]

        positions[3 * i + 0] = xo
        positions[3 * i + 1] = zo
        positions[3 * i + 2] = yo
    }

    for (let i = 0; i < 27; i++) {
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

    for (let i = 0; i < 4; i++) {
      const { id: segID, positions, colors, scale, offset, chunks } = this.params.segment[i]
      const posTexture = await new THREE.TextureLoader().loadAsync(`wrapping/${segID}/${positions}`)
      const possTexture = await new THREE.TextureLoader().loadAsync(`wrapping/${segID}/s/${positions}`)
      const colorTexture = await new TIFFLoader().loadAsync(`wrapping/${segID}/${colors}`)

      for (let j = 0; j < chunks.length; j++) {
        const { id, uv, width, height, l, r } = chunks[j]
        const uvTexture = await new THREE.TextureLoader().loadAsync(`wrapping/${segID}/${uv}`)
        const uvsTexture = await new THREE.TextureLoader().loadAsync(`wrapping/${segID}/s/${uv}`)

        let pos = this.getPosition(id + 0.5)
        const material = this.setMaterial(posTexture, possTexture, uvTexture, uvsTexture, colorTexture)
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.set(pos, st, 0)
        mesh.userData.segID = segID
        mesh.userData.id = id
        this.meshList.push(mesh)

        const gridW = Math.abs(this.gridList[id + 1] - this.gridList[id])
        mesh.scale.z = scale

        // fit width into the grid
        if (j === 0) {
          pos = this.gridList[id + 1] + width / height * (0.5 - l / width) * 1.0
          mesh.scale.x = width / height
        } else if (j === chunks.length - 1) {
          pos = this.gridList[id] - width / height * (0.5 - r / width) * 1.0
          mesh.scale.x = width / height
        } else {
          const ea = (r + l) / width
          const d = ea / (1 - ea)
          pos += d * gridW * (r - l) / (r + l) / 2
          mesh.scale.x = (1 + d * 1.00) * gridW
        }
        mesh.position.set(pos, st, 0)
        mesh.position.z = offset
        mesh.userData.startPos = mesh.position.clone()
        mesh.userData.originPosX = mesh.position.x
      }
    }

    this.meshList.forEach((mesh) => this.scene.add(mesh))
    this.target.mesh = this.meshList[0]
    this.drag(st)
  }

  updateWrapping() {
    const pos = this.getPosition(this.params.wrapping)
    this.mark.position.x = pos
    this.camera.position.x = pos + this.cameraShift
    this.controls.target.x = this.camera.position.x

    this.meshList.forEach((mesh) => {
        mesh.material.uniforms.uWrapping.value = this.params.wrapping
        mesh.material.uniforms.uWrapPosition.value = pos

        // temporarily fix of a weird shader position out of camera rendering bug
        const t = (mesh.userData.originPosX - 0.1) < pos
        mesh.position.x = t ? mesh.userData.originPosX : pos + 1.0
    })

    this.render()
  }

  drag(st) {
    const drag = new DragControls(this.meshList, this.camera, this.controlDOM)

    drag.addEventListener('dragstart', (e) => {
      this.meshList.forEach((mesh) => {
        if (this.target.mesh.userData.segID === mesh.userData.segID) mesh.position.y = st
        if (e.object.userData.segID === mesh.userData.segID) mesh.position.y = -st
      })

      this.controls.enabled = false
      this.target.mesh = e.object
      this.render()
    })
    drag.addEventListener('dragend', (e) => {
        this.controls.enabled = true
        this.meshList.forEach((mesh) => {
            if(mesh.userData.segID !== this.target.mesh.userData.segID) return
            mesh.userData.startPos.x = mesh.position.x
            mesh.userData.startPos.y = mesh.position.y
            mesh.userData.startPos.z = mesh.position.z
        })
        this.target.mesh.userData.originPosX = this.target.mesh.position.x
    })
    drag.addEventListener('drag', (e) => {
      this.target.mesh.position.y = -2 * st
      this.render()
    })
  }

  setMaterial(posTexture, possTexture, uvTexture, uvsTexture, colorTexture) {
    const material = new WrappingMaterial()
    posTexture.minFilter = THREE.NearestFilter
    posTexture.magFilter = THREE.NearestFilter
    material.uniforms.tPosition.value = posTexture

    possTexture.minFilter = THREE.NearestFilter
    possTexture.magFilter = THREE.NearestFilter
    material.uniforms.tPositions.value = possTexture

    uvTexture.minFilter = THREE.NearestFilter
    uvTexture.magFilter = THREE.NearestFilter
    material.uniforms.tUV.value = uvTexture

    uvsTexture.minFilter = THREE.NearestFilter
    uvsTexture.magFilter = THREE.NearestFilter
    material.uniforms.tUVs.value = uvsTexture

    colorTexture.minFilter = THREE.NearestFilter
    colorTexture.magFilter = THREE.NearestFilter
    material.uniforms.tColor.value = colorTexture

    return material
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

  clear() {
  }
}
