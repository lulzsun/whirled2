import mongoose from 'mongoose';

const profileSchema = new mongoose.Schema({
	username: 			{ type: String, required: true },
	displayName: 		{ type: String, required: true },
	lastOnline:			{ type: Date, default: Date.now() },
	profilePicture:	{ type: String, default: '' },
	banner:					{ type: String, default: '' },
	level:					{ type: Number, default: 1 },

	status:					{ type: String, default: 'Hello Whirled!' },
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

	friends:				[{type: mongoose.Schema.Types.ObjectId, ref: 'User'}],
	comments:				[{type: mongoose.Schema.Types.ObjectId, ref: 'Comment'}],
});

export default profileSchema;