import mongoose from 'mongoose';

const profileSchema = new mongoose.Schema({
	username: 			{ type: String, required: true },
	displayName: 		{ type: String, required: true },
	lastOnline:			{ type: Date, required: true },

	status:					{ type: String },
	aboutMe:				{ type: String },
	feed:						{	type: Array },
});

export default profileSchema;