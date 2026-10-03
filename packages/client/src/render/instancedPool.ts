import * as THREE from 'three';

/**
 * An InstancedMesh that grows on demand. `begin()` resets the count each frame, `push()` appends an instance;
 * everything drawn through one pool costs a single draw call.
 */
export class InstancedPool {
  mesh: THREE.InstancedMesh;
  private count = 0;

  constructor(
    private readonly scene: THREE.Object3D,
    private readonly geometry: THREE.BufferGeometry,
    private readonly material: THREE.Material,
    private readonly colored: boolean,
    private readonly castShadow: boolean,
    initialCapacity = 32,
  ) {
    this.mesh = this.create(initialCapacity);
  }

  begin(): void {
    this.count = 0;
  }

  push(matrix: THREE.Matrix4, color?: THREE.Color): void {
    if (this.count >= this.mesh.instanceMatrix.count) {
      this.grow();
    }
    this.mesh.setMatrixAt(this.count, matrix);
    if (this.colored && color) {
      this.mesh.setColorAt(this.count, color);
    }
    this.count++;
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
    this.mesh.visible = this.count > 0;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.dispose();
  }

  private create(capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.colored) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    mesh.castShadow = this.castShadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.scene.add(mesh);
    return mesh;
  }

  private grow(): void {
    const old = this.mesh;
    const next = this.create(old.instanceMatrix.count * 2);
    next.instanceMatrix.array.set(old.instanceMatrix.array);
    if (old.instanceColor && next.instanceColor) {
      next.instanceColor.array.set(old.instanceColor.array);
    }
    this.scene.remove(old);
    old.dispose();
    this.mesh = next;
  }
}
