import React from 'react';
import defaultPhoto from "../../media/profile_photo.png";
import { ThreeDots } from 'react-bootstrap-icons';

export default function CommentSection ({commentArray}) {
  console.log(commentArray);

  return (
    <div className="flex flex-col">
      {/* Single Comment */}
      <div className="flex mt-2 group">
        <img alt="profileIcon" src={defaultPhoto} className="group-hover:opacity-50 inline mt-1.5 object-cover rounded-full h-10 w-10"/>
        <div className="pl-4 inline w-full flex flex-col">
          <div className="flex flex-row text-gray-400">
            <div className="flex-1 inline items-center">
              <span className="group-hover:opacity-50 mr-2 text-white font-semibold">lulzsun</span>
              <span className="group-hover:opacity-50 mr-2 border-r border-gray-600 max-h-0"></span>
              <span className="group-hover:opacity-50 mr-2 text-xs">@lulzsun</span>
              <span className="group-hover:opacity-50 mr-2 border-r border-gray-600 max-h-0"></span>
              <span className="group-hover:opacity-50 mr-2 text-xs">Today at 4:20 AM</span>
            </div>
            <div className="flex-1 inline-flex justify-end">
              <div className="p-2 text-xs text-white bg-green-500 hover:bg-green-600 cursor-pointer rounded-full opacity-0 group-hover:opacity-100">
                <ThreeDots/>
              </div>
            </div>
          </div>
          <span className="group-hover:opacity-50">I hate your guts</span>
        </div>
      </div>
      {/* Single Comment */}
      <div className="flex mt-2 group">
        <img alt="profileIcon" src={defaultPhoto} className="group-hover:opacity-50 inline mt-1.5 object-cover rounded-full h-10 w-10"/>
        <div className="pl-4 inline w-full flex flex-col">
          <div className="flex flex-row text-gray-400">
            <div className="flex-1 inline items-center">
              <span className="group-hover:opacity-50 mr-2 text-white font-semibold">lulzsun</span>
              <span className="group-hover:opacity-50 mr-2 border-r border-gray-600 max-h-0"></span>
              <span className="group-hover:opacity-50 mr-2 text-xs">@lulzsun</span>
              <span className="group-hover:opacity-50 mr-2 border-r border-gray-600 max-h-0"></span>
              <span className="group-hover:opacity-50 mr-2 text-xs">Today at 4:20 AM</span>
            </div>
            <div className="flex-1 inline-flex justify-end">
              <div className="p-2 text-xs text-white bg-green-500 hover:bg-green-600 cursor-pointer rounded-full opacity-0 group-hover:opacity-100">
                <ThreeDots/>
              </div>
            </div>
          </div>
          <span className="group-hover:opacity-50">I hate your guts. I hate your guts. I hate your guts. I hate your guts. I hate your guts. I hate your guts. I hate your guts. I hate your guts. </span>
        </div>
      </div>
    </div>
  );
}