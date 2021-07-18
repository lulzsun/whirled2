import React, { useState, useEffect } from 'react';
import { Route, Switch, useParams } from 'react-router-dom';
import axios from 'axios';
import Sidebar from 'src/components/tail-kit/navigation/sidebar/Sidebar';
import Avatars from './Avatars';

export default function Stuff () {
	const categories = [
		{icon: '', selected: true, label: 'Avatars'},
		{icon: '', selected: true, label: 'Furniture'},
		{icon: '', selected: true, label: 'Backdrops'},
		{icon: '', selected: true, label: 'Pets'},
		{icon: '', selected: true, label: 'Music'}
	];
	const [loggedIn, setLoggedIn] = useState(true);
	const [inventoryData, setInventoryData] = useState(null);
	const { category, id } = useParams();

	// https://stackoverflow.com/a/57847874/8805016
	// effectively, this only gets called once and then renders
	useEffect(() => {
    async function getInventoryData() {
			try {
				const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/stuff`, {
					headers: {
						'Authorization': 'Bearer ' + localStorage.getItem('accessToken')
					}
				});
				if(res) {
					setInventoryData(res.data);
					console.log(res);
				}
			} catch (error) {
				if(error !== undefined)
				console.error(error);
			}
		}

		if(localStorage.getItem('refreshToken')) {
			getInventoryData();
			setLoggedIn(false);
		}
  }, []);

	return (
		<>
		<div className="flex h-full">
			<div className="w-40">
				<Sidebar links={categories} withBorder="true"></Sidebar>
			</div>
			<div hidden={(inventoryData === null)} className="w-full">
				<Switch>
					<Route path="/stuff/avatars"><Avatars/></Route>
					<Route path="/stuff/furniture">FURNITURE</Route>
					<Route path="/stuff/backdrops">BACKDROPS</Route>
					<Route path="/stuff/pets">PETS</Route>
					<Route path="/stuff/music">MUSIC</Route>
					<Route exact path="/stuff"><Avatars/></Route>
					<Route exact path="*">404: Uhhh... you shouldn't be seeing this. 🙈🛠</Route>
				</Switch>
			</div>
			<div hidden={!loggedIn}>
				<p>Please log in to see your stuff!</p>
			</div>
		</div>
		</>
	)
}