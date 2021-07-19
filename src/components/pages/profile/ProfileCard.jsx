import React from 'react';
import defaultPhoto from "../../../media/profile_photo.png";

export default function ProfileCard () {
  return (
    <div class="bg-white p-3 border-t-4 border-blue-400">
      <div class="image overflow-hidden">
        <img class="h-auto w-full mx-auto" src={defaultPhoto} alt=""/>
      </div>
      <h1 class="text-gray-900 font-bold text-lg leading-8">Lulzsun</h1>
      <h3 class="text-gray-600 text-sm text-semibold leading-6">@lulzsun</h3>
      <p class="text-sm text-gray-500 hover:text-gray-600 leading-6">Hello Whirled!</p>
      <ul class="bg-gray-100 text-gray-600 hover:text-gray-700 hover:shadow px-3 mt-3 divide-y rounded shadow-sm">
        <li class="flex items-center py-3">
          <span class="text-sm">Level</span>
          <span class="ml-auto">
            <span class="bg-yellow-500 py-1 px-2 rounded text-white text-sm">1</span></span>
        </li>
        {/* <li class="flex items-center py-3">
          <span class="text-xs">Joined</span>
          <span class="text-xs ml-auto">04/20/2021</span>
        </li>
        <li class="flex items-center py-3">
          <span class="text-xs">Last Online</span>
          <span class="text-xs ml-auto">04/20/2021</span>
        </li> */}
      </ul>
    </div>
  );
}