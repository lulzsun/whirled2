import React, {useState} from 'react';
import { Link } from 'react-router-dom';
import Button from 'src/components/tail-kit/elements/buttons/Button';
import InputText from 'src/components/tail-kit/form/inputtext/InputText';
import { Divider } from '../../common';

export default function Login () {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const login = { username, password };
    console.log(login);
    console.log(process.env.REACT_APP_API_URL);
  }

	return (
		<div className="flex h-screen overflow-y-auto">
		<div className="m-auto">
			<div className="max-w-md">
			<form onSubmit={handleSubmit}>
				{/* Username */}
				<div className="mb-4">
					<InputText label="Username" 
						required type="text" placeholder="Username" 
						value={username} onChange={(e) => {setUsername(e.target.value);}}>
					</InputText> 
				</div>

				{/* Password */}
				<div className="mb-6">
					<InputText label="Password" 
						required type="password" placeholder="******************" 
						value={password} onChange={(e) => {setPassword(e.target.value);}}>
					</InputText> 
				</div>

				<div className="flex items-center justify-between">
					{/* Submit Form */}
					<div><Button color='purple' label='Forgot Password?'></Button></div>
					<div><Button color='purple' label='Sign in' submit></Button></div>
				</div>
			</form>
			
			<Divider/>
			<Link to="/signup">
				<div><Button color='purple' label='Create an Account'></Button></div>
			</Link>
			</div>
		</div>
		</div>
	)
}