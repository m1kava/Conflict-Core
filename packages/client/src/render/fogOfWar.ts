import * as THREE from 'three';

/**
 * Fog-of-war shading shared by every world material: a low-resolution texture (R channel: 0 unexplored,
 * 0.5 explored, 1 visible) sampled by world XZ position and linearly filtered for soft edges. Injected into
 * standard materials with onBeforeCompile, so lighting and shadows stay untouched.
 */
export class FogOfWarTexture {
  readonly texture: THREE.DataTexture;
  private readonly data: Uint8Array;
  readonly uniforms: { fogMap: { value: THREE.DataTexture }; fogWorldSize: { value: THREE.Vector2 }; fogEnabled: { value: number } };

  constructor(
    private readonly width: number,
    private readonly height: number,
    worldWidth: number,
    worldHeight: number,
  ) {
    this.data = new Uint8Array(width * height * 4);
    this.texture = new THREE.DataTexture(this.data, width, height, THREE.RGBAFormat);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
    this.uniforms = {
      fogMap: { value: this.texture },
      fogWorldSize: { value: new THREE.Vector2(worldWidth, worldHeight) },
      fogEnabled: { value: 1 },
    };
  }

  /** Copies the client fog grid (0/1/2) into the texture. */
  update(fog: Uint8Array): void {
    for (let i = 0; i < this.width * this.height; i++) {
      const value = fog[i] === 2 ? 255 : fog[i] === 1 ? 128 : 0;
      this.data[i * 4] = value;
      this.data[i * 4 + 3] = 255;
    }
    this.texture.needsUpdate = true;
  }

  setEnabled(enabled: boolean): void {
    this.uniforms.fogEnabled.value = enabled ? 1 : 0;
  }

  /** Patches a material so it darkens according to fog of war. */
  apply<T extends THREE.Material>(material: T): T {
    const uniforms = this.uniforms;
    const previous = material.onBeforeCompile.bind(material);
    material.onBeforeCompile = (shader, renderer) => {
      previous(shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFowWorld;')
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vec4 fowWorld = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            fowWorld = instanceMatrix * fowWorld;
          #endif
          vFowWorld = (modelMatrix * fowWorld).xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vFowWorld;
          uniform sampler2D fogMap;
          uniform vec2 fogWorldSize;
          uniform float fogEnabled;`,
        )
        .replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
          vec2 fowUv = vec2(vFowWorld.x / fogWorldSize.x, -vFowWorld.z / fogWorldSize.y);
          float fow = texture2D(fogMap, fowUv).r;
          float fowLight = mix(0.07, 1.0, smoothstep(0.0, 0.5, fow)) * mix(0.55, 1.0, smoothstep(0.5, 1.0, fow));
          gl_FragColor.rgb *= mix(1.0, fowLight, fogEnabled);`,
        );
    };
    material.customProgramCacheKey = () => 'fow';
    return material;
  }
}
