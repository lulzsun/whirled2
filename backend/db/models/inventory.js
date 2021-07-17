import mongoose from 'mongoose';

const inventorySchema = new mongoose.Schema({
	avatars:			{ type: Array },
	furniture:		{ type: Array },
	backdrops:		{ type: Array },
	pets:					{ type: Array },
	music:				{ type: Array },
});

export default inventorySchema;