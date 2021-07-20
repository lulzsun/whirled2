import React from 'react';
import { ThreeDots, ArrowReturnLeft } from 'react-bootstrap-icons';
import defaultPhoto from "../../../media/profile_photo.png";

export default function CommentsCard () {
  return (
    <div className="max-w-5xl w-full mx-auto z-10">
      <div className="flex flex-col">
        <div className="bg-gray-900 border border-white-900 shadow-lg rounded-3xl p-4 m-4">
          <div className="relative flex-none sm:flex">
            {/* Heading */}
            <div className="absolute flex flex-row w-full transform -translate-y-full">
              <div className="flex-1 inline-flex items-center">
                <div className="p-2 pl-4 pr-4 text-white leading-none bg-green-500 rounded-full">
                  Comments
                </div>
              </div>
            </div>
            {/* Content */}
            <div className="w-full mb-2">
              <form>
                {/* Leave a comment section */}
                <div className="flex mt-4 mb-4">
                  <img alt="profileIcon" src={defaultPhoto} className="mt-1 mx-auto object-cover rounded-full h-10 w-10"/>
                  <div className='ml-2 w-full bg-gray-700 h-auto rounded-xl'>
                    <span className="pointer-events-none absolute p-3 text-gray-400">Leave a comment!</span>
                    <div className='w-full p-3 break-all' contentEditable="true"></div>
                  </div>
                  <button className="ml-2" type="submit">
                    <ArrowReturnLeft/>
                  </button>
                </div>
                {/* Other's comments */}
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
              </form>
            </div>
            {/*  Footer */}
            <div className="absolute flex flex-row w-full top-full">
              <div className="flex-1 inline-flex justify-center">
                <div className="p-1 pl-2 pr-2 m-1.5 text-xs text-white leading-none bg-green-500 hover:bg-green-600 cursor-pointer rounded-full">
                  Show more comments
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}