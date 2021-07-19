import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
	username: 			{ type: String, required: true },
	email: 					{ type: String, required: true },
	emailVerified: 	{ type: Boolean, required: true },
	password: 			{ type: String, required: true },
	birthDate:			{ type: Date, required: true },

	inventory:			{ type: mongoose.Types.ObjectId, default: null },
	shop:						{ type: mongoose.Types.ObjectId, default: null },
	rooms:					{ type: Array, default: [] },
});

export default userSchema;