import React, { useState, useEffect, useMemo } from 'react';
import { Header } from './components/common';
import { BrowserRouter as Router } from 'react-router-dom';
import { Main } from './components/pages';
import axios from 'axios';
import createAuthRefreshInterceptor from 'axios-auth-refresh';
import { UserContext } from './context/User';

function App() {
  const [user, setUser] = useState({loggedIn: (localStorage.getItem('refreshToken') !== null)});
  const userContext = useMemo(() => ({user, setUser}), [user, setUser]);

  useEffect(() => {
    async function getUserData() {
			try {
				const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/me`, {
					headers: {
						'Authorization': 'Bearer ' + localStorage.getItem('accessToken')
					}
				});
				if(res.data) {
          //https://stackoverflow.com/a/66866460/8805016
          setUser(prevState => ({...prevState, ...res.data}));
				}
			} catch (error) {
				if(error !== undefined)
				console.error(error);
			}
		}
    if(user.loggedIn) {
		  getUserData();
    }
    // https://stackoverflow.com/a/55854902/8805016
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setUser(prevState => ({...prevState, loggedIn: false}));
      window.location.reload();
      return Promise.reject();
    });
  };

  // Instantiate the interceptor (you can chain it as it returns the axios instance)
  createAuthRefreshInterceptor(axios, refreshAuthLogic);

  return (
    <Router>
      <div className="flex flex-col h-screen">
        <UserContext.Provider value={userContext}>
          <Header/>
          <Main/>
        </UserContext.Provider>
      </div>
    </Router>
  );
}

export default App;