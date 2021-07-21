import React from 'react';
import { PencilFill } from 'react-bootstrap-icons';
// import { Link } from 'react-router-dom';

export default function InformationCard (props) {
  return (
    <div className="max-w-5xl w-full mx-auto z-10">
      <div className="flex flex-col">
        <div className="bg-gray-900 border border-white-900 shadow-lg rounded-3xl p-4 m-4">
          <div className="relative flex-none sm:flex">
            {/* Heading */}
            <div className="absolute flex flex-row w-full transform -translate-y-full">
              <div className="flex-1 inline-flex items-center">
                <div className="p-2 pl-4 pr-4 text-white leading-none bg-green-500 rounded-full">
                Information
                </div>
              </div>
              <div className="flex-1 inline-flex justify-end">
                <div className="p-1 pl-2 pr-2 m-2 text-xs text-white leading-none bg-green-500 hover:bg-green-600 cursor-pointer rounded-full">
                  <PencilFill/>
                </div>
              </div>
            </div>
            {/* Content */}
            <div className="text-gray-100 mb-2">
              <div className="text-xs">
                <div className="pt-3 flex">
                  <div className="flex-shrink-0 w-32 px-4 py-1 font-bold">Activities</div>
                  <div className="px-4 py-1">{props.profileData.information.activities}</div>
                </div>
                <div className="flex">
                  <div className="flex-shrink-0 w-32 px-4 py-1 font-bold">Interests</div>
                  <div className="px-4 py-1">{props.profileData.information.interests}</div>
                </div>
                <div className="flex">
                  <div className="flex-shrink-0 w-32 px-4 py-1 font-bold">About Me</div>
                  <div className="px-4 py-1">{props.profileData.information.aboutMe}</div>
                </div>
              </div>
            </div>
            {/*  Footer */}
            <div className="absolute flex flex-row w-full top-full">
              <div className="flex-1 inline-flex justify-center">
                <div className="p-1 pl-2 pr-2 m-1.5 text-xs text-text-white-200 leading-none bg-green-500 hover:bg-green-500 cursor-pointer rounded-full">
                  Show more information
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}