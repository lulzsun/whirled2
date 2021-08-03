import Svg from './Svg';
import { useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import Avatar from 'src/components/three/Avatar';
import React, { useRef, useEffect, useCallback } from 'react';
import walkableSvg from '../../media/walkable.svg';
import { OrbitControls, Plane, Stars, Stats } from '@react-three/drei'

export default function GameCanvas (props) {
  // not entirely sure why importing context and using it doesnt work, but passing it from parent as prop works...
  const socket = props.socket;
	const floorPlane = useRef();
  const localAvatar = useRef();
  const remoteAvatars = useRef([]);
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
    if(walkTarget === null || localAvatar === null || event.button !== 0) return;

    var coords = getMouse3dCoords(event);
		raycaster.setFromCamera(coords, camera);
    var intersects = raycaster.intersectObject(floorPlane.current);
    if(intersects.length === 1 && intersects[0].point) {
      const moveDir = localAvatar.current.moveTo(intersects[0].point, {x: event.clientX, y: event.clientY});
      socket.emit('PLAYER_MOVE', intersects[0].point, moveDir);
    }
  }

  const getMouse3dCoords = (event) => {
    var rect = gl.domElement.getBoundingClientRect();
    var x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
    var y = - ( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;

    return {x, y};
  }

  const handlePlayerMove = useCallback((player, position, direction) => {
    // this is not performant, find a way to key remote avatar dom refs
    remoteAvatars.current.every(avatar => {
      if(avatar.user && avatar.user.username === player.username) {
        const vectorPos = new Vector3(position.x, position.y, position.z);
        avatar.moveTo(vectorPos, undefined, direction);
        return false;
      }
      return true;
    });
	}, []);

  useEffect(() => {
    if(props.users) {
      remoteAvatars.current = remoteAvatars.current.slice(0, props.users.length-1);
    }
    socket.on("PLAYER_MOVE", handlePlayerMove);
    return () => {
			socket.off("PLAYER_MOVE", handlePlayerMove);
    };
  }, [socket, props.users, handlePlayerMove]);

	return (
    <group>
      <ambientLight/> <OrbitControls/> <Stats className={'threeStats'}/>
      <Stars/>
      <Plane ref={floorPlane} args={[10, 10]} position={[0, 0, 0]} rotation={[-Math.PI/2, 0, 0]} 
        onPointerMove={handleMouseMove} onPointerUp={handleMouseUp} />
      <Plane args={[10, 10]} position={[0, 0, 0]} rotation={[Math.PI/2, 0, 0]}/>

      {/* https://stackoverflow.com/a/56063129/8805016 */}
      {(props.users && props.users.map((user, i) => {
        const vectorPos = new Vector3(user.avatar.position.x, user.avatar.position.y, user.avatar.position.z);
        if(user.username === props.currentUser.username)
          return <Avatar key={props.currentUser.username} ref={localAvatar} position={[0, 0, 0]} user={user}/>
        return <Avatar key={user.username} ref={e => remoteAvatars.current[i] = e} position={vectorPos} user={user}/>
      }))}

      <Svg sceneRef={walkTarget} url={walkableSvg}/>
    </group>
	)
}