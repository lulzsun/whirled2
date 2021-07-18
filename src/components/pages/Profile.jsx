import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

export default function Profile () {
	const [profileData, setProfileData] = useState(null);
	const { id } = useParams();

	// https://stackoverflow.com/a/57847874/8805016
	// effectively, this only gets called once and renders once
	// useEffect(() => {
	// 	console.log(`Hello from Profile-${id} page!`);

  //   async function getProfileData() {
	// 		const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/posts`, {
	// 			headers: {
	// 				'Authorization': 'Bearer ' + localStorage.getItem('accessToken')
	// 			}
	// 		});
	// 		setProfileData(res.data);
	// 		console.log(res);
	// 	}

	// 	getProfileData();
  // }, []);

	return (
		<p>Hello from Profile-{id} page! {profileData}</p>
	)
}