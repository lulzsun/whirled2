import React from 'react';
import { Navbar } from '../common';
import { Link } from 'react-router-dom';

function Header () {

  return (
    <div class="border-b-2 py-2 hidden sm:block">
      <div class="flex justify-between">
        <Link to="/" class="bg-gray-900 
          text-white ml-3
          px-3 py-2 rounded-md text-sm 
          font-medium" aria-current="page">
          Whirled
        </Link>
          
        <div class="flex space-x-4">
          <Navbar/>

          <div class="text-right pr-3">
            <div>
              <p class="text-gray-300">✉ | Username | Help | Wiki | Privacy | Logoff</p>
            </div>
            <div>
              <p class="text-gray-300">🥈420 🥇69 ⭐100</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Header;