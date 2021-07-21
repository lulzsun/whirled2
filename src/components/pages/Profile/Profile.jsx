import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import ProfileCard from './ProfileCard';
import FriendsCard from './FriendsCard';
import InformationCard from './InformationCard';
import CommentsCard from './CommentsCard';

export default function Profile () {
	// universal state variables (?)
	const [profileData, setProfileData] = useState(null);
	const { username } = useParams();

	// ProfileCard state variables
  const [owner, setOwner] = useState(false);
	const [editProfile, setEditProfile] = useState(false);

	// InfoCard state variables
	const [info, setInfo] = useState(null);
	const [showMore, setShowMore] = useState(false);
  const [editInfo, setEditInfo] = useState(false);

	// CommentCard state variables
	const [localComments, setLocalComments] = useState([]);

	// https://stackoverflow.com/a/57847874/8805016
	// effectively, this only gets called once and renders once
	useEffect(() => {
		console.log(`Hello from Profile-${username} page!`);

    async function getProfileData() {
			try {
				const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/profile/${username}`);
				setProfileData(res.data);

				// reset ProfileCard state variables
				(username === localStorage.getItem('username') ? setOwner(true) : setOwner(false));
				setEditProfile(false);

				// reset InfoCard state variables
				setInfo(res.data.information);
				setShowMore(false);
				setEditInfo(false);

				// reset CommentCard state variables
				setLocalComments([]);
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
					<ProfileCard 
						profileData={profileData} 
						owner={owner} setOwner={setOwner} 
						editProfile={editProfile} setEditProfile={setEditProfile}/>

					<InformationCard 
						info={info} setInfo={setInfo} 
						showMore={showMore} setShowMore={setShowMore} 
						editInfo={editInfo} setEditInfo={setEditInfo}/>

					<FriendsCard profileData={profileData}/>

					<CommentsCard 
						parentId={profileData._id} comments={profileData.comments} 
						localComments={localComments} setLocalComments={setLocalComments}/>
				</div>
			</div>
		)
	}
	return (<></>);
}