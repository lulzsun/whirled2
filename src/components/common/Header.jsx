import React from 'react';
import { Navbar } from '../common';
import { Link } from 'react-router-dom';
import defaultAvatar from "../../media/default-avatar.jpg";

export default function Header () {

	return (
		<div className="border-b-2 py-2 hidden sm:block">
			<div className="flex justify-between">
				<Link to="/" className="bg-gray-900 
				text-white ml-3
				px-3 py-2 rounded-md text-sm 
				font-medium" aria-current="page">
				Whirled
				</Link>
			
				<div className="flex space-x-4 mr-3">
					<Navbar/>
					<Link to="/login" aria-current="page">
						<div class="block relative">
							<img alt="profileIcon" src={defaultAvatar} class="mx-auto object-cover rounded-full h-10 w-10 "/>
							<div class="absolute w-3 t-3 border-2 left-full -bottom-1 transform -translate-x-1/2 border-white h-3 bg-green-500 rounded-full">
							</div>
						</div>
					</Link>
				</div>
			</div>
		</div>
	)
}