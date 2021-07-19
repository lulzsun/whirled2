import React from 'react';
import SelectOptions from './SelectOptions';
const Select = (props) => {
	return (
		<select value={props.value} onChange={props.onChange} required={props.required} name={props.id}
			className="block text-gray-700 py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500">
			<option value="">{props.placeholder}</option>
			<SelectOptions options={props.options}></SelectOptions>
		</select>
	);
};
export default Select;
//# sourceMappingURL=Select.jsx.map