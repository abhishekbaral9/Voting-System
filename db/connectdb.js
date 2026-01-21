const mongoose = require('mongoose');

const dbConnect = () => {
  mongoose.connect(`${process.env.dburl}`, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }).then(() => console.log('MongoDB Connected'))
  .catch(err => console.log('MongoDB Error:', err));
}
module.exports = dbConnect