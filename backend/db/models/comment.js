import mongoose from '../connection.js';

export const PARENT_TYPES = ['Comment', 'Thread', 'Profile', 'Avatar', 'Furniture', 'Backdrop', 'Pet', 'Music'];

const commentSchema = new mongoose.Schema({
	userId: 			  { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  parentId:       { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Profile' },
  // https://mongoosejs.com/docs/populate.html#dynamic-ref
  // is this a comment to an avatar in the shop? to user's profile? to a comment chain?
  parentType:     { type: String, required: true, enum: PARENT_TYPES },

  content:        { type: String, required: true },
  likes:          { type: Number, default: 0 },
  dislikes:       { type: Number, default: 0 },

  hasReplies:     { type: Boolean, default: false },
  replies:        [{type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }],
});

export default commentSchema;