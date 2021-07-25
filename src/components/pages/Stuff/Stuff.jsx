import React, { useContext } from 'react';
import { Route, Switch, useRouteMatch } from 'react-router-dom';
import { UserContext } from '../../../Contexts';

import Sidebar from '../../common/tail-kit/navigation/sidebar/Sidebar';
import Avatars from './Avatars';

export default function Stuff () {
	const {user} = useContext(UserContext);

	const links = {
		avatar: '/stuff/avatars',
		furniture: '/stuff/furniture',
		backdrops: '/stuff/backdrops',
		pets: '/stuff/pets',
		music: '/stuff/music',
	}

	// 🤢🤢🤢
	let routeMatchAvatar, routeMatchStuff, avatarSelected = false;
	routeMatchAvatar = useRouteMatch(links.avatar);
	routeMatchStuff = useRouteMatch('/stuff').isExact;
	if(!routeMatchAvatar && routeMatchStuff) avatarSelected = true;
	else if(routeMatchAvatar) avatarSelected = true;
	// 🙈🙈🙈

	const categories = [
		{icon: '', selected: avatarSelected, label: 'Avatars', link: links.avatar},
		{icon: '', selected: useRouteMatch(links.furniture), label: 'Furniture', link: links.furniture},
		{icon: '', selected: useRouteMatch(links.backdrops), label: 'Backdrops', link: links.backdrops},
		{icon: '', selected: useRouteMatch(links.pets), label: 'Pets', link: links.pets},
		{icon: '', selected: useRouteMatch(links.music), label: 'Music', link: links.music}
	];

	// this causes a warning when redirecting too fast, TODO find a better way
	// if(useRouteMatch('/stuff').isExact) {
	// 	return (<>{history.push('/stuff/avatars')}</>);
	// }

	const StuffPane = () => {
		if(!user.loggedIn) {
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
			<div hidden={!user.loggedIn} className="w-40">
				<Sidebar links={categories} withBorder="true"></Sidebar>
			</div>
			<div hidden={!user.loggedIn} className="w-full">
				<StuffPane/>
			</div>
			<div hidden={user.loggedIn}>
				<p>Please log in to see your stuff!</p>
			</div>
		</div>
		</>
	)
}