import mongoose from '../connection.js';

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
	comments:				[{type: mongoose.Schema.Types.ObjectId, ref: 'commentSchema'}],
});

const commentSchema = new mongoose.Schema({
	userId: 			  { type: mongoose.Types.ObjectId, required: true },
  parentId:       { type: mongoose.Types.ObjectId, required: true, ref: Profile },
  // https://mongoosejs.com/docs/populate.html#dynamic-ref
  // is this a comment to an avatar in the shop? to user's profile? to a comment chain?
  parentType:     { type: String, required: true, enum: PARENT_TYPES },

  content:        { type: String, required: true },
  likes:          { type: Number, default: 0 },
  dislikes:       { type: Number, default: 0 },

  hasReplies:     { type: Boolean, default: false },
  replies:        [{type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }],
});

export const Comment = mongoose.model('Comment', commentSchema);
export const Profile = mongoose.model('Profile', profileSchema);
export const User = mongoose.model('User', userSchema);

export const PARENT_TYPES = ['Comment', 'Thread', 'Profile', 'Avatar', 'Furniture', 'Backdrop', 'Pet', 'Music'];