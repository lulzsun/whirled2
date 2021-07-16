import Joi from "joi";

export const UsernameSchema = Joi.string().label('Username').alphanum().min(3).max(30).required();
export const PasswordSchema = Joi.string().label('Password').min(6).required();
export const EmailSchema = Joi.string().label('Email').email({minDomainSegments: 2, tlds: {allow: ['com', 'net']}});

export const RegisterSchema = Joi.object({
  username: UsernameSchema,
  email: EmailSchema,
  password: PasswordSchema,
  confirmPassword: Joi.string()
    .label('Password').required().valid(Joi.ref('password')).messages({
      'any.only': `Passwords do not match!`,
    }),
  // access_token: [
  //   Joi.string(),
  //   Joi.number()
  // ],
  // birth_year: Joi.number()
  //     .integer()
  //     .min(1900)
  //     .max(2013),
});

export function validateSchema(schema, value) {
  const result = schema.validate(value);
  if(result.error)
    return ({error: result.error.message});
  else {
    return true;
  }
}