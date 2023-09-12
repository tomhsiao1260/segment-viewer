import * as THREE from 'three'
import Loader from './Loader'
import ViewerCore from './core/ViewerCore'
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min'

init()

async function init() {
  const volumeMeta = await Loader.getVolumeMeta()
  const segmentMeta = await Loader.getSegmentMeta()

  const viewer = new ViewerCore({ volumeMeta, segmentMeta })

  // loading()
  // update(viewer)
  // labeling(viewer)
}
