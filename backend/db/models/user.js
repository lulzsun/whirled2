import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
	username: 			{ type: String, required: true },
	email: 					{ type: String, required: true },
	emailVerified: 	{ type: Boolean, required: true },
	password: 			{ type: String, required: true },
	birthDate:			{ type: Date, required: true },

	profile:				{ type: mongoose.Types.ObjectId },
	inventory:			{ type: mongoose.Types.ObjectId },
	shop:						{ type: mongoose.Types.ObjectId },
	rooms:					{ type: Array },
});

export default userSchema;