const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./middleware/auth.middleware')
const { Admin, Participant, PartyMember, Voter } = require('./model/Usermodel');
const dbConnect = require('./db/connectdb')
dotenv.config();
dbConnect()
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


const createDefaultAdmin = async () => {
  try {
    const adminExists = await Admin.findOne({ username: 'admin' });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await Admin.create({
        username: 'admin',
        password: hashedPassword
      });
      console.log('Default admin created: username=admin, password=admin123');
    }
  } catch (error) {
    console.error('Error creating default admin:', error);
  }
};
createDefaultAdmin();

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


app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isValidPassword = await bcrypt.compare(password, admin.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { id: admin._id, username: admin.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({ token, admin: { username: admin.username, role: admin.role } });    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/change-password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    
    const admin = await Admin.findById(req.admin.id);
    const isValidPassword = await bcrypt.compare(oldPassword, admin.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid old password' });
    }
    
    admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post('/api/participants', authMiddleware, async (req, res) => {
  try {
    const { partyName, partyNameNepali, partySymbol, partyLogo, description } = req.body;
    
    if (!partyName) {
      return res.status(400).json({ error: 'Party name is required' });
    }

    const participant = new Participant({
      partyName,
      partyNameNepali,
      partySymbol,
      partyLogo,
      description
    });

    await participant.save();
    await broadcastResults();
    res.status(201).json({ message: 'Party registered successfully', participant });
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
    const id = req.params.id;
    console.log('Fetching participant with ID:', id);
    console.log('ID type:', typeof id);
    console.log('ID length:', id.length);
    
    // Try to find by ID (handles both string and ObjectId)
    let participant = await Participant.findOne({ _id: id });
    
    // If not found, try converting to ObjectId explicitly
    if (!participant && mongoose.Types.ObjectId.isValid(id)) {
      console.log('Trying with ObjectId conversion...');
      participant = await Participant.findOne({ _id: new mongoose.Types.ObjectId(id) });
    }
    
    // If still not found, try finding by string match
    if (!participant) {
      console.log('Trying direct string match...');
      participant = await Participant.findOne({ _id: id.toString() });
    }
    
    if (!participant) {
      console.log('Participant not found for ID:', id);
      
      // Debug: Show all participants
      const allParticipants = await Participant.find({}, '_id partyName').limit(5);
      console.log('Available participants:', allParticipants.map(p => ({ id: p._id.toString(), name: p.partyName })));
      
      return res.status(404).json({ error: 'Participant not found' });
    }
    
    console.log('Found participant:', participant.partyName);
    res.json(participant);
  } catch (error) {
    console.error('Error fetching participant:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/participants/:id', authMiddleware, async (req, res) => {
  try {
    const { partyName, partyNameNepali, partySymbol, partyLogo, description } = req.body;
    const participant = await Participant.findByIdAndUpdate(
      req.params.id,
      { partyName, partyNameNepali, partySymbol, partyLogo, description },
      { new: true, runValidators: true }
    );

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    await broadcastResults();
    res.json({ message: 'Party updated successfully', participant });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Party name already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/participants/:id', authMiddleware, async (req, res) => {
  try {
    const participant = await Participant.findByIdAndDelete(req.params.id);
    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    
    await PartyMember.deleteMany({ participantId: req.params.id });
    
    await broadcastResults();
    res.json({ message: 'Party deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post('/api/party-members', authMiddleware, async (req, res) => {
  try {
    const { participantId, memberName, memberNameNepali, position, positionNepali, wardNumber, type } = req.body;
    
    const member = new PartyMember({
      participantId,
      memberName,
      memberNameNepali,
      position,
      positionNepali,
      wardNumber,
      type
    });

    await member.save();
    res.status(201).json({ message: 'Member added successfully', member });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/party-members/:participantId', async (req, res) => {
  try {
    const members = await PartyMember.find({ participantId: req.params.participantId })
      .sort({ type: 1, position: 1 });
    res.json(members);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/party-members/:id', authMiddleware, async (req, res) => {
  try {
    const member = await PartyMember.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    res.json({ message: 'Member updated successfully', member });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/party-members/:id', authMiddleware, async (req, res) => {
  try {
    const member = await PartyMember.findByIdAndDelete(req.params.id);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }
    res.json({ message: 'Member deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/voters/register', authMiddleware, async (req, res) => {
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
    const voter = await Voter.findOne({ voterId: req.params.voterId })
      .populate('votedForParty')  // CHANGED from votedFor
      .populate('votedForCandidates.memberId');  // ADDED
    if (!voter) {
      return res.status(404).json({ error: 'Voter not found' });
    }
    res.json(voter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/voters', authMiddleware, async (req, res) => {
  try {
    const voters = await Voter.find()
      .populate('votedForParty')  // CHANGED from votedFor
      .sort({ createdAt: -1 });
    res.json(voters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/vote', async (req, res) => {
  try {
    const { voterId, partyId, selectedCandidates } = req.body;
    
    console.log('Vote request:', { voterId, partyId, selectedCandidates });
    
    if (!voterId || !partyId) {
      return res.status(400).json({ error: 'Voter ID and Party are required' });
    }

    // Check voter exists
    const voter = await Voter.findOne({ voterId });
    if (!voter) {
      return res.status(404).json({ error: 'Voter not registered' });
    }

    // Check if already voted
    if (voter.hasVoted) {
      return res.status(403).json({ error: 'You have already voted' });
    }

    // Check party exists
    let participant = await Participant.findOne({ _id: partyId });
    
    if (!participant && mongoose.Types.ObjectId.isValid(partyId)) {
      participant = await Participant.findOne({ _id: new mongoose.Types.ObjectId(partyId) });
    }
    
    if (!participant) {
      console.log('Participant not found:', partyId);
      return res.status(404).json({ error: 'Party not found' });
    }

    // Update voter record
    voter.hasVoted = true;
    voter.votedForParty = partyId;
    voter.votedAt = new Date();
    
    // Process direct candidate votes
    if (selectedCandidates && Array.isArray(selectedCandidates)) {
      voter.votedForCandidates = [];
      
      for (const candidateId of selectedCandidates) {
        const member = await PartyMember.findById(candidateId);
        if (member) {
          // Increment candidate's vote count
          member.voteCount += 1;
          await member.save();
          
          // Add to voter's record
          voter.votedForCandidates.push({
            memberId: member._id,
            position: member.position,
            memberName: member.memberName
          });
          
          console.log(`✅ Vote recorded for ${member.position}: ${member.memberName}`);
        }
      }
    }
    
    await voter.save();

    // Increment party's proportional vote count
    participant.voteCount += 1;
    await participant.save();

    await broadcastResults();

    res.json({ 
      message: 'Vote cast successfully',
      votedFor: participant.partyName,
      candidatesVoted: voter.votedForCandidates.length
    });
  } catch (error) {
    console.error('Vote error:', error);
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

app.get('/admin-login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.get('/admin-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

app.get('/voter', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'voter.html'));
});

app.get('/party-details', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'party-details.html'));
});

app.get('/live-results', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'live-results.html'));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to access the voting system`);
});