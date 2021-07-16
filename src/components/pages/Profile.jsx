import React from 'react';
import { useParams } from 'react-router-dom';

export default function Profile () {
  const { id } = useParams();
  return (
    <p>Hello from Profile-{id} page!</p>
  )
}