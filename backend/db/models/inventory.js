import mongoose from '../connection.js';

const inventorySchema = new mongoose.Schema({
	avatars:			{ type: Array },
	furniture:		{ type: Array },
	backdrops:		{ type: Array },
	pets:					{ type: Array },
	music:				{ type: Array },
}, { timestamps: true });

export default inventorySchema;