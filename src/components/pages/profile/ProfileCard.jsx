import React from 'react';
import defaultPhoto from "../../../media/profile_photo.png";
import { ThreeDots, PencilFill, PersonPlusFill, Calendar3, CalendarCheck } from 'react-bootstrap-icons';
import { Link } from 'react-router-dom';

export default function ProfileCard (props) {
  const dateOptions = { year: 'numeric', month: 'short', day: 'numeric' };

  return (
    <div className="max-w-5xl w-full mx-auto z-10">
      <div className="flex flex-col">
        <div className="bg-gray-900 border border-white-900 shadow-lg rounded-3xl p-4 m-4">
          <div className="flex-none sm:flex">
            <div className=" relative h-32 w-32 sm:mb-0 mb-3">
              <img src={(props.profileData.profilePicture === '' ? defaultPhoto : props.profileData.profilePicture)} alt="ProfilePicture" className="w-32 h-32 object-cover rounded-2xl"/>
              <Link to="#"
                className="absolute -right-2 bottom-2 -ml-3 text-white p-1 text-xs bg-green-500 hover:bg-green-600 font-medium tracking-wider rounded-full transition ease-in duration-300">
                <PencilFill/>
              </Link>
				  	</div>
            <div className="flex-auto sm:ml-5 justify-evenly">
              <div className="flex flex-row">
                <div className="flex-1 inline-flex items-center sm:mt-2">
                  <div className="w-full flex-none text-lg text-gray-200 font-bold leading-none">{props.profileData.displayName}</div>
                </div>
                <div className="flex-1"></div>
                <div className="p-2 ml-4 text-lg text-gray-200 font-bold leading-none bg-green-500 hover:bg-green-600 cursor-pointer rounded-full">
                  <ThreeDots/>
                </div>
              </div>
              <div className="flex flex-col">
                <div className="flex-auto text-gray-400 my-1">
                  <span className="mr-3 ">@{props.profileData.username}</span>
                  <span className="mr-3 border-r border-gray-600 max-h-0"></span>
                  <span>Level {props.profileData.level}</span>
                </div>
              </div>
              <div className="flex flex-row mb-4 items-center">
              {props.profileData.status}
              </div>
              <div className="flex text-sm text-gray-400">
                <div className="flex-auto inline-flex items-center">
                  <PersonPlusFill className='h-5 w-5 mr-2'/>
                  <p className="">{props.profileData.friends.length} Friends</p>
                </div>
                <div className="flex-auto inline-flex items-center">
                  <Calendar3 className='h-5 w-5 mr-2'/>
                  <p className="">Joined {(new Date(props.profileData.createdAt)).toLocaleDateString(undefined, dateOptions)}</p>
                </div>
                <div className="flex-auto inline-flex items-center">
                  <CalendarCheck className='h-5 w-5 mr-2'/>
                  <p className="">Last Online {(new Date(props.profileData.lastOnline)).toLocaleDateString(undefined, dateOptions)}</p>
                </div>
                {/* <div className="p-2 ml-4 inline-flex items-center text-lg text-white leading-none bg-green-400 hover:bg-green-500 cursor-pointer rounded-full">
                  <House className="ml-1"/><p className="ml-1 mr-1 text-xs">Visit Home</p>
                </div>
                <div className="p-2 ml-4 inline-flex items-center text-lg text-white leading-none bg-green-400 hover:bg-green-500 cursor-pointer rounded-full">
                  <Binoculars className="ml-1"/><p className="ml-1 mr-1 text-xs">View Rooms</p>
                </div>
                <div className="p-2 ml-4 inline-flex items-center text-lg text-white leading-none bg-green-400 hover:bg-green-500 cursor-pointer rounded-full">
                  <Bag className="ml-1"/><p className="ml-1 mr-1 text-xs">Browse Items</p>
                </div> */}
              </div>  
            </div>
					</div>
				</div>
			</div>
		</div>
  );
}