import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Divider, Dropdown } from '../../common';
import { 
  RegisterSchema, UsernameSchema, EmailSchema, PasswordSchema,
  validateSchema 
} from '../../../schemas/index.js';

export default function SignUp () {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthYear, setBirthYear] = useState('');

  const [usernameErr, setUsernameErr] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [passwordErr, setPasswordErr] = useState('');
  const [confirmPasswordErr, setConfirmPasswordErr] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const register = { 
      username, email, 
      password, confirmPassword, 
      birthDate: `${birthYear}-${birthMonth}-${birthDay}`
    };
    console.log(register);
    if(validateSchema(RegisterSchema, register).error) {
      alert(validateSchema(RegisterSchema, register).error);
    }
    else {
      console.log("POST " + process.env.REACT_APP_API_URL);
    }
  }

  const currentYear = (new Date()).getFullYear();
  const range = (start, stop, step) => Array.from({ length: (stop - start) / step + 1}, (_, i) => start + (i * step));
  const birthYearList = range(currentYear, currentYear - 100, -1);

  return (
    <div className="flex h-screen overflow-y-auto">
      <div className="m-auto">
        <div className="max-w-sm">
          <form onSubmit={handleSubmit}>

            {/* Username */}
            <div className="mb-2">
              <label>Username</label>
              <input 
                className="rounded w-full py-2 px-3 text-black"
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
                <p className="text-red-400 text-xs italic">{usernameErr}</p>
            </div>

            {/* Email */}
            <div className="mb-2">
              <label>Email</label>
              <input 
                className="rounded w-full py-2 px-3 text-black"
                required type="text" placeholder="email@address.com"
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
                <p className="text-red-400 text-xs italic">{emailErr}</p>
            </div>

            {/* Password */}
            <div className="mb-2">
              <label>Password</label>
              <input 
                className="rounded w-full py-2 px-3 text-black"
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
                  if(e.target.value !== confirmPassword) {
                    setConfirmPasswordErr('Passwords must match!');
                  } else setConfirmPasswordErr('');
                }}/>
              <p className="text-red-400 text-xs italic">{passwordErr}</p>
            </div>

            {/* Confirm Password */}
            <div className="mb-2">
              <label>Confirm Password</label>
              <input 
                className="rounded w-full py-2 px-3 text-black"
                required type="password" placeholder="******************"
                value={confirmPassword} onChange={(e) => {
                  let setError = setConfirmPasswordErr;
                  setConfirmPassword(e.target.value);
                  setError('');
                  if(e.target.value !== password) {
                    setError('Passwords must match!');
                  }
                }}/>
              <p className="text-red-400 text-xs italic">{confirmPasswordErr}</p>
            </div>

            {/* Birthdate */} 
            <label>Birth date</label>
            <div className="flex flex-row space-x-4 mb-6">
              <Dropdown placeholder="Month" required id="month" items={range(1, 12, 1)} 
                value={birthMonth} onChange={(e) => {
                setBirthMonth(e.target.value);
              }}/>
              <Dropdown placeholder="Day" required id="day" items={range(1, 31, 1)} 
                value={birthDay} onChange={(e) => {
                setBirthDay(e.target.value);
              }}/>
              <Dropdown placeholder="Year" required id="year" items={birthYearList} 
                value={birthYear} onChange={(e) => {
                setBirthYear(e.target.value);
              }}/>
            </div>

            <div className="flex items-center justify-between">
              {/* Submit Form */}
              <button className="w-full text-white bg-gray-600 font-bold py-2 px-4 rounded text-center" type="submit">
                Register
              </button>
            </div>
          </form>
          
          <Divider/>
          <Link to="/login">
            <button className="w-full text-white bg-gray-600 font-bold py-2 px-4 rounded text-center">
              Login
            </button>
          </Link>
        </div>
      </div>
    </div>
  )
}