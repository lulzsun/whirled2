import React from 'react';
import { Route, Switch, useRouteMatch } from 'react-router-dom';

import Sidebar from '../../common/tail-kit/navigation/sidebar/Sidebar';
import Avatars from './Avatars';

export default function Stuff ({isLoggedIn}) {
	const links = {
		avatar: '/stuff/avatars',
		furniture: '/stuff/furniture',
		backdrops: '/stuff/backdrops',
		pets: '/stuff/pets',
		music: '/stuff/music',
	}

	const categories = [
		{icon: '', selected: useRouteMatch(links.avatar), label: 'Avatars', link: links.avatar},
		{icon: '', selected: useRouteMatch(links.furniture), label: 'Furniture', link: links.furniture},
		{icon: '', selected: useRouteMatch(links.backdrops), label: 'Backdrops', link: links.backdrops},
		{icon: '', selected: useRouteMatch(links.pets), label: 'Pets', link: links.pets},
		{icon: '', selected: useRouteMatch(links.music), label: 'Music', link: links.music}
	];

	const StuffPane = () => {
		if(!isLoggedIn) {
			return (<></>);
		} else {
			return (
				<Switch>
					<Route path={links.avatar}><Avatars/></Route>
					<Route path={links.furniture}>FURNITURE</Route>
					<Route path={links.backdrops}>BACKDROPS</Route>
					<Route path={links.pets}>PETS</Route>
					<Route path={links.music}>MUSIC</Route>
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