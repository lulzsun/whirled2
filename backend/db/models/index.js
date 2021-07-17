import mongoose from '../connection.js';
import userSchema from './user.js';
import profileSchema from './profile.js';
import inventorySchema from './inventory.js';

export const User = mongoose.model('User', userSchema);
export const Profile = mongoose.model('Profile', profileSchema);
export const Inventory = mongoose.model('Inventory', inventorySchema);