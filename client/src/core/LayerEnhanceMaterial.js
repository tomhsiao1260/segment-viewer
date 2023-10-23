import { ShaderMaterial, BackSide } from 'three';

export class LayerEnhanceMaterial extends ShaderMaterial {
  constructor(params) {
    super({
      transparent: true,
      side: BackSide,

      uniforms: {
        surface : { value: 10.0 },
        volumeAspect : { value: 810 / 789 },
        screenAspect : { value: 2 / 2 },
        colorBool : { value: true },
        voldata : { value: null },
        cmdata : { value: null },
        sdfTex : { value: null },
        sdfTexFocus : { value: null },
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
        uniform float surface;
        uniform float volumeAspect;
        uniform float screenAspect;
        uniform bool colorBool;
        uniform sampler2D sdfTex;
        uniform sampler2D sdfTexFocus;
        uniform sampler2D voldata;
        uniform sampler2D cmdata;

        vec4 apply_colormap(float val) {
          val = (val - 0.5) / (0.9 - 0.5);
          return texture2D(cmdata, vec2(val, 0.5));
        }

        void main() {
          float aspect = screenAspect / volumeAspect;
          vec2 uv = vec2((vUv.x - 0.5), (vUv.y - 0.5) / aspect) + vec2(0.5);
          if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) return;

          float dist = texture2D(sdfTex, vec2(uv.x, 1.0 - uv.y)).r - surface;
          float intensity = texture2D(voldata, uv).r;

          vec4 color = colorBool ? apply_colormap(intensity) : vec4(vec3(intensity), 1.0);
          gl_FragColor = color;

          bool s = dist < 0.0 && dist > -surface;
          if (s) gl_FragColor = vec4(0, 0, 0, 1.0);

          float f_dist = texture(sdfTexFocus, vec2(uv.x, 1.0 - uv.y)).r - surface;
          if (f_dist > -surface + 1e-6 && f_dist < 0.0 && dist < 0.0) gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);

          if (!colorBool) return;
          #include <colorspace_fragment>
        }
      `,
    });

    this.setValues(params);
  }
}
