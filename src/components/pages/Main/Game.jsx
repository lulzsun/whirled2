import React from 'react';
import { Canvas } from '@react-three/fiber';
import GameCanvas from '../../three/GameCanvas';
import { FullScreen, useFullScreenHandle } from 'react-full-screen';

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
				<div className="flex-auto overflow-hidden w-full">
				{/* <Canvas orthographic camera={{ zoom: 50, position: [0, 0, 100] }}> */}
					<Canvas>
						<GameCanvas/>
					</Canvas>
				</div>
				<div className="flex-initial">
					<b>bottom</b>
				</div>
			</div>
		</FullScreen>
	)
} 