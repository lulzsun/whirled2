import React from 'react';

export default function ProfileCard () {
  return (
    <div class="bg-white p-3 shadow-sm rounded-sm">
      <div class="flex items-center space-x-2 font-semibold text-gray-900 leading-8">
        <span clas="text-green-500">
          <svg class="h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
            stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </span>
        <span class="tracking-wide">Information</span>
      </div>
      <div class="text-gray-700">
        <div class="grid md:grid-cols-2 text-sm">
          <div class="grid grid-cols-2">
            <div class="px-4 py-2 font-semibold">Interests</div>
            <div class="px-4 py-2">Cheese</div>
          </div>
          <div class="grid grid-cols-2">
            <div class="px-4 py-2 font-semibold">Birthday</div>
            <div class="px-4 py-2">4/20/1999</div>
          </div>
          <div class="grid grid-cols-2">
            <div class="px-4 py-2 font-semibold">Activities</div>
            <div class="px-4 py-2">Gaming</div>
          </div>
          <div class="grid grid-cols-2">
            <div class="px-4 py-2 font-semibold">About Me</div>
            <div class="px-4 py-2">I like cheese.</div>
          </div>
        </div>
      </div>
      <button
        class="block w-full text-blue-800 text-sm font-semibold rounded-lg hover:bg-gray-100 focus:outline-none focus:shadow-outline focus:bg-gray-100 hover:shadow-xs p-3 my-1">
        Show Full Information
      </button>
    </div>
  );
}