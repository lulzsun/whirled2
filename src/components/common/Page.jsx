import React from 'react';
import { Me, Stuff, Rooms, Groups, Shop, Profile, Login, SignUp } from '../pages';
import { Route, Switch } from 'react-router-dom';

export default function Page () {
  return (
    <div id="PagePane" className="h-full">
      <Switch>
        <Route exact path="/me">          <Me /></Route>
        <Route exact path="/stuff">       <Stuff /></Route>
        <Route exact path="/rooms">       <Rooms /></Route>
        <Route exact path="/groups">      <Groups /></Route>
        <Route exact path="/shop">        <Shop /></Route>
        <Route exact path="/profile/:id"> <Profile /></Route>
        <Route exact path="/login">       <Login /></Route>
        <Route exact path="/signup">      <SignUp /></Route>
        <Route exact path="*">404: Uhhh... you shouldn't be seeing this. 🙈</Route>
      </Switch>
    </div>
  )
}