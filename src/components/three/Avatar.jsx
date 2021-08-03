import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei"
import { 
  AssetManager, ThreeJsTexture,
  AtlasAttachmentLoader, SkeletonJson, SkeletonMesh
} from 'spine-ts-threejs';

const Avatar = React.memo(forwardRef((props, ref) => {
  const parentPath = 'https://whirled.lulzlabz.xyz/spineboy/';
  const skeletonFile = 'spineboy-ess.json';
  const atlasFile = 'spineboy.atlas';
  var animation = "idle";

  const assetManager = new AssetManager((image) => {return new ThreeJsTexture(image)}, parentPath);
	assetManager.loadText(skeletonFile);
	assetManager.loadTextureAtlas(atlasFile);

  const [loaded, setLoaded] = useState(assetManager.isLoadingComplete());
  const [spineMesh, setSpineMesh] = useState(null);
  const meshRef = useRef();
  const nameTag = useRef();
  var lastFrameTime = Date.now() / 1000;

  useFrame((state) => {
    if (assetManager.isLoadingComplete() && !loaded) {
      // Load the texture atlas using name.atlas and name.png from the AssetManager.
      // The function passed to TextureAtlas is used to resolve relative paths.
      const atlas = assetManager.assets[parentPath+atlasFile];

      // Create a AtlasAttachmentLoader that resolves region, mesh, boundingbox and path attachments
      const atlasLoader = new AtlasAttachmentLoader(atlas);

      // Create a SkeletonJson instance for parsing the .json file.
      var skeletonJson = new SkeletonJson(atlasLoader);

      // Set the scale to apply during parsing, parse the file, and create a new skeleton.
      skeletonJson.scale = 0.4;
      const skeletonData = skeletonJson.readSkeletonData(assetManager.assets[parentPath+skeletonFile]);

      // Create a SkeletonMesh from the data and attach it to the scene
      const skeletonMesh = new SkeletonMesh(skeletonData, function(parameters) {
        parameters.depthTest = true;
      });
      skeletonMesh.state.setAnimation(0, animation, true);
      setSpineMesh(skeletonMesh);
      setLoaded(true);
    }
    else {
      if(loaded) {
        var now = Date.now() / 1000;
        var delta = now - lastFrameTime;
        lastFrameTime = now;

        // https://stackoverflow.com/a/45676434/8805016
        meshRef.current.quaternion.copy(state.camera.quaternion);

        if(movePosition !== null) {
          // this is basically unity Vector3.MoveTowards
          const movePositionClone = movePosition.clone();
          const maxDistanceDelta = moveSpeed * delta;
          const magnitude = meshRef.current.position.distanceTo(movePositionClone);
          if(magnitude <= maxDistanceDelta || magnitude === 0) {
            meshRef.current.position.copy(movePosition);
            movePosition = null;
            if(animation === 'walk') {
              animation = 'idle';
              spineMesh.state.setAnimation(0, animation, true);
            }
          }
          else {
            meshRef.current.position.addScaledVector(movePositionClone.sub(meshRef.current.position).normalize(), maxDistanceDelta);
            if(animation !== 'walk') {
              animation = 'walk';
              spineMesh.state.setAnimation(0, animation, true);
            }
          }
        }

        if(spineMesh) {
          spineMesh.update(delta);
        }
      }
    }
  });

  var movePosition = null;
  var moveSpeed = 5;

  useImperativeHandle(ref, () => ({
    ...meshRef.current,

    moveTo(position, mouseCoords={x:0, y:0}, flip=null) {
      const b = nameTag.current.getBoundingClientRect();
      const nameTagCoords = {x: (b.left + b.width / 2), y: b.top + b.height / 2};
      const flipDir = mouseCoords.x > nameTagCoords.x ? 1 : -1;
      if(flip !== null) spineMesh.skeleton.scaleX = flip;
      else spineMesh.skeleton.scaleX = flipDir;
      
      movePosition = position;
      return spineMesh.skeleton.scaleX;
    },
  }));

  if(spineMesh) {
    return (
      <mesh {...props} ref={meshRef} scale={1}>
        <Html position={[0,3,0]}>
          <span ref={nameTag} className="absolute whitespace-nowrap font-extrabold transform -translate-x-1/2" 
          style={
            {
              // 'fontFamily': 'verdana',
              // 'fontSize': '1em',
              'WebkitTextStroke': '0.04rem black',
              'WebkitTextFillColor': 'white'
            }}>
          {props.user.displayName}</span>
        </Html>
        <primitive object={spineMesh} scale={0.01} />
        {/* <boxGeometry args={[1, 1, 1]} /> */}
        <meshBasicMaterial attach="material" color="#ff0000" wireframe={true} />
      </mesh>
    )
  }
  return (<></>)
}));

export default Avatar;