import React from 'react';
import { Link } from 'react-router-dom';
import { Bell, Envelope } from 'react-bootstrap-icons';

export default function Navbar () {

	return (
		<>
			<Link to="/me" className="text-gray-300 
				hover:bg-gray-700
				hover:text-white px-3 py-3 
				rounded-md text-sm font-medium">
				Me
			</Link>

			<Link to="/stuff" className="text-gray-300 
				hover:bg-gray-700
				hover:text-white px-3 py-3 
				rounded-md text-sm font-medium">
				Stuff
			</Link>
				
			<Link to="/rooms" className="text-gray-300 
				hover:bg-gray-700
				hover:text-white px-3 py-3 
				rounded-md text-sm font-medium">
				Rooms
			</Link>

			<Link to="/groups" className="text-gray-300 
				hover:bg-gray-700
				hover:text-white px-3 py-3 
				rounded-md text-sm font-medium">
				Groups
			</Link>

			<Link to="/shop" className="text-gray-300 
				hover:bg-gray-700
				hover:text-white px-3 py-3 
				rounded-md text-sm font-medium">
				Shop
			</Link>
			
			<div className="cursor-pointer
				text-gray-300 hover:bg-gray-700
				hover:text-white px-3 py-3 
				rounded-md text-2xl font-medium">
				<Bell></Bell>
			</div>

			<div className="cursor-pointer
				text-gray-300 hover:bg-gray-700
				hover:text-white px-3 py-3 
				rounded-md text-2xl font-medium">
				<Envelope></Envelope>
			</div>
		</>
	)
}