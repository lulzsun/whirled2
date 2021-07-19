import React from 'react';
import defaultPhoto from "../../../media/profile_photo.png";

export default function ProfileCard () {
  return (
    <div class="bg-white p-3 hover:shadow">
      <div class="flex items-center space-x-3 font-semibold text-gray-900 text-xl leading-8">
        <span class="text-blue-500">
          <svg class="h-5 fill-current" xmlns="http://www.w3.org/2000/svg" fill="none"
            viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </span>
        <span>Friends</span>
      </div>
      <div class="grid grid-cols-5 justify-center justify-evenly content-evenly place-items-center">
        <div class="h-10 w-10 text-center my-2">
          <img class="rounded-full"
          src={defaultPhoto}
          alt=""/>
        </div>
        <div class="h-10 w-10 text-center my-2">
          <img class="rounded-full"
            src={defaultPhoto}
            alt=""/>
        </div>
        <div class="h-10 w-10 text-center my-2">
          <img class="rounded-full"
            src={defaultPhoto}
            alt=""/>
        </div>
        <div class="h-10 w-10 text-center my-2">
          <img class="rounded-full"
            src={defaultPhoto}
            alt=""/>
        </div>
        <div class="h-10 w-10 text-center my-2">
          <img class="rounded-full"
            src={defaultPhoto}
            alt=""/>
        </div>
      </div>
    </div>
  );
}