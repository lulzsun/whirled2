import mongoose from 'mongoose';

//Start connection to db
mongoose.connect(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true });
const db = mongoose.connection;
db.on('error', (error) => console.error(error))
db.once('open', () => console.log('Connected to ' + process.env.DATABASE_URL))

export default mongoose;