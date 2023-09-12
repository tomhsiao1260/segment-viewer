import * as THREE from 'three'
import Loader from './Loader'
import ViewerCore from './core/ViewerCore'
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min'

init()

async function init() {
  const volumeMeta = await Loader.getVolumeMeta()
  const segmentMeta = await Loader.getSegmentMeta()

  const viewer = new ViewerCore({ volumeMeta, segmentMeta })

  loading()
  update(viewer)
  labeling(viewer)
}

function update(viewer) {
  updateViewer(viewer)
  updateGUI(viewer)
}

async function updateViewer(viewer) {
  const loadingDiv = document.querySelector('#loading')
  if (loadingDiv) loadingDiv.style.display = 'inline'

  await viewer.updateVolume()
  await viewer.clipSegment()
  viewer.render()

  if (loadingDiv) loadingDiv.style.display = 'none'
}

let gui

function updateGUI(viewer) {
  if (gui) { gui.destroy() }
  gui = new GUI()
}

// loading div element
function loading() {
  const loadingDiv = document.createElement('div')
  loadingDiv.id = 'loading'
  loadingDiv.innerHTML = 'Loading ...'
  document.body.appendChild(loadingDiv)
}

// segment labeling
function labeling(viewer) {
  const mouse = new THREE.Vector2()
  const labelDiv = document.createElement('div')
  labelDiv.id = 'label'
  document.body.appendChild(labelDiv)

  window.addEventListener('mousedown', (e) => {
    if (!(e.target instanceof HTMLCanvasElement)) return
    mouse.x = e.clientX / window.innerWidth * 2 - 1
    mouse.y = - (e.clientY / window.innerHeight) * 2 + 1

    labelDiv.style.display = 'none'

    const loadingDiv = document.querySelector('#loading')
    if (loadingDiv.style.display === 'inline') return

    // only this line is important
    const sTarget = viewer.getLabel(mouse)
    if (!sTarget) { return }

    const { id, clip } = sTarget
    labelDiv.style.display = 'inline'
    labelDiv.style.left = (e.clientX + 20) + 'px'
    labelDiv.style.top = (e.clientY + 20) + 'px'
    labelDiv.innerHTML = `${id}<br>layer: ${clip.z}~${clip.z+clip.d}`
    // as well as these lines
    viewer.updateFocusGeometry()
    viewer.render()
  })
}

