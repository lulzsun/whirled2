import React from 'react';
import { Me, Stuff, Rooms, Groups, Shop, Profile, Login, SignUp } from '../index';
import { Route, Switch } from 'react-router-dom';

export default function Page (props) {

	return (
		<div id="PagePane" className="h-full">
			<Switch>
				<Route exact path="/me">						<Me {...props}/></Route>
				<Route path="/stuff">       				<Stuff {...props}/></Route>
				<Route exact path="/rooms">       	<Rooms {...props}/></Route>
				<Route exact path="/groups">      	<Groups {...props}/></Route>
				<Route exact path="/shop">        	<Shop {...props}/></Route>
				<Route exact path="/login">					<Login {...props}/></Route>
				<Route exact path="/signup">				<SignUp {...props}/></Route>
				<Route exact path="/logout">				<Login logout={true} {...props}/></Route>
				<Route exact path="/profile">404: Uhhh... this doesn't exist yet. 🙈🛠</Route>
				<Route exact path="/settings">404: Uhhh... this doesn't exist yet. 🙈🛠</Route>
				<Route exact path="/help">404: Uhhh... this doesn't exist yet. 🙈🛠</Route>
				<Route exact path="/about">404: Uhhh... this doesn't exist yet. 🙈🛠</Route>
				<Route exact path="/:owner">				<Profile {...props}/></Route>
				<Route exact path="/:owner/friends">404: Uhhh... this doesn't exist yet. 🙈🛠</Route>
			</Switch>
		</div>
	)
}