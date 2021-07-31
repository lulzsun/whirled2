import React, { useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls, Plane, Stars, Stats } from '@react-three/drei'
import Avatar from 'src/components/three/Avatar';
import Svg from './Svg';
import walkableSvg from '../../media/walkable.svg';

export default function GameCanvas (props) {
	const floorPlane = useRef();
  const avatar = useRef();
  const walkTarget = useRef();
  const { gl, camera, raycaster } = useThree();

  const handleMouseMove = (event) => {
		if(walkTarget === null) return;

    var coords = getMouse3dCoords(event);
		raycaster.setFromCamera(coords, camera);
    var intersects = raycaster.intersectObject(floorPlane.current);
    if(intersects.length === 1 && intersects[0].point) {
      walkTarget.current.position.x = intersects[0].point.x-0.1;
      walkTarget.current.position.y = intersects[0].point.y;
      walkTarget.current.position.z = intersects[0].point.z-0.1;
    }
  };

  const handleMouseUp = (event) => {
    if(walkTarget === null || avatar === null || event.button !== 0) return;

    var coords = getMouse3dCoords(event);
		raycaster.setFromCamera(coords, camera);
    var intersects = raycaster.intersectObject(floorPlane.current);
    if(intersects.length === 1 && intersects[0].point) {
      avatar.current.moveTo(intersects[0].point, {x: event.clientX, y: event.clientY});
    }
  }

  const getMouse3dCoords = (event) => {
    var rect = gl.domElement.getBoundingClientRect();
    var x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
    var y = - ( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;

    return {x, y};
  }

	return (
    <group>
      <ambientLight/> <OrbitControls/> <Stats className={'threeStats'}/>
      <Stars/>
      <Plane ref={floorPlane} args={[10, 10]} position={[0, 0, 0]} rotation={[-Math.PI/2, 0, 0]} 
        onPointerMove={handleMouseMove} onPointerUp={handleMouseUp} />
      <Avatar ref={avatar} position={[0, 0, 0]}/>
      <Svg sceneRef={walkTarget} url={walkableSvg}/>
    </group>
	)
}