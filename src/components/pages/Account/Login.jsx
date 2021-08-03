import React, { useState, useEffect, useContext } from 'react';
import { useHistory } from "react-router-dom";
import axios from 'axios';
import { Link } from 'react-router-dom';
import Button from '../../common/tail-kit/elements/buttons/Button';
import InputText from '../../common/tail-kit/form/inputtext/InputText';
import { Divider } from '../../common';
import memeFrog from "../../../media/passion-frog.jpg";
import { UserContext } from '../../../context/User';
import { SocketContext } from '../../../context/Socket';

export default function Login ({logout}) {
	const {setUser} = useContext(UserContext);
	const socket = useContext(SocketContext);
	const history = useHistory();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(''); 

	const [loginDisabled, setLoginDisabled] = useState(false);

	// https://stackoverflow.com/a/54655508/8805016
	// if not using this, it will cause an error if render isnt done
	useEffect(() => {
		async function doLogout() {
			if(logout && localStorage.getItem('refreshToken') !== null) {
				try {
					await axios.delete(`${process.env.REACT_APP_AUTH_URL}/auth/logout`, {
						skipAuthRefresh: true,
						headers: {
							'Content-Type': 'application/json'
						},
						data: {
							refreshToken: localStorage.getItem('refreshToken')
						}
					});
				}
				catch (error) {
					console.error(error);
				}
				localStorage.clear();
				setUser({loggedIn: false});
				socket.disconnect();
				console.log('Bye-bye!');
			}
		}
		doLogout();
	}, [setUser, logout, socket]);

  const handleSubmit = async (e) => {
    e.preventDefault();
		setLoginDisabled(true);
    const login = { username, password };
		try {
			let res = await axios.post(`${process.env.REACT_APP_AUTH_URL}/auth/login`, JSON.stringify(login), {
				headers: {
					'Content-Type': 'application/json'
				}
			});
			if(res.data.accessToken) {
				localStorage.setItem('accessToken', res.data.accessToken);
				localStorage.setItem('refreshToken', res.data.refreshToken);
			}

			res = await axios.get(`${process.env.REACT_APP_API_URL}/api/me`, {
				headers: {
					'Authorization': 'Bearer ' + localStorage.getItem('accessToken')
				}
			});
			if(res.data) {
				setUser(prevState => ({...prevState, ...res.data, loggedIn: true}));
				socket.emit("AUTH", localStorage.getItem('accessToken')); 
				history.push(`/${username}`);
			}
		}
		catch (error) {
			// TODO show a cool modal instead of doing this
			alert(error.response.data.message);
			console.error(error);
			setLoginDisabled(false);
		}
  }

	return (
		<div className="flex h-full overflow-y-auto">
		<div className="m-auto">
			<div className="max-w-sm">
			<img alt="heading" src={memeFrog} className="mb-4 rounded"></img>
			<form onSubmit={handleSubmit}>
				{/* Username */}
				<div className="mb-4">
					<label>Username</label>
					<InputText
						required type="text" placeholder="Username" 
						value={username} onChange={(e) => {setUsername(e.target.value);}}>
					</InputText> 
				</div>

				{/* Password */}
				<div className="mb-6">
					<label>Password</label>
					<InputText
						required type="password" placeholder="******************" 
						value={password} onChange={(e) => {setPassword(e.target.value);}}>
					</InputText> 
				</div>

				<div><Button color='purple' label='Sign in' disabled={loginDisabled} submit></Button></div>
			</form>
			
			<Divider/>
			<Link to="/signup">
				<div className="mb-2"><Button color='purple' label='Create an Account'></Button></div>
			</Link>
			<div><Button color='purple' label='Forgot Password?'></Button></div>
			</div>
		</div>
		</div>
	)
}