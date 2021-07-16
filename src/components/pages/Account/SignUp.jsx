import React, {useState} from 'react';
import { Link } from 'react-router-dom';
import { Divider } from '../../common';
import { 
  RegisterSchema, UsernameSchema, EmailSchema, PasswordSchema,
  validateSchema 
} from '../../../schemas/index.js';

export default function SignUp () {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [usernameErr, setUsernameErr] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [passwordErr, setPasswordErr] = useState('');
  const [confirmPasswordErr, setConfirmPasswordErr] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const register = { username, email, password, confirmPassword };
    console.log(register);
    if(validateSchema(RegisterSchema, register).error) {
      setConfirmPasswordErr(validateSchema(RegisterSchema, register).error);
    }
    else {
      setConfirmPasswordErr('');
      console.log("POST " + process.env.REACT_APP_API_URL);
    }
  }

  return (
    <div class="flex h-screen overflow-y-auto">
      <div class="m-auto">
        <div class="max-w-md">
          <form onSubmit={handleSubmit}>

            {/* Username */}
            <div class="mb-2">
              <label>Username</label>
              <input 
                class="rounded w-full py-2 px-3 text-black"
                required type="text" placeholder="Username"
                value={username}
                onChange={(e) => {
                  let schema = UsernameSchema;
                  let setError = setUsernameErr;
                  setUsername(e.target.value);
                  setError('');
                  if(validateSchema(schema, e.target.value).error) {
                    setError(validateSchema(schema, e.target.value).error);
                  }
                }}/>
                <p class="text-red-400 text-xs italic">{usernameErr}</p>
            </div>

            {/* Email */}
            <div class="mb-2">
              <label>Email</label>
              <input 
                class="rounded w-full py-2 px-3 text-black"
                required type="text" placeholder="you@email.com"
                value={email}
                onChange={(e) => {
                  let schema = EmailSchema;
                  let setError = setEmailErr;
                  setEmail(e.target.value);
                  setError('');
                  if(validateSchema(schema, e.target.value).error) {
                    setError(validateSchema(schema, e.target.value).error);
                  }
                }}/>
                <p class="text-red-400 text-xs italic">{emailErr}</p>
            </div>

            {/* Password */}
            <div class="mb-2">
              <label>Password</label>
              <input 
                class="rounded w-full py-2 px-3 text-black"
                required type="password" placeholder="******************"
                value={password}
                onChange={(e) => {
                  let schema = PasswordSchema;
                  let setError = setPasswordErr;
                  setPassword(e.target.value);
                  setError('');
                  if(validateSchema(schema, e.target.value).error) {
                    setError(validateSchema(schema, e.target.value).error);
                  }
                }}/>
              <p class="text-red-400 text-xs italic">{passwordErr}</p>
            </div>

            {/* Confirm Password */}
            <div class="mb-6">
              <label>Confirm Password</label>
              <input 
                class="rounded w-full py-2 px-3 text-black"
                required type="password" placeholder="******************"
                value={confirmPassword} onChange={(e) => {
                  setConfirmPassword(e.target.value);
                }}/>
              <p class="text-red-400 text-xs italic">{confirmPasswordErr}</p>
            </div>

            <div class="flex items-center justify-between">
              {/* Submit Form */}
              <button class="w-full text-white bg-gray-600 font-bold py-2 px-4 rounded text-center" type="submit">
                Register
              </button>
            </div>
          </form>
          
          <Divider/>
          <Link to="/login">
            <button class="w-full text-white bg-gray-600 font-bold py-2 px-4 rounded text-center">
              Login
            </button>
          </Link>
        </div>
      </div>
    </div>
  )
}