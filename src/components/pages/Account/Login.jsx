import React, {useState} from 'react';
import { Link } from 'react-router-dom';
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
              <label htmlFor="username">Username</label>
              <input 
                className="rounded w-full py-2 px-3 text-black"
                required type="text" placeholder="Username"
                value={username} onChange={(e) => setUsername(e.target.value)}/>
            </div>

            {/* Password */}
            <div className="mb-6">
              <label htmlFor="password">Password</label>
              <input 
                className="rounded w-full py-2 px-3 text-black"
                required type="password" placeholder="******************"
                value={password} onChange={(e) => setPassword(e.target.value)}/>
              {/* <p className="text-red-400 text-xs italic">Incorrect Username or Password!</p> */}
            </div>

            <div className="flex items-center justify-between">
              {/* Submit Form */}
              <button className="text-white bg-gray-600 font-bold py-2 px-4 rounded" type="submit">
                Sign In
              </button>
              <button className="text-white bg-gray-600 font-bold py-2 px-4 rounded" type="button">
                Forgot Password?
              </button>
            </div>
          </form>
          
          <Divider/>
          <Link to="/signup">
            <button className="w-full text-white bg-gray-600 font-bold py-2 px-4 rounded text-center">
              Create an Account
            </button>
          </Link>
        </div>
      </div>
    </div>
  )
}