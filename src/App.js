import React from 'react';
//import { v4 as uuidv4 } from 'uuid';
import { useHistory } from "react-router-dom";
import { Header, SplitView } from './components/common';
import { BrowserRouter as Router } from 'react-router-dom';
import axios from 'axios';
import createAuthRefreshInterceptor from 'axios-auth-refresh';

function App() {
  const history = useHistory();
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
    }).catch(() => {
      // this person does not have a valid refresh token, make them log back in
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('accessToken');
      history.push('/login');
      return Promise.reject();
    });
  };

  // Instantiate the interceptor (you can chain it as it returns the axios instance)
  createAuthRefreshInterceptor(axios, refreshAuthLogic);

  return (
    <Router>
      <div className="flex flex-col h-screen">
        <Header />
        <div className="flex flex-grow" style={{position: "relative"}}>
			    <SplitView />
        </div>
      </div>
    </Router>
  );
}

export default App;