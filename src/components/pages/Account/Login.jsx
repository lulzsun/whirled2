import React, { useState, useEffect } from 'react';
import { useHistory } from "react-router-dom";
import axios from 'axios';
import { Link } from 'react-router-dom';
import Button from '../../common/tail-kit/elements/buttons/Button';
import InputText from '../../common/tail-kit/form/inputtext/InputText';
import { Divider } from '../../common';
import memeFrog from "../../../media/passion-frog.jpg";

export default function Login ({setLoggedIn, logout}) {
	const history = useHistory();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(''); 

	const [loginDisabled, setLoginDisabled] = useState(false);

	// https://stackoverflow.com/a/54655508/8805016
	// if not using this, it will cause an error if render isnt done
	useEffect(() => {
		if(logout) {
			localStorage.removeItem('accessToken');
			localStorage.removeItem('refreshToken');
			setLoggedIn(false);
		}
	}, [setLoggedIn, logout]);

  const handleSubmit = (e) => {
    e.preventDefault();
		setLoginDisabled(true);
    const login = { username, password };
		
		axios.post(`${process.env.REACT_APP_AUTH_URL}/auth/login`, JSON.stringify(login), {
			headers: {
				'Content-Type': 'application/json'
			}
		}).then(response => {
			if(response.data.accessToken) {
				try {
					localStorage.setItem('accessToken', response.data.accessToken);
					localStorage.setItem('refreshToken', response.data.refreshToken);
					setLoggedIn(true);
					history.push(`/${username}`);
				} 
				catch (error) {
					alert('Issue logging in, try again later....');
					console.error(error);
				}
			}
		}).catch(error => {
			if( error.response ) {
				// TODO show a cool modal instead of doing this
				alert(error.response.data.message); 
			}
			setLoginDisabled(false);
		});
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