import React from 'react';
import { Me, Stuff, Rooms, Groups, Shop, Profile } from '../pages';
import { Route, Switch } from 'react-router-dom';

function Page () {
  return (
    <div id="PagePane" class="h-full">
      <Switch>
        <Route exact path="/">Uhhh... you shouldn't be seeing this.</Route>
        <Route exact path="/me">          <Me /></Route>
        <Route exact path="/stuff">       <Stuff /></Route>
        <Route exact path="/rooms">       <Rooms /></Route>
        <Route exact path="/groups">      <Groups /></Route>
        <Route exact path="/shop">        <Shop /></Route>
        <Route exact path="/profile/:id"> <Profile /></Route>
      </Switch>
    </div>
  )
}

export default Page;