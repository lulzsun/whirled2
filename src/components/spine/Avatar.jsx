import React, { useRef, useState } from 'react';
import { useFrame } from "@react-three/fiber";
import { 
  AssetManager, ThreeJsTexture,
  AtlasAttachmentLoader, SkeletonJson, SkeletonMesh
} from 'spine-ts-threejs';

export default function Avatar (props) {
  const parentPath = 'https://whirled.lulzlabz.xyz/spineboy/';
  const skeletonFile = 'spineboy-ess.json';
  const atlasFile = 'spineboy.atlas';
  const animation = "walk";

  const assetManager = new AssetManager((image) => {return new ThreeJsTexture(image)}, parentPath);
	assetManager.loadText(skeletonFile);
	assetManager.loadTextureAtlas(atlasFile);

  const [loaded, setLoaded] = useState(assetManager.isLoadingComplete());
  const [spineMesh, setSpineMesh] = useState(null);
  const mesh = useRef();
  var lastFrameTime = Date.now() / 1000;

  useFrame(() => {
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

        //mesh.current.rotation.x = mesh.current.rotation.y += 1 / 100

        if(spineMesh) {
          spineMesh.update(delta);
        }
      }
    }
  });

  if(spineMesh) {
    return (
      <mesh {...props} ref={mesh} scale={1} >
        <primitive object={spineMesh} scale={0.01} />
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial attach="material" color="#ff0000" wireframe={false} />
      </mesh>
    )
  }
  return (<></>)
}