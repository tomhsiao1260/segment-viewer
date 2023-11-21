import { ShaderMaterial, DoubleSide } from "three"

export class FragmentShader extends ShaderMaterial {
  constructor(params) {
    super({
      side: DoubleSide,
      transparent: true,

      uniforms: {
        tDiffuse: { value: null },
        uMask: { value: null },
        uCenter: { value: null },
        uTifsize: { value: null },
        uInklabels: { value: true },
        uColor: { value: true },
        uFlatten: { value: 0.0 },
        uArea: { value: 0.0 },
        opacity: { value: 1.0 }
      },

      vertexShader: /* glsl */ `
        #define PI 3.1415926535897932384626433832795

        uniform float uFlatten;
        // uniform bool uFlip;
        uniform float uArea;
        uniform vec3 uCenter;
        // uniform vec3 uNormal;
        uniform vec2 uTifsize;
        // uniform vec3 uBasevectorX;
        // uniform vec3 uBasevectorY;

        varying vec2 vUv;

        void main()
        {
            float flip = 1.0;
            float r = uTifsize.y / uTifsize.x;
            // float flip = uFlip ? -1.0 : 1.0;

            vec3 dir = (0.5 - uv.x) * vec3(1.0, 0.0, 0.0) + (0.5 - uv.y) * vec3(0.0, 1.0, 0.0) * r * flip;
            vec3 flatten = uCenter + dir * sqrt(uArea / r);
            // vec3 dir = (0.5 - uv.x) * uBasevectorX + (0.5 - uv.y) * uBasevectorY * r * flip;

            vec3 newPosition = position + (flatten - position) * uFlatten;

            vec4 modelPosition = modelMatrix * vec4(newPosition, 1.0);
            vec4 viewPosition = viewMatrix * modelPosition;
            vec4 projectedPosition = projectionMatrix * viewPosition;

            gl_Position = projectedPosition;

            vUv = uv;
        }
      `,

      fragmentShader: /* glsl */ `
        uniform float opacity;
        uniform bool uInklabels;
        uniform bool uColor;
        uniform sampler2D uMask;
        uniform sampler2D tDiffuse;
        varying vec2 vUv;

        void main() {
          float intensity = texture2D( tDiffuse, vUv ).r;
          vec4 mask = texture2D( uMask, vUv );
          float maskI = mask.r;
          if (intensity < 0.0001) { gl_FragColor = vec4(0.0); return; }

          vec3 color;
          if (uColor) color = intensity * 0.88 * vec3(0.93, 0.80, 0.70);
          if (!uColor) color = vec3(intensity);

          if (maskI < 0.1 || !uInklabels) { gl_FragColor = vec4(color, 1.0); return; }
          gl_FragColor = vec4(color, 1.0) * (1.0 - 0.8 * maskI * opacity);
        }
      `
    });

    this.setValues(params);
  }
}
