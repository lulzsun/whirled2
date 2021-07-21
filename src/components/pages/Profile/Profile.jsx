import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import ProfileCard from './ProfileCard';
import FriendsCard from './FriendsCard';
import InformationCard from './InformationCard';
import CommentsCard from './CommentsCard';

export default function Profile () {
	const [profileData, setProfileData] = useState(null);
	const { username } = useParams();

	// https://stackoverflow.com/a/57847874/8805016
	// effectively, this only gets called once and renders once
	useEffect(() => {
		console.log(`Hello from Profile-${username} page!`);

    async function getProfileData() {
			try {
				const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/profile/${username}`);
				setProfileData(res.data);
				console.log(res.data);
			} catch (error) {
				alert('404');
			}
		}

		getProfileData();
  }, [setProfileData, username]);

	if(profileData) {
		return ( 
			<div className="h-full overflow-y-auto container mx-auto p-5">
				<div>
					<ProfileCard profileData={profileData}/>
					<InformationCard profileData={profileData}/>
					<FriendsCard profileData={profileData}/>
					<CommentsCard profileData={profileData}/>
				</div>
			</div>
		)
	}
	return (<></>);
}