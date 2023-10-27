import * as THREE from 'three'
import Loader from './Loader'
import ViewerCore from './core/ViewerCore'
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min'

init()

async function init() {
  const volumeMeta = await Loader.getVolumeMeta()
  const segmentMeta = await Loader.getSegmentMeta()

  const viewer = new ViewerCore({ volumeMeta, segmentMeta })
  viewer.controls.addEventListener('change', () => { viewer.render() })

  loading()
  update(viewer)
  labeling(viewer)

  const { id, clip } = viewer.getLabel()
  const labelDiv = document.querySelector('#label')
  labelDiv.style.display = 'inline'
  labelDiv.style.left = '50%'
  labelDiv.style.top = '50%'
  labelDiv.innerHTML = `${id}<br>layer: ${clip.z}~${clip.z+clip.d}`
}

function update(viewer) {
  updateViewer(viewer, 'layer')
  updateGUI(viewer)
}

async function updateViewer(viewer, trigger) {
  const loadingDiv = document.querySelector('#loading')
  if (loadingDiv) loadingDiv.style.display = 'inline'

  viewer.clear()

  await viewer.updateVolume(trigger)
  await viewer.clipSegment()

  viewer.render()

  if (loadingDiv) loadingDiv.style.display = 'none'
}

let gui

function updateGUI(viewer) {
  if (gui) { gui.destroy() }
  gui = new GUI()
  gui.title('2023/10/24')
  gui.add(viewer.params.layers, 'select', viewer.params.layers.options).name('layers').listen().onChange(() => updateViewer(viewer, 'layer'))
  gui.add(viewer.params.segments, 'select', viewer.params.segments.options).name('segments').listen().onChange(async() => {
    const sID = viewer.params.segments.getID[ viewer.params.segments.select ]
    const { id, clip } = viewer.getClipInfo(sID)

    // move to the segment
    const pixelX = clip.x + clip.w / 2
    const pixelY = clip.y + clip.h / 2
    const { x, y } = viewer.pixelTocameraPosition(pixelX, pixelY)
    viewer.controls.target = new THREE.Vector3(x, y, 0)
    viewer.camera.position.x = x
    viewer.camera.position.y = y
    viewer.camera.zoom = 2.5

    await updateViewer(viewer, 'segment')

    const labelDiv = document.querySelector('#label')
    labelDiv.style.display = 'inline'
    labelDiv.style.left = '50%'
    labelDiv.style.top = '50%'
    labelDiv.innerHTML = `${id}<br>layer: ${clip.z}~${clip.z+clip.d}`
  })
  gui.add(viewer.params, 'surface', 0, 10).name('thickness').onChange(viewer.render)
  gui.add(viewer.params, 'colorBool').name('color').onChange(viewer.render)
  // gui.add({ enhance: () => enhance(viewer) }, 'enhance')
}

// enhance volume & segment
async function enhance(viewer) {
  const loadingDiv = document.querySelector('#loading')
  if (loadingDiv) loadingDiv.style.display = 'inline'

  await viewer.enhance()
  viewer.render()

  if (loadingDiv) loadingDiv.style.display = 'none'
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

    const labelDiv = document.querySelector('#label')
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
    viewer.params.segments.select = viewer.params.segments.options[id]
    viewer.updateFocusGeometry()
    viewer.render()
  })
}