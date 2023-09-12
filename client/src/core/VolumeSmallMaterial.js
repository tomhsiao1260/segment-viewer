import { ShaderMaterial, BackSide } from 'three';

export class VolumeSmallMaterial extends ShaderMaterial {
  constructor(params) {
    super({
      transparent: true,
      side: BackSide,

      uniforms: {
        volumeAspect : { value: 810 / 789 },
        screenAspect : { value: 2 / 2 },
        voldata : { value: null },
        cmdata : { value: null },
      },

      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = vec2(uv.x, 1.0 - uv.y);
          // gl_Position = vec4(position, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
      `,

      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float volumeAspect;
        uniform float screenAspect;
        uniform sampler2D voldata;
        uniform sampler2D cmdata;

        vec4 apply_colormap(float val) {
          val = (val - 0.5) / (0.9 - 0.5);
          return texture2D(cmdata, vec2(val, 0.5));
        }

        void main() {
          float r = screenAspect / volumeAspect;
          float aspect = r;

          vec2 uv = vec2((vUv.x - 0.5), (vUv.y - 0.5) / aspect) + vec2(0.5);
          if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) return;

          float intensity = texture2D(voldata, uv).r;
          gl_FragColor = apply_colormap(intensity);

          #include <colorspace_fragment>
        }
      `,
    });

    this.setValues(params);
  }
}
