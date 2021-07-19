import React, { useState } from 'react';
import { Header } from './components/common';
import { BrowserRouter as Router } from 'react-router-dom';
import { Main } from './components/pages';
import axios from 'axios';
import createAuthRefreshInterceptor from 'axios-auth-refresh';

function App() {
  const [isLoggedIn, setLoggedIn] = useState(localStorage.getItem('refreshToken') !== null); 

  // https://github.com/Flyrell/axios-auth-refresh/issues/138#issuecomment-856585423
  // Function that will be called to refresh authorization
  
  const refreshAuthLogic = failedRequest => {
    return axios.post(`${process.env.REACT_APP_AUTH_URL}/auth/refreshToken`, {refreshToken: localStorage.getItem('refreshToken')}, { 
      skipAuthRefresh: true,
      headers: {
        'Content-Type': 'application/json'
      }
    }).then(response => {
      localStorage.setItem('accessToken', response.data.accessToken);
      failedRequest.response.config.headers['Authorization'] = 'Bearer ' + response.data.accessToken;
      console.log('Recieved new access token!');
      return Promise.resolve();
    }).catch((err) => {
      console.error(err);
      // this person does not have a valid refresh token, make them log back in
      alert('Your session has expired, please log back in.');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setLoggedIn(false);
      window.location.reload();
      return Promise.reject();
    });
  };

  // Instantiate the interceptor (you can chain it as it returns the axios instance)
  createAuthRefreshInterceptor(axios, refreshAuthLogic);

  return (
    <Router>
      <div className="flex flex-col h-screen">
        {/* https://stackoverflow.com/a/48434525/8805016 */}
        <Header key={isLoggedIn} isLoggedIn={isLoggedIn}/>
          <Main isLoggedIn={isLoggedIn} setLoggedIn={setLoggedIn}/>
      </div>
    </Router>
  );
}

export default App;