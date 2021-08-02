import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import ProfileCard from './ProfileCard';
import FriendsCard from './FriendsCard';
import InformationCard from './InformationCard';
import CommentsCard from './CommentsCard';

export default function Profile () {
	// universal state variables (?)
	const [profileData, setProfileData] = useState(null);
	const { owner } = useParams();
	const profileDiv = useRef();

	// ProfileCard state variables
	const [editProfile, setEditProfile] = useState(false);

	// InfoCard state variables
	const [showMore, setShowMore] = useState(false);
  const [editInfo, setEditInfo] = useState(false);

	// CommentCard state variables
	const [localComments, setLocalComments] = useState([]);

	// https://stackoverflow.com/a/57847874/8805016
	// effectively, this only gets called once and renders once
	useEffect(() => {
		console.log(`Hello from Profile-${owner} page!`);

    async function getProfileData() {
			try {
				const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/profile/${owner}`);
				if(res.data.profilePicture !== '') 
					res.data.profilePicture = `${process.env.REACT_APP_S3_URL}${res.data.profilePicture}`;

				setProfileData(res.data);

				// reset ProfileCard state variables
				setEditProfile(false);

				// reset InfoCard state variables
				setShowMore(false);
				setEditInfo(false);

				// reset CommentCard state variables
				setLocalComments([]);
				profileDiv.current.scrollTop = 0;
			} catch (error) {
				alert('404');
			}
		}

		getProfileData();
  }, [setProfileData, owner, profileDiv]);

	if(profileData) {
		return ( 
			<div ref={profileDiv} className="h-full overflow-y-auto p-5 scrollbar-thin">
				<div>
					<ProfileCard
						owner={owner} profileData={profileData}
						editProfile={editProfile} setEditProfile={setEditProfile}/>

					<InformationCard
						owner={owner} profileData={profileData}
						showMore={showMore} setShowMore={setShowMore} 
						editInfo={editInfo} setEditInfo={setEditInfo}/>

					<FriendsCard owner={owner} profileData={profileData}/>

					<CommentsCard
						owner={owner} parentId={profileData._id} comments={profileData.comments} 
						localComments={localComments} setLocalComments={setLocalComments}/>
				</div>
			</div>
		)
	}
	return (<></>);
}