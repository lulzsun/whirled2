import mongoose from 'mongoose';

const profileSchema = new mongoose.Schema({
	username: 			{ type: String, required: true },
	level:					{ type: Number, default: 1 },
	coins:					{ type: Number, default: 1000 },
	bars:						{ type: Number, default: 0 },
	bling:					{ type: Number, default: 0 },

	displayName: 		{ type: String, required: true },
	status:					{ type: String, default: 'Hello Whirled!' },
	lastOnline:			{ type: Date, default: Date.now() },
	profilePicture:	{ type: String, default: '' },
	banner:					{ type: String, default: '' },
	information:		{ type: Object, 
		default: {
			activities: '',
			interests: '',
			favoriteGames: '',
			favoriteMusic: '',
			favoriteMovies: '',
			favoriteShows: '',
			favoriteBooks: '',
			aboutMe: `I don't like sharing anything about myself!`,
		} 
	},

	friends:				[{type: mongoose.Schema.Types.ObjectId, ref: 'Profile'}],
	comments:				[{type: mongoose.Schema.Types.ObjectId, ref: 'Comment'}],
}, { timestamps: true });

export default profileSchema;