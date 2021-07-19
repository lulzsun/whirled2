import Joi from "joi";
import { ageRestrict13 } from "./validation/index.js";

export const usernameBlackList = [
	'me', 'stuff', 'rooms', 'groups', 'games', 'shop', 
	'profile', 'account', 'settings', 'login', 'logout', 
	'signup', 'help', 'about', 'privacy'
];

export const UsernameSchema = Joi.string().label('Username').alphanum().invalid(...usernameBlackList).min(3).max(30).required();
export const PasswordSchema = Joi.string().label('Password').min(6).required();
export const EmailSchema = Joi.string().label('Email').email({minDomainSegments: 2, tlds: {allow: ['com', 'net']}});
export const BirthDateSchema = Joi.date().custom(ageRestrict13).required();

export const RegisterSchema = Joi.object({
	username: UsernameSchema,
	email: EmailSchema,
	password: PasswordSchema,
	confirmPassword: Joi.string().label('Password').required().valid(Joi.ref('password')),
	birthDate: BirthDateSchema,
	// access_token: [
	//   Joi.string(),
	//   Joi.number()
	// ],
});

export const LoginSchema = Joi.object({
	username: Joi.string().label('Username').required(),
	password: Joi.string().label('Password').required()
});

export function validateSchema(schema, value) {
	const result = schema.validate(value);
	if(result.error)
		return ({error: result.error.message, details: result.error.details});
	else {
		return true;
	}
}