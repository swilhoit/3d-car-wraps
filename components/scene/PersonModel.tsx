'use client';

import { useRef, useEffect } from 'react';
import { useFBX } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function PersonModel() {
  const fbx = useFBX('/3D-guy.fbx');
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  useEffect(() => {
    if (fbx) {
      const box = new THREE.Box3().setFromObject(fbx);
      const center = box.getCenter(new THREE.Vector3());

      if (fbx.animations && fbx.animations.length > 0) {
        mixerRef.current = new THREE.AnimationMixer(fbx);
        const action = mixerRef.current.clipAction(fbx.animations[0]);
        action.play();
      }

      fbx.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          child.material = new THREE.MeshPhongMaterial({
            color: new THREE.Color(0xB0B0B0),
            specular: new THREE.Color(0x333333),
            shininess: 20,
            side: THREE.DoubleSide,
            flatShading: false
          });
        }
      });

      const minY = box.min.y;
      fbx.position.y = -minY;
    }

    return () => {
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
      }
    };
  }, [fbx]);

  useFrame((state, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }
  });

  const scale = 0.0125;

  return (
    <group position={[-3, -1.15, 0]} scale={[scale, scale, scale]}>
      <primitive object={fbx} />
    </group>
  );
}

export default PersonModel;
