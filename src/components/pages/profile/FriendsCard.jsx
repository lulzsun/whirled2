import React from 'react';
import defaultPhoto from "../../../media/profile_photo.png";
// import { Link } from 'react-router-dom';

export default function FriendsCard () {
  return (
    <div className="max-w-5xl w-full mx-auto z-10">
      <div className="flex flex-col">
        <div className="bg-gray-900 border border-white-900 shadow-lg rounded-3xl p-4 m-4">
          <div className="relative flex-none sm:flex">
            {/* Heading */}
            <div className="absolute flex flex-row w-full transform -translate-y-full">
              <div className="flex-1 inline-flex items-center">
                <div className="p-2 pl-4 pr-4 text-text-white-200 leading-none bg-green-500 rounded-full">
                  Friends
                </div>
              </div>
              <div className="flex-1 inline-flex justify-end">
                <div className="p-1 pl-2 pr-2 m-2 text-xs text-text-white-200 leading-none bg-green-500 hover:bg-green-600 cursor-pointer rounded-full">
                  View All Friends
                </div>
              </div>
            </div>
            {/* Content */}
            <div className="w-full grid grid-cols-6 justify-center justify-evenly content-evenly place-items-center">
              <div className="h-10 w-10 text-center my-2">
                <img className="rounded-full"
                src={defaultPhoto}
                alt=""/>
              </div>
              <div className="h-10 w-10 text-center my-2">
                <img className="rounded-full"
                src={defaultPhoto}
                alt=""/>
              </div>
              <div className="h-10 w-10 text-center my-2">
                <img className="rounded-full"
                src={defaultPhoto}
                alt=""/>
              </div>
              <div className="h-10 w-10 text-center my-2">
                <img className="rounded-full"
                src={defaultPhoto}
                alt=""/>
              </div>
              <div className="h-10 w-10 text-center my-2">
                <img className="rounded-full"
                src={defaultPhoto}
                alt=""/>
              </div>
              <div className="h-10 w-10 text-center my-2">
                <img className="rounded-full"
                src={defaultPhoto}
                alt=""/>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}