import React from 'react';
import { Link } from 'react-router-dom';

function Navbar () {

  return (
    <>
      <Link to="/me" class="text-gray-300 
        hover:bg-gray-700
        hover:text-white px-3 py-2 
        rounded-md text-sm font-medium">
        Me
      </Link>
        
      <Link to="/stuff" class="text-gray-300 
        hover:bg-gray-700
        hover:text-white px-3 py-2 
        rounded-md text-sm font-medium">
        Stuff
      </Link>
        
      <Link to="/rooms" class="text-gray-300 
        hover:bg-gray-700
        hover:text-white px-3 py-2 
        rounded-md text-sm font-medium">
        Rooms
      </Link>

      <Link to="/groups" class="text-gray-300 
        hover:bg-gray-700
        hover:text-white px-3 py-2 
        rounded-md text-sm font-medium">
        Groups
      </Link>

      <Link to="/shop" class="text-gray-300 
        hover:bg-gray-700
        hover:text-white px-3 py-2 
        rounded-md text-sm font-medium">
        Shop
      </Link>
    </>
  )
}

export default Navbar;