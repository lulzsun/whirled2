import React from 'react';
import { Navbar } from '../common';
import { Link } from 'react-router-dom';
import defaultAvatar from "../../media/default-avatar.jpg";

export default function Header () {

  return (
    <div className="border-b-2 py-2 hidden sm:block">
      <div className="flex justify-between">
        <Link to="/" className="bg-gray-900 
          text-white ml-3
          px-3 py-2 rounded-md text-sm 
          font-medium" aria-current="page">
          Whirled
        </Link>
          
        <div className="flex space-x-4 mr-3">
          <Navbar/>
          <Link to="/login" aria-current="page">
          <img alt="profileIcon" src={defaultAvatar} className="rounded-full h-10 w-10"></img>
          </Link>
          {/* <div className="text-right pr-3">
            <div>
              <p className="text-gray-300">✉ | Username | Help | Wiki | Privacy | Logoff</p>
            </div>
            <div>
              <p className="text-gray-300">🥈420 🥇69 ⭐100</p>
            </div>
          </div> */}
        </div>
      </div>
    </div>
  )
}