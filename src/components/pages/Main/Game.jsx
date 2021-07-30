import React from 'react';
import { Canvas } from '@react-three/fiber';
import { FullScreen, useFullScreenHandle } from 'react-full-screen';
import { OrbitControls, Plane, Stars } from '@react-three/drei'
import Avatar from 'src/components/spine/Avatar';

export default function Game () {
	const handle = useFullScreenHandle();

	// function handleOnClick(e) {
	// 	if(!handle.active) {
	// 		handle.enter();
	// 	}
	// 	else {
	// 		handle.exit();
	// 	}
	// }

	return (
		// i am a huge noob at flexbox and css in general, heres what i used to figure this out
		// https://stackoverflow.com/questions/90178/make-a-div-fill-the-height-of-the-remaining-screen-space
		<FullScreen className="h-full w-full bg-black" handle={handle}>
			<div className="h-full flex flex-col items-center">
				<div className="flex-initial">
					<b>top</b>
				</div>
				<div className="flex-auto w-full">
					<Canvas>
						<OrbitControls/>
						<Stars/>
						<ambientLight intensity={0.5} />
						<Plane args={[10, 10]} position={[0, -1, 0]} rotation={[-Math.PI/2, 0, 0]} />
						<Avatar position={[0, 0, 0]}/>
					</Canvas>
				</div>
				<div className="flex-initial">
					<b>bottom</b>
				</div>
			</div>
		</FullScreen>
	)
} 