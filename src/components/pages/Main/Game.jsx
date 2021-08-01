import React, { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import GameCanvas from '../../three/GameCanvas';
import { FullScreen, useFullScreenHandle } from 'react-full-screen';

export default function Game (props) {
	const handle = useFullScreenHandle();
	const bot = useRef(), top = useRef();
	const [height, setHeight] = useState();
	// function handleOnClick(e) {
	// 	if(!handle.active) handle.enter();
	// 	else handle.exit();
	// }

	useEffect(() => {
		function handleResize() {
			setHeight(bot.current.offsetHeight+top.current.offsetHeight);
		}
		setHeight(bot.current.offsetHeight+top.current.offsetHeight);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

	return (
		<FullScreen className="h-full w-full bg-black" handle={handle}>
			<div className="h-full flex flex-col items-center">
				<div ref={top} className="flex-initial">
					<b>top</b>
				</div>
				<div className="flex-auto overflow-hidden w-full">
					{/* ok, this looks like jank but it fixes a resizing bug, but please optimize? */}
					<Canvas style={{
						'position': 'absolute', 
						'width': `${props.width}%`, 
						'height': `calc(100% - ${height}px)`
					}}>
						<GameCanvas/>
					</Canvas>
				</div>
				<div ref={bot} className="flex-initial">
					<b>bottom</b>
				</div>
			</div>
		</FullScreen>
	)
} 