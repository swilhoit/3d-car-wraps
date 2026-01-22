'use client';

import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function CameraController({ position, target, distance }: {
  position: [number, number, number],
  target: [number, number, number],
  distance?: number
}) {
  useFrame((state) => {
    // Calculate direction from target to camera position
    const targetVec = new THREE.Vector3(...target);
    const direction = new THREE.Vector3(...position).sub(targetVec);

    // Get the original distance from the preset
    const originalDistance = direction.length();

    // If distance is provided, scale from original; otherwise use preset position
    const finalDistance = distance !== undefined ? distance : originalDistance;

    // Normalize and scale by final distance
    const scaledPosition = direction.normalize().multiplyScalar(finalDistance).add(targetVec);

    // Smoothly interpolate camera position
    state.camera.position.lerp(scaledPosition, 0.1);
    state.camera.lookAt(...target);
  });

  return null;
}

export default CameraController;
