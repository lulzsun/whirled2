import mongoose from 'mongoose';

const profileSchema = new mongoose.Schema({
	username: 			{ type: String, required: true },
	displayName: 		{ type: String, required: true },
	lastOnline:			{ type: Date, default: Date.now(), required: true },
	profilePicture:	{ type: String, default: '' },
	level:					{ type: Number },

	status:					{ type: String, default: 'Hello Whirled!' },
	aboutMe:				{ type: Object, 
		default: {
			Activites : '',
			Interests : '',
			FavoriteGames : '',
			FavoriteMusic : '',
			FavoriteMovies : '',
			FavoriteShows : '',
			FavoriteBooks : '',
			AboutMe : '',
		} 
	},

	friends:				{ type: Array, default: [] },
});

export default profileSchema;