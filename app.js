const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const dotenv = require('dotenv')
dotenv.config()
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});


app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// mongodb connect gareko yha
mongoose.connect(`${process.env.dburl}`, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
  .catch(err => console.log('MongoDB Error:', err));


const participantSchema = new mongoose.Schema({
  partyName: { type: String, required: true, unique: true },
  participantName: { type: String, required: true },
  partySymbol: { type: String },
  description: { type: String },
  voteCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const voterSchema = new mongoose.Schema({
  voterId: { type: String, required: true, unique: true },
  voterName: { type: String, required: true },
  citizenshipNumber: { type: String, required: true, unique: true },
  hasVoted: { type: Boolean, default: false },
  votedFor: { type: mongoose.Schema.Types.ObjectId, ref: 'Participant' },
  votedAt: { type: Date }
});

const Participant = mongoose.model('Participant', participantSchema);
const Voter = mongoose.model('Voter', voterSchema);


io.on('connection', (socket) => {
  console.log('Client connected');
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});


const broadcastResults = async () => {
  try {
    const participants = await Participant.find().sort({ voteCount: -1 });
    const totalVotes = await Voter.countDocuments({ hasVoted: true });
    io.emit('voteUpdate', { participants, totalVotes });
  } catch (error) {
    console.error('Broadcast error:', error);
  }
};


app.post('/api/participants', async (req, res) => {
  try {
    const { partyName, participantName, partySymbol, description } = req.body;
    
    if (!partyName || !participantName) {
      return res.status(400).json({ error: 'Party name and participant name are required' });
    }

    const participant = new Participant({
      partyName,
      participantName,
      partySymbol,
      description
    });

    await participant.save();
    await broadcastResults();
    res.status(201).json({ message: 'Participant registered successfully', participant });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Party name already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});


app.get('/api/participants', async (req, res) => {
  try {
    const participants = await Participant.find().sort({ createdAt: -1 });
    res.json(participants);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.get('/api/participants/:id', async (req, res) => {
  try {
    const participant = await Participant.findById(req.params.id);
    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    res.json(participant);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.put('/api/participants/:id', async (req, res) => {
  try {
    const { partyName, participantName, partySymbol, description } = req.body;
    const participant = await Participant.findByIdAndUpdate(
      req.params.id,
      { partyName, participantName, partySymbol, description },
      { new: true, runValidators: true }
    );

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    await broadcastResults();
    res.json({ message: 'Participant updated successfully', participant });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Party name already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});


app.delete('/api/participants/:id', async (req, res) => {
  try {
    const participant = await Participant.findByIdAndDelete(req.params.id);
    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    await broadcastResults();
    res.json({ message: 'Participant deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post('/api/voters/register', async (req, res) => {
  try {
    const { voterId, voterName, citizenshipNumber } = req.body;
    
    if (!voterId || !voterName || !citizenshipNumber) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const voter = new Voter({
      voterId,
      voterName,
      citizenshipNumber
    });

    await voter.save();
    res.status(201).json({ message: 'Voter registered successfully', voter });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Voter ID or Citizenship number already registered' });
    }
    res.status(500).json({ error: error.message });
  }
});


app.get('/api/voters/check/:voterId', async (req, res) => {
  try {
    const voter = await Voter.findOne({ voterId: req.params.voterId }).populate('votedFor');
    if (!voter) {
      return res.status(404).json({ error: 'Voter not found' });
    }
    res.json(voter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post('/api/vote', async (req, res) => {
  try {
    const { voterId, participantId } = req.body;
    
    if (!voterId || !participantId) {
      return res.status(400).json({ error: 'Voter ID and Participant ID are required' });
    }

    
    const voter = await Voter.findOne({ voterId });
    if (!voter) {
      return res.status(404).json({ error: 'Voter not registered' });
    }

    
    if (voter.hasVoted) {
      return res.status(403).json({ error: 'You have already voted. Each voter can vote only once.' });
    }

    
    const participant = await Participant.findById(participantId);
    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }

   
    voter.hasVoted = true;
    voter.votedFor = participantId;
    voter.votedAt = new Date();
    await voter.save();

    
    participant.voteCount += 1;
    await participant.save();

    
    await broadcastResults();

    res.json({ message: 'Vote cast successfully', voter, participant });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.get('/api/voters', async (req, res) => {
  try {
    const voters = await Voter.find().populate('votedFor').sort({ createdAt: -1 });
    res.json(voters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.get('/api/results', async (req, res) => {
  try {
    const participants = await Participant.find().sort({ voteCount: -1 });
    const totalVotes = await Voter.countDocuments({ hasVoted: true });
    const totalRegisteredVoters = await Voter.countDocuments();
    
    res.json({
      participants,
      totalVotes,
      totalRegisteredVoters,
      turnoutPercentage: totalRegisteredVoters > 0 
        ? ((totalVotes / totalRegisteredVoters) * 100).toFixed(2) 
        : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/participant', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'participant.html'));
});

app.get('/voter', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'voter.html'));
});

app.get('/live-results', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'live-results.html'));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to access the voting system`);
});