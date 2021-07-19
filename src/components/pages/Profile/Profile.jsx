import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import ProfileCard from './ProfileCard';
import FriendsCard from './FriendsCard';
import AboutMeCard from './AboutMeCard';
import SomethingCard from './SomethingCard';

export default function Profile () {
	const [profileData, setProfileData] = useState(null);
	const { username } = useParams();

	// https://stackoverflow.com/a/57847874/8805016
	// effectively, this only gets called once and renders once
	useEffect(() => {
		console.log(`Hello from Profile-${username} page!`);

    async function getProfileData() {
			const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/profile/${username}`);
			setProfileData(res.data);

			console.log(res.data);
		}

		getProfileData();
  }, [setProfileData, username]);

	return (
		// https://tailwindcomponents.com/component/profile-page
		<div class="h-full overflow-y-auto container mx-auto p-5">
        <div class="md:flex no-wrap md:-mx-2">
            <div class="w-full md:w-3/12 md:mx-2">
							<ProfileCard/>
							<div class="my-4"></div>
							<FriendsCard/>
            </div>
            <div class="w-full md:w-9/12 mx-2 h-64">
							<AboutMeCard/>
							<div class="my-4"></div>
							{/* <SomethingCard/> */}
            </div>
        </div>
    </div>
	)
}