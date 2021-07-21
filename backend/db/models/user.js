import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
	username: 			{ type: String, required: true },
	displayName: 		{ type: String, required: true },
	email: 					{ type: String, required: true },
	emailVerified: 	{ type: Boolean, required: true },
	password: 			{ type: String, required: true },
	birthDate:			{ type: Date, required: true },

	inventory:			{ type: mongoose.Schema.Types.ObjectId, default: null },
	shop:						{ type: mongoose.Schema.Types.ObjectId, default: null },
	rooms:					{ type: Array, default: [] },
}, { timestamps: true });

export default userSchema;