import React, { useState } from 'react';
import { FullScreen, useFullScreenHandle } from "react-full-screen";

export default function Game () {
	const handle = useFullScreenHandle();

	function handleOnClick(e) {
		if(!handle.active) {
			handle.enter();
		}
		else {
			handle.exit();
		}
	}

	return (
		// i am a huge noob at flexbox and css in general, heres what i used to figure this out
		// https://stackoverflow.com/questions/90178/make-a-div-fill-the-height-of-the-remaining-screen-space
		<FullScreen className="h-full bg-black" handle={handle}>
			<div className="h-full flex flex-col items-center">
				<div className="flex-initial">
					<b>top</b>
				</div>
				<div className="flex-auto">
					<div className="h-full flex items-center" onClick={(e) => handleOnClick(e)}>
						<p hidden={handle.active} className="text-center text-5xl select-none">🔧🐒</p>
						<p hidden={!handle.active} className="text-center text-5xl select-none">🚀🌒</p>
					</div>
				</div>
				<div className="flex-initial">
					<b>bottom</b>
				</div>
			</div>
		</FullScreen>
	)
} 