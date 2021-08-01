import React, { useContext } from 'react';
import { Navbar } from '../common';
import { Link } from 'react-router-dom';
import defaultPhoto from "../../media/profile_photo.png";
import headerLogo from "../../media/header_logo.png";
import DropDownMenu from '../common/tail-kit/elements/ddm/DropDownMenu';
import { UserContext } from '../../context/User';

export default function Header () {
	const {user} = useContext(UserContext);

	const dropDownItems = [
		{icon: '', label: "Profile", link: `/${user.username}`},
		{icon: '', label: "Settings", link: '/settings'},
		{icon: '', label: "Logout", link: '/logout'}
	];

	const ProfileIcon = () => {
		return (
			<div className="block relative">
				<img alt="profileIcon" src={(
						(user.profilePicture === '' || user.profilePicture === undefined) ?
						(defaultPhoto) : (`${process.env.REACT_APP_S3_URL}${user.profilePicture}`)
					)} 
					className="mx-auto object-cover rounded-full h-10 w-10"/>
				<div hidden={!user.loggedIn} 
					className="absolute w-3 t-3 border-2 left-full -bottom-1 transform -translate-x-1/2 border-white h-3 bg-green-500 rounded-full">
				</div>
			</div>
		);
	}

	return (
		<div className="border-b-2 hidden sm:block">
			<div className="flex justify-between">
				<Link to="/" className="bg-gray-900 
				text-white
				text-sm 
				font-medium" aria-current="page">
				<img alt="headerLogo" src={headerLogo} className=""></img>
				</Link>
			
				<div className="flex space-x-3 mr-3">
					<Navbar/>
					<div className="pt-1">
						<DropDownMenu hidden={!user.loggedIn} noFocus={true} items={dropDownItems} icon={
							<ProfileIcon/>}>
						</DropDownMenu>
						<Link hidden={user.loggedIn} to='/login' aria-current="page">
							<ProfileIcon/>
						</Link>
					</div>
				</div>
			</div>
		</div>
	)
}