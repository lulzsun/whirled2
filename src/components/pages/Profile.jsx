import React from 'react';
import { useParams } from 'react-router-dom';

function Profile () {
  const { id } = useParams();
  return (
    <p>Hello from Profile-{id} page!</p>
  )
}

export default Profile;