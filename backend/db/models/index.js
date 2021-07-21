import mongoose from '../connection.js';
import userSchema from './user.js';
import profileSchema from './profile.js';
import inventorySchema from './inventory.js';
import commentSchema from './comment.js';

export const User = mongoose.model('User', userSchema);
export const Profile = mongoose.model('Profile', profileSchema);
export const Inventory = mongoose.model('Inventory', inventorySchema);
export const Comment = mongoose.model('Comment', commentSchema);

export const getModelByString = (schema) => {
  return mongoose.model(schema);
}