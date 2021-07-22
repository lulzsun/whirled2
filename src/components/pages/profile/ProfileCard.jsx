import React, { useRef } from 'react';
import axios from 'axios';
import defaultPhoto from "../../../media/profile_photo.png";
import { ThreeDots, Pencil, Save, XLg, PersonPlusFill, Calendar3, CalendarCheck } from 'react-bootstrap-icons';
import DropDownMenu from '../../common/tail-kit/elements/ddm/DropDownMenu';
import { handleContentEditableMax } from '../../common/TextArea';

export default function ProfileCard ({owner, profileData, editProfile, setEditProfile}) {
  const dateOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  const profileRef = {
    displayName: useRef(),
    status: useRef(),
  }

  function updateProfile() {
    profileRef.displayName.current.innerText = profileData.displayName;
    profileRef.status.current.innerText = profileData.status;
  }

  const ownerDdmItems = [
		{icon: '', label: "Edit Profile Details", onClick: handleEditButton },
	];
  const guestDdmItems = [
		{icon: '', label: "Add as Friend" },
    {icon: '', label: "Send Mail" },
    {icon: '', label: "Visit Home" },
    {icon: '', label: "View Rooms" },
    {icon: '', label: "Browse Items" },
    {icon: '', label: "Block" },
    {icon: '', label: "Report" },
	];

  function handleEditButton() {
    setEditProfile(!editProfile);
    updateProfile();
  }

  async function handleSaveButton() {
    try {
      const updateProfileJson = {
        displayName: profileRef.displayName.current.innerText,
        status: profileRef.status.current.innerText,
      }
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/edit/profile`, JSON.stringify(updateProfileJson), {
        headers: {
          'Authorization': 'Bearer ' + localStorage.getItem('accessToken'),
          'Content-Type': 'application/json'
        }
      });
      if(res.data) {
        console.log(res);
      }
      profileData.displayName = profileRef.displayName.current.innerText;
      profileData.status = profileRef.status.current.innerText;
      setEditProfile(false);
    } catch (error) {
      if(error !== undefined)
      console.error(error);
    }
  }

  return (
    <div className="max-w-5xl w-full mx-auto z-10">
      <div className="flex flex-col">
        <div className="bg-gray-900 border border-white-900 shadow-lg rounded-3xl p-4 m-4">
          <div className="flex-none sm:flex">
            <div className=" relative h-32 w-32 sm:mb-0 mb-3">
              <img src={(profileData.profilePicture === '' ? defaultPhoto : profileData.profilePicture)} alt="ProfilePicture" className="w-32 h-32 object-cover rounded-2xl"/>
              <div hidden={!editProfile}
                className="p-1 absolute -right-2 bottom-2 -ml-3 text-white cursor-pointer text-xs bg-green-500 hover:bg-green-600 font-medium rounded-full">
                <Pencil/>
              </div>
				  	</div>
            <div className="flex-auto sm:ml-5 justify-evenly">
              <div className="flex flex-row">
                <div className={"flex-1 inline-flex items-center sm:mt-2 border " + (editProfile ? 'border-white bg-gray-700' : 'border-transparent bg-transparent')} >
                  <div className={"w-full flex-none text-lg text-gray-200 font-bold leading-none"}
                    suppressContentEditableWarning={true} data-max={20} onKeyDown={(e) => handleContentEditableMax(e)}
                    contentEditable={editProfile} ref={profileRef.displayName}>{profileData.displayName}</div>
                </div>
                  <div hidden={!editProfile} onClick={() => handleSaveButton()}
                    className="p-2 ml-4 text-lg text-gray-200 font-bold leading-none bg-green-500 hover:bg-green-600 cursor-pointer rounded-full">
                    <Save/>
                  </div>
                  <div>
                  <div onClick={(editProfile ? () => handleEditButton() : null)}>
                    <div hidden={!editProfile}
                      className="p-2 ml-4 text-lg text-gray-200 font-bold leading-none bg-red-500 hover:bg-red-600 cursor-pointer rounded-full">
                      <XLg/>
                    </div>
                    <DropDownMenu hidden={editProfile} className="text-xs" noFocus={true}
                      items={(owner === localStorage.getItem('username') ? ownerDdmItems : guestDdmItems)} icon={
                      <div
                        className={"p-2 ml-4 text-lg text-gray-200 font-bold leading-none bg-green-500 hover:bg-green-600 cursor-pointer rounded-full"}>
                        <ThreeDots/>
                      </div>
                      }>
                    </DropDownMenu>
                  </div>
                </div>
              </div>
              <div className="flex flex-col">
                <div className="flex-auto text-gray-400 my-1">
                  <span className="mr-3 ">@{profileData.username}</span>
                  <span className="mr-3 border-r border-gray-600 max-h-0"></span>
                  <span>Level {profileData.level}</span>
                </div>
              </div>
              <div className={"flex flex-row mb-4 items-center border " + (editProfile ? 'border-white bg-gray-700' : 'border-transparent bg-transparent')}>
              <div className="w-full" 
                suppressContentEditableWarning={true} data-max={30} onKeyDown={(e) => handleContentEditableMax(e)}
                contentEditable={editProfile} ref={profileRef.status}>{profileData.status}</div>
              </div>
              <div className="flex text-sm text-gray-400">
                <div className="flex-auto inline-flex items-center">
                  <PersonPlusFill className='h-5 w-5 mr-2'/>
                  <p className="">{profileData.friends.length} Friends</p>
                </div>
                <div className="flex-auto inline-flex items-center">
                  <Calendar3 className='h-5 w-5 mr-2'/>
                  <p className="">Joined {(new Date(profileData.createdAt)).toLocaleDateString(undefined, dateOptions)}</p>
                </div>
                <div className="flex-auto inline-flex items-center">
                  <CalendarCheck className='h-5 w-5 mr-2'/>
                  <p className="">Last Online {(new Date(profileData.lastOnline)).toLocaleDateString(undefined, dateOptions)}</p>
                </div>
                <>
                {/* <div className="p-2 ml-4 inline-flex items-center text-lg text-white leading-none bg-green-400 hover:bg-green-500 cursor-pointer rounded-full">
                  <House className="ml-1"/><p className="ml-1 mr-1 text-xs">Visit Home</p>
                </div>
                <div className="p-2 ml-4 inline-flex items-center text-lg text-white leading-none bg-green-400 hover:bg-green-500 cursor-pointer rounded-full">
                  <Binoculars className="ml-1"/><p className="ml-1 mr-1 text-xs">View Rooms</p>
                </div>
                <div className="p-2 ml-4 inline-flex items-center text-lg text-white leading-none bg-green-400 hover:bg-green-500 cursor-pointer rounded-full">
                  <Bag className="ml-1"/><p className="ml-1 mr-1 text-xs">Browse Items</p>
                </div> */}
                </>
              </div>  
            </div>
					</div>
				</div>
			</div>
		</div>
  );
}