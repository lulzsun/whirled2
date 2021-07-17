import React, { useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Divider } from '../../common';
import { 
  RegisterSchema, UsernameSchema, EmailSchema, PasswordSchema,
  validateSchema 
} from '../../../schemas/index.js';
import Button from 'src/components/tail-kit/elements/buttons/Button';
import Select from 'src/components/tail-kit/form/select/Select';
import InputText from 'src/components/tail-kit/form/inputtext/InputText';

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

  const [registerDisabled, setRegisterDisabled] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setRegisterDisabled(true);

    const birthDate = new Date(birthYear, birthMonth-1, birthDay).toISOString().slice(0, 10);
    const register = { 
      username, email, 
      password, confirmPassword, 
      birthDate
    };

    if(validateSchema(RegisterSchema, register).error) {
      alert(validateSchema(RegisterSchema, register).error);
      setRegisterDisabled(false);
    }
    else {
      axios.post(`${process.env.REACT_APP_API_URL}/auth/signup`, JSON.stringify(register), {
        headers: {
          'Content-Type': 'application/json'
        }
      }).then(response => {
        // TODO show a cool modal instead of doing this
        alert(response.data.message);
        setRegisterDisabled(false);
      }).catch(error => {
        if( error.response ) {
          // TODO show a cool modal instead of doing this
          alert(error.response.data.message); 
        }
        setRegisterDisabled(false);
      });
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
            <div className="mb-6">
              <label>Username</label>
              <InputText 
                className="rounded w-full py-2 px-3 text-black"
                required type="text" placeholder="Username"
                value={username} error={usernameErr}
                onChange={(e) => {
                  let schema = UsernameSchema;
                  let setError = setUsernameErr;
                  setUsername(e.target.value);
                  setError('');
                  if(validateSchema(schema, e.target.value).error) {
                    setError(validateSchema(schema, e.target.value).error);
                  }
                }}/>
            </div>

            {/* Email */}
            <div className="mb-6">
              <label>Email</label>
              <InputText 
                className="rounded w-full py-2 px-3 text-black"
                required type="text" placeholder="email@address.com"
                value={email} error={emailErr}
                onChange={(e) => {
                  let schema = EmailSchema;
                  let setError = setEmailErr;
                  setEmail(e.target.value);
                  setError('');
                  if(validateSchema(schema, e.target.value).error) {
                    setError(validateSchema(schema, e.target.value).error);
                  }
                }}/>
            </div>

            {/* Password */}
            <div className="mb-6">
              <label>Password</label>
              <InputText 
                className="rounded w-full py-2 px-3 text-black"
                required type="password" placeholder="******************"
                value={password} error={passwordErr}
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
            </div>

            {/* Confirm Password */}
            <div className="mb-6">
              <label>Confirm Password</label>
              <InputText 
                className="rounded w-full py-2 px-3 text-black"
                required type="password" placeholder="******************"
                value={confirmPassword} error={confirmPasswordErr}
                onChange={(e) => {
                  let setError = setConfirmPasswordErr;
                  setConfirmPassword(e.target.value);
                  setError('');
                  if(e.target.value !== password) {
                    setError('Passwords must match!');
                  }
                }}/>
            </div>

            {/* Birthdate */} 
            <label className="text-gray-700 dark:text-gray-200">Birth date</label>
            <div className="flex justify-between flex-row space-x-4 mb-6">
              <Select placeholder="Month" required id="month" options={range(1, 12, 1)} 
                value={birthMonth} onChange={(e) => {
                setBirthMonth(e.target.value);
              }}/>
              <Select placeholder="Day" required id="day" options={range(1, 31, 1)} 
                value={birthDay} onChange={(e) => {
                setBirthDay(e.target.value);
              }}/>
              <Select placeholder="Year" required id="year" options={birthYearList} 
                value={birthYear} onChange={(e) => {
                setBirthYear(e.target.value);
              }}/>
            </div>

            <div className="flex items-center justify-between">
              {/* Submit Form */}
              <div className="w-full"><Button color='purple' label='Register' disabled={registerDisabled} submit></Button></div>
            </div>
          </form>
          
          <Divider/>
          <Link to="/login">
            <div className="w-full"><Button color='purple' label='Login'></Button></div>
          </Link>
        </div>
      </div>
    </div>
  )
}