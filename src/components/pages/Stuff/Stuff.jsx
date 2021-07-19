import React from 'react';
import { Route, Switch } from 'react-router-dom';

import Sidebar from '../../common/tail-kit/navigation/sidebar/Sidebar';
import Avatars from './Avatars';

export default function Stuff ({isLoggedIn}) {
	const categories = [
		{icon: '', selected: true, label: 'Avatars'},
		{icon: '', selected: true, label: 'Furniture'},
		{icon: '', selected: true, label: 'Backdrops'},
		{icon: '', selected: true, label: 'Pets'},
		{icon: '', selected: true, label: 'Music'}
	];

	const StuffPane = () => {
		if(!isLoggedIn) {
			return (<></>);
		} else {
			return (
				<Switch>
					<Route path="/stuff/avatars"><Avatars/></Route>
					<Route path="/stuff/furniture">FURNITURE</Route>
					<Route path="/stuff/backdrops">BACKDROPS</Route>
					<Route path="/stuff/pets">PETS</Route>
					<Route path="/stuff/music">MUSIC</Route>
					<Route exact path="/stuff"><Avatars/></Route>
					<Route exact path="*">404: Uhhh... you shouldn't be seeing this. 🙈🛠</Route>
				</Switch>
			);
		}
	}

	return (
		<>
		<div className="flex h-full">
			<div hidden={!isLoggedIn} className="w-40">
				<Sidebar links={categories} withBorder="true"></Sidebar>
			</div>
			<div hidden={!isLoggedIn} className="w-full">
				<StuffPane/>
			</div>
			<div hidden={isLoggedIn}>
				<p>Please log in to see your stuff!</p>
			</div>
		</div>
		</>
	)
}