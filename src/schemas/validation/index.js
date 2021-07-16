import moment from "moment";

export const ageRestrict13 = (value, helpers) => {
	var age = moment().diff(value, 'years');
	if (age < 13) return helpers.error('age.restrict.13');
	return value;
};
  
export const ageRestrict18 = (value, helpers) => {
	var age = moment().diff(value, 'years');
	if (age < 18) return helpers.error('age.restrict.18');
	return value;
};