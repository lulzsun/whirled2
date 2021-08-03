import React, { useEffect, useRef, useState, useContext, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { SocketContext } from '../../../context/Socket';
import GameCanvas from '../../three/GameCanvas';
import { FullScreen, useFullScreenHandle } from 'react-full-screen';

export default function Game (props) {
	const handle = useFullScreenHandle();
	const bot = useRef(), top = useRef();
	const [height, setHeight] = useState();

	const socket = useContext(SocketContext);
	const [currentUser, setCurrentUser] = useState();
	const [users, setUsers] = useState();

	const handleConnected = useCallback((user) => {
		console.log('Connected to game server as user:', user);
		setCurrentUser(user);
		socket.emit('JOIN_ROOM'); // after connected, join home room
	}, [socket]);

	const handleInitRoom = useCallback((room) => {
		console.log('Connected to room:', room);
		setUsers(room.users);
	}, []);

	const handlePlayerJoin = useCallback((player) => {
		console.log('Player join:', player);
		let updatedUsers = users.concat(player);
		console.log(updatedUsers);
		setUsers(updatedUsers);
	}, [users]);

	const handlePlayerLeave = useCallback((player) => {
		console.log('Player leave:', player);
		let updatedUsers = users.filter(user => user.username !== player.username);
		console.log(updatedUsers);
		setUsers(updatedUsers);
	}, [users]);

	useEffect(() => {
		// ui initialization;
		function handleResize() {
			setHeight(bot.current.offsetHeight+top.current.offsetHeight);
		}
		setHeight(bot.current.offsetHeight+top.current.offsetHeight);

		// listeners
		socket.on("CONNECTED", handleConnected);
		socket.on("INIT_ROOM", handleInitRoom);
		socket.on("PLAYER_JOIN", handlePlayerJoin);
		socket.on("PLAYER_LEAVE", handlePlayerLeave);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
			socket.off("CONNECTED", handleConnected);
			socket.off("INIT_ROOM", handleInitRoom);
			socket.off("PLAYER_JOIN", handlePlayerJoin);
			socket.off("PLAYER_LEAVE", handlePlayerLeave);
    };
  }, [socket, handleConnected, handleInitRoom, handlePlayerJoin, handlePlayerLeave]);

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
						<GameCanvas socket={socket} currentUser={currentUser} users={users}/>
					</Canvas>
				</div>
				<div ref={bot} className="flex-initial">
					<b>bottom</b>
				</div>
			</div>
		</FullScreen>
	)
} 