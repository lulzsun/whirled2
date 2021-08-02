import React, { useEffect, useRef, useState, useContext, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import GameCanvas from '../../three/GameCanvas';
import { FullScreen, useFullScreenHandle } from 'react-full-screen';
import { SocketContext } from '../../../context/Socket';

export default function Game (props) {
	const handle = useFullScreenHandle();
	const bot = useRef(), top = useRef();
	const [height, setHeight] = useState();
	const socket = useContext(SocketContext);
	// function handleOnClick(e) {
	// 	if(!handle.active) handle.enter();
	// 	else handle.exit();
	// }

	const handleJoinGame = useCallback(() => {
		console.log('successful connection to socket game server!');
	}, []);

	useEffect(() => {
		// ui initialization;
		function handleResize() {
			setHeight(bot.current.offsetHeight+top.current.offsetHeight);
		}
		setHeight(bot.current.offsetHeight+top.current.offsetHeight);

		// listeners
		socket.on("JOIN_GAME", handleJoinGame);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
			socket.off("JOIN_GAME", handleJoinGame);
			// force disconnect?
    };
  }, [socket, handleJoinGame]);

	return (
		<FullScreen className="h-full w-full bg-black" handle={handle}>
			<div className="h-full flex flex-col items-center">
				<div ref={top} className="flex-initial">
					<b>top</b>
				</div>
				<div className="flex-auto overflow-hidden w-full">
					{/* ok, this looks like jank but it fixes a resizing bug, but please optimize? */}
					<Canvas camera={{position: [7,5,0]}} style={{
						'position': 'absolute', 
						'width': `${props.width}%`, 
						'height': `calc(100% - ${height*2}px)`
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