import mongoose from 'mongoose';

const avatarSchema = new mongoose.Schema({
	creator: 			  { type: mongoose.Types.ObjectId, required: true },
	name: 					{ type: String, required: true },
  lastUpdate: 	  { type: Date, required: true },

  rating:         { type: Number },
	owners:					{ type: Array, default: [] },
  comments:				{ type: Array, default: [] },
});

export default avatarSchema;